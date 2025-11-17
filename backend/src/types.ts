export interface PlayerState {
  x: number;
  y: number;
  username: string;
}

export interface Room {
  players: Record<string, PlayerState>;
}