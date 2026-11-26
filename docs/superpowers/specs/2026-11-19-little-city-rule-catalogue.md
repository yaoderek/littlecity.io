# Little City — rule catalogue (v1)

Companion to the [design](2026-11-19-little-city-design.md). Read that first;
sections 5, 8, 9 and 10 define the terms and the rule engine used here.

Kind rules (K1–K5) and support rules (S1–S4) are in the design, sections 8
and 9. This file lists everything layered on top.

## How to read a rule

`ID · tier · Name` — **when** → **then**.

- **Tier 1** = core, needed for the town to read correctly. **Tier 2** = rich.
  **Tier 3** = delight. Tiers set build order, not importance to the feel.
- `p=0.6` is a seeded chance per candidate (design section 5). No `p` means
  always.
- "First match wins" lists are in priority order.
- **Town-wide** marks a rule that depends on the whole town (tallest, counts),
  so a far-away edit may change its result.
- Every number is a default that lives in the style file.
- IDs are stable labels. Gaps in the numbering are intentional.
- **Height** of a tower means the number of cells in that tower structure.
- "Pillar" in a rule means a placed pillar block. Generated supports never
  count.

Terms used below, on top of the design's glossary:

- **Storey n**: a structure's nth level counting from its lowest cell (1 =
  ground storey).
- **Faces X within n**: stepping straight out from a facade, X is the first
  thing met within n cells.
- **Gap**: the count of empty cells between two facing facades.
- **Supported cell / walkable top / square / alley / courtyard / sheltered
  water**: as defined under Facts in the design.

---

## R — Roles

Each structure gets exactly one role. The role selects part variants, roof
type and which later rules apply.

### Houses (first match wins)

- **R-H01 · 1 · Chapel** — house structure of 2+ cells touching (side or
  directly below) a tower of height ≥ 3 → pointed windows, a rose
  window on the gable end farthest from the tower, double door, roof finial.
  The tower gets R-T01.
- **R-H02 · 2 · Keeper's cottage** — touches a lighthouse → white walls with
  red trim regardless of stored colour ramp position, red roof.
- **R-H03 · 2 · Mill house** — touches a windmill → flour sacks and a cart by
  the door.
- **R-H04 · 1 · Stilt house** — every lowest cell stands over water (on a
  dock or generated stilts) → plank walls, ladder down to the water, fishing
  rod socket on the water side.
- **R-H16 · 2 · Watermill** (discovery 1, RC-03) — a house of 2+ cells with
  its ground storey at level 1 and a ground-storey facade with river water
  right outside it (generator 2's river, MAT_RIVER, or a channel: land
  within 3 on both sides across the water, along x or z); of candidates
  within 8 of each other only the lowest id → an undershot water wheel
  turning on the river side (the 'water-wheel' actor on the 'wheel-hub'
  socket of J30's mill-race: a timber frame, bearing and plank hood; no
  window behind it), a timber weir with a foam line from the bank beside
  the wheel across the stream to the far bank (up to 5 cells), flour sacks
  at the land door (R-H98). Not: the sea or a lagoon with no bank within 3
  across it; a stilt house. Priority 9955 (before the boathouse).
- **R-H17 · 2 · Warehouse** (discovery 1, RC-02) — 6+ cells, 2+ storeys,
  footprint ≥ 2; a ground-storey facade whose cell outside lies within 3 of
  a dock and that looks toward it (water met within 4 straight out, or a
  dock within 4 straight ahead); no ground-storey facade faces a plaza
  within 1 → a column of loading doors up the middle of the wall nearest
  the dock (one per storey, a sill under each upper one) with a hoist beam,
  pulley and rope over them (J30; sockets 'loading-door' and 'hoist' for
  porters, which this rule does not place); crates, a barrel and a sack by
  the loading door (R-H98); no window in that column. Not: a house on the
  harbour square (the inn or a shop), a house on an open coast with no
  dock. Priority 9942 (after the town hall, before the inn).
- **R-H20 · 2 · Bridge shop** (discovery 1, RC-05) — a house whose lowest
  cells all stand on arch cells, where the bridge (any run of that arch
  structure) carries a floor on its deck or meets one at an end, and some
  deck cell is left free beside the house → a shop over the water: a shop
  door and shopfront onto the deck (J06, J09; awning and sign by D07), a
  seeded shop type, half-timbered cells over the arch (a jetty feature on
  each lowest cell), and timber struts under each ground-storey wall that
  overhangs the drop (J30 bridge-brackets). Not: a bridge with no street on
  or to it; a house filling the whole deck. Priority 9965 (before the stilt
  house).
- **R-H05 · 2 · Boathouse** — a footprint of 4 cells or fewer and 1 storey,
  or a footprint of 2 or fewer and 2 storeys (FX-12); ground storey at `y ≤ 1` and a facade faces water within 1, or
  touches a dock → wide double doors on the water side, slipway, net on the
  wall. (A bigger house on the shore can be a town hall, inn or manor.)
- **R-H06 · 2 · Inn** (place and scarcity: discovery 1, FX-02) — 6+ cells,
  2+ storeys, a ground-storey facade faces a street or plaza within 1, and
  the house stands where travellers arrive: on a square (it faces a plaza
  holding a 3 × 3 within 1, or has a cell within 2 of one), within 3 of the
  end of a bridge over water, or within 3 of a gate (a small arch standing
  on a path between marble, wall, house or tower). A bridge end or gate
  within 6 steps of a square is the square's. One inn per place: the
  largest candidate (most cells, then the lowest id); a house is the inn of
  one place at most → inn sign on a bracket, lantern by the door,
  stable-style door. Every other house is left to the later roles (a
  home). Not: a house on a plain street, however big; the quay's big houses
  (R-H17 warehouse).
- **R-H07 · 1 · Shop** (the share falls with distance: discovery 1, FX-02)
  — a ground-storey facade faces a plaza within 1 → shop; or faces a street
  within 1 and the structure has 2+ storeys → shop if a cell of it is within
  3 steps (4-way) of a plaza cell, else with a seeded p by the steps: 0.45
  within 6, 0.2 within 12, 0.1 beyond (and with no plaza at all) → shopfront
  window, awning (colour from seed), hanging sign. The roll is the house's
  own (its structure seed), so it holds while the town grows elsewhere. The
  shop type is a seeded pick from {bakery, café, books, flowers, fish,
  tailor, cheese, toys}, with fish allowed only within 6 cells of a dock. A
  café with 2+ free floor cells in front also gets tables (D08).
- **R-H18 · 2 · Barn** (discovery 1, RC-09 and FX-06) — a house of exactly 1
  storey, footprint ≥ 6 with a side of 3+, no ground-storey facade facing a
  street or plaza within 1, a garden region of 6+ cells within 4, and no
  square (a plaza holding a 3 × 3) within 6 → timber weatherboard walls
  (tag barn), a long gable roof with no chimney and no dormers, big boarded
  doors swung open round its double main door and a hayloft door with a
  hoist beam in its far gable (J30), one small shuttered window to every
  three wall cells. Another house of footprint < 6 within 4 → tag
  farmstead: hay bales and a hand cart outside the big doors (R-H98; hay
  alone otherwise). Not: a house on a street or by a square, a two-storey
  house. Priority 9915 (before the manor).
- **R-H19 · 2 · Smithy** (discovery 1, RC-06) — a house of exactly 1 storey
  and footprint 1–3, every cell on the ground, side by side with a tower 1
  or 2 tall (3+ is R-H01's steeple) → the house is a smithy and the tower
  its forge chimney (role forge-chimney: square, a flat top with a
  chimney-top socket so it smokes, L02; no door of its own); no chimney on
  the house; an open forge front on the best free ground-storey wall that
  is not the door's (J30: a stone surround, a hearth that glows at dusk and
  night, a propped plank shutter); an anvil on its block and a quench
  barrel outside it, a hitching rail with a trough by the door (R-H98).
  Not: a house of 2+ storeys; a house over water or a dock. Priority 9925.
- **R-H21 · 3 · Schoolhouse** (discovery 1, RC-19; town-wide) — in a town of
  10+ house structures, of the houses with no role yet that have 1 storey,
  a footprint of 1–4 and a ground-storey facade with a street within 2,
  the one with the largest yard (the free grass or garden cells at its
  level round it, side or corner, 4+ of them, with a fence or wall on some
  side and some cell beside a path; then the lowest id) → a bell cupola on the middle of its ridge (J30), tall
  windows (J09), no chimney, and a hopscotch court chalked on its yard, in
  the fenced part if it has one (R-H98). One per town. Not: a house that
  already has another role. Priority 9855 (just before the cottage).
- **R-H09 · 2 · Manor** — footprint ≥ 10 cells with 2+ storeys, or total ≥ 16
  cells → hip roof, dormers, two chimneys, portico with two small columns
  at the door. (A big one-storey house is a barn by the fields, else a
  home: FX-06.)
- **R-H10 · 1 · Townhouse** — footprint exactly 1 cell and 3+ storeys →
  stepped gable, balcony on each upper storey p=0.5.
- **R-H11 · 1 · Row house** — footprint 1–2 cells, sharing side walls with
  houses of a different colour on two opposite sides → eaves aligned with
  the row, chimney on a party wall. (Its door is placed by J06 like any
  other, which already faces a row onto its street.)
- **R-H12 · 2 · Cliff house** — a facade abuts terrain rising ≥ 2 above its
  floor → no windows on that side, stone ground storey, balcony on the
  opposite side.
- **R-H13 · 2 · Greenhouse** — 1 storey, footprint ≤ 2, garden floor on 3+
  sides → glass walls and roof, plants visible inside.
- **R-H14 · 3 · Lookout cottage** — stands on the highest terrain level with
  no other structure within 3 → weathervane, a telescope on a tripod outside.
- **R-H15 · 1 · Cottage** — default → gable roof, chimney p=0.7.

### Towers (first match wins)

- **R-T01 · 1 · Steeple** — paired by R-H01 → spire, open belfry with a bell.
- **R-T02 · 2 · Castle turret** — touches marble or wall pieces on 2+ sides
  → crenellated top, arrow slits, banner.
- **R-T03 · 2 · Clock tower** — height ≥ 4 and base within 2 cells of a
  square → clock faces on all four sides showing game time, pyramid roof.
- **R-T04 · 3 · Observatory** — stands on the highest terrain level, height
  ≥ 4, no water within 4 → dome with a slit and a telescope; the dome turns
  slowly at night.
- **R-T05 · 3 · Dovecote** — height exactly 3 and garden within 2 → rows
  of dove holes, perches. Doves by L15.
- **R-T06 · 2 · Campanile** — tallest tower in town and ≥ 6 tall
  (town-wide) → open belfry, bell rings at dusk (L29).
- **R-T07 · 1 · Watchtower** — default → cone roof, small windows spiralling
  a quarter turn per storey, flag p=0.5.

### Lighthouse

- **R-L02 · 2 · Folly tower** (discovery 1, RC-21) — a lighthouse structure
  with no open water (terrain at sea level) within 6 columns of its foot →
  plain coursed stone instead of the bands, the gallery with its rail, and
  an open belvedere (four posts, a dome, a gilt finial) in place of the
  lantern room: no lantern socket, so no beam (L09); a house touching it is
  no keeper's cottage (R-H02). Priority 7995 (before R-L01).
- **R-L01 · 1 · Lighthouse** — always → red and white bands per storey,
  gallery rail and lantern room on top, beam (L09). ≥ 6 tall adds a second
  gallery halfway up.

