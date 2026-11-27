// Trees (R-P01): one tree block is one plant of the species its role names,
// standing a little off the centre of its cell, with a companion at its foot
// when it is a plain tree on open ground. Crowns sway with the wind.
//
// Reads: the structure (cell, seed) and its role. Nothing else.

import { CELL_H, keyX, keyY, keyZ } from '@/core/grid';
import { compose, scaling, translation, type Mat4Like, type Vec3 } from '@/core/mat4';
import type { RolesOf } from '@/core/vocab';
import { defineGenerator } from '@/gen/api';
import { MeshBuilder } from '@/gen/mesh';
import { rngOf, type Rng } from '@/parts/ground/kit';
import { TREE } from '@/style/ground';
import { companion, cypress, fruitFork, fruitTree, groveTree, palm, pine, planterTree, roundFork, roundTree, shrubbery, willow } from './species';

export type TreeRole = RolesOf<'tree'>;

/** The seeded mix for a tree no other species claims: round, cypress or bush. */
export function mixedSpecies(roll: number): TreeRole {
  return roll < TREE.mixRound ? 'round-tree' : roll < TREE.mixRound + TREE.mixCypress ? 'cypress' : 'bush';
}

const DRAW: Record<TreeRole, (b: MeshBuilder, r: Rng) => number> = {
  'palm': palm,
  'willow': willow,
  'pine': pine,
  'planter-tree': planterTree,
  'fruit-tree': fruitTree,
  'grove-tree': groveTree,
  'round-tree': (b, r) => roundTree(b, r),
  'cypress': cypress,
  'bush': shrubbery,
};
export const TREE_ROLES = Object.keys(DRAW) as TreeRole[];

/** Draws one plant of a species on the builder's origin. Also used by galleries and tests. */
export function drawTree(b: MeshBuilder, species: TreeRole, seed: number, withCompanion = false): void {
  const r = rngOf(seed);
  DRAW[species](b, r);
  if (withCompanion) {
    const a = r('companion-at') * 6.28;
    companion(b, (...p) => r('companion', ...p), Math.cos(a) * 0.3, Math.sin(a) * 0.3);
  }
}

/** The species a tree block is drawn as: the one its role names, or the seeded mix. */
export function speciesOf(seed: number, role: string | undefined): TreeRole {
  return role !== undefined && role in DRAW ? (role as TreeRole) : mixedSpecies(rngOf(seed)('species'));
}

/** Where a plant stands off its cell's centre, and its size. */
function standing(seed: number, species: TreeRole): { jx: number; jz: number; scale: number } {
  const r = rngOf(seed);
  // A planter stands square on its cell; everything else wanders a little.
  const loose = species === 'planter-tree' ? 0 : TREE.jitter;
  return {
    jx: (r('jx') - 0.5) * 2 * loose,
    jz: (r('jz') - 0.5) * 2 * loose,
    scale: TREE.scale * (species === 'planter-tree' ? 1 : 0.92 + r('scale') * 0.18),
  };
}

/**
 * Where the limbs of a broadleaf (round, fruit) leave its trunk, from the centre of its cell's floor, and
 * the trunk's radius there; null for the other species. What the orchard's ladders rest on (U18): wood
 * that is still there when the leaves have fallen.
 */
export function treeFork(seed: number, species: TreeRole): { at: Vec3; radius: number } | null {
  const fork = species === 'fruit-tree' ? fruitFork(rngOf(seed)) : species === 'round-tree' ? roundFork(rngOf(seed)) : null;
  if (!fork) return null;
  const { jx, jz, scale } = standing(seed, species);
  return { at: [jx + fork.at[0] * scale, fork.at[1] * scale, jz + fork.at[2] * scale], radius: fork.radius * scale };
}

export default defineGenerator({
  kind: 'tree',
  build(s, plan) {
    const anchors: Record<string, Mat4Like> = {};
    const out = new MeshBuilder({ ink: s.id });
    const given = plan.roles.get(s.id)?.role;
    for (const cell of s.cells) {
      const r = rngOf(s.seed);
      const species = speciesOf(s.seed, given);
      const { jx, jz, scale } = standing(s.seed, species);
      const plain = species === 'round-tree' || species === 'cypress';
      out.at(compose(translation(keyX(cell) + 0.5 + jx, keyY(cell) * CELL_H, keyZ(cell) + 0.5 + jz), scaling(scale)), () =>
        drawTree(out, species, s.seed, plain && r('companion?') < TREE.companion),
      );
    }
    return { mesh: out.build(), anchors };
  },
});
