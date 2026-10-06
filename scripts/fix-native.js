#!/usr/bin/env node
/**
 * Recovery helper for the better-sqlite3 native binding.
 *
 * On some locked-down environments `prebuild-install` cannot detect the libc /
 * reach GitHub releases during `npm install`, which then tries a source build
 * and fails. This script side-loads the official prebuilt binary for the
 * running Node version directly from the better-sqlite3 GitHub release.
 *
 * Usage (from the repository root):
 *   node scripts/fix-native.js
 *
 * It is a no-op when better-sqlite3 already loads.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const moduleDir = path.join(root, 'node_modules', 'better-sqlite3');

function tryLoad() {
  try {
    // The native binding is only loaded when a Database is constructed.
    const Database = require(path.join(root, 'node_modules', 'better-sqlite3'));
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const https = require('node:https');
    https
      .get(url, { headers: { 'user-agent': 'rat-fix-native' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return resolve(download(res.headers.location, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

(async () => {
  if (tryLoad()) {
    console.log('[fix-native] better-sqlite3 already loads — nothing to do.');
    return;
  }
  if (!fs.existsSync(moduleDir)) {
    console.error('[fix-native] node_modules/better-sqlite3 not found — run `npm install --ignore-scripts` first.');
    process.exit(1);
  }

  const version = JSON.parse(fs.readFileSync(path.join(moduleDir, 'package.json'), 'utf8')).version;
  const abi = process.versions.modules;
  const { platform, arch } = process;
  const asset = `better-sqlite3-v${version}-node-v${abi}-${platform}-${arch}.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${asset}`;

  console.log(`[fix-native] downloading ${asset} ...`);
  const buffer = await download(url);
  const tmpFile = path.join(os.tmpdir(), asset);
  fs.writeFileSync(tmpFile, buffer);

  console.log(`[fix-native] extracting into ${moduleDir} ...`);
  execFileSync('tar', ['-xzf', tmpFile, '-C', moduleDir], { stdio: 'inherit' });
  fs.rmSync(tmpFile, { force: true });

  if (!tryLoad()) {
    console.error('[fix-native] extraction finished but the module still does not load.');
    process.exit(1);
  }
  console.log('[fix-native] done — better-sqlite3 loads correctly.');
})();
