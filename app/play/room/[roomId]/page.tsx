"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const GameClientMultiplayer = dynamic(() => import("@/components/GameClientMultiplayer"), { ssr: false });

export default function RoomPage() {
  const params = useParams() as { roomId: string };
  const roomId = params.roomId;
  const [username, setUsername] = useState("anon");

  useEffect(() => {
    // Get username from sessionStorage (hidden from URL)
    const stored = sessionStorage.getItem(`username:${roomId}`);
    if (stored) setUsername(stored);
  }, [roomId]);

  if (!roomId) return <div>Missing room id</div>;

  return <GameClientMultiplayer roomId={roomId} playerName={username} />;
}
