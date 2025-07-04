<template>
  <h2>观看 WebRTC 远端流</h2>

  <div class="videos">
    <span>
      <h3>Remote Stream</h3>
      <video id="remoteVideo" ref="remoteVideo" autoplay playsinline></video>
    </span>
  </div>

  <div style="margin: 1em 0;">
    <b>PeerConnection State:</b> {{ connectionState }}
  </div>

  <h2>1. 输入 Call ID 并观看</h2>
  <input id="callInput" ref="callInput" v-model="callId"/>
  <button id="answerButton" @click="answer" :disabled="answerButtonDisabled">观看</button>

  <h2>2. 断开</h2>
  <button id="hangupButton" @click="hangup" :disabled="hangButtonDisabled">断开</button>
</template>

<script>
import axios from "axios";

const ws_url = 'https://webrtcserverdemo-production.up.railway.app/';
const servers = {
  iceServers: [
    {urls: ['stun:stun.l.google.com:19302']},
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all'
};

export default {
  name: 'Viewer',
  data: () => ({
    remoteStream: null,
    answerButtonDisabled: false,
    hangButtonDisabled: false,
    pc: new RTCPeerConnection(servers),
    socket: null,
    callId: '',
    answerCandidates: [],
    connectionState: 'new',
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
    this.remoteStream = new MediaStream();
    this.pc.onconnectionstatechange = () => {
      this.connectionState = this.pc.connectionState;
    };
    this.connectionState = this.pc.connectionState;

    this.pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        console.log("remoteStream", track)
        this.remoteStream.addTrack(track);
      });
      this.$refs.remoteVideo.srcObject = this.remoteStream;
      // this.$refs.remoteVideo = this.remoteStream;

    }
  },
  methods: {
    onSocketMessage(event) {
      const msg = JSON.parse(event.data);
      if (msg.type === 'answer') {
        // 不处理
      }
      if (msg.type === 'candidate') {
        // const c = msg.candidate;
        // this.answerCandidates.push(c)
        // this.pc.addIceCandidate(new RTCIceCandidate(c));
      }
    },
    async answer() {

      // 只观看，不推流
      this.answerButtonDisabled = true;
      this.hangButtonDisabled = false;
      const callData = await axios.get(ws_url + "offer/" + this.callId)
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
      console.log("offerDescription", offerDescription);
      await this.pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
      // 生成 answer
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
      // 添加 callerCandidates
      console.log("callData.data.callerCandidates", callData.data.callerCandidates)
      for (let i = 0; i < callData.data.callerCandidates.length; i++) {
        await this.pc.addIceCandidate(new RTCIceCandidate(callData.data.callerCandidates[i]));
      }
    },
    async hangup() {
      this.pc.close();
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
