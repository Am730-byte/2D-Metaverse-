"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import ScreenshareManager from "@/components/ScreenshareManager";
import dynamic from "next/dynamic";

const GameClientMultiplayer = dynamic(() => import("@/components/GameClientMultiplayer"), { ssr: false });

export default function RoomPage() {
  // get roomId + username + myPlayerId from localStorage
  const params = useParams() as { roomId: string };
  const search = useSearchParams();
  const roomId = params?.roomId || "";
  const username = search?.get("username") || "anon";
  const myPlayerId = typeof window !== "undefined" ? localStorage.getItem(`playerId:${roomId}`) : null;
  const isHost = myPlayerId && /* fetch/compare host id — or get from room-state */ false;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <GameClientMultiplayer roomId={roomId} playerName={username} />
      <ScreenshareManager roomId={roomId} playerId={myPlayerId} isHost={isHost} />
    </div>
  );
}
