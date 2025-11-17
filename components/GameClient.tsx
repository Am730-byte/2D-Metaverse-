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

          const groundLayer = map.createLayer("Ground", [interiors, rpg, builder]).setDepth(10);
          const wallLayer = map.createLayer("Wall", [interiors, rpg, builder]).setDepth(20);
          const propsLayer = map.createLayer("Props", [interiors, rpg, builder]).setDepth(30);

          const collisionLayer = map
            .createLayer("Collision", [interiors, rpg, builder])
            .setDepth(40)
            .setVisible(false);

          collisionLayer.setCollisionByExclusion([-1]);

          // Spawn
          const spawn = map.findObject("Objects", (obj: Phaser.Types.Tilemaps.TiledObject) => obj.name === "player_spawn");

          this.player = this.physics.add
            .sprite(spawn.x, spawn.y, "adam_idle")
            .setScale(1.9)
            .setDepth(1000);

          // Hitbox fix
          this.player.body.setSize(8, 15);
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

          // Controls
          this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
          });

          // Camera follow
          this.cameras.main.startFollow(this.player, true, 0.2, 0.1);
          this.cameras.main.setRoundPixels(true);
          this.cameras.main.setZoom(1.6);
          this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        },

        update() {
          const speed = 150;
          const c = this.cursors;

          let vx = 0, vy = 0;

          if (c.left.isDown) vx = -speed;
          else if (c.right.isDown) vx = speed;

          if (c.up.isDown) vy = -speed;
          else if (c.down.isDown) vy = speed;

          this.player.setVelocity(vx, vy);

          if (vx !== 0 || vy !== 0)
            this.player.play("adam_run_anim", true);
          else
            this.player.play("adam_idle_anim", true);
        },
      },
    };

    const game = new Phaser.Game(config);
    return () => game.destroy(true);
  }, []);

  return <div id="phaser-container" />;
}
