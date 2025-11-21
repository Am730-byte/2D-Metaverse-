// components/LobbyClient.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "@/app/lib/socket";

type Player = {
  id: string;
  username: string;
  x?: number;
  y?: number;
  anim?: string;
  isHost?: boolean;
  socketId?: string;
};

export default function LobbyClient({
  roomId,
  username,
}: {
  roomId: string;
  username: string;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const joinGuard = useRef(false);

  // localStorage key per room to persist playerId across refresh
  const storageKey = `playerId:${roomId}`;

  useEffect(() => {
    if (joinGuard.current) return;
    joinGuard.current = true;

    const socket = getSocket();

    // clean listeners first (idempotent)
    socket.off("room-joined");
    socket.off("room-created");
    socket.off("player-joined");
    socket.off("player-left");
    socket.off("player-reconnected");
    socket.off("room-ended");
    socket.off("host-changed");

    // fetch possible existing playerId for reconnection
    const savedPlayerId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

    socket.emit("join-room", { roomId, username, playerId: savedPlayerId || undefined }, (res: any) => {
      if (!res || !res.ok) {
        alert("Failed to join room: " + (res?.reason || "unknown"));
        return;
      }

      // store assigned id so refresh re-attaches
      if (res.playerId) {
        try {
          localStorage.setItem(storageKey, res.playerId);
        } catch (e) {}
      }

      setPlayers(res.players || []);
      setHostId(res.hostId || null);
    });

    socket.on("player-joined", ({ player }: { player: Player }) => {
      setPlayers((prev) => {
        if (prev.find((p) => p.id === player.id)) return prev;
        return [...prev, player];
      });
    });

    socket.on("player-left", ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    });

    socket.on("player-reconnected", ({ playerId }: { playerId: string }) => {
      // optional: mark presence — but simplest is to just ensure exists (server keeps state)
      setPlayers((prev) => prev.map(p => (p.id === playerId ? { ...p } : p)));
    });

    socket.on("host-changed", ({ newHostId }: { newHostId: string }) => {
      setHostId(newHostId);
    });

    socket.on("room-ended", () => {
      alert("Host ended the room — returning to lobby");
      try { localStorage.removeItem(storageKey); } catch(e){}
      window.location.href = "/play";
    });

    return () => {
      socket.off("player-joined");
      socket.off("player-left");
      socket.off("player-reconnected");
      socket.off("host-changed");
      socket.off("room-ended");
    };
  }, [roomId, username]);

  // leave (explicit)
  function onLeave() {
    const socket = getSocket();
    const myId = localStorage.getItem(`playerId:${roomId}`);
    socket.emit("player-left", { roomId, playerId: myId });
    try { localStorage.removeItem(`playerId:${roomId}`); } catch(e){}
    window.location.href = "/play";
  }

  function onStartGame() {
    const socket = getSocket();
    const myId = localStorage.getItem(`playerId:${roomId}`);
    socket.emit("start-game", { roomId, playerId: myId }, (res: any) => {
      if (!res?.ok) alert("failed to start");
      else window.location.href = `/play/room/${roomId}?username=${encodeURIComponent(username)}`;
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Room Lobby: {roomId}</h2>
      <p>Share this code with friends</p>

      <h3>Players:</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.username} {p.id === hostId && "(Host)"}
          </li>
        ))}
      </ul>

      {hostId === localStorage.getItem(`playerId:${roomId}`) ? (
        <button onClick={onStartGame}>Start Game</button>
      ) : null}

      <button onClick={onLeave} style={{ marginLeft: 12 }}>
        Leave
      </button>
    </div>
  );
}
