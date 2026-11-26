# Grow a town

`growTown(terrain, seed, { avoid?, character? })` (`avoid`: the characters the dice showed already) returns the ordered edits
of a whole town; `planTown` returns the same with what it decided (the
character, the districts, the square). Pure and seeded; every edit passes
`canApply` against the town grown so far (`grower.ts`).

## A town has a character

An island cannot hold every building the game knows, and a town that tries
looks like a catalogue. So each town is one kind of place, with a second
kind flavouring it. `character.ts` rolls them from the seed, weighted by
what the island offers (`islandTraits`: its largest flat square, its
highest ground, how much river, how much coast):

| Character | Leans on | Builds (in priority order) | Leaves out |
|---|---|---|---|
| **Harbour town** | long coast | the waterfront is the town: a big container port first (`districts/port.ts`: docks 3 to 5 deep and 10 to 14 long against the straightest stretch of shore, a little bay behind its first row filled in, so its cranes are a large gantry crane and a medium one or more; a freighter's way in and out; warehouses behind; only where no coast has room, a shorter one with a medium crane), a second port on another long stretch well apart from the first where there is one (then the last two quays are left out, so the town does not take the whole coast), a shipyard (docks 3 wide running 8, 7 or 6 straight out, its warehouse behind the land end), a great harbour (a galleon berth, warehouses, a pier, stilt houses, a boathouse, a quay wall), then up to four more quays along the coast (each a berth of eight where the sea is wide, else six, five or four docks, with a warehouse and a fish stall), two more waterfronts (pier, stilt house, boathouse), a fish market on a little plaza, jetties; the lighthouse; housing, chapel, smithy | castle, temples, fields, farms |
| **Marble city** | a broad flat site | the forum (below); the acropolis; three shrines (small temples on four pillars); after the streets, three colonnades (pillars and a marble beam along a street) and three monuments (an obelisk or victory column on a small square by a street); four shrines; a folly tower; two viaducts; fine housing and courtyards; the manor | farms, fields, castle |
| **Castle town** | high ground | the castle (keep, curtain walls, four turrets, gatehouse, bailey); after the streets, a town wall round the heart (wall pieces on the free ground of a ring round the square, an arch over each street that crosses it: gateways, towers at the corners: turrets); three walled towers on the heights; watchtowers; walled gardens and lawns; smithy, chapel and churchyard, hilltop, tight housing | temples, farms |
| **Market town** | gentle ground | a square with a market cross, town hall, inn, clock tower; the great market (a plaza 9 × 6, or 7 × 5, with two rows of stalls, a market cross, and a market hall along one side: a long marble roof on pillars, a stoa) with streets in at its corners; after the streets, up to four smaller market places; three to five housing blocks; two courtyard blocks; a schoolhouse; a smithy; an inhabited bridge where there is a river; an orchard on the outskirts; a small container port (6 to 9 long, one medium crane) within 22 steps of the square where the coast allows, so ships supply the shops through the carters | castle, temples, farms |
| **River town** | a long river (the character is not rolled without one) | a square near the river; the river front (a walk along both banks for the river's whole length, two-storey houses one cell back facing it); bridges first, then two inhabited bridges and two more watermills; the riverside (barge landings far apart by water, willows, a reed bed, a boathouse, a watermill); a mill on the bank; a shipyard where it has a sea shore for one; orchards; a park; housing | castle, temples |
| **Farming village** | a broad plain | a small village centre (a plaza with a well and the inn: no town hall, no clock tower) by the green, the chapel; then the farmland as most of the island: wheat fields by their windmills side by side (up to five, 5 × 5 where there is room, smaller where the ground is broken), two wheat farms (windmill, wheat, barn off the road, farmhouse), vegetable plots by their farmhouses, barns by their fields, three orchards, three paddocks, two greenhouses, fenced edges and lanes; cottages only near the green; nothing from a second character | housing blocks, courtyards, castle, temples, sports courts |
| **Hill town** | steep ground | a square on the low ground; the hilltop (observatory or lookout cottage); up to eight terraced rows of houses stepping up the hill (standing against the rises and on the high shelves, highest first) with stairs and viaducts between them; the castle on a shelf; cliff houses; a walled tower; the acropolis; a mill corner; a folly tower; watchtowers | farms, fields |
| **Garden town** | gentle ground | the manor and its park; three parks with bandstands; two walled gardens and two walled lawns; two greenhouses; two orchards; playing fields; a schoolhouse; a folly tower; after the streets, four flower beds; avenues of trees along nearly every outer street; the most woodland | castle, farms, temples |

A castle town whose castle finds no site, and a marble city whose forum finds none, grow as another kind of town instead. The secondary character adds its own showpieces (for a castle, the castle
and a smithy; for a river, the riverside and the inhabited bridge…) after
the primary's first districts, so two towns of one character still differ (not in a farming village: they would crowd the farmland).
Every town gets the shared basics where they fit: a square with its town
hall, a chapel, an inn, some shops, a lighthouse on the sea, streets.

`PROMISES` in `character.ts` lists what each character must show; the
tests and the `grown-*` scenarios check it.

## Trees

Every town is wooded (`districts/emphasis.ts`): after the cottages, woods
fill the land the town left bare (clumps by a seeded noise, so five or more
touching trees make groves), tree lines run along the streets out of town
(an avenue every other cell), and the character sets how much of each:
the most in a garden town and a hill town, the least in a harbour or marble
city. Near the heart only the high ground is wooded (a copse on the hill
above the town). The survey's floor: 35 trees in every town, and orchards
(farming two, market, river and garden one). Orchards (12, 9 or 6 trees two apart in rows, with a clear ring round them so no other tree makes them a grove; U18 gives them ladders, baskets and hives) grow in the farming village (two or three, among the fields), the
river town, the garden town, the market town's outskirts and the castle
town.

## How the planner chooses

`PLANS` in `index.ts` lists each character's districts in priority order.
Some districts need the streets laid first (a colonnade along a street, a
market place or a monument beside one, a town wall the streets cross): they
run after the streets join up (`AFTER_STREETS`). Each district is a stamp (`districts/*.ts`) that searches the whole island
for the site that suits it (flat enough, free, at the right distance from
the square, near water or high up as it needs) and claims its ground with a
margin. The first districts get the best ground; a district that finds no
good site is left out rather than squeezed in. Then streets join every
district to the square (`route.ts`: crossing water by bridges and
boardwalks, climbing faces by stairs on stepped marble), cottages fill the
streets (dense at the heart, thinning out; sparse in a farming village),
and trees go in.

## The forum

The marble city's heart (`districts/forum.ts`), composed on one axis:
a belvedere terrace; the temple on its podium (shops in the podium's walls
where the forum runs along them); a grand stair down to the forum with
guardians at its head; the forum (an obelisk or victory column on the axis,
statues on plinths flanking the stair, a bandstand, a fountain, stalls); a
stoa closing the east side; a theatre facing it from the west; the town
hall and an inn along the south. Parts beyond the podium, stair and forum
are built only where their own ground is flat and free.

Its forms, grandest first (`SIZES`): 17 × 7, 15 × 6 and 13 × 6 courts
(13 wide, 13 deep of flat ground at least), and the **compact** form: a
temple on a 5 × 4 podium, a grand stair, a 9 × 5 court with the obelisk,
and a stoa closing the court's south side (9 × 12 of flat ground).

**Levelling the site** (`levelling.ts`). A marble city stands or falls by its
forum, but no island lacks one for want of flat ground: when none is flat
enough, the planner levels a terrace with the game's land edit, choosing
the rectangle that costs least earth (within two levels for the 13-wide
form, then the compact form within two, then three, then right to the
shore). The land edits come first in the growth, are saved with the town
and go with its undo. A castle town does the same for a small castle on
a knoll toward the high ground. Generator 2, seeds 1-40: the marble city
is offered on 39 (seed 18 is a ring of land round a lagoon with no 9 × 12
of land anywhere); the castle town on all 40.

## The mill corner

In farming, garden, market and hill towns (`districts/mill-corner.ts`): a
big windmill on the ground at the edge of town, high where the wind is,
the miller's house against it (R-H03: sacks and a cart), two cottages on
the lane, a little wheat field beside the mill (a garden within two of a
windmill is wheat, on purpose), a kitchen garden, a well and a tree in the
yard, a picket fence with a gate where the lane comes in. It replaces the
folly (a windmill on a tower on an arch run on pillars), which was built
only to show several roles at once.

## Windmills in every town

Derek, 2026-11-21: "I really like the look of windmills and I want to see
more of them." Once the streets are joined, before the cottages, trees and
woods take the ground, every town adds windmills (`districts/mills.ts`)
until it has its kind's number (counting a farm's mills and the mill
corner): two in harbour, marble, castle, market and river towns, three in
farming and garden towns, four in hill towns. The forms, each kind trying
its own first:

| Form | What | Kinds |
|---|---|---|
| hill | a lone mill on a rise or a headland (high, open to the sea), a path to it | marble (the outskirts or the acropolis hill, never the forum), castle, hill, harbour |
| shore | a mill on the shore near the square and the docks | harbour, marble |
| small | the small mill corner: the mill, one cottage against it (a mill house), a 2 × 2 wheat patch fenced on its far side | everywhere |
| field | a mill at a field's edge with a 3 × 2 wheat strip (a scarecrow) | farming, garden (a row along the fields) |
| market | a mill and its cottage a street's length from the square, so the bread chain (grain, mill, baker: L51) runs short | market |
| town | a tall town mill on a tower of two in a dense quarter, with its gallery (R-W01 raised, J25) | market, castle, hill, harbour |

Every mill keeps clear air (nothing built within one or two of it, nothing
within two as tall as its sails; its ring is kept clear of later building),
stands seven or more steps from any other mill, has no garden within two
that is not wheat already (R-G01 would turn a park or a kitchen garden into
wheat), and stands within eight steps on foot of the streets joined to the
square, with a path from its door. Heights vary (two or three storeys on
the ground; the town mill on its tower), and the cap's roof colour comes
from the mill's seed. A town whose streets reach little of its island
takes one mill wherever the land allows. River towns keep their watermills
too. The survey prints windmills per town by kind and holds the floor: one
or more in 95% of the towns of every kind, two or more in most, three or
more in most farming, garden and hill towns.

## Files

`grower.ts` the running world and claims · `site.ts` reading the island ·
`frame.ts` stamps' turned frames and the search · `town.ts` districts and
rectangle helpers · `route.ts` streets, bridges, climbs · `character.ts`
characters · `index.ts` the plan and the watching order · `districts/` the
stamps.

## Known weak

- A hill town's terraced shelves are joined to the square by stair climbs;
  on some islands a climb lands inside the castle's walls, and walkers then
  reach those shelves only through the bailey, so fewer houses there reach
  the square on foot (generator 2, seed 5: 31 of 74).
- The castle town's town wall uses only free ground on its ring, so it has
  gaps where houses already stand.
- Windmills: the market form (a mill a street's length from the square)
  rarely finds clear air round a busy square, so market towns mostly get
  the town mill on a tower instead; a raised mill's door is up on its tower,
  so the bread chain sends its errand to another mill. The mills differ in
  height, setting and cap colour only: the windmill generator draws every
  body white.
