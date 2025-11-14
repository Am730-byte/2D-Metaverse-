"use client";

import { useEffect } from "react";
import Phaser from "phaser";

export default function GameClient() {
  useEffect(() => {
    // only run on client
    const config = {
      type: Phaser.AUTO,
      
      width: 1920,
      height: 1080,
      backgroundColor: "#1d1d1d",
      scale:{
       mode: Phaser.Scale.RESIZE,
      },
      parent: "phaser-container",
      scene: {
        preload() {},
        create() {},
        update() {},
      },
    };

    const game = new Phaser.Game(config);

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div id="phaser-container" />;
}
