import { app, BrowserWindow, ipcMain, dialog, safeStorage, clipboard, session } from 'electron';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ChatClient } from '../core/client.js';
import { installFeatures } from './features-main.js';

if (process.argv.includes('--smoke-features')) { app.commandLine.appendSwitch('use-fake-device-for-media-stream'); app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required'); }
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const here = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(here, 'index.html')).href;
const profile = process.env.STILLROOM_PROFILE || 'default';
if (!/^[a-zA-Z0-9_-]{1,60}$/.test(profile)) throw new Error('Invalid profile name');
app.setPath('userData', path.join(app.getPath('appData'), 'Stillroom', profile));
if (!app.requestSingleInstanceLock()) app.exit(0);
let features;
let win, client, settings = { url: 'wss://localhost:8443', ca: null };
const snapshot = path.join(app.getPath('userData'), 'snapshot.enc');
let fullStore = null;
let saves = Promise.resolve();
const store = {
  async load() { return structuredClone(fullStore?.client ?? null); },
  async save(value) {
    const committed = structuredClone({ settings, client: value });
    const bytes = safeStorage.encryptString(JSON.stringify(committed));
    saves = saves.catch(() => {}).then(async () => {
      await writeFile(snapshot + '.tmp', bytes, { mode: 0o600 });
      await rename(snapshot + '.tmp', snapshot);
      fullStore = committed;
    });
    return saves;
  }
};
function publicState() { const state = client.state(); return { ...state, ...features?.state(), outbox: state.outbox.map(({id,peerId}) => ({id,peerId})), settings: { url: settings.url, customCA: !!settings.ca }, profile }; }
function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Untrusted request');
}
let actions = Promise.resolve();
function handle(name, action, concurrent = false) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    const work = concurrent ? Promise.resolve().then(() => action(...args)) : actions.then(() => action(...args));
    if (!concurrent) actions = work.catch(() => {});
    try { return { ok: true, value: await work }; }
    catch { return { ok: false, error: 'Action failed. Check the relay, contact card, or local storage and try again.' }; }
  });
}
app.whenReady().then(async () => {
try {
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('OS encryption unavailable');
  await mkdir(app.getPath('userData'), { recursive: true });
  try { fullStore = JSON.parse(safeStorage.decryptString(await readFile(snapshot))); settings = fullStore.settings; }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Encrypted profile cannot be opened'); }
  if (process.argv.includes('--smoke-pair') || process.argv.includes('--smoke-ui-pair') || process.argv.includes('--smoke-features')) settings = { url: process.env.STILLROOM_PAIR_URL, ca: await readFile(process.env.STILLROOM_PAIR_CA, 'utf8'), iceServers: [] };
  client = await ChatClient.create({ store, url: settings.url, ca: settings.ca || undefined });
  if (process.argv.includes('--smoke-pair')) {
    const directory = process.env.STILLROOM_PAIR_DIRECTORY;
    const role = process.env.STILLROOM_PAIR_ROLE;
    if (!['a','b'].includes(role)) throw new Error('Invalid test role');
    await writeFile(path.join(directory, role + '.card.tmp'), JSON.stringify(client.contactCard()));
    await rename(path.join(directory, role + '.card.tmp'), path.join(directory, role + '.card'));
    let peer;
    for (let i = 0; i < 200 && !peer; i++) { try { peer = JSON.parse(await readFile(path.join(directory, (role === 'a' ? 'b' : 'a') + '.card'), 'utf8')); } catch { await delay(100); } }
    if (!peer) throw new Error('Test peer unavailable');
    await client.addContact(peer); // Controlled test-only public-card exchange; ordinary UI requires human verification.
    await client.connect();
    const text = 'Independent Electron process probe ' + role;
    const id = await client.send(peer.id, text);
    let success = false;
    for (let i = 0; i < 200; i++) { const s = client.state(); if (s.history.find(m => m.id === id)?.status === 'delivered' && s.history.some(m => m.from === peer.id)) { success = true; break; } await delay(100); }
    await client.disconnect(); await saves;
    const encrypted = await readFile(snapshot);
    const durable = JSON.parse(safeStorage.decryptString(encrypted)).client;
    const result = { pair: true, role, success, history: durable.history.length, delivered: durable.history.filter(m => m.status === 'delivered').length, plaintextAbsent: !encrypted.includes(Buffer.from(text)) };
    await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result));
    app.exit(success && result.plaintextAbsent ? 0 : 1);
  } else if (process.env.STILLROOM_SMOKE === '1' || process.argv.includes('--smoke')) {
    const sample = 'Stillroom storage probe';
    const storage = safeStorage.decryptString(safeStorage.encryptString(sample)) === sample;
    const result = { smoke: true, storage, identity: typeof client.state().id === 'string' };
    if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result));
    console.log(JSON.stringify(result));
    app.exit(storage ? 0 : 1);
  } else {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win = new BrowserWindow({ width: 1120, height: 780, minWidth: 840, minHeight: 600, title: 'Stillroom', backgroundColor: '#f5f4f0', webPreferences: { backgroundThrottling: false, preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
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
    handle('ca-system', async () => {
      const previous = settings.ca;
      settings.ca = null;
      try { await store.save(fullStore.client); }
      catch (error) { settings.ca = previous; throw error; }
      return publicState();
    });
    handle('connect', async url => {
      if (typeof url !== 'string' || url.length > 2048) throw new Error('Invalid relay');
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.hash) throw new Error('WSS required');
      await client.disconnect(); settings.url = parsed.href;
      await store.save(fullStore?.client);
      client = await ChatClient.create({ store, url: settings.url, ca: settings.ca || undefined });
      features?.bind(client);
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
    features = await installFeatures({ win, page, profileDirectory: app.getPath('userData'), getClient: () => client, handle, changed: () => { if (!win.isDestroyed()) win.webContents.send('changed', publicState()); }, testOptions: process.argv.includes('--smoke-features') ? { source: process.env.STILLROOM_FEATURE_SOURCE, destination: process.env.STILLROOM_FEATURE_DESTINATION, report: process.env.STILLROOM_FEATURE_REPORT } : null, getSettings: () => settings, saveSettings: () => store.save(fullStore.client) });
    await win.loadFile(path.join(here, 'index.html'));
    if (process.argv.includes('--smoke-features')) { const { runFeatureSmoke } = await import('./features-smoke.js'); const result = await runFeatureSmoke({ win, getClient: () => client, settings }); await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result)); await features.close(); await client.disconnect(); app.exit(result.success ? 0 : 1); return; }
    if (process.argv.includes('--smoke-ui-pair')) {
      await delay(800);
      const directory = process.env.STILLROOM_PAIR_DIRECTORY, role = process.env.STILLROOM_PAIR_ROLE;
      if (!['a','b'].includes(role)) throw new Error('Invalid test role');
      await writeFile(path.join(directory, role + '.card.tmp'), JSON.stringify(client.contactCard()));
      await rename(path.join(directory, role + '.card.tmp'), path.join(directory, role + '.card'));
      let peer;
      for (let i = 0; i < 200 && !peer; i++) { try { peer = JSON.parse(await readFile(path.join(directory, (role === 'a' ? 'b' : 'a') + '.card'), 'utf8')); } catch { await delay(100); } }
      if (!peer) throw new Error('Test peer unavailable');
      const input = JSON.stringify(JSON.stringify(peer));
      const unverified = await win.webContents.executeJavaScript(`window.stillroom.call('contact',${input},false)`);
      const plaintext = await win.webContents.executeJavaScript(`window.stillroom.call('connect','ws://localhost:8443')`);
      await win.webContents.executeJavaScript(`document.getElementById('add').click(); document.getElementById('card').value=${input}; document.getElementById('card').dispatchEvent(new Event('input')); document.getElementById('verified').checked=true; document.getElementById('approve').click();`);
      for (let i=0;i<100 && !client.state().contacts.length;i++) await delay(50);
      await win.webContents.executeJavaScript(`window.stillroom.call('connect',${JSON.stringify(settings.url)})`);
      const text = 'Renderer composer probe ' + role;
      await win.webContents.executeJavaScript(`document.getElementById('text').value=${JSON.stringify(text)}; document.getElementById('compose').requestSubmit();`);
      let success = false;
      for (let i=0;i<200;i++) { const s=client.state(); if(s.history.some(m=>m.text===text&&m.status==='delivered') && s.history.some(m=>m.from===peer.id)) { success=true;break; } await delay(100); }
      await client.disconnect(); await saves;
      const encrypted=await readFile(snapshot), durable=JSON.parse(safeStorage.decryptString(encrypted)).client;
      const result={pair:true,renderer:true,role,success,unverifiedRejected:unverified.ok===false,plaintextRejected:plaintext.ok===false,history:durable.history.length,delivered:durable.history.filter(m=>m.status==='delivered').length,plaintextAbsent:!encrypted.includes(Buffer.from(text))};
      await writeFile(process.env.STILLROOM_SMOKE_OUTPUT,JSON.stringify(result));
      app.exit(success&&result.unverifiedRejected&&result.plaintextRejected&&result.plaintextAbsent?0:1);
    }
    if (process.argv.includes('--smoke-ui')) {
      await delay(800);
      const observed = await win.webContents.executeJavaScript(`({title:document.title,bridge:typeof window.stillroom.call==='function',node:typeof process,contacts:!!document.getElementById('contacts'),composer:!!document.getElementById('compose')})`);
      const prefs = win.webContents.getLastWebPreferences();
      const result = { smokeUI: true, ...observed, sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
      if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result));
      if (process.env.STILLROOM_SMOKE_SCREENSHOT) {
        const image = await win.webContents.capturePage();
        await writeFile(process.env.STILLROOM_SMOKE_SCREENSHOT, image.toPNG());
      }
      console.log(JSON.stringify(result));
      app.exit(observed.bridge && observed.contacts && observed.composer && observed.node === 'undefined' && prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration ? 0 : 1);
    }
  }
} catch {
  if (process.env.STILLROOM_SMOKE === '1' || process.argv.some(a => a.startsWith('--smoke'))) { const result = JSON.stringify({ smoke: true, storage: false }); console.log(result); if (process.env.STILLROOM_SMOKE_OUTPUT) await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, result); }
  else dialog.showErrorBox('Stillroom cannot unlock this profile', 'OS-protected storage is unavailable, damaged, or belongs to another account. No plaintext fallback is used.');
  app.exit(1);
}
});
app.on('window-all-closed', async () => { await features?.close(); await client?.disconnect(); app.quit(); });
