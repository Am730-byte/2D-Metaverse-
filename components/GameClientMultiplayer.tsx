// components/GameClientMultiplayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { getSocket } from "@/app/lib/socket";
import { VoiceChat } from "@/app/lib/webrtc";
import type { Socket } from "socket.io-client";

// lerp helper
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// distance helper
function dist2(aX:number, aY:number, bX:number, bY:number) {
  const dx = aX - bX, dy = aY - bY; return Math.sqrt(dx*dx + dy*dy);
}


type Remote = {
  id: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  targetX: number;
  targetY: number;
};

class MultiplayerScene extends Phaser.Scene {
  map!: Phaser.Tilemaps.Tilemap;
  player!: Phaser.Physics.Arcade.Sprite;
  cursors!: any;
  remotes!: Map<string, Remote>;
  socket!: Socket;
  roomId!: string;
  playerId!: string | null;
  lastSent = 0;

  constructor(socket: Socket, roomId: string, playerId: string | null) {
    super("MultiplayerScene");
    this.socket = socket;
    this.roomId = roomId;
    this.playerId = playerId;
    this.remotes = new Map();
  }

  preload() {
    this.load.tilemapTiledJSON("officeMap", "/maps/office.json");
    this.load.image("Interiors", "/tilesets/Interiors_free_48x48.png");
    this.load.image("RoomBuilder", "/tilesets/Room_Builder_free_48x48.png");
    this.load.image("RPG", "/tilesets/Pixel_Art_Rpg_Tileset.jpg");

    this.load.spritesheet("adam_idle", "/characters/Adam_idle_16x16.png", {
      frameWidth: 16,
      frameHeight: 32,
    });

    this.load.spritesheet("adam_run", "/characters/Adam_run_16x16.png", {
      frameWidth: 16,
      frameHeight: 32,
    });
  }

