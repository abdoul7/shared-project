import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStream } from '../desktop/stream-metrics.js';
const samples = (fps = 60, seconds = 60) => Array.from({ length: seconds + 1 }, (_, i) => ({ incoming: [{ kind: 'video', timestamp: i * 1000, framesDecoded: i * fps, bytes: i * 100000, width: 2560, height: 1440, fps: 60, framesDropped: 0, freezeCount: 0 }] }));
test('audio-only measurements safely wait for video', () => {
  assert.equal(summarizeStream([{ incoming: [{ kind: 'audio' }] }, {}]).targetMet, false);
});
test('sustained target requires a full minute of actual decoded frames at 1440p', () => {
  const report = summarizeStream(samples());
  assert.equal(report.targetMet, true); assert.equal(report.averageFps, 60); assert.equal(report.durationSeconds, 60);
  assert.equal(summarizeStream(samples(60, 59)).targetMet, false);
});
test('instantaneous 60fps cannot hide a slower stream or earlier lower resolution', () => {
  assert.equal(summarizeStream(samples(50)).targetMet, false);
  const changed = samples(); changed[30].incoming[0].height = 720;
  assert.equal(summarizeStream(changed).targetMet, false);
});
test('freezes, dropped frames and restarted counters prevent a target pass', () => {
  const dropped = samples(); dropped.at(-1).incoming[0].framesDropped = 1;
  assert.equal(summarizeStream(dropped).targetMet, false);
  const frozen = samples(); frozen.at(-1).incoming[0].freezeCount = 1;
  assert.equal(summarizeStream(frozen).targetMet, false);
  const restarted = samples(); restarted[40].incoming[0].framesDecoded = 0;
  assert.equal(summarizeStream(restarted).targetMet, false);
});
test('old startup samples age out and nominal 59.94Hz remains explicitly measured', () => {
  const points = samples(59.94, 90); points[0].incoming[0].height = 720;
  const report = summarizeStream(points);
  assert.equal(report.targetMet, true); assert.ok(Math.abs(report.averageFps - 59.94) < .001);
  assert.equal(report.durationSeconds, 60);
});
