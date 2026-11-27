# Raid handoff (branch `swarm/barbarians`)

Design section 13b ("Raid"), catalogue L69–L72. A longship of raiders comes in,
the band storms ashore, sets fires, loots, and sails off; or the player sinks
the ship and the town chases them into the sea.

## Try it
- `npm run dev`, a grown town (`/?seed=4242&mischief`, or Grow a town), the
  Mischief drawer's **Raid** (a longship icon): click near a shore. Menu:
  **Raiders: on/off** (raids on their own). Undo calls a raid off.
- Sequences: `raid-landing` and `raid-boats` scenarios (their headers have the
  commands). Verbs `raid@x,0,z`, `raidland@…`, `raidboats@…`, `shipsink@d,0,0`;
  `--follow-raid` keeps the camera on it. Frame cost:
  `node src/life/testing/scene-cost.mjs grown-harbour --raid landing`.
- `window.__lc.raids` (`summon({ at, kind })`, `list` (every raid going on), `current` (the newest), `auto`,
  `why`, `handles()`). Any number at once (catalogue L73): a click lands a party on the shore nearest it
  (`site.ts` `planAt`); `RAID.ceiling` / `ceilingPhone` cap raiders alive, past it a token crew.
- Cost of many: `node src/life/testing/raids-cost.mjs grown-harbour` (phone-sized, processor slowed 4x).
- The garrison's sally (catalogue L74): `sally.ts` (driven by `raid.system.ts`), `salliesOf(stage)`; the hook in
  `src/life/people/garrison.system.ts` is `garrisonsOf(stage)` and each garrison's `out` (while set, the troop and
  rider are not stepped and are drawn where `out` says). The raid side: `raid.pin` / `unpin` / `repel`.
  `RAID.sally` 0 keeps garrisons in (raid.test.ts does). Cost: `src/life/testing/sally-cost.mjs`.

## How it is built (`src/life/raid/`)
- `site.ts` (pure): landings (walkable cells at the water's level with open
  sea beside them, how open the ground behind is, their neighbours), the town's
  heart, the landing raid's beach / turning point / route in and out
  (`ship-routes.ts`), the boats raid's ways (`boatWays`: each boat from beyond
  the edge to its landing and out again, all coming in over the same water).
- `raid.ts`: the `Raid` (beats, the ship (null in a boats raid; `lead` is the
  ship or the first boat afloat) and boats, the band, loot piles,
  targets, the town running, stopping them). Sea side in `stepSea` (called by
  the system), land side in `stepLand` / `offer` (called by the chain).
- `vessel.ts` (hull, yard and sail, oar banks, loot heap, posed on the swell,
  cut off at the map's edge), `figure.ts` (a raider drawn at sea with the
  crowd's own pieces and look: the hand-over at the water's edge does not show).
- `chain.ts`: the raid's chain on the board (first in `allChains`). Raiders
  ashore are crowd people from `crowd.ashore`, marked `raider`, claimed by it.
- `raid.system.ts`: plans on summons, steps and draws, war-cry balloons
  (`src/parts/raid/cry.ts`), flames on a burning ship, hears blasts and
  lightning, raids on their own. `sound.system.ts`: horn, alarm bell, cries,
  splashes, the keel on the sand.
- Parts: `src/parts/raid/longship.ts`, `src/parts/people/barbarian.ts`
  (costume), `raid-gear.ts` (brand, axe, club, horn), `loot.ts` (chest, pig,
  hen, ham, cloth, cheese, candlestick). Numbers: `src/style/raid.ts`.

## Hooks added in shared files (all additive)
- `crowd.ts`: `Person.raider?`, `Barbarian` in the costume union; a raider is
  not turned out as a non-resident at a town change; raiders and anybody
  running from them (`flee:` errands) run; raiders jostle through each other.
- `people.system.ts`: the barbarian costume and gear (`costumeLook`, the extra
  mesh, `toolOf`). `extras.ts`, `hands.ts` (`SHAFTS`), `loads.ts` (loot).
- `town/board.ts`: `assign` ignores any chain but the raid for a raider.
  `town/hands.ts`: `canWork` is false for a raider. `town/index.ts`: the chain.
- `town/scenes.ts`: `Scene.urgent`; `app/scene-note.ts` shows an urgent note
  whatever the gap, over a lesser one.
