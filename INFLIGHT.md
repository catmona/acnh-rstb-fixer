# In flight (Nov 25, 2026)

State: the page and the rebuild work and are committed (local only, not pushed). The first in-game test passed (README "Checked in game"). Publishing to GitHub and Pages waits on the owner's OK.

## Thor test, Nov 25, 2026 (5:29 to 5:55 PM)

- Setup: Peanuts Native 0.1.8 (`dev.nxnative.android.peanuts`), ACNH 3.0.3. The port was the only romfs mod (`mods/zz-port-test`), with `acnh-memory-fix-peanuts` on. The owner's four mods are in `/sdcard/Switch/games/Animal Crossing New Horizons/mods`, all set to `enabled=false` as found. Saves are in `/sdcard/Android/data/dev.nxnative.android.peanuts/files/saves`.
- Rebuilt table (`node test/rebuild.mjs`, base vanilla 3.0.3): 48 raised, 695 geometry entries removed, 66,167 entries, 1,082,725 bytes.
- Rebuilt table: boot, loading the existing island, walking outdoors and the new-save intro (Nook Inc. counter, not black) all passed with no crash. The island is at the tent stage, so there are no buildings or Roost to enter yet.
- The port's own table (423,610 bytes): only the new-save intro was run, and it passed.
- Two early attempts crashed about 18 s in (`sig=11 pc=sdk+0x582b2c`) because the memory fix pack wasn't built yet. That was a setup error, not the table: it is the same crash as the UnitIcon models without the memory fix.
- Device restored: 30 save files and 1,539 mod files match the backup's sha256 list (rechecked after the run). The saves folder's owner and SELinux label were reset to the app's (`u0_a182`, `c182`), and the final boot found the existing save.
- Backup: `/sdcard/Download/acnh-peanuts-backup-20261125-1729` (+ `.sha256`). The app also built pack `packs/01006F8002326000-mod-9fa00766e193`, which was kept.

- Hostile review (Nov 26): the test never loaded a removed-entry model. 677 of the 695 are `Model/Layout_*` menu and cooking icons, and the menus stayed closed. The other 18 are `IdrMuseumCafe00` (the Roost), the pansy, rose and pansy vase models, 6 wooden and flimsy tools and 8 UnitIcons, none on screen (the shot's flowers are hyacinths). So far the test only proves boot and load. List: `ROWS=1 node test/rebuild.mjs ... | grep ^removed`.

## Thor test 2, Nov 26, 2026 (5:22 to 5:32 PM)

- Same setup and table (md5 4646f14f...). The lock was stale (`skyrim-boot-test`, 23.5 h, session offline); the owner said to take it.
- Pass: island load, and the flimsy fishing rod in hand. That is `Model/ToolFishingrodWood`, a removed entry replacing a vanilla model. The port ran about 5 minutes with no crash.
- Not done: shaking a fruit tree (the island's fruit type wasn't found), the tool ring (only one tool), and the workbench.
- The Thor was at 1-3% battery on PC USB, so the kernel's low-charge cap (`socd` 99, GPU max 401 MHz) gave 2-6 fps. Charge it before the next test.
- Restored: 30 save files match the backup's sha256, the label is right, and the 4 mods are `enabled=false`. Backup: `/sdcard/Download/acnh-peanuts-backup-20261126-1722`.

## Open

- In game, the other removed entries: shake the native fruit tree (A, with no tool held), pick up the fruit and open the pocket, the tool ring with two or more tools, the cooking menu, the other wooden tools, pansies or roses, and the Roost. Then buildings and interiors on an island that has them, and a new save through island generation.
- A test with a mod that changes a geometry model (the grass case, `Model/FldUnit.Nin_NX_NVN.zs`) next to the port.
- 2.x (`RSTB`) tables: read, but the rules were fitted on 3.0.3 only.
- Push to GitHub and turn on Pages (owner's call).
