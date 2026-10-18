import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const dirs = ['core', 'server', 'desktop', 'test', 'scripts'];
let count = 0;
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(c?js|mjs)$/.test(path)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
      count++;
    }
  }
}
for (const dir of dirs) await check(dir);
console.log(`Syntax checked ${count} JavaScript files.`);
