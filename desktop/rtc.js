// Browser-only authenticated WebRTC endpoint. Main owns identity keys and signalling.
export class PeerSession {
  constructor({sendControl,onState=()=>{},onBulk=()=>{},iceServers=[]}) {
    Object.assign(this,{sendControl,onState,onBulk,iceServers}); this.phase='idle';this.muted=false;this.remoteStream=new MediaStream();
  }
  state(){return {phase:this.phase,peerId:this.peerId,callId:this.callId,muted:this.muted,sharing:!!this.screenStream,remoteStream:this.remoteStream,stats:this.stats||{},captureSettings:this.captureSettings||null,encodingLimits:this.encodingLimits||null};}
  emit(){this.onState(this.state());}
  signal(data){return this.sendControl(this.peerId,'rtc',{callId:this.callId,...data});}
  async mic(id){return navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,...(id?{deviceId:{exact:id}}:{})}});}
  setup(peerId,callId,initiator){
    this.peerId=peerId;this.callId=callId;this.candidates=[];this.answer=null;this.offer=null;this.pendingOffer=null;this.remoteStream=new MediaStream();
    const pc=this.pc=new RTCPeerConnection({iceServers:this.iceServers});
    this.audio=pc.addTransceiver('audio',{direction:'sendrecv'});this.video=pc.addTransceiver('video',{direction:'sendrecv'});this.system=pc.addTransceiver('audio',{direction:'sendrecv'});
    pc.onicecandidate=({candidate})=>{if(candidate)this.signal({type:'ice',candidate:candidate.toJSON()}).catch(()=>{});};
    pc.ontrack=({track})=>{this.remoteStream.addTrack(track);this.emit();};
    pc.onconnectionstatechange=()=>{if(this.pc!==pc)return;if(pc.connectionState==='connected'){clearTimeout(this.disconnectDeadline);clearTimeout(this.deadline);clearInterval(this.retry);this.phase='connected';this.emit();}if(pc.connectionState==='disconnected'){clearTimeout(this.disconnectDeadline);this.disconnectDeadline=setTimeout(()=>{if(this.pc===pc&&pc.connectionState==='disconnected')this.cleanup();},10000);}if(['failed','closed'].includes(pc.connectionState))this.cleanup();};
    pc.ondatachannel=({channel})=>this.channel(channel);
    if(initiator)this.channel(pc.createDataChannel('stillroom-files',{ordered:true}));
    this.statsTimer=setInterval(()=>this.measure().catch(()=>{}),1000);
  }
  channel(dc){
    if(dc.label!=='stillroom-files'){dc.close();return;}this.dc=dc;dc.bufferedAmountLowThreshold=128*1024;
    dc.onmessage=e=>{if(typeof e.data==='string'&&new TextEncoder().encode(e.data).length<=32768){try{Promise.resolve(this.onBulk(this.peerId,JSON.parse(e.data))).catch(()=>{});}catch{}}};
    dc.onopen=()=>this.emit();dc.onclose=()=>this.emit();
  }
  async gather(pc){if(pc.iceGatheringState==='complete')return;await new Promise(resolve=>{const timer=setTimeout(done,2500);function done(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);resolve();}function changed(){if(pc.iceGatheringState==='complete')done();}pc.addEventListener('icegatheringstatechange',changed);});if(this.pc!==pc)throw Error('Call ended');}
  async call(peerId,{microphoneId}={}){
    if(this.phase!=='idle')throw Error('A call is already active');
    const stream=await this.mic(microphoneId);
    if(this.phase!=='idle'){stream.getTracks().forEach(t=>t.stop());throw Error('A call is already active');}
    this.setup(peerId,crypto.randomUUID(),true);this.localStream=stream;stream.getAudioTracks().forEach(t=>{t.enabled=!this.muted});this.phase='calling';
    try{await this.audio.sender.replaceTrack(stream.getAudioTracks()[0]);const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);await this.gather(this.pc);this.offer={type:'offer',sdp:this.pc.localDescription.toJSON()};await this.signal(this.offer);
      this.retry=setInterval(()=>{if(this.phase==='calling')this.signal(this.offer).catch(()=>{});},3000);
      this.deadline=setTimeout(()=>this.hangup(),30000);this.emit();
    }catch(e){this.cleanup();throw e;}
  }
  async accept(){
    if(this.phase!=='ringing')throw Error('No incoming call');const id=this.callId;const stream=await this.mic();
    if(this.callId!==id||this.phase!=='ringing'){stream.getTracks().forEach(t=>t.stop());return;}
    this.localStream=stream;stream.getAudioTracks().forEach(t=>{t.enabled=!this.muted});
    try{await this.audio.sender.replaceTrack(stream.getAudioTracks()[0]);await this.pc.setRemoteDescription(this.pendingOffer);await this.flushIce();const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);await this.gather(this.pc);this.answer={type:'answer',sdp:this.pc.localDescription.toJSON()};this.phase='connecting';await this.signal(this.answer);this.emit();}catch(e){this.hangup();throw e;}
  }
  reject(){return this.hangup();}
  async hangup(){
    const peer = this.peerId, callId = this.callId;
    // Local consent ends immediately, even when signalling is unavailable.
    this.cleanup();
    if(peer)await this.sendControl(peer,'rtc',{callId,type:'end'}).catch(()=>{});
  }
  cleanup(){clearTimeout(this.disconnectDeadline);clearInterval(this.retry);clearInterval(this.statsTimer);clearTimeout(this.deadline);for(const stream of [this.localStream,this.screenStream,this.remoteStream])stream?.getTracks().forEach(t=>t.stop());const pc=this.pc;this.pc=null;if(pc){pc.onconnectionstatechange=null;pc.close();}this.dc=null;this.localStream=null;this.screenStream=null;this.captureSettings=null;this.encodingLimits=null;this.remoteStream=new MediaStream();this.phase='idle';this.peerId=null;this.callId=null;this.stats={};this.emit();}
  async handleControl({from,namespace,data}){
    if(namespace!=='rtc'||!data||typeof data.callId!=='string'||!/^[a-f0-9-]{36}$/.test(data.callId))return;
    if(data.type==='offer'){
      if(this.phase!=='idle'){
        if(from===this.peerId&&data.callId===this.callId){if(this.answer)await this.signal(this.answer);return;}
        // Deterministic glare: the lexically smaller call ID wins.
        if(this.phase==='calling'&&from===this.peerId&&data.callId<this.callId)this.cleanup();
        else {await this.sendControl(from,'rtc',{type:'end',callId:data.callId});return;}
      }
      if(data.sdp?.type!=='offer'||typeof data.sdp.sdp!=='string')return;
      this.setup(from,data.callId,false);this.pendingOffer=data.sdp;this.phase='ringing';this.deadline=setTimeout(()=>this.hangup(),30000);this.emit();return;
    }
    if(from!==this.peerId||data.callId!==this.callId||!this.pc)return;
    if(data.type==='end'){this.cleanup();return;}
    if(data.type==='answer'&&this.phase==='calling'&&data.sdp?.type==='answer'){
      await this.pc.setRemoteDescription(data.sdp);this.phase='connecting';clearInterval(this.retry);await this.flushIce();this.emit();
    }else if(data.type==='ice'&&data.candidate){if(this.pc.remoteDescription)await this.pc.addIceCandidate(data.candidate);else if(this.candidates.length<256)this.candidates.push(data.candidate);}
  }
  async flushIce(){for(const c of this.candidates.splice(0))await this.pc.addIceCandidate(c);}
  async setMicrophone(id){
    const pc = this.pc, previous = this.localStream, sender = this.audio?.sender;
    if(!pc||!previous)throw Error('No accepted call');
    const stream = await this.mic(id);
    try {
      if(this.pc!==pc||this.localStream!==previous)throw Error('Call changed during microphone selection');
      const track = stream.getAudioTracks()[0];track.enabled=!this.muted;
      await sender.replaceTrack(track);
      if(this.pc!==pc||this.localStream!==previous)throw Error('Call changed during microphone selection');
      previous.getTracks().forEach(t=>t.stop());this.localStream=stream;
    }catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  }
  mute(value){this.muted=!!value;this.localStream?.getAudioTracks().forEach(t=>{t.enabled=!this.muted});this.emit();}
  async share(stream,{width=2560,height=1440,fps=60}={}){
    const pc=this.pc, videoSender=this.video?.sender, audioSender=this.system?.sender;
    const current=()=>{if(this.pc!==pc||this.phase!=='connected'||this.screenStream!==stream)throw Error('Call changed during screen sharing');};
    try {
      if(!pc||this.phase!=='connected')throw Error('Connect a call before sharing');
      await this.stopShare();
      if(this.pc!==pc||this.phase!=='connected')throw Error('Call changed during screen sharing');
      this.screenStream=stream;
      const video=stream.getVideoTracks()[0];if(!video)throw Error('No screen video');
      await video.applyConstraints({width:{ideal:width},height:{ideal:height},frameRate:{ideal:fps}}).catch(()=>{});current();
      video.contentHint='detail';await videoSender.replaceTrack(video);current();
      this.captureSettings=video.getSettings();
      this.encodingLimits={requestedMaxBitrate:12000000,requestedMaxFramerate:fps,applied:false};
      try {
        const parameters=videoSender.getParameters();if(!parameters.encodings?.length)parameters.encodings=[{}];
        parameters.encodings[0].maxBitrate=12000000;parameters.encodings[0].maxFramerate=fps;parameters.degradationPreference='balanced';
        await videoSender.setParameters(parameters);current();this.encodingLimits.applied=true;
      }catch{current();}
      await audioSender.replaceTrack(stream.getAudioTracks()[0]||null);current();
      video.onended=()=>{if(this.screenStream===stream)this.stopShare().catch(()=>{});};this.emit();
    }catch(error){
      stream.getTracks().forEach(t=>{t.onended=null;t.stop();});
      if(this.screenStream===stream)await this.stopShare();
      throw error;
    }
  }
  async stopShare(){
    const stream=this.screenStream, videoSender=this.video?.sender, audioSender=this.system?.sender;
    this.screenStream=null;this.captureSettings=null;this.encodingLimits=null;
    // Stop capture before awaiting sender operations; failed/closed senders must
    // never leave the OS capture active after the user presses Stop.
    stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.emit();
    if(this.pc)await Promise.allSettled([
      Promise.resolve().then(()=>videoSender.replaceTrack(null)),
      Promise.resolve().then(()=>audioSender.replaceTrack(null)),
    ]);
  }
  async sendBulk(peerId,frame){const dc=this.dc;if(peerId!==this.peerId||this.phase!=='connected'||dc?.readyState!=='open')throw Error('Direct file channel unavailable');const value=JSON.stringify(frame);if(new TextEncoder().encode(value).length>32768)throw Error('File frame exceeds transport bound');while(dc.bufferedAmount>256*1024){await new Promise(r=>setTimeout(r,20));if(dc.readyState!=='open')throw Error('Direct file channel closed');}dc.send(value);}
  async measure(){const pc=this.pc;if(!pc)return;const report=await pc.getStats();if(this.pc!==pc)return;const incoming=[],outgoing=[];for(const r of report.values()){if(r.type==='inbound-rtp')incoming.push({kind:r.kind,width:r.frameWidth,height:r.frameHeight,fps:r.framesPerSecond,bytes:r.bytesReceived,framesDecoded:r.framesDecoded,framesDropped:r.framesDropped,jitter:r.jitter,packetsReceived:r.packetsReceived,packetsLost:r.packetsLost,codec:report.get(r.codecId)?.mimeType});if(r.type==='outbound-rtp')outgoing.push({kind:r.kind,width:r.frameWidth,height:r.frameHeight,fps:r.framesPerSecond,bytes:r.bytesSent,qualityLimitationReason:r.qualityLimitationReason,codec:report.get(r.codecId)?.mimeType});}this.stats={incoming,outgoing,rtt:[...report.values()].find(r=>r.type==='candidate-pair'&&r.state==='succeeded')?.currentRoundTripTime};this.emit();}
}





