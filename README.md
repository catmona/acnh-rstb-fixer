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

## Checked in game

On an AYN Thor (Peanuts Native 0.1.8, ACNH 3.0.3, Nov 25, 2026), the Jubbsticks 3.0.3 port was the only romfs mod, with the memory fix code mod. Its table was rebuilt on vanilla 3.0.3's: 48 entries raised, 695 geometry entries removed, 66,167 entries. The launch log's `DM_ROMFS_OVERLAY` showed the port was loaded.

| Check | Rebuilt table | Port's own table |
| --- | --- | --- |
| Boot to title | pass | not run |
| Load an existing island | pass | not run |
| Walk outdoors | pass | not run |
| New save: intro at the Nook Inc. counter, not a black screen | pass | pass |
| Resident Services, Nook's Cranny, a house, the Roost | not tested: the test island is still at the tent stage | not tested |

There were no crashes with either table. The new save was only followed to the airport counter, not through island generation. The port's own table only got the new-save check, because the rebuilt table passed everything else.

The first run proved boot and load only, because no model with a removed entry was on screen. Of the 695 removed, 677 are the port's `Model/Layout_*` menu and cooking icons. The other 18 are the Roost (`IdrMuseumCafe00`), pansies, roses, the six wooden and flimsy tools and 8 fruit and petal icons.

A second run (Nov 26) equipped the flimsy fishing rod. That is `Model/ToolFishingrodWood`, a vanilla model the port replaces, and its entry is removed. It drew correctly in hand, and the port ran about 5 minutes with no crash. So one removed entry is checked in game. The pocket icons that showed (weeds, branch, the rod) are not removed entries. That run's frame rate isn't evidence for or against the table: the Thor was at 1% battery, which caps the GPU.

## Not yet checked

- In game, the other removed entries: fruit on the ground and in the pocket, the tool ring and cooking menu with port items, the other wooden tools, pansies and roses, and the Roost. Also buildings and interiors, and a new save past the airport counter. The Universal RSTB page reports a black screen when starting a new save with every model entry removed.
- A mod that changes a geometry model (the grass case, `Model/FldUnit.Nin_NX_NVN.zs`) next to the port.
- 2.x (`RSTB`) tables: the layout is read and checked against the header length, but the rules were only fitted on 3.0.3.

## Files

- `index.html`, `app.js`: the page
- `lib/rstb.js`: table format, size rules, rebuild
- `lib/formats.js`: zip, 7z, Yaz0 and CRC32, from acnh-jubbsticks-peanuts (same author)
- `vendor/fzstd.umd.js`: zstd decoder (MIT, see `vendor/fzstd.LICENSE`)

## License

GPL-2.0, see `LICENSE`.
