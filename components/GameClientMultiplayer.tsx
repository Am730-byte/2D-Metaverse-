// components/GameClientMultiplayer.tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { getSocket } from "@/app/lib/socket";
import type { Socket } from "socket.io-client";

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

    map.createLayer("Ground", tiles).setDepth(0);
    map.createLayer("Wall", tiles).setDepth(10);
    map.createLayer("Props", tiles).setDepth(20);

    const collision = map.createLayer("Collision", tiles).setDepth(30);
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

    this.socket.on("room-state", (payload: any) => {
      // spawn known players
      const spawn = spawnObj;
      (payload.players || []).forEach((p: any) => {
        if (p.id === this.playerId) return;
        if (this.remotes.has(p.id)) return;
        const s = this.physics.add.sprite(p.x || spawn.x, p.y || spawn.y, "adam_idle").setScale(1.9).setDepth(40);
        s.play("adam_idle_anim");
        this.remotes.set(p.id, { id: p.id, sprite: s, targetX: p.x || spawn.x, targetY: p.y || spawn.y });
      });
    });

    this.socket.on("player-joined", (d: any) => {
      const p = d.player;
      if (p.id === this.playerId) return;
      if (this.remotes.has(p.id)) return;
      const s = this.physics.add.sprite(p.x || spawnObj.x, p.y || spawnObj.y, "adam_idle").setScale(1.9).setDepth(40);
      s.play("adam_idle_anim");
      this.remotes.set(p.id, { id: p.id, sprite: s, targetX: p.x || spawnObj.x, targetY: p.y || spawnObj.y });
    });

    this.socket.on("player-moved", (d: any) => {
      const r = this.remotes.get(d.playerId);
      if (!r) {
        const s = this.physics.add.sprite(d.x, d.y, "adam_idle").setScale(1.9).setDepth(40);
        s.play("adam_idle_anim");
        this.remotes.set(d.playerId, { id: d.playerId, sprite: s, targetX: d.x, targetY: d.y });
      } else {
        r.targetX = d.x;
        r.targetY = d.y;
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

    const now = Date.now();
    if (now - this.lastSent > 80) {
      this.socket.emit("player-move", {
        roomId: this.roomId,
        playerId: this.playerId ?? undefined,
        x: this.player.x,
        y: this.player.y,
      });
      this.lastSent = now;
    }

    this.remotes.forEach((r) => {
      const s = r.sprite;
      const t = Math.min(1, delta / 100);
      s.x += (r.targetX - s.x) * t;
      s.y += (r.targetY - s.y) * t;
    });
  }
}

export default function GameClientMultiplayer({ roomId, playerName }: { roomId: string; playerName?: string; }) {
  const gameRef = useRef<Phaser.Game | null>(null);

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
        try { localStorage.setItem(storageKey, res.playerId); } catch(e) {}
      }

      // create game only once
      if (gameRef.current) return;

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
    });

    return () => {
      const s = getSocket();
      s.off("player-moved");
      s.off("player-left");
      s.off("player-joined");
      s.off("room-state");
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [roomId, playerName]);

  return (
    <div 
      id="phaser-container" 
      style={{ 
        width: "100%", 
        height: "100vh",
        overflow: "hidden"
      }} 
    />
  );
}
