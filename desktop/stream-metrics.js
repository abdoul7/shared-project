// A 60fps label in one getStats snapshot is not a sustained-performance result.
export function summarizeStream(samples, direction = 'incoming', windowSeconds = 60) {
  const counter = direction === 'incoming' ? 'framesDecoded' : 'framesEncoded';
  const points = samples.map(sample => sample[direction]?.find(r => r.kind === 'video'))
    .filter(r => r && Number.isFinite(r.timestamp) && Number.isFinite(r[counter]));
  if (points.length < 2) return { targetMet: false, reason: 'Waiting for video measurements' };
  const last = points.at(-1), cutoff = last.timestamp - windowSeconds * 1000;
  let firstIndex = points.findIndex(r => r.timestamp >= cutoff);
  if (firstIndex > 0 && points[firstIndex].timestamp > cutoff) firstIndex--;
  const selected = points.slice(Math.max(0, firstIndex));
  const first = selected[0], elapsed = (last.timestamp - first.timestamp) / 1000;
  const reset = selected.some((r, i) => i && (r[counter] < selected[i - 1][counter] || r.timestamp <= selected[i - 1].timestamp));
  if (elapsed <= 0 || reset) return { targetMet: false, reason: 'Video counters restarted; collecting a fresh window' };
  const frames = last[counter] - first[counter];
  const averageFps = frames / elapsed;
  const stable1440p = selected.every(r => r.width === 2560 && r.height === 1440);
  const droppedFrames = Math.max(0, (last.framesDropped || 0) - (first.framesDropped || 0));
  const freezes = Math.max(0, (last.freezeCount || 0) - (first.freezeCount || 0));
  // Nominal 60Hz capture can measure 59.94/59.99. Record the actual number and
  // declare the small tolerance, never silently round a 30/50fps stream to 60.
  const targetMet = elapsed >= windowSeconds && stable1440p && averageFps >= 59.9 && droppedFrames === 0 && freezes === 0;
  return {
    direction, durationSeconds: elapsed, frames, averageFps,
    width: last.width, height: last.height, stable1440p, droppedFrames, freezes,
    bitrateBps: Math.max(0, (last.bytes || 0) - (first.bytes || 0)) * 8 / elapsed,
    targetMet, target: { width: 2560, height: 1440, nominalFps: 60, minimumMeasuredFps: 59.9, requiredSeconds: windowSeconds },
    reason: targetMet ? 'Measured nominal 1440p60 over the full window' : elapsed < windowSeconds ? 'Collecting a full measurement window' : !stable1440p ? 'Resolution was below 1440p during this window' : 'Frame rate, drops or freezes missed the target',
  };
}
