// Ships launched from a shipyard (src/life/town/chains/shipyard.ts) on the
// harbour's news (news.ts), so the small boats give way to them as they do to
// the visiting ships. The harbour empties the news each frame (order 40);
// this adds the new ships to it after (order 41), before any boat moves.

import { defineSystem } from '../api';
import { launchedOn } from '../town/chains/shipyard';
import { newsOf } from './news';

export default defineSystem({
  id: 'launched-news',
  order: 41,
  create: (ctx) => ({ stage: ctx.stage }),
  update(st) {
    const fleet = launchedOn(st.stage);
    if (!fleet.length) return;
    const news = newsOf(st.stage);
    for (const l of fleet) {
      if (!l.body) continue;
      news.ships.push({ x: l.pose.x, z: l.pose.z, yaw: l.pose.yaw, stern: l.size.stern, bow: l.size.bow, halfBeam: l.size.halfBeam, speed: l.phase === 'sail' ? l.speed : 0 });
    }
  },
});
