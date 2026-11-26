'use strict';
// Reading the player's mods (archives, folders) and writing the size table as its own small mod for each platform.
// Used by this repo's page, by the patcher pages (through lib/page.js) and by test/rebuild.mjs.

(function (root) {
const F = typeof module !== 'undefined' ? require('./formats.js') : root.ACNH_RSTB;
const R = typeof module !== 'undefined' ? require('./rstb.js') : root.ACNH_RSTB;
const TID = '01006F8002326000';

// One mod archive: { name, files } or an Error with a plain message.
async function readMod(name, u) {
  const s = u.subarray(0, 2);
  if (s[0] === 0x37 && s[1] === 0x7A) return { name, files: await F.read7z(u) };
  if (s[0] === 0x50 && s[1] === 0x4B) return { name, files: await F.readZip(u) };
  throw new Error(`${name}: not a .zip or .7z file` + (s[0] === 0x52 && s[1] === 0x61 ? ' (it is a .rar: extract it and add the folder)' : ''));
}

// A picked folder: [[path inside it, () => bytes]]. It can be one mod, or a folder of mods (a yuzu or Ryujinx mods folder,
// a Switch SD card's atmosphere/contents, a copy of Peanuts' mods folder). Every folder named romfs is one mod; mods for
// other games and mods whose mod.json says "enabled": false are left out. Returns { mods: [{ name, files }], notes }.
const SKIP = new Set(['atmosphere', 'contents', 'load', 'mods', 'sdmc']), HEXID = /^[0-9a-f]{16}$/i;
async function folderMods(top, list) {
  const groups = new Map(), loose = new Map(), json = new Map(), notes = [];
  for (const [p0, get] of list) {
    const p = p0.replace(/\\/g, '/'), m = p.match(/^(?:(.*)\/)?romfs\/(.+)$/i);
    if (/(^|\/)mod\.json$/i.test(p)) json.set(p.slice(0, -'mod.json'.length).replace(/\/$/, ''), get);
    if (m) { const k = m[1] || ''; if (!groups.has(k)) groups.set(k, new Map()); groups.get(k).set('romfs/' + m[2], get); }
    else loose.set(p, get);
  }
  if (!groups.size) return { mods: [{ name: top, files: loose }], notes };   // romfs files laid out without a romfs folder
  const mods = [];
  for (const [root, files] of [...groups].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    const segs = root ? root.split('/') : [];
    const other = segs.find(s => HEXID.test(s) && s.toUpperCase() !== TID);
    const name = [...segs].reverse().find(s => !SKIP.has(s.toLowerCase()) && !HEXID.test(s)) || top;
    if (other) { notes.push(`${top}/${root}: for another game (${other}), left out.`); continue; }
    let off = false;
    for (let i = segs.length; i >= 0 && !off; i--) {
      const get = json.get(segs.slice(0, i).join('/')); if (!get) continue;
      try { off = JSON.parse(new TextDecoder().decode(await get())).enabled === false; } catch { /* not ours */ }
      break;
    }
    if (off) { notes.push(`${name}: its mod.json says it is off, so it was left out.`); continue; }
    mods.push({ name, files });
  }
  return { mods, notes };
}

// Where each platform takes the table from, and how to make this one win. Steps are plain text, one per line.
const ATMOS = `atmosphere/contents/${TID}/romfs/`, OWN = '00 Size Table/romfs/';
const PLATFORMS = {
  peanuts: {
    label: 'Peanuts (Android)', zip: 'acnh-size-table-peanuts.zip', dir: ATMOS,
    steps: [
      'Peanuts uses the first-installed mod\'s copy of a file, and it can\'t change the order. So this mod has to be installed first.',
      'In Peanuts, long-press Animal Crossing and open Mods & Cheats. Remove every mod there that changes game files (romfs). Code-only mods, like the memory fix, can stay.',
      'Add this zip first (Add > A file), then add your other mods again, in your usual order.',
      'Make it again here whenever you add, remove or update a mod.',
    ],
  },
  switch: {
    label: 'Switch (Atmosphère)', zip: 'acnh-size-table-switch.zip', dir: ATMOS,
    steps: [
      'On a Switch every mod goes into the same folder, so the table that counts is simply the last one copied there.',
      'Copy your other mods to the SD card first. Then copy this zip\'s atmosphere folder to the root of the SD card and replace the file when asked.',
      'If you copy a mod later, copy this one again after it (or make a new one here first, if the mod is new).',
    ],
  },
  yuzu: {
    label: 'Eden, Citron, Sudachi or another yuzu fork', zip: 'acnh-size-table-yuzu.zip', dir: OWN,
    steps: [
      'These emulators sort mod folders by name and use the first one that has a file. The folder in this zip is named "00 Size Table", so it comes first.',
      'On a PC, right-click Animal Crossing and choose Open Mod Data Location. On Android, use the install button on the game\'s Add-ons screen.',
      'Extract the zip there, so "00 Size Table" sits next to your other mod folders, and leave it turned on in the game\'s Add-ons list.',
      'Don\'t rename it to something that sorts after a letter: a name starting with "00" sorts before every other name.',
    ],
  },
  ryujinx: {
    label: 'Ryujinx (Ryubing)', zip: 'acnh-size-table-ryujinx.zip', dir: OWN,
    steps: [
      'Ryujinx uses the first mod folder that has a file, in the order your computer lists the folders. On Windows that is by name, so "00 Size Table" comes first. On Linux and macOS the order isn\'t fixed.',
      'Right-click Animal Crossing and choose Open Mods Directory. Extract the zip there, so "00 Size Table" sits next to your other mod folders.',
      'On Linux or macOS, also delete romfs/System/Resource/ResourceSizeTable.srsizetable from your other mods. This table already covers them, so nothing else needs those copies.',
      'Make sure the mod is ticked in Manage Mods.',
    ],
  },
};

// The table as its own mod for a platform: { name, entries: [[path, bytes]], steps }.
function tableMod(platform, table) {
  const p = PLATFORMS[platform]; if (!p) throw new Error('Unknown platform: ' + platform);
  return { name: p.zip, entries: [[p.dir + R.TABLE, table]], steps: p.steps, label: p.label };
}

// Everything a patcher page needs in one call: rebuild over the mods, then the table mod for the platform.
// Returns rebuild()'s result plus { mod, summary }.
async function buildTableMod(platform, mods, base, zstd, progress) {
  const r = await R.rebuild(mods, base, zstd, progress), n = a => r.rows.filter(x => x.action === a).length;
  const fmt = x => x.toLocaleString('en-US');
  const parts = [`${fmt(n('raised') + n('added'))} sizes raised`, n('removed') && `${fmt(n('removed'))} model entries left to the game`].filter(Boolean);
  return { ...r, mod: tableMod(platform, r.table), summary: `${parts.join(', ')}. Covers ${mods.map(m => m.name).join(', ')}.` };
}

const api = { TID, readMod, folderMods, PLATFORMS, tableMod, buildTableMod };
if (typeof module !== 'undefined') module.exports = api; else Object.assign(root.ACNH_RSTB || (root.ACNH_RSTB = {}), api);
})(typeof self !== 'undefined' ? self : this);
