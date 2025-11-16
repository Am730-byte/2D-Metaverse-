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
      scale: {
        mode: Phaser.Scale.RESIZE,
      },
      parent: "phaser-container",
      scene: {
        preload() {
               console.log("Loading map...");     
          this.load.tilemapTiledJSON("officeMap", "/maps/office.json");
                                                 
          this.load.image("Interiors", "/tilesets/Interiors_free_48x48.png");
          this.load.image("RoomBuilder", "/tilesets/Room_Builder_free_48x48.png");
          this.load.image("RPG", "/tilesets/Pixel_Art_Rpg_Tileset.jpg");
        },
        create() {

          

          // Load the map
          const map = this.make.tilemap({ key: "officeMap" });

          console.log("Layers:", map.layers.map((l: Phaser.Tilemaps.LayerData) => l.name));

          // Match tileset names from Tiled → to keys you loaded in preload()
          const interiors = map.addTilesetImage("Interiors_free_48x48", "Interiors");

          const rpg = map.addTilesetImage("Pixel Art Rpg Tileset", "RPG");
          const builder = map.addTilesetImage("Room_Builder_free_48x48", "RoomBuilder");

          // Create tile layers exactly how they exist in Tiled
          map.createLayer("Ground", [interiors, rpg, builder]);
          map.createLayer("Wall", [interiors, rpg, builder]);
          map.createLayer("Props", [interiors, rpg, builder]);

          // Collision layer
          const collisionLayer = map.createLayer("Collision", [
            interiors,
            rpg,
            builder,
          ]);

          // Enable collisions on this layer
          collisionLayer.setCollisionByExclusion([-1]);

        },
        update() { },
      },
    };

    const game = new Phaser.Game(config);

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div id="phaser-container" />;
}
