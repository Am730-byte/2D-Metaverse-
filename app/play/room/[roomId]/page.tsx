// app/play/room/[roomId]/page.tsx
"use client";

import { useSearchParams, useParams } from "next/navigation";
import dynamic from "next/dynamic";

// Load Phaser only on the client
const GameClientMultiplayer = dynamic(
  () => import("@/components/GameClientMultiplayer"),
  { ssr: false }
);

export default function RoomPage() {
  const params = useParams() as { roomId: string };
  const search = useSearchParams();

  const username =
    search?.get("username") || `anon${Math.floor(Math.random() * 999)}`;
  const roomId = params?.roomId || "";

  if (!roomId) {
    return <div style={{ padding: 24 }}>Missing room id</div>;
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <GameClientMultiplayer roomId={roomId} playerName={username} />
    </div>
  );
}
