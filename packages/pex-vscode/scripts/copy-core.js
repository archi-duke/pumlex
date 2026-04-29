#!/usr/bin/env node
/* Copy @archi-duke/pex-core JS files into local lib/ so they get bundled
 * into the .vsix (vsce package --no-dependencies skips node_modules).
 * Source resolves via require.resolve so it works in the workspace symlink layout
 * and in any future flat install.
 */
const fs = require('fs');
const path = require('path');

const FILES = ['geom.js', 'meta.js', 'inline.js'];

function resolveCoreDir() {
  // Resolve through an entry that's exposed in pex-core's `exports` map, then
  // walk up. (Resolving package.json directly can fail under strict exports.)
  const entry = require.resolve('@archi-duke/pex-core/geom');
  return path.dirname(entry);
}

function main() {
  const coreDir = resolveCoreDir();
  const destDir = path.join(__dirname, '..', 'lib');
  fs.mkdirSync(destDir, { recursive: true });

  for (const f of FILES) {
    const src = path.join(coreDir, f);
    const dst = path.join(destDir, `pex-${f.replace('.js', '')}.js`);
    fs.copyFileSync(src, dst);
    process.stdout.write(`copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dst)}\n`);
  }
}

main();
