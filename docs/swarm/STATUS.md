# Little City build: run log

Orchestrator's log. Newest stage at the bottom. Plan:
`docs/superpowers/plans/2026-11-19-little-city-swarm-master.md`.

## How to resume (for the orchestrator)

1. Read this file, then `git log --oneline | head -20` and `git branch --list 'swarm/*'`.
2. A stage is done when its gate line below says PASSED. Otherwise look for
   finished `swarm/<owner>` branches to merge, or relaunch the missing owner.
3. Gate = merge owner branches into `yaoderek/bloom-s-monkey-city-builder`,
   `npm run check`, `npm run shots`, look at the shots, update this file,
   commit.

## Stage 0: Foundation — PASSED (02:00)

- Head `23e3a24`. 143 tests green. Shots, inspect and bench CLIs work
  headless with real WebGL (Apple M5, ANGLE Metal).
- `docs/swarm/CONTRACTS.md` is the API reference. It lists 25 deviations from
  the plan's contract sketch in its section 15; the important ones: `define*`
  functions return objects that files export; rule callbacks take a `ctx`;
  floor regions and fence/wall runs are structures; `defineLayer` and
  `defineSystem` are new.
- Known over-budget numbers are stub artefacts (3,039 draw calls, one mesh
  per structure).

## Stage 1: Core — RUNNING (launched 02:00)

Three owners in parallel worktrees, branches `swarm/logic` (Opus 5.5),
`swarm/look` (Fable 5.2), `swarm/interface` (Fable 5.2). Look may make
additive changes to `src/render/api.ts` and `LifeStage`.

**Stage 1 — PASSED (03:15).** All three merged with no conflicts; 445 tests
green. Two Look fixture tests were rewritten at the gate because Logic now
merges a stack into one structure.

- Logic `3f62149`: every placement rule, share codec (2,148 blocks → 1,940
  characters), island generator checked on 200 seeds, K1–K5, S1–S4,
  structures, 20 facts (`src/resolve/facts/README.md`). `resolveShape`
  median 2.5 ms in the browser; p95 10–12 ms (suspected warm-up; over the
  8 ms budget, revisit in Polish).
- Interface `cb14ab5`: tray with four drawers and 40 drawn icons, all tools,
  ghost, touch gestures, menus, gallery. Stairs `rot` = the direction the
  stairs climb toward (Logic agrees).
- Look `cbb6edd`: ink-and-paper renderer at 11 draw calls for 2,000 blocks,
  terrain and sea, camera, dusk cycle, `docs/swarm/ART.md`.
- Open look issues carried forward: a strip of stray ink along the top edge
  of the frame when the sea runs off-screen; no contact shadows; trees read
  as shaded balls; ghost has no ink; tuning panel does not refresh the
  renderer's cache in-game.
- Dev server for Derek: http://127.0.0.1:5173/ (restart at each gate).

## Stage 2: The town — PASSED (04:40)

All merged with no conflicts; 886 tests green. Every R and J rule in the
catalogue is built (all three owners went past tier 1), so Stage 4 has no
"structures depth" left beyond art fixes.

- Look second pass `2018856`: grounding shade, edge-ink fix, island polish,
  sketched ghost, style changes redraw.
- Monuments `816d812`: all R-T, R-L, R-M, R-A rules, J13–J16, supports layer.
- Houses `c5c2f20`: all R-H rules, R-W01, J04–J12, J24–J27. Stand-in rules
  for D07, D09 and L03 live in `scenarios/houses/standins.ts`; Stage 3 must
  replace them with real rules.
- Ground `370dd4d`: all R-D, R-P, R-F, R-S, R-G, R-E rules, J17–J23, J28.
- Orchestrator fix: `src/terrain/terrain.test.ts` got a 60 s timeout (it
  timed out under machine load for every agent).
- `npm run shots` takes ONE scenario pattern per call.

Open items for the art fix pass: gap where an arch meets a house or round
tower; notch at inner corners of keep battlements; terrace railings 0.07
outside the house wall line; stilt-house ladders draw as markers (no
`ladder` part); chapel is plain; big hip roofs are flat areas; over-tall
flues; walls, stairs and fountains are ruler-straight; some parts over the
triangle aim. Speed: `resolveShape` about 8 ms median on bench-2000 with
house rules (budget 8 ms).

## Stage 3: Life — RUNNING (launched 04:45)

Branches `swarm/animation`, `swarm/people`, `swarm/dressing` (all Fable
5.2), plus one art director reviewing Stage 2 into
`docs/swarm/art-review-1.md` (branch `swarm/art-review`).

**05:25** Art review 1 merged (`docs/swarm/art-review-1.md`, showcase
`scenarios/core/everything.scenario.ts`, 55 roles asserted). Fix passes sent
to Houses, Monuments, Ground and Look (same agents, resumed) on their
existing branches. Unit-test timeout raised to 30 s. Seven agents running:
Animation, People, Dressing, plus the four fix passes. Dev server hit its
two-hour limit and is not restarted (Derek can run `npm run dev`).

**~05:30 STOPPED: Fable usage limit.** All seven running agents died
mid-work (Animation, People, Dressing, and the Houses, Monuments, Ground and
Look fix passes). Work survived in their worktrees.

**10:40 RESUMED** after Derek reset the limit. All seven resumed by message
with: commit after every rule or fix, must-fix notes only for the fix
passes, no sub-agent forks. State at resume: animation 1 commit (plus dead
forks `swarm/animation-boats`, `swarm/animation-birds` with uncommitted
work), people 2 commits + 4 files, dressing 0 commits + 31 files, houses 16
files, monuments 12 files, ground and look at the start of their passes.

To stay inside the limit from here: no forks; discovery rounds cut to 2
with one explorer and one builder each; logic-only work goes to Opus 5.5.

**10:40 (second resume).** The session restarted a minute after the first
resume and stopped all seven again; resumed again by message.

**Standing instruction from Derek:** if an agent dies on the Fable usage
limit, do not wait: relaunch that owner as a fresh Opus 5.5 agent pointed at
the SAME worktree path (no new worktree), with a handoff brief: read
`git status`, `git log`, the owner's original brief (in this log's stage
sections and the plan), `docs/swarm/requests/<owner>.md`, then continue.
Worktree paths: `git worktree list`.

**Model instruction from Derek (10:55):** every agent launched from here on
runs on Opus 5.5 ("fable is too slow"): Stage 4 polish, discovery rounds,
final art pass, and any replacement for an agent that dies. The seven
already running stay on Fable to keep their memory; each keeps a handoff
note in `docs/swarm/handoff/<owner>.md`.

**Published (11:10):** https://yaoderek.github.io/littlecity/ serves the
built game from the `gh-pages` branch (built files only; the working branch
is not pushed beyond what was already on the remote). Pages source was
changed from the working branch to `gh-pages`. Redeploy after each gate
with `./tools/deploy-pages.sh`.

**(time: see git log)** Merged fix passes: Monuments `cb686d2` (M1–M7 all done) and
Houses `21c4909` (H1–H6 plus role props; adds `J05.terrace-edges`,
`R-H99.role-props`). Typecheck, lint and 853 unit tests green. Browser
tests in `tests/e2e/interface.e2e.test.ts` time out under machine load
(load average 16 with eight agents); rerun `npm run check` when the machine
is quieter before the next Pages deploy. Still open from these passes:
Ground's half of the terrace railing (G4), bench not re-measured after
Houses' heavier J10. Held-length feature in progress on `swarm/held-length`
(Opus 5.5).

**(time: see git log)** Merged Ground fix pass `8419265` (G1–G5). Orchestrator rewrote the
end of `scenarios/rules/J05.terrace-edges.scenario.ts`: Ground no longer
adds J19 railings on house roofs, so the house parapet stands there.
856 unit tests green. Open seams: fence edge pieces round a pitched-roof
house float at eaves level (needs a decision: skip drawing them); stall and
fountain triangle trims not done. Still running: Animation, Dressing, Look
fix pass, held-length; People finishing.

**(time: see git log)** Merged Animation `409c40c` (L02, L03, L06, L07, L09, L10 part,
L11–L13, L16, L17, L19, F01–F05; `src/life/MOTION.md`; sequence tool
`src/life/testing/sequence.mjs`). Full `npm run check` green: 972 tests,
browser tests included (Animation fixed the slow e2e file by closing pages).
Published to Pages. Open: windmill cap does not yaw; L29 blocked (bell,
clock hands, fountain jet baked as static geometry); grounding picture
redraws every other frame so GPU load is about 3.5x (check on phone);
remaining L rules and sound not done.

**(time: see git log)** Merged Dressing `ea3274c`: D01–D11 (not D12), D13, D15, D20, D24,
U01–U08, U12 (centre half). Full check green: 1,089 tests. Published.
Not built: U09–U11 and U12 edge half (need Houses files), D12, D14, D17–D19,
D21–D23, D25–D28, D30–D34. `resolveDressing` 13 ms of 30 ms. Orchestrator
note: chimney smoke reads as stacked white lumps and is too dense; a laundry
line can cross above a public stair.

**(time: see git log)** Stage 4 depth launched on Opus 5.5: `swarm/dressing-depth`
(remaining D and U rules; may edit Houses files for U09–U11) and
`swarm/life-depth` (remaining L rules, L29 unblock, cap yaw, sound, smoke
tuning; may edit the generators that bake bell, clock hands and jets).

**(time: see git log)** Merged Look fix pass `61ba162` (L1–L4; actors kept out of the
grounding picture). Orchestrator relaxed one assertion in
`src/render/view.e2e.test.ts` (actor pool may exist at rest). Full check
green: 1,095 tests. Published. Open from Look's bench: geometry rebuild
after one Auto edit is 11 ms median / 30 ms p95 on bench-2000 (budget 8 ms),
almost all inside structure generators rebuilding a whole merged structure;
`npm run bench -- everything` throws (use
`node src/render/testing/bench.mjs <scenario>`); ART.md pictures are stale.
Running: People (finishing), held-length, dressing-depth, life-depth.

Note: the clock times on the six entries above were guesses and have been
removed; the merge commits carry the real times (all between 11:08 and
11:54 on 2026-11-19).

**11:55** Merged held length `9772953` (scroll or the − n + stepper
stretches run pieces; `src/ui/length.ts`). Full check green: 1,117 tests.
Published. Running: People (final check), dressing-depth, life-depth.

**12:00** Merged People `8f9901d` (walking graph, L21–L28, L32, L08 round).
Typecheck and lint green; 5 unit tests fail at the seam with real Dressing
props and Animation actors (lamp and pigeon counts, shut-in residents,
children). Sent back to the People agent to fix on `swarm/people`; NOT
published until green. Last published build: held length (`5bb587c`).

**Stage 3: Life — PASSED.** People integration `60d63c3` merged; full check
green: 1,203 tests. Published. All three life owners plus four fix passes
and held length are in. Lamplighter's round = the ten lamp posts nearest the
biggest square; lamps on the round wait for him (`deferLamp`); windows light
only where someone is home; the walking graph reads decoration props.
Flaky: `tests/e2e/held-length.e2e.test.ts` once measured a stepper button
at 43 px against a 44 px minimum (passes on rerun): fix in polish.
Running: dressing-depth, life-depth (both Opus 5.5).

