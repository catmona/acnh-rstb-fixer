'use strict';
// Page logic: collect mods (zip, 7z, folders), run rebuild(), offer the result.
const $ = id => document.getElementById(id);
const mods = [];   // { name, files: Map(path -> async () => bytes), count, hasTable }
let base = null;
const TID = '01006F8002326000';
const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bytesOf = f => f.arrayBuffer().then(b => new Uint8Array(b));
const status = (html, cls = '') => { $('status').className = cls; $('status').innerHTML = html; };

function addMod(name, files) {
  let count = 0, hasTable = false;
  for (const p of files.keys()) { const r = romfsPath(p); if (!r) continue; if (r === TABLE) hasTable = true; else count++; }
  mods.push({ name, files, count, hasTable }); render();
}
async function addArchive(file) {
  try {
    const u = await bytesOf(file), sig = u.subarray(0, 2);
    const files = sig[0] === 0x37 && sig[1] === 0x7A ? await read7z(u) : sig[0] === 0x50 && sig[1] === 0x4B ? await readZip(u) : null;
    if (!files) throw new Error('not a .zip or .7z file' + (sig[0] === 0x52 && sig[1] === 0x61 ? ' (it is a .rar: extract it and add the folder)' : ''));
    addMod(file.name, files);
  } catch (e) { status(`${esc(file.name)}: ${esc(e.message)}`, 'err'); }
}
function addFolderFiles(name, list) {   // list: [[relative path, File]]
  const files = new Map(); for (const [p, f] of list) files.set(p, () => bytesOf(f));
  addMod(name, files);
}
async function entryFiles(entry, pre = '') {   // drag-and-drop folder walk
  if (entry.isFile) return [[pre + entry.name, await new Promise((ok, no) => entry.file(ok, no))]];
  const r = entry.createReader(), out = [];
  for (;;) { const batch = await new Promise((ok, no) => r.readEntries(ok, no)); if (!batch.length) break; for (const e of batch) out.push(...await entryFiles(e, pre + entry.name + '/')); }
  return out;
}

function render() {
  $('mods').innerHTML = mods.map((m, i) => `<li><span class="name">${esc(m.name)}</span>
    ${m.hasTable ? '<span class="tag">has a size table</span>' : ''}
    <span class="meta">${m.count ? fmt(m.count) + ' romfs files' : '<span class="warn">no romfs files</span>'}</span>
    <button class="x" data-i="${i}" title="Remove">✕</button></li>`).join('');
  $('build').disabled = !mods.length;
}
$('mods').addEventListener('click', e => { const b = e.target.closest('button.x'); if (b) { mods.splice(+b.dataset.i, 1); render(); } });
$('pickFiles').addEventListener('change', async e => { for (const f of e.target.files) await addArchive(f); e.target.value = ''; });
$('pickDir').addEventListener('change', e => {
  const fs = [...e.target.files]; if (!fs.length) return;
  const top = fs[0].webkitRelativePath.split('/')[0];
  addFolderFiles(top, fs.map(f => [f.webkitRelativePath.split('/').slice(1).join('/'), f])); e.target.value = '';
});
$('pickBase').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const u = await bytesOf(f); tableParse(u); base = u; $('baseName').textContent = f.name; $('baseName').className = 'ok'; }
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
    if (en.isDirectory) { status('Reading ' + esc(en.name) + '…'); const list = await entryFiles(en); addFolderFiles(en.name, list.map(([p, f]) => [p.split('/').slice(1).join('/'), f])); status(''); }
    else await addArchive(await new Promise((ok, no) => en.file(ok, no)));
  }
});

const ACTION = { raised: 'Raised', added: 'Added', removed: 'Entry removed (game sizes it)', kept: 'Already big enough', none: 'No entry (game sizes it)' };
$('build').addEventListener('click', async () => {
  $('build').disabled = true; $('result').innerHTML = '';
  try {
    const t0 = performance.now();
    const r = await rebuild(mods, base, d => fzstd.decompress(d), (i, n) => { if (i % 50 === 0 || i === n) status(`Checking files: ${fmt(i)} of ${fmt(n)}`); });
    const dirIn = `atmosphere/contents/${TID}/romfs/${TABLE}`;
    const zip = writeZip([[dirIn, r.table]]), bare = new Blob([r.table], { type: 'application/octet-stream' });
    const count = a => r.rows.filter(x => x.action === a).length;
    status(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. ${fmt(r.entries)} entries.`, 'ok');
    const changed = r.rows.filter(x => x.action !== 'kept').sort((a, b) => a.action.localeCompare(b.action) || a.path.localeCompare(b.path));
    const dupes = r.rows.filter(x => x.mods.length > 1);
    $('result').innerHTML = `
      <div class="row" style="justify-content:flex-start">
        <a class="btn primary" download="acnh-rstb-fix.zip" href="${URL.createObjectURL(zip)}">Download (.zip for the SD card)</a>
        <a class="btn" download="ResourceSizeTable.srsizetable" href="${URL.createObjectURL(bare)}">Just the .srsizetable</a>
      </div>
      <p>${fmt(count('raised'))} raised, ${fmt(count('added'))} added, ${fmt(count('removed'))} model entries removed, ${fmt(count('kept'))} already big enough.</p>
      ${r.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}
      ${dupes.length ? `<p class="warn">${fmt(dupes.length)} files are in more than one mod. Only one copy is used in game, so the table fits the biggest copy. See the list below.</p>` : ''}
      <details><summary>Every change (${fmt(changed.length)})</summary><div class="scroll"><table>
        <tr><th>File</th><th>Change</th><th class="n">Old</th><th class="n">New</th></tr>
        ${changed.map(x => `<tr><td>${esc(x.path)}<br><span class="muted">${esc(x.mods.join(', '))}</span></td><td>${ACTION[x.action]}</td><td class="n">${x.old != null ? fmt(x.old) : ''}</td><td class="n">${x.size != null && x.action !== 'removed' ? fmt(x.size) : ''}</td></tr>`).join('')}
      </table></div></details>`;
  } catch (e) { status(esc(e.message), 'err'); console.error(e); }
  $('build').disabled = !mods.length;
});
