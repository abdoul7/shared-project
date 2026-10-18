import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createRelay } from '../server/relay.js';
import electron from 'electron';
const directory = path.resolve('.local', 'desktop-pair-' + randomUUID());
await mkdir(directory, { recursive: true });
const certPath = path.resolve('test/fixtures/localhost-cert.pem');
const relay = await createRelay({ cert: await readFile(certPath), key: await readFile('test/fixtures/localhost-key.pem') });
const children = [];
try {
  const results = await Promise.all(['a','b'].map(async role => {
    const output = path.join(directory, role + '.json');
    const child = spawn(electron, [path.resolve('desktop/main.js'), process.argv.includes('--ui') ? '--smoke-ui-pair' : '--smoke-pair'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, STILLROOM_PROFILE: 'pair-' + path.basename(directory) + '-' + role, STILLROOM_PAIR_ROLE: role, STILLROOM_PAIR_URL: relay.url, STILLROOM_PAIR_CA: certPath, STILLROOM_PAIR_DIRECTORY: directory, STILLROOM_SMOKE_OUTPUT: output } });
    children.push(child);
    const exitCode = await new Promise((resolve, reject) => { const timeout = setTimeout(() => { child.kill(); reject(new Error('Desktop pair timed out')); }, 45000); child.once('error', e => { clearTimeout(timeout); reject(e); }); child.once('exit', code => { clearTimeout(timeout); resolve(code); }); });
    const result = JSON.parse(await readFile(output, 'utf8'));
    if (exitCode !== 0 || !result.success || !result.plaintextAbsent) throw new Error('Desktop pair failed');
    return result;
  }));
  await writeFile(path.resolve('.local/desktop-pair-results.json'), JSON.stringify({ independentProcesses: true, results }, null, 2));
  console.log(JSON.stringify({ independentProcesses: true, results }));
} finally { for (const child of children) if (child.exitCode === null) child.kill(); await relay.close(); }