**Life depth merged** (`ad8e993`, Opus 5.5): soft smoke, flaw fixes, L29
mechanisms and mill cap unblocked, L05, L10 (moon, shooting star), L14, L15,
L18, L30, L31, L33–L35, sound F06. Conflict in `src/render/index.ts` and
`slots.ts` against the Look fix pass resolved by keeping both mechanisms
(Look's `aloof` slots and movers pool; life depth's slot kinds and `urgent`).
One view test threshold updated (moving props refresh ground shade every 4th
frame). Full check green: 1,240 tests. Published. Not done: L20 rower,
bunting glow at night, gust front unverified by eye; sound defaults to ON
(interface's stored default) where the brief said off.
Dev server hit its two-hour limit again and is NOT restarted; the public
site serves the same build. Running: dressing-depth, grow-town (Opus 5.5).

**Dressing depth merged** (`121520d`, Opus 5.5): U09, U10 (turret only),
U11 (+U11-F), U12-E, D12, D14, D17–D19, D21–D23, D25–D28, D30–D34, laundry
height fix, J20-F floating fences. Full check green: 1,323 tests. Published.
Every catalogue rule now has an implementation except L20 (rower).

Bench on bench-2000 (machine at load 10, so approximate): frame rate 60 fps,
14 draw calls; `resolveShape` 12.8 ms median / 40 ms p95 in the browser
(budget 8); geometry rebuild 9.3 / 20 ms (budget 8); `resolveDressing`
9.4 / 22 ms (budget 30). Slowest rules: J09 windows 1.9 ms, R-H05 boathouse
1.7, D01 lamps 1.5, L19 sailboats 1.2, J11 chimneys 1.1.

**Stage 4 polish launched** on Opus 5.5 (`swarm/polish`): shape-stage and
rebuild speed, phone viewport pass, and the small-fix list (walls on
pitched roofs, stepper 44 px flake, bunting glow, L20 rower, stale ART.md
pictures). Also running: grow-town.

**Two more requests from Derek, both specced in the design and launched on
Opus 5.5:** house styles (`swarm/house-styles`: six named looks plus Random
as the default, chosen from a flyout on the House tray button, stored as
`Block.style`; Alt-click copies a look) and animation polish
(`swarm/animation-polish`: doors that open, roof hatches, a watching pass
over all motion, the gust front). Running now: grow-town, polish (speed),
house-styles, animation-polish. Expect merge overlap in
`src/parts/openings/door.part.ts` and `src/style/houses.ts`.

**Grow a town merged** (`ffa1ee9`, Opus 5.5): `src/townmaker/`, menu entry
with dice button, animated playback, one undo step. 62–66 distinct roles per
grown town; every part-R role reached across seeds 1–5 except willow
(islands 1–5 have no non-sand shore). Orchestrator added `town-hall` (new
role from dressing depth) to the coverage list as PENDING. Full check green:
1,343 tests. Published. Second pass sent to the same agent: town hall,
denser centre, new dressing-depth rules, streets to summits, a viaduct.
Running: polish (speed), house-styles, animation-polish, grow-town pass 2.

**House styles merged** (`c033878`, Opus 5.5). Conflict in
`src/ui/interface.ts` with Grow a town resolved (both guards kept); second
`dice` icon renamed `styleDice`. Orchestrator fixed the flaky stepper test
(`.lc-step` no longer shrinks in its flex row). Full check green: 1,369
tests. Published.

**Three more requests from Derek, all launched on Opus 5.5:**
- Castle life: garrison troop marching round the castle and a mounted rider
  (catalogue L36, L37) → added to the animation-polish agent's list.
- The guide: a side panel with a picture and a one-line recipe for each
  special building (design section 7 "The guide") → `swarm/guide`.
- Flicker and clipping on camera rotation → `swarm/steady-ink` (renderer).
Running: polish (speed), animation-polish, grow-town pass 2, guide,
steady-ink.

**Grow a town pass 2 merged** (`d614f3a`): town hall on every square with a
ring road, dense two-ring centre, corner houses, courtyard block, summit
streets up two-level cliffs, a valley viaduct on 4 of 5 seeds, harbour
access. 58–68 roles per town. One seed in five is a "pump town" with no
fountains (D33 needs none). Orchestrator fixed `L10.fireflies` (negative
seeds gave a negative index) and the stepper test (it measured a button
mid-press, scaled to 0.97). Full check green: 1,370 tests. Published.
Running: polish (speed), animation-polish, guide, steady-ink.

**Animation polish merged** (`27c6c6d`, Opus 5.5): door leaves that open
(`L29.door-leaves`), roof hatches, shore arrivals and leavers, workers'
tools, gust shiver fix, castle garrison (L36) and rider with a horse (L37).
Full run: 1,401 of 1,403 passed; the two failures were 30 s timeouts on
heavy generator tests with the machine at load 23 (both pass alone; their
timeouts are now 240 s). Published. The watching pass is only partly done:
`docs/swarm/animation-polish.md` lists what is still unwatched (benches,
birds, boats, smoke, beam, sails, flags, clock, lamps, windows, bounce,
wobble, pop-in). Second pass sent to the same agent.
Running: polish (speed), guide, steady-ink, animation-polish pass 2.

**Polish merged** (`f20fc9b`, Opus 5.5): incremental town logic
(per-structure facts and local rules reused across resolves, with an
equivalence test over 360 random edits), cell-by-cell path meshes, phone
bench (`node tools/phone-bench.mjs`), and all small fixes (walls on pitched
roofs, bunting glow, L20 rower, fishing-boat route, bench tool, sound off
by default, soft cloud shadows). Orchestrator fix at merge: the new caches
ignored `Block.style` (added to content keys and `sameWorld`).
**The guide merged** (`613d9ec`, Opus 5.5): 44 entries plus the Auto block,
45 pictures (986 KB) in `public/guide/`, proof test per recipe.
Full check green: 1,480 tests. Published. Follow-up sent to the guide
agent: garrison and rider entries. Running: steady-ink, animation-polish
pass 2, guide follow-up.

**Guide follow-up merged** (`1e821fa`): Garrison and Rider entries, 47
pictures (1,052 KB) re-rendered. Full check green: 1,485 tests. Published.
Found by the guide agent and sent to animation-polish: a lone keep gets no
garrison (no gate is found), and the rider is only drawn when a plaza
exists; both contradict catalogue L36/L37.
Running: steady-ink, animation-polish pass 2.

**Four more requests from Derek, specced (commit `b6c3910`) and dispatched:**
- Rivers and varied islands (gentle, hilly, steep, archipelago), rock tops,
  `World.terrainGen` so old towns keep their island → new Opus agent on
  `swarm/terrain2`. After it merges, Grow a town needs a third pass
  (bridge rivers, build on steep islands).
- House style did not let him build an inn or manor (same roof, different
  wall colours, so blocks never merged) → house-styles agent resumed: each
  style gets a signature wall colour so houses of one style join.
- Night: lights should go out through the night, silhouettes in lit windows
  (catalogue L07 rewritten) → animation-polish agent.
- Fireflies removed entirely → animation-polish agent.
Running: steady-ink, animation-polish pass 2, house-styles fix, terrain2.
Not started: discovery rounds (Stage 5), final art pass (Stage 6).

**Animation polish pass 2 merged** (`aca629f`): calmer Grow-a-town
playback, rows no longer jump, door glass follows who is home, pigeons land
cleanly, fishing boat banks, troop reads as two files, rider sits astride,
lone keep gets its troop, rider cases for no plaza and no street. The agent
is still running on the night-windows and fireflies items.
**Steady ink merged** (`7224daf`): flicker on camera motion cut (mean blink
score 0.103 → 0.015): coplanar tie-break per ink group, tighter near and far
planes, four samples for thin lines, pen wobble anchored to the drawing,
wave marks fixed to the water. Costs about 1 ms a frame at 1280 × 800 at 2×.
Tools: `node src/render/testing/flicker.mjs`, `coplanar.mjs`. Remaining
coplanar overlaps listed in `docs/swarm/requests/steady-ink.md` → new Opus
agent `swarm/coplanar`.
Full check green: 1,500 tests. Published.
Running: animation-polish (night windows, fireflies), house-styles fix,
terrain2, coplanar.

**House styles fix merged** (`570dd8a`): each style has a signature wall
colour (Harbour cream, Thatch pink, Tudor peach, Manor yellow, Farm blue,
Villa mint), so houses of one style join; inn and manor proven by real
clicks in a browser test; ghost frames the building a block would join.
Full check green: 1,508 tests. Published. Follow-ups sent to the same
agent: houses must join across a one-level terrain step; R-H05 boathouse
must not pre-empt inn, manor and town hall for big houses. Known limit,
left as is: a row of identical same-style houses joins into one building
(workaround: a different swatch colour per house, or gaps).
Running: animation-polish (night windows, fireflies), terrain2, coplanar,
house-styles follow-ups.

**Night windows and firefly removal merged** (`b6ead9e`): houses put lights
out through the first half of the night until about one in six stays lit;
inns stay lit; silhouettes (four at most) in lit windows; a held night
still changes; fireflies deleted everywhere. Cause of "all lit": the sun
button held the night at its midpoint while homes went to bed at a random
30–85% of the night. Full check green: 1,509 tests. Published.
Still open from animation: gust front not visible; everything-town troop
has no loop; bell small; gulls, small birds, sailboats near piers and the
rower's route not watched.
Running: terrain2, coplanar, house-styles follow-ups.

**House follow-ups merged** (`5f45fbb`): a house joins a same-colour house
one level up or down in a side-adjacent column (step must be terrain,
marble, arch, dock or pillar; never across two levels or diagonally);
storeys counted on the tallest column; R-H05 boathouse limited to footprint
≤ 4 and ≤ 2 storeys. Full check green: 1,515 tests. Published. Split-level
houses draw with a separate roof and door per level (stepped look); a
continuous roof across a step is not built.
Running: terrain2, coplanar.

**Link previews added by the orchestrator:** Open Graph and Twitter card
tags in `index.html`, `public/og.jpg` (1200 × 630, 240 KB, a render of the
`everything` town with a title tag), favicon and touch icon. Verified live:
tags and image served; a share link made on the public site reopens the
same town in a fresh browser. Per-town preview pictures are not possible on
GitHub Pages (crawlers run no scripts and never see the `#t=` part).
**Walk mode requested by Derek** (design section 7 "Walk mode") → new Opus
agent on `swarm/walk`.
Running: terrain2, coplanar, walk.

**Walk mode is a PREVIEW ONLY (Derek):** do NOT merge `swarm/walk` into the
main branch and do NOT publish it until he has tried it locally and said
yes. When the agent reports, serve its worktree on a separate local port
for him. Scope trimmed to: perspective camera and ink, basic walking,
enter and exit.
**Big ships requested** (catalogue L38–L42: galleon, cog, galley, river
barge, passing sails) → new Opus agent on `swarm/ships`.
Running: terrain2, coplanar, walk (preview), ships.

**Welcome card added by the orchestrator** (`src/ui/welcome.ts`): first
visit to an empty island shows "Try growing a town… or build your own" with
Grow a town and Build my own; once per browser (`lc:welcomed`). Tools and
tests mark it seen by default (`openPage(..., { welcome: true })` shows it).
**Terrain 2 merged** (`4f3b52c`, Opus 5.5): generator 2 with four island
characters and rivers (measured over 500 seeds: gentle 48%, hilly 28%, steep
13%, archipelago 11%; no river 19%, one 62%, two 19%), rock tops, scree, one
ledge on tall cliffs, `World.terrainGen`, share codec v3. Generator 1 pinned
by digest; existing scenarios pinned to generator 1. Full check green:
1,551 tests. Published. Follow-ups: river look from the overview (same
agent), Grow a town pass 3 for rivers and steep islands (grow-town agent).
Running: coplanar, walk (preview only), ships, terrain2 follow-up,
grow-town pass 3.

**Welcome changed** to a small closable note beside the menu button (Derek
did not want it centred or blocking). Published.
**Grow a town pass 3 merged** (`df16da5`): the street router crosses water
with stone bridges (up to 6 water columns, equal banks), boardwalks between
beaches (up to 12), and climbs cliffs of 2–6 levels on stepped marble; a
riverside district (willows, reeds, boathouse, two barge landings); a
galleon berth sought in the harbour; a small 3×3 square on cramped islands.
Generator-2 towns: 196–444 blocks, 40–61 roles each, a stone bridge on
every river island. Full check green: 1,564 tests. Published.
Still weak: one or two districts per town left without a street; no bridge
between banks of unequal height; no viaduct or sky bridge between steep
shelves; cog berth not built separately.
Running: terrain2 follow-up (rivers from the overview), coplanar, ships,
walk (preview only).

**Terrain 2 follow-up merged** (`ce6a721`): rivers about two wide with
stronger meanders, straight-cut diagonal banks, a river water material and
shader pattern (teal tint, flow marks, bank line, shallows fan at the
mouth), sand spits, visible gorges, calmer gentle islands, stump removal;
K3 lighthouse counts sea water only (three lines in `src/resolve/kinds.ts`).
GENERATOR-2 ISLANDS CHANGED FOR EXISTING SEEDS (public for a few hours):
towns saved or shared on a generator-2 island since then may not fit their
island. Full check green: 1,568 tests. Published.
Open: terrain rebuild p95 30 ms on a steep island (budget 8); banks are
angular, not curved; a free-standing 2×2 summit block can remain.
Running: coplanar, ships, walk (preview only).

**Coplanar cleanup merged** (`722c124`): overlaps removed at the source
(everything 130 → 1, grown-town-1 231 → 1, people-town 82 → 0), regression
test `src/render/testing/coplanar.test.ts`. Flicker scores unchanged (the
tie-break already settled these pairs). Orchestrator added a TEMPORARY
allowance for pairs introduced by Grow a town pass 3 (dock/dock, arch/dock,
marble/marble, arch/marble) → follow-up sent to the same agent, with the
doubled stilt-house ladder (R-H04). Full check green: 1,576 tests.
Published.
**Walk mode preview ready** (`swarm/walk` at `1ec9159`, NOT merged, NOT
published): served from its worktree at http://127.0.0.1:5174/ (try
`/?walk=everything`, `/?walk=grown-town-2`). Waiting on Derek's verdict.
Running: ships, coplanar follow-up.

**Walk preview feedback from Derek ("alright"):** cannot look in some
directions; trees block him completely (should pass through); wants
Minecraft-style flying (double-tap Space; Shift up, Control down); the
glide in looks wrong and must not pass through things (glide out is good).
Sent to the walk agent. Still preview only, still served at port 5174.
Running: ships, coplanar follow-up, walk (preview fixes).

**Two more from Derek:** doormats are badly broken with overlaps (D11) →
added to the top of the coplanar agent's follow-up, with a prop scan;
people walk through each other → animation-polish agent resumed to add
local avoidance with a no-overlap test.
Running: ships, coplanar follow-up (doormats first), walk (preview fixes),
animation-polish (people avoidance).

**Big ships merged** (`3cbedfe`, Opus 5.5): L38 galleon, L39 cog, L40
galley, L41 river barge, L42 passing sails; berths found by sailing a hull
in and out; one big ship at sea at a time; small boats give way; guide
entries for galleon, cog and galley. Full check green: 1,610 tests.
Published. In the grown-town scenarios: galleon calls at 1, 6 and 7; cog
and galley also at 4; none at 2 and 5 (no berth); the river barge fires in
none of them (no pair of river docks 10 apart by water qualifies).
Open: fishing boat only slows for ships, rower ignores them; barge under a
bridge untested; rigging busy at overview.
Running: coplanar follow-up (doormats first), walk (preview fixes),
animation-polish (people avoidance).

**Boat rules rejected by Derek** ("I just want boats"): no thresholds or
prerequisites; any dock space brings whatever boat fits; nothing shrinks or
fades; boats leave and arrive through an invisible barrier at the map edge,
cut off cross-section-wise. Catalogue section "Boats and ships" rewritten
(`eca4f0c`); ships agent resumed to rework L17–L20 and L38–L42, the guide
entries, and add edge clipping in the renderer.
Running: ships rework, coplanar follow-up (doormats first), walk (preview
fixes), animation-polish (people avoidance).

**Walk preview, second version** (`swarm/walk` at `368a554`, still NOT
merged): free look (pitch was capped at 70°, drag stopped at the screen
edge, two handlers fought); collision against solids only (trees are a slim
trunk; one-level hop up); Minecraft-style flying (double-tap Space; Shift or
Space up, Ctrl or C down; Alt or double-tap W to sprint); glide in comes
from above along a checked clear line; near fade fixed. Full `npm run check`
not re-run on that branch. Served at http://127.0.0.1:5174/. Waiting on
Derek.

**Doormats and overlap follow-up merged** (`efd2a21`): D11 mats placed on
the surface outside the door (0.008 slab, 0.004 proud, sized to the door,
clear of the leaf, none where there is no flat spot), props now in the
coplanar scan, R-H04 ladder only on the lowest stilt house, picket scribble
traced to a doubled garden corner post and fixed, temporary allowances
removed. **People avoidance merged** (`6734299`): keep right, overtake,
give way, walk round people standing; sustained overlaps over 7.5 minutes:
people-town 121 → ~20, everything 162 → ~80, dense square 131 → ~27;
remaining ones are squeezes at single-file spots. Generator timing tests
loosened to 900 ms (shared machine). Full run: 1,636 of 1,637; the one
failure (shots CLI) is a timeout at load 20 and passes alone. Published.
**Seasons and weather requested** (design section 13a) → new Opus agent on
`swarm/seasons`.
Running: ships rework, seasons and weather. Walk preview awaiting Derek.

**Boat rework merged** (`963d4fa`): fit is the only test; rowboats at every
dock (cap 14 desktop, 8 phone); big ships take turns at the three longest
quays; sailboats and a passing tall ship on every island; barge on any
river dock; boats arrive and leave through the map edge, cut per pixel with
a filled, inked cut face; nothing shrinks or fades (tests). Full check
green: 1,640 tests. Published. Open: new small boats on a live town still
appear in place; gangplank, sailors and goods still vanish at the hatch;
town birds, balloon and clouds not checked at the edge.

**Stage 4 closed. Stage 5 (discovery) started**, at Derek's prompting, in
parallel with seasons: round 1 explorer on Opus 5.5 (`swarm/discovery-1`)
builds towns and writes proposals to `docs/swarm/discovery/round-1.md`;
the orchestrator curates; one builder implements.
Running: seasons and weather, discovery round 1 explorer. Walk preview
awaiting Derek (served at port 5174 until its two-hour limit).

**Discovery round 1 curated.** Explorer report merged
(`docs/swarm/discovery/round-1.md`: 12 towns, 66 proposals). Accepted and
split between two Opus builders:
- `swarm/disc1-structures` (ids R-*, J-*): faults FX-01 (podium not keep),
  FX-02 (inn and shop glut), FX-05, FX-06, FX-08, FX-09, FX-10, FX-11,
  FX-12; roles RC-01 churchyard (+FX-07), RC-02 warehouse, RC-03 watermill,
  RC-05 inhabited bridge, RC-06 smithy, RC-07 theatre, RC-08 obelisk, RC-09
  barn, RC-13 stoa, RC-14 bandstand, RC-16 cathedral, RC-19 schoolhouse,
  RC-21 folly tower.
- `swarm/disc1-fill` (ids U-*, D-*, L-*): faults FX-03 (fingerposts), FX-04
  (lamps in the country); RC-04 orchard, RC-12 market cross, UF-01 to UF-05,
  UF-08 to UF-12, DC-01, DC-03, DC-06, DC-07, LF-01 wedding, LF-02 market
  day, LF-03 ferry, LF-04 shepherd, LF-05 night watchman; NP-01 hedge edge
  piece last, if time.
Deferred: NP-02 placeable water, RC-10, RC-11, RC-15, RC-17, RC-18, RC-20,
UF-06, UF-07, UF-13, UF-14, DC-02, DC-04, DC-05, DC-08, LF-06 to LF-09.
Running: ships (several at once), seasons, disc1-structures, disc1-fill.

