// The one file a page loads from ACNH RSTB Fixer (the patcher pages load it from their docs/rstb submodule):
//   <script src="rstb/lib/page.js"></script> (or added later), then  const R = await ACNH_RSTB.load();
// It loads formats.js, the zstd decoder, rstb.js and mods.js from next to itself. Their names go on self.ACNH_RSTB only
// (the zstd decoder as ACNH_RSTB.fzstd), so they can't clash with the page's own names.
(function () {
'use strict';
const ns = self.ACNH_RSTB || (self.ACNH_RSTB = {});
if (ns.load) return;
const here = (document.currentScript && document.currentScript.src) || location.href;
const script = rel => new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = new URL(rel, here).href; s.onload = ok;
  s.onerror = () => { s.remove(); no(new Error("I couldn't load the size table part of this page. Check your connection.")); };
  document.head.append(s);
});
let ready = null;
ns.load = () => ready || (ready = (async () => {
  if (!ns.readZip) await script('formats.js');
  if (!ns.fzstd) {
    const had = 'fzstd' in self, prev = self.fzstd;
    await script('../vendor/fzstd.umd.js');
    ns.fzstd = self.fzstd;
    if (had) self.fzstd = prev; else delete self.fzstd;
  }
  if (!ns.rebuild) await script('rstb.js');
  if (!ns.buildTableMod) await script('mods.js');
  return ns;
})().catch(e => { ready = null; throw e; }));   // after a failure, the next call tries again
ns.load().catch(() => {});   // start now; callers see any error from their own load()
})();