- `mischief/director.ts`: `hold(key, on)` (holds the act open: one undo step,
  undo mid-raid ends it via 'reset'), `threats` (raiders ashore),
  `extraVessels` (Lightning can strike the raid's ships).
- Scenes call themselves off near `threats`: wedding, beach, snow day, supper,
  carols (one line each).
- UI: `pieces.ts` (`raid`), `icons.ts`, `mischief.ts` (use + guide entry),
  `menu.ts` + `interface.ts` (Raiders switch, `little-city.raiders`),
  `app/main.ts` (`__lc.raids`), `sequence.mjs`, `scene-cost.mjs`.

## Round 2 (the sweep, readability, fighting back)
- The sweep: `parties` of three and `quarters` (`chooseTargets`), `nearQuarter`
  / `spread` / `standFor` (each raider his own cell, spot and side of a
  building), `pileStep` (loot run back to a twelve-place pile).
- Readable from afar: `far.ts` `raiderScale` (people.system and `Figure`),
  shield on the left arm, the chief's `standard` (raid-gear.ts), smoking
  brands, a gold chest, the `panic` pose for townspeople running from them
  (pose.ts, crowd.ts `gait`).
- Fighting back: `fightBack` / `afterBrawl`; `scuffles.between(a, b)` added to
  `scuffle.ts` (a brawl started on purpose, walking or standing, no making up);
  `toolOf` gives a chaser a broom or a frying pan (`pan`). Hens scatter
  (`chicken.behaviour.ts` reads `director.threats`). Livestock escape:
  `escape` / `stepEscapees`. Market-day baskets taken off a stall's counter
  and put back at the end.
- The Hand: `handled` registers each vessel with `critterPose` as
  `ship:raid<n>-<k>` (the `ship:` prefix keeps blasts off it: the raid sinks its
  own ships); `Vessel.held` / `aground` / `off`.
- Cost: `scene-cost.mjs --fires N` (the fires alone) and `--raid`. Grown
  harbour: fires alone, 99 cells burning, p95 51.6 ms (it is the fire); a raid
  ashore with 2 cells burning, median 1.5 → 2.15 ms after drawing sea figures
  on twos (2.41 before).
- Guide picture: `node src/life/testing/raid-picture.mjs` writes
  `public/guide/raid.webp`.

## Round 3 (Derek: too big, glitching at sea, standing in a line doing nothing)
- Size: raiders are the townspeople's size at every zoom (`raiderScale()` is 1; the orchestrator's change).
- The clump: `crowd.ts` `follow`'s last rule (no step closer than a body to anyone ahead) still made
  raiders yield to each other, and walkers waited on the garrison's column (`bodies`) with `stuck` held
  at 0, so they never thought again. Both are skipped for raiders; raiders take their own lanes across the
  way (`startWalk`), skip single-file queueing (`mayEnter`). Building sites are targets (`Target.site`:
  kicked a stage worse, a ladder or hod carried off); an early horn when the town offers nothing; no raid
  on its own at a town over 40 % in ruins. Test: `raid.test.ts` "a town already wrecked and mending".
- The sea: a boat casting off was lerped from its tow onto its way at up to 0.75 a frame (now its way
  starts where it lies, `castOff`); figures aboard were placed on the hull's previous frame and only every
  other frame (now vessels are drawn first and figures aboard are `rigid`, every frame). Test: "whoever is
  aboard moves rigidly with the vessel every frame".
- Also: one war-cry balloon to a knot of raiders; finer brand smoke; boarding from near the spot (the ship
  waited 40 s for one who could not reach it; now 25 s at most); a sunk ship takes its yard under.
- Sequence verb `knockall@0,0,0` (a town like his).

## For the Hand / thrown bodies
Raiders ashore are ordinary crowd people: thrown and carried with no special
case. A thrown raider's plan fails and the raid gives him the next one; one
not back 40 s after the horn is left behind and runs for the sea. Raiders at
sea (`Figure`) are not liftable (only the vessels are, with whoever is in
them).

## Not done / watch
- The castle's marching troop does not sally out (its guards brawl); dogs do
  not chase; sheep do not scatter; a stall's baked goods stay; people do not
  peek from windows; castle gates do not keep raiders out.
- Sunk things stay under: `surface.ts` discards any mover fragment below
  `uSeaY - 0.015` (beside the map-edge cut). Frames from a low angle:
  `node src/life/testing/sink-frames.mjs --time night|day`.
- Boats on the shore wait for their own crew; a raider whose boat is sunk is
  moved to another boat still there (seats may double up).
- p95 with fires burning is the fire's, not the raid's.
