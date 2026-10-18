import { PeerSession } from './rtc.js';

export async function mountFeatures({ getSelected, notice }) {
  const $ = id => document.getElementById(id);
  const invoke = async (name, ...args) => {
    const result = await window.stillroom.call(name, ...args);
    if (!result.ok) throw Error(result.error);
    return result.value;
  };
  const run = fn => Promise.resolve().then(fn).catch(e => notice(e.message || 'Action failed'));
  const config = await invoke('rtc-config');
  let connected = false, trackIds = '';
  const rtc = new PeerSession({
    iceServers: config.iceServers,
    sendControl: (peer, _namespace, data) => invoke('rtc-send', peer, data),
    onBulk: (peer, frame) => invoke('bulk-received', peer, frame),
    onState: state => {
      $('callPanel').hidden = state.phase === 'idle';
      $('callState').textContent = `${state.phase} ${state.peerId ? '· ' + state.peerId.slice(0, 12) : ''}`;
      $('acceptCall').hidden = $('rejectCall').hidden = state.phase !== 'ringing';
      for (const id of ['muteCall', 'shareScreen']) $(id).disabled = state.phase !== 'connected';
      $('stopShare').disabled = !state.sharing;
      $('muteCall').textContent = state.muted ? 'Unmute' : 'Mute';
      $('sharingIndicator').textContent = state.sharing ? '● SHARING ACTIVE — selected source is being transmitted. Stop sharing to end capture.' : '';
      $('callPeer').disabled = !getSelected() || !connected || state.phase !== 'idle';
      const ids = state.remoteStream.getTracks().map(t => t.id).join(',');
      if (ids !== trackIds) {
        trackIds = ids; $('remoteMedia').srcObject = state.remoteStream;
        for (const t of state.remoteStream.getVideoTracks()) {
          t.onunmute = () => { $('remoteMedia').hidden = false; };
          t.onmute = () => { $('remoteMedia').hidden = true; };
        }
        $('remoteMedia').hidden = !state.remoteStream.getVideoTracks().some(t => !t.muted);
        if (ids) $('remoteMedia').play().catch(() => notice('Use the media player control to enable call audio.'));
      }
      const incoming = state.stats.incoming?.find(r => r.kind === 'video');
      const outgoing = state.stats.outgoing?.find(r => r.kind === 'video');
      $('mediaStats').textContent = [
        'Requested sharing target: 2560×1440 at 60fps (actual depends on hardware/network).',
        incoming ? `Receiver: ${incoming.width || '—'}×${incoming.height || '—'} · ${incoming.fps ?? '—'}fps · ${incoming.codec || 'negotiating'} · decoded ${incoming.framesDecoded ?? 0} / dropped ${incoming.framesDropped ?? 0}` : 'Receiver: no video measurements yet.',
        outgoing ? `Sender: ${outgoing.width || '—'}×${outgoing.height || '—'} · ${outgoing.fps ?? '—'}fps · ${outgoing.codec || 'negotiating'} · limitation ${outgoing.qualityLimitationReason || 'unknown'}` : '',
        `Round trip: ${state.stats.rtt == null ? 'unavailable' : Math.round(state.stats.rtt * 1000) + 'ms'}. Media is direct peer encrypted; TURN forwards ciphertext.`,
      ].filter(Boolean).join('\n');
    },
  });
  window.stillroom.on('rtc-control', event => run(() => rtc.handleControl(event)));
  window.stillroom.on('bulk-send', event => {
    rtc.sendBulk(event.peer, event.frame).then(
      () => invoke('bulk-result', event.requestId, true),
      () => invoke('bulk-result', event.requestId, false),
    ).catch(() => {});
  });
  $('callPeer').onclick = () => run(async () => { await invoke('media-consent'); await rtc.call(getSelected(), { microphoneId: $('microphone').value || undefined }); });
  $('acceptCall').onclick = () => run(async () => { await invoke('media-consent'); await rtc.accept(); });
  $('rejectCall').onclick = () => run(() => rtc.reject());
  $('endCall').onclick = () => run(() => rtc.hangup());
  $('muteCall').onclick = () => rtc.mute(!rtc.muted);
  $('stopShare').onclick = () => run(() => rtc.stopShare());
  async function microphones() {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const old = $('microphone').value; $('microphone').replaceChildren(new Option('System default', ''));
    for (const [index, device] of devices.entries()) $('microphone').add(new Option(device.label || `Microphone ${index + 1}`, device.deviceId));
    if ([...$('microphone').options].some(o => o.value === old)) $('microphone').value = old;
  }
  $('refreshMicrophones').onclick = () => run(microphones);
  $('microphone').onchange = () => run(async () => { if (rtc.phase === 'connected') { await invoke('media-consent'); await rtc.setMicrophone($('microphone').value || undefined); } });
  await microphones().catch(() => {});
  $('shareScreen').onclick = () => run(async () => {
    const sources = await invoke('share-sources'); $('shareSource').replaceChildren();
    for (const source of sources) $('shareSource').add(new Option(source.name, source.id));
    if (!sources.length) throw Error('No screen or window is available');
    $('shareDialog').showModal();
  });
  $('cancelShare').onclick = () => $('shareDialog').close();
  $('startShare').onclick = () => run(async () => {
    await invoke('share-select', $('shareSource').value, $('systemAudio').checked);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60 } }, audio: $('systemAudio').checked });
    try { await rtc.share(stream); $('shareDialog').close(); } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
  });
  $('iceServers').value = JSON.stringify(config.iceServers || [], null, 2);
  $('saveICE').onclick = () => run(async () => {
    if (rtc.phase !== 'idle') throw Error('End the current call before changing connectivity settings');
    await invoke('rtc-settings', $('iceServers').value); rtc.iceServers = JSON.parse($('iceServers').value); notice('Connectivity settings saved.');
  });
  $('sendFile').onclick = () => run(() => invoke('file-offer', getSelected()));
  function update(state) {
    connected = state.connected;
    $('callPeer').disabled = !getSelected() || !connected || rtc.phase !== 'idle';
    $('sendFile').disabled = !getSelected() || !connected;
    if (!connected && rtc.phase !== 'idle') rtc.cleanup();
    $('transferPanel').replaceChildren();
    for (const t of state.transfers || []) {
      const row = document.createElement('div'); row.className = 'transfer';
      const label = document.createElement('span');
      label.textContent = `${t.direction === 'send' ? 'Sending' : 'Receiving'} ${t.name} · ${t.status} · ${t.offset.toLocaleString()}/${t.total.toLocaleString()} bytes · ${Math.round(t.bytesPerSecond || 0).toLocaleString()} B/s${t.etaSeconds == null ? '' : ' · ETA ' + Math.ceil(t.etaSeconds) + 's'}${t.error ? ' · ' + t.error : ''}`;
      row.append(label);
      const progress = document.createElement('progress'); progress.max = Math.max(1, t.total); progress.value = t.offset; row.append(progress);
      const button = (text, action) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => run(action); row.append(b); };
      if (t.direction === 'receive' && t.status === 'offered') button('Choose destination & accept', () => invoke('file-accept', t.id));
      if (!['complete', 'cancelled', 'offered'].includes(t.status)) button('Resume / Retry', () => invoke('file-retry', t.id));
      if (t.direction === 'send' && t.status === 'offered') button('Resend offer', () => invoke('file-retry', t.id));
      if (!['complete', 'cancelled'].includes(t.status)) button('Cancel', () => invoke('file-cancel', t.id));
      $('transferPanel').append(row);
    }
  }
  return { update, rtc };
}
