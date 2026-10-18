// Invoke with: node node_modules/electron/cli.js scripts/rtc-probe.mjs
import {app,BrowserWindow,ipcMain,session,desktopCapturer,screen} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {ChatClient} from '../core/client.js';
import {createRelay} from '../server/relay.js';
import {summarizeStream} from '../desktop/stream-metrics.js';
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const nativeCapture=process.argv.includes('--native');
const senderIndex=process.argv.includes('--reverse')?1:0, receiverIndex=1-senderIndex;
if(nativeCapture)app.commandLine.appendSwitch('force-device-scale-factor','1');
const seconds=Number(process.env.STILLROOM_RTC_SECONDS||30);
if(!Number.isFinite(seconds)||seconds<10||seconds>600)throw Error('RTC test duration must be between 10 and 600 seconds');
const warmupSeconds=Number(process.env.STILLROOM_RTC_WARMUP_SECONDS||10);
if(!Number.isFinite(warmupSeconds)||warmupSeconds<0||warmupSeconds>120)throw Error('Invalid RTC warmup duration');
const outputPath=`.local/rtc-${nativeCapture?'native':'canvas'}${senderIndex?'-reverse':''}-results.json`;
const probePath=path.resolve('desktop/rtc-probe.html');const probeURL=pathToFileURL(probePath).href;const windows=[],clients=[];let relay;
let nativeWindow,captureSource;
const memory=()=>{let saved;return {load:async()=>structuredClone(saved),save:async x=>{saved=structuredClone(x)}}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,seconds=20){for(let n=0;n<seconds*10;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+label);}
const run=(i,code)=>windows[i].webContents.executeJavaScript(code,true);
const state=i=>run(i,'window.probe.state()');
function check(value,message){if(!value)throw Error(message);}
app.whenReady().then(async()=>{
try{
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(windows.some(w=>w.webContents===contents)&&contents.getURL()===probeURL&&((permission==='media'&&(details.mediaTypes||[]).every(x=>x==='audio'))||(nativeCapture&&permission==='display-capture'))));
 session.defaultSession.setPermissionCheckHandler((contents,permission)=>windows.some(w=>w.webContents===contents)&&contents.getURL()===probeURL&&(permission==='media'||(nativeCapture&&permission==='display-capture')));
 session.defaultSession.setDisplayMediaRequestHandler((request,callback)=>callback(nativeCapture&&request.frame===windows[senderIndex]?.webContents.mainFrame&&request.frame.url===probeURL&&captureSource?{video:captureSource}:{}));
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
 await delay(2000);for(const i of [0,1]){const audioBefore=await state(i);check(audioBefore.stats?.incoming?.some(x=>x.kind==='audio'&&x.bytes>0),'No real received audio bytes on client '+i);}
 await run(0,'window.probe.mute(true)');check((await state(0)).audioEnabled===false,'Mute failed');await run(0,'window.probe.mute(false)');check((await state(0)).audioEnabled===true,'Unmute failed');
 await run(0,`window.probe.bulk(${JSON.stringify(clients[1].contactCard().id)})`);await until(async()=>(await state(1)).frames===1,'direct file channel');
 if(nativeCapture){
   nativeWindow=new BrowserWindow({width:2560,height:1440,useContentSize:true,frame:false,show:false,focusable:false,title:'Stillroom owned 1440p test source',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
   await nativeWindow.loadFile(path.resolve('desktop/stream-test-source.html'));nativeWindow.showInactive();
   nativeWindow.setFullScreen(true);await until(()=>nativeWindow.isFullScreen(),'owned source fullscreen');
   await until(async()=>{captureSource=(await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}})).find(s=>s.id===nativeWindow.getMediaSourceId());return !!captureSource;},'owned native test source');
 }
 const source=await run(senderIndex,`window.probe.share({native:${nativeCapture}})`);await until(async()=>(await state(receiverIndex)).stats?.incoming?.some(r=>r.kind==='video'&&r.framesDecoded>0),'first decoded video');await delay(warmupSeconds*1000);const initial=await state(receiverIndex);await run(receiverIndex,'window.probe.resetSamples()');await delay(seconds*1000);const final=await state(receiverIndex);const sender=await state(senderIndex);const a=await run(senderIndex,'window.probe.finish()');await until(async()=>(await state(receiverIndex)).phase==='idle','remote hangup');const b=await run(receiverIndex,'window.probe.finish()');
 check(a.tracksStopped&&b.tracksStopped,'Media tracks did not stop');
 const video=final.stats?.incoming?.find(x=>x.kind==='video');check(video?.framesDecoded>0,'No received video frames');
 const baseline=initial.stats?.incoming?.find(x=>x.kind==='video');const duration=(video.timestamp-baseline.timestamp)/1000;
 const result={success:true,testOnly:true,source:'animated canvas captureStream; Chromium fake audio device',network:'same host peer WebRTC; authenticated E2EE signalling over local validated TLS relay; no TURN',versions:process.versions,hardware:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},checks:{noMicBeforeAcceptance:true,audioReceived:true,muteAndUnmute:true,directData:true,tracksStopped:true},requested:{width:2560,height:1440,fps:60},sourceSettings:{width:source.width,height:source.height,frameRate:source.frameRate},durationSeconds:duration,receiver:video,sender:sender.stats?.outgoing,encodingLimits:sender.encodingLimits,receiverAverageFps:(video.framesDecoded-(baseline?.framesDecoded||0))/duration,receiverBitrateBps:8*(video.bytes-(baseline?.bytes||0))/duration,rtt:final.stats.rtt,sampleCount:b.samples.length,limitations:['Synthetic canvas is not native desktop capture.','Local host is not two physical computers or an external network.','No independent security audit or 1440p60 guarantee.']};
 result.sourceProducedFps=sender.sourceFrames/sender.sourceElapsedSeconds;result.mediaSources=sender.stats.sources;result.gpuFeatures=app.getGPUFeatureStatus();result.networkPath=final.stats.path;
 if(nativeCapture){const pattern=await nativeWindow.webContents.executeJavaScript('window.testPatternState()');result.source='native capture of exact owned animated 2560x1440 test window';result.sourceProducedFps=pattern.frames/pattern.elapsedSeconds;result.sourceWindowSize={width:nativeWindow.getContentBounds().width,height:nativeWindow.getContentBounds().height};const display=screen.getDisplayMatching(nativeWindow.getBounds());result.display={size:display.size,scaleFactor:display.scaleFactor,refreshRate:display.displayFrequency};result.limitations[0]='Native test-window capture is not arbitrary game/display capture.';}
 result.receiverFreezesDuringWindow=(video.freezeCount||0)-(baseline.freezeCount||0);result.receiverDroppedDuringWindow=(video.framesDropped||0)-(baseline.framesDropped||0);
 const chronological=[{incoming:[baseline]},...b.samples].filter((sample,i,all)=>{const t=sample.incoming?.find(r=>r.kind==='video')?.timestamp;return t!=null&&(i===0||t>all[i-1].incoming?.find(r=>r.kind==='video')?.timestamp);});
 result.sustained=summarizeStream(chronological);result.meets1440p60=result.sustained.targetMet;result.direction=senderIndex?'second client to first':'first client to second';
 result.sampledReceiverRates=b.samples.map(s=>s.incoming?.find(r=>r.kind==='video')?.fps).filter(Number.isFinite);
 result.warmupSeconds=warmupSeconds;result.measurementSamples=b.samples.map(s=>s.incoming?.find(r=>r.kind==='video')).filter(Boolean);
 if(process.argv.includes('--require-target')&&!result.meets1440p60)process.exitCode=1;
 await mkdir('.local',{recursive:true});await writeFile(outputPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await mkdir('.local',{recursive:true});await writeFile(outputPath,JSON.stringify({success:false,error:error.message}));console.error(error);process.exitCode=1;
}finally{for(const c of clients)await c.disconnect();if(relay)await relay.close();for(const w of windows)w.destroy();nativeWindow?.destroy();app.exit(process.exitCode||0);}
});




