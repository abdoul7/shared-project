import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { createRelay } from '../server/relay.js';
import { ChatClient } from '../core/client.js';

const cert = await readFile(new URL('./fixtures/localhost-cert.pem', import.meta.url));
const key = await readFile(new URL('./fixtures/localhost-key.pem', import.meta.url));
const memory = () => { let value; return { load: async () => structuredClone(value), save: async next => { value = structuredClone(next); } }; };

test('hosted HTTP listener must be explicitly scoped; ordinary relay still requires TLS', async () => {
  await assert.rejects(createRelay({}), /TLS certificate/);
  await assert.rejects(createRelay({ tlsTerminated: true }), /explicit public WSS/);
  await assert.rejects(createRelay({ tlsTerminated: true, scope: 'ws://example.test/' }), /WSS scope/);
  await assert.rejects(createRelay({ tlsTerminated: true, scope: 'wss://example.test/', cert, key }), /no local TLS/);
});

test('two verified clients exchange encrypted content through simulated managed TLS ingress', async t => {
  let upstreamPort;
  const sockets = new Set();
  let observedWire = '';
  const ingress = tls.createServer({ cert, key }, socket => {
    sockets.add(socket);
    const upstream = net.connect({ host: '127.0.0.1', port: upstreamPort });
    sockets.add(upstream);
    socket.on('data', data => { observedWire += data.toString(); });
    socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy()); upstream.on('close', () => socket.destroy());
    socket.pipe(upstream); upstream.pipe(socket);
  });
  await new Promise(resolve => ingress.listen(0, '127.0.0.1', resolve));
  const url = `wss://127.0.0.1:${ingress.address().port}/`;
  const relay = await createRelay({ tlsTerminated: true, scope: url });
  upstreamPort = relay.server.address().port;
  const a = await ChatClient.create({ store: memory(), url, ca: cert });
  const b = await ChatClient.create({ store: memory(), url, ca: cert });
  t.after(async () => {
    await a.disconnect(); await b.disconnect(); await relay.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => ingress.close(resolve));
  });
  await a.addContact(b.contactCard()); await b.addContact(a.contactCard());
  await Promise.all([a.connect(), b.connect()]);
  await new Promise(resolve => setTimeout(resolve, 100));
  const secret = 'synthetic-hosted-private-content';
  const id = await a.send(b.contactCard().id, secret);
  for (let i = 0; i < 200 && !a.state().history.some(m => m.id === id && m.status === 'delivered'); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(b.state().history.some(m => m.id === id && m.text === secret));
  assert.ok(a.state().history.some(m => m.id === id && m.status === 'delivered'));
  assert.equal(observedWire.includes(secret), false);
});
