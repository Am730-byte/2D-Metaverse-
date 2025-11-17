// app/lib/socket.ts
import { io, type Socket } from "socket.io-client";
let sock: Socket | null = null;
export function getSocket(): Socket {
  if (!sock) sock = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000");
  return sock;
}
