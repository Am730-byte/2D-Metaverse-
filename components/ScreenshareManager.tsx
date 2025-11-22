// components/ScreenshareManager.tsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "@/app/lib/socket";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // add TURN here for production
  ],
};

type PCMap = Record<string, RTCPeerConnection>;

export default function ScreenshareManager({ roomId, playerId, isHost }: { roomId: string; playerId: string | null; isHost: boolean }) {
  const socket = getSocket();
  const pcs = useRef<PCMap>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // handle incoming signaling
    socket.on("webrtc-offer", async ({ fromPlayerId, offer }) => {
      if (!fromPlayerId) return;
      // viewer receives offer from host (or another peer) -> create PC and answer
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcs.current[fromPlayerId] = pc;

      pc.ontrack = (ev) => {
        // attach remote stream
        attachRemoteStream(fromPlayerId, ev.streams[0]);
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit("webrtc-ice", { roomId, toPlayerId: fromPlayerId, fromPlayerId: playerId, candidate: ev.candidate });
        }
      };

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { roomId, toPlayerId: fromPlayerId, fromPlayerId: playerId, answer });
    });

    socket.on("webrtc-answer", async ({ fromPlayerId, answer }) => {
      const pc = pcs.current[fromPlayerId];
      if (!pc) return;
      await pc.setRemoteDescription(answer);
    });

    socket.on("webrtc-ice", ({ fromPlayerId, candidate }) => {
      const pc = pcs.current[fromPlayerId];
      if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    });

    socket.on("screenshare-starting", ({ hostId }) => {
      console.log("screenshare starting by", hostId);
      // viewer will be signaled by host with offers
    });

    socket.on("screenshare-stopped", () => {
      // cleanup all remote video elements
      for (const el of (videoContainerRef.current?.querySelectorAll("video") || [])) {
        try { (el as HTMLVideoElement).srcObject = null; } catch(e){}
        el.remove();
      }
      pcs.current = {};
      setSharing(false);
    });

    return () => {
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice");
      socket.off("screenshare-starting");
      socket.off("screenshare-stopped");
    };
  }, [socket, roomId, playerId]);

  function attachRemoteStream(id: string, stream: MediaStream) {
    // create a DOM video overlay and append to container
    let v = document.getElementById("remote-video-" + id) as HTMLVideoElement | null;
    if (!v) {
      v = document.createElement("video");
      v.id = "remote-video-" + id;
      v.autoplay = true;
      v.playsInline = true;
      v.style.position = "absolute";
      v.style.right = "8px";
      v.style.top = `${8 + Object.keys(pcs.current).indexOf(id) * 120}px`;
      v.style.width = "320px";
      v.style.height = "180px";
      v.style.zIndex = "9999";
      videoContainerRef.current?.appendChild(v);
    }
    v.srcObject = stream;
    setSharing(true);
  }

  // HOST: start screenshare and create peer connections to viewers
  async function startScreenshare() {
    try {
      // ask for display + audio
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      localStreamRef.current = displayStream;

      // notify server (optional permission step)
      socket.emit("request-screenshare-start", { roomId, playerId }, (res: any) => {
        if (!res?.ok) {
          alert("cannot start screenshare: " + (res?.reason || "denied"));
        }
      });

      // get the list of players from server via /room/:id OR you could rely on "room-state" event already broadcasted
      socket.emit("get-room-players", { roomId }, (res: any) => {
        const players = (res?.players || []).filter((p: any) => p.id !== playerId);
        for (const p of players) {
          createHostPCForViewer(p.id, displayStream);
        }
      });
    } catch (err) {
      console.error("screenshare failed", err);
      alert("screenshare permission failed");
    }
  }

  async function createHostPCForViewer(viewerId: string, stream: MediaStream) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcs.current[viewerId] = pc;

    // add tracks
    for (const t of stream.getTracks()) pc.addTrack(t, stream);

    pc.onicecandidate = (ev) => {
      if (ev.candidate)
        socket.emit("webrtc-ice", { roomId, toPlayerId: viewerId, fromPlayerId: playerId, candidate: ev.candidate });
    };

    // create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // send offer to viewer (server relays)
    socket.emit("webrtc-offer", { roomId, toPlayerId: viewerId, fromPlayerId: playerId, offer });
  }

  // HOST: stop
  function stopScreenshare() {
    const s = localStreamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    socket.emit("request-screenshare-stop", { roomId, playerId });
    // cleanup
    for (const k of Object.keys(pcs.current)) {
      try { pcs.current[k].close(); } catch(e){}
      delete pcs.current[k];
    }
    setSharing(false);
  }

  return (
    <div ref={videoContainerRef} style={{ position: "absolute", top: 0, right: 0, zIndex: 9999, pointerEvents: "none" }}>
      {isHost ? (
        <>
          <button style={{ pointerEvents: "auto", position: "fixed", left: 12, bottom: 12, zIndex: 10000 }} onClick={sharing ? stopScreenshare : startScreenshare}>
            {sharing ? "Stop Share" : "Start Screenshare"}
          </button>
        </>
      ) : null}
    </div>
  );
}
