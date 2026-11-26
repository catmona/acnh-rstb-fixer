'use strict';
// Page logic: collect mods (zip, 7z, folders), run rebuild(), offer the table as a small mod for the player's platform.
// The lib comes from lib/page.js (window.ACNH_RSTB), the same entry point the patcher pages load.
(async function () {
const $ = id => document.getElementById(id);
const R = await ACNH_RSTB.load().catch(e => { $('status').className = 'err'; $('status').textContent = e.message; throw e; });
const mods = [];   // { name, files: Map(path -> async () => bytes), count, hasTable }
let base = null, platform = null;
const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bytesOf = f => f.arrayBuffer().then(b => new Uint8Array(b));
const status = (html, cls = '') => { $('status').className = cls; $('status').innerHTML = html; };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

function addMod(name, files) {
  let count = 0, hasTable = false;
  for (const p of files.keys()) { const r = R.romfsPath(p); if (!r) continue; if (r === R.TABLE) hasTable = true; else count++; }
  mods.push({ name, files, count, hasTable }); render();
}
async function addArchive(file) {
  try { const m = await R.readMod(file.name, await bytesOf(file)); addMod(m.name, m.files); }
  catch (e) { status(esc(e.message), 'err'); }
}
async function addFolder(name, list) {   // list: [[path inside the folder, File]]
  const r = await R.folderMods(name, list.map(([p, f]) => [p, () => bytesOf(f)]));
  for (const m of r.mods) addMod(m.name, m.files);
  status(r.notes.map(esc).join('<br>'), r.notes.length ? 'warn' : '');
}
async function entryFiles(entry, pre = '') {   // drag-and-drop folder walk
  if (entry.isFile) return [[pre + entry.name, await new Promise((ok, no) => entry.file(ok, no))]];
  const r = entry.createReader(), out = [];
  for (;;) { const batch = await new Promise((ok, no) => r.readEntries(ok, no)); if (!batch.length) break; for (const e of batch) out.push(...await entryFiles(e, pre + entry.name + '/')); }
  return out;
}

$('plats').innerHTML = Object.entries(R.PLATFORMS).map(([k, p]) =>
  `<label><input type="radio" name="plat" value="${k}"> ${esc(p.label)}</label>`).join('');
const pickPlat = k => { platform = k; store.set('acnh-rstb-platform', k); $('steps').innerHTML = R.PLATFORMS[k].steps.map(s => `<li>${esc(s)}</li>`).join(''); render(); };
$('plats').addEventListener('change', e => pickPlat(e.target.value));
const saved = store.get('acnh-rstb-platform');
if (saved && R.PLATFORMS[saved]) { $('plats').querySelector(`input[value="${saved}"]`).checked = true; pickPlat(saved); }

function render() {
  $('mods').innerHTML = mods.map((m, i) => `<li><span class="name">${esc(m.name)}</span>
    ${m.hasTable ? '<span class="tag">has a size table</span>' : ''}
    <span class="meta">${m.count ? fmt(m.count) + ' romfs files' : '<span class="warn">no romfs files</span>'}</span>
    <button class="x" data-i="${i}" title="Remove">✕</button></li>`).join('');
  $('build').disabled = !mods.length || !platform;
  $('build').textContent = platform ? 'Build size table' : 'Build size table (pick where you play first)';
}
$('mods').addEventListener('click', e => { const b = e.target.closest('button.x'); if (b) { mods.splice(+b.dataset.i, 1); render(); } });
$('pickFiles').addEventListener('change', async e => { for (const f of e.target.files) await addArchive(f); e.target.value = ''; });
$('pickDir').addEventListener('change', async e => {
  const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
  const top = fs[0].webkitRelativePath.split('/')[0];
  await addFolder(top, fs.map(f => [f.webkitRelativePath.split('/').slice(1).join('/'), f]));
});
$('pickBase').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const u = await bytesOf(f); R.tableParse(u); base = u; $('baseName').textContent = f.name; $('baseName').className = 'ok'; }
  catch (err) { base = null; $('baseName').textContent = f.name + ': ' + err.message; $('baseName').className = 'err'; }
  e.target.value = '';
});
const drop = $('drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async e => {
  e.preventDefault(); drop.classList.remove('over');
  const entries = [...e.dataTransfer.items].map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) { for (const f of e.dataTransfer.files) await addArchive(f); return; }
  for (const en of entries) {
    if (en.isDirectory) { status('Reading ' + esc(en.name) + '…'); const list = await entryFiles(en); await addFolder(en.name, list.map(([p, f]) => [p.split('/').slice(1).join('/'), f])); }
    else await addArchive(await new Promise((ok, no) => en.file(ok, no)));
  }
});

const ACTION = { raised: 'Raised', added: 'Added', removed: 'Entry removed (game sizes it)', kept: 'Already big enough', none: 'No entry (game sizes it)' };
$('build').addEventListener('click', async () => {
  $('build').disabled = true; $('result').innerHTML = '';
  try {
    const t0 = performance.now();
    const r = await R.buildTableMod(platform, mods, base, d => R.fzstd.decompress(d), (i, n) => { if (i % 50 === 0 || i === n) status(`Checking files: ${fmt(i)} of ${fmt(n)}`); });
    const zip = R.writeZip(r.mod.entries), bare = new Blob([r.table], { type: 'application/octet-stream' });
    const count = a => r.rows.filter(x => x.action === a).length;
    status(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. ${fmt(r.entries)} entries.`, 'ok');
    const changed = r.rows.filter(x => x.action !== 'kept').sort((a, b) => a.action.localeCompare(b.action) || a.path.localeCompare(b.path));
    const dupes = r.rows.filter(x => x.mods.length > 1);
    $('result').innerHTML = `
      <div class="row" style="justify-content:flex-start">
        <a class="btn primary" download="${esc(r.mod.name)}" href="${URL.createObjectURL(zip)}">Download ${esc(r.mod.name)}</a>
        <a class="btn" download="ResourceSizeTable.srsizetable" href="${URL.createObjectURL(bare)}">Just the .srsizetable</a>
      </div>
      <p>For ${esc(r.mod.label)}. Install it with the steps under <b>Install</b> below.</p>
      <p>${fmt(count('raised'))} raised, ${fmt(count('added'))} added, ${fmt(count('removed'))} model entries removed, ${fmt(count('kept'))} already big enough.</p>
      ${r.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}
      ${dupes.length ? `<p class="warn">${fmt(dupes.length)} files are in more than one mod. Only one copy is used in game, so the table fits the biggest copy. See the list below.</p>` : ''}
      <details><summary>Every change (${fmt(changed.length)})</summary><div class="scroll"><table>
        <tr><th>File</th><th>Change</th><th class="n">Old</th><th class="n">New</th></tr>
        ${changed.map(x => `<tr><td>${esc(x.path)}<br><span class="muted">${esc(x.mods.join(', '))}</span></td><td>${ACTION[x.action]}</td><td class="n">${x.old != null ? fmt(x.old) : ''}</td><td class="n">${x.size != null && x.action !== 'removed' ? fmt(x.size) : ''}</td></tr>`).join('')}
      </table></div></details>`;
  } catch (e) { status(esc(e.message), 'err'); console.error(e); }
  render();
});
render();
})();
