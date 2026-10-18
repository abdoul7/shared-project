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
