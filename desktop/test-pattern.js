// Test-only source clock. Absolute animation slots avoid setInterval(16) drifting
// against a 60Hz capture clock and silently producing a lower effective rate.
export function startTestPattern(canvas, fps = 60, { motion = false } = {}) {
  const context = canvas.getContext('2d');
  let texture;
  if (motion) {
    const tile = document.createElement('canvas'); tile.width = tile.height = 512;
    const painter = tile.getContext('2d');
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) {
      painter.fillStyle = `hsl(${(x * 7 + y * 3) % 360} 45% ${30 + ((x + y) % 35)}%)`;
      painter.fillRect(x, y, 32, 32); painter.fillStyle = '#18232b'; painter.fillRect(x + 7, y + 5, 13, 19);
    }
    texture = context.createPattern(tile, 'repeat');
  }
  const started = performance.now();
  let previous = -1, frames = 0, animation, stopped = false;
  const draw = now => {
    if (stopped) return;
    const slot = Math.floor((now - started) * fps / 1000);
    if (slot !== previous) {
      previous = slot; frames++;
      context.fillStyle = '#d8e3d8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (texture) {
        const x = (slot * 3) % 512, y = slot % 512;
        context.save(); context.translate(x, y); context.fillStyle = texture;
        context.fillRect(-x, -y, canvas.width, canvas.height); context.restore();
        context.fillStyle = '#d8e3d8'; context.fillRect(50, 50, 1850, 260);
      }
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
