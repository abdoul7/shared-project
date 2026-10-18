// Invoke with: node node_modules/electron/cli.js scripts/rtc-probe.mjs
import {app,BrowserWindow,ipcMain,session} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {ChatClient} from '../core/client.js';
import {createRelay} from '../server/relay.js';
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const probePath=path.resolve('desktop/rtc-probe.html');const probeURL=pathToFileURL(probePath).href;const windows=[],clients=[];let relay;
const memory=()=>{let saved;return {load:async()=>structuredClone(saved),save:async x=>{saved=structuredClone(x)}}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,seconds=20){for(let n=0;n<seconds*10;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+label);}
const run=(i,code)=>windows[i].webContents.executeJavaScript(code,true);
const state=i=>run(i,'window.probe.state()');
function check(value,message){if(!value)throw Error(message);}
app.whenReady().then(async()=>{
try{
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(windows.some(w=>w.webContents===contents)&&contents.getURL()===probeURL&&permission==='media'&&(details.mediaTypes||[]).every(x=>x==='audio')));
 session.defaultSession.setPermissionCheckHandler((contents,permission)=>windows.some(w=>w.webContents===contents)&&contents.getURL()===probeURL&&permission==='media');
 const cert=await readFile('test/fixtures/localhost-cert.pem');relay=await createRelay({cert,key:await readFile('test/fixtures/localhost-key.pem')});
 for(let i=0;i<2;i++)clients.push(await ChatClient.create({url:relay.url,ca:cert,store:memory()}));
 await clients[0].addContact(clients[1].contactCard());await clients[1].addContact(clients[0].contactCard());await Promise.all(clients.map(c=>c.connect()));await delay(200);
 ipcMain.handle('rtc-probe-send',(event,peer,namespace,data)=>{const i=windows.findIndex(w=>w.webContents===event.sender);if(i<0||event.senderFrame.url!==probeURL)throw Error('Invalid probe sender');return clients[i].sendControl(peer,namespace,data)});
 for(let i=0;i<2;i++){
  const window=new BrowserWindow({width:900,height:650,show:true,title:'Stillroom synthetic RTC probe '+i,webPreferences:{preload:path.resolve('desktop/rtc-probe-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});windows.push(window);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  clients[i].subscribeControls(value=>window.webContents.send('rtc-probe-control',value));await window.loadFile(probePath);await until(()=>run(i,'!!window.probe'),'probe module');
 }
 await run(0,`window.probe.call(${JSON.stringify(clients[1].contactCard().id)})`);
 await until(async()=>(await state(1)).phase==='ringing','incoming ring');
 check((await state(1)).captureCount===0,'Incoming microphone captured before consent');
 await run(1,'window.probe.accept()');await until(async()=>(await state(0)).phase==='connected'&&(await state(1)).phase==='connected','peer connection');
 await delay(2000);const audioBefore=await state(1);check(audioBefore.stats?.incoming?.some(x=>x.kind==='audio'&&x.bytes>0),'No real received audio bytes');
 await run(0,'window.probe.mute(true)');check((await state(0)).audioEnabled===false,'Mute failed');await run(0,'window.probe.mute(false)');check((await state(0)).audioEnabled===true,'Unmute failed');
 await run(0,`window.probe.bulk(${JSON.stringify(clients[1].contactCard().id)})`);await until(async()=>(await state(1)).frames===1,'direct file channel');
 const source=await run(0,'window.probe.share()');const start=Date.now();const initial=await state(1);await delay(30000);const final=await state(1);const sender=await state(0);const a=await run(0,'window.probe.finish()');await until(async()=>(await state(1)).phase==='idle','remote hangup');const b=await run(1,'window.probe.finish()');
 check(a.tracksStopped&&b.tracksStopped,'Media tracks did not stop');
 const video=final.stats?.incoming?.find(x=>x.kind==='video');check(video?.framesDecoded>0,'No received video frames');
 const baseline=initial.stats?.incoming?.find(x=>x.kind==='video');const duration=(Date.now()-start)/1000;
 const result={success:true,testOnly:true,source:'animated canvas captureStream; Chromium fake audio device',network:'same host peer WebRTC; authenticated E2EE signalling over local validated TLS relay; no TURN',versions:process.versions,hardware:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},checks:{noMicBeforeAcceptance:true,audioReceived:true,muteAndUnmute:true,directData:true,tracksStopped:true},requested:{width:2560,height:1440,fps:60},sourceSettings:{width:source.width,height:source.height,frameRate:source.frameRate},durationSeconds:duration,receiver:video,sender:sender.stats?.outgoing,encodingLimits:sender.encodingLimits,receiverAverageFps:(video.framesDecoded-(baseline?.framesDecoded||0))/duration,receiverBitrateBps:8*(video.bytes-(baseline?.bytes||0))/duration,rtt:final.stats.rtt,sampleCount:b.samples.length,limitations:['Synthetic canvas is not native desktop capture.','Local host is not two physical computers or an external network.','No independent security audit or 1440p60 guarantee.']};
 await mkdir('.local',{recursive:true});await writeFile('.local/rtc-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await mkdir('.local',{recursive:true});await writeFile('.local/rtc-results.json',JSON.stringify({success:false,error:error.message}));console.error(error);process.exitCode=1;
}finally{for(const c of clients)await c.disconnect();if(relay)await relay.close();for(const w of windows)w.destroy();app.exit(process.exitCode||0);}
});