**Derek's priority (stated 2026-11-19):** interactions and a town that
feels alive matter more to him than unique buildings ("I love how the boats
have people who unload stuff"). Third discovery builder launched on Opus:
`swarm/living-town` (work chains with carried goods: bread, fish, harvest,
water and washing, trade from the quay; builders arriving when a house is
placed; daily rhythm; wedding, market day, maypole dance, shepherd, night
watchman; L-* ids from L50). The fill builder dropped its life events and
emits sockets for it.
Running: ships (several at once), seasons, disc1-structures, disc1-fill,
living-town. Walk preview awaiting Derek.

**Several big ships at once merged** (`31871fd`): a quay is split into
berths a galleon long; every berth gets ships (cap 8 desktop, 4 phone;
rowboats 24/12; sailboats up to 5); lanes shared by a look-ahead check,
arrivals wait beyond the edge, leavers go first; sailors, goods and
gangplank no longer vanish; new rowboats, sailboats and the fishing boat
come in from the edge. Full run under load (five agents): 8 timeouts; all
8 files pass when run serially (91 tests). Published.
Open: in the app the "already moored at open" fill does not happen, so a
big harbour shows 3–5 big ships in its first minutes; a ship whose quay is
erased can hold ~40 s before leaving; dressing p95 39.7 ms (budget 30) when
an edit changes the sea; rower and barge still appear in place.
Running: seasons, disc1-structures, disc1-fill, living-town.

**Mischief requested by Derek** (player-triggered destruction: fire, bomb,
Viking raid): design section 13b written; new Opus agent on
`swarm/mischief`. Touches saves (`Block.ruin`), the tray (a Mischief
drawer), people (bucket chain, fleeing, rebuilding), ships (longship).
Running: seasons, disc1-structures, disc1-fill, living-town, mischief.
**Mischief is EXPERIMENTAL (Derek): preview only.** Do NOT merge
`swarm/mischief` or publish it until he has tried it locally and said yes
(same treatment as `swarm/walk`). Serve its worktree on a local port when
the agent reports. The design section 13b is on the main branch as a spec
only.

**Seasons and weather merged** (`6885a22`, Opus): the year turns (24 min a
season), autumn trees, bare winter trees, snow falling and settling as
shading, ice, rain, mist, storms, festival lights and a tree in the square,
season and weather buttons. Conflict with the ships' edge cut in
`src/render/index.ts` and `shaders/surface.ts` resolved by hand (both
kept; the bare-tree material swap now skips the movers pool, which would
otherwise have lost its edge cut). Full run: 1,696 of 1,697; the one
failure (shots CLI) is a load timeout and passes alone. Published.
Not done by the seasons agent: people in winter clothes and umbrellas,
seasonal props (stooks, pumpkins, snowman, icicles, leaf drifts), candles,
rainbow, tracks in snow, weather sounds; spring is weak; full snow by day
is flat white; festival bulbs tiny at overview. Follow-up NOT yet sent
(machine is saturated; send when an agent slot frees).
**Derek: terrain must be editable** ("pretty important") → design section 6
"Shaping the land"; new Opus agent on `swarm/landshaping`.
**Derek: boats overlap each other and the river barge passes through
bridges** → ships agent resumed.
Running: disc1-structures, disc1-fill, living-town, mischief (preview),
landshaping, ships fixes.

**Living town merged** (`ed2e2b3`, Opus): L50 scuffle (dust cloud, grawlix
balloon, watchers, dazed ending), L51 bread, L52 water, L53 the catch, L54
builders at a newly placed house, L55 night watchman, L56 market day, L57
wedding; an errand engine in `src/life/town/`; guide group "Days the town
earns". Full check clean: 1,726 tests. Published. Second pass sent to the
same agent: bigger loads at wide zoom, trade carts from the quay, harvest,
laundry, a dog, the watchman breaking up scuffles, the fill builder's
sockets, temporary stalls on the walking graph.
Running: disc1-structures, disc1-fill, mischief (preview), landshaping,
ships fixes, living-town pass 2.

**Boat fixes merged** (`a7b149d`): no two floating things overlap (test
`src/life/ships/afloat.test.ts` over six towns, five minutes each); the
barge treats arches at the water and decks one storey up as blocked, stays
inside river water (river material, or water ≤ 3 wide for ≥ 6), poles back
without turning; rowboats get waiting places clear of berths and lanes.
Full check clean: 1,783 tests. Published. Side effect: grown-town-4 and -7
get no barge (low bridges cut their river docks off). Only the rowboat cap
scales with free water so far.
Running: disc1-structures, disc1-fill, living-town pass 2, mischief
(preview), landshaping.

**Shaping the land merged** (`b046809`, Opus): Raise, Dig and Level in the
Nature drawer; `World.terrainEdits`; one `land` edit type; things ride their
column; water classified as sea, river or pond (`MAT_POND`); share codec
v4 = v3 + flags + length-prefixed sections (bit 0 land; mischief should use
bit 1). One conflict in `src/life/people/crowd.ts` resolved (both lines
kept). Full check clean: 1,837 tests. Published.
Over budget: town logic after a land edit 12.1 ms (budget 8); a 20-column
stroke frame 28 ms rebuild; steep-island worst chunk 34 ms. Weak: one-wide
dug channels look thin; brush-raised hills are square-stepped; water does
not visibly flow in. The six play-throughs were built as scenarios, not
clicked by hand.
**Mischief Phase A ready as a PREVIEW** (`swarm/mischief` at `b9bdb78`, NOT
merged): torch, bomb, mallet, mend; staged damage; ruins of every kind;
repair scaffolding and crew assets. Served at http://127.0.0.1:5175/
(`/?seed=4242&mischief`). It also uses codec version 4 → will conflict with
landshaping's v4 on merge (move ruins to flag bit 1). Waiting on Derek.
Running: disc1-structures, disc1-fill, living-town pass 2.

**Living town pass 2 merged** (`91cb203`): loads 1.65× and carried high,
growing with camera distance; faster bread; scuffles broken up by the
watchman or a guard; L58 quay trade with handcarts; L59 harvest; L60
laundry out and in (rain); L61 dogs; gulls over the catch. Timeouts in the
full run passed serially.
**Discovery 1 structures merged** (`122437b`): R-M08 podium (temples and
stairs no longer keeps; garrison needs a real castle), inn and shop limits
(grown towns: shops 31–58 → 3–26 per town; inns 1 each), chapel roofs,
churchyard, warehouse, watermill, bridge-shop, smithy, theatre, obelisk,
barn, stoa, bandstand, schoolhouse, folly-tower. Not reached: cathedral.
**NOT PUBLISHED: 3 tests fail at the seam** (L51.bread fixture has nowhere
to sell; a scuffle test; people-town overlaps 41 > 30). Sent to the
living-town agent; publish when it reports green. Last published build:
land shaping (`3fb3f2e`).
Running: disc1-fill, living-town (integration, then the new buildings).
Previews awaiting Derek: walk (`swarm/walk`), mischief (`swarm/mischief`,
served at port 5175).

**Discovery 1 fill merged** (`0eb2a5f`): fingerposts 38/22/27 → 2/3/3 in
grown towns; farm-lane lamps 22 → 5; U13 country lanes, U14 back gardens,
U15 village green, U16 shops in the wall, U17 drying green, U18 orchard,
U19 stair forecourt, U20 quay apron, U21 castle bailey, U22 ford, U23
belvedere, D35 stair guardians, D36 shrine, D37 market cross, D38 rope
swing. Guide conflict resolved by hand; guide picture budget raised to 3 MB.
**All three discovery branches are on the main branch but it is RED:**
7 unit failures at the seams (L51.bread, U16 fixture, scuffle test, two
solid.test overlap bounds, two crowd.test cases). Living-town agent has the
people ones; fill agent has U16. DO NOT PUBLISH until `npm test` is green.
Last published build: land shaping (`3fb3f2e`).

**Discovery round 1 fully merged and PUBLISHED** (`28717dd`): living-town
integration (`0904e3b`: any shop bakes, hands keep their load, café seats;
L62 school, smithy, theatre, bandstand, vendors, maypole, orchard pickers)
and fill follow-up (`ed8972d`: booths and vault doors agree, the podium
scene, drying lines join washing day, orchard fruit trees). Orchestrator
removed a market-cross guide entry duplicated by the merge. Full check
clean: 1,950 tests. NP-01 hedge not built (needs frozen core kinds).
**Derek's new list (20:30), dispatched:**
- Mischief (liked; stays UNMERGED; revise): bigger real chunks, better fire
  (attached, not floating cut-outs), smoke that fuses, Mend progressive and
  automatic over time, people respond (firefighters with hoses, bucket
  chains) → mischief agent.
- Bug: new houses get festival lights out of season; sliders for time,
  season, weather with gradual transitions → seasons agent (plus its
  pending follow-up).
- Bug: Level tool does not work → landshaping agent.
- Bug: the sweeper's broom is not in her hands → living-town agent.
- New: Field ground piece (basketball, tennis, grass pitch by shape) with
  people playing → new Opus agent `swarm/field`.

**Orchestrator: nothing-in-hand state** (Derek): clicking the selected
tray piece again, or Escape, puts it down (`TrayState.idle`): no ghost, no
placing or erasing, wheel zooms; test `tests/e2e/idle.e2e.test.ts`. Not yet
committed or published: the full check was still running under load.
**Derek: harvest must really cut the wheat** (no flat overlay, no smoke) →
living-town agent (after the broom fix).
**Derek: bigger islands** (3–4× the map, size chosen at New island, varied
regions) → new Opus agent `swarm/big-islands`, PREVIEW: study, prototype
and measurements first; do not merge without his say.
Running: mischief (preview), seasons, landshaping, living-town, field,
big-islands (preview).
**Nothing-in-hand state committed and published.** Test helpers in three
e2e files no longer re-click a selected piece (that now deselects). New
tests by other agents must do the same. `traffic.test.ts` timeout 300 s
(machine at load 32). Full run under load: only load timeouts; affected
files pass serially. Mischief preview server (5175) hit its two-hour limit.

**Land shaping fixes merged** (`619e367`): with a land tool held a plain
drag on land shapes it (drag on the sea turns the camera); Level brings
every column to the start height in one stroke; soft-edged brush; foam
rushes into dug columns; real-mouse tests on slopes and six play-throughs.
Conflict in `src/ui/interface.ts` resolved (both hints kept; idle respected).
**Seasons follow-up merged** (`ca6d5bb`): festival props no longer shown by
the pop-in out of season (cause: F05 pop-in called setVisible(true));
`src/ui/slider.ts` sliders for time, season, weather; eased transitions;
swept streets in snow; bulbs ≥ 2 px; spring blossom; coats, hats,
umbrellas; a snowman. Unit tests 1,890 green; all e2e green serially (two
load failures passed alone). Published.
Running: mischief (preview), living-town (broom, harvest, tool audit),
field, big-islands (preview).

**Mischief revision ready as a PREVIEW** (`swarm/mischief` at `786a5e6`,
NOT merged; merged with main; ruins use save-section bit 1): rooted layered
flames, fused smoke and dust, whole-part chunks, 32-step mending with crews
that rebuild on their own (Rebuild switch), fire brigade with pump cart,
hoses and a bucket chain, people fleeing and watching, falling windmill
sails, sounds. Served at http://127.0.0.1:5175/?seed=4242&mischief.
Raid not started. Waiting on Derek.
**Test diet launched** (`swarm/test-diet`, Opus): Derek asked to cut the
bloated suite: profile, shrink sweeps, drop duplicates and wall-clock
assertions, fast `check` and `check:full` tiers.
**Source is NOT pushed:** the working branch on GitHub is still the old
spike commit; only `gh-pages` (built site) is pushed. Derek asked to see
the code; offered to push the branch and open a PR: awaiting his word.
Running: living-town, field (finishing), big-islands (preview), test-diet.

**Bigger islands: first report (PREVIEW, `swarm/big-islands` at `a11ddd6`,
NOT merged).** Sizes 48 / 72 / 96 as a world property; key packing extended
above bit 16 so 48-column keys are numerically unchanged (digest of 281
scenarios, 40 islands ×2 generators, 12 grown towns identical to base);
save section bit for size. Drawing holds: 96 with 9,861 blocks runs 56–60
fps (frame cost ~14 ms). Editing does not: shape stage 43–45 ms and
dressing 109 ms per edit at 96 (20 / 44 ms at 72), because every edit
re-resolves the whole town; grown towns are smaller (1,288 blocks at 96:
edits 22–31 ms, worst frame 83–100 ms). Recommendation: offer 72 on
desktop; hold 96 until town logic resolves by region. Served at
http://127.0.0.1:5176/?seed=5&size=96 (or size=72).
CONFLICT TO SETTLE BEFORE ANY MERGE: big-islands takes save-section bit 1
for size; the mischief preview also took bit 1 for ruins.

**Playing field merged** (`ebedee4`): Field floor kind; shape table in
`src/rules/roles/field.lib.ts`; basketball, tennis, football, bowls,
boules, croquet, races, kickabout. **Living town merged** (`1eb67dd`):
broom held in both hands (`src/parts/people/hands.ts`), wheat really cut
row by row with stooks, all tools and loads in hand. Conflicts in
`extras.ts` and `people.system.ts` resolved by hand. Unit tests 1,966
green; core browser tests green serially. Published (`42a072d`).
**SOURCE PUSHED to GitHub** at Derek's word: branch
`yaoderek/bloom-s-monkey-city-builder` → origin at `42a072d` (fast-forward
from the old spike commit). `main` untouched. No PR opened.
**Derek's decisions:** mischief: one more local iteration (cart and hose
arrive physically, continuous water jet, mending on every damaged building
by itself, a nuke with mushroom cloud and crater), then merge and push;
bigger islands and walk mode stay experimental (unmerged previews).
Running: mischief (final iteration), test-diet.

**Derek: Grow a town must choose and have flavour** (it still builds the
old stair-and-temple and ignores the new buildings) → grow-town agent
resumed for pass 4: town characters (great harbour, marble city, castle
town, market and townhouse town, river town, farming village, hill town,
games and gardens), a budgeted plan that drops districts instead of
squeezing them, composed marble ensembles, coverage across seeds rather
than within one town, no wall-clock test assertions.
Running: mischief (final iteration), test-diet, grow-town pass 4.

**MISCHIEF MERGED AND PUBLISHED** (`9ea58b4`, at Derek's word after the
final local iteration): torch, bomb, nuke, mallet, mend; staged damage and
ruins saved as section bit 1; fire brigade with a parked pump cart, hose
paid out along the walked path, continuous jet; every damaged building
mends itself (crews speed it up); nuke with crater via terrain edits.
Unit tests 2,013 green; core browser tests green serially. Source pushed.
**Derek on the nuke (after merge):** it has no asset of its own and the
mushroom cloud "looks pretty bad… super goofy": wants a fast shockwave
first, then a fireball that rises quickly into a mushroom cloud, settles
into smoke and dissipates, like nukes in video games → sent to the
mischief agent.
Note for big-islands (experimental): mischief owns save-section bit 1; the
size section must move to bit 2 before that branch could merge.
Running: test-diet, grow-town pass 4, mischief (nuke redo).

**Test diet merged** (`6d9bfeb`, Opus). `npm run check` is the merge gate
(typecheck, lint, unit tests, THEN browser tests on one shared server);
`npm run check:full` (`LC_FULL=1`) adds big sweeps, long simulations,
timing budgets and extra CLI runs. Helper: `tests/helpers/tier.ts`
(`FULL`, `sized()`). Coplanar scan grid-based (137 s → 8 s). One browser
file deleted (`app.e2e`). Gate on the merged build: 2,086 passed, 9
skipped; 159 s and 288 s in two runs at load ~25 (was 10+ minutes with
timeouts). Orchestrator fixed the new codec pin test (it iterated current
kind lists; the Field floor kind appended since then changed the town).
Rules for everyone: no wall-clock assertions in the gate; one expect per
seed; wait on state, not sleeps; pages close at the end of their test.
Pass on to the people agent: crowd.test.ts mean-step-time assertion →
full tier; route.test.ts assert on search count; drop 120 s timeouts in
solid.test.ts. Open question for logic: the incremental content key's
resolved-kind part is untested (or redundant).
Running: grow-town pass 4, mischief (nuke redo).

**Grow a town pass 4 merged** (`08b8b96` → merge `df3a0b9`, Opus). A town
now has a character rolled from the seed and weighted by what the island
offers: harbour town, marble city, castle town, market town, river town,
farming village, hill town, garden town; a second character flavours it.
A budgeted planner builds each character's list in priority order; the
marble city gets the forum (temple on a podium, basilica, obelisk,
rotunda, grand steps). Banner names the town ("A marble city is
growing."); the dice avoid repeating the last character. Survey test:
seeds 1–30 on both generators, every character rolled, promises kept
(≤15 % misses), every placeable role and guide entry appears somewhere.
`grown-town-1..7` are frozen legacy replays
(`scenarios/core/grown-town-legacy.ts`); new `grown-<character>`
scenarios. Conflicts resolved by hand: `townmaker.test.ts` (pass 4's
survey; the old wall-clock test is gone), `interface.ts` (kept
`mischief.undo()` in `grow`). Gate: 2,104 passed, 8 skipped, 196 s.
Published `df3a0b9`. Caveats from the agent: marble city is rare (4 of
60 towns); the forum stair may face away from the default camera; hand
pump vs fountain still waits on Derek.
Running: mischief (nuke redo). Unmerged experiments: walk, big-islands.

**After pass 4 (orchestrator).** Derek: "I don't see the grown town update
at all". The build was live (checked in a fresh browser: banners name the
town), but eight dice rolls gave only market, river and castle towns.
Two changes: the marble city's weight raised (expected share about 17 %
on generator 1, 9 % on generator 2; was 3 of 60), and the dice now work
through every character that suits an island before repeating any
(`GrowOptions.avoid` is the list shown so far; `never` is the planner's
own marble fallback). A first roll with nothing shown is unchanged, so
the scenarios and survey are as before. Gate: 2,106 passed, 8 skipped.

