import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {ready,validateCard,verify,challenge,envelopeBody} from '../core/protocol.js';
export async function createRelay({cert,key,host='127.0.0.1',port=0,scope}) {
 await ready;
 if(!cert || !key) throw Error('TLS certificate and private key required');
 if(scope && new URL(scope).protocol!=='wss:')throw Error('WSS scope required');
 const server=https.createServer({cert,key},(_,res)=>{res.writeHead(200);res.end('Private relay');});
 const wss=new WebSocketServer({server,maxPayload:64*1024});
 const peers=new Map();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.alive===false){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
 const url=new URL(scope || `wss://${host}:${server.address().port}`).href;
 if(!url.startsWith('wss://'))throw Error('WSS scope required');
 wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
  const nonce=randomBytes(32).toString('base64'); let self=null; let approved=new Set();let windowStart=Date.now(),frames=0;
  const timeout=setTimeout(()=>ws.close(1008,'Authentication required'),10000);
  ws.send(JSON.stringify({type:'challenge',scope:url,nonce}));
  ws.on('message',raw=>{try {
   if(Date.now()-windowStart>10000){windowStart=Date.now();frames=0;}
   if(++frames>300)throw Error();
   const m=JSON.parse(raw);
   if(!self) {
    if(m.type!=='authenticate') throw Error();
    const c=validateCard(m.card);
    if(!verify(challenge(url,nonce),m.signature,c.publicKey)) throw Error();
    self=c; clearTimeout(timeout); peers.get(c.id)?.ws.close(1008,'Replaced'); peers.set(c.id,{ws,card:c,get approved(){return approved;}});
    ws.send(JSON.stringify({type:'ready'})); return;
   }
   if(m.type==='allowlist') {
    const body={v:1,type:'allowlist',ids:m.ids,nonce};
    if(!Array.isArray(m.ids)||m.ids.length>1000||!m.ids.every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x))||!verify(body,m.signature,self.publicKey)) throw Error();
    approved=new Set(m.ids); return;
   }
   if(m.type==='envelope') {
    const e=m.envelope, target=peers.get(e.to);
    if(e.from!==self.id || e.v!==1 || typeof e.id!=='string'||!/^[a-f0-9-]{36}$/.test(e.id)||typeof e.cipher!=='string'||e.cipher.length>48000||!verify(envelopeBody(e),e.signature,self.publicKey)) throw Error();
    if(target&&approved.has(e.to)&&target.approved.has(self.id)&&target.ws.readyState===WebSocket.OPEN&&target.ws.bufferedAmount<256*1024) target.ws.send(JSON.stringify({type:'envelope',envelope:e}));
    return;
   }
   throw Error();
  } catch { ws.close(1008,'Invalid protocol message'); }});
  ws.on('close',()=>{clearTimeout(timeout);if(self&&peers.get(self.id)?.ws===ws)peers.delete(self.id);});
  ws.on('error',()=>{});
 });
 return {url,server,async close(){clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const {RELAY_TLS_CERT,RELAY_TLS_KEY,RELAY_PUBLIC_URL}=process.env;
 if(!RELAY_PUBLIC_URL?.startsWith('wss://'))throw Error('Set RELAY_PUBLIC_URL to the exact client WSS URL');
 await createRelay({cert:await readFile(RELAY_TLS_CERT),key:await readFile(RELAY_TLS_KEY),host:process.env.RELAY_HOST||'127.0.0.1',port:Number(process.env.RELAY_PORT||8443),scope:RELAY_PUBLIC_URL});
 console.log('TLS relay listening');
}
