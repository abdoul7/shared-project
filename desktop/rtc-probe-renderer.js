import {PeerSession} from './rtc.js';
import {startTestPattern} from './test-pattern.js';
const frames=[];const samples=[];let captureCount=0;let lastTracks=[];let animation;let sourceFrames=0;let sourceStarted=0;
const originalCapture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async options=>{captureCount++;return originalCapture(options)};
const rtc=new PeerSession({sendControl:(...args)=>window.probeBridge.send(...args),onBulk:(_peer,frame)=>frames.push(frame),onState:state=>{
 const video=document.querySelector('#remote'),sound=document.querySelector('#sound');
 if(video.srcObject!==state.remoteStream){video.srcObject=state.remoteStream;sound.srcObject=state.remoteStream;}
 if(state.phase==='connected'&&state.stats?.incoming?.length)samples.push(structuredClone(state.stats));
}});
window.probeBridge.controls(value=>rtc.handleControl(value).catch(()=>{}));
window.probe={
 resetSamples:()=>{samples.length=0;},
 call:id=>rtc.call(id), accept:()=>rtc.accept(),mute:value=>rtc.mute(value),bulk:id=>rtc.sendBulk(id,{kind:'synthetic-probe',value:'verified direct data'}),
 state:async()=>{await rtc.measure();return {phase:rtc.phase,captureCount,frames:frames.length,muted:rtc.muted,audioEnabled:rtc.localStream?.getAudioTracks()[0]?.enabled,stats:rtc.stats,encodingLimits:rtc.encodingLimits,sourceFrames,sourceElapsedSeconds:sourceStarted?(performance.now()-sourceStarted)/1000:0,localTracksStopped:lastTracks.every(t=>t.readyState==='ended'),samples:samples.length};},
 async share({native=false}={}){
   if(native){const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:2560},height:{ideal:1440},frameRate:{ideal:60}},audio:false});await rtc.share(stream);return stream.getVideoTracks()[0].getSettings();}
   const canvas=document.querySelector('#source'),ctx=canvas.getContext('2d');
   const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
   const pattern=startTestPattern(canvas);sourceStarted=performance.now();
   const request=()=>{sourceFrames=pattern.stats().frames;track.requestFrame();animation=requestAnimationFrame(request);};
   animation=requestAnimationFrame(request);window.stopProbePattern=()=>pattern.stop();await rtc.share(stream);return track.getSettings();
 },
 async finish(){lastTracks=[...(rtc.localStream?.getTracks()||[]),...(rtc.screenStream?.getTracks()||[])];cancelAnimationFrame(animation);window.stopProbePattern?.();await rtc.hangup();return {tracksStopped:lastTracks.every(t=>t.readyState==='ended'),samples};},
};

