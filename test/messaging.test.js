import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';
import {ChatClient} from '../core/client.js';
import {createRelay} from '../server/relay.js';
import {ready,identity,card,seal,open,verify,envelopeBody,sign,challenge} from '../core/protocol.js';
const cert=await readFile(new URL('./fixtures/localhost-cert.pem',import.meta.url));
const key=await readFile(new URL('./fixtures/localhost-key.pem',import.meta.url));
function memory(){let snapshot;return {load:async()=>structuredClone(snapshot),save:async v=>{snapshot=structuredClone(v);}};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await delay(30);}assert.fail('State did not converge');}
async function setup(t){const relay=await createRelay({cert,key});const clients=[];t.after(async()=>{await Promise.all(clients.map(c=>c.disconnect()));await relay.close();});return {relay,async client(store=memory()){const c=await ChatClient.create({store,url:relay.url,ca:cert});clients.push(c);return c;}};}
test('two independent clients persist history, require peer receipt, retry offline and deduplicate',async t=>{
 const {client}=await setup(t),aliceStore=memory(),bobStore=memory();let a=await client(aliceStore),b=await client(bobStore);
 await a.addContact(b.contactCard());await b.addContact(a.contactCard());await Promise.all([a.connect(),b.connect()]);
 const id=await a.send(b.contactCard().id,'a private hello');await until(()=>a.state().history[0]?.status==='delivered');
 assert.equal(b.state().history[0].text,'a private hello');assert.equal(a.state().outbox.length,0);
 await b.disconnect();const offline=await a.send(b.contactCard().id,'survives offline');assert.equal(a.state().history.at(-1).status,'pending');
 await a.disconnect();a=await client(aliceStore);b=await client(bobStore);assert.equal(b.state().history.length,1);
 await Promise.all([a.connect(),b.connect()]);await a.retry(offline);await until(()=>a.state().outbox.length===0);
 assert.equal(b.state().history.length,2);assert.equal(a.state().history.find(x=>x.id===id).status,'delivered');
 const envelope=structuredClone((await aliceStore.load()).history);
 assert.equal(envelope.length,2);
});
test('duplicate pending retransmission has one durable history entry and repeat receipt',async t=>{
 const {client}=await setup(t),a=await client(),b=await client();await a.addContact(b.contactCard());await b.addContact(a.contactCard());await Promise.all([a.connect(),b.connect()]);
 // Suppress receipt transmission so retries remain pending, then restore it.
 const original=b.transmit.bind(b);b.transmit=()=>{};
 const id=await a.send(b.contactCard().id,'exactly once in history');await until(()=>b.state().history.length===1);await a.retry(id);await delay(100);assert.equal(b.state().history.length,1);assert.equal(a.state().outbox.length,1);
 b.transmit=original;await a.retry(id);await until(()=>a.state().outbox.length===0);assert.equal(b.state().history.length,1);
});
test('reciprocal approval is required; relay acceptance is never delivery',async t=>{
 const {client}=await setup(t),a=await client(),b=await client();await a.addContact(b.contactCard());await Promise.all([a.connect(),b.connect()]);
 await a.send(b.contactCard().id,'not yet authorized');await delay(150);assert.equal(b.state().history.length,0);assert.equal(a.state().history[0].status,'pending');
 await b.addContact(a.contactCard());await a.retry(a.state().history[0].id);await until(()=>b.state().history.length===1);
});
test('trusted TLS required and plaintext transport rejected',async t=>{
 const {relay}=await setup(t);await assert.rejects(()=>ChatClient.create({store:memory(),url:relay.url.replace('wss:','ws:')}),/WSS/);
 const untrusted=await ChatClient.create({store:memory(),url:relay.url});t.after(()=>untrusted.disconnect());await assert.rejects(()=>untrusted.connect(),/trusted TLS|disconnected/);
});
test('authenticated encryption rejects tampered ciphertext, sender, recipient and signature',async()=>{
 await ready;const a=identity(),b=identity(),c=identity();const payload={v:1,from:card(a).id,to:card(b).id,id:'test',type:'message',text:'secret'};
 const e=seal(payload,a,card(b));assert.equal(open(e,b,card(a)).text,'secret');assert.ok(verify(envelopeBody(e),e.signature,a.publicKey));assert.ok(!JSON.stringify(e).includes('secret'));assert.ok(!Buffer.from(e.cipher,'base64').includes(Buffer.from('secret')));
 for(const altered of [{...e,cipher:e.cipher.slice(4)+'AAAA'},{...e,to:card(c).id},{...e,from:card(c).id},{...e,signature:'AAAA'}])assert.throws(()=>open(altered,b,card(a)));
 assert.throws(()=>open(e,c,card(a)));assert.throws(()=>open(e,b,card(c)));
});
test('failed durable save prevents transmission and delivery acknowledgment',async t=>{
 const {client}=await setup(t);const a=await client(),b=await client();await a.addContact(b.contactCard());await b.addContact(a.contactCard());await Promise.all([a.connect(),b.connect()]);
 const save=b.options.store.save;b.options.store.save=async()=>{throw Error('disk failure');};const id=await a.send(b.contactCard().id,'cannot persist');await until(()=>!b.connected);assert.equal(a.state().history[0].status,'pending');assert.equal(b.state().history.length,0);b.options.store.save=save;await b.connect();await a.retry(id);await until(()=>a.state().history[0].status==='delivered');assert.equal(b.state().history.length,1);
});
test('relay rejects unauthenticated traffic and a replayed authentication proof',async t=>{
 const {relay}=await setup(t);const who=identity();
 async function socket(){const ws=new WebSocket(relay.url,{ca:cert});t.after(()=>ws.terminate());const greeting=await new Promise((resolve,reject)=>{ws.once('message',x=>resolve(JSON.parse(x)));ws.once('error',reject);});return {ws,greeting};}
 const first=await socket();const proof={type:'authenticate',card:card(who),signature:sign(challenge(first.greeting.scope,first.greeting.nonce),who)};
 const authenticated=new Promise(r=>first.ws.once('message',x=>r(JSON.parse(x))));first.ws.send(JSON.stringify(proof));assert.equal((await authenticated).type,'ready');
 const second=await socket();const replayClosed=new Promise(r=>second.ws.once('close',code=>r(code)));second.ws.send(JSON.stringify(proof));assert.equal(await replayClosed,1008);
 const third=await socket();const unauthClosed=new Promise(r=>third.ws.once('close',code=>r(code)));third.ws.send(JSON.stringify({type:'envelope',envelope:{}}));assert.equal(await unauthClosed,1008);
});
test('automatic reconnect restores authenticated connection and pending delivery',async t=>{
 const {client}=await setup(t),a=await client(),b=await client();await a.addContact(b.contactCard());await b.addContact(a.contactCard());await Promise.all([a.connect(),b.connect()]);
 b.socket.terminate();await until(()=>!b.connected);const id=await a.send(b.contactCard().id,'after network interruption');await until(()=>b.connected&&a.state().history.find(x=>x.id===id)?.status==='delivered');assert.equal(b.state().history.length,1);
});
test('unconfirmed delivery becomes retryable failed state and receipt wins after retry',async t=>{
 const {relay,client}=await setup(t);const a=await ChatClient.create({store:memory(),url:relay.url,ca:cert,deliveryTimeoutMs:20});t.after(()=>a.disconnect());const b=await client();await a.addContact(b.contactCard());await b.addContact(a.contactCard());await a.connect();
 const id=await a.send(b.contactCard().id,'delivery not yet confirmed');await delay(30);a.flush();await until(()=>a.state().history[0].status==='failed');assert.equal(a.state().outbox.length,1);
 await a.retry(id);assert.equal(a.state().history[0].status,'pending');await b.connect();await a.retry(id);await until(()=>a.state().history[0].status==='delivered');assert.equal(a.state().outbox.length,0);
});
