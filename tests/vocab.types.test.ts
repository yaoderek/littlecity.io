// The vocabulary is checked by the compiler. Each @ts-expect-error below is
// a mistake that must NOT compile; `npm run typecheck` fails if one starts to.

import { expect, test } from 'vitest';
import type { ActorType, FeatureParams, FeatureType, FeatureVariant, PropParams, PropType, PropVariant, Role, RolesOf, SocketType, Tag } from '@/core/vocab';
import { definePart } from '@/gen/api';
import { defineBehaviour } from '@/life/api';
import { defineRule } from '@/resolve/engine/api';
import { isFeature, type Feature } from '@/resolve/plan';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const yes = <T extends true>(): T => true as T;

test('types, variants and params are read from the registries', () => {
  yes<Equal<FeatureVariant<'door'>, 'plain' | 'double' | 'shop' | 'deck' | 'hatch'>>();
  yes<Equal<FeatureParams<'door'>, { main?: 0 | 1; steps?: number }>>();
  yes<Equal<FeatureVariant<'belfry'>, never>>();
  yes<Equal<PropVariant<'lamp'>, 'post' | 'four-arm' | 'bridge' | 'pier'>>();
  yes<Equal<PropParams<'laundry-line'>, { garments?: number; look?: number }>>();
  yes<Equal<RolesOf<'dock'>, 'quay' | 'pier' | 'boardwalk' | 'jetty' | 'shipyard'>>();
  const types: [FeatureType, PropType, ActorType, SocketType, Role, Tag] = ['window', 'flag', 'gull', 'mooring', 'chapel', 'shop:bakery'];
  expect(types).toHaveLength(6);
  // @ts-expect-error 'door/plain' is a variant key, not a type
  const notAType: FeatureType = 'door/plain';
  // @ts-expect-error 'door.main' is a param key, not a type
  const alsoNot: FeatureType = 'door.main';
  void notAType;
  void alsoNot;
});

test('rules can only emit what the vocabulary lists', () => {
  defineRule({
    id: 'J-T.types', part: 'joinery', tier: 1, priority: 0,
    find: () => [],
    apply(_c, out) {
      out.feature({ type: 'door', structure: 1, variant: 'double', params: { main: 1, steps: 2 } });
      // @ts-expect-error misspelt type
      out.feature({ type: 'dor', structure: 1 });
      // @ts-expect-error 'gable' is a roof variant, not a door variant
      out.feature({ type: 'door', structure: 1, variant: 'gable' });
      // @ts-expect-error doors have no 'garments' param
      out.feature({ type: 'door', structure: 1, params: { garments: 3 } });
      // @ts-expect-error steps is a number
      out.feature({ type: 'door', structure: 1, params: { steps: 'two' } });
      out.prop({ type: 'laundry-line', at: { from: 'a', to: 'b' }, params: { garments: 4 } });
      // @ts-expect-error a prop needs an anchor
      out.prop({ type: 'lamp' });
      out.actor({ type: 'gull', at: null, params: { home: 12 } });
      // @ts-expect-error not a socket type
      out.socket({ type: 'window-sill', cell: 0 });
      out.role(1, 'chapel');
      // @ts-expect-error not a role
      out.role(1, 'church');
      out.tag(1, 'shop:fish');
      // @ts-expect-error not a tag
      out.tag(1, 'shop:shoes');
    },
  });
  expect(true).toBe(true);
});

test('parts and behaviours read typed items', () => {
  definePart({
    feature: 'chimney',
    build(item, ctx) {
      const h: number = item.params?.height ?? 0.4;
      const tall: boolean = item.variant === 'tall-flue';
      // @ts-expect-error chimneys have no 'garments' param
      void item.params?.garments;
      // @ts-expect-error not a chimney variant
      void (item.variant === 'gable');
      void h;
      void tall;
      return { mesh: ctx.mesh().build() };
    },
  });
  // @ts-expect-error 'lamp' is a prop type, not a feature type
  definePart({ feature: 'lamp', build: (_i, ctx) => ({ mesh: ctx.mesh().build() }) });
  defineBehaviour({
    prop: 'laundry-line',
    create: (item) => ({ garments: item.params?.garments ?? 4 }),
    update(state) {
      const n: number = state.garments;
      void n;
    },
  });
  // @ts-expect-error not an actor type
  defineBehaviour({ actor: 'dragon', create: () => 0, update() {} });
  const f = { id: 'x', type: 'door', structure: 1, rule: 'r' } as Feature;
  if (isFeature(f, 'door')) {
    const main: 0 | 1 | undefined = f.params?.main;
    void main;
  }
  expect(true).toBe(true);
});
