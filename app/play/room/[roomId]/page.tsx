// app/play/room/[roomId]/page.tsx
"use client";

import React from "react";
import { useSearchParams, useParams } from "next/navigation";
import dynamic from "next/dynamic";

const GameClientMultiplayer = dynamic(() => import("@/components/GameClientMultiplayer"), { ssr: false });
const LobbyClient = dynamic(() => import("@/components/LobbyClient"), { ssr: false });

export default function RoomPage() {
  const params = useParams() as { roomId: string };
  const search = useSearchParams();
  const username = search?.get("username") || `anon${Math.floor(Math.random() * 999)}`;
  const roomId = params?.roomId || "";

  if (!roomId) return <div style={{ padding: 24 }}>Missing room id</div>;

  // layout: left = lobby, right = game (you can style further)
  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", gap: 12 }}>
      <div style={{ width: 320, background: "#000", color: "#fff", padding: 12, overflow: "auto" }}>
        <LobbyClient roomId={roomId} username={username} />
      </div>

      <div style={{ flex: 1 }}>
        <GameClientMultiplayer roomId={roomId} playerName={username} />
      </div>
    </div>
  );
}
