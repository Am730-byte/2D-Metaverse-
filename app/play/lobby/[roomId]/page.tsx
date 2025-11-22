"use client";

import { useSearchParams, useParams } from "next/navigation";
import LobbyClient from "@/components/LobbyClient";

export default function LobbyPage() {
  const params = useParams();
  const search = useSearchParams();

  const roomId = params?.roomId as string;
  const username = search?.get("username") || "anon";

  return (
    <LobbyClient roomId={roomId} username={username} />
  );
}

