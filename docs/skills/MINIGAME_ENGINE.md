# Minigame Engine — Skill Definition

## Role

The Minigame Engine owns the creation, lifecycle, and balancing of self-contained musical
minigames — games that run outside the tower-defense loop and teach a single musical
concept in 1–3 minutes. It provides the `BaseMinigame` base class, the registry that maps
`gameType` strings to handler classes, and the launch/stop lifecycle that wires each
handler into the scene state machine.

Every new level in the game — whether rhythm training, ear training, theory drills, or
performance challenges — is built as a minigame handler registered with this engine.
The engine is designed so that a new minigame can be created, registered, wired to the
world map, and playtested in a single session.

---

## Pipeline Position

```
                    ┌──────────────────┐
                    │  MINIGAME_ENGINE │  ← designs & hosts minigames
                    └──────┬───────────┘
                           │ sends minigame designs through
              ┌────────────▼────────────┐
              │    GAMEPLAY_ENGINE      │  ← scoring, balance, star thresholds
              └────────────┬────────────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐
  │  GRAPHICS   │  │   SOUND     │  │  COMPOSITION     │
  │  ENGINE     │  │   ENGINE    │  │  ENGINE          │
  └─────────────┘  └─────────────┘  └──────────────────┘
        renders         audio            melodic phrases
        visuals         feedback         & note pools

              ┌────────────────────────┐
              │      AI_ENGINE         │  ← playtests & balances all outputs
              └────────────────────────┘
```

### Connected engines

- [[GAMEPLAY_ENGINE]] — Minigame scoring (star thresholds, accuracy formulas) feeds
  through the same `awardStars()` + `saveProgress()` path. Minigames define their own
  internal scoring but MUST produce a `{ stars, score, accuracyPct, passed }` result
  compatible with the progression system.
- [[SOUND_ENGINE]] — Minigames use `getAudioContext()` for tone playback. Demo sequences
  (e.g. Call & Response phrase demo) use the same oscillator → gain → destination pattern.
  Mic input is NOT used by minigames (keyboard/touch only for now).
- [[GRAPHICS_ENGINE]] — Minigames render to the shared `<canvas>` with the same DPR
  scaling pattern. Piano geometry is duplicated per minigame (not imported from `hud.js`)
  to keep handlers self-contained.
- [[COMPOSITION_ENGINE]] — Minigames that generate melodic phrases (Call & Response)
  use the same diatonic note pool rules. Future: feed minigame phrases through the
  melody engine for richer playback.
- [[AI_ENGINE]] — Evaluates minigame balance: are star thresholds achievable? Is the
  difficulty curve appropriate? Are the musical concepts correctly taught?

---

## Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `canvas` | `game.js` | Shared HTMLCanvasElement — minigame draws to this |
| `ctx` | `game.js` | CanvasRenderingContext2D (DPR-scaled) |
| `gameState` | `game.js` | Full state object (READ ONLY — minigames must not mutate) |
| `difficulty` | `game.js` | `'easy'` / `'medium'` / `'hard'` — for future difficulty scaling |
| `onNote` | `game.js` | Callback to dispatch notes to the main game (rarely needed) |
| `done` | `minigameEngine.js` | Callback to end the minigame and return a result |
| `gameType` | `worldMap.js` node | String key that maps to a registered handler class |

---

## Outputs

| Output | Description |
|--------|-------------|
| `MinigameResult` | `{ stars: 0-3, score: number, accuracyPct: 0-100, passed: boolean }` |
| Star persistence | `awardStars(level.id, result.stars, progression)` in `_handleMinigameResult()` |
| Scene transition | `passed: true` → `SCENE.VICTORY`; `passed: false` → `SCENE.DEFEAT` |
| Console logs | `[minigame] launching: <type>`, `[minigame] victory N★`, `[minigame] stopped` |

---

## File Locations

All paths relative to the repo root (or worktree root when in a worktree session).

