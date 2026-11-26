'use strict';
// ACNH ResourceSizeTable.srsizetable: read, size files, rebuild for a set of mods, write.
//
// Table layout (Yaz0 compressed):
//   'RSTB' (2.x) or 'RSTC' (3.0), u32 hashed count, u32 named count,
//   hashed entries: u32 crc32(path), u32 size [, u32 dlc in RSTC], sorted by crc,
//   named entries (paths whose crc collides): char[128] path, u32 size [, u32 dlc], sorted by path.
// Paths are romfs paths without a leading slash and without '.zs'. The game refuses a file whose
// load needs more than its entry; a file with no entry is sized by the game itself.
//
// The size rules below were read off vanilla 3.0.3's own table and files (test/check-vanilla.mjs
// prints the match counts). n is the decompressed length rounded up to 32. Layouts, sound banks and data files
// get a margin (512, 64, 32 bytes): a few vanilla entries are that much above the rule (up to 376, 32 and 16).

(function (root) {
const F = typeof module !== 'undefined' ? require('./formats.js') : root.ACNH_RSTB;

const up = (n, a = 32) => Math.ceil(n / a) * a;
const enc = new TextEncoder();
const ascii = b => { let z = b.indexOf(0); if (z < 0) z = b.length; return new TextDecoder('latin1').decode(b.subarray(0, z)); };
const isYaz0 = b => b[0] === 0x59 && b[1] === 0x61 && b[2] === 0x7a && b[3] === 0x30;

function tableParse(raw) {
  const t = isYaz0(raw) ? F.yaz0Dec(raw) : raw;
  const v = new DataView(t.buffer, t.byteOffset, t.byteLength), magic = ascii(t.subarray(0, 4));
  if (magic !== 'RSTB' && magic !== 'RSTC') throw new Error('This is not a resource size table.');
  const dlc = magic === 'RSTC', es = dlc ? 12 : 8, ns = 128 + es - 4;
  const nh = v.getUint32(4, true), nn = v.getUint32(8, true);
  if (12 + nh * es + nn * ns !== t.length) throw new Error('The size table is damaged (its length does not match its header).');
  const hashed = new Map(), named = new Map();
  for (let i = 0, o = 12; i < nh; i++, o += es) hashed.set(v.getUint32(o, true), [v.getUint32(o + 4, true), dlc ? v.getUint32(o + 8, true) : 0]);
  for (let i = 0, o = 12 + nh * es; i < nn; i++, o += ns) named.set(ascii(t.subarray(o, o + 128)), [v.getUint32(o + 128, true), dlc ? v.getUint32(o + 132, true) : 0]);
  return { magic, hashed, named };
}

function tableWrite(T) {
  const dlc = T.magic === 'RSTC', es = dlc ? 12 : 8, ns = 128 + es - 4;
  const hk = [...T.hashed.keys()].sort((a, b) => a - b), nk = [...T.named.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const out = new Uint8Array(12 + hk.length * es + nk.length * ns), v = new DataView(out.buffer);
  out.set(enc.encode(T.magic)); v.setUint32(4, hk.length, true); v.setUint32(8, nk.length, true);
  let o = 12;
  for (const k of hk) { const [s, d] = T.hashed.get(k); v.setUint32(o, k, true); v.setUint32(o + 4, s, true); if (dlc) v.setUint32(o + 8, d, true); o += es; }
  for (const k of nk) {
    const [s, d] = T.named.get(k), b = enc.encode(k); if (b.length > 127) throw new Error(k + ': path too long for the table');
    out.set(b, o); v.setUint32(o + 128, s, true); if (dlc) v.setUint32(o + 132, d, true); o += ns;
  }
  return F.yaz0Raw(out);
}

const crcOf = path => F.crc32(enc.encode(path));
function tableGet(T, path) { return T.named.get(path) || T.hashed.get(crcOf(path)); }
function tableSet(T, path, size) {
  const e = tableGet(T, path);
  if (e) e[0] = size; else T.hashed.set(crcOf(path), [size, 0]);
}
function tableDel(T, path) { if (!T.named.delete(path)) T.hashed.delete(crcOf(path)); }
function tableMergeMax(A, B) {   // A gets every entry of B, at B's size where that is larger
  let raised = 0, added = 0;
  for (const [m, n] of [[A.hashed, B.hashed], [A.named, B.named]])
    for (const [k, e] of n) { const a = m.get(k); if (!a) { m.set(k, [...e]); added++; } else if (e[0] > a[0]) { a[0] = e[0]; raised++; } }
  return { raised, added };
}

// SARC members: [{ name, data }]
function sarcMembers(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (ascii(b.subarray(0, 4)) !== 'SARC') return null;
  const doff = v.getUint32(0xC, true), n = v.getUint16(0x1A, true), nt = 0x20 + 16 * n + 8, out = [];
  for (let i = 0; i < n; i++) {
    const attr = v.getUint32(0x24 + 16 * i, true), s = v.getUint32(0x28 + 16 * i, true), e = v.getUint32(0x2C + 16 * i, true);
    out.push({ name: attr >>> 24 ? ascii(b.subarray(nt + (attr & 0xffffff) * 4)) : '', data: b.subarray(doff + s, doff + e) });
  }
  return out;
}

// A model archive that holds only textures: one BFRES with no models, animations or scenes, and one embedded BNTX.
// Returns its texture count, or -1 if the archive is anything else.
function textureOnlyCount(arc) {
  const m = sarcMembers(arc);
  if (!m || m.length !== 1 || ascii(m[0].data.subarray(0, 4)) !== 'FRES') return -1;
  const b = m[0].data, v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 0x100 || v.getUint32(8, true) >>> 16 !== 9) return -1;           // BFRES v9 (ACNH)
  for (let o = 0xDC; o < 0xF0; o += 2) if (o !== 0xEC && v.getUint16(o, true)) return -1;   // models, anims, scenes...
  if (v.getUint16(0xEC, true) !== 1) return -1;                                      // exactly one external file
  const i = F.findBytes(b, [0x42, 0x4E, 0x54, 0x58]);                               // 'BNTX'
  if (i < 0 || ascii(b.subarray(i + 0x20, i + 0x24)) !== 'NX  ') return -1;
  return v.getUint32(i + 0x24, true);
}

// The entry a file needs. Returns { size, rule } for an exact size, { remove: true, rule } when the game must size it
// itself (no entry), or null when files of this kind have no entries at all.
function sizeFor(path, data) {
  const n = up(data.length), top = path.split('/')[0], ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (top === 'Model') {
    const t = textureOnlyCount(data);
    if (t >= 0) return { size: n + 9248 + 16 * t, rule: 'texture-only model' };
    return { remove: true, rule: 'model with geometry, collision or physics' };
  }
  if (top === 'Message') return { size: n + 512, rule: 'message archive' };
  if (top === 'Layout' || top === 'Font') return { size: n + 8192 + (top === 'Layout' ? 512 : 0), rule: top.toLowerCase() + ' archive' };
  if (top === 'Sound' && ext === 'bars') return { size: n + 712 + 64, rule: 'sound bank' };
  if (top === 'Bcsv' || top === 'EventFlow' || top === 'AnimationSequence') return { size: n + 416 + 32, rule: 'data file' };
  return null;
}

// Path inside romfs for a file in a mod archive, or null if it is not a romfs file.
const TOPS = new Set(['Model', 'Message', 'Layout', 'Font', 'Sound', 'Bcsv', 'EventFlow', 'AnimationSequence', 'Param', 'Stage', 'System', 'BDLI', 'AnimationInfo', 'Shader', 'Effect', 'Pack']);
function romfsPath(name) {
  const p = name.replace(/\\/g, '/'), m = p.match(/(^|\/)romfs\/(.+)$/i);
  if (m) return m[2];
  const parts = p.split('/');
  for (let i = 0; i < parts.length - 1; i++) if (TOPS.has(parts[i])) return parts.slice(i).join('/');
  return null;
}
const TABLE = 'System/Resource/ResourceSizeTable.srsizetable';

// mods: [{ name, files: Map(archive path -> async () => bytes) }]; base: optional table bytes from the user's game.
// zstd: (bytes) => bytes. Returns { table (Yaz0 bytes), rows, notes }.
async function rebuild(mods, base, zstd, progress = () => {}) {
  const notes = [], tables = [], seen = new Map();   // seen: romfs path (no .zs) -> [{ mod, get }]
  for (const mod of mods) {
    let count = 0;
    for (const [name, get] of mod.files) {
      const p = romfsPath(name); if (!p) continue;
      if (p === TABLE) { tables.push({ mod: mod.name, get }); continue; }
      const key = p.endsWith('.zs') ? p.slice(0, -3) : p;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({ mod: mod.name, zs: p.endsWith('.zs'), get }); count++;
    }
    if (!count) notes.push(`${mod.name}: no romfs files found in it.`);
  }
  let T = null;
  if (base) { T = tableParse(base); notes.push('Base: the size table you gave.'); }
  for (const t of tables) {
    let x; try { x = tableParse(await t.get()); } catch (e) { notes.push(`${t.mod}: its size table could not be read (${e.message}) and was skipped.`); continue; }
    if (!T) { T = x; notes.push(`Base: ${t.mod}'s size table.`); continue; }
    if (x.magic !== T.magic) { notes.push(`${t.mod}: its size table is for another game version (${x.magic}, base is ${T.magic}) and was skipped.`); continue; }
    const r = tableMergeMax(T, x); notes.push(`${t.mod}'s size table merged in: ${r.raised} sizes raised, ${r.added} entries added.`);
  }
  if (!T) throw new Error('None of these mods has a size table. Add the ResourceSizeTable.srsizetable from your own game (romfs/System/Resource/).');
  if (T.magic !== 'RSTC') notes.push('The base table is a 2.x table (RSTB). The size rules were checked against 3.0.3, so test in game.');

  const rows = []; let i = 0;
  for (const [path, copies] of seen) {
    progress(++i, seen.size);
    const old = tableGet(T, path), oldSize = old ? old[0] : null;
    let want = null, rule = null, remove = false;
    for (const c of copies) {
      let d = await c.get();
      if (c.zs) { try { d = zstd(d); } catch (e) { throw new Error(`${c.mod}: ${path}.zs could not be decompressed (${e.message}).`); } }
      const s = sizeFor(path, d); if (!s) continue;
      rule = s.rule; if (s.remove) remove = true; else want = Math.max(want || 0, s.size);
    }
    const mods = [...new Set(copies.map(c => c.mod))];
    if (!rule) continue;
    if (remove) {
      if (old) { tableDel(T, path); rows.push({ path, mods, action: 'removed', old: oldSize, rule }); }
      else rows.push({ path, mods, action: 'none', old: null, rule });
    } else if (!old) { tableSet(T, path, want); rows.push({ path, mods, action: 'added', size: want, rule }); }
    else if (want > oldSize) { tableSet(T, path, want); rows.push({ path, mods, action: 'raised', old: oldSize, size: want, rule }); }
    else rows.push({ path, mods, action: 'kept', old: oldSize, size: want, rule });
  }
  return { table: tableWrite(T), rows, notes, entries: T.hashed.size + T.named.size };
}

// Checks a table against mods: every copy of every romfs file must fit its entry (not just the copy the game uses, so the
// mod order can't hide a miss), geometry models must have no entry, and no entry of the 'against' tables
// ([{ name, table bytes }], for example vanilla's) may be smaller or gone, removed models aside. The mods' own tables are
// checked the same way. Returns { fails, sized, removed, noRule, lowered: [{ name, n, entries }], entries, magic }.
async function checkFit(table, mods, zstd, against = []) {
  const T = tableParse(table), fails = [], removed = new Set(), checks = [], out = { sized: 0, removed: 0, noRule: 0 };
  for (const a of against) checks.push({ name: a.name, T: tableParse(a.table) });
  for (const mod of mods) for (const [name, get] of mod.files) {
    let p = romfsPath(name); if (!p) continue;
    if (p === TABLE) { try { checks.push({ name: mod.name, T: tableParse(await get()) }); } catch (e) { fails.push(`${mod.name}: its size table could not be read (${e.message})`); } continue; }
    let d = await get(); if (p.endsWith('.zs')) { p = p.slice(0, -3); d = zstd(d); }
    const want = sizeFor(p, d), e = tableGet(T, p);
    if (!want) { out.noRule++; continue; }
    if (want.remove) { out.removed++; removed.add(p); if (e) fails.push(`${mod.name}: ${p} is a geometry model but has an entry (${e[0]})`); continue; }
    out.sized++;
    if (!e) fails.push(`${mod.name}: ${p} needs ${want.size} and has no entry`);
    else if (e[0] < want.size) fails.push(`${mod.name}: ${p} needs ${want.size}, its entry is ${e[0]}`);
  }
  const removedCrc = new Set([...removed].map(crcOf)), lowered = [];
  for (const c of checks) {
    let n = 0;
    for (const [m, o, skip] of [[c.T.hashed, T.hashed, removedCrc], [c.T.named, T.named, removed]])
      for (const [k, e] of m) {
        if (skip.has(k)) continue;
        const x = o.get(k);
        if (!x || x[0] < e[0]) { if (++n <= 10) fails.push(`${c.name}: entry ${typeof k === 'number' ? k.toString(16) : k} is ${x ? x[0] : 'gone'}, was ${e[0]}`); }
      }
    lowered.push({ name: c.name, n, entries: c.T.hashed.size + c.T.named.size });
  }
  return { fails, lowered, entries: T.hashed.size + T.named.size, magic: T.magic, ...out };
}

const api = { up, tableParse, tableWrite, tableGet, tableSet, tableDel, tableMergeMax, sarcMembers, textureOnlyCount, sizeFor, romfsPath, rebuild, checkFit, TABLE };
if (typeof module !== 'undefined') module.exports = api; else Object.assign(root.ACNH_RSTB || (root.ACNH_RSTB = {}), api);
})(typeof self !== 'undefined' ? self : this);
