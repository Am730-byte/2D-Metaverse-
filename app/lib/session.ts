// app/lib/session.ts
export function saveSession(roomId: string, playerId: string, username: string) {
  localStorage.setItem("mv_roomId", roomId);
  localStorage.setItem("mv_playerId", playerId);
  localStorage.setItem("mv_username", username);
}
export function clearSession() {
  localStorage.removeItem("mv_roomId");
  localStorage.removeItem("mv_playerId");
  // we might keep username across sessions, optional
}
export function getSession() {
  return {
    roomId: localStorage.getItem("mv_roomId") || undefined,
    playerId: localStorage.getItem("mv_playerId") || undefined,
    username: localStorage.getItem("mv_username") || undefined,
  };
}
