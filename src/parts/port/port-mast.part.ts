// J23-P: a floodlight mast at the corner of an aisle in the port's yard: a
// tall pole as high as the cranes' portals and more, a ladder up it, and at
// the top a gallery with a ring of floodlights that light up at dusk.
//
// Frame: the dock cell's centre (level 0), world axes; params cx, cz put it
// at one corner of the cell. Socket 'perch': the gallery's rail (gulls).

import { CELL_H } from '@/core/grid';
import { compose, rotationY, translation } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN } from '@/gen/mesh';
import { PALETTE } from '@/style/palette';
import { floodlight, member } from './kit';

export const MAST_H = 3.4;

export default definePart({
  feature: 'port-mast',
  build(item, ctx) {
    const b = ctx.mesh();
    const x = (item.params?.cx ?? 1) * 0.36, z = (item.params?.cz ?? 1) * 0.36;
    const y = CELL_H + 0.02;
    const top = y + MAST_H;
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.stone, ink: 'foot' }, () => b.box([x - 0.09, y - 0.02, z - 0.09], [x + 0.09, y + 0.08, z + 0.09], { skip: ['bottom'] }));
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.metal, ink: 'pole' }, () => b.at(translation(x, 0, z), () => b.lathe([[0.055, y + 0.08], [0.03, top]], { segments: 8 })));
    // A ladder up the pole's land side.
    b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'ladder' }, () => {
      for (const s of [1, -1]) member(b, [x + s * 0.035, y + 0.4, z - 0.07], [x + s * 0.025, top - 0.1, z - 0.05], 0.014);
    });
    // The gallery and its lamps, all round.
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'gallery' }, () => {
      b.at(translation(x, 0, z), () => b.lathe([[0.03, top - 0.02], [0.2, top], [0.2, top + 0.04], [0, top + 0.04]], { segments: 10 }));
      b.at(translation(x, 0, z), () => b.lathe([[0.19, top + 0.04], [0.19, top + 0.12], [0.17, top + 0.12], [0.17, top + 0.05]], { segments: 10 }));
    });
    for (let k = 0; k < 4; k++) b.at(compose(translation(x, top + 0.16, z), rotationY((k * Math.PI) / 2 + Math.PI / 4)), () => floodlight(b, [0, 0, 0.12], 0.13, `lamp${k}`));
    return { mesh: b.build(), anchors: { perch: translation(x + 0.18, top + 0.12, z) } };
  },
});
