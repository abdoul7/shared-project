import { createRelay } from './relay.js';

// Separate entry point prevents a missing local certificate from silently
// downgrading the ordinary TLS relay. Deploy only behind managed TLS ingress.
const external = process.env.RELAY_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
if (!external) throw Error('Set RELAY_PUBLIC_URL or provide RENDER_EXTERNAL_URL');
const url = new URL(external);
if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || url.search || url.pathname !== '/') {
  throw Error('Hosted relay requires its exact public HTTPS/WSS origin');
}
url.protocol = 'wss:';
const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid hosted relay port');
const relay = await createRelay({ host: '0.0.0.0', port, scope: url.href, tlsTerminated: true });
console.log('Hosted relay listening behind managed TLS ingress');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await relay.close();
}
process.once('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
process.once('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
