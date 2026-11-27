// Sample posts for a local Global Village (npm run forum:seed). Owner: Forum.
//
// Fills a running forum server with about 30 posts through its public API, as real players would:
// each a town grown by the game's own town generator ("grow a town", src/townmaker) on its own
// island, written with the game's encodeTown; names and captions in several languages; some posts
// built on others; likes and comments between the sample players. For previews and tests only.
//
// The pictures are placeholders for now (server/seed/*.jpg, 640 × 400 crops of the README's
// pictures), not renders of each town.

import { readFileSync } from 'node:fs';
import { generateTerrain, type TerrainGen } from '@/terrain/terrain';
import { growTown } from '@/townmaker/index';
import { encodeTown } from '@/world/save';
import { applyEdits, emptyWorld } from '@/world/world';

const NAMES = ['mira', '小林', 'tom', 'Léa', 'Jonas', 'さくら', 'sam', 'Ana', '明', 'Olu'];
const CAPTIONS = [
  'a harbour town where the lighthouse keeper lives',
  '我的小镇',
  'castle on a cliff',
  '',
  'Mon petit village au bord de la rivière',
  'Hafenstadt mit Werft, mein erster Versuch',
  '川沿いの町。橋がお気に入り',
  'the market square took me an hour',
  'farming village, lots of windmills',
  '',
  'marble city on the plain 🏛️',
  '山上的城堡和小路',
  'Pueblo de colinas con terrazas',
  'garden town: every street has trees',
  'how many bridges can one river take?',
];
const COMMENTS = ['好可爱!', 'how did you do the bridge?', 'love the harbour', 'すごい!', 'Magnifique !', 'the windmills 😍', 'copied it, thank you', 'Schön!'];

/** A small seeded generator, so a seed run is the same every time. */
function dice(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function seed(url: string, say: (line: string) => void, count = 30): Promise<void> {
  const pictures = ['grow', 'fly'].map((n) => readFileSync(new URL(`./seed/${n}.jpg`, import.meta.url)).toString('base64'));
  const call = async (method: string, path: string, secret?: string, body?: unknown) => {
    const r = await fetch(url + path, {
      method,
      headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await r.json()) as Record<string, unknown>;
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(json)}`);
    return json;
  };

  await call('GET', '/health');
  const players: string[] = [];
  for (const name of NAMES) {
    const { secret } = (await call('POST', '/v1/players')) as { secret: string };
    await call('PUT', '/v1/me', secret, { name });
    players.push(secret);
  }
  const roll = dice(2026_11_27);
  const posts: string[] = [];
  for (let i = 0; i < count; i++) {
    const islandSeed = 7001 + i * 37;
    const gen: TerrainGen = i % 4 === 0 ? 1 : 2;
    const terrain = generateTerrain(islandSeed, gen);
    const world = applyEdits(emptyWorld(islandSeed, gen), terrain, growTown(terrain, islandSeed)).world;
    const parent = i > 5 && i % 5 === 0 ? posts[Math.floor(roll() * posts.length)] : undefined;
    const body = { code: encodeTown(world), caption: CAPTIONS[i % CAPTIONS.length]!, picture: pictures[i % pictures.length]!, ...(parent ? { parent } : {}) };
    const { id } = (await call('POST', '/v1/posts', players[i % players.length], body)) as { id: string };
    posts.push(id);
    say(`  ${i + 1}/${count}  ${id}  ${world.blocks.size} blocks${parent ? `, built on ${parent}` : ''}`);
  }
  let likes = 0;
  let comments = 0;
  for (const id of posts) {
    for (const secret of players) {
      if (roll() < 0.35) {
        await call('PUT', `/v1/posts/${id}/like`, secret);
        likes++;
      }
    }
    for (let c = Math.floor(roll() * 4); c > 0; c--) {
      await call('POST', `/v1/posts/${id}/comments`, players[Math.floor(roll() * players.length)], { text: COMMENTS[Math.floor(roll() * COMMENTS.length)] });
      comments++;
    }
    if (roll() < 0.3) await call('POST', `/v1/posts/${id}/copied`, players[Math.floor(roll() * players.length)]);
  }
  say(`${posts.length} posts by ${players.length} players, ${likes} likes, ${comments} comments, on ${url}`);
}