  create() {
    const map = this.make.tilemap({ key: "officeMap" });
    this.map = map;

    const interiors = map.addTilesetImage("Interiors_free_48x48", "Interiors")!;
    const rpg = map.addTilesetImage("Pixel Art Rpg Tileset", "RPG")!;
    const builder = map.addTilesetImage("Room_Builder_free_48x48", "RoomBuilder")!;
    const tiles = [interiors, rpg, builder];

    map.createLayer("Ground", tiles)!.setDepth(0);
    map.createLayer("Wall", tiles)!.setDepth(10);
    map.createLayer("Props", tiles)!.setDepth(20);

    const collision = map.createLayer("Collision", tiles)!;
    collision.setDepth(30);
    collision.setCollisionByExclusion([-1]);
    collision.setVisible(false);

    const spawnObj = (map.findObject("Objects", (o: any) => o.name === "player_spawn") as any) || { x: 100, y: 100 };

    this.player = this.physics.add.sprite(spawnObj.x ?? 100, spawnObj.y ?? 100, "adam_idle").setScale(1.9).setDepth(50);
    this.player.body!.setSize(8, 15);
    this.player.body!.setOffset(2, 10);
    this.physics.add.collider(this.player, collision);

    this.anims.create({ key: "adam_idle_anim", frames: this.anims.generateFrameNumbers("adam_idle", { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: "adam_run_anim", frames: this.anims.generateFrameNumbers("adam_run", { start: 0, end: 3 }), frameRate: 10, repeat: -1 });

    this.cursors = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.cameras.main.startFollow(this.player, true, 0.2, 0.1);
    this.cameras.main.setZoom(1.6);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

// when receiving room-state (initial)
this.socket.on("room-state", (payload:any) => {
  const spawn = spawnObj;
  (payload.players || []).forEach((p:any) => {
    if (p.id === this.playerId) return;
    if (this.remotes.has(p.id)) return;
    const x = p.x ?? spawn.x;
    const y = p.y ?? spawn.y;
    const s = this.physics.add.sprite(x, y, "adam_idle").setScale(1.9).setDepth(y);
    s.play("adam_idle_anim");
    this.remotes.set(p.id, { id: p.id, sprite: s, targetX: x, targetY: y });
  });
});

// player-joined
this.socket.on("player-joined", (d:any) => {
  const p = d.player;
  if (p.id === this.playerId) return;
  if (this.remotes.has(p.id)) return;
  const x = p.x ?? spawnObj.x;
  const y = p.y ?? spawnObj.y;
  const s = this.physics.add.sprite(x, y, "adam_idle").setScale(1.9).setDepth(y);
  s.play("adam_idle_anim");
  this.remotes.set(p.id, { id: p.id, sprite: s, targetX: x, targetY: y });
});

// player-moved (server updates)
this.socket.on("player-moved", (d:any) => {
  const r = this.remotes.get(d.playerId);
  if (!r) {
    const s = this.physics.add.sprite(d.x, d.y, "adam_idle").setScale(1.9).setDepth(d.y);
    s.play("adam_idle_anim");
    this.remotes.set(d.playerId, { id: d.playerId, sprite: s, targetX: d.x, targetY: d.y });
  } else {
    r.targetX = d.x;
    r.targetY = d.y;
    // optional: store lastUpdateTime for latency-based interpolation
    (r as any).lastServerTs = Date.now();
  }
});


    this.socket.on("player-left", (d: any) => {
      const r = this.remotes.get(d.playerId);
      if (r) {
        r.sprite.destroy();
        this.remotes.delete(d.playerId);
      }
    });
  }

  update(_time: number, delta: number) {
    if (!this.player) return;
    const speed = 150;
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown) vx = -speed;
    else if (this.cursors.right.isDown) vx = speed;
    if (this.cursors.up.isDown) vy = -speed;
    else if (this.cursors.down.isDown) vy = speed;

    this.player.setVelocity(vx, vy);
    if (vx !== 0 || vy !== 0) this.player.play("adam_run_anim", true);
    else this.player.play("adam_idle_anim", true);

    this.player.setDepth(this.player.y);
const speedNow = Math.abs(this.player.body!.velocity.x) + Math.abs(this.player.body!.velocity.y);
if (speedNow > 0.1) this.player.play("adam_run_anim", true);
else this.player.play("adam_idle_anim", true);

    const now = Date.now();
    if (now - this.lastSent > 80) {
      this.socket.emit("player-move", {
  roomId: this.roomId,
  playerId: this.playerId ?? undefined,
  x: this.player.x,
  y: this.player.y,
  t: Date.now()
});
      this.lastSent = now;
    }

    // local movement logic stays: you move this.player directly and send throttle updates

// interpolation + setDepth + animation for remotes
this.remotes.forEach((r) => {
  const s = r.sprite;
  // small smoothing factor tuned to delta -> smaller when delta small
  const t = Math.min(1, delta / 100); // 0..1
  s.x = lerp(s.x, r.targetX, t);
  s.y = lerp(s.y, r.targetY, t);

  // z-order by y so deeper y renders above
  s.setDepth(s.y);

  // animation decision for remote
  const moving = Math.abs(r.targetX - s.x) > 1 || Math.abs(r.targetY - s.y) > 1;
  if (moving) s.play("adam_run_anim", true);
  else s.play("adam_idle_anim", true);

  // optional: reconciliation if server says far away
  const d = dist2(s.x, s.y, r.targetX, r.targetY);
  if (d > 80) { // big desync -> snap
    s.x = r.targetX;
    s.y = r.targetY;
  }
});
  }
}

export default function GameClientMultiplayer({ roomId, playerName }: { roomId: string; playerName?: string; }) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const voiceChatRef = useRef<VoiceChat | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [playerVolumes, setPlayerVolumes] = useState<Record<string, number>>({});

