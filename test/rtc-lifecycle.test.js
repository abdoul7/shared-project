import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerSession } from '../desktop/rtc.js';

class Stream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
}
globalThis.MediaStream = Stream;
const track = kind => ({ kind, stopped: false, stop() { this.stopped = true; }, async applyConstraints() {}, getSettings() { return {}; } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(sendControl = async () => {}) {
  const rtc = new PeerSession({ sendControl });
  rtc.pc = { close() {} }; rtc.phase = 'connected'; rtc.peerId = 'verified-peer'; rtc.callId = 'original-call';
  rtc.video = { sender: { async replaceTrack() {}, getParameters: () => ({}), async setParameters() {} } };
  rtc.system = { sender: { async replaceTrack() {} } };
  rtc.audio = { sender: { async replaceTrack() {} } };
  return rtc;
}

test('cancel during outgoing microphone permission stops the late device without starting a call', async () => {
  const rtc = fixture(), permission = deferred(), mic = track('audio');let setups = 0;
  rtc.phase = 'idle'; rtc.mic = () => permission.promise; rtc.setup = () => setups++;
  const calling = rtc.call('peer'); assert.equal(rtc.phase, 'preparing');
  await rtc.hangup(); permission.resolve(new Stream([mic]));
  await assert.rejects(calling, /cancelled/); assert.equal(mic.stopped, true); assert.equal(setups, 0); assert.equal(rtc.phase, 'idle');
});

test('invalid peer configuration releases microphone if connection construction fails', async () => {
  const rtc = fixture(), mic = track('audio'); rtc.phase = 'idle'; rtc.mic = async () => new Stream([mic]);
  rtc.setup = (_peer, id) => { rtc.callId = id; throw Error('Invalid ICE settings'); };
  await assert.rejects(rtc.call('peer'), /Invalid ICE/);
  assert.equal(mic.stopped, true); assert.equal(rtc.phase, 'idle');
});

test('outgoing offer finishing after hangup cannot close or signal the next call', async () => {
  const rtc = fixture(), offer = deferred(), mic = track('audio'), signals = [];
  rtc.phase = 'idle'; rtc.mic = async () => new Stream([mic]);
  const oldPc = { close() {}, createOffer: () => offer.promise };
  rtc.setup = (peer, id) => { rtc.pc = oldPc; rtc.peerId = peer; rtc.callId = id; };
  rtc.sendControl = async (...args) => signals.push(args);
  const calling = rtc.call('first-peer'); await new Promise(resolve => setImmediate(resolve));
  await rtc.hangup(); const next = fixture(); rtc.pc = next.pc; rtc.peerId = 'next-peer'; rtc.callId = 'next-call'; rtc.phase = 'connected';
  offer.resolve({ type: 'offer' }); await assert.rejects(calling, /Call changed/);
  assert.equal(rtc.pc, next.pc); assert.equal(rtc.callId, 'next-call'); assert.equal(mic.stopped, true);
  assert.equal(signals.length, 1); assert.equal(signals[0][2].type, 'end');
  rtc.cleanup();
});

test('media route failure releases capture and retains actionable status until dismissed', async () => {
  const previous = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = class {
    addTransceiver() { return { sender: {} }; }
    createDataChannel(label) { return { label }; }
    close() {}
  };
  const rtc = new PeerSession({ sendControl: async () => {} });
  try {
    rtc.setup('peer', 'call', true); const pc = rtc.pc, mic = track('audio'), video = track('video');
    rtc.localStream = new Stream([mic]); rtc.screenStream = new Stream([video]);
    pc.connectionState = 'disconnected'; pc.onconnectionstatechange(); assert.match(rtc.state().issue, /Trying to recover/);
    pc.connectionState = 'connected'; pc.onconnectionstatechange(); assert.equal(rtc.state().issue, '');
    pc.connectionState = 'failed'; pc.onconnectionstatechange();
    assert.equal(rtc.phase, 'idle'); assert.equal(mic.stopped, true); assert.equal(video.stopped, true);
    assert.match(rtc.state().issue, /TURN/);
    await rtc.hangup(); assert.equal(rtc.state().issue, '');
  } finally { rtc.cleanup(); globalThis.RTCPeerConnection = previous; }
});

test('answerer attaches microphone and later screen to remotely negotiated slots', async () => {
  const rtc = fixture(), mic = track('audio'), attached = [];
  const slots = ['audio', 'video', 'audio'].map((kind, i) => ({ receiver: { track: { kind } }, sender: { async replaceTrack(value) { attached.push([i, value]); } } }));
  Object.assign(rtc.pc, { async setRemoteDescription() {}, getTransceivers: () => slots, async createAnswer() { return {}; }, async setLocalDescription() {}, localDescription: { toJSON: () => ({ type: 'answer' }) } });
  rtc.phase = 'ringing'; rtc.mic = async () => new Stream([mic]); rtc.flushIce = async () => {}; rtc.gather = async () => {};
  await rtc.accept();
  assert.equal(rtc.video, slots[1]); assert.equal(rtc.system, slots[2]);
  assert.deepEqual(attached, [[0, mic]]); assert.ok(slots.every(s => s.direction === 'sendrecv'));
  rtc.cleanup();
});

test('acceptance finishing after hangup cannot modify the next call', async () => {
  const rtc = fixture(), remote = deferred(), mic = track('audio');
  rtc.phase = 'ringing'; rtc.mic = async () => new Stream([mic]);
  rtc.pc.setRemoteDescription = () => remote.promise;
  const accepting = rtc.accept(); await new Promise(resolve => setImmediate(resolve));
  await rtc.hangup(); const next = fixture(); rtc.pc = next.pc; rtc.callId = 'next-call'; rtc.phase = 'connected';
  remote.resolve(); await assert.rejects(accepting, /Call changed/);
  assert.equal(rtc.pc, next.pc); assert.equal(rtc.callId, 'next-call'); assert.equal(mic.stopped, true);
  rtc.cleanup();
});

test('hangup stops all capture before waiting for signalling and preserves end identity', async () => {
  const signal = deferred(), sent = [];
  const rtc = fixture((...args) => { sent.push(args); return signal.promise; });
  const microphone = track('audio'), screen = track('video');
  rtc.localStream = new Stream([microphone]); rtc.screenStream = new Stream([screen]);
  const ending = rtc.hangup();
  assert.equal(microphone.stopped, true); assert.equal(screen.stopped, true);
  assert.equal(rtc.phase, 'idle');
  assert.deepEqual(sent, [['verified-peer', 'rtc', { callId: 'original-call', type: 'end' }]]);
  signal.resolve(); await ending;
});

test('stop sharing stops video and system audio despite failed sender detach', async () => {
  const rtc = fixture(), video = track('video'), audio = track('audio');
  rtc.screenStream = new Stream([video, audio]);
  let detachedAudio = false;
  rtc.video.sender.replaceTrack = async () => { throw Error('Sender closed'); };
  rtc.system.sender.replaceTrack = async () => { detachedAudio = true; };
  await rtc.stopShare();
  assert.equal(video.stopped, true); assert.equal(audio.stopped, true);
  assert.equal(detachedAudio, true); assert.equal(rtc.state().sharing, false);
});

test('failed screen attachment releases every capture track and resets sharing state', async () => {
  const rtc = fixture(), video = track('video'), audio = track('audio');
  rtc.system.sender.replaceTrack = async value => { if (value) throw Error('Audio negotiation failed'); };
  await assert.rejects(rtc.share(new Stream([video, audio])), /Audio negotiation/);
  assert.equal(video.stopped, true); assert.equal(audio.stopped, true);
  assert.equal(rtc.state().sharing, false); assert.equal(rtc.captureSettings, null);
});

test('screen constraint completion after hangup cannot attach capture to a later call', async () => {
  const rtc = fixture(), constraints = deferred(), video = track('video');
  video.applyConstraints = () => constraints.promise;
  const sharing = rtc.share(new Stream([video]));
  await new Promise(resolve => setImmediate(resolve));
  await rtc.hangup();
  const next = fixture(); let attachments = 0;
  next.video.sender.replaceTrack = async () => { attachments++; };
  rtc.pc = next.pc; rtc.video = next.video; rtc.system = next.system; rtc.phase = 'connected';
  constraints.resolve();
  await assert.rejects(sharing, /Call changed/);
  assert.equal(video.stopped, true); assert.equal(attachments, 0);
  assert.equal(rtc.pc, next.pc);
  rtc.cleanup();
});

test('microphone permission resolving after hangup releases the new device', async () => {
  const rtc = fixture(), permission = deferred(), oldMic = track('audio'), newMic = track('audio');
  rtc.localStream = new Stream([oldMic]); rtc.mic = () => permission.promise;
  const replacing = rtc.setMicrophone('other-device');
  await rtc.hangup(); permission.resolve(new Stream([newMic]));
  await assert.rejects(replacing, /Call changed/);
  assert.equal(oldMic.stopped, true); assert.equal(newMic.stopped, true);
  assert.equal(rtc.localStream, null);
});