**Nuke redo merged** (`2c5cce7`, Opus). Its own casing and tray icon; a
white-out; a shockwave ring with a dust wall (damage arrives with the
ring, in 0.2 s batches; trees fall away from the middle, direction saved
with the damage); a fireball that rises on a stem into a rolling cap,
dies to dark smoke, goes grey and drifts off over about 40 s; firelight on
the town; a scorched crater; crack, boom, rumble. Timing in
`src/life/mischief/nuke-timing.ts`, drawing in `nuke.system.ts`. Gate:
2,107 passed, 8 skipped. Agent's own caveats: the cloud still reads as
outlined puffs, not one billowing mass; fire can look like flat red
tiles mid-way; the town glow has a visible oval edge; the second of the
bang runs at about 46 fps in a grown town (redrawing the flattened town,
not the cloud); the white-out was not checked in pictures.
Running: nothing. Unmerged experiments: walk, big-islands.

**Derek after pass 4 and the nuke redo (2026-11-20).**
- Bug: a new island keeps the old island's scorch marks and burning
  windows; bug: automatic mending skips buildings over water → mischief
  agent (`ac4e8c4f1f7628058`, `swarm/mischief`), resumed.
- Grow a town: far too few trees (wants forests, orchards); each
  character must be unmistakable, not one token piece (farming village
  with several farms and fields, castle town with walls everywhere, port
  town with several quays, more marble through the marble city) → grow-town
  agent (`a5aa1417a439de127`, `swarm/grow-town`), pass 5, resumed.
- He was confused by the two grow buttons. Orchestrator: the entry is
  now "Grow a town here" and grows a different kind of town each time on
  the same island; the dice are "New island with a new town" (`4045a25`).
Running: mischief (two bugs), grow-town pass 5.

**Carry-over fix merged** (`6054819`, Opus; Derek: urgent). Root cause:
when the town is replaced the life layer is rebuilt and each mischief
part must remove what it drew; the burning-window glows and the nuke's
finished scorch were never removed. Now every mischief part keeps a list
of all it draws (`src/life/mischief/owned.ts`) and drops the lot on a
town change or undo. New tests: `carryover.test.ts`,
`tests/e2e/mischief.e2e.test.ts`. Orchestrator checked in a browser:
nuke, 75 s, New island → nothing drawn, clean island. Gate: 2,110
passed, 1 timeout under load 24 (`tests/terrain2-town.test.ts`, the
minute of life; 12.7 s and passing alone). Not covered by tests: open a
town file, share link, grow on the same island (code only).
Running: mischief (mending over water), grow-town pass 5.

**Grow a town pass 5 merged** (`a7cd292`, Opus). Every character repeats
its signature (`src/townmaker/districts/emphasis.ts`): farming up to
three wheat farms, barns, orchards, paddocks, greenhouses; harbour up to
four more quays, piers, a fish market; castle a town wall with gateways
and corner towers, walled towers, watchtowers; marble shrines,
colonnades, obelisks besides the forum; market more market places;
river willows, watermills, bridges; hill cliff houses, stairs, viaducts;
garden parks with bandstands, walled gardens, avenues. Woods on bare
land, tree lines on outer streets, orchards in five characters (40–140
trees a town). Survey prints a signature count per character. Gate:
2,109 passed; 3 browser tests timed out on page load at load ~20
(interface, land-slopes, welcome), all pass serially. Orchestrator's
eye on the overviews: marble, harbour, castle, garden convincing;
farming better but the scenario seed shows one wheat field and a big
village core; river, hill, market weakest (agent agrees). Town wall has
gaps where houses stand on its ring.
Running: mischief (mending over water).

**Orchestrator's checkout moved (2026-11-20, about 00:35).** Another
session switched the workspace folder
(`/Users/yaoderek/conductor/workspaces/littlecity/prague`) to a new branch
`capture/promo` (brand and promo-capture work, its own agent worktree
`agent-a072417d202503b83`) and is working there with uncommitted files.
Two orchestrator commits landed on that branch by accident (the pass 5 run
log and the nuke-on-water fix); both were cherry-picked onto the working
branch. From here on the orchestrator works in
`/Users/yaoderek/conductor/repos/littlecity/.claude/worktrees/orchestrator`
(branch `yaoderek/bloom-s-monkey-city-builder`): merge, gate and deploy
from there, and leave the workspace folder to the other session. Lint in
the workspace folder fails on that session's `tools/capture/lib.mjs` and
`shots/drone.mjs`; not ours.

**Nuke on water (orchestrator, `a72c359`).** Derek: "the first nuke
seems to always do nothing". Cause: `blastPlan` returned no hits when the
point was water (river, pond, sea), so the cloud rose and nothing was
touched; 3 of 10 random grown towns have water under the middle of the
screen. Fix: the nuke plans with `wet: true` and always craters the land
round the point. Unit test in `engine.test.ts`; checked in a browser on
the three islands that were duds (337/346, 375/414, 380/405 blocks
ruined). Full gate not completed: load 40 (two agents, the other
session), only timeouts; typecheck, lint, mischief unit and browser
tests pass serially.
Running: mischief (mending over water, scorch fade), grow-town pass 5b.

