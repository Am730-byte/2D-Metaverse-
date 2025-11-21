// app/play/host/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/app/lib/socket";

export default function HostPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert("Provide a username :)");
    setLoading(true);
    const socket = getSocket();
    socket.emit("join-room", { username: name }, (res: any) => {
      setLoading(false);
      if (res?.ok && res.roomId) {
        // store playerId locally for persistence
        try { localStorage.setItem(`playerId:${res.roomId}`, res.playerId); } catch(e){}
        // Go to LOBBY first, not directly to game
        router.push(`/play/lobby/${res.roomId}?username=${encodeURIComponent(name)}`);
      } else {
        alert("couldn't create room — try again");
      }
    });
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Host a room</h1>
      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your name" />
        <button type="submit" disabled={loading}>{loading ? "Creating…" : "Create Room"}</button>
      </form>
    </main>
  );
}
