<template>
  <h2>1. Start your Webcam</h2>
  <div class="videos">
      <span>
        <h3>Local Stream</h3>
        <video id="webcamVideo" ref="webcamVideo" autoplay playsinline></video>
      </span>
    <span>
        <h3>Remote Stream</h3>
        <video id="remoteVideo" ref="remoteVideo" autoplay playsinline controls></video>
      </span>


  </div>

  <button id="webcamButton" @click="start" :disabled="webcamButtonDisabled">Start webcam</button>
  <h2>2. Create a new Call</h2>
  <button id="callButton" @click="create" :disabled="callButtonDisabled">Create Call (offer)</button>

  <h2>3. Join a Call</h2>
  <p>Answer the call from a different browser window or device</p>

  <input id="callInput" ref="callInput"/>
  <button id="answerButton" @click="join" :disabled="answerButtonDisabled">Answer</button>

  <h2>4. Hangup</h2>

  <button id="hangupButton" @click="hangup" :disabled="hangButtonDisabled">Hangup</button>
</template>

<script>
// @ is an alias to /src
import HelloWorld from '@/components/HelloWorld.vue'

const servers = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
};

export default {
  name: 'HomeView2',
  components: {
    HelloWorld
  },
  data() {
    return {
      localStream: null,
      remoteStream: null,
      callButtonDisabled: true,
      answerButtonDisabled: false,
      webcamButtonDisabled: false,
      hangButtonDisabled: true,
      pc1: null,
      pc2: null,
      socket: null,
      callId: '',
      isCaller: false,
      startTime: null,
    };
  },
  created() {
    this.socket = new WebSocket('https://webrtcserverdemo-production.up.railway.app/');
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
    console.log('[WebRTC] Document tried to create an RTCPeerConnection', servers);
  },
  mounted() {
    this.$refs.webcamVideo.addEventListener('loadedmetadata', function () {
      console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });
    this.$refs.remoteVideo.addEventListener('loadedmetadata', function () {
      console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
    });
    this.$refs.remoteVideo.addEventListener('resize', () => {
      console.log(`Remote video size changed to ${this.$refs.remoteVideo.videoWidth}x${this.$refs.remoteVideo.videoHeight} - Time since pageload ${performance.now().toFixed(0)}ms`);
      if (this.startTime) {
        const elapsedTime = window.performance.now() - this.startTime;
        console.log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
        this.startTime = null;
      }
    });
  },
  methods: {
    onSocketMessage(event) {
      const msg = JSON.parse(event.data);
      console.log("websocket msg", msg)
      if (msg.type === 'offer' && !this.isCaller) {
        this.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      }
      if (msg.type === 'answer' && this.isCaller) {
        this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      }
      if (msg.type === 'candidate') {
        this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
            .then(() => {
              console.log('addIceCandidate success');
            })
            .catch(e => {
              console.error('addIceCandidate error', e);
            });
      }
    },
    async start() {
      console.log('Requesting local stream');
      this.webcamButtonDisabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
        console.log('Received local stream');
        this.$refs.webcamVideo.srcObject = stream;
        this.localStream = stream;
        this.callButtonDisabled = false;
      } catch (e) {
        alert(`getUserMedia() error: ${e.name}`);
      }
    },
    async create() {
      this.callButtonDisabled = true;
      this.hangButtonDisabled = false;
      console.log('Starting call');
      this.startTime = window.performance.now();
      const videoTracks = this.localStream.getVideoTracks();
      const audioTracks = this.localStream.getAudioTracks();
      if (videoTracks.length > 0) {
        console.log(`Using video device: ${videoTracks[0].label}`);
      }
      if (audioTracks.length > 0) {
        console.log(`Using audio device: ${audioTracks[0].label}`);
      }
      const configuration = {
        iceServers: [
          {urls: 'stun:stun.l.google.com:19302'}]
        ,
        // iceTransportPolicy: 'relay'//强制转发
      };
      console.log('RTCPeerConnection configuration:', configuration);
      this.pc1 = new RTCPeerConnection(configuration);
      console.log('Created local peer connection object pc1');
      this.pc1.addEventListener('icecandidate', e => this.onIceCandidate(this.pc1, e));
      this.pc2 = new RTCPeerConnection(configuration);
      console.log('Created remote peer connection object pc2');
      this.pc2.addEventListener('icecandidate', e => this.onIceCandidate(this.pc2, e));
      this.pc1.addEventListener('iceconnectionstatechange', e => this.onIceStateChange(this.pc1, e));
      this.pc2.addEventListener('iceconnectionstatechange', e => this.onIceStateChange(this.pc2, e));
      this.pc2.addEventListener('track', this.gotRemoteStream);

      this.localStream.getTracks().forEach(track => this.pc1.addTrack(track, this.localStream));
      console.log('Added local stream to pc1');

      try {
        console.log('pc1 createOffer start');
        const offer = await this.pc1.createOffer({offerToReceiveAudio: 1, offerToReceiveVideo: 1});
        await this.onCreateOfferSuccess(offer);
      } catch (e) {
        this.onCreateSessionDescriptionError(e);
      }
    },
    onCreateSessionDescriptionError(error) {
      console.log(`Failed to create session description: ${error.toString()}`);
    },
    async onCreateOfferSuccess(desc) {
      console.log(`Offer from pc1\n${desc.sdp}`);
      console.log('pc1 setLocalDescription start');
      try {
        await this.pc1.setLocalDescription(desc);
        this.onSetLocalSuccess(this.pc1);
      } catch (e) {
        this.onSetSessionDescriptionError(e);
      }

      console.log('pc2 setRemoteDescription start');
      try {
        await this.pc2.setRemoteDescription(desc);
        this.onSetRemoteSuccess(this.pc2);
      } catch (e) {
        this.onSetSessionDescriptionError(e);
      }

      console.log('pc2 createAnswer start');
      try {
        const answer = await this.pc2.createAnswer();
        await this.onCreateAnswerSuccess(answer);
      } catch (e) {
        this.onCreateSessionDescriptionError(e);
      }
    },
    onSetLocalSuccess(pc) {
      console.log(`${this.getName(pc)} setLocalDescription complete`);
    },
    onSetRemoteSuccess(pc) {
      console.log(`${this.getName(pc)} setRemoteDescription complete`);
    },
    onSetSessionDescriptionError(error) {
      console.log(`Failed to set session description: ${error.toString()}`);
    },
    gotRemoteStream(e) {
      if (this.$refs.remoteVideo.srcObject !== e.streams[0]) {
        this.$refs.remoteVideo.srcObject = e.streams[0];
        console.log('pc2 received remote stream', e.streams[0]);
      }
    },
    async onCreateAnswerSuccess(desc) {
      console.log(`Answer from pc2:\n${desc.sdp}`);
      console.log('pc2 setLocalDescription start');
      try {
        await this.pc2.setLocalDescription(desc);
        this.onSetLocalSuccess(this.pc2);
      } catch (e) {
        this.onSetSessionDescriptionError(e);
      }
      console.log('pc1 setRemoteDescription start');
      try {
        await this.pc1.setRemoteDescription(desc);
        this.onSetRemoteSuccess(this.pc1);
      } catch (e) {
        this.onSetSessionDescriptionError(e);
      }
    },
    async onIceCandidate(pc, event) {
      try {
        if (event.candidate) {
          await this.getOtherPc(pc).addIceCandidate(event.candidate);
          this.onAddIceCandidateSuccess(pc);
        }
      } catch (e) {
        this.onAddIceCandidateError(pc, e);
      }
      console.log(`${this.getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
    },
    onAddIceCandidateSuccess(pc) {
      console.log(`${this.getName(pc)} addIceCandidate success`);
    },
    onAddIceCandidateError(pc, error) {
      console.log(`${this.getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
    },
    onIceStateChange(pc, event) {
      if (pc) {
        console.log(`${this.getName(pc)} ICE state: ${pc.iceConnectionState}`);
        console.log('ICE state change event: ', event);
      }
    },
    async join() {
      this.isCaller = false;
      this.callId = this.$refs.callInput.value;
      console.log("join", this.callId)
      this.pc.onicecandidate = (event) => {


        if (event.candidate) {
          const cand = event.candidate.candidate;
          const typeMatch = cand.match(/ typ ([a-z]+)/);
          if (typeMatch) {
            const candidateType = typeMatch[1];
            console.log('[NAT] 发现 candidate 类型:', candidateType);
            // 你可以在页面上显示
            // this.natType = candidateType;
          }

          this.socket.send(JSON.stringify({
            type: 'candidate',
            callId: this.callId,
            candidate: event.candidate,
          }));
        }
      };
      this.socket.send(JSON.stringify({
        type: 'join',
        callId: this.callId,
      }));
      // offer 会通过 onSocketMessage 收到
      // 生成 answer
      this.pc.onnegotiationneeded = async () => {
        const answerDescription = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answerDescription);
        this.socket.send(JSON.stringify({
          type: 'answer',
          callId: this.callId,
          answer: answerDescription,
        }));
      };
    },
    async hangup() {
      console.log('Ending call');
      this.pc1.close();
      this.pc2.close();
      this.pc1 = null;
      this.pc2 = null;
      this.hangButtonDisabled = true;
      this.callButtonDisabled = false;
    },
    getName(pc) {
      return (pc === this.pc1) ? 'pc1' : 'pc2';
    },
    getOtherPc(pc) {
      return (pc === this.pc1) ? this.pc2 : this.pc1;
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
