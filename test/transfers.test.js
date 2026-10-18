import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createTransferEngine, TRANSFER_CHUNK_BYTES } from '../core/transfers.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stillroom-transfers-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const frames = []; const snapshots = {};
  const stores = Object.fromEntries(['a', 'b'].map(id => [id, { load: async () => structuredClone(snapshots[id]), save: async value => { snapshots[id] = structuredClone(value); } }]));
  const make = id => createTransferEngine({ directory: path.join(root, id), store: stores[id], send: async (peer, frame) => { frames.push({ from: id, to: peer, frame: structuredClone(frame) }); } });
  const engines = { a: await make('a'), b: await make('b') };
  t.after(async () => { await engines.a.close(); await engines.b.close(); });
  async function step() { const item = frames.shift(); if (item) await engines[item.to].receive(item.from, item.frame); return item; }
  async function drain() { while (frames.length) await step(); }
  const source = path.join(root, 'source.bin'), destination = path.join(root, 'received.bin');
  return { root, frames, snapshots, stores, make, engines, step, drain, source, destination };
}

test('encrypted streaming file transfer, exact contents and bounded frame size', async t => {
  const f = await fixture(t);
  const data = Buffer.alloc(1024 * 1024 + 3, 137); await fs.writeFile(f.source, data);
  const id = await f.engines.a.offer('b', f.source); await f.drain();
  await f.engines.b.accept(id, f.destination);
  while (f.frames.length) { assert.ok(JSON.stringify(f.frames[0].frame).length < 32 * 1024); await f.step(); }
  assert.deepEqual(await fs.readFile(f.destination), data);
  assert.equal(f.engines.a.state()[0].status, 'complete');
  assert.equal(f.engines.b.state()[0].status, 'complete');
  assert.equal(f.engines.b.state()[0].offset, data.length);
  assert.equal(JSON.stringify(f.engines.a.state()).includes(f.snapshots.a.transfers[0].key), false);
});

test('durable encrypted partial survives both process recreations and resumes', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, Buffer.alloc(TRANSFER_CHUNK_BYTES * 5 + 7, 45));
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination);
  await f.step(); await f.step(); // accept and durable first chunk; ack lost
  assert.equal(f.engines.b.state()[0].offset, TRANSFER_CHUNK_BYTES);
  const spool = await fs.readFile(path.join(f.root, 'b', `${id}.cipherpart`));
  assert.equal(spool.includes(Buffer.alloc(128, 45)), false);
  // Simulate a crash after append but before committing the metadata offset.
  await fs.appendFile(path.join(f.root, 'b', `${id}.cipherpart`), Buffer.alloc(91, 255));
  f.frames.length = 0;
  await f.engines.a.close(); await f.engines.b.close();
  f.engines.a = await f.make('a'); f.engines.b = await f.make('b');
  await f.engines.a.retry(id); await f.drain();
  assert.deepEqual(await fs.readFile(f.source), await fs.readFile(f.destination));
});

test('source changed after authenticated offer fails final integrity without publishing', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, Buffer.alloc(90000, 17));
  const id = await f.engines.a.offer('b', f.source); await f.drain();
  await fs.writeFile(f.source, Buffer.alloc(90000, 18));
  await f.engines.b.accept(id, f.destination);
  await assert.rejects(f.drain(), /integrity/);
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' });
});

test('tampered chunks fail closed, retry recovers and final destination never overwrites', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, Buffer.alloc(40000, 9));
  const id = await f.engines.a.offer('b', f.source); await f.drain();
  await fs.writeFile(f.destination, 'keep');
  await assert.rejects(f.engines.b.accept(id, f.destination), /already exists/);
  assert.equal(await fs.readFile(f.destination, 'utf8'), 'keep'); await fs.unlink(f.destination);
  await f.engines.b.accept(id, f.destination); await f.step();
  const frame = f.frames.shift(); const cipher = Buffer.from(frame.frame.data, 'base64'); cipher[3] ^= 1; frame.frame.data = cipher.toString('base64');
  await assert.rejects(f.engines.b.receive('a', frame.frame));
  assert.equal(f.engines.b.state()[0].offset, 0);
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' });
  await f.engines.b.retry(id); await f.drain();
  assert.deepEqual(await fs.readFile(f.destination), await fs.readFile(f.source));
});

