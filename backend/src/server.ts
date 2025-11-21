// backend/src/server.ts
import express from "express";
import http from "http";
import { Server as IOServer, Socket } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

type Player = {
  id: string;
  socketId: string;
  username: string;
  x?: number;
  y?: number;
  anim?: string;
  isHost: boolean;
};

type Room = {
  id: string;
  hostId: string;
  players: Map<string, Player>;
  createdAt: number;
  started: boolean;
  timeout?: NodeJS.Timeout;
};

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: "*" },
});

// in-memory store
const rooms = new Map<string, Room>();

type DisconnectTimer = NodeJS.Timeout;
const disconnectTimers = new Map<string, Map<string, DisconnectTimer>>();

function makeRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createRoom(host: Player): Room {
  const id = makeRoomId();
  const room: Room = {
    id,
    hostId: host.id,
    players: new Map([[host.id, host]]),
    createdAt: Date.now(),
    started: false,
  };

  room.timeout = setTimeout(() => {
    if (!room.started) {
      rooms.delete(id);
      io.to(`room:${id}`).emit("room-closed", { reason: "host_timeout" });
      io.in(`room:${id}`).socketsLeave(`room:${id}`);
    }
  }, 1000 * 60 * 5);

  rooms.set(id, room);
  return room;
}

function removePlayerFromRoom(roomId: string, playerId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(playerId);

  if (room.players.size === 0) {
    if (room.timeout) clearTimeout(room.timeout);
    rooms.delete(roomId);
    return;
  }

  if (!room.started && room.hostId === playerId) {
    if (room.timeout) clearTimeout(room.timeout);
    rooms.delete(roomId);
    io.to(`room:${roomId}`).emit("room-closed", { reason: "host_left" });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
    return;
  }

  if (room.hostId === playerId) {
    const first = Array.from(room.players.values())[0];
    room.hostId = first.id;
    io.to(`room:${roomId}`).emit("host-changed", { newHostId: first.id });
  }
}

function clearDisconnectTimer(roomId: string, playerId: string) {
  const group = disconnectTimers.get(roomId);
  if (!group) return;
  const t = group.get(playerId);
  if (t) {
    clearTimeout(t);
    group.delete(playerId);
  }
}

// REST: quick room info (optional)
app.get("/room/:id", (req, res) => {
  const id = req.params.id;
  const room = rooms.get(id);
  if (!room) return res.status(404).json({ ok: false });
  const players = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    x: p.x,
    y: p.y,
    anim: p.anim,
    isHost: p.isHost,
  }));
  res.json({ ok: true, room: { id: room.id, started: room.started, players } });
});

