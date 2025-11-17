// app/play/join/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/app/lib/socket";

export default function JoinPage() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId.trim() || !name.trim()) return alert("need room id and name");
    setLoading(true);
    const socket = getSocket();
    socket.emit("join-room", { roomId, username: name }, (res: any) => {
      setLoading(false);
      if (res?.ok) {
        router.push(`/play/room/${roomId}?username=${encodeURIComponent(name)}`);
      } else {
        alert("join failed: " + (res?.reason || "unknown"));
      }
    });
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Join a room</h1>
      <form onSubmit={handleJoin} style={{ display: "grid", gap: 8, marginTop: 12, maxWidth: 420 }}>
        <input value={roomId} onChange={(e)=>setRoomId(e.target.value)} placeholder="Room ID (6 digits)" />
        <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your username" />
        <button disabled={loading}>{loading ? "Joining…" : "Join"}</button>
      </form>
    </main>
  );
}
