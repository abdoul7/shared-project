import { app, BrowserWindow, ipcMain, dialog, safeStorage, clipboard, session } from 'electron';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChatClient } from '../core/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(here, 'index.html')).href;
const profile = process.env.STILLROOM_PROFILE || 'default';
if (!/^[a-zA-Z0-9_-]{1,60}$/.test(profile)) throw new Error('Invalid profile name');
app.setPath('userData', path.join(app.getPath('appData'), 'Stillroom', profile));
if (!app.requestSingleInstanceLock()) app.exit(0);
let win, client, settings = { url: 'wss://localhost:8443', ca: null };
const snapshot = path.join(app.getPath('userData'), 'snapshot.enc');
let fullStore = null;
let saves = Promise.resolve();
const store = {
  async load() { return fullStore?.client ?? null; },
  async save(value) {
    fullStore = { settings, client: value };
    const bytes = safeStorage.encryptString(JSON.stringify(fullStore));
    saves = saves.catch(() => {}).then(async () => {
      await writeFile(snapshot + '.tmp', bytes, { mode: 0o600 });
      await rename(snapshot + '.tmp', snapshot);
    });
    return saves;
  }
};
function publicState() { const state = client.state(); return { ...state, outbox: state.outbox.map(({id,peerId}) => ({id,peerId})), settings: { url: settings.url, customCA: !!settings.ca }, profile }; }
function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Untrusted request');
}
function handle(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    try { return { ok: true, value: await action(...args) }; }
    catch { return { ok: false, error: 'Action failed. Check the relay, contact card, or local storage and try again.' }; }
  });
}
app.whenReady().then(async () => {
try {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('OS encryption unavailable');
  await mkdir(app.getPath('userData'), { recursive: true });
  try { fullStore = JSON.parse(safeStorage.decryptString(await readFile(snapshot))); settings = fullStore.settings; }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Encrypted profile cannot be opened'); }
  client = await ChatClient.create({ store, url: settings.url, ca: settings.ca || undefined });
  if (process.env.STILLROOM_SMOKE === '1' || process.argv.includes('--smoke')) {
    const sample = 'Stillroom storage probe';
    const storage = safeStorage.decryptString(safeStorage.encryptString(sample)) === sample;
    const result = { smoke: true, storage, identity: typeof client.state().id === 'string' };
    if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result));
    console.log(JSON.stringify(result));
    app.exit(storage ? 0 : 1);
  } else {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win = new BrowserWindow({ width: 1120, height: 780, minWidth: 840, minHeight: 600, title: 'Stillroom', backgroundColor: '#f5f4f0', webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.setMenuBarVisibility(false);
    handle('state', () => publicState());
    handle('card', () => { clipboard.writeText(JSON.stringify(client.contactCard())); return true; });
    handle('contact', async (raw, verified) => {
      if (verified !== true || typeof raw !== 'string' || raw.length > 2048) throw new Error('Verification required');
      await client.addContact(JSON.parse(raw)); return publicState();
    });
    handle('ca', async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Choose trusted relay CA certificate', properties: ['openFile'], filters: [{ name: 'PEM certificates', extensions: ['pem', 'crt'] }] });
      if (result.canceled) return false;
      if ((await stat(result.filePaths[0])).size > 65536) throw new Error('Certificate too large');
      const bytes = await readFile(result.filePaths[0]);
      if (bytes.length > 65536 || !bytes.toString().includes('-----BEGIN CERTIFICATE-----') || bytes.toString().includes('PRIVATE KEY')) throw new Error('Invalid certificate');
      settings.ca = bytes.toString(); return true;
    });
    handle('connect', async url => {
      if (typeof url !== 'string' || url.length > 2048) throw new Error('Invalid relay');
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.hash) throw new Error('WSS required');
      await client.disconnect(); settings.url = parsed.href;
      await store.save(fullStore?.client);
      client = await ChatClient.create({ store, url: settings.url, ca: settings.ca || undefined });
      client.subscribe(() => win?.webContents.send('changed', publicState()));
      await client.connect(); return publicState();
    });
    handle('disconnect', async () => { await client.disconnect(); return publicState(); });
    handle('send', async (peer, text) => {
      if (typeof peer !== 'string' || !/^[a-f0-9]{64}$/.test(peer) || typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Invalid message');
      await client.send(peer, text); return publicState();
    });
    handle('retry', async id => { if (typeof id !== 'string' || id.length > 128) throw new Error('Invalid message'); await client.retry(id); return publicState(); });
    client.subscribe(() => win?.webContents.send('changed', publicState()));
    await win.loadFile(path.join(here, 'index.html'));
    if (process.argv.includes('--smoke-ui')) {
      const observed = await win.webContents.executeJavaScript(`({title:document.title,bridge:typeof window.stillroom.call==='function',node:typeof process,contacts:!!document.getElementById('contacts'),composer:!!document.getElementById('compose')})`);
      const prefs = win.webContents.getLastWebPreferences();
      const result = { smokeUI: true, ...observed, sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
      if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result));
      if (process.env.STILLROOM_SMOKE_SCREENSHOT) await writeFile(process.env.STILLROOM_SMOKE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      console.log(JSON.stringify(result));
      app.exit(observed.bridge && observed.contacts && observed.composer && observed.node === 'undefined' && prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration ? 0 : 1);
    }
  }
} catch {
  if (process.env.STILLROOM_SMOKE === '1' || process.argv.includes('--smoke')) { const result = JSON.stringify({ smoke: true, storage: false }); console.log(result); if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, result); }
  else dialog.showErrorBox('Stillroom cannot unlock this profile', 'OS-protected storage is unavailable, damaged, or belongs to another account. No plaintext fallback is used.');
  app.exit(1);
}
});
app.on('window-all-closed', () => { client?.disconnect(); app.quit(); });