test('untrusted filenames sanitized; wrong peer refused; cancellation removes only own partial', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, 'private test content');
  const id = await f.engines.a.offer('b', f.source);
  f.frames[0].frame.name = '../../evil.exe'; await f.drain();
  assert.equal(/[\\/]/.test(f.engines.b.state()[0].name), false);
  await assert.rejects(f.engines.b.receive('stranger', { transfer: 1, id, type: 'cancel' }), /Wrong/);
  await f.engines.b.accept(id, f.destination); f.frames.length = 0;
  await f.engines.b.cancel(id); await f.drain();
  assert.equal(f.engines.a.state()[0].status, 'cancelled');
  await assert.rejects(fs.stat(path.join(f.root, 'b', `${id}.cipherpart`)), { code: 'ENOENT' });
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' });
});

test('storage failure never acknowledges uncommitted bytes', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, Buffer.alloc(40000, 51));
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination); await f.step();
  const save = f.stores.b.save; let once = true;
  f.stores.b.save = async value => { if (once) { once = false; throw Error('Disk full'); } await save(value); };
  await assert.rejects(f.step(), /Disk full/);
  assert.equal(f.engines.b.state()[0].offset, 0); assert.equal(f.frames.length, 0);
  await f.engines.b.retry(id); await f.drain();
  assert.equal(f.engines.b.state()[0].status, 'complete');
});

test('zero byte file verified and existing destination appearing during transfer remains intact', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, '');
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination);
  await fs.writeFile(f.destination, 'race winner');
  await assert.rejects(f.drain(), { code: 'EEXIST' });
  assert.equal(await fs.readFile(f.destination, 'utf8'), 'race winner');
});

test('retry recovers verified publication after protected completion snapshot fails', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, 'published file');
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination);
  const save = f.stores.b.save; let once = true;
  f.stores.b.save = async value => {
    if (once && value.transfers[0].status === 'complete') { once = false; throw Error('Completion save failed'); }
    await save(value);
  };
  await assert.rejects(f.drain(), /Completion save failed/);
  assert.equal(await fs.readFile(f.destination, 'utf8'), 'published file');
  await f.engines.b.retry(id); await f.drain();
  assert.equal(f.engines.a.state()[0].status, 'complete');
  assert.equal(f.engines.b.state()[0].status, 'complete');
});

test('failure during staged publication never exposes a partial final destination', async t => {
  const f = await fixture(t); await fs.writeFile(f.source, Buffer.alloc(TRANSFER_CHUNK_BYTES * 3, 29));
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination);
  const save = f.stores.b.save; let once = true;
  f.stores.b.save = async value => {
    await save(value);
    if (once && value.transfers[0].publicationTemp) {
      once = false;
      await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' });
      const file = path.join(f.root, 'b', `${id}.cipherpart`);
      const bytes = await fs.readFile(file); bytes[bytes.length - 1] ^= 1; await fs.writeFile(file, bytes);
    }
  };
  await assert.rejects(f.drain());
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' });
  assert.equal((await fs.readdir(f.root)).some(entry => entry.startsWith('.stillroom-')), false);
});

test('multi GiB streaming benchmark (explicit opt in)', { skip: !process.env.STILLROOM_LARGE_TRANSFER }, async t => {
  const f = await fixture(t); const size = Number(process.env.STILLROOM_LARGE_TRANSFER);
  assert.ok(Number.isSafeInteger(size) && size >= 2 * 1024 ** 3);
  const handle = await fs.open(f.source, 'w'); const block = Buffer.alloc(1024 ** 2, 83); const expected = createHash('sha256');
  for (let offset = 0; offset < size; offset += block.length) { const bytes = block.subarray(0, Math.min(block.length, size - offset)); await handle.writeFile(bytes); expected.update(bytes); } await handle.close();
  const start = Date.now(); let peakRss = process.memoryUsage().rss;
  const id = await f.engines.a.offer('b', f.source); await f.drain(); await f.engines.b.accept(id, f.destination);
  let count = 0; while (f.frames.length) {
    await f.step();
    if (++count % 512 === 0) peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (count % 16384 === 0) console.log(`Transfer benchmark: ${f.engines.b.state()[0].offset}/${size} durable bytes`);
  }
  const got = createHash('sha256'); const output = await fs.open(f.destination, 'r'); for await (const bytes of output.createReadStream()) got.update(bytes); await output.close();
  assert.equal(got.digest('hex'), expected.digest('hex'));
  t.diagnostic(JSON.stringify({ size, durationMs: Date.now() - start, peakRss, chunkBytes: TRANSFER_CHUNK_BYTES }));
});