| File | Purpose |
|------|---------|
| `src/systems/minigameEngine.js` | Registry, lifecycle, `BaseMinigame` base class (~130 lines) |
| `src/minigames/metronomeMastery.js` | Rhythm: tap on the beat across 4 BPM phases (~455 lines) |
| `src/minigames/rhythmChallenge.js` | Pattern: read & tap visual rhythm patterns (~620 lines) |
| `src/minigames/callResponse.js` | Ear training: listen to phrase, echo back (~290 lines) |
| `src/minigames/README.md` | Catalogue of 8 planned minigame types |
| `src/data/worldMap.js` | Node `gameType` field wires nodes to handlers |
| `src/game.js` | Registration: `minigameEngine.register('id', Class)` |

---

## Architecture

```
game.js (LEVEL_START)
  └─ pendingLevel.gameType !== 'tower-defense'
       └─ setScene(SCENE.MINIGAME)
       └─ minigameEngine.launch(node, { canvas, ctx, state, difficulty, onNote, onComplete })
            └─ new Handler({ canvas, ctx, gameState, difficulty, onNote, done })
            └─ handler.start()   ← runs own rAF loop
            └─ handler.done(result)
       └─ _handleMinigameResult(result) → awardStars → VICTORY | DEFEAT
```

game.js's main rAF loop does NOT run during SCENE.MINIGAME.
Each handler owns its own update/render loop entirely.

---

## BaseMinigame Contract

```js
import { BaseMinigame } from '../systems/minigameEngine.js';

export class MyMinigame extends BaseMinigame {
  // Available via this.*:
  //   canvas, ctx, gameState, difficulty, onNote, done, _rafId

  start() {
    // Init state, wire input listeners, start rAF loop
  }

  destroy() {
    super.destroy();   // cancels _rafId — ALWAYS call super
    // Remove all event listeners, clear all setTimeout handles
  }
}
```

### Result shape

```js
this.done({
  stars:       0 | 1 | 2 | 3,
  score:       number,
  accuracyPct: number,    // 0-100
  passed:      boolean,   // true → VICTORY, false → DEFEAT
});
```

---

## Constraints

- **One musical concept per minigame.** Same rule as levels. If you're teaching two
  things, split into two minigames.
- **Do NOT `new AudioContext()`** — reuse via `getAudioContext()` from `../audio/capture.js`.
- **Do NOT add DOM elements** — canvas-only rendering, no `<div>`, `<button>`, etc.
- **Do NOT `setInterval()`** — use `setTimeout` chains or Web Audio lookahead scheduler.
- **Do NOT mutate `gameState`** — it is shared with the main loop; treat as read-only.
- **ALWAYS call `super.destroy()`** — skipping it leaks the rAF loop.
- **ALWAYS remove event listeners in `destroy()`** — leaked listeners survive scene transitions.
- **ALWAYS clear all `setTimeout` handles in `destroy()`** — leaked timers fire after cleanup.
- **DPR-correct rendering**: `const W = canvas.width / (devicePixelRatio || 1)`.
- **Play time**: 1–3 minutes. Shorter feels trivial; longer loses engagement.
- **Scoring must map to 0–3 stars** with documented thresholds.

---

## Audio Pattern

```js
import { getAudioContext } from '../audio/capture.js';

_playTone(note) {
  const freq = getNoteFreq(note);
  if (!freq) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type            = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.30, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.50);
}
```

See [[SOUND_ENGINE]] for the full audio constraint set.

---

## Input Pattern

### Keyboard

```js
const KEY_TO_NOTE = {
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

this._onKeyDown = (e) => {
  if (e.repeat || this._finished) return;
  const note = KEY_TO_NOTE[e.key.toLowerCase()];
  if (!note) return;
  e.preventDefault();
  this._handleNote(note);
};
document.addEventListener('keydown', this._onKeyDown);
// destroy(): document.removeEventListener('keydown', this._onKeyDown);
```

### Canvas click + touch

