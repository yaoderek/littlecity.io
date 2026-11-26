// The tray's contents (design sections 6, 7 and 20): every placeable piece
// and the three tools, grouped into drawers so the tray never becomes one
// long row. Owner: Interface.
//
// The list of pieces is read from the kind table, so a new kind shows up in
// the tray by existing. To give it a home and a name, add it to PIECE_INFO;
// to give it a picture, add an icon of the same id in ./icons.ts. Without
// either it lands in the Build drawer with a plain box icon.

import { ALL_KINDS, FLOOR_KINDS, type EdgeKind, type FloorKind, type PlacedKind } from '@/core/kinds';
import { t } from '@/i18n';

export type PieceId = PlacedKind | FloorKind;
/** Mischief (design section 13b): tools that wreck and mend, in their own drawer. */
export type MischiefToolId = 'torch' | 'bomb' | 'nuke' | 'raid' | 'mallet' | 'hand' | 'ufo' | 'mend';
export type ToolId = 'change' | 'paint' | 'erase' | MischiefToolId;
/** Shaping the land (design section 6): the Land group at the start of the Nature drawer. */
export type LandId = 'raise' | 'dig' | 'level';
export type ItemId = PieceId | ToolId | LandId;
export type DrawerId = 'build' | 'ground' | 'nature' | 'tools' | 'mischief';

export const TOOL_IDS: readonly ToolId[] = ['change', 'paint', 'erase'];
export const MISCHIEF_TOOL_IDS: readonly MischiefToolId[] = ['torch', 'bomb', 'nuke', 'raid', 'mallet', 'hand', 'ufo', 'mend'];
export const LAND_IDS: readonly LandId[] = ['raise', 'dig', 'level'];

export interface TrayItem {
  id: ItemId;
  label: string;
  /** One short line for the tooltip. */
  hint: string;
  drawer: DrawerId;
  /** A group within the drawer that starts with this item (the tray sets it off with a little gap). */
  group?: 'land';
}

const pieceInfo = (): Partial<Record<PieceId, { label: string; hint: string; drawer: DrawerId; order: number }>> => ({
  auto: { label: t('Auto'), hint: t('Decides for itself what to be'), drawer: 'build', order: 0 },
  house: { label: t('House'), hint: t('House'), drawer: 'build', order: 1 },
  tower: { label: t('Tower'), hint: t('Tower'), drawer: 'build', order: 2 },
  lighthouse: { label: t('Light'), hint: t('Lighthouse'), drawer: 'build', order: 3 },
  arch: { label: t('Arch'), hint: t('Arch or bridge'), drawer: 'build', order: 4 },
  dock: { label: t('Dock'), hint: t('Dock, on the water'), drawer: 'build', order: 5 },
  marble: { label: t('Marble'), hint: t('Marble block'), drawer: 'build', order: 6 },
  pillar: { label: t('Pillar'), hint: t('Pillar'), drawer: 'build', order: 7 },
  stairs: { label: t('Stairs'), hint: t('Stairs'), drawer: 'build', order: 8 },
  windmill: { label: t('Mill'), hint: t('Windmill'), drawer: 'build', order: 9 },
  path: { label: t('Path'), hint: t('Path'), drawer: 'ground', order: 0 },
  plaza: { label: t('Plaza'), hint: t('Plaza'), drawer: 'ground', order: 1 },
  field: { label: t('Field'), hint: t('Playing field: its shape makes the court, and people come to play'), drawer: 'ground', order: 1.5 },
  fence: { label: t('Fence'), hint: t('Fence: the middle of a square, or along its edge'), drawer: 'ground', order: 2 },
  wall: { label: t('Wall'), hint: t('Low wall: the middle of a square, or along its edge'), drawer: 'ground', order: 3 },
  stall: { label: t('Stall'), hint: t('Market stall'), drawer: 'ground', order: 4 },
  tree: { label: t('Tree'), hint: t('Tree'), drawer: 'nature', order: 0 },
  garden: { label: t('Garden'), hint: t('Garden'), drawer: 'nature', order: 1 },
  fountain: { label: t('Fountain'), hint: t('Fountain'), drawer: 'nature', order: 2 },
});

