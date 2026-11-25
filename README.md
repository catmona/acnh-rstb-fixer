# ACNH RSTB Fixer

A web page that builds one `ResourceSizeTable.srsizetable` for a whole set of Animal Crossing: New Horizons mods. Add your mods (`.zip`, `.7z` or folders), press Build, and put the result on your SD card. Everything runs in the browser, and nothing is uploaded.

## The problem

The game keeps a table of how much memory each file needs (`romfs/System/Resource/ResourceSizeTable.srsizetable`) and refuses any file bigger than its entry. Only one copy of the table is used. A mod that changes models or messages can crash when another mod's table wins, for example a grass recolor (`Model/FldUnit.Nin_NX_NVN.zs`) next to Jubbsticks' Additions.

## What it does

1. It starts from the size tables the mods include and takes the larger size where they differ. If no mod has one, it uses the table from your own game dump.
2. It sizes every romfs file in the mods. Each rule below was read off vanilla 3.0.3's own table and files, and `n` is the decompressed size rounded up to 32.

| Files | Entry | Vanilla files matched |
| --- | --- | --- |
| `Message/` archives | n + 512 | 22 of 22 exactly |
| Texture-only models (one BFRES with no models, one BNTX) | n + 9,248 + 16 per texture | 3,337 of 3,337 exactly |
| `Layout/` | n + 8,192, plus a 512 margin | none smaller than vanilla |
| `Font/` | n + 8,192 | none smaller than vanilla |
| `Sound/*.bars` | n + 712, plus a 64 margin | none smaller than vanilla |
| `Bcsv/`, `EventFlow/`, `AnimationSequence/` | n + 416, plus a 32 margin | none smaller than vanilla |
| Models with geometry, collision or physics | entry removed: the game sizes the file itself | - |
| Everything else (Param, Stage...) | vanilla has no entries for these, so nothing changes | - |

   The margins cover the few vanilla entries that sit above the rule: up to 376 bytes (2 layouts), 32 (11 sound banks) and 16 (1 flow). An entry is only ever raised, never lowered.

3. It writes the table as `RSTC` (3.0) or `RSTB` (2.x), whichever the base was, Yaz0 store-only. The game reads that fine.

Why geometry models lose their entry: their load size depends on GPU buffers set by the shaders, so no simple rule fits. Universal RSTB (GameBanana 498070) removes the entries for all 58,613 vanilla model files, and the game sizes them itself. The Jubbsticks port also loads 529 models that have no entry. This tool removes only the entries for models your mods include.

## Checks

```
node test/check-vanilla.mjs <vanilla ResourceSizeTable.srsizetable> <vanilla romfs dir>...
node test/rebuild.mjs [--base <table>] --out <file> <mod .zip|.7z|folder>...
```

`check-vanilla` round-trips the table (byte-identical for 3.0.3) and fails if any rule comes out smaller than vanilla. `rebuild` runs the same code as the page.

## Not yet checked

- In game: the removed geometry entries. The Universal RSTB page reports a black screen when starting a new save with every model entry removed.
- 2.x (`RSTB`) tables: the layout is read and checked against the header length, but the rules were only fitted on 3.0.3.

## Files

- `index.html`, `app.js`: the page
- `lib/rstb.js`: table format, size rules, rebuild
- `lib/formats.js`: zip, 7z, Yaz0 and CRC32, from acnh-jubbsticks-peanuts (same author)
- `vendor/fzstd.umd.js`: zstd decoder (MIT, see `vendor/fzstd.LICENSE`)

## License

GPL-2.0, see `LICENSE`.