See `callResponse.js` `_pianoGeom()` / `_getKeyAt()` for the hit-testing geometry.

---

## Existing Minigames

| Handler | `gameType` | Teaches | Duration | Scoring | Wired to |
|---------|-----------|---------|----------|---------|----------|
| MetronomeMastery | `metronome-mastery` | Rhythm / pulse | 60s fixed | perfectPct | rhythm-1, rhythm-2 |
| RhythmChallenge | `rhythm-challenge` | Pattern reading | 3 rounds | pattern accuracy | rhythm-3/4/5 |
| CallResponse | `call-response` | Melodic memory | 5 rounds (~2 min) | sequence + lives | music-1/2/3/5 |
| ComingSoonMinigame | `coming-soon` | (placeholder) | 2s | always 0★ | rhythm-6, theory-1–6, music-4/6 |

---

## Building a New Minigame — Checklist

### Step 1: Design
- [ ] Define the one musical concept being taught
- [ ] Define play time (1–3 minutes)
- [ ] Define scoring → 0–3 star mapping
- [ ] All input is via piano keyboard or canvas tap — no other input

### Step 2: Create handler
Create `src/minigames/myMinigame.js`. Copy structure from `callResponse.js` (sequence)
or `metronomeMastery.js` (rhythm). Implement `start()`, `destroy()`, `_render()`, `_finish()`.

### Step 3: Register in game.js
```js
import { MyMinigame } from './minigames/myMinigame.js';
minigameEngine.register('my-type', MyMinigame);
```

### Step 4: Wire world map nodes
```js
// In worldMap.js:
const NODE = Object.freeze({
  ...makeStub('id', 'Name', 'icon', 'region', ['parent'], 'goal', 'skill'),
  gameType: 'my-type',
  stub:     false,
});
```

### Step 5: Playtest
- [ ] All piano notes produce audio
- [ ] Canvas click/touch hits correct keys at different screen sizes
- [ ] `destroy()` on scene exit does not crash
- [ ] `done()` routes to VICTORY / DEFEAT correctly
- [ ] Star thresholds feel right after 3 playthroughs
- [ ] AudioContext resumes on mobile (suspended state)

---

## Test Criteria

- [ ] All 3 existing minigames launch from their world map nodes without errors
- [ ] Each minigame completes and returns to VICTORY or DEFEAT screen
- [ ] Stars persist to localStorage after completion
- [ ] `coming-soon` nodes show the placeholder screen and exit gracefully
- [ ] `destroy()` is called when player navigates away mid-minigame (no leaked rAF)
- [ ] New minigame can be built, registered, wired, and playtested in one session
- [ ] All minigame files are accessible from the worktree (not just the main repo)

---

## Convergence Definition

The Minigame Engine is **good enough** when:
1. A new minigame concept can go from idea to playable in a single Claude Code session
   (create handler → register → wire → playtest → commit).
2. Every minigame teaches exactly one musical concept that the player can name after playing.
3. Star thresholds in every minigame feel earned — 2★ requires noticeable improvement,
   3★ requires genuine skill.
4. No lifecycle bugs: every `start()` has a matching `destroy()`, no leaked listeners
   or timers survive scene transitions.
5. The engine scales to 10+ minigame types without changes to `minigameEngine.js`.
6. All minigame files are immediately findable by future sessions via CLAUDE.md file map
   and this skill definition.

---

## See Also

- [[GAMEPLAY_ENGINE]] — star scoring, difficulty scaling, progression system
- [[SOUND_ENGINE]] — audio playback patterns, `getAudioContext()`, mic pipeline
- [[GRAPHICS_ENGINE]] — DPR canvas rendering, piano geometry, visual constants
- [[COMPOSITION_ENGINE]] — melodic phrase generation, diatonic note pool rules
- [[AI_ENGINE]] — playtesting criteria, balance evaluation, convergence definitions
- `docs/context/MINIGAME_ENGINE.md` — development reference with worktree path notes
