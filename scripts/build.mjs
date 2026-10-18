import { packager } from '@electron/packager';

// Use the API so Windows cmd.exe never interprets regex alternation as a pipe.
const outputs = await packager({
  dir: '.',
  name: 'Stillroom',
  platform: 'win32',
  arch: 'x64',
  out: 'dist',
  overwrite: true,
  asar: true,
  prune: true,
  ignore: /^\/(?:docs|test|scripts|server|github-.*|\.git|\.local|profiles|reference-private)(?:\/|$)/,
});
console.log(`Windows development build: ${outputs.join(', ')}`);
