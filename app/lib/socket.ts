// app/lib/socket.ts
import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (_socket) return _socket;

  // adjust URL if your backend runs elsewhere
  const url = typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000");

  _socket = io(url, {
    transports: ["websocket"],
    autoConnect: true,
  });

  // optional: debug logs (remove in prod)
  _socket.on("connect", () => console.log("[socket] connected", _socket?.id));
  _socket.on("disconnect", (r) => console.log("[socket] disconnect", r));

  return _socket;
}
