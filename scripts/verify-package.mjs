// Runs after electron-builder: fails the build if the newest app.asar under release/ is missing
// any package the app needs at runtime (package.json "dependencies" and everything they depend on).
//
// Why: v0.11.0 to v0.12.1 shipped with only electron-updater and semver in node_modules, because
// they were built in git worktrees whose node_modules was a symlink to another checkout, and
// electron-builder then packs the direct dependencies only. require('electron-updater') threw on
// every check, so no installed copy could update itself, and nothing said so.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const fail = (msg) => { console.error(`verify-package: ${msg}`); process.exit(1); };

const nm = path.join(root, 'node_modules');
if (fs.lstatSync(nm).isSymbolicLink()) {
  fail('node_modules is a symlink. electron-builder then packs only the direct dependencies. Run `npm ci` in this checkout and build again.');
}

/**
 * Every runtime dependency edge: the package `name` at `version`, required from `from` (a path
 * relative to the repo root, '' for the app itself).
 */
function runtimeEdges() {
  const edges = [];
  const seen = new Set();
  const resolve = (name, fromDir) => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
      if (path.resolve(dir) === root) return null;
    }
  };
  const visit = (pkgDir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const from = path.relative(root, pkgDir).split(path.sep).join('/');
    const deps = [...Object.keys(pkg.dependencies || {}).map((n) => [n, true]), ...Object.keys(pkg.optionalDependencies || {}).map((n) => [n, false])];
    for (const [name, required] of deps) {
      const dir = resolve(name, pkgDir);
      if (!dir) {
        if (required) fail(`${name} (needed by ${pkg.name}) is not installed. Run \`npm ci\`.`);
        continue;
      }
      const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      edges.push({ name, version, from });
      if (seen.has(dir)) continue;
      seen.add(dir);
      visit(dir);
    }
  };
  visit(root);
  return edges;
}

function newestAsar() {
  const release = path.join(root, 'release');
  const all = fs.existsSync(release) ? fs.readdirSync(release)
    .map((d) => path.join(release, d, 'resources', 'app.asar'))
    .filter((f) => fs.existsSync(f)) : [];
  if (!all.length) fail('no release/*/resources/app.asar to check. Run electron-builder first.');
  return all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const file = newestAsar();
const listed = new Set(asar.listPackage(file, { isPack: false }).map((p) => p.split(path.sep).join('/').replace(/^\//, '')));
// extractFile splits on path.sep, so on Windows a '/' path is never found.
const versionIn = (rel) => JSON.parse(asar.extractFile(file, rel.split('/').join(path.sep)).toString('utf8')).version;
/** Node's lookup inside the archive: <from>/node_modules/<name>, then each parent folder's. */
function resolveInAsar(name, from) {
  for (let dir = from; ; dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') {
    const rel = `${dir ? dir + '/' : ''}node_modules/${name}/package.json`;
    if (listed.has(rel)) return rel;
    if (!dir) return null;
  }
}
const edges = runtimeEdges();
const problems = [];
for (const { name, version, from } of edges) {
  const rel = resolveInAsar(name, from);
  const by = from || 'the app';
  if (!rel) problems.push(`${name} (needed by ${by}) is missing`);
  else if (versionIn(rel) !== version) problems.push(`${name} (needed by ${by}) resolves to ${versionIn(rel)} at ${rel}, installed is ${version}`);
}
const unique = [...new Set(problems)].sort();
if (unique.length) fail(`${path.relative(root, file)}: ${unique.length} runtime dependency problems:\n  ${unique.join('\n  ')}`);
console.log(`verify-package: ${path.relative(root, file)} resolves all ${new Set(edges.map((e) => e.name + '@' + e.version)).size} runtime packages`);
