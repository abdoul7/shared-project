// Test-only source clock. Absolute animation slots avoid setInterval(16) drifting
// against a 60Hz capture clock and silently producing a lower effective rate.
export function startTestPattern(canvas, fps = 60) {
  const context = canvas.getContext('2d');
  const started = performance.now();
  let previous = -1, frames = 0, animation, stopped = false;
  const draw = now => {
    if (stopped) return;
    const slot = Math.floor((now - started) * fps / 1000);
    if (slot !== previous) {
      previous = slot; frames++;
      context.fillStyle = '#d8e3d8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#17291e'; context.font = '72px sans-serif';
      context.fillText('STILLROOM SYNTHETIC TEST ONLY', 80, 150);
      context.fillText(`Frame ${slot}`, 80, 260);
      context.fillRect((slot * 17) % (canvas.width - 120), 500, 120, 120);
    }
    animation = requestAnimationFrame(draw);
  };
  animation = requestAnimationFrame(draw);
  return {
    stats: () => ({ frames, elapsedSeconds: (performance.now() - started) / 1000 }),
    stop: () => { stopped = true; cancelAnimationFrame(animation); },
  };
}
