import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { createRelay } from '../server/relay.js';
import electron from 'electron';

const directory = path.resolve('.local', 'features-pair-' + randomUUID());
const relayOnly = process.argv.includes('--relay-only');
const skipSharing = process.argv.includes('--skip-sharing');
await mkdir(directory, { recursive: true });
const source = path.join(directory, 'synthetic-source.bin'), destination = path.join(directory, 'received.bin');
const bytes = Buffer.alloc(192 * 1024); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 251;
await writeFile(source, bytes);
const digest = value => createHash('sha256').update(value).digest('hex');
const certPath = path.resolve('test/fixtures/localhost-cert.pem');
const relay = await createRelay({ cert: await readFile(certPath), key: await readFile('test/fixtures/localhost-key.pem') });
const children = [];
let summary;
try {
  const results = await Promise.all(['a', 'b'].map(async role => {
    const output = path.join(directory, role + '.json');
    const child = spawn(electron, [path.resolve('desktop/main.js'), '--smoke-features'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, STILLROOM_PROFILE: 'feature-' + randomUUID().replaceAll('-', '') + '-' + role, STILLROOM_PAIR_ROLE: role, STILLROOM_PAIR_URL: relay.url, STILLROOM_PAIR_CA: certPath, STILLROOM_PAIR_DIRECTORY: directory, STILLROOM_FEATURE_SOURCE: source, STILLROOM_FEATURE_DESTINATION: destination, STILLROOM_TEST_RELAY_ONLY: relayOnly ? '1' : '0', STILLROOM_TEST_SKIP_SHARING: skipSharing ? '1' : '0', STILLROOM_SMOKE_OUTPUT: output } });
    children.push(child);
    let processError;
    const exitCode = await new Promise(resolve => {
      const timer = setTimeout(() => { processError = 'Feature desktop timed out'; child.kill(); resolve(null); }, 45000);
      child.once('error', () => { clearTimeout(timer); processError = 'Electron could not launch'; resolve(null); }); child.once('exit', code => { clearTimeout(timer); resolve(code); });
    });
    let result; try { result = JSON.parse(await readFile(output, 'utf8')); } catch { result = { role, success: false, error: 'No result produced' }; }
    return { exitCode, ...result, ...(processError ? { processError } : {}) };
  }));
  let exactFile = false; try { exactFile = digest(await readFile(destination)) === digest(bytes); } catch {}
  summary = { independentProductionWindows: true, relayOnly, sharingRequired: !relayOnly && !skipSharing, fakeMicrophone: !relayOnly, exactFile, testedBytes: bytes.length, sourceSha256: digest(bytes), results, success: exactFile && results.every(r => r.success && r.exitCode === 0) };
  await writeFile(path.resolve(relayOnly ? '.local/features-relay-results.json' : '.local/features-results.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (!summary.success) process.exitCode = 1;
} finally { for (const child of children) if (child.exitCode === null) child.kill(); await relay.close(); }