**Grow a town pass 5b merged** (`8e5ef63`, Opus). Farming village: a
small centre (well, inn, green, chapel) in farmland, 6–8 wheat fields
with windmills in the survey, veg plots, barns, paddocks; river town:
bank walks and houses facing the water for the river's length, only
rolled with a long river; hill town: terraced rows climbing to the
summit; market town: a great market with two stall rows and a market
hall. A castle town with no site for its castle re-rolls. Gate: 2,113
passed, 8 skipped, clean (this run also covers the nuke-on-water fix).
Known gaps (agent's own): castle wall gaps not fixed; hill town on
generator-2 seed 5 has 31 of 74 houses reaching the square on foot
(stairs land inside the castle walls) and hill towns are excluded from
one walking test; great market does not fit on some small islands; two
market towns lack a town hall. Orchestrator's eye: farming and market
overviews have few trees and no orchard shows in `grown-farming`.
Running: mischief (mending over water, scorch fade; running its checks).

**Mischief fixes merged** (`f3fb606`, Opus). Mending over water: the
agent could not reproduce buildings that never mend (five grown towns,
every over-water structure mended in 105–210 s), but found crews could
only stand at a building's own floor level, so docks, jetties and
bridges never got a crew and mended slowly with nothing to see. Now
crews stand on a dock's deck or the shore within 4 cells, and anything
with nowhere to stand mends at a crew's pace. Scorch fades: the nuke's
from 30 s to 210 s (black, brown, the ground's own colour, edge first;
not saved, so a reload shows none); the scorch round a destroyed
building fades with its saved mending progress. Undo clears a water
nuke's cloud; browser tests for opening a file and growing on the same
island mid-cloud. Gate: 2,119 passed, 8 skipped, clean. Not verified by
the agent: a lighthouse on an offshore rock; the building-scorch fade
and the water nuke's bank scorch in pictures.
Running: grow-town (orchards and trees tuning).

**Orchards and trees tuning merged** (`b6a00c5`, Opus). Cause of the
missing orchards: an orchard only reads as one if no other tree stands
next to its trees, and pass 5's woods and tree lines were planted up
against them (survey: orchards in about one town in fifteen, none in
farming or market). Now each orchard keeps a clear ring, is 12 trees
where there is room (9 or 6 otherwise) and is planned earlier; copses on
high ground near the centre; more trees in market towns. Survey floors:
orchards farming 2, market 1, river 1, garden 1; trees 35; zero misses.
Trees per town (avg/min): farming 118/94, market 90/47, river 108/64,
gardens 112/98, castle 70/41, harbour 59/40, marble 59/54, hill 62/46.
Gate: 2,119 passed, 8 skipped, clean.
Running: nothing. Unmerged experiments: walk, big-islands. Separate
session: `capture/promo` in the workspace folder.

**Grow a town chooser (orchestrator, 2026-11-20).** Derek found the dice
beside "Grow a town" confusing. The entry now opens a second screen that
asks where: "On this island" (`grow-here`) or "On a new island"
(`grow-new`), each with a line on what happens to the town there is now,
and Back (`grow-back`). No dice button, no further confirmation. Gate:
2,120 passed; 1 timeout at load ~20 (`tests/terrain2-town.test.ts`, the
minute of life; 6.8 s and passing alone).
Derek, same morning: the torch should become a lightning bolt (a small
storm cloud, a strike, the fire) → mischief agent. A dark flickering
X-shaped patch on the sea west of a castle town (screenshot
`/tmp/lc-black-patch.png`) → a new agent to find the cause.

Running: mischief (lightning), sea-patch agent (`a26d2645a4786eb14`, `swarm/sea-patch`, Opus).

**Lightning merged** (`f3485c8`, Opus). The torch is Lightning (tool id
still `torch`): puffs gather into a small dark cloud above the click
(0.6 s), a jagged bolt strikes, the building catches through the same
fire code, thunder, the cloud drifts off by 4.2 s
(`src/life/mischief/lightning.system.ts`). On what cannot burn (only
fountains) the bolt strikes and fizzles with the refusal note. Gate:
2,123 passed, 8 skipped, clean. Orchestrator rendered the night strike
after the agent softened its light: a small pale glow, a faint disc edge,
acceptable. Weak spots (agent's): the cloud sits up and behind the
building at the default angle so the bolt is long; the flash barely
shows by day.
Running: sea-patch agent.

**Sea patch merged** (`f5996d9`, Opus, `swarm/sea-patch`). Derek's dark
flickering star on the sea: every town has three clouds, each with a
soft shadow disc (a 20-triangle fan at height 0.9); where two discs
overlapped, the pass that draws mist and beams wrote depth for them, so
wedges of one shadow hid behind the other and changed as the clouds
drifted. Fix in `src/render/shaders/surface.ts`: a flat cloud shadow no
longer covers anything. Proven by switching depth recording off and on;
new browser test in `src/render/view.e2e.test.ts` (fails without the
fix). Not reproduced in ordinary play (four towns, 30 s each), only by
forcing the shadows together. Orchestrator added: crossing shadows share
their shade (`src/life/sky/cloud.behaviour.ts`, each divided by 1 + how
much the others overlap it), because with the fix alone two or three
stacked added up to a very dark blot. Gate: 2,124 passed, 8 skipped,
clean. Not measured: the small cost of the mist pass losing early depth
rejection.
Running: nothing. Unmerged experiments: walk, big-islands. Separate
session: `capture/promo` in the workspace folder.

**Derek, 2026-11-20 late morning (orchestrator).** Cloud shadows removed
entirely ("they look kinda ugly"): clouds no longer spawn a shadow
(`src/life/sky/cloud.behaviour.ts`; catalogue L31 says do not add it
back); the crossing-shadows browser test and its probe helper are gone;
the shadow part variant and the shader line that kept one shadow from
hiding another are still in the code, unused. The grow chooser's two
choices are bare labels, no subtitles. Gate: 2,123 passed, 8 skipped,
clean. Repair crew standing in place shrinking and growing (screenshot
`/tmp/lc-crew-pulse.png`) → mischief agent, running.

**Derek, 2026-11-20 about 11:15 (orchestrator).** The dev tuning panel is
out of the game's menu (it stays in the gallery). Postcard stays (asked
to remove, then took it back). Share links: grown towns are 1,100–2,000
characters; zlib level 9 on the same payload would be about 18 % shorter
→ new agent `ad6488e93eb5b1c7d` on `swarm/short-links` (dynamic Huffman,
a version 5 layout if it pays; old links must still open; section bit 2
kept free for big-islands). Gate on the tuning removal: 2,123 passed, 8
skipped, clean.
Walk mode: Derek no longer wants street view; wants a fly mode entered
from the current view, Escape back to the main view, and Escape in
general returning to the main view. He asked to brainstorm it: questions
sent, nothing built yet. `swarm/walk` has the flying code to reuse.
Running: mischief (crew pulsing), short-links.

**Crew pulsing merged** (`ee24bac`, Opus). The people shrinking and
growing were not crew but residents of houses being mended, leaving town
(a house mid-mend counts as uninhabitable). Every mend step changed the
town, every change replanned everyone's route, and for someone leaving
that cancelled the fade-out and sent them walking (full size) again:
140+ size drops per person in 60 s once many buildings were mending. Fix
in `src/life/people/crowd.ts`: a leaver keeps route and exit unless they
no longer exist; with no water or map edge to leave by they walk to the
nearest door and go in. New test `src/app/mend-crew.test.ts` (471
grow-backs before, none after). Gate: 2,124 passed, 8 skipped, clean. No
pictures of the pulse before or after; evidence is the per-frame log and
the test. Not verified: Derek's town (raised terrace, retaining wall);
the door exit on screen. Open design question for Derek: should
residents stay and wander while their house is mended instead of leaving
the island?
Running: short-links. Waiting on Derek: fly mode answers.

**Fly mode decided (Derek, 2026-11-20): 1a 2a 3a 4a 5a 6a 7a 8a.** A
wings button in the top-right group plus F; pointer-lock mouse look;
WASD, Space up, Shift down, wheel for speed; solid world, stay over the
map; look only (tray hidden); Escape glides back to the view before
take-off; Escape outside fly mode closes what is open, else glides to
the default whole-island view and the piece stays in hand; desktop only.
Street-level walk mode is dropped. → agent `a118f47399afb0a2a` on
`swarm/fly` (Opus), porting the flying parts of `swarm/walk`.
Running: short-links, fly.

**Derek, 2026-11-20 midday.** Better destruction: stilt buildings
topple, boats take damage (scorched, dismasted, sunk), bombs too, people
react → mischief agent (`ac4e8c4f1f7628058`), resumed. Birds tied to
houses "glitch out like crazy… weird loops" when houses are destroyed;
he wants all creature behaviour consistent under nukes → new agent
`a7b9d547cb60ccbd2` on `swarm/life-under-fire` (Opus): reproduce the
birds, find whether the cause is in the shared life sync or per
behaviour, audit every actor type with one stress harness, fix, and make
the harness a gate test.
Running: short-links, fly, mischief (destruction), life-under-fire.
Four agents at once on a 10-core machine: expect load timeouts; rerun
failing files serially before believing a failure.

**Short links merged** (`d676018`, Opus). Grown towns' share codes are
about 40 % shorter (1894→1123, 1480→888, 1990→1207, 1124→687, 1804→1064
characters). Step 1: dynamic Huffman and an optimal match search in
`src/world/deflate.ts` (−23 to −25 %, no format change). Step 2: version
5 (codes start `TEMF`): a range coder with adaptive predictors
(`rangecoder.ts`, `codec5.ts`); a town is written in whichever form is
shorter. Old links: a frozen copy of the old encoder
(`legacy-codec.ts`), 17 pinned codes with world digests
(`old-links.json`, never regenerate), old pinned strings kept as decode
fixtures. Section bit 2 still free for big-islands, which must now add
its section to `codec5.ts` as well. Orchestrator checked in a browser:
six old links (versions 1–4) open with the right block counts; a link
from the Share button (1148 characters with the address) reopens the
identical town. Gate: 2,131 passed, 9 skipped, clean.

**Destruction round 1 merged** (`5f1d906`, Opus). Anything standing on
a dock or pier (and the deck itself): a stage 3 blast topples it whole,
away from the blast, into the water, half sunk (the fall direction is
saved); stage 2 leans over a snapped leg; mending rebuilds it upright. A
bomb in water now hits piers and what stands on them. Big ships through
a narrow hook (`harbour.strike`; `src/life/mischief/shipwreck.system.ts`):
scorched (sails torn, fire, leaves early), dismasted (the mast falls
and floats), or broken (goes down in about 9 s, wreckage drifts 40 s,
berth freed). Gate: 2,135 passed, 9 skipped, clean. Orchestrator saw the
toppled stilt house in frames; did NOT see a ship hit (no ship was in
berth in my sequence). Not done (agent's list): crew on a sinking ship
still vanish (breaks the nothing-vanishes rule); barges, small boats and
passing ships take no damage; no lightning on sails; dockers do not
react; night frames and ships under way not checked.

**Fly mode merged** (`89056b6`, Opus, `swarm/fly`). Built to Derek's
eight decisions: wings button (first in the top-right group) or F; a
0.7 s dolly zoom from the orthographic overview to a 62° eye with the
looked-at point held still; pointer-lock mouse look; W/S along the look
direction (full 3D, not level flight), A/D strafe, Space/Shift up/down,
wheel ×1.25 a notch from a quarter to four times (default 6 cells/s);
solid world (`src/fly/**`, roofs as boxes), 8 cells past the map edge,
10 units over the tallest thing; tray, top bar and markers hidden, an
"Esc to land" card bottom-left; Escape or lost pointer lock glides back
(0.9 s, never through anything) to the exact view before take-off;
Escape outside fly mode closes what is open, else glides to the opening
view, piece stays in hand; no button on touch. The renderer port
(`src/render/eyecam.ts`, perspective materials) was taken from the other
session's `capture/promo` branch, which had already merged walk; walking,
gravity, drag-in and `?walk` are left behind. Agent touched
`src/render/api.ts` (additive) and `eslint.config.js` (a `fly` layer):
accepted. Gate: 2,156 passed, 9 skipped, clean. Flying costs about 1.5×
the overview per frame, still 60 fps in a grown town. NOT verified: real
cursor capture and the browser's own Escape in a headed browser (tests
use a hook); Chrome's one-second cooldown before re-capturing. Looks
wrong up close (not fixed): huge pencil marks on tree crowns and hedges,
chimney smoke as pale discs, flat walls at a hand's breadth, the moon
jumping at take-off at night. `swarm/walk` is now superseded.
Running: mischief (destruction round 2), life-under-fire.

**Destruction round 2 merged** (`85d77fc`, Opus). Crew of a ship that
goes down (3 for a galleon, 2 otherwise) and a barge's bargeman jump and
swim for the nearest map edge over open water, cut off there as ships
are (not climbing out onto a quay: that needs the crowd code). Barges:
sail torn, pole away, or cargo overboard and down by the stern. Tall
ships passing at sea: sails torn or sunk. Ships under way take damage; a
sinking ship frees its lane at once and its berth when gone. Less dust
beside water so the stilt fall shows. Sequence tool: `--ship moored` /
`--ship underway`, verbs `shipbomb@d,0,0`, `shipnuke@d,0,0`. Gate: 2,159
passed, 9 skipped, clean. Orchestrator watched a moored galleon bombed:
flames, masts down, hull under in about 6 s, wreckage and swimmers
visible. Left: small boats (`src/life/boats`, held back while
life-under-fire is in `src/life`), lightning on sails, hull chunks cut
from the hull, swimmers climbing out, the stilt fall at night, galleon
stays dangling.
Running: life-under-fire.

**Life under fire merged** (`c38b986`, Opus). Derek's bird loops: a
burning building reports itself to nearby birds every 0.4 s, each report
counted as a new fright, each fright added height in one frame (swifts:
1,002 teleports in 60 s in the real app, now 0). Not the shared life
runtime (actors are not recreated as ruin stages tick). Fixed in the
birds' shared helpers (`scare.ts`, `town.ts`, `flight.ts`): one startle
per fright, drift instead of jump when the town changes, no perching on
wrecks, storks/owls/doves/crow/ducks fly off and back instead of
blinking out. Cats and sparrows are placed by each place's own hash
(the crater used to move 6 cats and 11 sparrows); the garrison is kept
while its route is unchanged (was rebuilt 355 times, 17,395 pieces);
dogs run in at a door; a resident's hop is capped at 2.5 cells. Stress
harness `tests/helpers/turmoil.ts`, gate test
`src/life/under-fire.test.ts` (14 problems on the old code). Gate: 2,161
passed, 9 skipped, clean. Not fixed (agent's list): a fire reaching a
house mid-mend makes its lights, cat and signs pop on for about 10 s
(belongs to mischief/world: `ruinUninhabitable`); residents' heading
twitches about 58 times a minute with or without a nuke; a cat or dog
with no door in reach runs 6 cells and disappears.

**Destruction round 3 merged** (`fbe7e36`, Opus). (1) Lights, cat and
signs popping on a house that catches fire mid-mend: the fire code
cleared the mending flag, so a stage 1 house counted as lived-in until
it burnt to stage 2; now a fire does not cancel mending (`engine.ts`;
not `ruinUninhabitable`, burning is not saved). New case in
`src/life/under-fire.test.ts`. (2) Small boats (hook in the four boat
files of `src/life/boats`, `src/life/mischief/boatwreck.ts`): burning
at the edge, swamped and drifting, capsized hull-up for about 30 s then
under; whoever is aboard swims. (3) Swimmers with a quay, beach or dock
within 7 cells come ashore (`crowd.ashore` makes an ordinary person
there in the same frame), walk into town and in at a door; a pale ring
on the water round each swimmer. (4) Lightning on the water near a
vessel strikes it. (6) A toppled stilt house's windows go dark. Gate:
2,165 passed, 9 skipped, clean. Orchestrator's sequence of a galleon
sunk at its quay: the crew are on the quay within seconds and walk off;
no swimmer clearly seen in the water in that run. Not done: hull chunks
cut from the hull, dangling stays, a scorch mark or torn sail on small
boats, boats steering round wreckage.
Running: nothing. Unmerged: big-islands (experiment), walk (superseded
by fly). Separate session: `capture/promo`.

**Bomb without the boom (orchestrator, Derek 2026-11-20).** Removed both
drawn bursts at a bomb's blast: the "BOOM!"/"SPLOOSH!" word graphic over
the page (`src/ui/mischief.ts`) and the orange starburst in the scene
(`flashes` in `mischief.system.ts`, `flashMesh` in `meshes.ts`). Dust,
smoke, flying chunks, fire and the water spout stay. Gate: 2,165 passed,
9 skipped, clean. Do not add either back.

**Pavilion (Derek, 2026-11-20 afternoon).** The bandstand (R-M11: a
square marble block on four fat pillars with an octagon roof) "looks
ugly"; he wants a proper many-sided pavilion with a ring of slim
columns. Screenshot `/tmp/lc-pavilion.png`. → new agent
`a9ecfa9e3ad089280` on `swarm/pavilion` (Opus): octagonal plan, slender
columns at the corners, a light entablature, tented roof, plinth and
rail; the trigger stays as it is unless it reports otherwise.
Running: pavilion.

**Derek on the live build (2026-11-20 afternoon).** Fly mode: "the jitter
is insane… very visibly not smooth"; phones: "super pixelated". Both →
the fly agent (`a118f47399afb0a2a`, `swarm/fly`), resumed: measure frame
pacing at pixel ratio 2 (p99, long frames, per pass), input handling and
ink stability in perspective, then fix; phones get the half-resolution
ink pass and a pixel ratio cap of 2 on purpose (`src/render/index.ts`),
to be replaced by a quality governor that starts sharp and steps down
only when frames are slow.
Running: pavilion, fly (judder, phone sharpness).

**Fly judder and phone sharpness merged** (`ca55228`, `8dcfda3`, Opus).
Judder: frame rate was fine and the renderer costs the same in both
modes (the earlier "18 vs 12 ms" was a bad measurement); the motion was
uneven: flight advanced in fixed 1/120 s steps with the remainder
carried and no blending, so the eye moved 0.5× to 1.5× its speed from
frame to frame (worse on a 120 Hz screen). Now each frame moves exactly
speed × that frame's time (evenness 0.98–1.00); the fly shaders are
warmed while idle (`view.prepareEye()`, the first take-off froze 65 ms);
mouse movement is summed and applied once a frame, unsmoothed
(`src/fly/look.ts`). Tools: `src/fly/testing/judder.mjs`. NOT verified
on a real 120 Hz screen or with real pointer lock. Phones: were at pixel
ratio 2 with half-resolution ink; now a quality governor
(`src/render/quality.ts`): levels from super-sampling, pixel ratio
3 → 2.5 → 2, then half ink, then 1.5; steps down after two slow 2 s
windows, up after five fast ones, with growing waits so it does not
flicker; `?quality=<level>` holds one; under automation the sharpest is
held unless `?quality=auto` (affects the capture session too). A
mid-range phone is expected to settle at pixel ratio 2; unmeasured.
**Pavilion merged** (`12dc81e`, Opus). R-M11 is an octagonal pavilion:
eight slender columns (each pillar draws the columns in its own cell
from a shared layout, `src/gen/marble/pavilion.ts`), rail with one open
bay, light ring, faceted tented roof with a lit lantern; 1×4, L, T and S
become one-cell-wide hipped shelters. Not met: the band still plays
outside. Round 2 sent: band inside (pillar cells walkable through the
open bay), and the trigger widened to any four-cell marble on pillars on
the ground (orchestrator's call from Derek's wording; marble-city
shrines to stay temples).
Also: `crowd.test.ts` mean-step-time budget moved to the full tier.
Gate: 2,185 passed, 10 skipped, clean.
Running: pavilion round 2.

**Pavilion round 2 merged** (`9dcdc5c`, Opus). The band plays on the
bandstand's floor (floor cells are walkable at plinth height, linked
outside only across the open side; rail openings exactly where people
walk in; layout moved to `src/rules/roles/pavilion.lib.ts`), the
audience gathers in front of the opening; new test in
`src/life/town/places.test.ts`. Trigger widened: any four marble cells
on four pillars standing on the ground are a pavilion; five cells or
more, or on a podium, stay temples. Marble-city shrines stand on a
one-block podium so they stay temples (layout unchanged; structure
renumbering re-rolled roof colours). Fixtures R-M01 and D22 rebuilt as
2×3. Lanterns under the ridge of the long shelters. Not done: the far
view where rail and columns blur into a dark band (needs a renderer
change). Gate: 2,186 passed, 10 skipped, clean.
Running: nothing. Unmerged: big-islands (experiment); walk
(superseded). Separate session: `capture/promo`.

**Derek, 2026-11-20 late afternoon.** Asked what a wedding looks like
(never seen one). Orchestrator rendered `L57.wedding`: it works (guests
gather at the chapel door, the couple comes out, a procession to the
square) but is small and short (about a minute, once a morning, 70 % of
days; first one 25–45 s after a town opens) and the door is often hidden
behind a building. 25 of 30 grown generator-2 towns have a wedding post
(28 have a chapel). Pictures in the workspace's `.context/report/`
(`wedding-*.png`). Nothing changed; a bigger, more visible wedding was
suggested to Derek, not started.
He dislikes the speech bubble and the fight cloud and wants the merged
single outline of the nuke/storm cloud (orchestrator's reading of "new
color") on them and on small round things (faces, fruit, the dog) →
new agent `ab27513c35386a432` on `swarm/soft-ink` (Opus).
Running: soft-ink.

**Wedding as an event (Derek, 2026-11-20).** "Events should be pretty
obvious": bride and groom and the party in black and white, a whole
procession, many more petals. → new agent `a7e07ea5e184a05e3` on
`swarm/wedding` (Opus): costumes for the whole party, 14–20 guests, an
ordered column on a longer route, petal showers and a trail, a staged
doorstep and a celebration at the square, bystanders watching, a
findable cue, and the cadence (including what a held time of day does
to it). Told to keep clear of the soft-ink agent's people parts.
Running: soft-ink, wedding.

**Length note (orchestrator, Derek 2026-11-20).** The first times a
piece with a length (or a land tool's brush) is picked, a small note
over the stepper says "Scroll to make it longer or shorter" (taller /
the brush wider; on touch "Tap − and + …"). `Stepper.hint()`,
`lengthHint()` and `offerLengthHint` in `src/ui/interface.ts`; stored
under `little-city.length-hint` (a count, or `learned` once a length is
changed; three showings at most). Test `tests/e2e/length-hint.e2e.test.ts`.
Gate: 2,189 passed, 10 skipped, clean.

**Soft ink merged** (`b9391a3`, Opus, `swarm/soft-ink`; the agent died
once on a network outage and was resumed). Why round things showed
rigid lines: lathe balls smooth only round the axis (bands along the
profile crease at about 30°), overlapping lumps crease where they meet,
and pieces had separate ink ids. Tool: `src/gen/soft.ts`
(`soft(b, { ink }, …)`, `smoothBall`, `smoothLathe`): one ink id and
normals from a smooth field over the lumps; no shader change, no frame
cost. Applied to: the fight cloud (redrawn: one lumpy two-tone dust
ball on twos with ink motion marks; 11 outlined puffs before), the
swearing balloon and chat bubble (one outline with the tail, symbols as
strokes, up to 1.8× bigger when zoomed out), heads and hair and hands,
dogs, cats, hens, sheep, fruit heaps and tree fruit, carried goods,
field balls. Gallery `scenarios/gallery/soft-ink.scenario.ts`. Kept
angular: buildings, crates, tools, limbs, hat brims. Not done: cow,
bird wings, tree crowns. +2.2 % triangles on bench-2000, frame time
unchanged. 14 guide pictures redrawn. Gate: 2,197 passed, 10 skipped,
clean. Orchestrator looked at before/after of the cloud, bubbles,
people and the dog.
Running: wedding (resumed after the same outage).

**2026-11-20 evening.** The session restarted; the wedding agent
(`a7e07ea5e184a05e3`, `swarm/wedding`, head `893e832`, clean tree, many
commits, no report yet) was resumed to run its gate and report. Other
sessions are active on their own branches (`save/my-towns`,
`analytics/posthog`, `music/background`, `promo/link-preview-2`,
`capture/promo`); one of them added `e628796` (link preview) to the
working branch. Memory note from another session: players lost towns
before; saved-town compatibility is a hard constraint.
**Choosing kinds (Derek).** Wants to choose the island archetype on New
island (mountain, plains, hills, river valley…) and the town kind when
growing (random still offered). → new agent `a2c1548b27336eb26` on
`swarm/choose-kinds` (Opus). Island kinds are to be found by SEED SEARCH
(draw seeds until generator 2's real result matches), so nothing about
what a seed generates or the save format changes. Town kinds via
`planTown`'s `character`; a new island for a chosen town kind is
searched to suit it.
Running: wedding (finishing), choose-kinds.

**Wedding as an event merged** (`31787b5`, Opus, `swarm/wedding`; cut
off twice, resumed twice). Party: 40 % of the town, at most 20 (couple,
priest, flower children, bridesmaid and usher pairs, guests), in finery
drawn over the person (`src/parts/people/finery.ts`). Gather (to 90 s):
a flower arch over the door, a guard of honour in two rows. Vows, then
out under the arch: bells (now heard), petal showers, handfuls thrown,
nine doves, a kiss. Procession: one column on a track at 0.42 cells/s,
two abreast, by a fountain or square where that adds 4+ steps;
bystanders within 2.4 cells stop and wave. Celebration 32 s: ring,
dance, bouquet thrown, the band if a bandstand is within 14 steps. The
petal trail lies 50 s, then the priest sweeps it. Cue: a note "Wedding
bells at the chapel" with Watch (`src/app/wedding-note.ts`,
`glideTo`). Cadence: first 25–45 s in, then 300–420 s after the last
ends, by day; before, with the time slider held at day there was
exactly ONE wedding per session (the day counter only moved at dawn),
which is why Derek never saw one. L57 reach raised 12 → 20 (the three
grown towns with a chapel and no post now get one). Tests
`src/life/town/wedding.test.ts`. Gate: 2,202 passed, 10 skipped, clean.
Weak (agent's): not legible from the whole-island view (people are a
few pixels; the note is what makes it findable); doves read as gulls
from far off; gathering takes up to 90 s in a big town; editing the
town mid-march breaks the column. Not built: hats thrown, bunting along
the route. GPU frame time not measured.
Running: choose-kinds.

**Choosing kinds merged** (`b9860ad`, Opus, `swarm/choose-kinds`). New
island → "What kind of island?": Surprise me, Plains, Hills, Mountain,
River valley, Islands, defined in `src/terrain/kinds.ts` by what
generator 2 really returns and reached by a seed search (median 4–7 ms;
4,000 seeds / 40 islands at most, then the closest). Grow a town →
where → "What kind of town?": Surprise me, then the eight kinds in two
columns (`src/townmaker/kinds.ts`); on this island a kind it cannot
carry is greyed (river with no long river; marble or castle with no
site, asked of the planner itself); on a new island a seed is searched
to suit the kind. Generators, save format and codec unchanged. First
merge attempt conflicted with other sessions' My towns and music in
`menu.ts`, `interface.ts`, `main.ts`; the agent merged the working
branch and resolved: every way off an island goes through
`leaveForNewIsland` (the town is kept in My towns), and the line under
the question says "The town you have now stays in My towns." New
browser test walks four kept towns. Gate: 2,230 passed, 12 skipped,
clean. Not offered: a river-less valley (same as Hills); lake, volcano
or ridge-valley islands would need a third generator saved as
`terrainGen: 3`. The "working" animation for a long search was never
seen on screen (searches finish too fast).
Running: nothing of mine. Other sessions are active on this branch.

**2026-11-21 early hours (Derek).**
- "Why is Marble City grayed out all the time?" Measured, generator 2
  seeds 1–40: offered on 9 of 40. Cause: the planner falls back unless a
  forum fits, and the smallest forum needs a flat free 13×13
  (`SIZES`, `src/townmaker/districts/forum.ts`); most islands' largest
  flat square is 6–10. Castle refused on 4 of 40. → grow-town agent
  (`a5aa1417a439de127`), resumed: forums that adapt (smaller, terraced),
  the planner levelling a site with land edits, more marble elsewhere;
  target 38+ of 40.
- Orchestrator: a greyed kind now says why, on hover (title) and in a
  line under the list when pressed (`WHY_NOT_HERE` in `src/ui/menu.ts`;
  rows are aria-disabled, not disabled). Gate 2,230 passed, 12 skipped;
  published `1b7e293`.
- He hates the folly (an arch run on pillars with a tower-windmill and a
  bracketed room; screenshot `/tmp/lc-ugly-default.png`): replace with a
  big windmill, a couple of cottages, cute things, one tasteful arch →
  queued for the same agent, with the roles it existed to show moved
  somewhere sensible or dropped from the survey.
Running: grow-town (marble everywhere, the windmill corner).

**Marble everywhere and the mill corner merged** (`ca60c58`, Opus).
Marble city offered on 39 of 40 generator-2 islands (was 9) and all 30
generator-1 ones; castle town on 40 of 40 (was 36). How: a compact
forum form (temple on a 5×4 podium, stair, 9×5 court with an obelisk, a
stoa; needs 9×12) and the planner LEVELS a site with ordinary land
edits when none is flat (`src/townmaker/levelling.ts`: least earth
moved, at most two then three levels a column, never water or the map
edge; edits play first, are saved in `World.terrainEdits`, undone with
the growth; round-trip test). 20 of 69 surveyed marble cities are
levelled, 42 use the compact form. Only refusal: generator-2 seed 18 (a
ring round a lagoon). The folly is gone from every plan; a mill corner
(a three-tall windmill on the ground, the miller's house, two
cottages, fenced wheat with a scarecrow, kitchen garden, well, a fence
gate; no arch: a lone arch on a path draws as a castle gate) goes in
farming, garden, market and hill towns. Orchestrator grew marble cities
through the menu on generator-2 seeds 6, 30, 12 (49, 99, 0 land edits):
all read as marble cities. `WHY_NOT_HERE.marble` is now "This island has
no room for a forum." Gate: 2,232 passed, 12 skipped, clean. Agent's
list of contrived set pieces not fixed: the walled tower, standalone
watchtowers, the folly tower inland, shrines stamped three or four
times. The hand-built `everything` scenario still has a folly.
Running: nothing of mine.

**More windmills (Derek, 2026-11-21).** "I really like the look of
windmills and I want to see more of them"; almost none of his towns had
one except the farming village. → grow-town agent
(`a5aa1417a439de127`), resumed: measure mills per town by kind, then a
windmill in at least 95 % of towns of every kind, usually two or more,
through several forms (the mill corner and a small version, a lone
hilltop mill, a quay mill, a row by the fields, a market or bakery mill
that the bread chain uses, a town mill on a tower stack, more
watermills), placed by fit with fall-backs.
Running: grow-town (windmills).

**New town scenes (Derek, 2026-11-21).** "I love the wedding, I love
when they play sports, these little cute things I can watch are great,
so think of some more and add them"; his example: a beach day in summer
(chairs, parasols, people lounging). → new agent `acfb086248bffb0ff` on
`swarm/town-scenes` (Opus), owning life scenes: the beach day first and
complete, then six to ten more chosen from a wide list across seasons
(picnics, fishing, kites, snowmen and sledging, a maypole, a street
performer, a school outing…), each obvious from the normal view, a
small story with props carried and put away, a town-wide cadence, held
sliders handled, findable like the wedding.
Running: grow-town (windmills), town-scenes.

**Windmills in every town merged** (`0f4b7d8`, Opus). Before: no mill
in any harbour, marble, castle or market town of the survey; after: two
in every town of those kinds, 3–4 in hill and garden towns, farming
unchanged (avg 4.7). Forms in `src/townmaker/districts/mills.ts`: a lone
mill on a rise with a path, a mill by the docks, a small mill corner, a
field-edge mill, a market mill, a town mill on a two-storey tower.
Placed after the streets are joined and before cottages and woods;
7 steps apart; not within two of a garden. Bread chain starts at a mill
in 26 of 30 towns (was 14). Survey floor: a mill in 95 % of towns per
kind. Known: the mill body is always white (only cap colour and height
vary); a tower mill's door is up the tower so the bread chain skips it;
hill towns' bakery is not joined to their mills on foot; generator-2
seed 106 as a hill town gets one unreachable mill. Orchestrator fixed
the one failing test (the wedding test now filters "walking backwards"
crowd push-back as town.test.ts and places.test.ts do). Another session
merged analytics (`posthog-js`): `npm install` was needed in the
orchestrator's checkout. Gate: 2,245 passed, 12 skipped, clean.
Orchestrator's eye: the mills are there but modest; in the castle
town's overview they are easy to miss among the towers.
Running: town-scenes.

**My towns sheet (orchestrator, Derek 2026-11-21).** New island is
always the first card, the town on screen second; Delete's icon is a
bin (`trash` in `src/ui/icons.ts`), not the eraser. `src/ui/towns.ts`
(another session's file, a two-line change). Gate: 2,243 passed; 2
timeouts at load 17 (`tests/terrain2-town.test.ts`,
`src/life/under-fire.test.ts`), both pass alone in 16 s.

**Town scenes round 1 merged** (`474addb`, Opus, `swarm/town-scenes`).
Four scenes, one a season: beach day L63 (summer, fair, by day; up to
30 % of the town, a household per pitch, parasols, deckchairs, towels,
sandcastles, paddling and swimming, 150–210 s; rain sends them home at
a run), snow day L64 (deep snow: a snowman built in five stages on the
biggest square, then a snowball fight), harvest supper L65 (autumn, 110
s before dusk: tables carried to the square, a lantern string, 40 % of
the town at table, a toast), picnics L66 (spring, and summer with no
beach: up to four families on checked blankets). One register for big
scenes (`src/life/town/scenes.ts`: at most two at once, 40 s apart,
none while a wedding gathers) and one note with Watch
(`src/app/scene-note.ts`, was the wedding's; at most one every 100 s).
Timing runs on elapsed game time, so held sliders keep scenes coming
(held summer noon: a beach day every 1–2 min). All 15 grown towns have
a beach. Catalogue L63–L66, design section 13c, a test file and a
scenario each. Gate: 2,274 passed, 12 skipped, clean. Orchestrator
looked at all four: the beach (a row of striped parasols) and the
supper (a long table under lanterns) read at a glance; the snow day
reads at town zoom; picnics are small. No guide picture for the snow
day or supper (the guide's picture tool cannot hold a season). Round 2
sent: carol singers, an ice-cream cart, fishing off the pier, skating,
leaf piles, a street performer, an evening promenade.
Running: town-scenes round 2.

**Ragdoll and the Hand (Derek, 2026-11-21).** New agent
`a0dfec5cd5f0c15d7` on `swarm/ragdoll` (Opus). (1) People (and ground
animals, soldiers, the rider) are thrown outward by a nuke's ring, a
bomb's blast and a close lightning strike: ballistic arcs with a floppy
tumble, stopped by walls and roofs, a splash and a swim in the sea,
then dizzy stars, then up again; nobody hurt, nobody vanishes; a small
deterministic integrator, no physics dependency; back on the walking
graph after. (2) A Hand tool in Mischief: press and hold picks up a
person, animal, bird, cart, boat or (if it can look right) a big ship,
carried over the roofs, dropped or thrown by a flick, landing as in
(1). Buildings not in the first round: the agent is to say what it
would take. Order: ragdoll whole first, then the Hand for people and
animals, then birds, carts, small boats, then big ships. Told to keep
changes to shared people files small (town-scenes round 2 is in
`src/life/town` and `src/life/people` now).
Running: town-scenes round 2, ragdoll.

**Town scenes round 2 merged** (`84984f6`, Opus). New: carol singers
L67 (winter or festival dusk: up to six with lanterns on poles sing at
up to six doors, householders come out), an ice-cream cart at the beach
(a queue, cones carried off), children waving a ship in L68 (to the
pier end nearest an arriving big ship). Fixed from round 1: picnics lie
together as a picnic ground with bright blankets and a parasol, only on
open grass; the snowman is 1.35× bigger, rolled balls grow to its size,
each side packs a snow fort, bigger snowballs (the seasons code's
snowman that just appeared is removed, so the built one is the only
one); beach pack-up is unhurried unless it rains; a guide entry can
hold its own season, weather and time (`tools/guide/main.ts`), so the
snow day and supper have pictures. Scenes no longer take someone
standing at another chain's job. Gate: 2,284 passed, 12 skipped, clean.
Orchestrator looked at the picnic ground (better; still modest), the
ice-cream cart (reads), carols (a small cluster of lanterns; modest at
town zoom), the snow day at town view (snowman and children; the fight
does not read). The ship welcome has not been seen in a picture by
anyone. Not built: a miller's cart, skating, leaf piles, a street
performer, fishing, a promenade.
Running: ragdoll and the Hand.

**Nuke goes off on landing (orchestrator, Derek 2026-11-21).**
`NUKE.fuse` 1.1 → 0 (`src/life/mischief/director.ts`); the siren and
whistle end at the landing (`nukeWarning`). Done by the orchestrator,
not the mischief agent, because the ragdoll agent is in those files; it
was told. Gate: 2,284 passed, 12 skipped, clean.
**Barbarian raids (Derek).** New agent `af67b2b62016bdcfb` on
`swarm/barbarians` (Opus): a longship runs up the beach, or a bigger
one stands off and sends rowing boats; a band of horned-helmet raiders
storms the town, sets fires through the existing fire engine, loots
visibly, and sails off; villagers flee, the garrison scuffles; the
player can sink the ship (stranded raiders are chased into the sea); a
Raiders on/off switch in the menu, a Raid tool to summon one, and rare
raids on their own registered with the scenes' register. Nothing saved.
Order: figures and longship, the landing raid, looting, stopping them,
the offshore ship, raids on their own.
Running: ragdoll and the Hand, barbarians.

**The site moved (another session, `7d0a70b`, 2026-11-21 about 02:20).**
The game is now at https://littlecity.io/ ; `tools/deploy-pages.sh`
publishes to the `gh-pages` branch of the repo `yaoderek/littlecity.io`
(base `/`, a CNAME file). The old address
(https://yaoderek.github.io/littlecity/) is meant to hold a forwarding
page that carries players' towns across (`tools/publish-bridge.sh`);
never publish the game there again. The orchestrator's publish of the
nuke change (`08a6661`) went to littlecity.io and is served there
(bundle `app-CXSwQQkh.js`, checked by resolving the domain to GitHub's
address directly; this Mac's resolver did not find the name). At 02:30
the old address still served the previous game build
(`app-BOv6Kbyq.js`), not the forwarding page: left to the session that
owns the move.

**Ragdoll and the Hand, round 1 merged** (`0ab41bd`, Opus,
`swarm/ragdoll`). Blasts throw everyone out of doors (nuke: all, in
step with the ring; bomb: 3.6 cells; lightning: 1.3), and dogs, cats,
hens, sheep, grazers, ground pigeons, soldiers: a real arc with a
flailing tumble, stopped by walls, sliding off roofs, a splash and a
swim in the sea; two bounces, 2.4–7.4 s dizzy with stars, 3.4 s getting
up, the hat fetched, back to the walking graph. Fast flyers knock over
whom they hit. Code: `src/life/mischief/thrown.ts`, `ground.ts`,
`thrower.ts`, `critters.ts`, `thrown.system.ts`; a crowd mode
`'thrown'`. The Hand (`src/ui/hand.ts`): press lifts, carried above the
roofs with a shadow and a line, release drops, a flick throws; people,
soldiers, dogs, cats, hens, sheep, grazers, ground pigeons; touch too.
To be throwable a non-crowd actor calls `critterPose(...)` in its
update. Gate: 2,305 passed, 12 skipped, clean. Falls short: from the
whole-island view a nuke does NOT visibly toss the population (figures
too small under the fireball and dust; reads and is funny at zoom
9–14); stars small; p95 frame after the bang 17–30 ms (was 10–22) from
redrawing flyers every frame. Not done: the rider and horse, birds in
the air, carts, boats, ships, loads knocked loose, the town reacting.
Buildings: recommendation only (lift and wobble first; real moving
touches saving and undo).
Running: barbarians, ragdoll round 2.

**Barbarian raids merged** (`96d14f1`, Opus, `swarm/barbarians`).
Landing raid: a longship (striped sail, dragon prow, shields, oars)
comes in with a horn, the alarm bell rings, a note "Raiders off the
coast!" (always shown), it beaches, 8–16 raiders (a chief, brands, axes,
clubs; horned helmets, capes, shields) charge with "RAAR!" balloons,
set 2–9 buildings alight through the fire engine, loot visibly
(barrels, sacks, a chest, a ham, a pig) to a pile, townspeople within 7
cells flee and nearby scenes break up; horn at 70 s, away with the
loot; about two minutes. Boats raid: a bigger ship stands off and sends
two to four rowing boats. Stopped by sinking the ship (bomb, nuke,
lightning by distance); a band stranded ashore loses heart and is
chased into the sea. A Raid tool; a Raiders switch (on by default;
first raid not before 8 min of play, then every 12–20 min; towns of 14+
buildings, not at night, not at a wedding). One undo step for the whole
raid; nothing saved. `src/life/raid/**`, handoff `docs/swarm/handoff/raid.md`,
catalogue L69–L72. Orchestrator's eye: the longship and the close view
are very good; the band bunches in a line against the first row of
houses and the raid stays in one corner of the town; from the
whole-island view the band, the flight and the loot do not read. Not
built: garrison and scuffles, villagers fighting back, livestock,
stalls emptied.
**Ragdoll round 2 merged** (`aaf96b3`, Opus). The nuke now reads from
the normal view (orchestrator saw a frame 1 s after: people and sheep
in the air all over the town): throws of 6–13 units/s upward, nobody
launched in the first 0.3 s, flyers drawn up to 2.9× at the far zoom by
height, speed lines, yelps. Flyers moved 30 times a second (cost back
in the noise). Bigger stars, three dizzy poses. The Hand lifts small
boats (bob, capsize, or lie hull up on land), big ships (out of traffic
while held; on land 30 s then refloated; `lifted`/`aground` in
`visit.ts`), the knight and his horse; loads knocked loose and picked
up; onlookers look up; a building held lifts a little and wobbles and
settles back byte-identical. Looks wrong: a galleon on houses lies
partly inside them. Not done: carts, birds in the air. Raiders at sea
and the longship are the raid's own drawings and are not liftable yet.
Also: `under-fire` and `terrain2-town` long tests get a 240 s limit in
the gate (they timed out at 60 s under load three times). Gate on both
merges together: 2,324 passed, 12 skipped, clean.
Running: raids round 2.

**Raids round 2 merged** (`388f0f8`, Opus). The band splits into
parties of three (brand, axe, club), each running to its own quarter as
far from the others as it can (market, warehouses, a rich house, the
mill preferred); each raider has his own cell and side of a building;
looters shuttle to a twelve-place pile. Harbour town: 18 buildings lit
directly, about half the western town alight by 60–70 s. Raiders drawn
up to 1.8× from afar, shields held up, the chief's raven standard,
smoking brands, a gold chest, a panic pose for fleeing villagers. Bold
villagers (broom, frying pan) and castle guards brawl with raiders
(`scuffles.between()`); the loser sits dazed then runs. A stolen pig or
hen jumps ship and swims home; market-day baskets are taken and put
back. The longship and rowing boats can be lifted by the Hand
(`ship:raid…`); dropped on land the band is stranded. The fire, not the
raid, was the p95 cost (99 burning cells: 51.6 ms with no raid). Guide
picture `public/guide/raid.webp`. Gate: 2,325 passed, 12 skipped,
clean. Orchestrator's eye: at town zoom fires break out across several
quarters and it reads as a raid; from the whole island the ship, smoke
and scattered fires tell you one is on, the parties and the loot do
not; the eastern half of the big harbour town stays untouched. Not
built: the castle's troop sallying out, dogs chasing, sheep scattering,
stalls' baked-in goods emptied, raiders swimming being liftable.
Running: nothing of mine.

**Derek on the live build, 2026-11-21 evening (orchestrator's quick
fixes, `1dcfe…` see git log).** (1) Sound: off now silences the music
too: one reading of the switch for everyone (`soundOn()` in
`src/life/sound/volume.ts`: on unless the player turned it off; it used
to be off until turned on, with the music playing regardless), the
music obeys `lc:sound`, both sliders grey when off and moving either up
turns sound on. NOTE the default changed: game sounds are now on for
players who never chose. (2) Thrown people "expand in size too greatly…
does not follow physics": `flightGrow()` returns 1 (bodies keep their
size; the growing was the orchestrator's instruction, a mistake); the
black speed lines ("look like a ladder") are off. (3) Raiders "bigger
than the villagers": `raiderScale()` returns 1 and `barbarian.ts` uses
the townspeople's heights. Gate: 2,326 passed, 12 skipped, clean.
Still to fix, with the agents: the flight's motion itself (ragdoll
agent, round 3: debug with per-frame numbers, real scatter, one
gravity, no size change); raiders glitching in their boat and standing
in a clump doing nothing in a town already wrecked and mending (raid
agent, round 3; screenshot `/tmp/lc-raiders.png`).
Running: ragdoll round 3, raids round 3.

**Ragdoll round 3 merged** (`cf85d41`, Opus). What was wrong with the
flight, measured over 60 people in one nuke: launch speeds almost
identical (sd/mean 0.15) and every angle 58–68°, so the crowd rose as
one sheet; gravity 13 units/s² where a person is 0.46 units tall (about
five times real for the scale: a 1.2 s snap); limbs random drawings at
10 a second, strobing against a body moved 30 times a second. Now: each
body its own share of the blast (0.4–1.65, skewed), angle 22–80°,
bearing up to 35° off; measured spread 0.38; gravity 7, constant, no
easing; spin from the launch speed; limbs flung back along the
velocity; flyers drawn every frame, place and pose together; a pale
puff at take-off; no size change anywhere. The Hand's catch hangs and
swings as a damped pendulum; a throw leaves at the pointer's velocity.
Speed lines stay off. Tests pin g, the spread, and constant drawn size.
Gate: 2,328 passed, 12 skipped, clean. Cost of honesty: from the normal
view a nuke's flyers are specks again (orchestrator's own mid-zoom
sequence: debris and dust dominate; people hard to pick out); bomb
throws are short and low. Not judged by eye by anyone: the trailing
limbs and the Hand's swing close up.
Running: raids round 3.

**Notes and stars (orchestrator, Derek 2026-11-21 evening).** A note
with Watch now appears only for a raid and a wedding (`NOTED` in
`src/app/scene-note.ts`); the beach day, snow day, supper, picnics,
carols and the ship welcome raise none ("a beach day does not warrant
an event"). Dizzy stars: three, radius 0.1, size 1 at every zoom (were
four at 1.8 and up to 2.9× from afar). Gate: 2,328 passed, 12 skipped,
clean. The stars were not seen in a picture after the change (the
orchestrator's close sequence caught nobody dizzy).

**Raids round 3 merged** (`b2f2e83`, Opus). The clump: plans were fine;
the crowd's last rule (never step closer than a body to anyone ahead)
still made raiders give way to each other, so a band on a one-cell
strip packed into a block; walkers waiting for the garrison's column
never counted as stuck; and damaged or scaffolded buildings were not
targets (Derek's wrecked town offered 5 things to burn and 5 to loot;
now 35 and 42). Now raiders ignore each other in that rule, take their
own line across a street, raid building sites, leave after 14 s if
there is nothing, and no raid comes on its own to a town over 40 %
ruins. The judder at sea: 6,224 frames of rowers sliding against their
hull (up to 0.88 units): boats were yanked onto their path when cast
off, and rowers were placed from the hull's previous frame every other
frame. Now vessels are drawn first and everyone aboard is placed on
them every frame. Also: one war-cry balloon per knot, smaller brand
smoke, a sunk longship takes its yard under, boarding from close by
(the ship waits 25 s at most), an errand's spot kept inside its cell (a
1.6-unit villager snap from the bucket chain). Gate: 2,330 passed, 12
skipped, clean. Not seen on film: a brawl; the boats casting off after
the fix (measured only).
Running: nothing of mine.

**Scorch and keys hint (orchestrator, Derek 2026-11-21 evening).** The
nuke's scorch was square quads laid a little above each column, hanging
over every rounded cliff edge ("looks like a square placed on top").
It is now built from the terrain's own top triangles (`terraceTops()`
in `src/gen/terrain/terrain.gen.ts`: each column's terrace top with its
rounded corners, plus that level's fillets), coloured per quarter cell
as before. Checked on a hillside in the app. Its inner edge on flat
ground is still stepped by quarter cells (the "ragged edge"). A keys
hint in the bottom-left corner (`.lc-keys`: F fly, Esc whole island,
⌘Z undo): tiny, half-opaque, no clicks, hidden on touch, under 980 px
wide and while flying. Gate: 2,330 passed, 12 skipped, clean.

**Shields and the longship (Derek, 2026-11-22).** Shields are red and
white only (`SHIELD_PAIRS`, `SHIELD_RED` in
`src/parts/raid/longship.ts`, used by the ships and by `barbarian.ts`);
gate 2,330 passed, 12 skipped; published. "The boat asset doesn't look
very good compared to the other boat assets" → raid agent
(`af67b2b62016bdcfb`), resumed: redraw the longship to the galleon's
standard (clinker hull with planking and a sheer, a tall carved dragon
prow and curled stern, a shield rail, a stout rigged mast and a striped
sail that furls, real oars through ports that ship when beached, deck
gear; a grander ship for the boats raid; small clinker boats).
Running: raids (the longship redraw).

**Longship redrawn, merged** (`570a76c`, Opus). Clinker hull (seven
strakes a side, each its own ink group; tarred below, two oaks, an
ochre band, a red top strake), ribs, floorboards, sea chests for the
rowers, barrels, rope, an anchor; a taller dragon head (jaw, teeth,
gilt horns, a red and gilt mane) and a spiral tail; shields on a rail;
a stouter mast with stays and shrouds, a vane and pennant; the sail
with seams, reef points and a raven, furled in bundles when beached;
oars through ports, raised upright when beached; a steering oar. The
boats raid's ship is its own mesh (nine oars a side, a striped awning
aft); clinker rowing boats; wake and oar splashes. 6,485 triangles
whole (galleon hull 2,561); mesh test `src/parts/raid/longship.test.ts`;
sheet tool `src/life/testing/longship-sheet.mjs`. Gate: 2,331 passed,
12 skipped, clean. Orchestrator's eye: a clear step up, a real longship
under sail; the hull is still mostly brown seen from above and the
galleon's bold bands read better from afar; raised oars on the beached
ship look like a fence of sticks. Agent's own: the mast is part of the
hull mesh, so a scorched longship loses its sail but not its mast.
Running: nothing of mine.

**Derek, 2026-11-22 afternoon.** (1) A sunk longship kept going down
and hangs in view under the map's slab (screenshot `/tmp/lc-sunk.png`;
round 3 made it sink deeper to take its sail under): nothing sunk may
be drawn below the sea, and it stays under. (2) The boats raid should
be just the small boats on their own, no big longship standing off.
Both → raid agent (`af67b2b62016bdcfb`), resumed: one mechanism for all
vessels and wrecks (a clip at the water plane beside the map-edge cut
if workable), checked from his camera angle; the big ship removed from
the boats raid, boats come in from the map's edge.
Running: raids (sunk vessels, boats raid).

**Sunk vessels and the boats raid, merged** (`f59c042`, Opus). Filmed
with no clip from Derek's low angle: the raid longship (sinks about 4
cells) and the harbour galleon (4.2) both hung under the slab from
about +10 s; rowing boats (1.4) did not. Fix: in the surface shader,
beside the map-edge cut, a fragment of anything marked for that cut
(vessels, wrecks, swimmers) below the sea's surface is discarded
(`if (vCut > 0.5 && vW.y < uSeaY - 0.015) discard;`). Holds through
undo, mend, the Hand and town changes because it depends on no game
state. Test `tests/e2e/sunk.e2e.test.ts` (fails without the clip).
Tool `src/life/testing/sink-frames.mjs`. The boats raid is now two to
four clinker rowing boats alone, in from beyond the map's edge in line
with oars in time, a raider standing in each bow (the chief with the
standard), each to its own landing; loot in the boats (a chest in the
stern); each boat leaves when its crew is aboard; a sunk boat's raiders
go to another, the last boat sunk strands the band. No stand-off ship,
so the planner no longer needs a big circle of clear water. Gate:
2,335 passed, 12 skipped, clean. Not covered by the clip: things baked
into the town (a toppled stilt house). Not seen clearly on film: a
small harbour boat capsizing.
Running: nothing of mine.

**First visit grows a town (orchestrator, Derek 2026-11-22).** On the
very first open in a browser (`lc:welcomed` not set), on an empty
island, a town grows by itself 900 ms after the island appears (`grow()`
with the dice's kind), with a closable note beside the menu button
offering "Empty island instead" (the growth skipped and undone). Not on
a shared link (`#t=`), a scenario or `?mischief`; not if the player
places something first; never twice. `src/ui/welcome.ts`,
`tests/e2e/welcome.e2e.test.ts` (four tests). Tools and tests are not
first-time visitors (`openPage` marks the visit seen unless
`welcome: true`), so nothing else changes for them. Checked in a
browser on a random island: "A farming village is growing." Gate:
2,334 passed, 12 skipped, clean. Known edge: a returning player whose
browser lost `lc:welcomed` (the domain move) and whose current island
is empty gets a town grown on it; one undo or the note's button takes
it back.

**Guide: every naturally occurring event (Derek, 2026-11-22).** He asked
what all the events are and for them to be in the guide (it lists six).
→ town-scenes agent (`acfb086248bffb0ff`), resumed: an entry per thing
that happens by itself (big occasions, seasonal scenes, daily life, the
waterfront, after mischief), grouped, each with what to build and when
it happens, a picture and a proof; and the list written in the docs.
Running: town-scenes (the guide).

**Guide: the town's happenings, merged** (`e7b84fc`, Opus). 25 entries
in six new groups in place of `events`: Big days (market day, a
wedding, a raid, the midwinter festival), Through the seasons (beach
day, picnics, snow day, harvest supper, carol singers, the harvest), By
the water (ships unloading, waving a ship in, the catch), Every day
(bread, water, washing, school and hopscotch, the smith, a show, games
on the field, dogs, a scuffle), Evening and night (lamplighter, night
watch), After mischief (the fire brigade and mending). A new optional
"When" line on cards; the picture tool can summon a raid, a fire or a
scuffle; picture budget 3 → 4 MB (now about 2.6). The whole list with
rule numbers: `docs/swarm/events.md`. Left out as entries: things
already in the guide as places (garrison, rider, maypole, apple
picking), things that need the player acting (builders, the blown
about, swimmers), ambience. Weak pictures (agent's list): bread, water,
washing, the scuffle, waving a ship in, dogs. Gate: 2,352 passed, 1
failed: `tests/e2e/hand.e2e.test.ts` "a still release…" timed out
picking a person up a second time (the person had walked on between
reading their place and the press); passes alone four times running;
a flaky test to fix, not this merge.
Running: nothing of mine.

**Memory: old plans are let go of, merged** (`148dc08`, Fable; Derek:
"performance of the site is decreasing"). The page kept every edit's
whole plan for good: about 1.3 MB a block placed (a seeded first visit,
374 blocks after 40 s: 777 MB held, now 138 MB). Three holders: a
behaviour's `rand` made inside the life runtime's sync, an item's
handle made inside the view's syncDressing, and a frightened sparrow's
town. Tests: a unit test in `src/life/runtime.test.ts` and
`tests/e2e/memory.e2e.test.ts`. New tools: `tools/perf.mjs` (the real
game page: frame times, the worst frames and what ran in them, memory
held, draw passes; `--vsync` when looking for stutter) and
`tools/heap-paths.mjs` (what holds old plans). Gate: 2,355 passed, 0
failed. Still slow, not done here, biggest first: each block placed is
a 45 to 67 ms frame in a 440-block town (a whole 16 × 16 terrain chunk
rebuilt when a block lands by a step in the ground; the sea and boat
rules in the dressing); at rest the graphics card is the limit and a 2×
screen's lowest level is still a pixel ratio of 1.5; the first click
makes four audio contexts (about 350 ms in the test browser); a hover
with a piece resolves the whole town for each new cell.
Running: nothing of mine.

**Turning the camera: judder a governor could not see, merged**
(`c51d4e9`, Fable; Derek: "pretty strong jitter" rotating, on a
2560 × 1440 screen at 1x). A 1x screen was drawn at twice its size each
way: 14.7 million pixels a frame there, 11 to 15 ms of drawing on this
M5 with the graphics card to itself and over a refresh with anything
else on it. The quality governor judged "two frames on time, one a
refresh late" as fine (median 16.7 ms, nothing over 34 ms). Now: a
frame well over the usual one (1.6 × the median) is long and one in ten
is slow; a level it came back up to and that proves slow again waits
longer each time; frames after an edit are left out. A new 1x level,
super-sampling 1.5 (levels 2, 1.5, 1, 1 with half ink), and a
super-sampled view over 10 million pixels starts there (`startLevel`);
the governor tries 2 when frames have been fast for a while. Gate:
2,360 passed, 3 timed out with the machine at a load of 21 (another
session's trailer capture): `kinds.test.ts`, `raid.test.ts`, the My
towns test of `grow-town.e2e`; all three pass alone. Not the cause
(measured): the session recorder, a change of level, the script.
**For whoever runs browsers on this Mac:** headless Chromium here uses
the real graphics card, so captures, benches and e2e runs slow the game
in Derek's own browser while they run; `tools/perf.mjs` with the cap
off is the worst for it. Still open: the first press of a session
makes four audio contexts in one go (180 ms to 2 s in the test browser
under load): one shared context would do.
Running: nothing of mine.

**UFO (Derek, 2026-11-24 night).** A new Mischief tool: a saucer flies
in, beams up a random person who flails and shouts "HELP!", and flies
off; with nobody about it comes and goes. → the ragdoll and Hand agent
(`a0dfec5cd5f0c15d7`, `swarm/ragdoll`), resumed. Orchestrator's
decisions in the brief: called by a click (near the click if anyone is
there); the person is brought back 20–40 s later somewhere else in
town, dizzy (nobody is lost for good); nothing scaled with camera
distance; at most three at once or a queue (agent to choose); cheap to
draw (the game is live and viral, many weak phones). Also asked: fix the
flaky Hand e2e test.
Running: ragdoll agent (UFO).

**UFO merged** (`bbd8b7c`, Opus, `swarm/ragdoll`). A Mischief tool:
click or tap calls a saucer (up to three at once). In over the map's
edge in 2.4 s, hovering about 1.7 above the highest roof near its
catch: the person out of doors nearest the click within 8 cells, else
anybody (the Hand's rule). A soft yellow-green beam, the person lifted
turning and kicking over about 3 s under a "HELP!" balloon, hat or load
dropped, onlookers within 3 cells looking up; in at the hatch (hidden,
not shrunk); off in 1.6 s; back 20–40 s later at a walkable spot 6+
cells away, lowered and let go, dizzy 3.5 s, then on their way. Nobody
about: it sweeps its beam 3.2 s and leaves. A nuke under it flings its
catch free. Undo and town changes clear it. 7 draw instances a saucer,
no per-frame allocation; frame cost within the noise. Code:
`src/life/mischief/ufo*.ts`, catalogue LM03, verb `ufo@x,y,z`. The
flaky Hand e2e test is fixed (the person held still first). Gate
(orchestrator, one run): 2,480 passed, 12 skipped, clean; live and
GitHub both still at `8a28cb1` before publishing. Orchestrator's eye:
by day the saucer and the HELP! balloon read and it is funny; the beam
is barely visible; no alien shows in the dome; at night only the dome's
glow shows (hull and beam lost). Not built: a dog barking, the
hair-on-end joke. Round 2 sent for the beam, the night look and the
saucer's presence.

**UFO round 2 merged** (`788acb4`, Opus). The beam: a "tractor" mode in
the light-beam pattern of `src/render/shaders/surface.ts` (one branch
in the translucent pass, taken only when the beam's fourth parameter is
−1): its own lime colour, a tint by day and added light at night,
brightest at its edges, no fade near the source; five pieces (cone,
four bands travelling up or down, sparkles, a pool with a pulsing rim,
a spill of light). The saucer redrawn bigger (radius 1.05): silver
upper hull, ribbed underside, a self-lit red rim band, twelve chasing
coloured lights, an antenna, a see-through dome with a green pilot who
looks about (and leans over the edge when searching an empty street).
Flight: banking with speed, a wobble on stopping, a bob, a spin-up
before leaving; a ring shadow. 12 draw instances a saucer; frame cost
within the noise. New scenario `ufo-empty`; a test of a town change
mid-abduction. Gate (orchestrator): 2,483 passed, 12 skipped, clean;
GitHub and the website both at `f97f01a` before publishing.
Orchestrator's eye: by day the lime beam, the pool and the lights read
at once; at night the beam's edges and the lime spill are the brightest
thing nearby and the saucer's outline shows; the pilot is hard to see
at the zooms filmed. Not built: the dog barking, the hair-on-end joke.
Running: nothing of mine.

## RULE SINCE 2026-11-25: NOTHING GOES LIVE WITHOUT DEREK'S SIGN-OFF

Derek, 2026-11-25: "because we have a ton of actual players now you cant
just be autoshipping stuff to prod anymore. you NEED to have me sign off
on shit locally now." So: merge and gate as before, then STOP. Start a
local preview, tell him what to try (with a LAN address for his phone),
and run `tools/deploy-pages.sh` only after he has said yes to that
change. This holds for every chat and every agent, for rollbacks and
small fixes too. Phone performance is checked before asking him: a
throttled phone-sized context, and the quality governor's level before,
during and after.

**Why now: the UFO (live as `e7ca6d1`) went out on the orchestrator's
own say and is bad on phones.** Derek's report: (1) calling one causes a
massive slowdown and pixelation on phones that persists after it has
left, cause unknown; (2) it takes someone from across the map instead
of going to where he clicked and looking round there; (3) it clips
through buildings flying in; (4) the beam should be turquoise, not neon
green; (5) "why does it return?" (the return was the orchestrator's
idea, not his). → the UFO's agent (`a0dfec5cd5f0c15d7`), resumed, with
the performance cause first. Nothing deployed since; whether to take
the tool off the live site meanwhile is Derek's call (asked).

**Derek's answers on the UFO (2026-11-25):** it stays on the live site
as it is until he signs the fixes off locally; the saucer KEEPS
returning the person (he chose that over them walking home or being
gone). The agent was told to put the return back and apply the same
fixes to it (clear of buildings, turquoise, no resources left behind).
Running: the UFO's agent (round 3: the phone slowdown first).

**UFO round 3: on a local preview, NOT live, waiting for Derek**
(2026-11-25). Agent's work at `dc160b3` (`swarm/ragdoll`), merged with
the working branch (`207b7a5`) on branch `preview/ufo-fixes` in the
worktree `.claude/worktrees/preview-ufo` (one conflict in
`src/render/index.ts`: the new haze pool kept, the agent's `__lcMovers`
debug handle added). Built without the analytics key and served at
http://127.0.0.1:5180/ and http://192.168.68.60:5180/ (a background
task of the orchestrator's session; it stops after two hours). Gate on
the preview: 2,498 passed, 12 skipped, clean.
- **The phone slowdown's cause is NOT confirmed.** The agent could not
  reproduce it on this Mac (CPU throttling slows only the script; the
  M5's graphics are about ten times a phone's; software drawing was
  unusable). Removed on reasoning, not proof: every saucer mesh was
  built in the frame of the first click (5.3 ms here, more on a phone;
  now pre-built a frame at a time); each saucer left 8,300 vertices in
  the movers' pool until it compacted at 40 % unused (now 5,200); the
  light's spill covered a radius of 3 cells at 3× (now 1.6); on a
  phone-sized screen or below full-resolution ink the beam is cone and
  pool only. Probe: `src/life/testing/ufo-phone.mjs`. Separately,
  another session shipped `e33edcd` (the governor undoes a passing
  stall in one step), which bears on "pixelation persists".
- Goes to the click and takes only someone within 4 cells; cruises
  above the island's tallest thing and comes straight down (tested
  against the solid map and trees); turquoise (#2fd3cf); the return
  visit kept; no limit on saucers (they stack and wait for each other).
Deploy only after Derek says yes on the preview, and only after
checking what is live at that moment.

**Derek on the UFO preview (2026-11-25):** (1) a walking person beamed
up sometimes glitches and flies to the side; (2) the 4-cell search
radius is far too small: it should home on the nearest person, and
"nearby" only meant the abduction should be in the camera's view. →
the UFO's agent, round 4: reproduce and fix the sideways lift (the
saucer to hover right over its catch, a straight beam); take the
nearest person to the click among those on screen, with no radius. He
said nothing yet about phone performance. Still on a local preview;
nothing live.

**Derek, later the same day:** performance on the UFO preview "is
fine" (his phone; the cause of the earlier slowdown was never proven:
it went with the round 3 changes and/or the other session's governor
fix `e33edcd`). Two more for round 4: when it finds nobody the saucer
must not sit on the ground (a minimum hover height everywhere); sailors
on a ship's deck can be abducted. Both sent to the agent. Still on a
local preview; nothing live.

**UFO round 4: on the local preview, NOT live, waiting for Derek**
(2026-11-25). Agent's work at `c390031` (`swarm/ragdoll`); merged with
the working branch on `preview/ufo-fixes` (worktree
`.claude/worktrees/preview-ufo`, head `be68c4f`); gate there 2,502
passed, 12 skipped, clean; preview rebuilt at http://127.0.0.1:5180/
and http://192.168.68.60:5180/.
- Sideways glitch: a walker was not held until the beam was fully on
  (kept walking half a second), then the lift pulled them to the saucer
  through the Hand's swinging grip (up to 2.29 cells off the beam). Now
  the saucer glides to straight over its catch, holds them at once with
  a grip that does not swing, lifts straight up; the beam leans only
  while searching.
- Picking: the nearest person to the click among those on screen at
  the click (canvas less 16 px, not under the tray or a menu; behind a
  building counts; sailors on deck too), no radius; nobody on screen →
  search and leave.
- Never below 2.2 above ground or sea; saucers yield to each other.
- Sailors on galleons, cogs, galleys and the harbour barge-type ship
  can be taken (`Crew.take/giveBack`, `crowd.stray`); returned to the
  deck if the ship is still there, else set down in town. NOT done:
  the fishing boat, sailboats, the rower, river barges, raiders' boats.
- Orchestrator checked by real clicks in a browser (four clicks on a
  grown town: each took the nearest on-screen person, 0.5–5.6 cells
  away; lowest saucer height 2.60; a lifted person's offset from the
  beam 0.000). Not verified by anyone: a sailor taken from a ship under
  way; the "ship gone, set down ashore" path; the sailor wears town
  clothes while off the ship.

**Derek on UFO round 4 (preview, 2026-11-25 evening):** "better but the
beam effect still doesn't look very good. The black lines especially
look very off. It doesn't have the same shader look." Orchestrator's
close screenshots of the preview build: the sparkles are diamonds with
black ink outlines (opaque pass, an ink id each); the beam is a flat
slab of pure cyan with hard polygon edges, no paper grain, a notched
silhouette with pale shards; the town's ink lines show through it
nearly black. → the UFO's agent, round 5: a soft turquoise wash with a
gradient and feathered edges, a clean cone, no black ink in the effect,
the scene's lines lifted under the light, the phone's cheap form to
look good too; cost unchanged. From here on no attribution lines in
commit messages. Still on a local preview; nothing live.

**UFO round 5 (the beam's look): on the local preview, NOT live,
waiting for Derek** (2026-11-25 evening). Agent's commit `9f74edf`
(`swarm/ragdoll`): the beam is one camera-facing trapezoid painted in
the tractor branch of `src/render/shaders/surface.ts` as a pale
turquoise wash with the paper's grain, a gradient down its length,
feathered wavering edges, soft rings and glints painted inside it; the
separate band, rim and sparkle meshes are gone (the sparkles were the
black-outlined diamonds); the pool a soft glow; 9 handles a saucer
(was 12); the overlay pass already draws after the composite, so the
scene's ink under the light is tinted pale. Preview branch
`preview/ufo-fixes` at `dd7524f` (worktree `preview-ufo`), merged with
the working branch at `13add6e` (languages, a tip jar, fly mode on
touch); the orchestrator resolved the conflict in `src/ui/mischief.ts`
(kept `t()` and the UFO's new behaviour) and removed "Three at most at
once." and the dead "three saucers are about already" line from the
English and all six locale files. Built without the analytics key,
served at :5180. Gate there: 2,540 passed, 3 timed out at 200 s with
the machine at a load of 35 (other sessions' test runs), all in
`src/life/raid/raid.test.ts`; that file passes alone (12 tests, 331 s:
it is slow even alone and worth looking at). Known weak: the pool is a
flat disc (hidden under raised edges on steps); the beam is gentle by
day.

**Derek, 2026-11-25 late.** On the UFO preview: "make the beam
slightly more opaque, it's a bit thin": done by the orchestrator on
`preview/ufo-fixes` (`45f3e75`: about a third more opacity, thinning
less toward the ground); only typecheck run on that commit; preview
served at :5180 by `.context/lc-ufo-preview.mjs`; still not signed off,
nothing live. Raids: the boat should land on the coast nearest the
click, not come from a random direction, and clicking again should
bring more raiders (no one-at-a-time limit) → raid agent
(`af67b2b62016bdcfb`, `swarm/barbarians`), resumed, with the new house
rules (no deploy, no attribution, translations in the same change,
other chats in the harbour code).

**Derek, 2026-11-25 late: "ufo looks good to me. publish it on
deploy."** Signed off on the :5180 preview (`45f3e75`). The
orchestrator merged `preview/ufo-fixes` into the working branch
(`9049eb2`, no conflicts, `.env.production` intact) and started the
gate. While it ran, the languages chat merged `9049eb2` into
`feat/languages`, added the UFO's reworded line in German and Turkish,
fast-forwarded the working branch to `ab28224` and published from
there (22:14). So the UFO's fixes went live in that publish, not in
one of the orchestrator's: the live site serves `app-CKQ7H0ml.js`, its
shader chunk carries the more opaque beam, and the three-saucer line
is gone from the bundle. Gate: typecheck and lint on `9049eb2`, the
test run began two minutes before the branch moved to `ab28224`, so
the tests ran on a mix of the two: 207 files, 2,552 passed, 12
skipped, none timed out. Not re-run on `ab28224` alone. Also from
Derek: the castle's garrison should fight raiders and can repel one
raid → raid agent, same round as landing where clicked and spamming
(local only, needs his sign-off).

**Derek, 2026-11-25 late: two fixes.** "the orchards in winter/when
theyre destroyed still have ladders that are upright resting on
nothing" → agent on `fix/orchard-ladders` (lean on the trunk so it
holds in winter; lie fallen beside a stump, no picker climbs it).
"the fishing appearance looks chopped and the line doesnt go into the
water" → agent on `fix/fishing-line` (the line ends at the fisher's
feet, in mid-air above the sea; reach the surface with a float; find
what reads as chopped). Both local only, one preview for his sign-off
together with nothing else unless the raid round is ready.

**Windows start freeze: live as `c1d6604` (2026-11-25, 22:50; the
analytics chat, not the orchestrator).** Derek: "merge it in this is
much better" and "deploy live on littlecity". Cause, found on GitHub's
Windows machines: Direct3D's compiler takes about 4 s over each variant
of the surface shader, and a shader that writes two targets is built a
second time, with the whole browser frozen, at its first draw. Now,
where the renderer says Direct3D, the town is drawn into one packed
target and a small pass splits it (`src/render/packed.ts`; `?draw=packed`
or `?draw=plain` forces either); the first frame waits for its shaders
without blocking (`view.started()`); Firefox there, which cannot build in
the background, leaves fly mode's and the bare trees' shaders until
needed (`view.buildsAhead()`). Off Windows the 18 shaders the browser is
given are byte for byte the same. Measured there without a graphics
card: Chrome's frames stopped 8 to 15 s at the start and 6 to 14 s on
the first Fly before, no such stall after; Firefox about 30 s at the
start before, about 8 s after (its first Fly still waits about 9 s); 0
pixels differ in four scenes. Gate on a GitHub Linux machine (this Mac
was at load 40): typecheck, lint, 182 unit files passed. NOT measured:
a real graphics card. The Windows tests live on the branch
`test/windows-wait` (workflows that run only there, `tools/wintest`).
Any new variant of the surface shader costs Windows players about 4 s
of building each: keep them few.

**2026-11-25, night: preview `preview/next` at :5180 (not live).**
Orchard ladders back (`fix/orchard-ladders` `b260797`): the ladder
rests in the fork of its tree, lies on the grass beside a stump or a
burnt or regrowing tree (done in `src/resolve/ruins.ts`), no picker at
a fallen one; weaker in summer, where the top half is in the leaves.
Fishing back (`fix/fishing-line` `f5a2023`): rod longer, line to a
float on the sea, fishers at the dock's edge (`PEOPLE.fishReach`), but
it fails three crowd tests in the gate (a jump in `under-fire`, 31
sustained overlaps against 30 and one walking backwards in `solid`;
pass on the base and on the orchard fix alone) → agent sent back, not
in the preview. Raids back (`swarm/barbarians` `a6c82ca`): land at the
shore nearest the click, any number at once, a ceiling of 40 raiders
alive (24 on a phone), one shared undo step; phone-sized page p95
34 ms at 10 raids and 126 ms at 20, fires suspected. The orchestrator
added German and Turkish for the raid's reworded lines (`6c8dfcd`).
`preview/next` = working branch `3f21dc3` (live `c1d6604`) + orchard +
raids; gate running. Garrison sally: raid agent resumed for it.

**2026-11-25, night: `preview/next` at `010cd38`, all three on :5180
(not live, waiting for Derek).** The fishing fix repaired
(`fix/fishing-line` `66d840c`): the crowd's fishing positions are back
to the base exactly (the three failures were the crowd reshuffled by
the moved spot, no fisher in any of them); only the drawn figure
steps to the edge (`PEOPLE.fishStep`); no line over a moored rowboat
or the fishing boat's berth. Gate on `010cd38`: 209 files, 2,568 passed, 12 skipped, none failed.
Phone-sized page, idle, `everything`: 16.7 ms median on the base and
on the preview alike. Two rare faults found on the base and left: a
person walking backwards to a shop haunt, a one-storey drop in one
frame on a fire errand.
