// Command-line rebuild, same code as the page:
//   node test/rebuild.mjs [--base <table>] [--mod <peanuts|switch|yuzu|ryujinx>] --out <file> <mod .zip|.7z|folder>...
// --out gets the bare table, or with --mod the table mod's zip for that platform. A folder can be one mod or a folder of
// mods (read as the page reads it: every romfs folder is a mod, and mods turned off in their mod.json are left out).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../lib/formats.js'), M = require('../lib/mods.js'), fzstd = require('../vendor/fzstd.umd.js');

const a = process.argv.slice(2); let base = null, out = null, platform = null; const inputs = [];
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--base') base = fs.readFileSync(a[++i]); else if (a[i] === '--out') out = a[++i]; else if (a[i] === '--mod') platform = a[++i]; else inputs.push(a[i]);
}
if (!out || !inputs.length || (platform && !M.PLATFORMS[platform])) { console.error('usage: rebuild.mjs [--base <table>] [--mod <' + Object.keys(M.PLATFORMS).join('|') + '>] --out <file> <mod>...'); process.exit(2); }
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mods = [];
for (const p of inputs) {
  if (fs.statSync(p).isDirectory()) {
    const r = await M.folderMods(path.basename(p), walk(p).map(f => [path.relative(p, f).split(path.sep).join('/'), async () => fs.readFileSync(f)]));
    for (const n of r.notes) console.log(n);
    mods.push(...r.mods);
  } else mods.push(await M.readMod(path.basename(p), new Uint8Array(fs.readFileSync(p))));
}
const t0 = Date.now(), r = await M.buildTableMod(platform || 'switch', mods, base, d => fzstd.decompress(d));
fs.writeFileSync(out, platform ? new Uint8Array(await F.writeZip(r.mod.entries).arrayBuffer()) : r.table);
for (const n of r.notes) console.log(n);
const by = {}; for (const x of r.rows) { const k = x.action + ' / ' + x.rule; by[k] = (by[k] || 0) + 1; }
console.table(by);
console.log(`${r.entries} entries, ${r.table.length} bytes, ${Date.now() - t0} ms -> ${out}` + (platform ? ` (${r.mod.label}: ${r.mod.entries[0][0]})` : ''));
if (process.env.ROWS) for (const x of r.rows.filter(x => x.action !== 'kept' && x.action !== 'none')) console.log(x.action, x.path, x.old ?? '', x.size ?? '');
