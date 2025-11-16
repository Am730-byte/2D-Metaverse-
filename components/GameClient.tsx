"use client";

import { useEffect } from "react";
import Phaser from "phaser";

export default function GameClient() {
  useEffect(() => {
    const config = {
      type: Phaser.AUTO,
      width: 1920,
      height: 1080,
      backgroundColor: "#1d1d1d",
      scale: { mode: Phaser.Scale.RESIZE },
      parent: "phaser-container",

      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },

      scene: {
        player: null,
        cursors: null,
        darkness: null,
        visionMask: null,

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
        },

        create() {
          const map = this.make.tilemap({ key: "officeMap" });

          const interiors = map.addTilesetImage("Interiors_free_48x48", "Interiors");
          const rpg = map.addTilesetImage("Pixel Art Rpg Tileset", "RPG");
          const builder = map.addTilesetImage("Room_Builder_free_48x48", "RoomBuilder");

          const groundLayer = map.createLayer("Ground", [interiors, rpg, builder]).setDepth(0);
          const wallLayer = map.createLayer("Wall", [interiors, rpg, builder]).setDepth(10);
          const propsLayer = map.createLayer("Props", [interiors, rpg, builder]).setDepth(20);

          const collisionLayer = map
            .createLayer("Collision", [interiors, rpg, builder])
            .setDepth(30);
          collisionLayer.setCollisionByExclusion([-1]);
          collisionLayer.setVisible(false);

          // Spawn player
          const spawn = map.findObject(
            "Objects",
            (obj) => obj.name === "player_spawn"
          );

          this.player = this.physics.add
            .sprite(spawn.x, spawn.y, "adam_idle")
            .setScale(1.6)
            .setDepth(50);

          // Reduce collision body
          this.player.body.setSize(12, 20);
          this.player.body.setOffset(2, 10);

          this.physics.add.collider(this.player, collisionLayer);

          // Animations
          this.anims.create({
            key: "adam_idle_anim",
            frames: this.anims.generateFrameNumbers("adam_idle", { start: 0, end: 3 }),
            frameRate: 6,
            repeat: -1,
          });

          this.anims.create({
            key: "adam_run_anim",
            frames: this.anims.generateFrameNumbers("adam_run", { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1,
          });

          // WASD keys
          this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
          });

          // ---- FOG OF WAR ----
          this.darkness = this.make.graphics({});
          this.darkness.fillStyle(0x000000, 0.85);
          this.darkness.fillRect(0, 0, map.widthInPixels, map.heightInPixels);

          this.visionMask = this.make.graphics({ x: 0, y: 0 });
          const mask = this.darkness.createBitmapMask(this.visionMask);

          this.darkness.setMask(mask);
        },

        update() {
          const speed = 150;
          const c = this.cursors;

          if (!this.player) return;

          let vx = 0;
          let vy = 0;

          if (c.left.isDown) vx = -speed;
          else if (c.right.isDown) vx = speed;

          if (c.up.isDown) vy = -speed;
          else if (c.down.isDown) vy = speed;

          this.player.setVelocity(vx, vy);

          if (vx !== 0 || vy !== 0)
            this.player.play("adam_run_anim", true);
          else
            this.player.play("adam_idle_anim", true);

          // ---- UPDATE VISION MASK ----
          const radius = 140;

          this.visionMask.clear();
          this.visionMask.fillStyle(0xffffff, 1);
          this.visionMask.beginPath();
          this.visionMask.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2);
          this.visionMask.fill();
        },
      },
    };

    const game = new Phaser.Game(config);

    return () => game.destroy(true);
  }, []);

  return <div id="phaser-container" />;
}