  useEffect(() => {
    const socket = getSocket();
    const storageKey = `playerId:${roomId}`;
    const savedPlayerId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

    socket.emit("join-room", { roomId, username: playerName, playerId: savedPlayerId || undefined }, (res: any) => {
      if (!res || !res.ok) {
        alert("Failed to join game room: " + (res?.reason || "unknown"));
        return;
      }

      if (res.playerId) {
        setMyPlayerId(res.playerId);
        try { localStorage.setItem(storageKey, res.playerId); } catch(e) {}
        
        // Initialize voice chat and auto-start (only if not already created)
        if (voiceChatRef.current) {
          console.log("⚠️ VoiceChat already exists, skipping creation");
          return;
        }
        
        const vc = new VoiceChat(socket, roomId, res.playerId);
        voiceChatRef.current = vc;
        
        // Set up volume callback
        vc.onVolumeUpdate = (playerId: string, volume: number) => {
          setPlayerVolumes(prev => ({ ...prev, [playerId]: volume }));
        };
        
        // Auto-start voice chat (mic muted by default)
        vc.startVoiceChat().then(success => {
          if (success) {
            setVoiceReady(true);
            // Get player list and connect
            socket.emit("get-room-players", { roomId }, (res: any) => {
              if (res?.players) {
                const playerIds = res.players.map((p: any) => p.id).filter((id: string) => id !== res.playerId);
                vc.connectToAllPlayers(playerIds);
              }
            });
          }
        });
      }

      // create game only once
      if (gameRef.current) {
        console.log("⚠️ Game already exists, skipping creation");
        return;
      }

      console.log("🎮 Creating Phaser game...");
      const container = document.getElementById("phaser-container");
      if (!container) {
        console.error("❌ phaser-container not found!");
        return;
      }

      const scene = new MultiplayerScene(socket, roomId, res.playerId ?? null);

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 1920,
        height: 1080,
        backgroundColor: "#1d1d1d",
        parent: "phaser-container",
        physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scene,
      };

      gameRef.current = new Phaser.Game(config);
      console.log("✅ Phaser game created");
    });

    return () => {
      const s = getSocket();
      s.off("player-moved");
      s.off("player-left");
      s.off("player-joined");
      s.off("room-state");
      
      // Cleanup voice chat
      if (voiceChatRef.current) {
        voiceChatRef.current.stopVoiceChat();
        voiceChatRef.current = null;
      }
      
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [roomId, playerName]);

  const toggleMic = () => {
    if (!voiceChatRef.current) return;
    const newState = !micEnabled;
    voiceChatRef.current.setMicMuted(!newState);
    setMicEnabled(newState);
  };

  const toggleDeafen = () => {
    if (!voiceChatRef.current) return;
    const newState = !deafened;
    voiceChatRef.current.setDeafened(newState);
    setDeafened(newState);
    // If deafened, also mute mic
    if (newState && micEnabled) {
      setMicEnabled(false);
      voiceChatRef.current.setMicMuted(true);
    }
  };

  const testAudio = () => {
    // Play a test beep to verify audio is working
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440; // A4 note
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    setTimeout(() => oscillator.stop(), 200);
    
    console.log("🔔 Test beep played");
  };

  return (
    <>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000, display: "flex", gap: "8px", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={toggleMic}
            disabled={!voiceReady}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              cursor: voiceReady ? "pointer" : "not-allowed",
              background: micEnabled ? "#22c55e" : "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "8px",
              opacity: voiceReady ? 1 : 0.5,
            }}
          >
            {micEnabled ? "🎤 Mic ON" : "🔇 Mic OFF"}
          </button>
          
          <button
            onClick={toggleDeafen}
            disabled={!voiceReady}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              cursor: voiceReady ? "pointer" : "not-allowed",
              background: deafened ? "#ef4444" : "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "8px",
              opacity: voiceReady ? 1 : 0.5,
            }}
          >
            {deafened ? "🔇 Deafened" : "🔊 Hearing"}
          </button>
          
          <button
            onClick={testAudio}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              cursor: "pointer",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
            }}
          >
            🔔 Test Audio
          </button>
        </div>
        <div style={{ background: "rgba(0,0,0,0.7)", color: "white", padding: "8px", borderRadius: "8px", fontSize: "12px" }}>
          Player ID: {myPlayerId?.substring(0, 8)}...
        </div>
        
        {/* Volume meters for other players */}
        {Object.entries(playerVolumes).map(([playerId, volume]) => (
          <div key={playerId} style={{ background: "rgba(0,0,0,0.7)", color: "white", padding: "8px", borderRadius: "8px", fontSize: "12px" }}>
            <div style={{ marginBottom: "4px" }}>
              Player: {playerId.substring(0, 8)}...
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1, height: "20px", background: "#333", borderRadius: "4px", overflow: "hidden" }}>
                <div 
                  style={{ 
                    height: "100%", 
                    width: `${Math.min(100, volume * 10)}%`, 
                    background: volume > 5 ? "#22c55e" : "#6b7280",
                    transition: "width 0.1s"
                  }}
                />
              </div>
              <span style={{ minWidth: "40px" }}>{Math.round(volume)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div 
        id="phaser-container" 
        style={{ 
          width: "100%", 
          height: "100vh",
          overflow: "hidden"
        }} 
      />
    </>
  );
}
