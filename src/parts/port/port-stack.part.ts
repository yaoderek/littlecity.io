// D15-P: a container bay's deck cell. Drawn as nothing: the containers on
// it are the port's life (src/life/port); this only tells the walking graph
// (src/resolve/nav.ts) that the cell is cluttered.

import { definePart } from '@/gen/api';

export default definePart({
  prop: 'port-stack',
  build(_item, ctx) {
    return { mesh: ctx.mesh().build() };
  },
});
