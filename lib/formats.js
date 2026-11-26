// Archive readers and small helpers, from acnh-jubbsticks-peanuts docs/app.js (same author).
// In a page these land on self.ACNH_RSTB (lib/page.js loads them), not on the page's own globals.
(function (root) {
'use strict';
async function readZip(u) {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip file');
  const count = v.getUint16(e + 10, true); let c = v.getUint32(e + 16, true);
  const files = new Map(), dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(c, true) !== 0x02014b50) throw new Error('broken zip directory');
    const method = v.getUint16(c + 10, true), csize = v.getUint32(c + 20, true), usize = v.getUint32(c + 24, true);
    const nlen = v.getUint16(c + 28, true), elen = v.getUint16(c + 30, true), clen = v.getUint16(c + 32, true);
    const lo = v.getUint32(c + 42, true), name = dec.decode(u.subarray(c + 46, c + 46 + nlen));
    c += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    const at = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u.subarray(at, at + csize);
    files.set(name, async () => {
      if (method === 0) return raw;
      if (method !== 8) throw new Error(name + ': unsupported compression');
      const out = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      if (out.length !== usize) throw new Error(name + ': bad size');
      return out;
    });
  }
  return files;
}

// LZMA into one output buffer (a whole 7z folder, so the buffer is the dictionary), after the LZMA SDK's LzmaSpec.cpp.
// Prob layout: isMatch 0, isRep 192, isRepG0 204, isRepG1 216, isRepG2 228, isRep0Long 240, posSlot 432,
// specPos 688, align 803, len 819, repLen 1333, literals 1847
function lzma(out) {
  let lc = 0, lp = 0, pb = 0, pr = null, state = 0, r0 = 0, r1 = 0, r2 = 0, r3 = 0, pos = 0, start = 0;
  return {
    get pos() { return pos; },
    props(d) { lc = d % 9; d = (d / 9) | 0; lp = d % 5; pb = (d / 5) | 0; if (pb > 4) throw new Error('bad LZMA properties');
               if (!pr || pr.length !== 1847 + (0x300 << (lc + lp))) pr = new Uint16Array(1847 + (0x300 << (lc + lp))); },
    reset() { pr.fill(1024); state = 0; r0 = r1 = r2 = r3 = 0; },
    resetDict() { start = pos; },
    copy(src) { out.set(src, pos); pos += src.length; },
    run(inp, ip, end) {   // decode until pos == end; the range coder starts at ip
      let range = 0xFFFFFFFF, code = 0; ip++;
      for (let i = 0; i < 4; i++) code = code * 256 + inp[ip++];
      const bit = i => {
        const p = pr[i], bound = (range >>> 11) * p; let b = 0;
        if (code < bound) { range = bound; pr[i] = p + ((2048 - p) >>> 5); } else { range -= bound; code -= bound; pr[i] = p - (p >>> 5); b = 1; }
        if (range < 16777216) { range *= 256; code = code * 256 + inp[ip++]; }
        return b;
      };
      const tree = (base, n) => { let m = 1; for (let i = 0; i < n; i++) m = (m << 1) | bit(base + m); return m - (1 << n); };
      const rtree = (base, n) => { let m = 1, s = 0; for (let i = 0; i < n; i++) { const b = bit(base + m); m = (m << 1) | b; s |= b << i; } return s; };
      const len = (L, ps) => !bit(L) ? tree(L + 2 + ps * 8, 3) : !bit(L + 1) ? 8 + tree(L + 130 + ps * 8, 3) : 16 + tree(L + 258, 8);
      const pbMask = (1 << pb) - 1, lpMask = (1 << lp) - 1;
      while (pos < end) {
        const ps = (pos - start) & pbMask;
        if (!bit((state << 4) + ps)) {   // literal
          const prev = pos > start ? out[pos - 1] : 0, base = 1847 + 0x300 * ((((pos - start) & lpMask) << lc) + (prev >> (8 - lc)));
          let s = 1;
          if (state >= 7) {
            let mb = out[pos - r0 - 1];
            do { const m = (mb >> 7) & 1; mb <<= 1; const b = bit(base + ((1 + m) << 8) + s); s = (s << 1) | b; if (m !== b) break; } while (s < 0x100);
          }
          while (s < 0x100) s = (s << 1) | bit(base + s);
          out[pos++] = s - 0x100; state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
          continue;
        }
        let n;
        if (bit(192 + state)) {   // rep match
          if (!bit(204 + state)) {
            if (!bit(240 + (state << 4) + ps)) { state = state < 7 ? 9 : 11; out[pos] = out[pos - r0 - 1]; pos++; continue; }
          } else {
            let d;
            if (!bit(216 + state)) d = r1; else { if (!bit(228 + state)) d = r2; else { d = r3; r3 = r2; } r2 = r1; }
            r1 = r0; r0 = d;
          }
          n = len(1333, ps); state = state < 7 ? 8 : 11;
        } else {   // new match
          r3 = r2; r2 = r1; r1 = r0; n = len(819, ps); state = state < 7 ? 7 : 10;
          const slot = tree(432 + Math.min(n, 3) * 64, 6);
          if (slot < 4) r0 = slot;
          else {
            const nd = (slot >> 1) - 1; let d = (2 | (slot & 1)) * 2 ** nd;
            if (slot < 14) d += rtree(688 + d - slot, nd);
            else {
              let x = 0;
              for (let i = nd - 4; i > 0; i--) { range = Math.floor(range / 2); let b = 0; if (code >= range) { code -= range; b = 1; } x = x * 2 + b;
                                                 if (range < 16777216) { range *= 256; code = code * 256 + inp[ip++]; } }
              d += x * 16 + rtree(803, 4);
            }
            if (d === 0xFFFFFFFF) break;   // end marker
            r0 = d;
          }
        }
        n += 2;
        if (r0 >= pos - start || pos + n > end) throw new Error('The 7z data is damaged.');
        for (; n > 0; n--, pos++) out[pos] = out[pos - r0 - 1];
      }
      return ip;
    },
  };
}

