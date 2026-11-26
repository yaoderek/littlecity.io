// J23-P: the harbour office, at the land end of the port's yard: a small
// white cabin with a band in the harbour's blue, a flat roof with a white
// parapet, windows all round to watch the quay, a door toward the water,
// and a flagstaff on its roof (socket 'flag-mount': D15-P flies the flag).
//
// Frame: the bottom centre of the dock cell's seaward face, +Z out toward
// the water. The deck is at y = CELL_H; the cabin stands in the middle of
// its cell (z = −0.5).

import { CELL_H } from '@/core/grid';
import { translation } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN } from '@/gen/mesh';
import { PALETTE, RAMPS } from '@/style/palette';
import { floodlight } from './kit';

export default definePart({
  feature: 'port-office',
  build(_item, ctx) {
    const b = ctx.mesh();
    const y = CELL_H + 0.02, zc = -0.5;
    const w = 0.7, d = 0.62, h = 0.62;
    const x0 = -w / 2, x1 = w / 2, z0 = zc - d / 2, z1 = zc + d / 2;
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.stone, ink: 'plinth' }, () => b.box([x0 - 0.03, y - 0.02, z0 - 0.03], [x1 + 0.03, y + 0.05, z1 + 0.03], { skip: ['bottom'] }));
    b.with({ color: PALETTE.white, pattern: PATTERN.plaster, ink: 'walls' }, () => b.box([x0, y + 0.05, z0], [x1, y + h, z1], { skip: ['bottom', 'top'] }));
    // A band of the harbour's blue under the roof.
    b.with({ color: RAMPS.roof[1]!, pattern: PATTERN.none, ink: 'band' }, () => b.box([x0 - 0.015, y + h - 0.13, z0 - 0.015], [x1 + 0.015, y + h - 0.04, z1 + 0.015], { skip: ['bottom', 'top'] }));
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.none, ink: 'roof' }, () => b.box([x0 - 0.04, y + h, z0 - 0.04], [x1 + 0.04, y + h + 0.05, z1 + 0.04]));
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'parapet' }, () => {
      b.box([x0 - 0.04, y + h + 0.05, z0 - 0.04], [x1 + 0.04, y + h + 0.11, z0 + 0.0]);
      b.box([x0 - 0.04, y + h + 0.05, z1 - 0.0], [x1 + 0.04, y + h + 0.11, z1 + 0.04]);
      b.box([x0 - 0.04, y + h + 0.05, z0], [x0 + 0.0, y + h + 0.11, z1]);
      b.box([x1 - 0.0, y + h + 0.05, z0], [x1 + 0.04, y + h + 0.11, z1]);
    });
    // Windows on every side, a door toward the water.
    b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'windows' }, () => {
      b.box([x0 + 0.08, y + 0.28, z1], [x0 + 0.3, y + 0.46, z1 + 0.02]);
      b.box([x0 + 0.08, y + 0.28, z0 - 0.02], [x1 - 0.08, y + 0.46, z0]);
      b.box([x1, y + 0.28, z0 + 0.1], [x1 + 0.02, y + 0.46, z1 - 0.1]);
      b.box([x0 - 0.02, y + 0.28, z0 + 0.1], [x0, y + 0.46, z1 - 0.1]);
    });
    b.with({ color: RAMPS.roof[1]!, pattern: PATTERN.planks, ink: 'door' }, () => b.box([x1 - 0.3, y + 0.05, z1], [x1 - 0.1, y + 0.45, z1 + 0.025]));
    b.at(translation(x1 - 0.2, y + 0.5, z1 + 0.03), () => floodlight(b, [0, 0, 0], 0.09, 'door-light'));
    return { mesh: b.build(), anchors: { 'flag-mount': translation(x0 + 0.08, y + h + 0.05, z0 + 0.08) } };
  },
});
