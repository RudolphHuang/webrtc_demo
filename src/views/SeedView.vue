<template>
  <h2>1. Start your Webcam</h2>
  <input id="m3u8" style="width: 80%" v-model="m3u8_url"/>
  <div class="videos">
      <span>
        <h3>Local Stream</h3>
        <video id="webcamVideo" ref="webcamVideo" autoplay playsinline></video>
      </span>
  </div>

  <div style="margin: 1em 0;">
    <b>PeerConnection State:</b> {{ connectionState }}
  </div>

  <button id="webcamButton" @click="start" :disabled="webcamButtonDisabled">Start webcam</button>
  <h2>2. Create a new Call</h2>
  <button id="callButton" @click="call" :disabled="callButtonDisabled">Create Call (offer)</button>

  <h2>3. Join a Call</h2>
  <p>Answer the call from a different browser window or device</p>

  <input id="callInput" ref="callInput" v-model="callId"/>
  <button id="answerButton" @click="answer" :disabled="answerButtonDisabled">Answer</button>

  <h2>4. Hangup</h2>
  <button id="hangupButton" @click="hangup" :disabled="hangButtonDisabled">Hangup</button>
</template>

<script>
// @ is an alias to /src
import HelloWorld from '@/components/HelloWorld.vue'
import axios from "axios";
import Hls from "hls.js";

const ws_url = 'https://webrtcserverdemo-production.up.railway.app/';

// const m3u8_url = 'https://live.prd.dlive.tv/hls/live/klairefairy.m3u8?web=true';


const servers = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all'
};

export default {
  name: 'HomeView',
  components: {
    HelloWorld
  },
  data: () => ({
    localStream: null,
    callButtonDisabled: false,
    answerButtonDisabled: false,
    webcamButtonDisabled: false,
    hangButtonDisabled: false,
    pc: new RTCPeerConnection(servers),
    socket: null,
    callId: '',
    isCaller: false,
    callerCandidates: [],
    answerCandidates: [],
    connectionState: 'new',
    m3u8_url: 'https://hn.bfvvs.com/play/wdLQLwje/index.m3u8'
  }),
  created() {
    this.socket = new WebSocket(ws_url);
    this.socket.onopen = () => {
      console.log('[WebSocket] 连接成功');
    };
    this.socket.onclose = (event) => {
      if (event.wasClean) {
        console.log(`[WebSocket] 连接正常关闭, code=${event.code}, reason=${event.reason}`);
      } else {
        console.log('[WebSocket] 连接异常断开');
      }
    };
    this.socket.onerror = (error) => {
      console.error('[WebSocket] 发生错误:', error);
    };
    this.socket.onmessage = this.onSocketMessage;
    this.pc.onconnectionstatechange = () => {
      this.connectionState = this.pc.connectionState;
    };
    this.connectionState = this.pc.connectionState;
  },
  methods: {
    onSocketMessage(event) {
      const msg = JSON.parse(event.data);
      console.log("websocket msg", msg)
      if (msg.type === 'answer' && this.isCaller) {
        const answerDescription = new RTCSessionDescription(msg.answer);
        this.pc.setRemoteDescription(answerDescription);
      }
      if (msg.type === 'candidate') {
        const c = msg.candidate;
        this.answerCandidates.push(c)
        this.pc.addIceCandidate(new RTCIceCandidate(c));
      }
    },
    async start() {
      // 1. 用 hls.js 播放 m3u8 到 webcamVideo
      const video = this.$refs.webcamVideo;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(this.m3u8_url);
        hls.attachMedia(video);
        await new Promise(resolve => {
          video.oncanplay = resolve;
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = this.m3u8_url;
        await video.play();
      }
      // 2. 用 canvas.captureStream() 获取 MediaStream
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      function drawFrame() {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      }
      drawFrame();
      // 3. 获取 MediaStream
      const stream = canvas.captureStream(25); // 25fps
      this.localStream = stream;
      // 4. 推送 tracks 到 peer connection
      this.localStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, this.localStream);
      });
      this.$refs.webcamVideo.muted = true;
      this.webcamButtonDisabled = true;
      this.callButtonDisabled = false;
      this.answerButtonDisabled = false;
    },
    async call() {
      this.hangButtonDisabled = false;
      this.answerButtonDisabled = true;
      this.isCaller = true;
      this.callId = Math.random().toString(36).substr(2, 4); // 或由服务器生成
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.send(JSON.stringify({
            type: 'candidate',
            callId: this.callId,
            candidate: event.candidate,
          }));
          this.callerCandidates.push(event.candidate);
        }
      };
      const offerDescription = await this.pc.createOffer();
      await this.pc.setLocalDescription(offerDescription);
      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
      }
      this.socket.send(JSON.stringify({
        type: 'offer',
        callId: this.callId,
        offer: offer,
      }));
      this.hangButtonDisabled = false;
    },
    async answer() {
      this.isCaller = false;
      console.log("join", this.callId)
      const callData = await axios.get(ws_url + "offer/" + this.callId)
      console.log("callData", callData.data);
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.send(JSON.stringify({
            type: 'candidate',
            callId: this.callId,
            candidate: event.candidate,
          }));
          this.answerCandidates.push(event.candidate.toJSON());
        }
      };
      this.socket.send(JSON.stringify({
        type: 'join',
        callId: this.callId,
      }));
      const offerDescription = callData.data.offer;
      await this.pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
      const answerDescription = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answerDescription);
      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      }
      this.socket.send(JSON.stringify({
        type: 'answer',
        callId: this.callId,
        answer: answer,
      }));
      for (let i = 0; i < callData.data.callerCandidates.length; i++) {
        await this.pc.addIceCandidate(new RTCIceCandidate(callData.data.callerCandidates[i]));
      }
      this.hangButtonDisabled = false;
      this.answerButtonDisabled = true;
    },
    async hangup() {
      this.pc.close()
      this.pc.onicecandidate = null;
      location.reload();
    }
  }
}
</script>

<style>
video {
  width: 40vw;
  height: 30vw;
  margin: 2rem;
  background: #2c3e50;
}

.videos {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
