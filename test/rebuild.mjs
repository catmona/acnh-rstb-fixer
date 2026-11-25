// Command-line rebuild, same code as the page: node test/rebuild.mjs [--base <table>] --out <file> <mod .zip|.7z|folder>...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../lib/formats.js'), R = require('../lib/rstb.js'), fzstd = require('../vendor/fzstd.umd.js');

const a = process.argv.slice(2); let base = null, out = null; const inputs = [];
for (let i = 0; i < a.length; i++) { if (a[i] === '--base') base = fs.readFileSync(a[++i]); else if (a[i] === '--out') out = a[++i]; else inputs.push(a[i]); }
if (!out || !inputs.length) { console.error('usage: rebuild.mjs [--base <table>] --out <file> <mod>...'); process.exit(2); }
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mods = [];
for (const p of inputs) {
  let files;
  if (fs.statSync(p).isDirectory()) { files = new Map(); for (const f of walk(p)) files.set(path.relative(p, f).split(path.sep).join('/'), async () => fs.readFileSync(f)); }
  else { const u = new Uint8Array(fs.readFileSync(p)); files = p.toLowerCase().endsWith('.7z') ? await F.read7z(u) : await F.readZip(u); }
  mods.push({ name: path.basename(p), files });
}
const t0 = Date.now(), r = await R.rebuild(mods, base, d => fzstd.decompress(d));
fs.writeFileSync(out, r.table);
for (const n of r.notes) console.log(n);
const by = {}; for (const x of r.rows) { const k = x.action + ' / ' + x.rule; by[k] = (by[k] || 0) + 1; }
console.table(by);
console.log(`${r.entries} entries, ${r.table.length} bytes, ${Date.now() - t0} ms -> ${out}`);
if (process.env.ROWS) for (const x of r.rows.filter(x => x.action !== 'kept' && x.action !== 'none')) console.log(x.action, x.path, x.old ?? '', x.size ?? '');
