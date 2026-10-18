import { desktopCapturer, dialog, safeStorage } from 'electron';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTransferEngine } from '../core/transfers.js';

export async function installFeatures({ win, page, profileDirectory, getClient, handle, changed, testOptions, getSettings, saveSettings }) {
  let transfers, unsubscribe, displayGrant, microphoneUntil = 0;
  const outbound = new Map();
  const transportStats = { directFrames: 0, relayFrames: 0 };
  const notify = (channel, data) => { if (!win.isDestroyed()) win.webContents.send(channel, data); };
  const file = path.join(profileDirectory, 'transfers.enc');
  let writes = Promise.resolve();
  const protectedStore = {
    async load() { try { return JSON.parse(safeStorage.decryptString(await readFile(file))); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async save(value) {
      const bytes = safeStorage.encryptString(JSON.stringify(value));
      writes = writes.catch(() => {}).then(async () => { await writeFile(file + '.tmp', bytes); await rename(file + '.tmp', file); });
      await writes;
    },
  };
  async function relay(peer, frame) {
    // Existing relay defences permit 300 frames/10s. Pace bulk fallback separately
    // so text and authenticated control traffic retain headroom.
    await getClient().sendControl(peer, 'transfer', frame);
  }
  async function send(peer, frame) {
    if (win.isDestroyed()) throw Error('Desktop closed');
    const requestId = randomUUID();
    const direct = await new Promise(resolve => {
      const timer = setTimeout(() => { outbound.delete(requestId); resolve(false); }, 2500);
      outbound.set(requestId, value => { clearTimeout(timer); outbound.delete(requestId); resolve(value); });
      notify('bulk-send', { requestId, peer, frame });
    });
    if (direct) transportStats.directFrames++;
    else { await new Promise(r => setTimeout(r, 90)); await relay(peer, frame); transportStats.relayFrames++; }
  }
  transfers = await createTransferEngine({ directory: path.join(profileDirectory, 'transfers'), send, store: protectedStore, onUpdate: () => changed() });
  function bind(client) {
    unsubscribe?.();
    unsubscribe = client.subscribeControls(event => {
      if (event.namespace === 'rtc') notify('rtc-control', event);
      else if (event.namespace === 'transfer') transfers.receive(event.from, event.data).catch(() => changed());
    });
  }
  bind(getClient());
  handle('media-report', async report => {
    if (!report || report.format !== 'stillroom-stream-report-v1' || !Array.isArray(report.samples) || report.samples.length > 600) throw Error('Invalid stream report');
    const data = JSON.stringify(report, null, 2);
    if (Buffer.byteLength(data) > 2 * 1024 * 1024) throw Error('Stream report too large');
    const result = testOptions?.report ? { canceled: false, filePath: testOptions.report } : await dialog.showSaveDialog(win, { title: 'Save stream performance report', defaultPath: 'stillroom-stream-report.json', filters: [{ name: 'JSON report', extensions: ['json'] }], properties: ['showOverwriteConfirmation'] });
    if (result.canceled) return false;
    await writeFile(result.filePath, data, { encoding: 'utf8', mode: 0o600 }); return true;
  });
  handle('rtc-send', async (peer, data) => { await getClient().sendControl(peer, 'rtc', data); return true; }, true);
  handle('rtc-config', () => ({ iceServers: getSettings().iceServers ?? [{ urls: 'stun:stun.cloudflare.com:3478' }] }));
  handle('rtc-settings', async raw => {
    if (typeof raw !== 'string' || raw.length > 12000) throw Error('Invalid ICE configuration');
    const servers = JSON.parse(raw);
    if (!Array.isArray(servers) || servers.length > 12) throw Error('Invalid ICE configuration');
    for (const server of servers) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      if (!urls.length || !urls.every(u => typeof u === 'string' && /^(stun|stuns|turn|turns):[^\s]+$/.test(u))) throw Error('Invalid ICE URL');
      if (server.username != null && typeof server.username !== 'string') throw Error('Invalid TURN username');
      if (server.credential != null && typeof server.credential !== 'string') throw Error('Invalid TURN credential');
    }
    getSettings().iceServers = servers; await saveSettings(); return true;
  });
  handle('media-consent', () => { microphoneUntil = Date.now() + 30000; return true; });
  handle('share-sources', async () => (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })).map(s => ({ id: s.id, name: s.name })));
  handle('share-select', async (id, systemAudio) => {
    if (typeof id !== 'string' || typeof systemAudio !== 'boolean') throw Error('Invalid capture selection');
    const source = (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })).find(s => s.id === id);
    if (!source) throw Error('Capture source unavailable');
    displayGrant = { source, audio: systemAudio, expires: Date.now() + 15000 }; return true;
  });
  const trustedContents = contents => contents === win.webContents && contents.getURL() === page;
  win.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) => trustedContents(contents) && (
    (['media', 'audioCapture'].includes(permission) && details?.mediaType !== 'video' && Date.now() < microphoneUntil) ||
    (permission === 'display-capture' && displayGrant?.expires > Date.now())
  ));
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(trustedContents(contents) && (
    (['media', 'audioCapture'].includes(permission) && !details?.mediaTypes?.includes('video') && Date.now() < microphoneUntil) ||
    (permission === 'display-capture' && displayGrant?.expires > Date.now())
  )));
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    const grant = displayGrant; displayGrant = null;
    if (request.frame !== win.webContents.mainFrame || request.frame.url !== page || !grant || grant.expires < Date.now()) return callback({});
    callback(grant.audio && process.platform === 'win32' ? { video: grant.source, audio: 'loopback' } : { video: grant.source });
  });
  handle('file-offer', async peer => {
    if (!getClient().state().contacts.some(c => c.id === peer)) throw Error('Verified contact required');
    const result = testOptions?.source ? { canceled: false, filePaths: [testOptions.source] } : await dialog.showOpenDialog(win, { title: 'Send an encrypted file', properties: ['openFile'] });
    if (result.canceled) return false;
    await transfers.offer(peer, result.filePaths[0]); return true;
  }, true);
  handle('file-accept', async id => {
    const entry = transfers.state().find(t => t.id === id && t.direction === 'receive');
    if (!entry) throw Error('Unknown transfer');
    const result = testOptions?.destination ? { canceled: false, filePath: testOptions.destination } : await dialog.showSaveDialog(win, { title: 'Save verified received file', defaultPath: entry.name, properties: ['showOverwriteConfirmation'] });
    if (result.canceled) return false;
    await transfers.accept(id, result.filePath); return true;
  }, true);
  handle('file-retry', async id => { await transfers.retry(id); return true; }, true);
  handle('file-cancel', async id => { await transfers.cancel(id); return true; }, true);
  handle('bulk-result', (id, accepted) => { outbound.get(id)?.(accepted === true); return true; }, true);
  handle('bulk-received', async (peer, frame) => {
    if (!getClient().state().contacts.some(c => c.id === peer)) throw Error('Unknown peer');
    if (JSON.stringify(frame).length > 32768) throw Error('Transfer frame too large');
    await transfers.receive(peer, frame); return true;
  }, true);
  return {
    bind,
    state: () => ({ transfers: transfers.state(), transferTransport: { ...transportStats } }),
    async close() { unsubscribe?.(); displayGrant = null; microphoneUntil = 0; for (const resolve of outbound.values()) resolve(false); await transfers.close(); },
  };
}
