// Browser-only authenticated WebRTC endpoint. Main owns identity keys and signalling.
import { summarizeStream } from './stream-metrics.js';
export class PeerSession {
  constructor({sendControl,onState=()=>{},onBulk=()=>{},iceServers=[]}) {
    Object.assign(this,{sendControl,onState,onBulk,iceServers}); this.phase='idle';this.muted=false;this.remoteStream=new MediaStream();
  }
  state(){return {phase:this.phase,peerId:this.peerId,callId:this.callId,muted:this.muted,sharing:!!this.screenStream,remoteStream:this.remoteStream,stats:this.stats||{},captureSettings:this.captureSettings||null,encodingLimits:this.encodingLimits||null,reportAvailable:!!this.measurements?.length||!!this.lastReport,issue:this.issue||''};}
  report(){return this.measurements?.length?{format:'stillroom-stream-report-v1',createdAt:new Date().toISOString(),incoming:summarizeStream(this.measurements),outgoing:summarizeStream(this.measurements,'outgoing'),samples:structuredClone(this.measurements),limitations:['Client-observed performance, not an independent audit.','No message content, peer identity, keys, SDP, or IP addresses included.']}:this.lastReport||null;}
  emit(){this.onState(this.state());}
  signal(data){return this.sendControl(this.peerId,'rtc',{callId:this.callId,...data});}
  async mic(id){return navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,...(id?{deviceId:{exact:id}}:{})}});}
  setup(peerId,callId,initiator){
    this.peerId=peerId;this.callId=callId;this.candidates=[];this.answer=null;this.offer=null;this.pendingOffer=null;this.remoteStream=new MediaStream();this.measurements=[];this.issue='';
    const pc=this.pc=new RTCPeerConnection({iceServers:this.iceServers});
    // The answerer must use the transceivers created by the remote offer.
    // Pre-creating its own addTransceiver slots can leave senders unassociated
    // with negotiated m-lines, so its later screen track never reaches the caller.
    if(initiator){this.audio=pc.addTransceiver('audio',{direction:'sendrecv'});this.video=pc.addTransceiver('video',{direction:'sendrecv'});this.system=pc.addTransceiver('audio',{direction:'sendrecv'});}
    pc.onicecandidate=({candidate})=>{if(candidate)this.signal({type:'ice',candidate:candidate.toJSON()}).catch(()=>{});};
    pc.ontrack=({track})=>{this.remoteStream.addTrack(track);this.emit();};
    pc.onconnectionstatechange=()=>{if(this.pc!==pc)return;if(pc.connectionState==='connected'){clearTimeout(this.disconnectDeadline);clearTimeout(this.deadline);clearInterval(this.retry);this.phase='connected';this.issue='';this.emit();}if(pc.connectionState==='disconnected'){this.issue='Media connection interrupted. Trying to recover for 10 seconds.';this.emit();clearTimeout(this.disconnectDeadline);this.disconnectDeadline=setTimeout(()=>{if(this.pc===pc&&pc.connectionState==='disconnected'){this.issue='Media connection was lost. Check both networks and start another call.';this.cleanup();}},10000);}if(pc.connectionState==='failed'){this.issue='No working media route. Check both networks and STUN/TURN settings; some networks require a TURN relay.';this.cleanup();}else if(pc.connectionState==='closed')this.cleanup();};
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
    const preparation=this.preparingCall={};this.phase='preparing';this.issue='';this.emit();let stream;
    try{stream=await this.mic(microphoneId);}catch(error){if(this.preparingCall===preparation){this.preparingCall=null;this.phase='idle';this.emit();}throw error;}
    if(this.preparingCall!==preparation||this.phase!=='preparing'){stream.getTracks().forEach(t=>t.stop());throw Error('Call cancelled during microphone selection');}
    this.preparingCall=null;const id=crypto.randomUUID();
    try{this.setup(peerId,id,true);}catch(error){stream.getTracks().forEach(t=>t.stop());if(this.callId===id)this.cleanup();throw error;}
    const pc=this.pc;this.localStream=stream;stream.getAudioTracks().forEach(t=>{t.enabled=!this.muted});this.phase='calling';
    const current=()=>{if(this.pc!==pc||this.callId!==id)throw Error('Call changed during setup');};
    try{await this.audio.sender.replaceTrack(stream.getAudioTracks()[0]);current();const offer=await pc.createOffer();current();await pc.setLocalDescription(offer);current();await this.gather(pc);current();this.offer={type:'offer',sdp:pc.localDescription.toJSON()};await this.signal(this.offer);current();
      this.retry=setInterval(()=>{if(this.phase==='calling')this.signal(this.offer).catch(()=>{});},3000);
      this.deadline=setTimeout(()=>this.hangup(),30000);this.emit();
    }catch(e){stream.getTracks().forEach(t=>t.stop());if(this.pc===pc)this.cleanup();throw e;}
  }
  async accept(){
    if(this.phase!=='ringing')throw Error('No incoming call');const id=this.callId,pc=this.pc;const stream=await this.mic();
    if(this.pc!==pc||this.callId!==id||this.phase!=='ringing'){stream.getTracks().forEach(t=>t.stop());return;}
    this.localStream=stream;stream.getAudioTracks().forEach(t=>{t.enabled=!this.muted});
    const current=()=>{if(this.pc!==pc||this.callId!==id)throw Error('Call changed during acceptance');};
    try{await pc.setRemoteDescription(this.pendingOffer);current();
      const slots=pc.getTransceivers();
      [this.audio,this.video,this.system]=slots;
      if(slots.length!==3||slots.map(t=>t.receiver.track.kind).join(',')!=='audio,video,audio')throw Error('Unsupported call media layout');
      for(const slot of slots)slot.direction='sendrecv';
      await this.audio.sender.replaceTrack(stream.getAudioTracks()[0]);current();await this.flushIce();current();const answer=await pc.createAnswer();current();await pc.setLocalDescription(answer);current();await this.gather(pc);current();this.answer={type:'answer',sdp:pc.localDescription.toJSON()};this.phase='connecting';await this.signal(this.answer);current();this.emit();
    }catch(e){stream.getTracks().forEach(t=>t.stop());if(this.pc===pc)await this.hangup();throw e;}
  }
  reject(){return this.hangup();}
  async hangup(){
    const peer = this.peerId, callId = this.callId;
    // Local consent ends immediately, even when signalling is unavailable.
    this.issue='';this.cleanup();
    if(peer)await this.sendControl(peer,'rtc',{callId,type:'end'}).catch(()=>{});
  }
  cleanup(){this.preparingCall=null;if(this.measurements?.length)this.lastReport=this.report();this.measurements=[];clearTimeout(this.disconnectDeadline);clearInterval(this.retry);clearInterval(this.statsTimer);clearTimeout(this.deadline);for(const stream of [this.localStream,this.screenStream,this.remoteStream])stream?.getTracks().forEach(t=>t.stop());const pc=this.pc;this.pc=null;if(pc){pc.onconnectionstatechange=null;pc.close();}this.dc=null;this.localStream=null;this.screenStream=null;this.captureSettings=null;this.encodingLimits=null;this.remoteStream=new MediaStream();this.phase='idle';this.peerId=null;this.callId=null;this.stats={};this.emit();}
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
  async measure(){
    const pc=this.pc;if(!pc)return;const report=await pc.getStats();if(this.pc!==pc)return;
    const incoming=[],outgoing=[],sources=[];
    for(const r of report.values()){
      if(r.type==='inbound-rtp')incoming.push({timestamp:r.timestamp,kind:r.kind,width:r.frameWidth,height:r.frameHeight,fps:r.framesPerSecond,bytes:r.bytesReceived,framesDecoded:r.framesDecoded,framesDropped:r.framesDropped,totalDecodeTime:r.totalDecodeTime,decoder:r.decoderImplementation,powerEfficient:r.powerEfficientDecoder,jitterBufferDelay:r.jitterBufferDelay,jitterBufferEmittedCount:r.jitterBufferEmittedCount,freezeCount:r.freezeCount,totalFreezesDuration:r.totalFreezesDuration,jitter:r.jitter,packetsReceived:r.packetsReceived,packetsLost:r.packetsLost,codec:report.get(r.codecId)?.mimeType});
      if(r.type==='outbound-rtp')outgoing.push({timestamp:r.timestamp,kind:r.kind,width:r.frameWidth,height:r.frameHeight,fps:r.framesPerSecond,bytes:r.bytesSent,framesEncoded:r.framesEncoded,framesSent:r.framesSent,totalEncodeTime:r.totalEncodeTime,encoder:r.encoderImplementation,powerEfficient:r.powerEfficientEncoder,targetBitrate:r.targetBitrate,qualityLimitationReason:r.qualityLimitationReason,qualityLimitationDurations:r.qualityLimitationDurations,codec:report.get(r.codecId)?.mimeType});
      if(r.type==='media-source'&&r.kind==='video')sources.push({width:r.width,height:r.height,frames:r.frames,fps:r.framesPerSecond});
    }
    const transport=[...report.values()].find(r=>r.type==='transport'&&r.selectedCandidatePairId);
    const pair=transport&&report.get(transport.selectedCandidatePairId);
    const candidateType=id=>report.get(id)?.candidateType;
    this.stats={incoming,outgoing,sources,rtt:pair?.currentRoundTripTime,availableOutgoingBitrate:pair?.availableOutgoingBitrate,path:pair?{local:candidateType(pair.localCandidateId),remote:candidateType(pair.remoteCandidateId),protocol:report.get(pair.localCandidateId)?.protocol}:null};
    this.measurements??=[];
    // Chromium can return the same cached statistics to overlapping requests.
    // Keep one chronological point per timestamp, rather than treating a cached
    // snapshot as a restarted counter or counting it twice.
    const timestamp=(incoming.find(r=>r.kind==='video')||outgoing.find(r=>r.kind==='video')||incoming[0]||outgoing[0])?.timestamp;
    const previous=this.measurements.at(-1);
    const previousTimestamp=previous&&(previous.incoming.find(r=>r.kind==='video')||previous.outgoing.find(r=>r.kind==='video')||previous.incoming[0]||previous.outgoing[0])?.timestamp;
    if(Number.isFinite(timestamp)&&(!Number.isFinite(previousTimestamp)||timestamp>previousTimestamp))this.measurements.push(structuredClone(this.stats));
    if(this.measurements.length>600)this.measurements.shift();
    this.stats.sustained=summarizeStream(this.measurements);
    this.emit();
  }
}





