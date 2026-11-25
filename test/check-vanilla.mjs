// Checks the size rules against a vanilla game: node test/check-vanilla.mjs <vanilla table> <romfs dir>...
// For every file a rule covers, compares the rule's size with vanilla's own entry. "under" (rule smaller than
// vanilla) is the case that would crash the game, so it must stay at zero. Also round-trips the table.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../lib/formats.js'), R = require('../lib/rstb.js'), fzstd = require('../vendor/fzstd.umd.js');

const [tablePath, ...dirs] = process.argv.slice(2);
if (!dirs.length) { console.error('usage: check-vanilla.mjs <vanilla table> <romfs dir>...'); process.exit(2); }
const raw = fs.readFileSync(tablePath), T = R.tableParse(raw);
const dec = F.yaz0Dec(raw), again = F.yaz0Dec(R.tableWrite(T));
console.log(`table ${T.magic}: ${T.hashed.size} hashed + ${T.named.size} named entries; round trip ${Buffer.compare(dec, again) === 0 ? 'identical' : 'DIFFERENT'}`);

const stats = new Map(), unders = [], seen = new Set();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const dir of dirs) for (const full of walk(dir)) {
  let rel = path.relative(dir, full).split(path.sep).join('/');
  if (rel === R.TABLE || rel === 'list.tsv') continue;
  const zs = rel.endsWith('.zs'); if (zs) rel = rel.slice(0, -3);
  if (seen.has(rel)) continue; seen.add(rel);
  let d = fs.readFileSync(full); if (zs) d = fzstd.decompress(d);
  const s = R.sizeFor(rel, d); if (!s) continue;
  const e = R.tableGet(T, rel), st = stats.get(s.rule) || { files: 0, exact: 0, over: 0, overBytes: 0, under: 0, noEntry: 0, removed: 0 };
  stats.set(s.rule, st); st.files++;
  if (s.remove) { st.removed++; continue; }
  if (!e) { st.noEntry++; continue; }
  if (s.size === e[0]) st.exact++;
  else if (s.size > e[0]) { st.over++; st.overBytes += s.size - e[0]; }
  else { st.under++; unders.push(`${rel}: rule ${s.size}, vanilla ${e[0]} (${e[0] - s.size} short)`); }
}
console.table([...stats].map(([rule, s]) => ({ rule, ...s })));
if (unders.length) { console.log('UNDER (would be too small):'); for (const u of unders.slice(0, 40)) console.log('  ' + u); }
process.exit(unders.length ? 1 : 0);
