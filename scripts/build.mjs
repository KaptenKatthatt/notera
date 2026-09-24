import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const prod = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const opts = {
  entryPoints: [path.join(root, 'src/renderer/app.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome134'],
  outfile: path.join(root, 'dist/renderer.js'),
  sourcemap: prod ? false : 'inline',
  minify: prod,
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
}
