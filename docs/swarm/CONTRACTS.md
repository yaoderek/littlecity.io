# Little City contracts

The frozen API every stage builds on, as implemented by Stage 0. The source
files are the last word (each frozen file is commented for reading); this
page is the map, with one worked example per contract. The examples are
copied from files in this repo that compile and are tested; each says which.

- [1. Layout and who owns what](#1-layout-and-who-owns-what)
- [2. Discovery: add a file, never edit a list](#2-discovery-add-a-file-never-edit-a-list)
- [3. Commands](#3-commands)
- [4. Grid, chance, kinds, world](#4-grid-chance-kinds-world)
- [5. The plans](#5-the-plans)
- [6. Vocabulary](#6-vocabulary)
- [7. Facts](#7-facts)
- [8. Rules and the engine](#8-rules-and-the-engine)
- [9. MeshBuilder](#9-meshbuilder)
- [10. Generators, layers and parts](#10-generators-layers-and-parts)
- [11. Life](#11-life)
- [12. The view and the app seams](#12-the-view-and-the-app-seams)
- [13. Scenarios](#13-scenarios)
- [14. Style, tests, lint](#14-style-tests-lint)
- [15. Deviations from plan section 4](#15-deviations-from-plan-section-4)
- [16. Thin spots](#16-thin-spots)

## 1. Layout and who owns what

**Frozen** means: do not edit. If one blocks you, write
`docs/swarm/requests/<owner>.md`, work around it locally, and say so in your
report. **Stub** means: final signatures, placeholder body; its owner
rewrites the body. **Real** means: done in Stage 0; extend only if you own it.

| Path | Status | Owner |
|---|---|---|
| `src/core/**` (grid, rand, kinds, world types, vocab, mat4, style, discover) | frozen | Stage 0 |
| `src/resolve/plan.ts`, `src/resolve/engine/api.ts`, `src/resolve/facts/api.ts` | frozen | Stage 0 |
| `src/gen/mesh.ts`, `src/gen/api.ts`, `src/gen/frames.ts`, `src/gen/layout.ts`, `src/gen/checks.ts` | frozen | Stage 0 |
| `src/life/api.ts`, `src/render/api.ts` | frozen | Stage 0 |
| `src/scenario/**`, `tools/**`, `tests/helpers/**`, `tests/fixtures/**`, config files, `scenarios/scenarios.test.ts` | frozen | Stage 0 |
| `src/*/discover.ts`, `src/gen/fallback.ts` | real | Stage 0 (nobody needs to edit them) |
| `src/resolve/engine/run.ts`, `hash.ts` | real | Logic may change the insides; `run.test.ts` pins the behaviour |
| `src/world/**`, `src/terrain/**`, `src/resolve/{index,kinds,structures,supports,staged}.ts`, `src/resolve/facts/*.fact.ts`, `src/style/auto.ts` | stub | **Logic** (Stage 1) |
| `src/resolve/nav.ts` | stub | **People** (Stage 3) |
| `src/render/**` except `api.ts`, `src/gen/terrain/**`, `src/life/signals.ts`, `src/style/{palette,time}.ts`, `docs/swarm/ART.md` | stub | **Look** (Stage 1) |
| `src/ui/**`, `src/app/**`, `index.html`, `gallery/**` | stub | **Interface** (Stage 1) |
| `src/gen/<kind>/**`, `src/parts/**`, `src/rules/{roles,joinery}/**` | empty | **Houses / Monuments / Ground** (Stage 2), by piece |
| `src/life/runtime.ts` and the rest of `src/life/**` | minimal | **Animation**, **People** (Stage 3) |
| `src/rules/{decoration,urban,life}/**` | empty | **Dressing**, **Animation**, **People** (Stage 3) |
| `src/vocab/*.vocab.ts`, `src/style/<module>.ts`, `scenarios/**`, `*.test.ts` | open | whoever adds the file |

Layers (lint-enforced on `@/…` imports; import across modules with the `@/`
alias): `core, vocab ← style ← world, terrain ← resolve, rules ← scenario ←
gen, parts ← life, render ← ui, app`. Same layer and earlier layers are fine;
later ones are not.

Purity (lint-enforced): no `Math.random`, `Date`, `performance`, timers or
DOM under `src/{core,terrain,resolve,rules,gen,parts,scenario}`; no Three.js
at all under `core, style, world, terrain, resolve, rules, scenario`; `gen`
and `parts` may import `three` for maths but not `three/addons`.

## 2. Discovery: add a file, never edit a list

All discovery is `import.meta.glob(..., { eager: true })`, and it works the
same in the Vite app, under Vitest, and in the Node CLIs (which load their
TypeScript through Vite, `tools/lib/vite.mjs`). A file is found by its name;
what it exports is recognised by how it was made.

| Thing | File name | Export | Listed by |
|---|---|---|---|
| Rule | `src/rules/<part>/<ID>.<name>.rule.ts` | `export default defineRule({...})`; the file stem must equal the rule id | `allRules()` in `@/resolve/engine/discover` |
| Fact | `src/**/<name>.fact.ts` (normally `src/resolve/facts/`) | any export made with `defineFact` | `allFacts()` |
| Generator, layer | `src/gen/<kind or layer>/<name>.gen.ts` | any export made with `defineGenerator` / `defineLayer` | `allGenerators()` in `@/gen/discover` |
| Part | `src/parts/**/<name>.part.ts` | any export made with `definePart` | `allParts()` |
| Behaviour | `src/life/**/<name>.behaviour.ts` | any export made with `defineBehaviour` | `allBehaviours()` in `@/life/discover` |
| System | `src/life/**/<name>.system.ts` | any export made with `defineSystem` | `allSystems()` |
| Scenario | `scenarios/**/<name>.scenario.ts` | `export default scenario({...})`; names unique | `allScenarios()` in `@/scenario/discover` |
| Vocabulary extension | `src/vocab/<domain>.vocab.ts` | a `declare module '@/core/vocab'` block (types only) | the compiler |
| Style module | `src/style/<module>.ts` | `export const X = defineStyle('<module>', {...})` | `allStyles()` once imported |
| Unit test | `*.test.ts` beside the code, in `tests/` or `scenarios/` | | `npm test` |
| Browser test | `*.e2e.test.ts` | | `npm run e2e` |

Duplicates are errors that name both files: two rules with one id, two
generators for one kind, two parts for one type, two behaviours for one type,
two scenarios with one name. A `*.rule.ts` or `*.scenario.ts` file that
exports nothing recognisable is also an error. `tests/discovery.test.ts`
checks that discovery sees exactly the files on disk.

Each `collectX(modules)` function takes a glob result, so a test can build a
registry from its own fixtures (see `tests/fixtures/demo/index.ts`).

## 3. Commands

| Command | What it does |
|---|---|
| `npm run check` | typecheck, lint (purity and layers), every unit and browser test. Must be green. |
| `npm test` / `npm run e2e` | unit tests only (under a second) / browser tests only |
| `npm run dev` | the app. `?seed=<n>` starts a fresh island, `?scenario=<name>` loads a scenario. `/gallery/index.html` is the gallery. |
| `npm run shots -- [glob] [--time day\|dusk\|night\|dawn\|<phase>] [--size 1280x800] [--scale 1] [--out dir] [--list]` | renders each matching scenario from each of its cameras to `.context/shots/<name>-<camera>.png` (with `--time`: `<name>-<camera>-<time>.png`) in this checkout. Own server on a free port; safe in several worktrees at once. |
| `npm run inspect -- [scenario] [--cells] [--rules] [--json]` | kinds, structures and roles, supports, features, sockets, props, actors and the rule behind each, rule counts, and whether `expect()` passes. With no scenario: everything discovery found. |
| `npm run bench [-- <scenario>] [--frames 120] [--no-browser]` | design §14 numbers on `bench-2000`: both logic stages after one edit (Node and browser), geometry rebuild, frame time, draw calls. |

The glob matches a scenario's name or its path under `scenarios/`: `'R-H*'`,
`'rules/**'`, `laundry` (a plain word matches as a substring). Quote globs
so the shell does not expand them.

## 4. Grid, chance, kinds, world

**`@/core/grid`.** A cell `(x, y, z)` occupies world box `[x, x+1] × [y·CELL_H,
(y+1)·CELL_H] × [z, z+1]`. Terrain of height `h` fills `y < h`.

```ts
SIZE_X = 48, SIZE_Z = 48, SIZE_Y = 32, CELL_H = 0.8, SEA_Y = 0.4, CHUNK = 16
type CellKey = number            // x | z << 6 | y << 12; ascending = y, then z, then x
key(x, y, z), unkey(k), keyX(k), keyY(k), keyZ(k), inBounds(x, y, z), columnIndex(x, z)
type Dir4 = 0 | 1 | 2 | 3        // N(−z) E(+x) S(+z) W(−x); constants N, E, S, W; DIR4[d] = [dx, dz]
neighbor(k, d), above(k), below(k)   // NO_CELL (−1) outside the grid
opposite(d), turn(d, quarterTurns)
type EdgeKey = number            // CellKey * 2 + (0 = E side, 1 = S side)
edgeKey(x, y, z, 'E' | 'S'), unedge(e), edgeOf(cell, d), edgeCells(e)
interface Chunk { cx, cz, x0, z0, x1, z1 }; chunkOf(x, z), chunkAt(cx, cz), allChunks()
```

**`@/core/rand`.** `hash(seed, ...parts): uint32`, `rand(seed, ...parts): [0, 1)`,
`randRange(min, max, seed, ...parts)`, `randInt(min, max, seed, ...parts)`
(inclusive), `pick(items, weights | null, seed, ...parts)`. Parts are numbers
or strings; order matters. Golden values are pinned in `rand.test.ts`.

**`@/core/kinds`.** `Kind`, `PlacedKind = Kind | 'auto'`, `FloorKind`,
`EdgeKind`, `StructureKind = Kind | FloorKind`, and the table
`KINDS: Record<Kind, KindInfo>` with `solid, building, autoTarget, merge,
mergeNeedsColor, needsWalkableTop, waterOnly, keepsFloor, variedColor, ramp`.
`placedInfo(kind)` also answers for `'auto'`. `AUTO_KINDS` is the Change-tool
order. `PALETTE_SIZE = 8`.

**`@/core/world`** (types; also re-exported from `@/world/world` and
`@/terrain/terrain`): `Block`, `World`, `Edit`, `EditResult`, `Terrain`,
`MAT = { water, sand, grass, rock }`. Exactly the plan's shapes.

**Logic's seams** (stubs with final signatures):

```ts
// @/world/world
emptyWorld(seed): World
canApply(w, t, e): { ok: true } | { ok: false; reason: string }   // never throws
applyEdit(w, t, e): World                                          // new World; throws if illegal
// @/world/history       one push = one undo step
createHistory(w), pushHistory(h, w), undo(h), redo(h), canUndo(h), canRedo(h)   // h.present
// @/world/save          none of these throw
encodeTown(w): string;  decodeTown(code): { ok: true; world } | { ok: false; reason }
saveTown(storage | null, w): boolean;  loadTown(storage | null): World | null
// @/terrain/terrain
generateTerrain(seed, gen = 1): Terrain;  initialWorld(seed, t, gen = 1): World   // gen 2: terrain2.ts
terrainOf(world): Terrain        // the island a saved world stands on (World.terrainGen, absent = 1)
terrainFromHeights(seed, height: Uint8Array): Terrain;  heightAt(t, x, z)
// @/resolve/index
resolveShape(w, t, opts?): ShapePlan;  resolveDressing(shape, opts?): DressingPlan;  resolveTown(w, t, opts?)
// @/resolve/{kinds,structures,supports}   passes 2, 3, 4
resolveKinds(w, t): Map<CellKey, Kind>
buildStructures(w, t, kinds): { structures, structureAt, floorAt, edgeAt }
resolveSupports(w, t, kinds): Support[]
// @/resolve/staged      the app's edit loop (Review Focus 1)
createStagedResolver(terrain, opts?): { update(world): ShapePlan; poll(): { shape, dressing } | null;
                                        preview(world): ShapePlan; readonly shape }
```

`ResolveOptions = { rules?, skipTownWide?, maxTier?, clock? }`: `rules`
replaces the discovered rule set (unit tests), `skipTownWide` is for the
locality test, `clock` fills `RuleTrace.ms` (bench only).

## 5. The plans

`@/resolve/plan`. Plain data, never saved, never geometry.

```ts
type StructureId = number
// block structures: seq of the lowest-seq member; floor regions: FLOOR_ID_BASE + lowest cell key;
// edge-only fence/wall runs: EDGE_ID_BASE + lowest edge key
interface Structure { id; kind: StructureKind; color; seed; cells: readonly CellKey[]; edges: readonly EdgeKey[]; hash }
interface Support   { type: 'bracket' | 'pillar' | 'stilts' | 'platform'; carries: CellKey; bottomY; against?: Dir4; arcadeTo?: Dir4[] }
interface Feature   { id; type: FeatureType; structure: StructureId; cell?; dir?; edge?; region?; variant?; params?; rule }
interface Socket    { id; type: SocketType; cell; dir?; structure?; owner?; name?; rule }
type Anchor = { socket: string } | { cell: CellKey; pos: CellPos; face?: Dir4 } | { from: string; to: string }
interface Prop      { id; type: PropType; at: Anchor; variant?; params?; rule; hash }
interface Actor     { id; type: ActorType; at: Anchor | null; home?: StructureId; variant?; params?; rule; hash }
type FeatureOf<T>, PropOf<T>, ActorOf<T>      // the same records with variant and params typed for type T
isFeature(f, 'door'), isProp(p, 'lamp'), isActor(a, 'gull')    // narrow loose → typed

interface ShapePlan {
  world; terrain; kinds: ReadonlyMap<CellKey, Kind>;
  structures: ReadonlyMap<StructureId, Structure>;
  structureAt: ReadonlyMap<CellKey, StructureId>;     // the block structure in a cell
  floorAt: ReadonlyMap<CellKey, StructureId>;         // the floor region lying in a cell
  edgeAt: ReadonlyMap<EdgeKey, StructureId>;          // the run an edge piece belongs to
  supports: readonly Support[]; facts: Facts;
  roles: ReadonlyMap<StructureId, { role: Role; rule: string }>;
  tags: ReadonlyMap<StructureId, ReadonlySet<Tag>>;
  features: readonly Feature[]; featuresByStructure: ReadonlyMap<StructureId, readonly Feature[]>;
  sockets: readonly Socket[];   socketsByOwner: ReadonlyMap<string, readonly Socket[]>;
  claims: ReadonlyMap<Slot, string>; trace: readonly RuleTrace[]; hash: number;
}
interface DressingPlan { props; actors; sockets; nav: NavGraph; claims; trace; hash }
interface NavGraph { nodes: readonly NavNode[]; links: readonly NavLink[]; nodeAt: ReadonlyMap<CellKey, number> }
```

Things to know:

- **Floor regions and fence/wall runs are structures.** A path region is a
  structure of kind `'path'` (so the Ground owner writes a generator for it
  and R-G01 can give a garden a role); a fence run holds its cell pieces in
  `cells` and its edge pieces in `edges`. A cell can hold a block structure
  (`structureAt`) and a floor structure (`floorAt`) at once.
- **Ids are stable.** Feature: `<type>@<cell>[:<dir>]` (or `@e<edge>`,
  `@s<structure>r<region>`), `~2` on a repeat. Socket: `<owner id>/<name>`,
  or `<type>@<cell>[:<dir>]` with no owner. Prop and actor: `<rule
  id>@<anchor cell>[:<candidate key>][#n]`. Behaviour state follows these ids.
- **Sockets get their frame** from the part that draws their owner
  (`PartOutput.anchors[socket.name ?? socket.type]`), else from a fallback:
  half-way up the cell face (with `dir`) or the top centre of the cell.
  `createLayout` (`@/gen/layout`) is the one implementation of this.
- **`Structure.hash` covers what a generator may read**: the structure
  (kind, colour, seed, cells, edges), each cell's `rot`, floor and six face
  neighbours (kind, colour, same structure or not), the terrain height of
  its own and four side columns, the supports that carry it, and its role,
  tags, features and sockets. A generator must not read anything else: let a
  rule read the wider town and pin the answer on the structure as a tag or
  feature. Equal hash ⇒ identical geometry ⇒ no rebuild.
- **`Prop.hash` / `Actor.hash`** cover content, not the id: same id and new
  hash means "changed in place".

## 6. Vocabulary

`@/core/vocab`. Every feature, prop and actor type with its variants and
params, plus socket types, roles (all tiers) and tags. Rule code and part
code both take their types from it, so they cannot disagree:
`out.feature({ type: 'door', variant: 'gable' })` and a chimney part reading
`item.params.garments` both fail to compile (`tests/vocab.types.test.ts`).

Each registry is one interface with three key forms:

```ts
export interface FeatureVocab {
  'door': true;            // a type
  'door/double': true;     // a variant of it
  'door.steps': number;    // a param of it (always optional for the emitter; the part applies the default)
}
```

Registries: `FeatureVocab`, `PropVocab`, `ActorVocab`, `SocketVocab`,
`RoleVocab` (role → the kind it applies to), `TagVocab`. Derived types:
`FeatureType`, `FeatureVariant<T>`, `FeatureParams<T>` (same for Prop and
Actor), `SocketType`, `Role`, `RolesOf<Kind>`, `Tag`. Read the file for the
tier-1 list: each entry says which rule emits it, where it sits, and which
sockets it owns.

**To extend it** (tier 2 and 3, discovery rounds), add your own file; do not
edit `vocab.ts`:

```ts
// src/vocab/houses.vocab.ts
import '@/core/vocab';
declare module '@/core/vocab' {
  interface FeatureVocab { 'dormer': true; 'dormer/gable': true; 'dormer.width': number;
                           'window/oriel': true }      // a new variant of an existing type
  interface PropVocab    { 'bench': true; 'bench/stone': true }
  interface SocketVocab  { 'seat-back': true }
  interface RoleVocab    { 'town-hall': 'house' }
}
```

Two files may add different keys freely. Two files adding the same key must
agree on its value type or the typecheck fails.

**Frames.** A part builds in its own local space; the placer supplies the
frame (`@/gen/frames`). Always +Y up. Feature with `cell` + `dir`: origin at
the bottom centre of that cell face, +Z out of the wall, +X to the viewer's
right facing the wall (`faceFrame`). Feature with `cell` only: centre of the
cell's floor, world axes (`cellFrame`). Prop or actor at a cell slot: on the
floor at the slot, +Z toward `face`, else toward the cell centre
(`slotFrame`; slots sit 0.35 from the centre). At a socket: the socket's
frame (+Z away from the host). On a line: origin at `from`, +X toward `to`,
`ctx.span` = its length.

## 7. Facts

`@/resolve/facts/api`. A fact is a pure function of `Facts`, computed on
first use and cached for that resolve.

```ts
interface Facts { world; terrain; seed; kinds; structures; structureAt; floorAt; edgeAt; supports;
                  shape: ShapePlan;     // throws during the shape stage
                  shapeReady: boolean;
                  get<T>(fact: Fact<T>): T }
defineFact<T>(name: string, compute: (f: Facts) => T): Fact<T>     // callable: fact(facts) === facts.get(fact)
```

Adding one (`src/resolve/facts/town.fact.ts` is this, in full):

```ts
import { defineFact } from './api';
export const townFacts = defineFact<TownFacts>('townFacts', (f) => {
  const cellsByKind = new Map<StructureKind, number>();
  for (const [, kind] of f.kinds) cellsByKind.set(kind, (cellsByKind.get(kind) ?? 0) + 1);
  return { cellsByKind, /* … */ };
});
// in a rule:   const town = townFacts(ctx.facts);
```

A fact may call other facts (a cycle throws). A fact must not read rule
output except through `f.shape`, which exists only once the shape stage has
finished; such a fact serves decoration, urban and life rules only.
`plan-index.fact.ts` has three of those ready: `socketsOfType(facts, type)`,
`featuresOfType(facts, type)`, `socketById(facts, id)`. Roles and joinery
rules read `ctx.plan` instead (it is being filled in as they run).

The Logic owner ships the core facts, one file each: `cellInfo`, `facades`,
`roofRegions`, `streets`, `plazas`, `gardens`, `courtyards`, `alleys`,
`shelteredWater`, `wildGrass`, `leftovers`, `verges`, `distToWater`,
`distToFloor` (and extends `townFacts`). Their shapes are Logic's to define;
later owners read those files.

## 8. Rules and the engine

`@/resolve/engine/api`.

```ts
type RulePart = 'roles' | 'joinery' | 'decoration' | 'urban' | 'life'
type Candidate<D> = { anchor: CellKey; structure?: StructureId; key?: string | number; data: D }  // data optional if D is undefined
interface RuleContext  { facts: Facts; plan: ShapePlan; dressing: DressingDraft | null; seed: number }
interface ApplyContext extends RuleContext { rand(...parts): number; pick(items, weights | null, ...parts) }
interface DressingDraft { props; actors; sockets; nav: NavGraph | null }   // what dressing has produced so far
interface RuleOut {
  role(s, role: Role): void;  tag(s, tag: Tag): void;                 // shape stage only
  feature<T>(f: Omit<FeatureOf<T>, 'id' | 'rule'>): string;           // shape stage only; returns the feature id
  socket(s: Omit<Socket, 'id' | 'rule'> & { id?: string }): string;   // either stage; returns the socket id
  prop<T>(p: Omit<PropOf<T>, 'id' | 'rule' | 'hash'>): string;        // dressing stage only
  actor<T>(a: Omit<ActorOf<T>, 'id' | 'rule' | 'hash'>): string;      // dressing stage only
}
defineRule<D>({ id, part, tier: 1 | 2 | 3, priority, townWide?, about?, chance?,
  find(ctx: RuleContext): Candidate<D>[],
  claims?(c, ctx: RuleContext): Slot[],
  apply(c, out: RuleOut, ctx: ApplyContext): void }): Rule
slot.floor(cell, pos), slot.cell(cell) /* all nine */, slot.socket(id), slot.line(a, b), slot.role(s), slot.custom(ns, ...parts)
```

How rules run (pinned by `src/resolve/engine/run.test.ts`):

1. Parts in order: `roles`, `joinery` inside `resolveShape`; `decoration`,
   `urban`, then the walking graph is built, then `life`, inside
   `resolveDressing`.
2. Within a part: priority descending, then id ascending. Priority is global
   within the part.
3. A rule's candidates run in ascending `anchor` order; ties keep `find()`'s
   order.
4. Per candidate: the chance roll `rand(seed, rule.id, anchor[, key]) <
   chance`; then the claims check (skip if any slot is taken, in this stage
   or by the shape stage); then all its slots are claimed and `apply` runs.
5. A rule sees everything earlier rules emitted: `ctx.plan.roles`,
   `.features`, `.sockets`; in the dressing stage `ctx.dressing.props` and
   the rest. Structure hashes are not set until the shape stage ends.
6. A role rule whose candidate names a `structure` claims
   `slot.role(structure)` automatically, so each structure gets one role and
   later role rules skip it. To give a second structure its role too (chapel
   and steeple), list `slot.role(other)` in `claims` and call `out.role`
   twice. `out.role` on a structure that already has a role throws.
7. Emitting into the wrong stage, anchoring to a socket nobody declared, or
   two candidates of one rule sharing anchor and key while emitting props:
   all throw, with the rule id and cell in the message.

**Priority convention** (so parallel owners do not collide; "first match
wins" lists in the catalogue become descending priorities):

| Part | Priority |
|---|---|
| roles: houses R-H (and U11) | 9000 + (100 − catalogue number) × 10, so R-H01 = 9990, R-H15 = 9850 |
| roles: towers R-T | 8000 + … |
| roles: lighthouse, windmill | 7000 + … |
| roles: arches R-A | 6000 + … |
| roles: marble R-M | 5000 + … |
| roles: docks R-D | 4000 + … |
| roles: trees, fountain, stall, garden, fence, wall | 3000 + … |
| joinery, decoration, urban, life | 1000 − catalogue number × 10, so J04 = 960 runs before J09 = 910 |

The bands order the families the way the catalogue needs: R-H01 sets a
tower's role before any tower rule runs; arch roles exist before R-M02
(gatehouse) looks for a gateway.

### Adding a rule, with its fixture and test

A rule file (this one is `tests/fixtures/demo/rules/D-X01.demo-lamp.rule.ts`;
a real one lives at `src/rules/decoration/<ID>.<name>.rule.ts`):

```ts
import { neighbor, NO_CELL } from '@/core/grid';
import { featuresOfType } from '@/resolve/facts/plan-index.fact';
import { defineRule, slot } from '@/resolve/engine/api';

export default defineRule({
  id: 'D-X01.demo-lamp', part: 'decoration', tier: 1, priority: 50, chance: 0.5,
  about: 'Reads: door features. Claims: the centre floor slot in front of the door.',
  find({ facts }) {
    return featuresOfType(facts, 'door')
      .map((door) => ({ door, front: neighbor(door.cell!, door.dir!) }))
      .filter(({ front }) => front !== NO_CELL)
      .map(({ door, front }) => ({ anchor: front, structure: door.structure }));
  },
  claims(c) { return [slot.floor(c.anchor, 'c')]; },
  apply(c, out, { rand }) {
    const lamp = out.prop({ type: 'lamp', variant: rand('arms') < 0.2 ? 'four-arm' : 'post', at: { cell: c.anchor, pos: 'c' } });
    out.socket({ type: 'lamp-head', owner: lamp, cell: c.anchor });
  },
});
```

A shape-stage rule emits features and their sockets
(`J-X01.demo-door.rule.ts`): `const door = out.feature({ type: 'door',
structure, cell, dir: S, variant: 'plain', params: { main: 1 } });
out.socket({ type: 'door', owner: door, cell, dir: S, structure });`

Its fixture is a scenario with an `expect`; that is also its test, because
`scenarios/scenarios.test.ts` runs every scenario (this one is exercised in
`src/scenario/scenario.test.ts`):

```ts
// scenarios/rules/D-X01.demo-lamp.scenario.ts
import { scenario } from '@/scenario';
export default scenario({
  name: 'D-X01.demo-lamp', seed: 7,
  build(b) { for (let i = 0; i < 8; i++) b.house(10 + i * 2, 10); },
  cameras: [{ yaw: 45, pitch: 32, zoom: 3, target: [17, 1, 10] }],
  expect(plan, dressing, check) {
    check.ok(check.applied('D-X01.demo-lamp') > 0, 'some doors get a lamp');
    check.hasProp({ type: 'lamp', rule: 'D-X01.demo-lamp' });
    check.noProp({ type: 'lamp', at: [10, 1, 10] });   // never inside a house
  },
});
```

Then `npm test`, `npm run inspect -- D-X01.demo-lamp`, `npm run shots --
D-X01.demo-lamp`. For a unit test that isolates the rule, pass the rules
yourself: `resolveTown(world, terrain, { rules: [myRule, ...itsPrerequisites] })`.

## 9. MeshBuilder

`@/gen/mesh`. Triangle soup, world units, front faces counter-clockwise,
plain typed arrays.

```ts
interface MeshData { position: Float32Array; normal: Float32Array; color: Uint8Array /* rgb, sRGB */;
                     pattern: Uint8Array; inkId: Uint16Array; edge: Float32Array; sway: Float32Array }
new MeshBuilder({ ink?: number | string })    // ink namespaces the groups: pass structure.id or the item id
// state (chainable)
.setColor(0xrrggbb | '#rrggbb' | [r, g, b])  .setPattern(PATTERN.x)  .setInk(group)  .setInkId(raw)  .inkOf(group)
.setEdge(distance)  .setSway(0..1 | (x, y, z) => number)  .with({ color, pattern, ink, inkId, edge, sway }, fn)
// transform stack (chainable)
.push(m?) .pop() .at(m, fn) .transform(m) .translate(x, y, z) .rotateX/Y/Z(rad) .scale(x, y?, z?) .resetTransform()
// primitives (chainable)
.tri(a, b, c, opts?)  .quad(a, b, c, d, opts?)  .polygon(points, opts?)      // opts: { colors, edge, normals } per vertex
.box(min, max, { skip?: BoxFace[], only?: BoxFace[], bevelTop? })            // BoxFace: 'top' | 'bottom' | 'n' | 'e' | 's' | 'w'
.boxAt(bottomCenter, [w, h, d], opts?)
.extrude(outlineXZ, y0, y1, { cap?: 'both' | 'top' | 'bottom' | 'none', smooth? })
.lathe(profile /* [radius, y] bottom to top */, { segments?, smooth?, capTop?, capBottom?, start?, sweep? })
.add(mesh | builder, m?)                       // append, transformed; ink ids kept
.build(): MeshData;  .vertexCount;  .triangleCount
mergeMeshes(meshes), transformMesh(mesh, m), emptyMesh(), meshBounds(mesh), triangleCount(mesh), triangulate(points2d)
PATTERN = { none, grass, shingles, earth, stone, paving, planks, glass, marble, sand, rock, water, plaster, brick,
            cobbles, thatch, timber, leaves, bark, stripes, crops, cloth, metal, dirt, foam }   // 1–8 are the spike's
EDGE_FAR = 9
```

- **Ink.** The renderer inks a line wherever the ink id changes. Everything
  emitted under one `setInk(group)` is one surface with no seam inside it;
  the same group name in another builder is a different id, because the
  builder's `ink` option namespaces it. `setInkId(host.inkOf('walls'))` lets
  a part join its host's surface.
- **Edge.** `edge` is the distance from a marked edge, for bevel lines;
  `box(..., { bevelTop: true })` sets it on the sides (the marble bevel).
- **Sway.** 0 is rigid, 1 moves fully with the wind in the vertex shader.
  This is how baked geometry (trees, awnings) moves without being an actor.
- Mirrored and non-uniformly scaled transforms keep normals and winding
  right. `@/core/mat4` has the matrix kit (column-major, as Three.js).
- **Checks for your tests** (`@/gen/checks`): `validateMesh(mesh)` (`[]` if
  sound), `findDuplicateFaces(mesh)` (0 means no doubled walls between merged
  cells), `inkGroups(mesh)` (ink id → triangles), `triangleCount(mesh)`.

## 10. Generators, layers and parts

`@/gen/api`. All pure. Generator and layer output is in **world space**; a
part's mesh is in its **local frame** (section 6).

```ts
defineGenerator({ kind: StructureKind, build(s: Structure, plan, parts: PartRegistry): GenOutput })
defineLayer({ layer: string, build(chunk: Chunk, plan, parts): GenOutput, hash(chunk, plan): number })
interface GenOutput { mesh: MeshData; anchors: Record<string /* socket id */, Mat4Like /* world */> }

definePart({ feature: T, build(item: FeatureOf<T>, ctx: PartContext): PartOutput })
definePart({ prop: T,    build(item: PropOf<T>,    ctx): PartOutput })
definePart({ actor: T,   build(item: ActorOf<T>,   ctx): PartOutput })
interface PartOutput  { mesh: MeshData; anchors?: Record<string /* socket name */, Mat4Like /* local */>; animated?: boolean }
interface PartContext { plan; structure?; seed; rand(...parts); span; mesh(): MeshBuilder; parts: PartRegistry }
interface PartRegistry { has(category, type); list(); feature(item, env); prop(item, env); actor(item, env) }   // env: { plan, structure?, span? }

placeFeature(b, anchors, feature, atWorldFrame, { plan, structure, parts })
placeFeatures(b, anchors, structure, plan, parts, frame?: (f) => Mat4Like | null | undefined)
```

- One generator per structure kind (blocks, floor regions, fence and wall
  runs). A **layer** draws what is not a structure, one mesh per 16 × 16
  chunk: terrain and sea (Look), generated supports (Monuments). Its `hash`
  must change exactly when its output for that chunk would.
- **Placeholders.** A kind with no generator draws as a coloured box per
  cell; a type with no part draws as a small marker (`@/gen/fallback`). They
  vanish when the real file exists; nothing else changes. So rules can ship
  before parts, and parts before generators.
- A generator draws its features with `placeFeatures`, which also fills
  `anchors` with the world frame of every socket those features own. Give
  `frame` to place a feature somewhere other than its standard frame (a
  window on a bowed wall), `null` to skip one, or to place region features
  (roofs), which have no standard frame.
- Anything that animates is a prop or an actor (an instance), never a
  feature; features are baked into the structure's mesh.

A feature part (`tests/fixtures/demo/parts/chimney.part.ts`):

```ts
export default definePart({
  feature: 'chimney',
  build(item, ctx) {
    const height = item.params?.height ?? (item.variant === 'tall-flue' ? 0.9 : 0.4);
    const b = ctx.mesh();                                   // ink groups belong to this item
    b.setColor('#d98a6c').setPattern(PATTERN.brick).setInk('stack');
    b.boxAt([0.2, CELL_H, 0.1], [0.2, height, 0.2]);
    return { mesh: b.build(), anchors: { 'chimney-top': translation(0.2, CELL_H + height, 0.1) } };
  },
});
```

A generator (`tests/fixtures/demo/gen/pillar.gen.ts`): a stack of cells as
one shaft, three ink groups, features placed, sockets reported:

```ts
export default defineGenerator({
  kind: 'pillar',
  build(s, plan, parts) {
    const b = new MeshBuilder({ ink: s.id });
    const anchors: Record<string, Mat4Like> = {};
    const bottom = s.cells[0]!;
    const height = s.cells.length * CELL_H;
    b.setColor(rampColor('pillar', s.color)).setPattern(PATTERN.marble);
    b.at(translation(keyX(bottom) + 0.5, keyY(bottom) * CELL_H, keyZ(bottom) + 0.5), () => {
      b.setInk('base').boxAt([0, 0, 0], [0.5, 0.1, 0.5]);
      b.setInk('shaft').lathe([[0.17, 0.1], [0.15, height - 0.12]], { segments: 10 });
      b.setInk('capital').lathe([[0.15, height - 0.12], [0.26, height - 0.04], [0.26, height]], { segments: 10, capTop: true });
    });
    placeFeatures(b, anchors, s, plan, parts);
    return { mesh: b.build(), anchors };
  },
});
```

Its geometry test (`src/gen/gen.test.ts`): `validateMesh` is empty,
`findDuplicateFaces` is 0, `inkGroups(mesh).size` is 3, `triangleCount` is
under budget. A layer: `src/gen/terrain/terrain.gen.ts`.

**Where things are** (`@/gen/layout`): `createLayout({ shape, dressing,
anchors, propOutput })` returns `{ socket(id): Mat4 | null, item(id): {
frame, span } | null }` for every socket, prop and actor. The renderer and
life both use it.

## 11. Life

`@/life/api`. The only code that reads the clock, and it never touches
Three.js: it moves things through a `LifeStage` the renderer implements.

```ts
interface Signals {
  readonly time: { phase; part: 'day' | 'dusk' | 'night' | 'dawn'; isDay; isDusk; isNight; isDawn; light /* 1 → 0 */; seconds };
  wind(x, z): { dirX; dirZ; strength };
  on<E extends keyof SignalEvents>(event: E, fn: (payload: SignalEvents[E]) => void): () => void;   // returns unsubscribe
}
interface SignalEvents { blockLanded: CellKey; blockRemoved: CellKey; personPassed: CellKey }   // extend by module augmentation
interface SignalsDriver extends Signals { advance(dt): number /* clamped to 0.1 s */; hold('run' | DayPart); holding; setPhase(p); emit(event, payload) }
createSignals(seed): SignalsDriver                     // @/life/signals (Look)

interface LifeStage {                                  // implemented by the renderer: TownView.stage
  instance(itemId): InstanceHandle | null;             // the drawn prop or actor
  spawn({ prop | actor, variant?, params? }, at): InstanceHandle;   // an extra instance: a smoke puff, a flock member
  spawnMesh(mesh: MeshData, at): InstanceHandle;       // any mesh: a removed piece puffing away
  liftStructure(id): InstanceHandle | null;            // out of its baked chunk, to bounce it; release() bakes it back
  socket(id): Mat4Like | null;
}
interface InstanceHandle { readonly base: Mat4Like; setMatrix(m); setVisible(v); setParams(a, b?, c?, d?); release() }

defineBehaviour({ prop: T | actor: T,
  create(item, ctx: LifeContext): S,
  update(state: S, dt, signals, ctx): void,
  changed?(state, ctx): void,       // same id, new content
  dispose?(state, ctx): void })
interface LifeContext { item; seed; rand(...parts); shape; dressing; instance: InstanceHandle; stage: LifeStage }

defineSystem({ id, order?, create(ctx): S, sync?(state, next: Town, prev: Town | null, ctx), update(state, dt, signals, ctx), dispose? })
createLife(stage, signals, opts?): { sync(town: { shape, dressing | null }), update(dt), dispose() }   // @/life/runtime
```

- **Behaviours** are per item. State lives as long as the item's id does,
  across re-resolves; between an edit and its dressing nothing is torn down.
- **Systems** are town-wide: landing bounce, pop-in order, the crowd.
  `sync` gets every town change with the town before it, so it can diff
  structure hashes and prop ids. Systems update before behaviours. Animation
  and People each add system files without touching `runtime.ts`.
- `dt` is in seconds and never exceeds `TIME.maxStep` (0.1).

A behaviour (`tests/fixtures/demo/life/smoke.behaviour.ts`):

```ts
export default defineBehaviour({
  actor: 'smoke',
  create(_item, ctx) { return { age: ctx.rand('phase') * 3 }; },
  update(state, dt, signals, ctx) {
    state.age += dt;
    const lean = signals.wind(0, 0).strength * 0.2;
    ctx.instance.setMatrix(multiply(ctx.instance.base, translation(lean * state.age, (state.age % 3) * 0.3, 0)));
  },
});
```

A system: `tests/fixtures/demo/life/census.system.ts`. Tests drive both with
a fake stage and no renderer (`src/life/life.test.ts`).

## 12. The view and the app seams

`@/render/api` (types) and `createTownView(canvas, opts?)` in
`@/render/index` (Look's implementation).

```ts
interface CameraPose { yaw; pitch; zoom; target: [x, level, z] }   // degrees; yaw 0 looks north, 45 is the default view;
                                                                   // zoom 1 fits the 48-column map in the view height
interface TownView {
  canvas; stage: LifeStage;
  setTown(shape, dressing | null); setDressing(dressing); setGhost(ghost | null);
  getCamera(); setCamera(partialPose); orbit(dYaw, dPitch); pan(dxPx, dyPx); zoomBy(factor, x?, y?);
  screenToRay(x, y): { origin, dir }; worldToScreen(p): [x, y];
  resize(width, height); render(signals); stats(): { drawCalls; triangles; rebuildMs }; dispose();
}
interface Ghost { plan: ShapePlan; show: StructureId[]; shimmer?: CellKey[]; refuse?: CellKey }
```

Who does what: the **view** owns the camera's state and maths; the **UI**
owns input and calls `orbit`, `pan`, `zoomBy`. Targeting is pure and belongs
to the UI: `pickCell(view.screenToRay(x, y), world, terrain)` in `@/ui/pick`
returns `{ hit: 'terrain' | 'block' | 'water', cell, normal, target, from,
point }`. The frame loop (`src/app/main.ts`): `dt = signals.advance(elapsed)`
→ `resolver.poll()` → `view.setDressing` and `life.sync` when dressing
arrives → `life.update(dt)` → `view.render(signals)`. On an edit:
`resolver.update(world)` → `view.setTown(shape, null)` → `life.sync` →
`signals.emit('blockLanded', cell)`. Call `view.setTown` before `life.sync`,
so the instances exist.

The screenshot and benchmark page (`tools/shot/`) uses only `TownView`,
`createSignals`, `createLife` and scenarios, so it keeps working whatever
the app and the renderer become. `window.__lc` (`view`, `signals`, `edit`,
`world()`, `terrain()`, `shape()`) is the app's debug handle for browser
tests; keep it.

## 13. Scenarios

`@/scenario`. A town built in code, with cameras and assertions. Used by
tests, `shots`, `inspect`, `bench`, the gallery and discovery rounds.

```ts
scenario({ name, seed, about?,
  terrain?: 'flat' | 'generated' | (t: TerrainBuilder) => void,   // default 'flat': height 1 on columns 4–43
  terrainGen?: 1 | 2 /* with 'generated'; default 1 */, startingTrees?: boolean, rules?: Rule[], time?: 'day' | 'dusk' | 'night' | 'dawn' | phase,
  build(b: TownBuilder): void,
  cameras?: { name?, yaw, pitch, zoom, target: [x, level, z], time? }[],   // default: one camera framing what was built
  expect?(plan: ShapePlan, dressing: DressingPlan, check: Check): void })

TownBuilder: onTerrain(x, z) /* first free level */, ground(x, z), floorLevel(x, z), cell(x, y, z)
  block(kind, x, y, z, { color?, rot? })   put(kind, x, z, opts?)   stack(kind, x, z, { floors?, w?, d?, color?, rot? })
  house(x, z, opts?)  tower(x, z, opts?)  auto(x, z, opts?)  fill(kind, x0, z0, x1, z1, { floors?, color? })
  floor(kind, x0, z0, x1?, z1?)  path(x0, z0, x1?, z1?) | path([x, z], [x, z], …)  plaza(…)  garden(…)
  fenceEdge(x, z, 'N' | 'E' | 'S' | 'W', kind?, y?)  wallEdge(…)  fenceAround(x0, z0, x1, z1, kind?)  edgeAt(x, z, side, y?)
  erase(x, y, z)  eraseFloor(x, z)  setKind(x, y, z, kind)  paint(x, y, z, color)  edit(e: Edit)   // everything is an Edit
TerrainBuilder: flat(h?)  set(x, z, h)  rect(x0, z0, x1, z1, h)  disc(cx, cz, r, h)  water(x0, z0, x1, z1)

Check: ok(cond, message)  equal(actual, expected, what?)  kind(x, y, z, kind)  role(x, y, z, role)  hasTag(x, y, z, tag)
  structure(x, y, z)  floorStructure(x, y, z)  sameStructure(a, b)  differentStructures(a, b)
  features(q?)  hasFeature(q, min?)  noFeature(q)      // q: { type?, variant?, at?: [x, y, z], on?: [x, y, z], dir?, rule? }
  sockets(q?)  hasSocket(q, min?)  props(q?)  hasProp(q, min?)  noProp(q)  actors(q?)  hasActor(q, min?)  noActor(q)
  applied(ruleId): number
```

- Every builder method goes through `canApply` / `applyEdit`, so a scenario
  holds only what a player could build; an illegal step throws with the
  scenario, the step and the reason.
- Use `'flat'` or your own terrain for fixtures: they never move.
  `'generated'` follows the real generator and will shift when it changes.
- `check` throws plain errors: scenario files never import a test framework
  (they also load in the browser).
- **`rules`** are extra rules that exist only in this scenario. This is how
  a gallery entry shows a part in isolation, whatever the real rules decide:
  write a small rule that emits exactly the features, props or actors you
  want to look at. `scenarios/examples/pipeline-demo.scenario.ts` does the
  whole chain this way (features with sockets, a prop on a line, props at
  slots, actors) in one file.

Examples: `scenarios/examples/hello-town.scenario.ts` (flat ground, two
cameras), `harbour-sketch.scenario.ts` (hand-made terrain, a camera at
dusk), `pipeline-demo.scenario.ts`, `scenarios/bench/bench-2000.scenario.ts`.

## 14. Style, tests, lint

**Style** (`@/core/style`): every tunable number and colour lives in
`src/style/<module>.ts`.

```ts
export const AUTO = defineStyle('auto', { spanMax: 6, towerRun: 3 }, { spanMax: [1, 12, 1] });   // values, slider ranges
AUTO.spanMax                                   // read it directly; it is the live object
allStyles(), setStyle(name, key, value), resetStyles(), styleVersion()   // the gallery and dev panel
```

`styleVersion()` goes up on every change; renderers fold it into geometry
cache keys. Existing modules: `palette` (`PALETTE`, `RAMPS`, `rampColor`),
`auto`, `time`.

**Unit tests** sit beside the code as `*.test.ts`. **Browser tests** are
`*.e2e.test.ts` and use `tests/helpers/browser.ts`, which gives you a dev
server on a free port and headless Chromium with WebGL, inside Vitest:

```ts
const app = await startApp();                                  // beforeAll
const { page, errors } = await app.open('/?seed=1', { width: 390, height: 844, hasTouch: true, isMobile: true });
await page.mouse.click(640, 400);
await page.waitForFunction('window.__lc.world().blocks.size === 1');
await app.close();                                             // afterAll
```

`tests/e2e/interface.e2e.test.ts` is the worked example (place, stack, erase,
undo, drag does not place). **Lint** is `eslint.config.js`; `tests/lint.test.ts`
shows what each directory may and may not do.

**Words the player reads are in nine languages** (`@/i18n`, since 2026-11-25:
English, Simplified Chinese, Spanish, French, Brazilian Portuguese, Japanese,
Korean; German and Turkish since 2026-11-26). Any new or reworded line, in the same change:

```ts
t('Grow a town')                                    // never a bare string in el() text, title, aria-label, a toast
t('Open {name}', { name })                          // details by name, never glued: no 'Sound: ' + state
t({ one: '{n} house', other: '{n} houses' }, { n }) // counts
phrase('a {kind} needs firm ground', { kind })      // the core (src/world): English kept, shown translated by say()
```

Call `t()` where the line is shown, never at module load. Then `npm run translate`
lists the missing lines per language: write each translation in
`src/i18n/locales/<lang>.json` (plain, short, the game's voice; check it by
translating it back to English). `tools/translate/lines.test.ts` fails while
any line is missing or English skips `t()`.

## 15. Deviations from plan section 4

Substance is kept throughout. Each change is here with its reason.

1. **Types that Logic's files re-export live in `src/core/world.ts`.**
   `World`, `Block`, `Edit`, `Terrain` are frozen contracts, but
   `src/world/**` and `src/terrain/**` belong to Logic. `import type { World }
   from '@/world/world'` still works.
2. **`resolveShape` / `resolveDressing` are in `src/resolve/index.ts`**, not
   `plan.ts`, for the same reason (frozen types, owned behaviour). They take
   an optional `ResolveOptions`.
3. **Rules, parts, generators, behaviours and scenarios are returned, not
   registered.** `defineRule(...)` returns the rule and the file exports it;
   discovery collects exports. Side-effect registration breaks under hot
   reload, makes duplicate ids hard to attribute, and stops a test from
   running the engine with a chosen rule set.
4. **`find(ctx)`, `claims(c, ctx)`, `apply(c, out, ctx)`** take one context
   `{ facts, plan, dressing, seed }` instead of `(facts, plan)`. Dressing-
   stage rules need the props, sockets and walking graph produced so far,
   which the sketch had no way to pass; a context object also lets the
   contract grow without changing signatures. `apply`'s context adds
   per-candidate `rand` and `pick`.
5. **`Candidate` gains `key` and typed `data`.** Several candidates often
   share one anchor cell (one per facade side, per facing pair); `key` gives
   each its own chance roll and its own stable ids.
6. **`RuleOut` methods return ids**, and `role` / `tag` / `type` are typed
   from the vocabulary. A rule needs a feature's id to make a socket it
   owns, and a socket's id to anchor a prop.
7. **Floor regions and fence/wall runs are structures.** `Structure.kind` is
   `StructureKind = Kind | FloorKind`, `Structure` gains `edges`, `ShapePlan`
   gains `floorAt` and `edgeAt`, and structure ids have three ranges. The
   catalogue gives roles to garden regions (R-G01) and to fence and wall
   runs (R-E01, R-E02), and the Ground owner needs generators for paths,
   plazas, gardens and edge pieces; with block-only structures none of that
   had a home.
8. **`Feature` gains `id` and `edge`; `Socket` gains `owner`, `name`,
   `rule`; `Prop` and `Actor` gain `hash`; `Actor` gains `variant`; the cell
   form of `Anchor` gains `face`.** Ids and owners are how a socket finds its
   exact frame in the part that draws its owner. Hashes let the renderer and
   life tell "new" from "changed". `face` lets a centre-slot prop face a
   direction. `Feature.edge` is for gates in edge-piece runs (J20).
9. **Loose and typed records.** Plans store `Feature` / `Prop` / `Actor`
   with `variant?: string`; rule emission and part code use `FeatureOf<T>`
   and friends, typed from the vocabulary. One generic type could not be
   both a list element and exactly typed.
10. **`ShapePlan` gains `featuresByStructure`, `socketsByOwner`, `claims`,
    `trace`, `hash`; `DressingPlan` gains `sockets`, `claims`, `trace`.**
    Generators need a structure's features without scanning; dressing-stage
    rules declare sockets too (lamp heads, perches, seats); `inspect` and
    `bench` need the trace.
11. **`NavGraph` is defined** (`nodes`, `links`, `nodeAt`); the sketch left
    it open. Provisional: see section 16.
12. **`Facts` gains `seed`, `structureAt`, `floorAt`, `edgeAt`, `supports`,
    `shape`, `shapeReady`.** `shape` lets a cached fact index the finished
    shape plan for dressing-stage rules, and throws earlier so a fact cannot
    silently read half-built roles.
13. **`MeshData` gains `sway`** (per-vertex wind weight). Awnings and trees
    are baked geometry that must move with the wind (L04, L05); without a
    per-vertex weight the shader has nothing to go on, and `MeshData` is
    frozen after this stage.
14. **`defineLayer`** is new: per-chunk generators for what is not a
    structure (terrain, sea, generated supports). `defineGenerator` covered
    structures only, and Monuments must be able to draw supports without
    editing the renderer.
15. **`definePart` and `defineBehaviour` are keyed `{ feature | prop |
    actor: type }`** instead of `{ type }`. The three vocabularies are
    separate namespaces (`door` is a feature type and a socket type; a lamp
    could be both a feature and a prop), and the key tells the compiler which
    typed item `build` receives.
16. **`PartContext`, `PartRegistry`, `LifeContext`, `Mat4Like` are defined**;
    `GenOutput.anchors` is keyed by socket id in world space, `PartOutput.anchors`
    by socket name in local space. Missing generators and parts fall back to
    placeholders instead of throwing.
17. **`Signals`**: `time` gains `part`, `isDawn`, `light`, `seconds`; `on`
    returns an unsubscribe function and is typed by the mergeable
    `SignalEvents`. `SignalsDriver` (advance, hold, setPhase, emit) is the
    app's side of it. Behaviours need elapsed time and dawn (L02, L18), and
    the design asks for new events to be addable by name.
18. **`defineBehaviour`** has typed state `S` instead of `unknown`, plus
    optional `changed` and `dispose`. **`defineSystem`** is new: town-wide
    motion (landing bounce, pop-in, the crowd) is not one item's behaviour,
    and it lets Animation and People work in `src/life` in parallel.
19. **`LifeStage` / `InstanceHandle`** are new: the seam between life and
    the renderer, which the sketch did not have. **`TownView`**
    (`src/render/api.ts`) is new: the seam between the renderer and the app,
    the UI, the screenshot page and the benchmark.
20. **New stub seams for Stage 1's parallel owners**: `src/world/history.ts`,
    `src/world/save.ts`, `src/resolve/staged.ts`, `src/ui/pick.ts`,
    `emptyWorld`, `terrainFromHeights`. Interface builds undo, share and the
    edit loop against these while Logic fills them in.
21. **Scenarios**: `expect` receives a third argument `check`; `terrain`
    defaults to `'flat'`; `rules`, `time`, named cameras and `about` are
    added. Fixtures on generated terrain would all break the day the real
    generator lands.
22. **`KindInfo` gains `waterOnly`, `variedColor`, `ramp`**; `grid.ts` gains
    `SEA_Y`, `CHUNK`, `NO_CELL` and neighbour, edge and chunk helpers;
    `rand.ts` gains `randInt`, `randRange`, `hashCombine`, `hashString`.
    All read straight off design sections 6 and 7.
23. **The frozen list is longer** than plan section 2 rule 4: it adds
    `src/gen/{api,frames,layout,checks}.ts`, `src/render/api.ts`,
    `src/scenario/**`, `tools/**`, `tests/helpers/**` and the config files.
24. **The layer order** adds `style` (after `core`) and `scenario` (after
    `resolve, rules`), and the purity ban also covers `core`, `terrain` and
    `scenario`.
25. **TypeScript is pinned to 6.0**, not 7: `typescript-eslint` 8 does not
    support the TypeScript 7 compiler API yet.

## 16. Thin spots

- **`NavGraph`** is the least-tested contract: nothing builds or walks one
  yet. If People needs another shape (adjacency arrays, typed costs), that is
  a contract request worth granting early in Stage 3.
- **`LifeStage` and `TownView`** have one implementation, the stub. Look
  should read them first and raise anything the real renderer cannot do
  cheaply (`liftStructure` and `setParams` are the likely ones).
- **`PATTERN`** ids beyond the spike's eight are names only until Look's
  shader draws them. A new pattern is a contract request.
- **Gallery entries**: the gallery shell lists what discovery found. The
  intended convention is that a gallery entry is a scenario (with its own
  `rules` where needed) under `scenarios/gallery/**`, so `npm run shots`
  renders it; Interface confirms or changes this when building the gallery.
- **The structure hash's neighbourhood** (six face neighbours, four side
  columns) is Stage 0's reading of "what a generator needs". If a generator
  must look further, widen `hashStructure` rather than reading outside it.
