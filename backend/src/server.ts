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
  isHost?: boolean;
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
  cors: { origin: "*" } // tighten for prod
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const rooms = new Map<string, Room>();

function makeRoomId(): string {
  const tries = 6;
  for (let i = 0; i < tries; i++) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!rooms.has(id)) return id;
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createRoom(hostPlayer: Player): Room {
  const id = makeRoomId();
  const room: Room = {
    id,
    hostId: hostPlayer.id,
    players: new Map([[hostPlayer.id, hostPlayer]]),
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

  // host left before start -> close
  if (!room.started && room.hostId === playerId) {
    if (room.timeout) clearTimeout(room.timeout);
    rooms.delete(roomId);
    io.to(`room:${roomId}`).emit("room-closed", { reason: "host_left" });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
    return;
  }

  // if empty -> delete
  if (room.players.size === 0) {
    if (room.timeout) clearTimeout(room.timeout);
    rooms.delete(roomId);
    return;
  }

  // pick new host if needed
  if (room.hostId === playerId && room.players.size > 0) {
    const newHostId = Array.from(room.players.keys())[0];
    room.hostId = newHostId;
    io.to(`room:${roomId}`).emit("host-changed", { newHostId });
  }
}

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

/**
 * SOCKET.IO
 */
io.on("connection", (socket: Socket) => {
  console.log("socket connected:", socket.id);

  // create room
  socket.on("create-room", (payload: { username?: string }, cb?: Function) => {
    try {
      const playerId = uuidv4();
      const player: Player = {
        id: playerId,
        socketId: socket.id,
        username: payload?.username || "anon",
        isHost: true,
      };

      const room = createRoom(player);
      socket.join(`room:${room.id}`);
      (socket as any).data = { roomId: room.id, playerId };

      // emit room-state for convenience
      const players = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        isHost: p.isHost,
      }));

      socket.emit("room-created", { roomId: room.id, playerId, players });
      io.to(`room:${room.id}`).emit("room-state", { roomId: room.id, players, started: room.started });

      if (cb) cb({ ok: true, roomId: room.id, playerId, players });
      console.log(`room ${room.id} created by ${player.username}`);
    } catch (err) {
      console.error(err);
      if (cb) cb({ ok: false });
    }
  });

  // join room
  socket.on("join-room", (payload: { roomId: string; username?: string }, cb?: Function) => {
    const { roomId, username } = payload;
    const room = rooms.get(roomId);
    if (!room) {
      if (cb) cb({ ok: false, reason: "not_found" });
      socket.emit("room-join-failed", { reason: "not_found" });
      return;
    }
    if (room.started) {
      if (cb) cb({ ok: false, reason: "already_started" });
      socket.emit("room-join-failed", { reason: "already_started" });
      return;
    }

    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      socketId: socket.id,
      username: username || "anon",
      isHost: false,
    };

    room.players.set(playerId, player);
    socket.join(`room:${roomId}`);
    (socket as any).data = { roomId, playerId };

    const players = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      username: p.username,
      x: p.x,
      y: p.y,
      isHost: p.isHost,
    }));

    // notify joiner
    socket.emit("room-joined", { roomId, playerId, players });

    // notify everyone of updated state
    io.to(`room:${roomId}`).emit("room-state", { roomId, players, started: room.started });

    // broadcast new player
    socket.to(`room:${roomId}`).emit("player-joined", { player: { id: playerId, username: player.username } });

    if (cb) cb({ ok: true, playerId, players });
    console.log(`${player.username} joined room ${roomId}`);
  });

  // start game (host only)
  socket.on("start-game", (payload: { roomId: string; playerId: string }, cb?: Function) => {
    const { roomId, playerId } = payload;
    const room = rooms.get(roomId);
    if (!room) {
      if (cb) cb({ ok: false, reason: "not_found" });
      return;
    }
    if (room.hostId !== playerId) {
      if (cb) cb({ ok: false, reason: "not_host" });
      return;
    }
    room.started = true;
    if (room.timeout) {
      clearTimeout(room.timeout);
      room.timeout = undefined;
    }
    io.to(`room:${roomId}`).emit("game-started", { roomId });
    if (cb) cb({ ok: true });
    console.log(`room ${roomId} started by host`);
  });

  // movement
  socket.on("player-move", (payload: { roomId: string; playerId?: string; x: number; y: number; anim?: string }) => {
    const { roomId, playerId, x, y, anim } = payload;
    const room = rooms.get(roomId);
    if (!room) return;

    // trust server-side mapping if available
    let pId = playerId;
    const sData = (socket as any).data;
    if (!pId && sData?.playerId) pId = sData.playerId;

    if (!pId) return;

    const pl = room.players.get(pId);
    if (!pl) return;

    pl.x = x;
    pl.y = y;
    pl.anim = anim;

    // broadcast movement to other clients
    socket.to(`room:${roomId}`).emit("player-moved", { playerId: pId, x, y, anim });
  });

  // explicit leave
  socket.on("player-left", (payload: { roomId: string; playerId: string }) => {
    const { roomId, playerId } = payload;
    removePlayerFromRoom(roomId, playerId);
    socket.to(`room:${roomId}`).emit("player-left", { playerId });
    socket.leave(`room:${roomId}`);
  });

  socket.on("disconnect", (reason) => {
    const sData = (socket as any).data;
    if (sData?.roomId && sData?.playerId) {
      const { roomId, playerId } = sData;
      removePlayerFromRoom(roomId, playerId);
      socket.to(`room:${roomId}`).emit("player-left", { playerId });
    }
    console.log("socket disconnected:", socket.id, reason);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Backend (socket) running on :${PORT}`);
});
