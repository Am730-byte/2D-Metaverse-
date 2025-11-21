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
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const joinGuard = useRef(false);

  // localStorage key per room to persist playerId across refresh
  const storageKey = `playerId:${roomId}`;

  useEffect(() => {
    const socket = getSocket();
    
    const handlePlayerJoined = (data: any) => {
      const player = data.player;
      if (!player) return;
      setPlayers((prev) => {
        if (prev.find((p) => p.id === player.id)) return prev;
        return [...prev, player];
      });
    };

    const handlePlayerLeft = ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    };

    const handleHostChanged = ({ newHostId }: { newHostId: string }) => {
      setHostId(newHostId);
    };

    const handleRoomEnded = () => {
      alert("Host ended the room");
      try { localStorage.removeItem(storageKey); } catch(e){}
      window.location.href = "/play";
    };

    const handleGameStarted = () => {
      // Store username in sessionStorage to hide from URL
      try {
        sessionStorage.setItem(`username:${roomId}`, username);
      } catch(e) {}
      window.location.href = `/play/room/${roomId}`;
    };

    // Register all handlers
    socket.on("player-joined", handlePlayerJoined);
    socket.on("player-left", handlePlayerLeft);
    socket.on("host-changed", handleHostChanged);
    socket.on("room-ended", handleRoomEnded);
    socket.on("game-started", handleGameStarted);

    // Join room
    const savedPlayerId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    
    socket.emit("join-room", { roomId, username, playerId: savedPlayerId || undefined }, (res: any) => {
      console.log("📥 Full join response:", res);
      console.log("📥 hostId from response:", res?.hostId);
      
      if (!res || !res.ok) {
        alert("Failed to join room: " + (res?.reason || "unknown"));
        return;
      }

      if (res.playerId) {
        setMyPlayerId(res.playerId);
        try {
          localStorage.setItem(storageKey, res.playerId);
        } catch (e) {}
      }

      setPlayers(res.players || []);
      const receivedHostId = res.hostId || null;
      console.log("🎯 Setting hostId to:", receivedHostId);
      setHostId(receivedHostId);
    });

    // Cleanup: remove specific handlers
    return () => {
      socket.off("player-joined", handlePlayerJoined);
      socket.off("player-left", handlePlayerLeft);
      socket.off("host-changed", handleHostChanged);
      socket.off("room-ended", handleRoomEnded);
      socket.off("game-started", handleGameStarted);
    };
  }, [roomId, username, storageKey]);

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
    if (!res?.ok) {
      alert("Failed to start game");
      return;
    }
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

      <div style={{ marginTop: 16, padding: 8, background: "#222", fontSize: 12 }}>
        <div>My Player ID: {myPlayerId || "not set"}</div>
        <div>Host ID: {hostId || "not set"}</div>
        <div>Am I host? {myPlayerId && hostId === myPlayerId ? "YES" : "NO"}</div>
      </div>

      {myPlayerId && hostId === myPlayerId ? (
        <button onClick={onStartGame} style={{ padding: "12px 24px", fontSize: "16px", cursor: "pointer" }}>
          Start Game
        </button>
      ) : null}

      <button onClick={onLeave} style={{ marginLeft: 12 }}>
        Leave
      </button>
    </div>
  );
}
