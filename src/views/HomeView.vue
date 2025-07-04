<template>
  <h2>1. Start your Webcam</h2>
  <div class="videos">
      <span>
        <h3>Local Stream</h3>
        <video id="webcamVideo" ref="webcamVideo" autoplay playsinline></video>
      </span>
    <span>
        <h3>Remote Stream</h3>
        <video id="remoteVideo" ref="remoteVideo" autoplay playsinline></video>
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

const ws_url = 'https://webrtcserverdemo-production.up.railway.app/';

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
    remoteStream: null,
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

    // 监听 RTCPeerConnection 的 connectionState
    this.pc.onconnectionstatechange = () => {
      this.connectionState = this.pc.connectionState;
    };
    // 初始化
    this.connectionState = this.pc.connectionState;
  },
  methods: {
    onSocketMessage(event) {
      const msg = JSON.parse(event.data);
      console.log("websocket msg", msg)
      // if (msg.type === 'offer' && !this.isCaller) {
      //   this.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      // }
      if (msg.type === 'answer' && this.isCaller) {
        const answerDescription = new RTCSessionDescription(msg.answer);
        this.pc.setRemoteDescription(answerDescription); // Sets remote SDP value
        // this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      }
      if (msg.type === 'candidate') {
        const c = msg.candidate;
        this.answerCandidates.push(c)
        this.pc.addIceCandidate(new RTCIceCandidate(c));
      }
    },
    async start() {


      console.log("webcamButton")
      this.localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
      this.remoteStream = new MediaStream();

      //  Push tracks from local steam to peer connection
      this.localStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, this.localStream); //Peer connection add track
      });

      // Pull track from remote stream, add to video stream
      this.pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          console.log("remoteStream", track)
          this.remoteStream.addTrack(track);
        });
        this.$refs.remoteVideo.srcObject = this.remoteStream;
        // this.$refs.remoteVideo = this.remoteStream;

      }

      this.$refs.webcamVideo.srcObject = this.localStream;
      this.$refs.webcamVideo.muted = true;
      console.log("this.localStream", this.localStream)
      this.$refs.remoteVideo.srcObject = this.remoteStream;

      this.callButtonDisabled = false;
      this.answerButtonDisabled = false;
      this.webcamButtonDisabled = true;
    },
    // 2. Create an offer
    async call() {
      this.hangButtonDisabled = false;
      this.answerButtonDisabled = true;
      this.isCaller = true;
      this.callId = Math.random().toString(36).substr(2, 4); // 或由服务器生成
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candStr = event.candidate.candidate;
          // if (candStr.includes('typ srflx')) {
          // 只发送 srflx
          this.socket.send(JSON.stringify({
            type: 'candidate',
            callId: this.callId,
            candidate: event.candidate,
          }));
          this.callerCandidates.push(event.candidate);
          // console.log('发送 srflx candidate:', event.candidate);
          // } else {
          //   console.log('丢弃非 srflx candidate:', event.candidate);
          // }
        }
      };

      //  Create offer
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


      const offerDescription = callData.data.offer; //  Offer
      console.log("offerDescription", offerDescription);
      await this.pc.setRemoteDescription(new RTCSessionDescription(offerDescription)); // Generate a Session Description from offer,

      // offer 会通过 onSocketMessage 收到
      // 生成 answer
      const answerDescription = await this.pc.createAnswer(); // Generate answer SDP locally
      await this.pc.setLocalDescription(answerDescription);  // Set it as local description for pc
      //  JS object to be stored in ws for answer
      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      }


      this.socket.send(JSON.stringify({
        type: 'answer',
        callId: this.callId,
        answer: answer,
      }));

      this.callerCandidates = callData.data.callerCandidates;
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
