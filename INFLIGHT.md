# In flight (Nov 25, 2026)

State: the page and the rebuild work and are committed (556975e, local only, not pushed). Nothing is checked in game yet. Publishing to GitHub and Pages waits on the owner's OK.

## Next: in-game test on the AYN Thor

Use the `thor` skill (`~/.claude/skills/thor/SKILL.md`, `thor.py`) for the device. Device loops go to a `worker` agent on sonnet.

1. Build the test table with the same code the page runs:
   `node test/rebuild.mjs --base <vanilla table> --out <out> <port folder>`
   - Vanilla 3.0.3 table: `C:/Users/goldy/AppData/Local/Temp/claude/1e770dee9b08c698/c10c98fb-20ef-4fb6-b63c-d31ad84dfc5b/scratchpad/in/vanilla-rstb.srsizetable`
   - Jubbsticks port: `.../c10c98fb-20ef-4fb6-b63c-d31ad84dfc5b/scratchpad/in/port`
   - Expected last time: 48 data files raised, 695 geometry entries removed, 66,167 entries.
   - If the scratchpads are gone, re-extract with `nsprom.mjs` from the owner's NSPs in `Downloads/Animal Crossing New Horizons [NSP]` (keys in `Downloads/prod.keys`).
2. On the Thor, install the port with its own table swapped for the rebuilt one. Keep a copy of whatever was installed before, and put it back after.
3. Check: boot, loading an existing island, starting a new save (Universal RSTB, GameBanana 498070, reports a black screen there), walking the island, Resident Services, Nook's Cranny, a house interior, the Roost.
4. Control: the same steps with the port's own table, so a crash can be blamed on the table or not.
5. Write the results into README "Not yet checked" and here.

## Open after that

- A test with a mod that changes a geometry model (the grass case, `Model/FldUnit.Nin_NX_NVN.zs`) next to the port.
- 2.x (`RSTB`) tables: read, but the rules were fitted on 3.0.3 only.
- Push to GitHub and turn on Pages (owner's call).
