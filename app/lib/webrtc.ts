
// WebRTC configuration for voice/video chat
export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Add your TURN server here if you have one
    // { urls: "turn:YOUR_TURN_HOST:3478", username: "turnuser", credential: "turnpass" }
  ],
};

export type PeerConnection = {
  id: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
  audioElement?: HTMLAudioElement;
  volumeDetectionId?: number;
  audioContext?: AudioContext;
};

export class VoiceChat {
  private localStream: MediaStream | null = null;
  private peers: Map<string, PeerConnection> = new Map();
  private socket: any;
  private roomId: string;
  private myPlayerId: string;
  public onVolumeUpdate?: (playerId: string, volume: number) => void;

  constructor(socket: any, roomId: string, myPlayerId: string) {
    this.socket = socket;
    this.roomId = roomId;
    this.myPlayerId = myPlayerId;
    this.setupSocketListeners();
  }

  async startVoiceChat() {
    // Don't start if already started
    if (this.localStream) {
      console.log("⚠️ Voice chat already started");
      return true;
    }
    
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      // Mute by default
      this.localStream.getAudioTracks().forEach(track => track.enabled = false);
      console.log("🎤 Microphone access granted (muted by default)");
      return true;
    } catch (err) {
      console.error("❌ Failed to get microphone access:", err);
      return false;
    }
  }

  setMicMuted(muted: boolean) {
    if (this.localStream) {
      const currentState = !this.localStream.getAudioTracks()[0]?.enabled;
      // Only update if state actually changed
      if (currentState !== muted) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = !muted;
        });
        console.log(muted ? "🔇 Mic muted" : "🎤 Mic unmuted");
        
        // Update all peer connections with the new track state
        this.peers.forEach((peer) => {
          const senders = peer.connection.getSenders();
          const audioSender = senders.find(sender => sender.track?.kind === 'audio');
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = !muted;
            console.log(`🔄 Updated track for peer ${peer.id}: enabled=${!muted}`);
          }
        });
      }
    }
  }

  setDeafened(deafened: boolean) {
    this.peers.forEach(peer => {
      if (peer.audioElement) {
        peer.audioElement.volume = deafened ? 0 : 1;
      }
    });
    console.log(deafened ? "🔇 Deafened" : "🔊 Undeafened");
  }

  stopVoiceChat() {
    console.log("🛑 Stopping voice chat and cleaning up");
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    // Remove all peers
    this.peers.forEach(peer => this.removePeer(peer.id));
    this.peers.clear();
    
    // Remove socket listeners to prevent duplicates
    this.socket.off("webrtc-offer");
    this.socket.off("webrtc-answer");
    this.socket.off("webrtc-ice-candidate");
    this.socket.off("player-joined");
    this.socket.off("player-reconnected");
    this.socket.off("player-left");
  }

  private removePeer(playerId: string) {
    const peer = this.peers.get(playerId);
    if (peer) {
      // Stop volume detection
      if (peer.volumeDetectionId) {
        cancelAnimationFrame(peer.volumeDetectionId);
      }
      if (peer.audioContext) {
        peer.audioContext.close();
      }

      // Close connection
      peer.connection.close();
      
      // Stop stream
      if (peer.stream) {
        peer.stream.getTracks().forEach(track => track.stop());
      }
      
      // Remove audio element
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
      
      this.peers.delete(playerId);
      console.log("🗑️ Removed peer", playerId);
    }
  }

  async createOffer(targetPlayerId: string) {
    if (!this.localStream) {
      console.error("❌ Cannot create offer: no local stream");
      return;
    }

    console.log("📤 Creating offer for", targetPlayerId, "| My ID:", this.myPlayerId);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.peers.set(targetPlayerId, { id: targetPlayerId, connection: pc });

    // Add tracks for bidirectional audio
    this.localStream.getTracks().forEach(track => {
      console.log("🎵 Adding track:", track.kind, "enabled:", track.enabled);
      pc.addTrack(track, this.localStream!);
    });

    // Handle incoming audio
    pc.ontrack = (event) => {
      console.log("🔊 Receiving audio track from", targetPlayerId, "| Track:", event.track.kind, "| Streams:", event.streams.length);
      const peer = this.peers.get(targetPlayerId);
      if (!peer) {
        console.error("❌ Peer not found for ontrack:", targetPlayerId);
        return;
      }

      // Only create audio element once
      if (!peer.audioElement) {
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.volume = 1.0;
        
        // Log stream details
        const audioTracks = event.streams[0].getAudioTracks();
        console.log("🔊 Created audio element for", targetPlayerId);
        console.log("   Stream ID:", event.streams[0].id);
        console.log("   Audio tracks:", audioTracks.length);
        audioTracks.forEach((track, i) => {
          console.log(`   Track ${i}:`, track.label, "enabled:", track.enabled, "muted:", track.muted, "readyState:", track.readyState);
        });
        
        // Force play with user interaction
        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ Audio playing for", targetPlayerId);
              console.log("   Audio element paused:", remoteAudio.paused, "volume:", remoteAudio.volume);
            })
            .catch(e => {
              console.error("❌ Audio play failed:", e);
              // Retry on next user interaction
              document.addEventListener('click', () => {
                console.log("🔄 Retrying audio play for", targetPlayerId);
                remoteAudio.play();
              }, { once: true });
            });
        }
        
        peer.audioElement = remoteAudio;
        peer.stream = event.streams[0];
        
        // Start volume detection once
        this.setupVolumeDetection(targetPlayerId, event.streams[0]);
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`🔌 Connection state with ${targetPlayerId}:`, pc.connectionState, "| ICE:", pc.iceConnectionState);
      if (pc.connectionState === 'failed') {
        console.log("🔌 Connection failed, cleaning up peer");
        this.removePeer(targetPlayerId);
      }
    };
    
    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${targetPlayerId}:`, pc.iceConnectionState);
      
      // Handle ICE disconnection with retry
      if (pc.iceConnectionState === 'disconnected') {
        console.log("⏳ ICE disconnected, waiting for reconnection...");
        // Don't immediately remove - ICE can reconnect
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log("🔌 ICE connection lost, cleaning up peer");
            this.removePeer(targetPlayerId);
          }
        }, 5000); // Wait 5 seconds for reconnection
      } else if (pc.iceConnectionState === 'failed') {
        console.log("🔌 ICE connection failed, cleaning up peer");
        this.removePeer(targetPlayerId);
      }
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("webrtc-ice-candidate", {
          roomId: this.roomId,
          from: this.myPlayerId,
          to: targetPlayerId,
          candidate: event.candidate,
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit("webrtc-offer", {
      roomId: this.roomId,
      from: this.myPlayerId,
      to: targetPlayerId,
      offer,
    });
  }

  async handleOffer(fromPlayerId: string, offer: RTCSessionDescriptionInit) {
    // Wait for local stream if not ready yet
    if (!this.localStream) {
      console.warn("⏳ Local stream not ready, waiting...");
      let attempts = 0;
      while (!this.localStream && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!this.localStream) {
        console.error("❌ Cannot handle offer: no local stream after waiting");
        return;
      }
      console.log("✅ Local stream ready, proceeding with offer");
    }

    console.log("📨 Handling offer from", fromPlayerId, "| My ID:", this.myPlayerId);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.peers.set(fromPlayerId, { id: fromPlayerId, connection: pc });

    // Add tracks for bidirectional audio
    this.localStream.getTracks().forEach(track => {
      console.log("🎵 Adding track:", track.kind, "enabled:", track.enabled, "in answer");
      pc.addTrack(track, this.localStream!);
    });

    // Handle incoming audio
    pc.ontrack = (event) => {
      console.log("🔊 Receiving audio track from", fromPlayerId, "| Track:", event.track.kind, "| Streams:", event.streams.length);
      
      const peer = this.peers.get(fromPlayerId);
      if (!peer) {
        console.error("❌ Peer not found for ontrack:", fromPlayerId);
        return;
      }
      
      if (!peer.audioElement) {
        const remoteAudio = new Audio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.volume = 1.0;
        
        console.log("🔊 Created audio element for", fromPlayerId);
        
        remoteAudio.play()
          .then(() => console.log("✅ Audio playing for", fromPlayerId))
          .catch(e => {
            console.error("❌ Audio play failed:", e);
            document.addEventListener('click', () => {
              console.log("🔄 Retrying audio play for", fromPlayerId);
              remoteAudio.play();
            }, { once: true });
          });
        
        peer.audioElement = remoteAudio;
        peer.stream = event.streams[0];
        
        // Start volume detection
        this.setupVolumeDetection(fromPlayerId, event.streams[0]);
      }
    };
    
    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`🔌 Connection state with ${fromPlayerId}:`, pc.connectionState, "| ICE:", pc.iceConnectionState);
      if (pc.connectionState === 'failed') {
        console.log("🔌 Connection failed, cleaning up peer");
        this.removePeer(fromPlayerId);
      }
    };
    
    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state with ${fromPlayerId}:`, pc.iceConnectionState);
      
      // Handle ICE disconnection with retry
      if (pc.iceConnectionState === 'disconnected') {
        console.log("⏳ ICE disconnected, waiting for reconnection...");
        // Don't immediately remove - ICE can reconnect
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log("🔌 ICE connection lost, cleaning up peer");
            this.removePeer(fromPlayerId);
          }
        }, 5000); // Wait 5 seconds for reconnection
      } else if (pc.iceConnectionState === 'failed') {
        console.log("🔌 ICE connection failed, cleaning up peer");
        this.removePeer(fromPlayerId);
      }
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("webrtc-ice-candidate", {
          roomId: this.roomId,
          from: this.myPlayerId,
          to: fromPlayerId,
          candidate: event.candidate,
        });
      }
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.socket.emit("webrtc-answer", {
      roomId: this.roomId,
      from: this.myPlayerId,
      to: fromPlayerId,
      answer,
    });
  }

  async handleAnswer(fromPlayerId: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(fromPlayerId);
    if (!peer) {
      console.error("❌ No peer connection found for", fromPlayerId);
      return;
    }
    
    // Check if we're in the right state to receive an answer
    if (peer.connection.signalingState !== "have-local-offer") {
      console.warn(`⚠️ Ignoring answer from ${fromPlayerId} - wrong state: ${peer.connection.signalingState}`);
      return;
    }
    
    // Check if remote description is already set
    if (peer.connection.remoteDescription) {
      console.warn(`⚠️ Ignoring duplicate answer from ${fromPlayerId}`);
      return;
    }
    
    try {
      await peer.connection.setRemoteDescription(answer);
      console.log("✅ Set remote answer from", fromPlayerId);
    } catch (err) {
      console.error("❌ Failed to set remote answer:", err);
    }
  }

  async handleIceCandidate(fromPlayerId: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(fromPlayerId);
    if (peer) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  private setupSocketListeners() {
    this.socket.on("webrtc-offer", ({ from, offer }: any) => {
      console.log("📨 Received offer from", from);
      if (from === this.myPlayerId) {
        console.log("⚠️ Ignoring offer from self");
        return;
      }
      this.handleOffer(from, offer);
    });

    this.socket.on("webrtc-answer", ({ from, answer }: any) => {
      console.log("📨 Received answer from", from);
      if (from === this.myPlayerId) {
        console.log("⚠️ Ignoring answer from self");
        return;
      }
      this.handleAnswer(from, answer);
    });

    this.socket.on("webrtc-ice-candidate", ({ from, candidate }: any) => {
      if (from === this.myPlayerId) return;
      this.handleIceCandidate(from, candidate);
    });
    
    // When a new player joins, connect to them
    this.socket.on("player-joined", ({ player }: any) => {
      if (!player || player.id === this.myPlayerId) return;
      
      console.log("👤 New player joined:", player.id);
      
      // Use tie-breaker: only connect if we have lower ID
      if (this.myPlayerId < player.id && !this.peers.has(player.id)) {
        console.log("📞 Connecting to new player", player.id);
        this.createOffer(player.id);
      }
    });
    
    // When a player reconnects (e.g., after refresh), re-establish connection
    this.socket.on("player-reconnected", ({ playerId }: any) => {
      console.log("🔄 Received player-reconnected event for:", playerId, "| My ID:", this.myPlayerId);
      
      if (!playerId || playerId === this.myPlayerId) {
        console.log("⚠️ Ignoring reconnection event (self or invalid)");
        return;
      }
      
      console.log("🔄 Player reconnected:", playerId);
      
      // Remove old connection if exists
      if (this.peers.has(playerId)) {
        console.log("🗑️ Removing old connection before reconnecting");
        this.removePeer(playerId);
      }
      
      // Wait for the other player to be ready, then reconnect
      setTimeout(() => {
        console.log("⏰ Timeout complete, checking if should reconnect...");
        console.log("   My ID:", this.myPlayerId, "< Their ID:", playerId, "=", this.myPlayerId < playerId);
        console.log("   Local stream ready:", !!this.localStream);
        
        if (!this.localStream) {
          console.warn("⚠️ Local stream not ready yet, skipping reconnection");
          return;
        }
        
        if (this.myPlayerId < playerId) {
          console.log("📞 Re-establishing connection to", playerId);
          this.createOffer(playerId);
        } else {
          console.log("⏳ Waiting for them to initiate (they have lower ID)");
        }
      }, 2000); // Increased to 2 seconds
    });
    
    // Clean up when player leaves
    this.socket.on("player-left", ({ playerId }: any) => {
      if (playerId && this.peers.has(playerId)) {
        console.log("👋 Player left, removing peer:", playerId);
        this.removePeer(playerId);
      }
    });
  }

  // Initiate connections with all players in the room
  connectToAllPlayers(playerIds: string[]) {
    console.log("🔗 Connecting to all players:", playerIds, "| My ID:", this.myPlayerId);
    playerIds.forEach(playerId => {
      if (playerId === this.myPlayerId) {
        console.log("⚠️ Skipping self:", playerId);
        return;
      }
      
      if (this.peers.has(playerId)) {
        console.log("⚠️ Already connected to:", playerId);
        return;
      }
      
      // Tie-breaker: only the player with the "lower" ID creates the offer
      // This prevents both players from creating offers simultaneously
      if (this.myPlayerId < playerId) {
        console.log("📞 Initiating connection to", playerId, "(I have lower ID)");
        this.createOffer(playerId);
      } else {
        console.log("⏳ Waiting for offer from", playerId, "(they have lower ID)");
      }
    });
  }

  private setupVolumeDetection(playerId: string, stream: MediaStream) {
    const peer = this.peers.get(playerId);
    if (!peer) return;

    const audioContext = new AudioContext();
    audioContext.resume(); // Resume if suspended
    peer.audioContext = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    let lastSpeaking = false;
    let lastEmit = 0;
    
    const checkVolume = () => {
      if (!this.peers.has(playerId)) return; // Stop if peer removed

      analyser.getByteTimeDomainData(dataArray);
      
      // Calculate RMS (better for voice detection)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const volume = rms * 100;
      
      // Update UI with volume
      if (this.onVolumeUpdate) {
        this.onVolumeUpdate(playerId, volume);
      }
      
      const isSpeaking = volume > 2; // Threshold
      
      // Debounce: only emit every 500ms and when state changes
      const now = Date.now();
      if (isSpeaking !== lastSpeaking || now - lastEmit > 500) {
        console.log(`🗣️ ${playerId} ${isSpeaking ? 'speaking' : 'silent'} (${Math.round(volume)})`);
        this.socket.emit("player-speaking", { roomId: this.roomId, playerId, speaking: isSpeaking });
        lastSpeaking = isSpeaking;
        lastEmit = now;
      }
      
      peer.volumeDetectionId = requestAnimationFrame(checkVolume);
    };
    
    checkVolume();
  }
}