function lzma2(inp, ip, out) {
  const L = lzma(out);
  for (let c; (c = inp[ip++]) !== 0;) {
    if (c < 0x80) {   // stored chunk; 1 also resets the dictionary
      if (c > 2) throw new Error('The 7z data is damaged.');
      const n = (inp[ip] << 8 | inp[ip + 1]) + 1; ip += 2;
      if (c === 1) L.resetDict();
      L.copy(inp.subarray(ip, ip + n)); ip += n; continue;
    }
    const u = ((c & 31) << 16) + (inp[ip] << 8) + inp[ip + 1] + 1, p = (inp[ip + 2] << 8) + inp[ip + 3] + 1, mode = (c >> 5) & 3; ip += 4;
    if (mode === 3) L.resetDict();
    if (mode >= 2) L.props(inp[ip++]);
    if (mode >= 1) L.reset();
    L.run(inp, ip, L.pos + u); ip += p;
  }
  if (L.pos !== out.length) throw new Error('The 7z data is damaged.');
}

// 7z: header (maybe LZMA-packed itself), then folders of LZMA/LZMA2 (or stored) data; files are runs inside their folder
async function read7z(u) {
  const bad = () => new Error('This 7z uses a feature the page cannot read. Extract it and zip the atmosphere folder instead.');
  const rd = b => {
    let p = 0; const r = {
      get pos() { return p; }, seek(x) { p = x; },
      byte: () => b[p++], bytes: n => b.subarray(p, p += n), u32() { p += 4; return (b[p - 4] | b[p - 3] << 8 | b[p - 2] << 16 | b[p - 1] << 24) >>> 0; },
      num() { const f = b[p++]; let v = 0; for (let i = 0, m = 0x80; i < 8; i++, m >>= 1) { if (!(f & m)) return v + (f & (m - 1)) * 2 ** (8 * i); v += b[p++] * 2 ** (8 * i); } return v; },
      bits(n) { const a = []; for (let i = 0, x = 0; i < n; i++) { if (!(i & 7)) x = b[p++]; a.push(!!(x & (0x80 >> (i & 7)))); } return a; },
      defs(n) { return b[p++] ? new Array(n).fill(true) : r.bits(n); },
    }; return r;
  };
  const folder = r => {
    const n = r.num(), coders = []; let ins = 0, outs = 0;
    for (let i = 0; i < n; i++) {
      const fl = r.byte(); if (fl & 0xC0) throw bad();
      const id = [...r.bytes(fl & 15)].map(x => x.toString(16).padStart(2, '0')).join('');
      let ni = 1, no = 1; if (fl & 16) { ni = r.num(); no = r.num(); }
      coders.push({ id, props: fl & 32 ? r.bytes(r.num()) : null }); ins += ni; outs += no;
    }
    for (let i = 0; i < outs - 1; i++) { r.num(); r.num(); }
    if (ins - (outs - 1) > 1) for (let i = 0; i < ins - (outs - 1); i++) r.num();
    return { coders, outs };
  };
  const streams = r => {
    const s = { packPos: 0, packSizes: [], folders: [] };
    for (let id; (id = r.num()) !== 0;) {
      if (id === 6) {
        s.packPos = r.num(); const n = r.num();
        for (let t; (t = r.num()) !== 0;) {
          if (t === 9) for (let i = 0; i < n; i++) s.packSizes.push(r.num());
          else if (t === 10) r.defs(n).forEach(x => x && r.u32()); else throw bad();
        }
      } else if (id === 7) {
        if (r.num() !== 11) throw bad(); const n = r.num(); if (r.byte()) throw bad();
        for (let i = 0; i < n; i++) s.folders.push(folder(r));
        if (r.num() !== 12) throw bad();
        for (const f of s.folders) f.sizes = Array.from({ length: f.outs }, () => r.num());
        for (let t; (t = r.num()) !== 0;) { if (t !== 10) throw bad(); const d = r.defs(n); s.folders.forEach((f, i) => { if (d[i]) f.crc = r.u32(); }); }
      } else if (id === 8) {
        const F = s.folders; let t = r.num();
        s.counts = F.map(() => 1);
        if (t === 13) { s.counts = F.map(() => r.num()); t = r.num(); }
        s.sizes = []; s.crcs = [];
        F.forEach((f, i) => {
          let sum = 0;
          if (t === 9) for (let k = 1; k < s.counts[i]; k++) { const x = r.num(); s.sizes.push(x); sum += x; }
          if (s.counts[i]) s.sizes.push(f.sizes[f.sizes.length - 1] - sum);
        });
        if (t === 9) t = r.num();
        const known = (f, i) => s.counts[i] === 1 && f.crc !== undefined;
        let vals = [];
        for (; t !== 0; t = r.num()) {
          if (t !== 10) throw bad();
          const need = F.reduce((a, f, i) => a + (known(f, i) ? 0 : s.counts[i]), 0);
          vals = r.defs(need).map(x => x ? r.u32() : undefined);
        }
        let k = 0;
        F.forEach((f, i) => { if (known(f, i)) s.crcs.push(f.crc); else for (let j = 0; j < s.counts[i]; j++) s.crcs.push(vals[k++]); });
      } else throw bad();
    }
    if (!s.counts) { s.counts = s.folders.map(() => 1); s.sizes = s.folders.map(f => f.sizes[f.sizes.length - 1]); s.crcs = s.folders.map(f => f.crc); }
    return s;
  };
  const unpack = (s, i) => {
    const f = s.folders[i]; if (f.coders.length !== 1) throw bad();
    let at = 32 + s.packPos; for (let k = 0; k < i; k++) at += s.packSizes[k];
    const c = f.coders[0], out = new Uint8Array(f.sizes[0]);
    if (c.id === '21') lzma2(u, at, out);
    else if (c.id === '030101') { const L = lzma(out); L.props(c.props[0]); L.reset(); L.run(u, at, out.length); }
    else if (c.id === '00') out.set(u.subarray(at, at + out.length));
    else throw bad();
    if (f.crc !== undefined && crc32(out) !== f.crc) throw new Error('The 7z data is damaged.');
    return out;
  };
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), q = o => v.getUint32(o, true) + v.getUint32(o + 4, true) * 2 ** 32;
  let r = rd(u.subarray(32 + q(12), 32 + q(12) + q(20))), id = r.num();
  if (id === 0x17) { const s = streams(r); r = rd(unpack(s, 0)); id = r.num(); }
  if (id !== 1) throw bad();
  let s = null, names = [], empty = [], emptyFile = [];
  for (let t; (t = r.num()) !== 0;) {
    if (t === 4) s = streams(r);
    else if (t === 5) {
      const n = r.num(); empty = new Array(n).fill(false);
      for (let p; (p = r.num()) !== 0;) {
        const e = r.num() + r.pos;
        if (p === 14) empty = r.bits(n);
        else if (p === 15) emptyFile = r.bits(empty.filter(Boolean).length);
        else if (p === 17) { if (r.byte()) throw bad(); names = new TextDecoder('utf-16le').decode(r.bytes(e - r.pos)).split('\0'); }
        r.seek(e);
      }
    } else throw bad();
  }
  const runs = [], cache = [];
  if (s) s.folders.forEach((f, i) => { for (let k = 0, off = 0; k < s.counts[i]; k++) { const j = runs.length; runs.push({ i, off, size: s.sizes[j], crc: s.crcs[j] }); off += s.sizes[j]; } });
  const files = new Map(); let j = 0, e = 0;
  names.slice(0, empty.length).forEach((nm, k) => {
    const name = nm.replace(/\\/g, '/');
    if (empty[k]) { if (emptyFile[e++]) files.set(name, async () => new Uint8Array(0)); return; }
    const x = runs[j++];
    files.set(name, async () => {
      const d = (cache[x.i] ||= unpack(s, x.i)).subarray(x.off, x.off + x.size);
      if (x.crc !== undefined && crc32(d) !== x.crc) throw new Error(name + ': the 7z data check failed.');
      return d;
    });
  });
  return files;
}

