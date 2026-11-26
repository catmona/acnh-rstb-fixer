'use strict';
// Page logic: collect mods (zip, 7z, folders), run rebuild(), offer the table as a small mod for the player's platform.
// The lib comes from lib/page.js (window.ACNH_RSTB), the same entry point the patcher pages load.
(async function () {
const $ = id => document.getElementById(id);
const R = await ACNH_RSTB.load().catch(e => { $('status').className = 'err'; $('status').textContent = e.message; throw e; });
const mods = [];   // { name, files: Map(path -> async () => bytes), count, hasTable }
let base = null, platform = null, busy = false;
const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bytesOf = f => f.arrayBuffer().then(b => new Uint8Array(b));
const status = (html, cls = '') => { $('status').className = cls; $('status').innerHTML = html; };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
// A folder picker only where the browser has one and it's a computer: phones open a file picker without folders.
const canDir = 'webkitdirectory' in document.createElement('input') && !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
if (!canDir) { $('pickDirWrap').remove(); $('dropHint').innerHTML = 'Got a <b>.rar</b>? Extract it first, then zip the mod folder.'; }

function addMod(name, files) {
  let count = 0, hasTable = false;
  for (const p of files.keys()) { const r = R.romfsPath(p); if (!r) continue; if (r === R.TABLE) hasTable = true; else count++; }
  mods.push({ name, files, count, hasTable }); render();
}
async function addArchive(file) {
  try { status('Reading ' + esc(file.name) + '…'); const m = await R.readMod(file.name, await bytesOf(file)); addMod(m.name, m.files); ready(); }
  catch (e) { status(esc(file.name) + ': ' + esc(e.message), 'err'); }
}
async function addFolder(name, list) {   // list: [[path inside the folder, File]]
  const r = await R.folderMods(name, list.map(([p, f]) => [p, () => bytesOf(f)]));
  for (const m of r.mods) addMod(m.name, m.files);
  if (r.notes.length) status(r.notes.map(esc).join('<br>'), 'warn'); else ready();
}
async function entryFiles(entry, pre = '') {   // drag-and-drop folder walk
  if (entry.isFile) return [[pre + entry.name, await new Promise((ok, no) => entry.file(ok, no))]];
  const r = entry.createReader(), out = [];
  for (;;) { const batch = await new Promise((ok, no) => r.readEntries(ok, no)); if (!batch.length) break; for (const e of batch) out.push(...await entryFiles(e, pre + entry.name + '/')); }
  return out;
}

$('plats').innerHTML = Object.entries(R.PLATFORMS).map(([k, p]) =>
  `<label><input type="radio" name="plat" value="${k}"> ${esc(p.label)}</label>`).join('');
const pickPlat = k => { platform = k; store.set('acnh-rstb-platform', k); $('steps').innerHTML = R.PLATFORMS[k].steps.map(s => `<li><span>${esc(s)}</span></li>`).join(''); render(); ready(); };
$('plats').addEventListener('change', e => pickPlat(e.target.value));
const saved = store.get('acnh-rstb-platform');
if (saved && R.PLATFORMS[saved]) { $('plats').querySelector(`input[value="${saved}"]`).checked = true; pickPlat(saved); }

// What to do next, in the status box, whenever nothing else is being said there.
function ready() {
  if (busy) return;
  if (!mods.length) status('Add your mods to begin.');
  else if (!platform) status('Now pick where you play.');
  else status(`Ready: ${mods.length === 1 ? '1 mod' : mods.length + ' mods'}. Hit <b>Make my size table</b>.`);
}
function render() {
  $('mods').innerHTML = mods.map((m, i) => `<li class="${m.count ? '' : 'empty'}"><span class="name">${esc(m.name)}
    <small>${m.count ? fmt(m.count) + ' game files' : 'No game files: this mod changes nothing the table covers'}${m.hasTable ? ' · has a size table' : ''}</small></span>
    <button class="x" data-i="${i}" title="Remove ${esc(m.name)}" aria-label="Remove ${esc(m.name)}">✕</button></li>`).join('');
  $('step-1').classList.toggle('done', mods.length > 0);
  $('step-2').classList.toggle('done', !!platform);
  $('build').disabled = busy || !mods.length || !platform;
}
$('mods').addEventListener('click', e => { const b = e.target.closest('button.x'); if (b) { mods.splice(+b.dataset.i, 1); render(); ready(); } });
$('pickFiles').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await addArchive(f); });
if (canDir) $('pickDir').addEventListener('change', async e => {
  const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
  const top = fs[0].webkitRelativePath.split('/')[0];
  status('Reading ' + esc(top) + '…');
  await addFolder(top, fs.map(f => [f.webkitRelativePath.split('/').slice(1).join('/'), f]));
});
$('pickBase').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const u = await bytesOf(f); R.tableParse(u); base = u; $('baseName').textContent = '✓ ' + f.name; $('baseName').className = 'fname ok'; }
  catch (err) { base = null; $('baseName').textContent = f.name + ': ' + err.message; $('baseName').className = 'fname err'; }
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
  busy = true; render(); $('results').hidden = true; $('result').innerHTML = $('changes').innerHTML = '';
  try {
    const t0 = performance.now();
    const r = await R.buildTableMod(platform, mods, base, d => R.fzstd.decompress(d), (i, n) => { if (i % 50 === 0 || i === n) status(`Checking files: ${fmt(i)} of ${fmt(n)}`); });
    const zip = R.writeZip(r.mod.entries), bare = new Blob([r.table], { type: 'application/octet-stream' });
    const count = a => r.rows.filter(x => x.action === a).length;
    status(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. Your table has ${fmt(r.entries)} entries.`, 'ok');
    const changed = r.rows.filter(x => x.action !== 'kept').sort((a, b) => a.action.localeCompare(b.action) || a.path.localeCompare(b.path));
    const dupes = r.rows.filter(x => x.mods.length > 1);
    $('result').innerHTML = `
      <p>For ${esc(r.mod.label)}. It's a small mod that holds only the size table.</p>
      <div class="dlrow">
        <a class="dlb" download="${esc(r.mod.name)}" href="${URL.createObjectURL(zip)}">Download ${esc(r.mod.name)}</a>
        <a class="dlb alt" download="ResourceSizeTable.srsizetable" href="${URL.createObjectURL(bare)}">or just the .srsizetable</a>
      </div>
      <ul class="stats">
        <li><b>${fmt(count('raised'))}</b> raised</li><li><b>${fmt(count('added'))}</b> added</li>
        <li><b>${fmt(count('removed'))}</b> model entries removed</li><li><b>${fmt(count('kept'))}</b> already big enough</li>
      </ul>
      ${r.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
      ${dupes.length ? `<p class="note warn">${fmt(dupes.length)} files are in more than one mod. Only one copy is used in game, so the table fits the biggest copy. They're in the list below.</p>` : ''}`;
    $('changes').innerHTML = `<details class="more"><summary>Every change (${fmt(changed.length)})</summary><div class="scroll"><table>
        <tr><th>File</th><th>Change</th><th class="n">Old</th><th class="n">New</th></tr>
        ${changed.map(x => `<tr><td>${esc(x.path)}<br><small>${esc(x.mods.join(', '))}</small></td><td>${ACTION[x.action]}</td><td class="n">${x.old != null ? fmt(x.old) : ''}</td><td class="n">${x.size != null && x.action !== 'removed' ? fmt(x.size) : ''}</td></tr>`).join('')}
      </table></div></details>`;
    $('results').hidden = false;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    status(esc(e.message), 'err'); console.error(e);
    if (/size table/i.test(e.message) && !base) $('baseBox').open = true;   // no table anywhere: show where to add the game's own
  }
  busy = false; render();
});
render(); ready();
})();
