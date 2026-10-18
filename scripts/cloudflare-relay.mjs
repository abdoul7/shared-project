import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay } from '../server/relay.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
await mkdir(local, { recursive: true });
const executable = process.env.CLOUDFLARED_PATH || path.join(local, 'tools', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
await access(executable).catch(() => { throw Error('Install the official cloudflared connector; see docs/CLOUDFLARE_RELAY.md'); });

// Choose a currently free loopback port without taking over the existing local
// test relay. If another process wins the bind race, fail instead of exposing it.
const reservation = createServer();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let relay, tunnel, stopped = false;
let live = { status: 'starting', supervisorPid: process.pid, originHost: '127.0.0.1', originPort: port };
const statusFile = path.join(local, 'cloudflare-relay.json');
const save = () => writeFile(statusFile, JSON.stringify(live, null, 2) + '\n');
await save();
async function stop() {
  if (stopped) return;
  stopped = true;
  tunnel?.kill();
  await relay?.close();
  live.status = 'stopped';
  await save();
}
process.once('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
process.once('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));

try {
  const publicUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Cloudflare did not issue a Quick Tunnel URL within 60 seconds')), 60000);
    let tail = '';
    tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--metrics', '127.0.0.1:0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let logWrites = Promise.resolve();
    const observe = bytes => {
      logWrites = logWrites.then(() => appendFile(path.join(local, 'cloudflared.log'), bytes)).catch(() => {});
      tail = (tail + bytes.toString()).slice(-16384);
      const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?=[\s/|]|$)/i);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    };
    tunnel.stdout.on('data', observe); tunnel.stderr.on('data', observe);
    tunnel.once('error', error => { clearTimeout(timer); reject(error); });
    tunnel.once('exit', () => {
      clearTimeout(timer);
      reject(Error('Cloudflare connector exited; see .local/cloudflared.log'));
      if (!stopped) { process.exitCode = 1; stop().catch(() => {}); }
    });
  });
  if (stopped) throw Error('Tunnel stopped during startup');
  const scope = publicUrl.replace('https:', 'wss:') + '/';
  relay = await createRelay({ host: '127.0.0.1', port, scope, tlsTerminated: true });
  if (stopped) { await relay.close(); throw Error('Tunnel stopped while the relay was starting'); }
  live = { ...live, status: 'running', connectorPid: tunnel.pid, publicUrl: publicUrl + '/', wssUrl: scope, startedAt: new Date().toISOString() };
  await save();
  console.log(`Stillroom temporary relay: ${scope}`);
  console.log('Keep this PC awake. Restarting creates a different address. Ctrl+C stops the tunnel and relay.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await stop();
}