const CRC = new Uint32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function writeZip(entries) {   // [name, bytes], stored (no compression)
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  for (const [name, data] of entries) {
    const n = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
    const d = new DataView(new ArrayBuffer(46));
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 0x21, true);
    d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, n.length, true);
    d.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), n, data); dir.push(new Uint8Array(d.buffer), n);
    off += 30 + n.length + data.length;
  }
  const size = dir.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...dir, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async u => hex(await crypto.subtle.digest('SHA-256', u));
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const cat = parts => { const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const utf8 = s => new TextEncoder().encode(s);
function yaz0Raw(d) {   // store-only Yaz0 (all literals)
  const out = new Uint8Array(16 + d.length + Math.ceil(d.length / 8)); out.set([0x59, 0x61, 0x7a, 0x30]);
  new DataView(out.buffer).setUint32(4, d.length, false); let o = 16;
  for (let i = 0; i < d.length; i += 8) { const n = Math.min(8, d.length - i); out[o++] = (0xff << (8 - n)) & 0xff; out.set(d.subarray(i, i + n), o); o += n; }
  return out.subarray(0, o);
}

function yaz0Dec(b) {
  if (hex(b.subarray(0, 4)) !== '59617a30') throw new Error('not a Yaz0 file');
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(4, false), out = new Uint8Array(n);
  let i = 16, o = 0, code = 0, bits = 0;
  while (o < n) {
    if (!bits) { code = b[i++]; bits = 8; }
    if (code & 0x80) out[o++] = b[i++];
    else {
      const b1 = b[i++], b2 = b[i++]; let len = b1 >> 4; const src = o - (((b1 & 15) << 8) | b2) - 1;
      len = len ? len + 2 : b[i++] + 18;
      for (let k = 0; k < len && o < n; k++) out[o + k] = out[src + k];
      o += Math.min(len, n - o);
    }
    code = (code << 1) & 0xff; bits--;
  }
  return out;
}

function findBytes(b, pat, from = 0) {
  outer: for (let i = from; i <= b.length - pat.length; i++) { for (let k = 0; k < pat.length; k++) if (b[i + k] !== pat[k]) continue outer; return i; }
  return -1;
}
const api = { readZip, read7z, crc32, writeZip, hex, cat, utf8, yaz0Raw, yaz0Dec, findBytes };
if (typeof module !== 'undefined') module.exports = api; else Object.assign(root.ACNH_RSTB || (root.ACNH_RSTB = {}), api);
})(typeof self !== 'undefined' ? self : this);
