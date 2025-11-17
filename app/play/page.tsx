// app/play/page.tsx
"use client";

import Link from "next/link";

export default function PlayMenu() {
  return (
    <div style={{ padding: 40 }}>
      <h1>Play Multiplayer</h1>

      <Link href="/play/host">
        <button>Host a Room</button>
      </Link>

      <br /><br />

      <Link href="/play/join">
        <button>Join a Room</button>
      </Link>
    </div>
  );
}
