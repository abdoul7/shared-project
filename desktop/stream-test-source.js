import { startTestPattern } from './test-pattern.js';
// Supply fresh motion between independent source and capture clocks. A 60Hz
// animation sampled at 60Hz can coalesce updates and underfeed the pipeline.
const pattern = startTestPattern(document.getElementById('pattern'), 120, { motion: new URLSearchParams(location.search).get('motion') === '1' });
window.testPatternState = () => pattern.stats();
window.addEventListener('beforeunload', () => pattern.stop());
