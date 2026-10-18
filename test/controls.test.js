import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ChatClient } from '../core/client.js';
import { seal } from '../core/protocol.js';
import { createRelay } from '../server/relay.js';
const cert = await readFile(new URL('./fixtures/localhost-cert.pem', import.meta.url));
const key = await readFile(new URL('./fixtures/localhost-key.pem', import.meta.url));
const memory = () => { let snapshot; return {load: async()=>structuredClone(snapshot),save:async v=>{snapshot=structuredClone(v)}}; };
test('encrypted live controls authenticate peers, reject replay and stale controls without persisting content', async t => {
 const relay=await createRelay({cert,key});
 const storeA=memory(), storeB=memory();
 const a=await ChatClient.create({store:storeA,url:relay.url,ca:cert});
 const b=await ChatClient.create({store:storeB,url:relay.url,ca:cert});
 t.after(async()=>{await a.disconnect();await b.disconnect();await relay.close()});
 await a.addContact(b.contactCard());await b.addContact(a.contactCard());
 await Promise.all([a.connect(),b.connect()]);
 await new Promise(r=>setTimeout(r,100));
 const received=[];b.subscribeControls(x=>received.push(x));
 await a.sendControl(b.contactCard().id,'rtc',{type:'offer',sdp:'private-live-sdp'});
 for(let i=0;i<100&&!received.length;i++) await new Promise(r=>setTimeout(r,20));
 assert.equal(received.length,1);assert.equal(received[0].data.sdp,'private-live-sdp');
 assert.equal(received[0].from,a.contactCard().id);
 for(const store of [storeA,storeB]) {const saved=await store.load();assert.equal(saved.history.length,0);assert.equal(saved.outbox.length,0);assert.ok(!JSON.stringify(saved).includes('private-live-sdp'));}
 const payload={v:1,from:a.contactCard().id,to:b.contactCard().id,id:randomUUID(),type:'control',namespace:'transfer',data:{event:'probe'},sentAt:Date.now()};
 const envelope=seal(payload,a.data.identity,b.contactCard());
 await b.receive(envelope);await b.receive(envelope);assert.equal(received.length,2);
 const expired=seal({...payload,id:randomUUID(),sentAt:Date.now()-61000},a.data.identity,b.contactCard());
 await b.receive(expired);assert.equal(received.length,2);
 const future=seal({...payload,id:randomUUID(),sentAt:Date.now()+11000},a.data.identity,b.contactCard());
 await b.receive(future);assert.equal(received.length,2);
 await assert.rejects(b.receive({...envelope,signature:envelope.signature.replace(/^./,envelope.signature[0]==='A'?'B':'A')}));
 await assert.rejects(a.sendControl(b.contactCard().id,'invalid',{}));
 await assert.rejects(a.sendControl(b.contactCard().id,'rtc',{value:'x'.repeat(32768)}));
 await assert.rejects(a.sendControl('0'.repeat(64),'rtc',{}));
});