### Marble (first match wins)

- **R-M01 · 2 · Temple** — a marble structure resting on 4+ placed pillar
  shafts, each ≥ 2 tall, in a row or rectangle → pediment on the short ends, frieze
  band, steps at the base of the pillars. A small one (four cells) is a temple
  only up on a podium (or any block): on the ground it is a bandstand (R-M11),
  so a small temple on grass is built 2 × 3 on its corner pillars, or raised
  (Grow a town's shrines stand on a one-block marble podium).
- **R-M02 · 2 · Gatehouse** — marble touching one end of a gateway arch
  (R-A04) whose other end also touches marble or a wall → portcullis in the
  arch, lanterns either side.
- **R-M11 · 3 · Bandstand** (discovery 1, RC-14) — R-M01's shape (marble on
  4+ placed pillar shafts of 2+) with 4 cells or fewer, its pillars standing
  on the ground (not up on a podium), anywhere: on a square, in a park or on
  bare grass (so exactly four cells at one level, one shaft under each: a
  2 × 2, a 1 × 4, an L, a T or an S) → a park pavilion: the marble becomes a
  stepped many-sided plinth, a light entablature and a tented roof in facets
  with a roll on each hip; the pillars become a ring of slender columns with
  bases and capitals (the rule claims each pillar's role and pins a
  `pavilion-bay` feature on it: each draws the columns in its own cell); a
  low balustrade between them, open in the bay on the side tagged
  bandstand:<side> (toward a path within 4 cells, else the most paving or
  lawn). Its floor is in the walking graph: each floor cell is pinned
  (`pavilion-floor`, with the plinth's height) and the way in carries the
  open side; people step in only through the open bay (three bays on the
  octagon's front), so the rail is never crossed and it is never a short
  cut. A 2 × 2 is a regular octagon of eight columns under a lantern with
  lit windows; a one-wide plan has half-octagon ends and a hipped roof with
  a finial at each ridge end. Pillars 3+ tall: a higher plinth, longer
  columns and a second roof tier over a glazed clerestory drum. No
  pediments, no stylobates, no braziers (D22 is a temple's). Not: a temple
  on a podium; a slab of 5+ cells. Priority 5995.
- **R-M12 · 3 · Stoa** (discovery 1, RC-13) — R-M01's shape with 7+ cells, a
  rectangular top at one level 3+ times as long as wide, and plaza at the
  foot of one long side's pillars or 1–2 cells out from it (tag
  stoa:<side>) → one sloping tiled roof, high over the square side and
  falling away from it, with stone cheeks at the ends, no pediments;
  stylobates; goods (crates) on every other free ground cell along its back
  (R-H98). Not: 6 cells or fewer; a portico facing no plaza. Priority 5993.
- **R-M10 · 2 · Obelisk or victory column** (discovery 1, RC-08, FX-09) — a
  marble structure on a single column, 3+ cells tall, nothing on top, no
  block beside any of its cells, its foot on plaza or with plaza on 2+
  sides → a stepped base and pedestal, then a tapering obelisk with a gilt
  pyramidion; or, 4+ tall with p=0.5 (tag obelisk:column), a fluted column
  with a capital and a gilt figure holding up a wreath. Not: a stack
  against a wall or house (a pier); 1–2 tall (R-M06, R-M07). Priority 5965.
- **R-M09 · 2 · Theatre** (discovery 1, RC-07) — marble whose columns are
  tiers of seats facing one way: R-M04's shape cuts 2+ rows of it (3+ tiers
  with the uncut top row), 4+ wide; 3 of every 4 columns stand one level
  above or below a neighbouring column; the top row leads nowhere (nothing
  on it, lower behind it); 4+ open level cells (plaza or bare ground) lie
  within 2 in front of the lowest row; nothing of a castle touches it (as
  R-M08) → the steps drawn as deep stone benches (two to a cell), a stone
  balustrade where the top drops 2+; R-H98 stands a painted backdrop with
  two masks at the back of the stage and a brazier at each end. Not: a
  flight up to a platform (R-M04, R-M08). Priority 5977.
- **R-M08 · 2 · Podium** (discovery 1, FX-01) — marble 2+ tall with a 2 × 2
  in its footprint that carries a temple (one of R-M01's pillars stands on
  it), or has R-M04's steps cut into it, climbing to its top level, without
  being mostly stair (steps up to the foot of a tower are a keep's), or has a
  floor, plinth, pillar, fountain, stall, tree or stairs on a quarter or more of its
  open top; and no wall piece or wall edge, gateway arch, castle turret,
  gatehouse or keep touching it → no battlements and no garrison: marble
  (not castle stone), flat pilasters on every second cell line, a stone
  balustrade on every top edge that drops 2+ (J19 then leaves those edges).
  With a castle piece touching it the same mass is a keep with a stair.
  Priority 5975.
- **R-M03 · 2 · Keep** — ≥ 3 tall and footprint ≥ 2 × 2, and not mostly a
  flight of steps (R-M04), a podium (R-M08) or a theatre (R-M09) →
  battlements on exposed top edges, arrow slits. Only an embattled keep
  counts as a castle for the garrison and the rider (L36, L37).
- **R-M04 · 2 · Grand steps** — marble forming 3+ rows each one level higher
  than the last, 2+ wide → broad steps; people may sit (seat sockets).
- **R-M05 · 2 · Quay wall** — at `y ≤ 1` next to water → mooring rings,
  bollards, a narrow stair down to the water every 6 cells.
- **R-M06 · 3 · Plinth** — a single marble cell, 1 tall, on a plaza, nothing
  on top → statue or sundial (D19).
- **R-M07 · 1 · Terrace** — default; exposed walkable top → paving pattern;
  balustrade on drop edges via J19.

### Arches (first match wins)

- **R-A01 · 1 · Stone bridge** — valid span with water below → slightly
  humped deck, parapets, a lamp at each end (D20).
- **R-A02 · 2 · Sky bridge** — valid span at `y ≥ 2` anchored on houses at
  both ends → covered timber gallery with windows in the anchors' colour;
  doors into both houses (J26).
- **R-A03 · 2 · Flying buttress** — hanging run anchored to a tower, marble
  or chapel → buttress with a small pinnacle.
- **R-A04 · 1 · Gateway** — an arch standing on a walkable top (cell below
  solid) with a floor in its own cell → lantern hanging in the arch; joins
  wall runs on either side.
- **R-A05 · 2 · Loggia** — hanging run anchored to a house → open balcony
  with balustrade and a door from the house.
- **R-A06 · 1 · Viaduct** — default; 2+ tiers or a run of 3+ → continuous
  cornice and parapet (as in the spike).

### Docks (first match wins)

- **R-D01 · 2 · Quay** — 4+ dock cells running along the shoreline →
  bollards, crates; a hoist crane if 8+.
- **R-D02 · 1 · Pier** — straight run of 3+ leading away from land → ladder
  and lamp at the end, fishing seat socket.
- **R-D03 · 2 · Boardwalk** — a run touching land at both ends → rope
  railings both sides.
- **R-D04 · 1 · Jetty** — default.

### Other pieces

- **R-W01 · 1 · Windmill** — always → tapered body, cap and four sails on the
  top block. On top of a tower or house stack: adds a gallery (J25). Garden
  floor ≥ 4 cells within 2 turns that garden to wheat (R-G01).
- **R-P01 · 1 · Tree species** (first match) — on sand within 1 of water →
  palm; within 1 of water → willow; terrain level ≥ 4 → pine; on or beside
  plaza → clipped round tree in a planter; on garden floor → fruit tree;
  part of 5+ touching trees → grove tree with undergrowth; otherwise the
  spike's seeded mix of round, cypress and bush.
- **R-F01 · 1 · Fountain** (first match) — in a square → tiered fountain with
  jets; in a courtyard → well with a bucket; on garden → birdbath; otherwise
  a small basin.
- **R-S01 · 1 · Stall** (first match) — within 3 of a dock → fish stall; on
  garden → flower stall; otherwise market stall with a striped awning and
  goods chosen by seed.
- **R-G02 · 2 · Churchyard** (discovery 1, RC-01 and FX-07) — a garden
  region of 2–40 cells on the ground with a cell side by side with a chapel
  (R-H01) or its steeple, whose outward sides other than onto the chapel
  and steeple are at least 60% wall or fence (an edge piece on the side, or
  a wall or fence piece beyond) → role churchyard: mown lawn in east–west
  stripes, no herb beds. Bare grass closed round the same way beside a
  chapel (the free ground cells a flood from beside it reaches without
  crossing an edge piece, a block or a floor, 40 at most) gets the same
  dressing with no role. R-H98 dresses both: two headstones facing east on
  each cell of every other column (a seeded tilt, a grave mound), a stone
  cross on the middle grave cell, a clipped dark yew in the cell farthest
  from the chapel, and a lychgate (posts, tie beams, a steep shingled roof
  along the wall, a bench) over each J20 gate that opens into the yard.
  Not: within 2 of a windmill; ground touching another house on 2+ sides;
  ground on a roof. Priority 3995 (before R-G01).
- **R-G01 · 1 · Garden** (first match, per garden region) — within 2 of a
  windmill and ≥ 4 cells → wheat; in a courtyard → clipped herb beds; next to
  water → reeds and irises; ≥ 9 cells → park lawn with a hedge border; next
  to a house → vegetable rows and flower beds mixed by seed.
- **R-E01 · 1 · Fence style** (first match) — on a dock or bridge deck → rope
  and post; on a roof terrace → iron railing; on marble → stone balustrade;
  otherwise white picket.
- **R-E02 · 1 · Wall style** (first match) — touching marble or a tower →
  crenellated curtain wall, 1 storey tall (people cannot walk on it); around a
  garden → low stone wall with creepers p=0.4; otherwise the spike's low
  wall.

---

## J — Joinery

How pieces meet. Joinery decides geometry and produces sockets.

- **J01 · 1 · Stack trim** — a structure has base trim only on its lowest
  cells and a roof only where a cell is sky-open.
- **J02 · 1 · Merge** — cells of one structure share no interior walls; eaves
  and wall surfaces run continuously.
- **J03 · 1 · Party walls** — touching houses of different colours keep
  separate walls and roofs; their ridge heights differ by a seeded offset so
  a row has rhythm.
- **J04 · 1 · Roof type** (per roof region, first match) — the role names one
  → use it (townhouse stepped gable; manor, town hall hip; a rectangular,
  unpierced chapel or a rectangular barn gable: a square chapel's ridge runs away from its steeple,
  with a cross gable in the middle of each eave if it is 3+ a side, and a
  chapel is never a terrace, whatever lies on it: FX-05); a path, plaza or stairs leads onto it → flat terrace; region is
  1 deep against a taller wall of the same structure → lean-to; ≤ 2 wide →
  gable with the ridge along the long axis; otherwise hip.
- **J05 · 2 · Roof terrace** — a flat-eligible region of 2+ cells beside a
  taller part of the same structure, p=0.35 → terrace with parapet, door from
  the taller part, parasol and pots (D28).
- **J06 · 1 · Main door** — one per structure on the ground storey. Score
  each facade cell: faces a street within 1 (+5), a plaza within 1 (+4), a
  floor within 3 (+3), open ground (+1), water, a cliff or an alley (−3).
  Highest wins; ties by seed.
- **J07 · 1 · Extra doors** — any storey whose floor level meets a walkable
  surface outside (terrace, deck, marble top, higher terrain, a stair head)
  gets a door there.
- **J08 · 1 · Stoop and trail** — a door above the ground outside gets steps;
  a door 2–3 cells from a floor and not next to one gets a worn dirt trail to
  it (walkable, derived).
- **J09 · 1 · Windows** — each facade cell without a door: none if another
  block touches it; p=0.5 on alley sides; otherwise one window from the
  structure's family. Shops get a bay window on an upper storey p=0.2.
- **J10 · 2 · Dormers** — gable or hip roof with a straight run of 2+ cells,
  p=0.3 → one dormer per 2 cells.
- **J11 · 1 · Chimneys** — one per 3 roof cells (minimum per role), on the
  ridge nearest a party wall. If a taller wall stands within 1 cell, it
  becomes a tall flue rising past that wall's eave.
- **J12 · 1 · Tower through roof** — a tower rising out of a house roof gets
  a collar where they meet; the roof wraps around it.
- **J13 · 1 · Tower body** — base trim only at the bottom, a band course
  every 2 storeys, cap by role.
- **J14 · 1 · Pillar** — a stack is one shaft with one base and one capital
  (spike). Under a block the capital flares; in water it stands on a stone
  footing.
- **J15 · 1 · Arch direction and continuity** — the axis an arch spans
  (first match): it is in a run of 2+ arches → along the run; it has solid,
  wall or arch neighbours on both sides along one axis → that axis; a floor
  in its cell continues into a neighbouring floor → across that floor; else
  x. Its **passage** is the other axis. No cornice between tiers; cornice and
  parapet run through neighbouring arches (spike). Runs meeting at a right
  angle share a corner pier.
- **J16 · 1 · Marble mass** — only exposed faces are emitted; top edges are
  bevelled; flush with terrain of the same height.
- **J17 · 1 · Terrain steps** — a path cell beside a path cell exactly one
  terrain level higher → carved stone steps between them (derived, walkable).
- **J18 · 1 · Stairs** — side-by-side flights with the same `rot` merge into
  one wide flight; flights continuing diagonally merge with a landing every
  3; open sides with a drop ≥ 2 get a rail; a side against a wall gets none.
- **J19 · 1 · Edge railing** — a walkable edge with a drop ≥ 2 that is next
  to a floor, a door or a stair head gets a railing in the style of R-E01.
  Skipped where the player placed an edge piece.
- **J20 · 1 · Fence and wall runs** — cell and edge pieces of one kind join
  into runs: posts at corners and ends, no end post where a run meets a
  structure. A cell piece standing on a path, or an edge piece between two
  path cells, becomes a gate (fence) or an arched opening (wall) that people
  can walk through.
- **J21 · 1 · Floors** — paths have rounded ends and filleted corners
  (spike); a path meeting a plaza gets a flush kerb; a path at a door
  widens; on a dock, planks follow the run; on a bridge deck, cobbles.
- **J22 · 2 · Plaza paving** — pattern aligned to the region's bounding box,
  border course at the edges; a region containing 5 × 5 gets a radial centre
  motif. With a fountain on that square off its middle, the motif (rings)
  centres on the fountain at the largest odd size that fits round it, and
  is left out if not even a 5 × 5 fits (FX-08).
- **J23 · 1 · Dock body** — planks along the run, stilts at corners and every
  2 cells, cross-bracing on outer edges.
- **J24 · 1 · Foundation** — a structure whose ground cells sit over lower
  terrain on some side gets a stone plinth down to that ground; against a
  cliff it has no base trim on that side.
- **J25 · 2 · Raised windmill** — a windmill on a tower or house stack gets a
  timber gallery under the cap.
- **J26 · 1 · Bridge doors** — where a walkable arch deck meets a house wall,
  the house gets a door at deck level.
- **J27 · 2 · Jettied room** — a house cell carried on brackets (S2) gets
  half-timber patterning.
- **J28 · 1 · Shoreline** — foam line where land meets water; a short plank
  ramp where a dock meets a beach.
- **J30 · 2 · Trade fronts** (discovery 1) — once the main door and roofs
  are known, what a working building's walls show of its trade: a barn
  (R-H18) gets barn-doors (two boarded leaves swung open flat either side
  of its main door, a beam over them) and a hayloft (a loft door and hoist
  beam in the middle of the gable end farthest from that door); a watermill
  (R-H16) gets its mill-race on the middle river-side wall cell of its
  ground storey (posts in the stream, a bearing beam, a plank hood; it owns
  the 'wheel-hub' socket the wheel turns on, and J09 leaves the cell
  without a window).
- **J29 · 2 · Vault door** (discovery 1, FX-09) — a terrace (R-M07) or podium
  (R-M08) 2+ storeys tall on 9+ columns with a 2 × 2 among them and no door → one
  stone-framed door into its vaults, in the middle of its longest
  ground-storey wall run of 3+ cells standing on level ground with open
  ground, a path or a plaza at its foot and marble above; the run with a
  path or plaza nearest in front of it (within 5) wins. Not: a wall one cell
  thick, a run with steps cut into it, a wall against a bank or a block.

---

## D — Decoration

Props claimed onto slots and sockets. Higher in the list = higher priority
when two rules want the same slot, unless a rule says otherwise.

### Streets and squares

- **D01 · 1 · Street lamps** — a street of length ≥ 4 gets a lamp at each
  dead end and junction, then every 4th cell, alternating sides, on the edge
  slot away from doors. New lamps arrive by F05. Only in town: a street cell
  with no building, square, stall or fountain within 3 (and no dock or arch
  within 2) is country and stays dark (U13 dresses it; discovery round 1,
  FX-04).
- **D02 · 1 · Square lamps** — at the corners of a square; a square containing
  5 × 5 with no fountain gets a four-arm lamp at the centre.
- **D03 · 2 · Benches** — one per 4 edge cells of a plaza, facing in; at a
  street dead end that faces water or a drop, p=0.7.
- **D04 · 2 · Bunting** — a straight street segment ≥ 3 with structures
  within 1 on both sides at storey 2+, p=0.5 → zigzag bunting between the
  facades. Always on a square that has a stall.
- **D05 · 1 · Laundry lines** — two different house structures with facing
  facades across a gap of 1–3 cells; on a storey ≥ 2 (or storey 1 if both
  are single-storey and the gap is 1); both facade cells have windows; the
  line between them is empty air; p=0.6 per facing pair of cells → a line
  with 3–6 garments. At most 2 lines per 3 cells of alley. Never over a
  plaza (D04 wins there).
- **D06 · 2 · Hanging lanterns** — an alley ≥ 2 long, p=0.4; always under a
  gateway (R-A04).
- **D07 · 1 · Shop dressing** — awning and sign for R-H06 and R-H07.
- **D08 · 2 · Café tables** — a café-type shop (R-H07) with 2+ free floor
  cells in front → up to 4 tables with parasols on those cells.
- **D26 · 3 · Fingerpost** — a junction with 3+ branches, p=0.5 → signpost
  with pictogram arms. A junction is a place the street leaves in 3+
  directions that stay apart for 3 cells (a two-wide street is no row of
  junctions); none within 1 of a plaza; no two posts within 8 (discovery
  round 1, FX-03).
- **D27 · 3 · Post** — a house facing a street p=0.3 → mailbox; one postbox
  per street of length ≥ 10.
- **D33 · 3 · Hand pump** — total street length ≥ 8 and no fountain in town
  (town-wide) → a pump at the busiest junction.

### Houses

- **D09 · 1 · Flower boxes** — under a window: p=0.5 on sunny sides, p=0.2
  otherwise; never on storey 4+.
- **D10 · 2 · Creepers** — a facade facing a garden or courtyard p=0.4; cliff
  house ground storey; grows from the ground, at most 2 storeys.
- **D11 · 2 · Doorstep** — doormat always; pair of potted plants p=0.4;
  barrel p=0.2; a bicycle p=0.1 if the door faces a street; a lantern if it
  faces a street.
- **D12 · 2 · Weathervane** — on the ridge end of a house structure that is
  taller than every other house structure within 6 cells (rooster, ship or
  arrow by seed).
- **D14 · 3 · Roof life** — chimney pots; birdhouse p=0.1; one stork nest on
  the tallest chimney once the town has 12+ house structures (town-wide).
- **D28 · 2 · Terrace furniture** — parasol, deck chair, pots on roof
  terraces.
- **D30 · 3 · Stair pots** — stairs along a wall, p=0.3 → flower pots on the
  wall side of some steps.

### Flags

- **D13 · 1 · Flags** — watchtower p=0.5 (from R-T07); turret banner; every
  lighthouse gallery; pier end p=0.5; a flagpole on a square containing
  4 × 4 with no fountain. The tallest structure in town always flies one
  (town-wide).

### Water's edge

- **D15 · 2 · Dock goods** — per quay cell away from the walking line: crates
  or barrels p=0.5, coiled rope p=0.3; lobster pots; nets on drying racks
  once a dock structure has 4+ cells.
- **D20 · 1 · Bridge lamps** — both ends of a stone bridge; a lantern under a
  sky bridge.
- **D23 · 2 · Lighthouse base** — fog bell; rocks at the base if on the
  waterfront.
- **D24 · 1 · Wild ground** — grass tufts and wildflowers, denser the farther
  from any structure and trimmed near floors; boulders at cliff feet;
  driftwood, shells and starfish on sand; reeds and lily pads in sheltered
  water.

### Gardens, courts, monuments

- **D17 · 2 · Courtyard** — a courtyard of 4+ cells with nothing placed in
  it → cobbles and one tree or well at the centre.
- **D18 · 2 · Garden things** — scarecrow in wheat or vegetables ≥ 6 cells;
  beehives p=0.3; wheelbarrow; trellis against a neighbouring wall.
- **D19 · 3 · Statue** — on a plinth (R-M06): figure, sundial or urn by seed.
- **D21 · 2 · Castle dressing** — banners on curtain walls, torch brackets at
  a gatehouse, a cannon on a quay wall p=0.15.
- **D22 · 3 · Temple braziers** — at the foot of temple steps.
- **D25 · 2 · Mill yard** — sacks, cart, ladder at a windmill's base.
- **D31 · 3 · Viewpoint** — the highest walkable point reachable by a floor
  gets a bench and a coin telescope (town-wide).
- **D32 · 3 · Under the trees** — a swing on a courtyard or garden tree
  p=0.2; a hammock between two trees 2 apart p=0.3; a picnic blanket in a
  park.
- **D34 · 3 · Lost kite** — one kite snagged in the tallest tree, p=0.1 per
  town (town-wide).

Added in discovery round 1 (`docs/swarm/discovery/round-1.md`):

- **D39 · 3 · Guardians at the head of the stair** (DC-03) — a flight of grand
  steps 3+ wide → a pair of stone lions or urns (seeded per flight) on the
  landing above its two outer top steps, looking down it; a pair of tall
  lamps on the ground before its two outer bottom steps. Outer corner slots
  only (the stair's walking line stays clear); none for narrower flights.
- **D36 · 3 · Wayside shrine** (DC-01) — a street junction (3+ ways out) on
  the ground with no building, square, green, stall or fountain within 4 →
  on a free corner of the junction cell, a stone calvary on three stepped
  stones or a roofed niche on a post (seeded), with fresh flowers, on a
  corner D26's fingerpost left free (both stand at one crossroads).
- **D37 · 3 · Market cross** (RC-12) — a plinth (R-M06) with 2+ stalls within
  3 and no fountain within 2 (the `marketCrosses` fact; D19 leaves these
  plinths alone) → a market cross: two octagonal steps, a tall shaft, a
  cross head with a gilt ball ('activity'/'vend' on the ground in front).
- **D38 · 3 · Rope swing** (DC-06) — a willow on the ground with river water
  beside it (open water with a bank across within 3), p = 0.4 → a rope swing
  from a long bough out over the water, its seat just above the water (a
  'seat' socket). Not by the sea; never a second swing on a tree (shares
  D32's claim).

---

## L — Life

Actors and motion. All read the signals in the design, section 13.

### Wind, light and water

- **L02 · 1 · Chimney smoke** — every chimney puffs; puffs lean with the
  wind; denser at dawn and dusk.
- **L03 · 1 · Sails** — windmill sails turn at a speed set by local wind; the
  cap slowly yaws to face it. Weathervanes turn likewise.
- **L04 · 1 · Cloth** — laundry, flags, bunting and awnings flutter with the
  local gust, so a gust visibly crosses the town.
- **L05 · 2 · Trees** — sway with wind; a leaf falls now and then; petals
  from fruit trees.
- **L06 · 1 · Water** — drifting stroke lines (spike), foam at the shore,
  rings around stilts, pillars and boats. Tier 3: a fish jumps now and then;
  lily pads bob.
- **L07 · 1 · Windows through the night** — windows light one by one over
  20 seconds at dusk in seeded order, only where a resident is home; shop
  windows light first and go dark when the shop shuts. Then the town goes to
  bed: through the first half of the night houses put their lights out one
  at a time (upstairs last), until only about one house in six still has a
  window lit, plus inns, the lighthouse, the castle gate and street lamps.
  A few of the late windows change through the night (one goes out, another
  comes on for a while). In a lit window a resident's silhouette sometimes
  crosses, pauses, or draws a curtain: dark shapes against the warm pane,
  never more than a few in view at once. Before dawn the bakery lights
  first.
- **L08 · 1 · Lamplighter** — at dusk one resident walks each street in route
  order; each lamp lights as they reach it. Lamps they cannot reach light on
  their own a few seconds apart. All lamps go out at dawn.
- **L09 · 1 · Lighthouse beam** — sweeps at night; a soft glow on the water.
- **L10 · 2 · Night dressing** — bunting and lanterns glow on squares;
  stars and a moon on the paper; rarely, a shooting star. (Fireflies were
  removed at Derek's request, 2026-11-19: do not add them back.)
- **L31 · 3 · Clouds** — ink-drawn clouds drift over the paper with the
  wind. They cast no shadow on the island or the sea (removed at Derek's
  request, 2026-11-20: do not add it back).

### Birds

- **L11 · 1 · Gulls** — count = clamp(1 + waterfront dock cells ÷ 4, 1, 8).
  Circle over water near docks, perch on bollards, ridges and the lighthouse
  rail, follow the fishing boat.
- **L12 · 1 · Pigeons** — per plaza region: flock = clamp(cells ÷ 3, 0, 12).
  Peck on the ground; burst into flight when a person walks through or a
  block lands within 3 cells; settle again after 5 seconds; perch on statues
  and fountains.
- **L13 · 1 · Swifts** — if any tower or lighthouse has height ≥ 5, or total
  street length ≥ 20 → clamp(total street length ÷ 8, 3, 9) swifts loop
  around the tallest structures, most active at dusk (town-wide).
- **L14 · 2 · Sparrows** — one per 6 cells on streets of length ≥ 6; hop
  along the street, perch on fences and laundry lines.
- **L15 · 3 · Characters** — doves at a dovecote; a stork on its nest; an owl
  at night on the observatory or tallest tree; a duck with ducklings in
  sheltered water; a crow on the scarecrow.
- **L16 · 1 · Scatter** — any bird within 3 cells of a landing block takes
  off.

### Boats

- **L17 · 1 · Moored rowboats** — see "Boats and ships" below: any dock space that fits one gets one; they bob and tug on the line in gusts.
- **L18 · 2 · Fishing boat** — see "Boats and ships" below: any dock that fits it; leaves at dawn, loops offshore, returns at dusk trailing gulls.
- **L19 · 1 · Sailboats** — see "Boats and ships" below: one or two always, more with more dock; each sails a loop round the island through open water; the sail flips sides with the wind.
- **L20 · 3 · Rower** — see "Boats and ships" below: with two or more docks, a rowboat crosses between two of them now and then.

### Boats and ships (rewritten at Derek's request, 2026-11-19)

Derek's words: "It shouldn't be tied to some specific board condition. If
there's open available port space, it just spawns in. I just want boats."
So there are no thresholds, counts or prerequisites. **Docks bring boats,
and what comes is whatever fits the water beside them.** This replaces the
earlier conditions in L17–L20 and L38–L42 (dock counts, "a port with 12+
docks", "needs a lighthouse", "piers 10 apart").

- **Fit is the only test.** A vessel may use a stretch of dock (or quay
  wall) if its hull physically fits in the open water alongside and it can
  sail or row in from the edge of the map without touching anything. A
  single dock cell fits a rowboat; two or three fit a sailing dinghy or the
  fishing boat; about four fit a cog; about six a galley; about seven a
  galleon. River docks take rowboats, the rower and the barge. The lengths
  are simply the hulls' sizes, not rules.
- **Every dock gets used.** Free dock space fills up over the first minute
  or two: small boats moor at the short and shallow places straight away,
  and bigger ships call at any stretch they fit, the biggest that fits most
  often, with the others taking turns so a long quay sees galleons, galleys
  and cogs. A long quay with a ship in still has its small boats on the
  rest of it. More dock means more boats, up to a cap that keeps the water
  from looking crowded (and lower on phones).
- **The sea is never empty.** Even an island with no dock has a sailboat or
  two looping it and, now and then, a tall ship passing far out. No
  lighthouse is needed for anything; a lighthouse just makes passing ships
  a little more frequent.
- **Rivers.** Any dock on a river brings the barge: it runs between river
  docks if there are two or more, or between the one dock and the river
  mouth.
- **Nothing ever vanishes.** When the player removes a dock, fills the
  water, or blocks a lane, the boats affected cast off and sail or row away
  to the edge of the map (or to another free berth). They never shrink,
  pop or fade in view. If something is built on the very water a boat is
  floating in, the boat is nudged aside to the nearest free water first.
  Only a boat with no water left to float in at all may be removed, and
  then with the removal puff used for erased pieces, not a shrink. A boat
  shut into an enclosed pool stays there as a resident until a way opens.
- **Arrivals are still events.** Big ships sail in under shortening sail,
  moor, unload, draw a crowd, stay the night with lanterns lit, and leave;
  small boats give way to them.
- **More dock, more big ships, at the same time** (Derek, 2026-11-19: "I'm
  building hella docks and there's still only one big boat"). Every stretch
  of dock a big ship fits is a berth, and berths fill: a harbour with room
  for four galleons has several moored at once, with others arriving and
  leaving. A very long quay holds several ships end to end. The only limits
  are physical (hulls must not overlap, and two ships must not be under way
  in the same lane at once: the second waits offshore or holds at its berth)
  and a generous cap for performance (about 8 big ships on desktop, 4 on a
  phone), never a rule like "one at a time".

Rule ids stay as they are for the code's sake: L17 moored rowboats, L18
fishing boat, L19 sailboats, L20 rower, L38 galleon, L39 cog, L40 galley,
L41 river barge, L42 passing sails.

### People

- **L21 · 1 · Population** — each house structure houses ceil(cells ÷ 2)
  residents, until the town cap (60 desktop, 30 phone) is reached, filled in
  `seq` order. Each resident has a seeded look and a home.
- **L22 · 1 · Day plans** — by day a resident picks a destination by seeded
  weights (square, shop, café table, bench, pier, garden, fountain,
  viewpoint, another house), walks there, lingers 5–20 seconds with a
  matching pose, and picks again.
- **L23 · 2 · Jobs** — one worker per role structure: baker at the shop door
  at dawn; shopkeeper sweeping; miller carrying sacks between windmill and
  mill house; keeper climbing the lighthouse at dusk; fisher on the pier
  end; gardener watering; stall vendor behind the stall; guard pacing a keep
  or curtain wall; bell ringer at dusk.
- **L24 · 1 · Routes** — A* over the walking graph (design section 13).
  Cost per cell: path or plaza 1, dock or deck 1.5, grass 3. Interiors cost
  1 second per storey. People queue at single-file links.
- **L25 · 1 · Dusk** — residents walk home at dusk; their windows light when
  they arrive (L07). At night at most 10% are out: a stargazer at the
  viewpoint, a night fisher.
- **L26 · 2 · Reactions** — a block landing within 4 cells: stop, turn and
  look, a small hop p=0.3. A strong gust: hand to hat. Two people meeting on
  a street: stop for a squiggle chat bubble p=0.2.
- **L27 · 1 · Displaced** — if a resident's cell is built over they hop to
  the nearest walkable cell. If their home is erased they walk off the map
  edge of the nearest floor, or fade if there is none. New homes fill by
  residents arriving on foot from the nearest dock or beach.
- **L28 · 3 · Children** — 15% of residents are small and run. When windy
  they fly kites from the viewpoint or a square; they chase pigeons.
- **L32 · 2 · Stranded** — a resident whose home links to no floor stays
  within 2 cells of the door: sits on the step, tends a pot.

### Castle life (Derek's request, 2026-11-19)

- **L36 · 2 · Garrison** — a castle (a keep with battlements, or a curtain
  wall of 8+ cells with a gatehouse or turret; a podium or theatre is never
  one, FX-11) → a troop of 4–6 soldiers in matching tabards
  and helmets, with pikes, who march in step in a column of twos on a patrol
  round the outside of the walls (or round the keep if there are no walls),
  following walkable ground. They halt and face front at the gate for a few
  seconds each lap, change the guard at dawn and dusk, and go inside at
  night leaving two sentries with torches at the gate. Residents step aside
  for them. Troop size grows with the castle: 4 for a small one, 6 for a keep
  with walls.
- **L37 · 2 · Rider** — the same castle, if a street leads from its gate →
  one mounted rider (a horse with a rider in the garrison's colours and a
  pennant on a lance) who leaves by the gate a few times a day, trots a loop
  along the streets to the square and back, and walks the horse through
  crowds. The horse stands tethered by the gate between rides, flicking its
  tail.

### The living town (Derek's request, 2026-11-19)

Things being done to and with the town, as at the quay when a ship is in:
something made somewhere is carried by someone along real streets and used
somewhere else, and the town answers what the player does. Run-time
reactions have no rule file (like L26); everything else is a `*.rule.ts`
under `src/rules/life/` with its fixture.

- **L50 · 2 · Scuffle** (run time, `src/life/people/scuffle.ts`) — two
  grown-up walkers who meet head on within 0.16 of each other's line
  (p=0.3) or one of whom has been held up 4.5 s squeezing past the other
  (p=0.5) → a cartoon scuffle: the two vanish into a rolling dust cloud
  (fists, a shoe, a hat and stars popping out on twos, a balloon of
  grawlix over it turned to the camera) for 4.2–5.8 s; up to 7 passers-by
  within 3.2 cells stop and watch, 45% of grown-ups cheering, a grown-up
  beside a watching child covering its eyes; pigeons within 3 scatter;
  then the two sit dazed with stars round their heads (2.4 s), get up and
  dust off (1.1 s) and either stomp off their own ways or (p=0.35) shake
  hands and walk to the nearest inn together. One at a time in the town,
  then a rest of 75–130 s. With sound on: a rumble of thumps and boings.
  Anybody carrying their own things (a loaf, a fish, a basket, pails) sets
  them down beside them first and picks them up after; hats sit askew from
  the dazed moment until they walk off. At night the watchman (L55) on his
  round within 12 cells, or by day a guard on duty, trots over: the cloud
  rolls on (up to 16 s) until he gets there and breaks up as he arrives.
  **Must not:** involve children, anybody on a job, a round or called home,
  anybody carrying work (a sack, a tray, a crate), leaving, in a doorway or single-file
  stretch, or in an event's party; happen on stairs, gates, docks, roofs,
  bridges or any cell standing on a structure, or in a cluttered cell.
  Building over the spot ends it at once; anybody in it taken off the
  street ends it.

The chains below share one engine (`src/life/town/`): a rule marks a
chain's posts with `errand` sockets (name `<chain>|<role>|<ref>`), the
chain picks its hands from the residents (no extra people: the population
cap holds) and sends them on errands of a few steps; what they carry is
drawn in their hands (`src/parts/people/loads.ts`, a little big and bright)
and, set down, lies in a store at the post until somebody picks it up. A
place erased mid-errand ends the errand: what is in the hands goes home with
its carrier. Nothing is ever left floating or vanishes in view.

- **L51 · 2 · Bread** — a bakery (a shop tagged shop:bakery, else one L23
  gave a baker; else the inn) nearest the town's heart → posts: outside the
  door of the nearest windmill that can be walked to (`bread|mill`), outside
  the bakery door (`bread|bakery`), and up to three selling places within 22
  steps (`bread|sell`: market stalls first, at their counter; then the inn
  and cafés, at the door; with none, the bakery's own door). The miller (the
  L23 miller if any, else whoever lives nearest the mill) goes into the mill,
  comes out hugging a sack of flour, carries it to the bakery and sets it
  against the wall by the door, where up to 6 heap up (three, two, one); a
  helper (whoever else lives nearest) carries too, and both shuttle briskly
  while the heap has room. The baker (the bakery's L23 baker, else whoever lives there or
  nearest) picks up a sack, takes it in, bakes 5 s, comes out with a tray of
  loaves, walks it to the selling place with the most room and sets up to 3
  loaves out on the counter or by the door, then goes back in. Residents
  choosing what to do go for bread now and then (p=0.3 at dawn and the first
  part of the day, 0.14 after) if loaves lie within 18 steps: they stop at
  the counter 2 s and walk home with a loaf under the arm; the loaves go
  down one by one. By day and dawn only. **Must not:** start at dusk or
  night; send two buyers for one loaf.
- **L52 · 2 · Water** — every well, basin and tiered fountain (not a
  birdbath) → up to two posts beside it, facing it (`water|well`). A
  grown-up living within 14 steps of one, choosing what to do by day, now
  and then (p=0.1) walks there, bends to fill a bucket (2.6 s; it appears in
  the hand) and carries it home at their side. **Must not:** send two to one
  post at once.
- **L53 · 2 · The catch comes in** (with LF-07) — a fisher's spot on a
  dock (L23) with a fish stall or fish shop within 20 steps that can be
  walked to → posts `fish|catch` at the spot and `fish|sell` at the nearest
  one or two. The fisher fishes 16 s, lifts a basket of the catch and
  carries it up the pier to the one with the most room, where three fish
  are laid on the counter (or by the shop door); at most every 30 s.
  Residents go for fish now and then (p=0.16 mornings, 0.08 after) and walk
  home with one dangling from a hand. By day and dawn. **Must not:** give a
  catch post to a fisher with nowhere to sell.
- **L54 · 2 · Builders and onlookers** (run time, `chains/build.ts`) — a
  piece of a house, tower, marble, lighthouse or windmill lands → the two
  nearest free grown-ups within 12 steps hurry over, one with a ladder on
  the shoulder and one with a hod of bricks; the ladder is leant against the
  new wall, the hod set down; each hammers 4.5 s, picks up and goes home.
  Something big (a tower, marble, a lighthouse, a windmill, or a house of 6+
  cells) also draws up to 4 onlookers who stand a step back looking up at it
  for 7 s. Anything erased → those within 4 cells turn and look (L26's
  reaction, now for erasing too). **Must not:** start a job less than 6 s
  after the last, run more than 2 at once, or (when more than 10 pieces
  landed in 5 s: a paste, Grow a town's playback) start one less than 40 s
  after the last; at night. A job nobody came to lapses after 25 s; a
  building erased mid-job ends it and what was set down is picked up.
- **L55 · 2 · Night watchman** (LF-05) — a town of 12+ house structures and
  no garrison (L36) → a beat of up to 8 posts (`watch|beat|<order>`): the
  middles of its squares and of streets 3+ long, in the part of the walking
  graph round the town's heart, walked from the heart, always on to the
  nearest not yet walked. At night one grown-up with no job (living nearest
  the beat's start) walks it with a glowing lantern on a pole, stopping 2.5 s
  at each post to look about, round and round until dawn, then home.
  **Must not:** be kept where a garrison is; walk by day.
- **L56 · 2 · Market day** (LF-02) — the biggest square (a plaza with a
  full 3 × 3) with 2+ stalls on or beside it → up to 4 pitches (one per 6
  cells: open plaza cells, not cluttered, not a doorstep, not beside a
  stall, fountain or tree, 3+ steps apart, facing the square's middle,
  each with seeded goods; `market|pitch|<goods>`) and a busker's spot near
  the middle (`market|busk`). On market days (the first day the town is
  seen, then 60% of days, seeded) from dawn to mid-afternoon (phase 0.4): a
  trader per pitch brings a crate, and as they set it down a market stall
  pops up and three baskets go out on its counter; they stand behind it
  calling out, putting more out when it runs low; a busker juggles three
  balls in the middle; residents choosing what to do go to buy (p=0.35,
  within 26 steps) and walk home with a basket, or stop to watch the busker
  (p=0.12), some cheering. At closing the traders pack the goods into the
  crate, the stall folds away with a puff, and they carry the crate home; a
  stall nobody packs folds by itself 20 s after closing. A pitch built over
  folds its stall at once. While a stall stands its cell costs 30 more to
  cross, so walkers go round it. **Must not:** put a pitch where people must
  pass single file, on a doorstep, or beside a stall.
- **L57 · 2 · A wedding** (LF-01) — a chapel (R-H01) whose door opens onto
  the walking graph, with a square (else a street) within 20 steps that can
  be walked to → posts outside the chapel door (`wedding|door`) and at the
  square cell nearest its middle within reach (`wedding|square`); the chapel
  nearest the heart if several. **When:** the first 25–45 s after the town
  is first seen, then one every 300–420 s of life after the last ended
  (seeded), by day only and, with the time of day running, only if it can
  be over by the end of dusk (240 s); with the time held at day they still
  come round, held at dusk or night never. **Who:** up to 20 (40 % of the
  town's people; at least the couple), who live within 32 steps' walk
  (where they are, home to change, then the chapel): the couple (two of the
  six grown-ups nearest, from different houses), a priest (the bell ringer
  if free), up to two flower children, one to three pairs of bridesmaids
  and ushers, and guests. **Dressed** (drawn over the person,
  `src/parts/people/finery.ts`): the bride in a white gown with a train, a
  veil and a wreath, carrying flowers; the groom in black with a white
  shirt front, tails, a buttonhole and a top hat; ushers in black, some in
  top hats; bridesmaids in pale gowns with wreaths and posies; flower
  children in white with a pink sash and a wreath, a basket of petals;
  guests in pale dresses with picture hats or wreaths, or dark suits with
  bowlers or top hats; the priest in a black cassock and white collar.
  Everyone changes at home, before (anyone out walks home first) and
  after. **Gather:** called in ones and twos, farthest first; the priest
  puts up a flower arch with bows and bunting over the door (a puff) and
  stands beside it; the couple go in; the rest line the way from the door
  in two rows facing across it, 0.4 apart, the flower children at the far
  end (a guard of honour). **Vows:** once three quarters of the guard are
  in place (or 90 s) the couple are inside 6 s while every bell peals
  (L29; heard: rounds down a scale). **Out:** they come out under the arch;
  the bells peal again, a shower of petals over them and a handful from
  each of the guard, nine white doves go up from the doorstep; a kiss; a
  second shower (5 s). **Procession:** the couple walk up the aisle to the
  flower children, then the column walks at 0.42 cells a second, two
  abreast, rows 0.4 apart, in order (flower children strewing petals, the
  couple arm in arm, bridesmaid and usher pairs, guests), the guard falling
  in a pair at a time as the column passes, along the planned way: by a
  fountain, a square or a street on the way if one makes the walk at least
  4 steps longer without doubling back (34 steps at most), else straight
  there; the doves circle overhead; guests throw handfuls over the couple.
  People not in it within 2.4 cells stop and watch (wave, clap, children
  cheer); anyone standing in its way steps aside. **Celebrate (32 s):** a
  ring of guests round the couple, who dance; petals at the start and 16
  and 24 s in; the bride throws her bouquet and a guest catches it; the
  band at a bandstand within 14 steps strikes up. Then all walk home and
  change; the doves fly off on the wind. **Afterwards:** the petals lie
  where they fell (a pink trail) for 50 s, then the priest comes out with a
  broom and sweeps them up cell by cell from the door and takes the arch
  in; any he cannot reach (or with nobody to sweep) blow away. The app
  shows a note once per wedding when the bells ring ("Wedding bells at the
  chapel": Watch glides the camera there; Not now), gone when it ends.
  Everybody in it is in the party (L50 never takes them). **Must not:**
  happen at night; anything shrink or fade out of being; leave anyone in
  finery away from the party. The chapel or square erased, the chapel
  burning or hit, a bomb within 10 cells, a nuke, the couple gone or unable
  to get there, or 420 s passing calls it off: everyone walks home and
  changes. The town changing under the column breaks it up into the ring at
  the square.

- **L58 · 2 · Trade from the quay** — a town with a quay (R-D01) → up to 5
  shops, inns and market stalls within 24 steps of it that can be walked to
  (`trade|to|door`, `trade|to|stall`). Two carters (grown-ups with no job,
  living nearest) keep a handcart parked outside their front doors. By day,
  when goods a ship's crew landed lie on the quay (the harbour's piles,
  L38–L40), a carter wheels the cart down, loads up to three of the crates,
  barrels and sacks lying together there (the quay's stack goes down piece by
  piece), pushes it to the place with the most room, sets the goods down in a
  heap by its door or stall, and wheels the empty cart home. Goods a sailor
  takes back aboard first are simply not there to load. **Must not:** send
  two carters for one piece; carry more than fits where it is going.
  Somebody who lives or works where goods were left takes them in one at a
  time once two or more lie there. *Not yet:* a horse-drawn cart on wide
  streets.

- **L59 · 2 · The harvest** — a wheat field (R-G01) → posts on up to 12 of
  its walkable cells (`harvest|field`) and outside the nearest windmill it
  can walk to (`harvest|mill`). In late summer (past a third of it) and
  autumn, by day and not in rain, two farmhands (a gardener or anybody with
  no job, living nearest) go out with scythes on their shoulders and mow a
  cell at a time (4.5 s of wide swings); the cell is drawn as pale stubble
  and a stook stands on it, so the cut part of the field grows through the
  day. Between cuts they lay the scythe down by a stook, carry its sheaf on
  the shoulder to the mill, heap it by the door (up to 6), and go back for
  the scythe. The miller (L51) takes a sheaf in before each sack of flour
  comes out. At dawn the field stands again. The gulls of a harbour (L11)
  wheel over anybody carrying the catch (L53) within 10 cells.

- **L60 · 2 · Washing day** — every laundry line (D05) → a post on the
  walkable cell under its first anchor (`laundry|line|<prop>`), its house
  the one that anchor is on. Somebody from that house carries the wash out
  in a basket on the head in the morning, stands under the line reaching up
  (3 s) and the washing is out; at dusk, or when it rains (rain over 0.25),
  somebody comes out, reaches up, and carries the wash home; when the rain
  stops it goes out again. A puff as it goes up or comes in. The town as first
  seen keeps its washing as drawn. *Simplified:* D05 draws rope and washing
  as one piece, so the whole line shows or hides.

- **L61 · 3 · Dogs** — one per 6 house structures, at most 3: every sixth
  house by its door cell from the fourth (`dog|home|<coat>`, 4 coats). The
  dog trots at the heels of whoever of its house is out (a step behind and to
  the side), sits when they stop, and sits on the doorstep looking out while
  they are all indoors. Now and then (6–14 s apart, by day) it trots up to a
  passer-by to say hello (a little bark, front feet up), or dashes at a cat
  (L33) within 2.5 cells, which leaps up arched and stays sitting up a while;
  it runs to bark at a scuffle (L50) within 5 cells. The crowd never waits
  for a dog.

- **L62 · 2 · The new buildings and greens at work** (`chains/places.ts`;
  posts from `L62.places` and the fill builder's `activity` sockets). Every
  chain takes its hands from the residents.
  - *School* (R-H21): a lesson every 150 s by day. The teacher stands at the
    door waving, the town's children within 30 steps go in for the lesson
    (70 s), then burst out running to the hopscotch court and hop about
    14 s, then go home.
  - *Smithy* (R-H19): the smith hammers 9 s at the anvil, sparks flying with
    the blows, then works the forge inside; the forge chimney smokes while
    the forge is hot.
  - *Shows* (R-M09 theatre, R-M11 bandstand; at a bandstand the band plays
    on its floor at the way in, facing out, the listeners in front of the
    open bay): a show of 60 s every 210 s, by
    day and dusk. Up to three players on the stage (the theatre's backdrop
    and its neighbours; the bandstand's floor) gesture and bow;
    residents within 24 steps (p=0.35, when 25 s or more are left) come to
    sit on the tiers or stand round, some clapping. A stage that cannot be
    walked to from the houses has no show.
  - *Vendors* (R-H20 bridge shops; the fill builder's wall booths and
    market cross, `vend`): a shopkeeper or vendor stands at each by day,
    calling out; customers (p=0.1) stop at a booth (`browse`) and go home
    with a basket.
  - *Water* (L52) is also fetched at wall fountains and bailey wells
    (`fetch-water`); *washing* (L60) also goes out on drying lines and
    poles (`hang-washing`), by whoever lives within 12 steps.
  - *Orchard* (`pick`, `basket`): at harvest time (L59's seasons) two pickers
    reach up into the trees by the ladder 5 s and carry a basket of apples
    to the big basket.
  - *Maypole* (`dance`): a dance of 50 s every 180 s by day: up to six
    dancers (children too) circle the pole by the cells round it.
  - *Watermill* (R-H16): a mill for L51 and L59 like a windmill.
    *Warehouse* (R-H17): its loading door is one of L58's places; its own
    people take the goods in.
  - *Not yet:* a link across the ford's stepping stones and a stair up to a
    belvedere in the walking graph; soldiers drilling in the bailey; a
    hoist that lifts.

### Scenes of town life (Derek's request, 2026-11-21)

Small stories a player can stop and watch: people set out carrying things,
set up, do the thing with a few roles, pack up and go home. They share one
register (`src/life/town/scenes.ts`): a big scene (one that takes a crowd)
starts only while fewer than two are on, 40 s or more after the last big one
began, and never while the wedding is gathering its party; the wedding keeps
its own clock and reports to it. One note at a time names a scene with
Watch (`src/app/scene-note.ts`), at most one every 100 s. Life time drives
every cadence, so a held time of day, season or weather keeps them coming.

- **L63 · 2 · A beach day** — sand cells at the water's edge on the walking
  graph, in the part most front doors open onto, gathered into one beach
  where they lie within two cells of each other; four or more, within 40
  steps of a front door, in a town of 8 houses or more, is a beach. The two
  biggest (counting up to 12 cells, then the nearest the town) get up to 7
  posts `beach|pitch|<n>` on the stretch nearest the front doors, side by
  side, facing the water, and one `beach|back|<n>` off the sand behind it.
  **When:** summer weighing half or more of the season, no rain or snow, cloud
  at most 0.8, by day; the first 15–35 s after the town is seen, then 60–120 s
  after the last at that beach ended; with the time of day running, only with
  140 s of day left. **Who:** up to 30 % of the town, one household a pitch
  (a grown-up, up to two children, another grown-up), living within 40 steps,
  called over 30 s, farthest first. **Story:** each goes home to change
  (bathing costume with white bands, knee length, or a white shirt and pale
  rolled trousers; a straw sun hat for some) and comes out carrying their
  part: a furled parasol with a towel rolled round its foot, a folded
  deckchair, a basket, a child's pail and spade, a beach ball. At the pitch the
  parasol is planted (a puff of sand) and the towel laid, the chair opened,
  the basket and pail set down. Then 150–210 s of the day, each doing one thing
  at a time for 22–44 s: lying on the towel, asleep with the hat over the face,
  lounging or reading in the deckchair, sitting on the sand, looking out to
  sea, paddling in the shallows with splashes, swimming out 2 cells and back
  (wading in, a swimmer and a ripple each stroke, wading out); children dig a
  sandcastle (heap, keep, two towers, moat and flag, a stage every 9 s of
  digging), paddle and throw the ball high between two of them. Then each
  folds and picks up their things and they walk home and change. **Rain**
  (over 0.15) or a bomb within 12 cells: everything grabbed at once, towels
  over heads, the parasol held up open as an umbrella, home at a run.
  **Afterwards:** sandcastles stand 240–480 s, then the sea takes them (they
  slump, then go in a puff of sand; in rain 8 s and 30 s). **Must not:** leave
  a thing with nobody: a thing whose owner was called away waits for somebody
  of that house (after 60 s anybody grown-up within 24 steps) to fetch it home;
  the beach erased takes its things and castles with a puff and sends everybody
  home. Bathers are a party (never in a scuffle) and are held by the chain,
  so the wedding and other chains do not take them.
  **The ice-cream cart** (`chains/icecream.ts`, at `beach|back`): once the
  families are set up, a grown-up living within 30 steps wheels the cart down
  (white, a pink lid, a striped umbrella), parks it behind the sand and stands
  at it calling out; residents choosing what to do within 22 steps (children
  half the time, grown-ups a quarter) queue, four at most (two in a line, then
  round to the side, shuffling up), and each in turn gets a cone (2.4 s, the
  seller bending to the tub) and walks off with it held up. When the day is
  over the cart is wheeled home and the queue goes off.

- **L64 · 2 · A snow day** — the biggest square (else the longest street) →
  `snow|man|` at its free cell nearest the middle (two steps or more from the
  festival's snowman, D35) and `snow|side|a`, `snow|side|b` two cells either
  side of it along its longer way. **When:** settled snow (cover 0.5 or more),
  no rain, by day; 15–35 s after the snow has settled, then 150–240 s after the
  last ended. **Who:** up to 8, children first and one to three grown-ups,
  living within 30 steps, in their winter coats and woolly hats. **Story:**
  they come at a run and stand in a ring round the middle (to 40 s); two roll
  snowballs round and round inside the cell, the balls growing ahead of them;
  the big one is pushed into the middle (the body), the second lifted on (the
  middle), a small one rolled for the head; a grown-up gives it coal eyes, a
  carrot nose, coal buttons and stick arms, then a hat and a scarf (34 s, the
  others cheering and hopping); then they split into two sides two cells
  either side of it and throw (40 s): one stoops to scoop, throws, the ball
  arcs high over the snowman and bursts in a white puff on somebody on the
  other side, who jumps; then home. A snowman still standing from before is
  not built again: straight to the fight. **Afterwards:** the snowman stands
  until the snow melts (cover under 0.3): it slumps, the hat slipping and the
  nose fallen, and after 40 s goes in a puff. **Must not:** keep anybody when
  the square goes (everybody home, the snowman with a puff) or a bomb falls
  within 12 cells.

- **L65 · 2 · A harvest supper** — the biggest square (a plaza with a full
  3 × 3) → posts `supper|table|<i>` on a straight run of four (at least three)
  free plaza cells through its middle along its longer way (not cluttered,
  not a doorstep, one level). **When:** autumn weighing half or more, no rain;
  with the time of day running, once a day, starting with 110 s of day left so
  it goes on into dusk; with the time held at day or dusk, 40 s after the town
  is seen and then 300–420 s after the last. **Who:** 40 % of the town, up to
  four a table cell, living within 32 steps: a grown-up for each table cell,
  one for the lanterns, guests. **Story:** each table's carrier brings a table
  top on the shoulder and sets it down (a puff: a trestle table with a white
  cloth, an orange runner and a bench either side; walkers go round, 30 more to
  cross); the lantern-bearer puts up a pole at each end and the string of
  paper lanterns goes up over the table (they glow at dusk); guests come in
  ones and twos, each with a loaf, a basket, a tray of buns or a fish, set it
  on the table before their place and sit, four to a cell, facing across.
  At table 75 s, taking turns to talk (a squiggle over one head, then another);
  40 s in, all stand and raise a toast (3.5 s). Then each takes up what they
  brought (dish, table top, lantern pole) and walks home. **Must not:** stay in
  rain (packed up at once) or with a bomb within 12 cells; leave a table on a
  square that was built over (it goes with a puff, everybody home).

- **L66 · 2 · Picnics** — open grass or garden near the houses (a walking
  cell on bare grass or a garden floor, not a playing field, sand, clutter or a
  doorstep, all four neighbours walkable, 2–30 steps from a front door, in a
  town of 3 houses or more) → up to 4 posts `picnic|spot|<i>` together as a
  picnic ground: the best spot (under or beside trees first, a tree within two
  cells, then nearest the houses) and the best others two to three cells round
  it, two apart. The first blanket has a big parasol over it (the second
  grown-up carries it instead of a basket), and the first child of the ground
  flies a kite high over it (reeled in before they go). **When:** spring weighing half or more (or summer in a
  town with no beach), no rain, cloud at most 0.85, by day; 30 s after the town
  is seen, then 120–220 s after the last ended. **Who:** one household a spot
  (a grown-up with the blanket, up to two children, another grown-up with the
  basket), living within 30 steps. **Story:** the blanket rolled and strapped
  on the shoulder, the basket at the side; at the spot the blanket is shaken
  out and spread (a puff: a checked blanket with a pie, a loaf, apples and a
  jug on it), the basket set at its corner; 110–160 s: the grown-ups sit at its
  sides facing in, talking in turns, now and then lying back; the children run
  round and round it chasing each other, resting on its edge between chases.
  Then the blanket is rolled up and shouldered, the basket picked up, home.
  **Rain** (over 0.15): everything grabbed up and home at a brisk walk.
  **Must not:** leave a blanket down with nobody of its family left to take it
  up (it goes with a puff when the last of them has gone); stay on grass built
  over (everything with a puff, everybody home).

- **L67 · 2 · Carol singers** — a town of 6 houses or more → a round of up to
  6 front doors (`carol|door|<order>` on each doorstep, facing the door), from
  the house nearest the heart, each next the nearest not yet sung to, in the
  main part of the walking graph. **When:** winter weighing half or more, or
  the festival up; at dusk, once an evening with the time running; held at
  dusk or night, one round every 200–320 s after the last. **Who:** up to 6
  living within 30 steps: one or two grown-ups, up to three children, then
  more grown-ups; each carries a lantern on a pole (it glows). **Story:** they
  walk door to door; at each they stand in a half ring on the doorstep facing
  the door and sing 9 s (heads up, a sway, music notes floating up from them),
  and whoever is at home in that house comes out onto the step to listen and
  clap, then goes in; on to the next; home at the end of the round with their
  lanterns. Late arrivals follow on; anybody still on the way when the round
  ends goes straight home. **Must not:** go on with a bomb falling (all home),
  or after the round's doors change.

- **L68 · 2 · Waving the ship in** (run time, `chains/welcome.ts`; the
  places are L27's way-out sockets on dock decks, the water's edge of the
  piers and quays) — a big ship (L38–L40) under way coming in (nearer the
  pier ends than a second before) within 14 cells of one, by day → up to four
  children and a grown-up or two living within reach come running to that pier
  end, stand round it and wave, jump and cheer, turning to follow the ship,
  until 20 s after it has stopped at its berth (75 s at most), then go home.
  A ship going out draws nobody; 60 s rest after each.

### Animals and small motion

- **L29 · 2 · Mechanisms** — fountain jets; clock hands; bells swing at dusk;
  shop signs swing in gusts; doors open as people pass through.
- **L33 · 3 · Cats** — one per 5 house structures, at most 6: nap on sunny
  roofs, wall tops and doorsteps; move at dusk; sit watching a fish stall or
  pigeons.
- **L34 · 3 · Grazers** — wild grass ≥ 30 cells at least 4 cells from any
  structure → 2–5 sheep grazing and hopping between terraces. Chickens in a
  vegetable garden beside a cottage.
- **L35 · 3 · Insects** — butterflies over gardens by day; bees near hives
  and flower boxes.
- **L30 · 3 · Far balloon** — rarely, a hot-air balloon drifts across the
  paper far behind the island.

---

- **LM01 · 2 · Blown about** (run time, no rule: `src/life/mischief/thrower.ts`)
  — a nuke's ring (as it reaches each), a bomb (3.6 cells), a bolt (1.3
  cells) → every person out in the town (`crowd.upend`: out of their walk,
  haunt and errand) and every throwable animal (`critters.ts`: dogs, cats,
  hens, sheep, paddock grazers, soldiers) thrown away from the blast,
  harder nearer the middle; a tumbling arc against the solid map
  (`ground.ts`: walls stop them, roofs are slid off, the sea is swum out
  of), bounce, roll, dizzy 2.4–7.4 s with stars, getting up 3.4 s (sit and
  shake, stand, dust off, look about, fetch a straw hat), a walk to the
  nearest walkable spot (`crowd.settle`). Animals: on their backs, legs in
  the air, then home. A fast body bowls over whoever it hits. Undo or a
  called-off act: all set down at once.
- **LM02 · 2 · The Hand** (the Mischief drawer, `src/ui/hand.ts`) — press on
  anybody out in the town or a throwable animal → held, wriggling, carried
  0.9 over the roofs under the pointer; released still → dropped; released
  moving → thrown at the pointer's speed (at most 15 units a second); then
  as LM01. Escape or another tool → put down. Nothing saved, no undo step.

### Raids (Derek's request, 2026-11-21)

Run time, no rule: `src/life/raid/` (design section 13b, "Raid"). Never
saved: a raid's fires are ordinary damage that mends; one undo puts them
back.

- **L69 · 2 · A landing raid** (`raid.ts`, `site.ts`) — the Raid tool, or a
  raid on its own (L72) → a longship (5.4 long; a striped red-and-white
  square sail, a dragon prow, nine painted shields a side, seven oars a side)
  comes in over the edge of the map to a turning point off a beach near the
  town (sand first, then any low shore; open ground behind it; a straight run
  in; a clear circle to spin in), spins under oars and rows up onto the sand.
  A horn from the ship; the alarm bell; up to four townspeople nearest the
  shore stop and point. **The band:** 8 + one per 6 buildings, at most 16: a
  chief (bigger, red cape, the horn) and raiders in thirds with a flaming
  brand, an axe or a club; horned (a quarter winged) iron helmets, big beards
  (some plaited), fur capes, a round shield on the back. They jump over the
  side and wade in, then charge a few cells up the shore under "RAAR!" and
  rune balloons (one every 5–14 s each). **The sweep:** then the band splits
  into parties of three (a brand, an axe, a club) that run on through the
  streets to their own quarters of the town (each as far from the others as
  it can be, within 26 cells; the market, warehouses, a rich house, the mill
  preferred), fan out (each raider his own cell and spot; never two at a
  door), and work there. **Brands** set alight what burns best in their
  quarter (stalls, mills, barns and cottages first; 22 % of the town's
  buildings, 4–16, never the chapel) through the Lightning tool's fire (it
  spreads as any fire does); a brand trails smoke.
  **Axes and clubs** kick in a door (0.7 s), go in (2.4 s), come out with
  loot by the building's role (a warehouse: barrels, sacks, chests, cloth; a
  shop: cloth, cheese, a candlestick; a barn: a pig, a hen; a house: a ham,
  a sack…) or take it off a stall (on market day its baskets go too, put
  back after), and run it back to the pile by the landing (twelve places),
  then back to their quarter; two trips each. The chief walks to the quarter
  nearest the town's heart with his swallowtail standard (red, a yellow
  border, a raven) high over the roofs. **The town fights back:** every
  7–14 s the boldest townsperson near a raider (a castle guard first, else one
  in five) runs at him with a broom or a frying pan and the two vanish into a
  dust-cloud brawl (L50's scuffle, started on purpose); the raider loses four
  times in five, sits dazed with stars and runs back to the boat. Hens near a
  raider scatter. A pig or a hen carried aboard jumps ship a moment later and
  swims back to the shore. Raiders are drawn bigger the further off the camera
  is (up to 1.8 times), shields held up red and yellow at their side. Townspeople within 7 cells of a raider run: home if home is
  clear of them, else to the nearest place 10 cells clear; they come back as
  usual. A wedding, beach day, snow day, supper or carols within 9–10 cells
  is called off. **Recall** at 95 s ashore (35 s if there is nothing left to
  do): the chief blows the horn; all run back to the landing, each takes up a
  piece of the pile and wades out; the loot heaps up amidships. The ship
  backs off, spins, sets sail and goes over an edge. A raider not back 40 s
  after the horn is left behind (L71). About two minutes in all.
- **L70 · 2 · A boats raid** (`raid.ts`, `site.ts`) — as L69, but no ship
  (Derek, 2026-11-22: "don't use the big longboat"): two to four clinker
  rowing boats (two shields a side) row in from beyond the edge of the map,
  one behind another over the same water, oars in time, a raider standing in
  each bow (the chief with his standard, the rest with a brand or an axe held
  up), each by its own way to its own landing (at least 4 cells apart: hit
  from more than one side). They run up in the shallows and wait there while
  the band is ashore; each crew comes back with the loot (a chest in the stern
  sheets, sacks and a barrel forward), and each boat turns about and rows off
  over the edge as soon as its own crew are in. Chosen when the shore by the
  town is no beach, and by chance (72 % landing when a beach is within 12
  cells).
- **L71 · 2 · Stopping them** — the Bomb, the Nuke and Lightning hit the
  ships as they hit any ship, by distance (a bomb: broken within about 1.3
  of the hull, burning within 1.9, scorched within 2.7; lightning: burning):
  scorched, the sail is torn and it sails on; burning, it burns 7 s and goes
  down; broken, it goes down at once. A ship gone down cannot carry the
  band: before it lands, the raid never happens and everybody aboard swims
  off over the edge of the map; with the band ashore, they are stranded, lose
  heart after 4 s, and run for the sea with up to six townspeople after them
  shaking their fists; they wade in and swim away, horns bobbing. The Hand
  (LM02) lifts the longship and the boats, the crew clinging on in their
  seats: put back in the water they row back to their place; dropped on the
  land they lie over on their side there (the band stranded, as if sunk). A boat sunk
  takes its crew swimming; its raiders ashore crowd into another boat still
  there; the last boat sunk, the band is stranded as above (all sunk before
  any lands: the raid never happens). Anything gone down stays under: nothing
  that moves on the water is drawn below the sea's surface (one clip in the
  movers' shader), so no hull, mast or swimmer ever shows under the slab. Blown
  away or carried off by the Hand (LM01, LM02), a raider gets up and carries
  on, or is left behind.
- **L72 · 3 · Raids on their own** (`raid.system.ts`) — the menu's
  Raiders switch on (the default, kept in the browser) → a raid comes on its
  own after 8 minutes of play with the town shown, then every 12–20 minutes:
  only on a town of 14 buildings or more with a shore a ship can reach, by
  day, never at a wedding, on top of two other big scenes, or while other
  mischief is going on. Time held at noon does not stop them; held at night
  they wait. Each holds the act open: one undo puts it all back.
- **L73 · 2 · The Raid tool: where you click, as many as you like**
  (`site.ts` `planAt`, `raids.ts`; Derek, 2026-11-25: "the boat goes to the
  nearest coast on where you clicked … you can just spam them"). A click
  (on the sea, the land or the town) → a party lands on the stretch of shore
  nearest it that a vessel can reach (the very nearest if it can; else the
  next nearest; refused only if the island has no reachable shore): a
  longship where there is a beach to run up there, two or three rowing
  boats to landings beside each other where there is not. It comes in by the
  shortest clear way from the edge of the map, so it appears on the side
  clicked. Raids on their own still choose their own site (L69, L70). Every
  click brings another party, whatever is going on: each its own ship,
  landing, band, loot pile and horn. A new party never lands within 2.6
  cells of another's landing (a second click on one spot lands beside the
  first) and plans its way clear of the others' ships and beached hulls; at
  sea a newer party lies on its oars while an older one's vessel is close
  ahead (12 s at most). No building is gone for by two parties, and nothing
  is looted twice while raids are on. Raiders alive at once, all parties
  together: at most 40 (24 on a phone-sized screen); past that a party is a
  token crew of 3, and past half as many again the chief comes alone. One note ("Raiders off the coast!") while any raid is on;
  at most four raid sounds at once and one horn at a time; at most six war
  cry balloons. All the parties share one open act: one undo puts the town
  back as it was before the first of them and ends them all.
- **L74 · 2 · The garrison turns out** (`sally.ts`; Derek, 2026-11-25:
  "i want the castle guards to fight the raiders if there is a castle guard
  of people. they can repel one viking raid successfully") — a raid sighted
  (2 s in) in a town with a castle garrison (L36) that can reach its landing
  on foot → the alarm bell, the note "The castle's garrison marches out to
  meet the raiders!", the troop leaves its round and forms up at the gate
  (marching off once half are formed; the rest fall in at a run), and marches
  out at the double (1.05 cells/s) along the streets to the landing, a tall
  banner in the castle's colour at its head, the rider (L37) a horse's length
  ahead. Within 4 cells of the band (or at the landing) each soldier runs at
  the nearest raider nobody else has (two on one at most) and the pair vanish
  into a dust cloud (several at once, drawn by the raid; 2.2–3.6 s). The
  soldier wins 80 % alone, nearly always two on one; the loser sits dizzy with
  stars (2.6 s), then runs: a raider for his ship, a soldier back to the gate.
  When 40 % of the band (3 at least) is beaten it breaks: the horn early, back
  to the ship, nothing more set alight, everything taken left behind (the pile
  cleared, nothing aboard). The soldiers stand on the shore facing the sea,
  cheering, until the ship is away, then walk back to their places in the
  round, which carries on from there; the garrison rests 120 s before it will
  turn out again. One party at a time: others raid as usual; it goes for the
  first sighted it can reach. Undo puts the soldiers straight back; a raid
  that ends otherwise (its ship sunk) sends them home. A soldier in the air
  (blast, Hand) is missing from it until he is down. No castle, nothing
  changes. Raids on their own are met the same way.

- **LM03 · 2 · The UFO** (the Mischief drawer; run time, `src/life/mischief/ufo.system.ts`)
  — a click → a saucer from beyond the edge at a cruising height above the
  island's tallest thing (its own lane, a step above any other about), straight
  down over the click (3 s), hovering clear of roofs, towers and trees round it
  and above any other saucer there; the nearest person out of doors within 4
  cells of the click, nobody else (else it searches 3.2 s and leaves), beam on 0.5 s, the lift (thrower.grab, errand fallen through,
  a hat or load knocked loose; rising faster as it goes, about 3 s), in at the
  hatch, off (1.6 s), away 20–40 s, back over a walkable spot 6+ cells from
  where it took them, down the beam (2.4 s), let go 0.75 above the ground,
  dizzy 3.5 s, up, home. No limit to how many at once (each its own catch). Undo, a called-off act, a new or
  opened town: all gone at once, the person set on their feet.

## U — Urban fill

Rules that make leftover and in-between space into something, the way real
towns do. This part is a seed: discovery passes (design section 21) are
expected to at least double it. New terms: a **leftover** is a connected
patch of bare grass cells bounded on every side by structures, floors,
fences, walls, cliffs or water. A **verge** is a bare grass cell beside a
street cell.

- **U01 · 2 · Pocket park** — a leftover of 2–12 cells touching a street or
  plaza → a bench, one or two flowerbeds or shrubs, a low hedge on its open
  sides.
- **U02 · 2 · Paddock or walled garden** — grass of 6+ cells fully enclosed
  by player-placed fences or walls: with 3+ trees inside → a park with
  benches and a worn loop track; enclosed by walls → a walled garden with
  beds and espalier trees; otherwise → a paddock with 2–4 grazing animals
  and a trough.
- **U03 · 1 · Front garden** — exactly one grass cell between a house's main
  door and a street → a derived picket fence along the street edge with a
  gate at the door, flowers either side of a short walk.
- **U04 · 2 · Back yards** — a leftover of up to 6 cells behind row houses
  (facing no street) → divided per house by low fences; sheds, vegetable
  patches, washing poles.
- **U05 · 2 · Street trees** — a straight street segment of 6+ with verge
  cells along one side → a small derived tree every 3rd verge cell (a prop,
  not a block).
- **U06 · 2 · Town edge** — a street dead end facing wild grass → the paving
  frays into a dirt trail for 2–3 cells with a signpost; outward-facing rear
  walls on the town's edge get woodpiles and vegetable plots p=0.4.
- **U07 · 1 · Retaining wall** — a terrain step of 1+ beside a street or
  plaza → a stone retaining wall face with drain holes and creepers in place
  of raw earth.
- **U08 · 2 · Nooks** — an empty ground cell under a deck or bridge, or
  beside a stair or grand steps, enclosed on 2+ sides → by seed: stacked
  crates and barrels, a small kiosk, a wall fountain, a cart, a sleeping
  cat.
- **U09 · 2 · Vista end** — a straight street of 5+ ending at a structure's
  facade → that facade cell gets a feature: clock, statue niche, grand
  doorway or oriel window, by the structure's role.
- **U10 · 2 · Corners** — a house at a street junction with two street-facing
  sides → corner entrance with a chamfer, or a corner oriel on the upper
  storey; shops become corner shops with windows on both sides.
- **U11 · 2 · Civic hall** — a house structure with footprint ≥ 8 cells and
  a facade on a square (a role, evaluated before R-H06) → town hall: arcaded
  ground storey, balcony over the door, clock gable, flag.
- **U12 · 2 · Centre and edge** — houses within 4 cells of a square get a
  stone ground storey and richer trim; houses more than 10 cells from any
  floor get rustic variants (thatch, timber, rough stone).

Added in discovery round 1 (`docs/swarm/discovery/round-1.md`):

- **U13 · 2 · Country lanes** (UF-04) — a run of 4+ street cells with no
  building, square, stall or fountain within 3 → no lamps (D01); a hedgerow
  down one side on the grass verge (a seeded hand for the whole town), a
  field gate in a long hedge and in any gap left in a fence along the lane,
  a milestone every 8th cell on the other side. Not on a verge with another
  use, against a placed fence, or where people walk across.
- **U14 · 2 · Burgage plots** (UF-01) — more than 6 cells of grass shut in by
  placed fences or walls and the backs (no main door) of 2+ houses on one
  side → one long garden per house: a low picket fence out from each party
  line to the far fence; from the house out a bench in the sun (gardens
  facing south), vegetable patches, a washing pole, a shed or compost heap,
  and a fruit tree at the far end. Before U02 (with 3+ trees it stays a park;
  with no house against it, a paddock); smaller patches stay U04 back yards.
- **U15 · 2 · Village green** (UF-02) — bare grass with no other use, looked
  across from opposite sides by the ground storeys of 2+ houses (each house
  looks 8 cells out across three columns; trees do not block the view),
  trimmed to open space (cells in some 3 × 3), 9–100 cells, 4+ houses in all,
  touching a street, no square within 4 → a mown sward a shade lighter than
  the meadow (no outline), a maypole near the middle clear of trees
  ('activity'/'dance'), a ring bench round each tree on or beside it (four
  seats), a village sign by the street. Not a single row's frontage, a gap
  between houses, a square's lawn, or any ground with another use.
- **U16 · 2 · Shops in the wall** (UF-03) — a run of 3+ blank (no door,
  window, arrow slit or other feature) ground-storey cells of one marble
  wall, 2+ storeys tall there, with standable ground at its foot, looking
  out on a street, plaza or ground within 2; not a keep, gatehouse, quay
  wall, temple or plinth → every second cell (a map lattice): facing a
  street or plaza within 2, an arched booth with goods and a lantern under
  its canopy ('activity'/'vend', 'browse'), once in a run of 4+ a wall
  fountain ('activity'/'fetch-water'), and the grass strip in front paved;
  facing ground, a storeroom door, a niche bench or two-storey ivy. Props
  against the wall (the generator cannot recess it).
- **U17 · 2 · Drying green** (UF-12) — a leftover of more than 6 and up to 20
  cells, unfenced, touching no street or square, shut in by the backs of 3+
  houses (not a courtyard: D17 takes buildings-only patches up to 16 that
  are 2+ across both ways) → 2–3 washing lines on posts, each two cells
  long and a cell apart ('activity'/'hang-washing'), a basket of washing
  ('activity'/'basket'), one or two sheets bleaching on the grass.
- **U18 · 2 · Orchard** (RC-04) — 6+ trees on the ground on grass or garden
  (not plaza or sand), each 2 from another along x or z and none right
  beside another, holding a full 2 × 2 of the lattice (the `orchards` fact,
  base-only) → the grass between the rows mown (sward), a ladder into one
  tree in four ('activity'/'pick'), a basket of apples under another one in
  four ('activity'/'basket'), two beehives on the south edge. Not a grove,
  a single row, or planter trees. The trees become fruit trees once R-P01
  reads the fact.
- **U19 · 2 · Forecourt at the foot of grand steps** (UF-10) — the cells a
  flight of grand steps descends onto, its full width and 2 deep, where bare
  ground (no water, block, floor or other use, at the stair's foot level) →
  stone paving; where a path or plaza lies straight ahead within 4, the
  paving runs on to meet it.
- **U20 · 2 · Quay apron** (UF-09) — a straight run of bare ground (grass or
  sand, no block, floor or other use) of up to 4 cells from a street to a
  quay (R-D01) or quay wall (R-M05) → cobbled flush with the street; on its
  water side a net rack or a stack of barrels or crates now and then. Not a
  beach with no quay, not a pier's or jetty's foot.
- **U21 · 2 · Castle bailey** (UF-05) — a leftover of 4+ cells shut in by 2+
  of a castle's parts (keep, gatehouse, curtain wall, castle turret), one of
  them a keep or gatehouse, no water on its bounds (before fields, so a
  curtain-walled yard is never a walled garden) → packed earth, a well near
  the middle ('activity'/'fetch-water'), a lean-to stable with a horse
  looking out against the curtain wall, hay, a practice dummy and an
  archery butt. (Garrison drill and stabling the rider's horse here are the
  life builder's.)
- **U22 · 2 · Ford and stepping stones** (UF-08) — two path dead ends on the
  ground facing each other straight across 1–2 cells of open water, no arch
  within 2 (the `fords` fact) → three stepping stones across each water
  cell, with a ripple ring round each; D03 puts no view bench at a ford's
  ends. 'activity'/'ford' and 'ford-far' sockets at the two ends for the
  walking graph (a link there is the life builder's).
- **U23 · 2 · Belvedere garden** (UF-11) — a marble terrace (R-M07) with 9+
  standable top cells, its top 2+ levels above the ground at its foot, and
  no floor or piece on top → citrus trees in pots on a grid of its inner
  cells and in a row along the parapet, a pergola with a table at its middle
  (two seats), stone benches looking out from the middle of each edge. The
  walkable stair up to it is not built (a walking-graph link: the life
  builder's).

---

## F — Feedback

- **F01 · 1 · Landing** — a placed piece drops 0.4 of a cell, squashes to
  0.85, overshoots to 1.08 and settles, 280 ms in all, with a dust ring.
- **F02 · 1 · Neighbour wobble** — any structure whose shape changed because
  of the edit rocks ±2° and settles in 300 ms.
- **F03 · 1 · Auto morph** — an Auto block whose resolved kind changed:
  sparkle burst and a 200 ms squash before the new shape lands.
- **F04 · 1 · Removal** — the piece shrinks and puffs away; props that lose
  their slot pop.
- **F05 · 1 · Pop-in** — newly derived props appear one after another,
  100 ms apart, each with a small bounce (a street's lamps pop up in order).
- **F06 · 2 · Sound** — a soft placement note pitched by height and timbred
  by kind; a pop on removal; quiet sea, wind and gull ambience; one bell at
  dusk.
- **F07 · 1 · Auto markers** — with the Change tool selected, Auto blocks
  show a small ✨.
- **F08 · 1 · Refusal** — an illegal action shakes the ghost (or the tool
  button on touch) and plays no landing.

---

## Counts

Roles 46 · Joinery 28 · Decoration 32 · Life 36 (and the run-time raids L69–L72) · Urban fill 12 ·
Feedback 8 = 162 rules here, plus 5 kind rules and 4 support rules in the
design. 80 of the 160 are tier 1. Discovery passes add to every part.
