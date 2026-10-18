import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Explicit desktop integration harness. It exercises the production renderer,
// bridge, control protocol and WebRTC; only file dialogs use synthetic paths.
export async function runFeatureSmoke({ win, getClient, settings }) {
  const directory = process.env.STILLROOM_PAIR_DIRECTORY;
  const role = process.env.STILLROOM_PAIR_ROLE;
  if (!process.argv.includes('--smoke-features') || !['a', 'b'].includes(role)) throw Error('Feature test flag/role required');
  const peerRole = role === 'a' ? 'b' : 'a';
  const relayOnly = process.env.STILLROOM_TEST_RELAY_ONLY === '1';
  const skipSharing = process.env.STILLROOM_TEST_SKIP_SHARING === '1';
  const result = { role, success: false, renderer: true, callTested: !relayOnly, incomingConsent: false, connected: false, mute: false, file: false, sharing: { passed: false, reason: 'Not attempted' }, hangup: false };
  const js = code => win.webContents.executeJavaScript(code, true);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  async function wait(fn, label, ms = 12000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(100); }
    throw Error('Timed out: ' + label);
  }
  const marker = async name => { await writeFile(path.join(directory, role + '-' + name), 'ready'); };
  const peerMarker = name => wait(async () => { try { return await readFile(path.join(directory, peerRole + '-' + name), 'utf8'); } catch { return false; } }, name);
  const ui = expression => js(`Boolean(${expression})`);
  try {
    // A hidden test window is not a native capture target. Show only this owned
    // synthetic test UI, never select a display or another application's window.
    if (!relayOnly && !skipSharing) win.showInactive();
    await wait(() => ui(`document.getElementById('sendFile') && typeof window.stillroom.call === 'function'`), 'renderer initialization');
    const cardPath = path.join(directory, role + '.card');
    await writeFile(cardPath + '.tmp', JSON.stringify(getClient().contactCard())); await rename(cardPath + '.tmp', cardPath);
    const peer = await wait(async () => { try { return JSON.parse(await readFile(path.join(directory, peerRole + '.card'), 'utf8')); } catch { return false; } }, 'peer card');
    await js(`document.getElementById('add').click(); document.getElementById('card').value=${JSON.stringify(JSON.stringify(peer))}; document.getElementById('card').dispatchEvent(new Event('input')); document.getElementById('verified').checked=true; document.getElementById('approve').click();`);
    await wait(() => getClient().state().contacts.length, 'verified contact');
    const connection = await js(`window.stillroom.call('connect',${JSON.stringify(settings.url)})`);
    if (!connection.ok) throw Error('TLS connection failed');
    await wait(() => ui(`document.querySelector('#contacts button')`), 'contact button');
    await js(`document.querySelector('#contacts button').click()`);
    await wait(() => ui(`!document.getElementById('callPeer').disabled`), 'call ready');
    await marker('ready'); await peerMarker('ready');
    if (relayOnly) {
      if (role === 'a') await click('sendFile');
      else {
        await wait(() => ui(`[...document.querySelectorAll('#transferPanel button')].some(b => b.textContent.includes('accept'))`), 'relay file offer');
        await js(`[...document.querySelectorAll('#transferPanel button')].find(b => b.textContent.includes('accept')).click()`);
      }
      const direction = role === 'a' ? 'send' : 'receive';
      await wait(async () => { const r = await js(`window.stillroom.call('state')`); return r.value?.transfers?.some(t => t.direction === direction && t.status === 'complete' && t.offset === t.total); }, 'relay file completion');
      result.file = true; result.encryptedWS = connection.ok && settings.url.startsWith('wss:');
      result.noActiveCall = await ui(`document.getElementById('callPanel').hidden`);
      result.transferTransport = (await js(`window.stillroom.call('state')`)).value?.transferTransport;
      result.success = result.file && result.encryptedWS && result.noActiveCall && result.transferTransport?.relayFrames > 0 && result.transferTransport?.directFrames === 0;
      await marker('file-done'); await peerMarker('file-done');
      await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result, null, 2));
      return result;
    }
    if (role === 'a') await click('callPeer');
    else {
      await wait(() => ui(`!document.getElementById('acceptCall').hidden && document.getElementById('callState').textContent.startsWith('ringing')`), 'incoming ring');
      // Incoming UI is ringing before explicit acceptance; no microphone grant
      // or acceptance action has been issued by this receiving harness yet.
      result.incomingConsent = true;
      await click('acceptCall');
    }
    await wait(() => ui(`document.getElementById('callState').textContent.startsWith('connected')`), 'WebRTC connection');
    result.connected = true;
    await click('muteCall');
    await wait(() => ui(`document.getElementById('muteCall').textContent === 'Unmute'`), 'mute');
    await click('muteCall');
    result.mute = await ui(`document.getElementById('muteCall').textContent === 'Mute'`);
    if (role === 'a') {
      await click('sendFile');
      await wait(async () => { const r = await js(`window.stillroom.call('state')`); return r.value?.transfers?.some(t => t.direction === 'send' && t.status === 'complete' && t.offset === t.total); }, 'file sender completion');
      result.file = true; await marker('file');
      try {
        if (skipSharing) throw Error('Screen sharing explicitly skipped by test operator');
        await click('shareScreen');
        await wait(() => ui(`document.getElementById('shareDialog').open`), 'capture picker', 3000);
        const ownSourceId = win.getMediaSourceId();
        const source = await js(`[...document.getElementById('shareSource').options].find(o => o.value === ${JSON.stringify(ownSourceId)})?.value || null`);
        if (!source) throw Error('Own Stillroom window unavailable in capture picker');
        await js(`document.getElementById('shareSource').value=${JSON.stringify(source)}; document.getElementById('systemAudio').checked=false;`);
        await click('startShare');
        await wait(() => ui(`!document.getElementById('stopShare').disabled`), 'selected-window capture', 5000);
        result.sharing = { passed: true, source: 'own Stillroom test window', systemAudio: false };
        await marker('sharing'); await peerMarker('observed');
        await click('stopShare');
        await wait(() => ui(`document.getElementById('stopShare').disabled`), 'capture stopped', 3000);
        result.sharing.stopped = true;
      } catch (error) {
        result.sharing = { passed: false, reason: error.message };
        await js(`document.getElementById('shareDialog').open && document.getElementById('shareDialog').close()`);
        await marker('sharing-unavailable');
      }
      await marker('share-finished'); await peerMarker('ready-end'); await click('endCall');
    } else {
      await wait(() => ui(`[...document.querySelectorAll('#transferPanel button')].some(b => b.textContent.includes('accept'))`), 'incoming file offer');
      await js(`[...document.querySelectorAll('#transferPanel button')].find(b => b.textContent.includes('accept')).click()`);
      await wait(async () => { const r = await js(`window.stillroom.call('state')`); return r.value?.transfers?.some(t => t.direction === 'receive' && t.status === 'complete' && t.offset === t.total); }, 'file receiver completion');
      result.file = true;
      await wait(async () => { for (const name of ['sharing', 'sharing-unavailable']) { try { await readFile(path.join(directory, 'a-' + name)); return name; } catch {} } return false; }, 'sharing attempt');
      try {
        await readFile(path.join(directory, 'a-sharing'));
        const observed = await wait(() => js(`(()=>{const v=document.getElementById('remoteMedia');return v.videoWidth>0 ? {width:v.videoWidth,height:v.videoHeight,playbackFrames:v.getVideoPlaybackQuality?.().totalVideoFrames ?? null,stats:document.getElementById('mediaStats').textContent} : null})()`), 'received captured frames', 5000);
        await delay(1500);
        const measured = await js(`document.getElementById('mediaStats').textContent`);
        result.sharing = { passed: true, ...observed, stats: measured };
      } catch (error) { result.sharing = { passed: false, reason: skipSharing ? 'Screen sharing explicitly skipped by test operator' : 'Own-window capture not received: ' + error.message }; }
      await marker('observed'); await peerMarker('share-finished'); await marker('ready-end');
    }
    await wait(() => ui(`document.getElementById('callPanel').hidden`), 'call ended'); result.hangup = true;
    await wait(() => ui(`!document.getElementById('exportStreamReport').disabled`), 'retained performance report');
    await click('exportStreamReport');
    const report = await wait(async () => { try { return JSON.parse(await readFile(path.join(directory, role + '-stream.json'), 'utf8')); } catch { return false; } }, 'saved performance report');
    result.performanceReport = report.format === 'stillroom-stream-report-v1' && report.samples.length > 0 && !JSON.stringify(report).includes(peer.id);
    await click('systemCA');
    await wait(async () => { const r = await js(`window.stillroom.call('state')`); return r.value?.settings?.customCA === false; }, 'system certificate trust');
    result.systemTrustReset = true;
    result.transferTransport = (await js(`window.stillroom.call('state')`)).value?.transferTransport;
    result.success = result.connected && result.mute && result.file && result.hangup && result.performanceReport && result.systemTrustReset && (role === 'a' || result.incomingConsent);
    // Unavailable capture is not successful screen-sharing verification.
    result.sharing.skipped = skipSharing;
    if (!skipSharing && !result.sharing.passed) result.success = false;
    if (role === 'a' && !(result.transferTransport?.directFrames > 0)) result.success = false;
  } catch (error) { result.error = error.message; }
  await writeFile(process.env.STILLROOM_SMOKE_OUTPUT, JSON.stringify(result, null, 2));
  return result;
}