io.on("connection", (socket: Socket) => {
  console.log("socket connected:", socket.id);

  // unified create/join with reconnection support (client may pass playerId to reattach)
  socket.on("join-room", (payload, cb) => {
    const { roomId: requestedRoomId, username = "anon", playerId: incomingId } =
      payload || {};

    // join existing room
    if (requestedRoomId) {
      const room = rooms.get(requestedRoomId);
      if (!room) {
        cb?.({ ok: false, reason: "not_found" });
        return socket.emit("room-join-failed", { reason: "not_found" });
      }

      // reconnect existing player if they provided id (allow even if game started)
      if (incomingId && room.players.has(incomingId)) {
        const existing = room.players.get(incomingId)!;
        existing.socketId = socket.id;
        existing.username = username;

        socket.join(`room:${room.id}`);
        (socket as any).data = { roomId: room.id, playerId: incomingId };

        clearDisconnectTimer(room.id, incomingId);

        const players = Array.from(room.players.values()).map((p) => ({
          id: p.id,
          username: p.username,
          x: p.x,
          y: p.y,
          anim: p.anim,
          isHost: p.isHost,
        }));

        socket.emit("room-joined", {
          ok: true,
          roomId: room.id,
          playerId: incomingId,
          players,
          hostId: room.hostId,
        });

        // let others know this player reconnected
        io.to(`room:${room.id}`).emit("player-reconnected", { playerId: incomingId });


        return cb?.({ ok: true, roomId: room.id, playerId: incomingId, players, hostId: room.hostId });
      }

      // Don't allow NEW players to join after game started
      if (room.started) {
        cb?.({ ok: false, reason: "already_started" });
        return socket.emit("room-join-failed", { reason: "already_started" });
      }

      // normal new join
      const newId = uuidv4();
      const newPlayer: Player = {
        id: newId,
        socketId: socket.id,
        username,
        isHost: false,
      };

      room.players.set(newId, newPlayer);
      socket.join(`room:${room.id}`);
      (socket as any).data = { roomId: room.id, playerId: newId };

      const players = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        anim: p.anim,
        isHost: p.isHost,
      }));

      // tell others FIRST (before they join the room namespace)
      console.log(`📢 Broadcasting player-joined to room ${room.id}:`, newPlayer.username);
      socket.to(`room:${room.id}`).emit("player-joined", { player: newPlayer });

      // then send full state to joiner
      socket.emit("room-joined", {
        ok: true,
        roomId: room.id,
        playerId: newId,
        players,
        hostId: room.hostId,
      });

      console.log(`✅ ${newPlayer.username} joined room ${room.id}. Total players: ${room.players.size}`);


      // Include hostId in callback response
      return cb?.({ ok: true, roomId: room.id, playerId: newId, players, hostId: room.hostId });
    }

    // create room
    const newPlayerId = incomingId || uuidv4();
    const host: Player = {
      id: newPlayerId,
      socketId: socket.id,
      username,
      isHost: true,
    };

    const room = createRoom(host);
    socket.join(`room:${room.id}`);
    (socket as any).data = { roomId: room.id, playerId: newPlayerId };

    const players = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      anim: p.anim,
      isHost: p.isHost,
    }));

    socket.emit("room-created", {
      ok: true,
      roomId: room.id,
      playerId: newPlayerId,
      players,
      hostId: room.hostId,
    });

    return cb?.({ ok: true, roomId: room.id, playerId: newPlayerId, players, hostId: room.hostId });
  });


  // start game
socket.on("start-game", ({ roomId, playerId }, cb) => {
  const room = rooms.get(roomId);
  if (!room) return cb?.({ ok: false, reason: "not_found" });

  // only host can start
  if (room.hostId !== playerId) {
    return cb?.({ ok: false, reason: "not_host" });
  }

  room.started = true;

  // notify ALL players that game has started
  io.to(`room:${roomId}`).emit("game-started", { roomId });

  cb?.({ ok: true });
});


  // movement
  socket.on("player-move", ({ roomId, playerId, x, y, anim }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const sData = (socket as any).data;
    if (sData?.playerId) playerId = sData.playerId;

    const p = room.players.get(playerId);
    if (!p) return;

    p.x = x;
    p.y = y;
    p.anim = anim;

    socket.to(`room:${roomId}`).emit("player-moved", { playerId, x, y, anim });
  });

  // explicit leave
  socket.on("player-left", ({ roomId, playerId }) => {
    removePlayerFromRoom(roomId, playerId);
    socket.to(`room:${roomId}`).emit("player-left", { playerId });
    socket.leave(`room:${roomId}`);
  });

  // host ends room
  socket.on("end-room", ({ roomId, playerId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ ok: false, reason: "not_found" });

    if (room.hostId !== playerId) return cb?.({ ok: false, reason: "not_host" });

    const timers = disconnectTimers.get(roomId);
    timers?.forEach((t) => clearTimeout(t));
    disconnectTimers.delete(roomId);

    io.to(`room:${roomId}`).emit("room-ended", { reason: "host_ended" });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);

    rooms.delete(roomId);
    cb?.({ ok: true });
  });

  // soft disconnect -> grace timer
  socket.on("disconnect", (reason) => {
    console.log("socket disconnected:", socket.id, reason);

    const sData = (socket as any).data;
    if (!sData?.roomId || !sData?.playerId) return;

    const { roomId, playerId } = sData;

    let group = disconnectTimers.get(roomId);
    if (!group) {
      group = new Map();
      disconnectTimers.set(roomId, group);
    }

    const timer = setTimeout(() => {
      const room = rooms.get(roomId);
      if (!room) return;

      const p = room.players.get(playerId);
      if (!p) return;

      // if they didn't reconnect (socketId still same old one), remove
      if (p.socketId === socket.id) {
        removePlayerFromRoom(roomId, playerId);
        io.to(`room:${roomId}`).emit("player-left", { playerId });
      }

      group!.delete(playerId);
    }, 1000 * 60 * 2);

    group.set(playerId, timer);
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`Backend running on :${PORT}`);
});
