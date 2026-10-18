import {PeerSession} from './rtc.js';
const frames=[];const samples=[];let captureCount=0;let lastTracks=[];let animation;
const originalCapture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async options=>{captureCount++;return originalCapture(options)};
const rtc=new PeerSession({sendControl:(...args)=>window.probeBridge.send(...args),onBulk:(_peer,frame)=>frames.push(frame),onState:state=>{
 const video=document.querySelector('#remote'),sound=document.querySelector('#sound');
 if(video.srcObject!==state.remoteStream){video.srcObject=state.remoteStream;sound.srcObject=state.remoteStream;}
 if(state.phase==='connected'&&state.stats?.incoming?.length)samples.push(structuredClone(state.stats));
}});
window.probeBridge.controls(value=>rtc.handleControl(value).catch(()=>{}));
window.probe={
 call:id=>rtc.call(id), accept:()=>rtc.accept(),mute:value=>rtc.mute(value),bulk:id=>rtc.sendBulk(id,{kind:'synthetic-probe',value:'verified direct data'}),
 state:()=>({phase:rtc.phase,captureCount,frames:frames.length,muted:rtc.muted,audioEnabled:rtc.localStream?.getAudioTracks()[0]?.enabled,stats:rtc.stats,encodingLimits:rtc.encodingLimits,localTracksStopped:lastTracks.every(t=>t.readyState==='ended'),samples:samples.length}),
 async share(){const canvas=document.querySelector('#source'),ctx=canvas.getContext('2d');let n=0;animation=setInterval(()=>{ctx.fillStyle=n++%2?'#416953':'#d8e3d8';ctx.fillRect(0,0,2560,1440);ctx.fillStyle='#17291e';ctx.font='96px sans-serif';ctx.fillText('Synthetic test '+n,100,200);ctx.fillRect((n*17)%2400,500,120,120);},16);const stream=canvas.captureStream(60);await rtc.share(stream);return stream.getVideoTracks()[0].getSettings();},
 async finish(){lastTracks=[...(rtc.localStream?.getTracks()||[]),...(rtc.screenStream?.getTracks()||[])];clearInterval(animation);await rtc.hangup();return {tracksStopped:lastTracks.every(t=>t.readyState==='ended'),samples};},
};

