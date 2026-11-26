// Checks a rebuilt table against the mods it is for: node test/check-fit.mjs <table or table mod .zip> [--vanilla <table>] <mod>...
// Fails if any copy of a romfs file in the mods needs more than its entry (or has no entry where a rule gives a size),
// if a geometry model still has an entry, or if an entry of vanilla's table (--vanilla) or of a mod's own table came out
// smaller or gone (removed models aside). Same code as the patcher pages' checks (checkFit in lib/rstb.js).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../lib/formats.js'), R = require('../lib/rstb.js'), M = require('../lib/mods.js'), fzstd = require('../vendor/fzstd.umd.js');

const a = process.argv.slice(2), inputs = []; let vanilla = null;
for (let i = 0; i < a.length; i++) { if (a[i] === '--vanilla') vanilla = a[++i]; else inputs.push(a[i]); }
const [tablePath, ...modPaths] = inputs;
if (!modPaths.length) { console.error('usage: check-fit.mjs <table or table mod .zip> [--vanilla <table>] <mod .zip|.7z|folder>...'); process.exit(2); }
let table = new Uint8Array(fs.readFileSync(tablePath));
if (table[0] === 0x50 && table[1] === 0x4B) {
  const files = await F.readZip(table), k = [...files.keys()].filter(n => R.romfsPath(n) === R.TABLE);
  if (k.length !== 1) { console.log(`FAIL: ${tablePath} holds ${k.length} size tables`); process.exit(1); }
  console.log(`table mod: ${k[0]}${files.size > 1 ? ` (and ${files.size - 1} other files)` : ''}`);
  table = await files.get(k[0])();
}
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mods = [];
for (const p of modPaths) {
  if (fs.statSync(p).isDirectory()) mods.push(...(await M.folderMods(path.basename(p), walk(p).map(f => [path.relative(p, f).split(path.sep).join('/'), async () => fs.readFileSync(f)]))).mods);
  else mods.push(await M.readMod(path.basename(p), new Uint8Array(fs.readFileSync(p))));
}
const t0 = Date.now();
const r = await R.checkFit(table, mods, d => fzstd.decompress(d), vanilla ? [{ name: 'vanilla', table: fs.readFileSync(vanilla) }] : []);
for (const l of r.lowered) console.log(`vs ${l.name}'s table (${l.entries} entries): ${l.n} lowered or dropped, removed models aside`);
console.log(`table ${r.magic}, ${r.entries} entries. Files: ${r.sized} sized, ${r.removed} geometry models, ${r.noRule} with no rule. ${Date.now() - t0} ms`);
if (r.fails.length) { console.log(`FAIL (${r.fails.length}):`); for (const f of r.fails.slice(0, 40)) console.log('  ' + f); process.exit(1); }
console.log('OK: every file fits its entry');
