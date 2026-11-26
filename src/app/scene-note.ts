// The note for the town's scenes (L57 the wedding, L63 a beach day, and the
// ones after; src/life/town/scenes.ts): a small card at the top saying what
// is on ("Wedding bells at the chapel", "A beach day on the shore") with
// Watch, which glides the camera there, and Not now. One note per scene at
// most, never two at once, and never more than one every SCENES.noteGap
// seconds (a scene that comes up meanwhile simply has none): it is there to
// help a player find what is going on, not to nag. It never stops play, and
// it goes by itself when its scene is over.

import { scenesOnStage, type Scene } from '@/life/town/scenes';
import { t } from '@/i18n';
import { SCENES } from '@/style/scenes';
import type { Interface } from '@/ui/interface';

/** The kinds of scene that raise a note with Watch. Add to it sparingly: only what a player would be sorry to miss. */
export const NOTED: ReadonlySet<string> = new Set(['raid', 'wedding', 'launch']);

export interface SceneNote {
  /** Once a frame. */
  update(stage: object): void;
  dispose(): void;
}

export function sceneNote(ui: Interface, now: () => number = () => performance.now() / 1000): SceneNote {
  /** Scenes already noted (or passed over), by their number. */
  const seen = new Set<number>();
  let showing: Scene | null = null;
  let close: (() => void) | null = null;
  let last = -Infinity;
  return {
    update(stage) {
      const scenes = scenesOnStage(stage);
      const on = scenes?.on ?? [];
      // Its scene is over: the note goes.
      if (showing && !on.includes(showing)) {
        close?.();
        close = null;
        showing = null;
      }
      // An urgent scene (the raid) takes the place of a note showing for another.
      const urgent = on.find((s) => s.urgent && NOTED.has(s.kind) && !seen.has(s.n) && s.title && s.noteworthy());
      if (urgent && showing && !showing.urgent) {
        close?.();
        close = null;
        showing = null;
      }
      if (showing || !scenes) return;
      for (const s of urgent ? [urgent] : on) {
        // Only the really big events get a note: a raid, a wedding, a ship launched (NOTED). A beach day, a picnic, a
        // snowball fight are there to be come upon, not announced (Derek, 2026-11-21).
        if (!NOTED.has(s.kind)) continue;
        if (seen.has(s.n) || !s.title || !s.noteworthy()) continue;
        seen.add(s.n);
        if (!s.urgent && now() - last < SCENES.noteGap) continue;
        last = now();
        showing = s;
        close = ui.feedback.banner(s.title, [
          {
            label: t('Watch'),
            primary: true,
            run: () => {
              close = null;
              showing = null;
              const f = s.focus();
              if (f) ui.glideTo([f.x, f.y + 0.3, f.z], 5);
            },
          },
          { label: t('Not now'), run: () => void ((close = null), (showing = null)) },
        ]);
        break;
      }
    },
    dispose() {
      close?.();
      close = null;
    },
  };
}
