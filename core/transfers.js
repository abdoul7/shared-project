import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sodium from 'libsodium-wrappers';

export const TRANSFER_CHUNK_BYTES = 16 * 1024;
const terminal = new Set(['complete', 'cancelled']);
const name = value => {
  let safe = String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180) || 'download';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe;
};
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const aad = (t, offset) => JSON.stringify({ id: t.id, offset, total: t.total });
const encode = bytes => Buffer.from(bytes).toString('base64');
function decode(value, length) {
  if (typeof value !== 'string' || value.length > TRANSFER_CHUNK_BYTES * 2) throw Error('Invalid transfer encoding');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length)) throw Error('Invalid transfer encoding');
  return bytes;
}
async function digest(file) {
  const handle = await fs.open(file, 'r');
  const hash = createHash('sha256');
  try {
    for await (const bytes of handle.createReadStream()) hash.update(bytes);
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

/** The injected store MUST protect keys/path metadata with OS encryption. send resolves
 * after bounded transport enqueue, never after peer processing (which would deadlock).
 * Every received frame must already be authenticated to its supplied peerId. */
export async function createTransferEngine({ directory, send, store, onUpdate = () => {} }) {
  await sodium.ready;
  if (!directory || !store?.load || !store?.save || typeof send !== 'function') throw Error('Protected transfer storage and transport required');
  const root = path.resolve(directory);
  await fs.mkdir(root, { recursive: true });
  const restored = await store.load();
  const items = new Map((restored?.transfers || []).map(t => [t.id, t]));
  let closed = false;
  let queue = Promise.resolve();
  const serial = fn => {
    const result = queue.then(() => {
      if (closed) throw Error('Transfer engine closed');
      return fn();
    });
    queue = result.catch(() => {});
    return result;
  };
  const spool = t => {
    if (!validId(t.id)) throw Error('Invalid transfer ID');
    return path.join(root, `${t.id}.cipherpart`);
  };
  const state = () => [...items.values()].map(t => {
    const bytesPerSecond = t.started
      ? Math.max(0, t.offset - (t.startOffset || 0)) / Math.max(1, (Date.now() - t.started) / 1000)
      : 0;
    return {
      id: t.id, peerId: t.peerId, direction: t.direction, name: t.name,
      total: t.total, offset: t.offset, status: t.status, error: t.error || null,
      bytesPerSecond,
      etaSeconds: bytesPerSecond ? (t.total - t.offset) / bytesPerSecond : null
    };
  });
  const persist = async () => {
    await store.save({ version: 1, transfers: structuredClone([...items.values()]) });
    onUpdate(state());
  };
  const transmit = (t, frame) => send(t.peerId, { transfer: 1, id: t.id, ...frame });
  async function fail(t, error) {
    t.status = 'failed';
    t.error = error.message || 'Transfer failed';
    await persist();
  }
  async function pump(t) {
    if (terminal.has(t.status)) return;
    if (t.offset === t.total) {
      await transmit(t, { type: 'finish', hash: t.hash });
      return;
    }
    const handle = await fs.open(t.source, 'r');
    try {
      const bytes = Buffer.alloc(Math.min(TRANSFER_CHUNK_BYTES, t.total - t.offset));
      const read = await handle.read(bytes, 0, bytes.length, t.offset);
      if (read.bytesRead !== bytes.length) throw Error('Source changed or unavailable');
      const nonce = sodium.randombytes_buf(24);
      const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(bytes, aad(t, t.offset), null, nonce, decode(t.key, 32));
      t.inflightEnd = t.offset + bytes.length;
      await transmit(t, { type: 'chunk', offset: t.offset, nonce: encode(nonce), data: encode(cipher) });
    } finally {
      await handle.close();
    }
  }
  async function reconstruct(t, destination, onCreated) {
    const input = await fs.open(spool(t), 'r');
    let output;
    const hash = createHash('sha256');
    let pos = 0, offset = 0;
    try {
      if (destination) {
        output = await fs.open(destination, 'wx');
        if (onCreated) await onCreated(await output.stat());
      }
      while (offset < t.offset) {
        const header = Buffer.alloc(28);
        if ((await input.read(header, 0, 28, pos)).bytesRead !== 28) throw Error('Incomplete encrypted partial file');
        const length = header.readUInt32BE(0);
        if (length < 17 || length > TRANSFER_CHUNK_BYTES + 16) throw Error('Invalid encrypted partial file');
        const cipher = Buffer.alloc(length);
        if ((await input.read(cipher, 0, length, pos + 28)).bytesRead !== length) throw Error('Incomplete encrypted partial file');
        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, aad(t, offset), header.subarray(4), decode(t.key, 32));
        if (offset + plain.length > t.offset) throw Error('Invalid partial offset');
        hash.update(plain);
        if (output) await output.writeFile(plain);
        offset += plain.length;
        pos += 28 + length;
      }
      if (output) await output.sync();
      return { hash: hash.digest('hex'), size: pos };
    } catch (error) {
      if (output) {
        await output.close();
        output = null;
        await fs.unlink(destination).catch(() => {});
      }
      throw error;
    } finally {
      await input.close();
      if (output) await output.close();
    }
  }
  async function cleanupPublication(t) {
    const owned = t.publicationTemp;
    if (!owned) return;
    if (!t.destination || path.dirname(owned.path) !== path.dirname(t.destination) || !path.basename(owned.path).startsWith(`.stillroom-${t.id}-`)) throw Error('Refusing unsafe publication cleanup');
    let stat;
    try {
      stat = await fs.lstat(owned.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== owned.dev || stat.ino !== owned.ino) throw Error('Refusing foreign publication file');
      await fs.unlink(owned.path);
    }
    delete t.publicationTemp;
    await persist();
  }
  async function beginReceive(t) {
    if (!t.destination) throw Error('Choose an explicit destination first');
    await cleanupPublication(t);
    const committed = await reconstruct(t);
    await fs.truncate(spool(t), committed.size);
    // Publication and protected metadata cannot be one filesystem transaction.
    // Recover a completed explicit destination after a failed completion save,
    // verifying its contents without opening it for writing or replacing it.
    if (t.offset === t.total && committed.hash === t.hash) {
      let exists = false;
      try {
        exists = (await fs.lstat(t.destination)).isFile();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (exists && await digest(t.destination) === t.hash) {
        t.status = 'complete';
        t.error = null;
        await persist();
        await fs.unlink(spool(t)).catch(() => {});
        await transmit(t, { type: 'complete' });
        return;
      }
    }
    t.status = 'receiving';
    t.started = Date.now();
    t.startOffset = t.offset;
    t.error = null;
    await persist();
    await transmit(t, { type: 'accept', offset: t.offset });
  }
  const api = {
    state,
    offer: (peerId, sourcePath) => serial(async () => {
      const source = path.resolve(sourcePath);
      const stat = await fs.stat(source);
      if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw Error('Unsupported source file');
      const t = {
        id: randomUUID(), peerId, direction: 'send', source,
        name: name(path.basename(source)), total: stat.size, offset: 0,
        hash: await digest(source), key: encode(sodium.randombytes_buf(32)), status: 'offered'
      };
      items.set(t.id, t);
      await persist();
      await transmit(t, { type: 'offer', name: t.name, total: t.total, hash: t.hash, key: t.key });
      return t.id;
    }),
    accept: (id, destination) => serial(async () => {
      const t = items.get(id);
      if (!t || t.direction !== 'receive' || terminal.has(t.status) || typeof destination !== 'string' || !path.isAbsolute(destination)) throw Error('Invalid transfer acceptance');
      try {
        await fs.lstat(destination);
        throw Error('Destination already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      t.destination = path.resolve(destination);
      const handle = await fs.open(spool(t), 'wx');
      await handle.close();
      await beginReceive(t);
    }),
    retry: id => serial(async () => {
      const t = items.get(id);
      if (!t || terminal.has(t.status)) throw Error('Transfer unavailable');
      try {
        if (t.direction === 'receive') await beginReceive(t);
        else await transmit(t, { type: 'offer', name: t.name, total: t.total, hash: t.hash, key: t.key });
      } catch (error) {
        await fail(t, error);
        throw error;
      }
    }),
    cancel: id => serial(async () => {
      const t = items.get(id);
      if (!t || terminal.has(t.status)) return;
      t.status = 'cancelled';
      await persist();
      await cleanupPublication(t);
      await fs.unlink(spool(t)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await transmit(t, { type: 'cancel' });
    }),
    receive: (peerId, frame) => serial(async () => {
      if (!frame || frame.transfer !== 1 || !validId(frame.id)) throw Error('Invalid transfer frame');
      let t = items.get(frame.id);
      if (t && t.peerId !== peerId) throw Error('Wrong transfer peer');
      if (frame.type === 'offer') {
        decode(frame.key, 32);
        if (!Number.isSafeInteger(frame.total) || frame.total < 0 || !/^[a-f0-9]{64}$/.test(frame.hash) || typeof frame.name !== 'string' || frame.name.length > 1024) throw Error('Invalid transfer offer');
        if (t) {
          if (t.direction !== 'receive' || t.key !== frame.key || t.hash !== frame.hash || t.total !== frame.total) throw Error('Conflicting transfer offer');
          if (t.status === 'complete') await transmit(t, { type: 'complete' });
          else if (t.destination && !terminal.has(t.status)) await beginReceive(t);
          return;
        }
        t = {
          id: frame.id, peerId, direction: 'receive', name: name(frame.name),
          total: frame.total, offset: 0, hash: frame.hash, key: frame.key, status: 'offered'
        };
        items.set(t.id, t);
        await persist();
        return;
      }
      if (!t || terminal.has(t.status)) return;
      try {
        if (frame.type === 'cancel') {
          t.status = 'cancelled';
          await persist();
          await cleanupPublication(t);
          await fs.unlink(spool(t)).catch(() => {});
          return;
        }
        if (frame.type === 'accept' && t.direction === 'send') {
          if (!Number.isSafeInteger(frame.offset) || frame.offset < 0 || frame.offset > t.total) throw Error('Invalid resume offset');
          t.offset = frame.offset;
          t.status = 'sending';
          t.error = null;
          t.started = Date.now();
          t.startOffset = t.offset;
          await persist();
          await pump(t);
        } else if (frame.type === 'chunk' && t.direction === 'receive' && t.status === 'receiving') {
          if (frame.offset !== t.offset) {
            await transmit(t, { type: 'ack', offset: t.offset });
            return;
          }
          const cipher = decode(frame.data), nonce = decode(frame.nonce, 24);
          const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, aad(t, t.offset), nonce, decode(t.key, 32));
          if (!plain.length || plain.length > TRANSFER_CHUNK_BYTES || t.offset + plain.length > t.total) throw Error('Invalid transfer chunk');
          const handle = await fs.open(spool(t), 'a');
          try {
            const header = Buffer.alloc(28);
            header.writeUInt32BE(cipher.length);
            nonce.copy(header, 4);
            await handle.writeFile(Buffer.concat([header, cipher]));
            await handle.sync();
          } finally {
            await handle.close();
          }
          const previous = t.offset;
          t.offset += plain.length;
          try {
            await persist();
          } catch (error) {
            t.offset = previous;
            const good = await reconstruct(t);
            await fs.truncate(spool(t), good.size);
            throw error;
          }
          await transmit(t, { type: 'ack', offset: t.offset });
        } else if (frame.type === 'ack' && t.direction === 'send') {
          if (!Number.isSafeInteger(frame.offset) || frame.offset < t.offset || frame.offset > t.inflightEnd) throw Error('Invalid transfer acknowledgement');
          if (frame.offset === t.offset) return;
          t.offset = frame.offset;
          await persist();
          await pump(t);
        } else if (frame.type === 'finish' && t.direction === 'receive') {
          if (t.offset !== t.total || frame.hash !== t.hash) throw Error('Incomplete transfer');
          const check = await reconstruct(t);
          if (check.hash !== t.hash) throw Error('File integrity check failed');
          await cleanupPublication(t);
          const publicationPath = path.join(path.dirname(t.destination), `.stillroom-${t.id}-${randomUUID()}.partial`);
          const written = await reconstruct(t, publicationPath, async stat => {
            t.publicationTemp = { path: publicationPath, dev: stat.dev, ino: stat.ino };
            await persist();
          });
          if (written.hash !== t.hash) {
            await cleanupPublication(t);
            throw Error('File integrity check failed');
          }
          const staged = await fs.lstat(publicationPath);
          if (!staged.isFile() || staged.isSymbolicLink() || staged.dev !== t.publicationTemp.dev || staged.ino !== t.publicationTemp.ino) throw Error('Refusing foreign publication file');
          try {
            await fs.link(publicationPath, t.destination);
          } catch (error) {
            await cleanupPublication(t);
            if (['ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EPERM'].includes(error.code)) throw Error('Destination filesystem does not support safe exclusive publication; choose an NTFS destination');
            throw error;
          }
          t.status = 'complete';
          await persist();
          await cleanupPublication(t);
          try {
            await fs.unlink(spool(t));
          } catch (error) {
            if (error.code !== 'ENOENT') {
              t.error = 'Encrypted partial cleanup pending';
              await persist();
            }
          }
          await transmit(t, { type: 'complete' });
        } else if (frame.type === 'complete' && t.direction === 'send') {
          t.offset = t.total;
          t.status = 'complete';
          t.error = null;
          await persist();
        }
      } catch (error) {
        await fail(t, error);
        throw error;
      }
    }),
    close: async () => {
      await queue;
      closed = true;
    }
  };
  return api;
}

