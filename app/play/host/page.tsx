// app/play/host/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/app/lib/socket";

export default function HostPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert("Provide a username :)");
    setLoading(true);
    const socket = getSocket();
    socket.emit("create-room", { username: name }, (res: any) => {
      setLoading(false);
      if (res?.ok && res.roomId) {
        // navigate to room page with username in query
        router.push(`/play/room/${res.roomId}?username=${encodeURIComponent(name)}`);
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