const landInfo = (): Record<LandId, { label: string; hint: string }> => ({
  raise: { label: t('Raise'), hint: t('Raise the ground a level (Shift-drag to paint; scroll for a wider brush)') },
  dig: { label: t('Dig'), hint: t('Dig the ground down a level; at the bottom it fills with water') },
  level: { label: t('Level'), hint: t('Bring the ground to one height: click, or Shift-drag from the height you want') },
});

const toolInfo = (): Record<ToolId, { label: string; hint: string }> => ({
  change: { label: t('Change'), hint: t('Change what a block is, or turn stairs') },
  paint: { label: t('Paint'), hint: t('Recolour a block') },
  erase: { label: t('Erase'), hint: t('Remove a piece') },
  torch: { label: t('Lightning'), hint: t('Strike a building with lightning') },
  bomb: { label: t('Bomb'), hint: t('Drop a bomb') },
  nuke: { label: t('Nuke'), hint: t('The big one: a mushroom cloud and a crater') },
  raid: { label: t('Raid'), hint: t('Click a shore: raiders land there. Click again for more.') },
  mallet: { label: t('Mallet'), hint: t('Knock a building down a stage') },
  mend: { label: t('Mend'), hint: t('Mend a building a stage (Shift: all at once)') },
  ufo: { label: t('UFO'), hint: t('Call a flying saucer: it beams up somebody near where you click, and brings them back') },
  hand: { label: t('Hand'), hint: t('Pick up a person, an animal or a boat and throw it: press on it, drag, let go') },
});

export const drawerLabels = (): Record<DrawerId, string> => ({ build: t('Build'), ground: t('Ground'), nature: t('Nature'), tools: t('Tools'), mischief: t('Mischief') });
export const DRAWER_IDS: readonly DrawerId[] = ['build', 'ground', 'nature', 'tools', 'mischief'];

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Every piece the kind table knows, Auto first. */
export function allPieceIds(): PieceId[] {
  return ['auto', ...ALL_KINDS, ...FLOOR_KINDS];
}

export function isToolId(id: ItemId): id is ToolId {
  return id === 'change' || id === 'paint' || id === 'erase' || isMischiefTool(id);
}
export function isMischiefTool(id: ItemId): id is MischiefToolId {
  return (MISCHIEF_TOOL_IDS as readonly string[]).includes(id);
}
/** Raise, Dig or Level: they shape the ground instead of placing a piece. */
export function isLandTool(id: ItemId): id is LandId {
  return id === 'raise' || id === 'dig' || id === 'level';
}
export function isFloorPiece(id: ItemId): id is FloorKind {
  return (FLOOR_KINDS as readonly string[]).includes(id);
}
export function isEdgePiece(id: ItemId): id is EdgeKind {
  return id === 'fence' || id === 'wall';
}
/** Pieces a Shift-drag paints as a run (design section 7); the land tools paint strokes. */
export function paintsRuns(id: ItemId): boolean {
  return isFloorPiece(id) || isEdgePiece(id) || id === 'marble' || isLandTool(id);
}

export function trayItem(id: ItemId): TrayItem {
  if (isToolId(id)) return { id, drawer: isMischiefTool(id) ? 'mischief' : 'tools', ...toolInfo()[id] };
  if (isLandTool(id)) return { id, drawer: 'nature', ...landInfo()[id], ...(id === 'raise' ? { group: 'land' as const } : {}) };
  const info = pieceInfo()[id];
  return { id, label: info?.label ?? titleCase(id), hint: info?.hint ?? titleCase(id), drawer: info?.drawer ?? 'build' };
}

/** The items of one drawer, in tray order. Keys 1–9 and 0 pick them by position. */
export function drawerItems(drawer: DrawerId): TrayItem[] {
  if (drawer === 'tools') return TOOL_IDS.map(trayItem);
  if (drawer === 'mischief') return MISCHIEF_TOOL_IDS.map(trayItem);
  // The Land group comes first in the Nature drawer.
  const land = drawer === 'nature' ? LAND_IDS.map(trayItem) : [];
  return land.concat(pieceItems(drawer));
}

function pieceItems(drawer: DrawerId): TrayItem[] {
  const info = pieceInfo();
  return allPieceIds()
    .map((id, index) => ({ item: trayItem(id), order: info[id]?.order ?? 100 + index }))
    .filter(({ item }) => item.drawer === drawer)
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

export function drawerOf(id: ItemId): DrawerId {
  return trayItem(id).drawer;
}
