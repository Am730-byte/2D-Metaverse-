Proximity Metaverse — Real-Time Voice World

A 2D multiplayer world built with Next.js, Phaser, WebSockets, and WebRTC, where players walk around a shared map and communicate through proximity-based voice chat.
Audio fades in and out based on distance, creating a small metaverse space focused on real-time interaction and presence.

This project is my playground for mastering real-time systems, spatial audio, and multiplayer architecture using modern, production-ready tools.

🚀 Core Features (MVP)

2D world rendered inside Next.js using Phaser

Player movement with smooth keyboard controls

Real-time multiplayer position sync (WebSockets)

Proximity-based voice using WebRTC

Spatial audio: voice volume changes with distance

Basic lobby / world entry

🔮 Planned Additions

Better sprites, player animations, and map assets

UI controls (mute/unmute, name tags, proximity circles)

Multiple rooms / zones

Area-based audio effects (reverb, dampening)

Chat bubbles / emotes

Persistent accounts (auth + DB)

Redis-backed zone distribution for scaling

Option to migrate backend to Golang for high concurrency

🛠️ Tech Stack

Frontend

Next.js 16

Phaser 3 (game canvas & movement)

WebRTC (voice handling)

Web Audio API (spatial audio)

Backend

Node.js (WebSocket server)

ws for realtime communication

Potential migration to Golang for distributed systems

MongoDB / PostgreSQL (future persistence)

Infra / DevOps

Vercel (frontend deploy)

Railway / Render (WebSocket backend)

Environment variables + .env setup

📁 Project Structure
/app               → Next.js 16 frontend
/components        → UI + client game components
/server            → WebSocket backend server
/public/assets     → sprites, textures, images
todo.txt           → stepwise tasks
README.md          → project overview

📌 Project Status

Current:

Project initialized

Repo connected

README + TODO created

Next Steps:

Integrate Phaser into Next.js

Render player + map

Add movement

Connect WebSocket server

Sync player positions

Implement voice proximity

🎯 Why I Am Building This

This isn’t a clone.
It’s my space to train real-time logic, multiplayer design, distributed backends, and modern frontend engineering — everything needed to build serious systems, not just UI pages.

💻 Running the Project

Instructions will be added once initial components are ready.

Frontend (Next.js):
npm run dev

Backend (WebSocket server):
node server/index.js
