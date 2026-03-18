# Minigame Engine

> Load this file for any minigame development session.
> See [[INDEX]] for the quick-load guide.

## File Locations

All paths are relative to the **worktree root** (current working directory).
Do NOT use the main repo path (`C:/Users/wbryk/OneDrive/Desktop/Chordwars/src/...`) — it will 404.
Use the worktree path: `C:/Users/wbryk/OneDrive/Desktop/Chordwars/.claude/worktrees/<name>/src/...`

| File | Purpose |
|------|---------|
| `src/systems/minigameEngine.js` | Registry, lifecycle host, `BaseMinigame` base class |
| `src/minigames/metronomeMastery.js` | Rhythm tapping — reference implementation |
| `src/minigames/rhythmChallenge.js` | Pattern reading — 3 rounds of visual pattern matching |
| `src/minigames/callResponse.js` | Melodic echo — listen → play back a note phrase |
| `src/minigames/README.md` | Catalogue of planned minigame types |
| `src/data/worldMap.js` | Node definitions — add `gameType` field to wire nodes |
| `src/game.js` | Registration point — `minigameEngine.register(id, Class)` |

---

## Architecture

```
game.js (LEVEL_START scene)
  └─ pendingLevel.gameType !== 'tower-defense'
       └─ minigameEngine.launch(node, { canvas, ctx, state, difficulty, onNote, onComplete })
            └─ new HandlerClass({ canvas, ctx, gameState, difficulty, onNote, done })
                 └─ handler.start()   ← runs own rAF loop
                 └─ handler calls this.done(result) when finished
            └─ minigameEngine hands result to _handleMinigameResult()
                 └─ awardStars() + setScene(VICTORY | DEFEAT)
```

**Key rule:** The engine owns the lifecycle. Each handler owns its own rendering and input.
game.js's main rAF loop does NOT run during SCENE.MINIGAME — only the handler's loop runs.

---

## BaseMinigame Contract

```js
import { BaseMinigame } from '../systems/minigameEngine.js';

export class MyMinigame extends BaseMinigame {
  // Constructor receives — do NOT override, use start() instead:
  //   this.canvas     — HTMLCanvasElement
  //   this.ctx        — CanvasRenderingContext2D
  //   this.gameState  — full game state object (READ ONLY in minigames)
  //   this.difficulty — 'easy' | 'medium' | 'hard'
  //   this.onNote     — function(note) — dispatch a note to the main game (rarely needed)
  //   this.done       — function(result) — call exactly once when finished
  //   this._rafId     — managed by BaseMinigame.destroy()

  start() {
    // Set up state, wire input, kick off rAF loop.
    // This is called immediately after instantiation.
  }

  destroy() {
    super.destroy();           // cancels this._rafId — ALWAYS call super first
    // Remove all event listeners added in start().
    // Cancel all setTimeout handles.
    // Set this._finished = true to stop any in-progress timers.
  }
}
```

### `done()` result shape

```js
this.done({
  stars:       0 | 1 | 2 | 3,  // stars to award (0 = not saved)
  score:       number,           // displayed on victory screen
  accuracyPct: number,           // 0-100, shown as accuracy %
  passed:      boolean,          // true → VICTORY, false → DEFEAT
});
```

`done()` must be called **exactly once**. After calling it, the engine calls `destroy()` automatically. Guard with a `_finished` flag.

---

## Hard Rules (Never Violate)

| Rule | Reason |
|------|--------|
| Do NOT `new AudioContext()` | Reuse via `getAudioContext()` from `../audio/capture.js` |
| Do NOT add DOM elements | Canvas-only rendering — no `<div>`, `<button>`, etc. |
| Do NOT `setInterval()` | Use `setTimeout` chains or Web Audio API scheduler |
| Do NOT mutate `gameState` | It is shared with the main loop; treat as read-only |
| ALWAYS call `super.destroy()` | BaseMinigame cancels the rAF; skipping it leaks the loop |
| ALWAYS remove event listeners in `destroy()` | Leaked listeners survive scene transitions |
| ALWAYS clear all `setTimeout` handles in `destroy()` | Leaked timers fire after the minigame is gone |

---

## DPR-Correct Canvas Rendering

```js
_render() {
  const { ctx, canvas } = this;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.width / dpr;   // logical CSS pixels
  const H   = canvas.height / dpr;
  // All drawing uses W/H, never canvas.width/canvas.height directly
}
```

---

## Audio Pattern

```js
import { getAudioContext } from '../audio/capture.js';

_playTone(note) {
  const freq = getNoteFreq(note);  // implement locally (see metronomeMastery.js)
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

For scheduled beats (metronome pattern) use the Web Audio API lookahead scheduler — see `metronomeMastery.js` `_scheduleClick()` and the lookahead loop in `_update()`.

---

## Input Pattern

### Keyboard

```js
this._onKeyDown = (e) => {
  if (e.repeat || this._finished) return;
  const note = KEY_TO_NOTE[e.key.toLowerCase()];
  if (!note) return;
  e.preventDefault();
  this._handleNote(note);
};
document.addEventListener('keydown', this._onKeyDown);

// In destroy():
document.removeEventListener('keydown', this._onKeyDown);
```

### Canvas click + touch

```js
this._onClick = (e) => {
  const note = this._noteAtPoint(e.clientX, e.clientY);
  if (note) this._handleNote(note);
};
this._onTouch = (e) => {
  e.preventDefault();
  const t = e.touches[0];
  if (!t) return;
  const note = this._noteAtPoint(t.clientX, t.clientY);
  if (note) this._handleNote(note);
};
this.canvas.addEventListener('click',      this._onClick);
this.canvas.addEventListener('touchstart', this._onTouch, { passive: false });

// In destroy():
this.canvas.removeEventListener('click',      this._onClick);
this.canvas.removeEventListener('touchstart', this._onTouch);
```

Piano geometry helpers (copy from `callResponse.js` `_pianoGeom` / `_getKeyAt`).

---

## Key Mapping (same across all minigames)

```js
const KEY_TO_NOTE = {
  // White keys (C3 octave)
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  // Black keys
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};
```

---

## Existing Minigames

### MetronomeMastery (`metronome-mastery`)
- **Teaches:** Rhythm / pulse — staying locked to a beat
- **Mechanic:** Tap any key on the metronome beat; 4 phases at 80/95/110/125 BPM × 15s each
- **Input:** Any key = tap; canvas tap also counts
- **Scoring:** perfectPct ≥85 = 3★, ≥65 = 2★, else 1★; missRate >50% = 0★
- **Visual:** Scrolling highway, beat circles travel right→left; hit line at centre
- **Audio:** Web Audio lookahead scheduler (`LOOKAHEAD = 0.1s`), 1kHz sine click
- **Duration:** 60s fixed
- **Wired to:** `rhythm-1`, `rhythm-2`

### RhythmChallenge (`rhythm-challenge`)
- **Teaches:** Pattern reading — recognize quarter / eighth / syncopated patterns
- **Mechanic:** 3 rounds; each shows a visual pattern on screen, player taps matching rhythm
- **Wired to:** `rhythm-3`, `rhythm-4`, `rhythm-5`

### CallResponse (`call-response`)
- **Teaches:** Melodic memory / ear training / phrase imitation
- **Mechanic:** 5 rounds (3/4/4/5/5 notes); game demos phrase by lighting keys; player echoes back in order
- **Input:** Piano keyboard + canvas click/touch; sequence-only (timing irrelevant)
- **Lives:** 3 per round; wrong note = life lost; lives=0 = round failed (0★)
- **Scoring per round:** perfect (no errors) = 2★; completed with errors = 1★; failed = 0★
- **Final stars:** total ≥10 = 3★, ≥7 = 2★, ≥3 = 1★, <3 = 0★
- **Visual:** Large piano, phrase progress dots (○●), LISTEN/YOUR TURN banners, heart lives, subtle next-key pulse
- **Duration:** ~2 minutes
- **Wired to:** `music-1`, `music-2`, `music-3`, `music-5`

---

## How to Build a New Minigame

### Step 1 — Design checklist
- [ ] One musical concept per minigame (same rule as levels)
- [ ] Play time: 1–3 minutes
- [ ] Clear success/fail state
- [ ] 0–3 star scoring with documented thresholds
- [ ] All input via piano keyboard or canvas tap — no other input

### Step 2 — Create the handler

```
src/minigames/myMinigame.js
```

Copy structure from `metronomeMastery.js` (rhythm) or `callResponse.js` (sequence).
Required sections:
- `start()` — state init, input wiring, rAF loop start
- `destroy()` — `super.destroy()`, remove listeners, clear timers
- `_render()` — DPR-correct canvas draw
- `_finish()` — compute stars, call `this.done()`

### Step 3 — Register in game.js

```js
// Add import at top with the other minigame imports
import { MyMinigame } from './minigames/myMinigame.js';

// Add registration after the other register() calls
minigameEngine.register('my-minigame', MyMinigame);
```

### Step 4 — Wire world map nodes

```js
// In worldMap.js, change an existing stub:
const SOME_NODE = Object.freeze({
  ...makeStub('node-id', 'Name', '🎵', 'region', ['parent-id'], 'goal', 'skill'),
  gameType: 'my-minigame',
  stub:     false,
});
```

Or for a fully fleshed-out node (like RHYTHM_1/2), define it explicitly with all fields.
Node must have `stub: false` — stubs are skipped by game.js without launching.

### Step 5 — Playtest checklist
- [ ] All 5 notes (C3 D3 E3 F3 G3) produce audio tone
- [ ] Canvas click hits the correct piano key at different screen sizes
- [ ] Touch input works (test on mobile or DevTools mobile emulation)
- [ ] `destroy()` called on scene exit does not crash
- [ ] `done()` routes correctly to VICTORY (passed:true) or DEFEAT (passed:false)
- [ ] Star thresholds feel appropriate after 3 playthroughs
- [ ] Round/phase transitions are legible (not too fast, not too slow)
- [ ] AudioContext resumes correctly (suspended state on mobile)

---

## `coming-soon` gameType

Any node with `gameType: 'coming-soon'` and `stub: false` will show a "Coming Soon" screen for 2 seconds then exit. Use this instead of silent stubs so players get feedback.

Currently wired as `coming-soon`: `rhythm-6`, `theory-1` through `theory-6`, `music-4`, `music-6`.

---

## Scoring Reference

The minigame's `done()` result feeds into the same star persistence system as tower-defense levels:
```
awardStars(level.id, result.stars, progression)  →  saves to localStorage
```
Stars 0 are not saved (so a failed run doesn't overwrite a previous 2★).

---

## See Also

- [[GAME_SYSTEMS]] — Tower-defense systems (separate from minigames)
- [[DATA_MODELS]] — WorldMapNode shape, `gameType` field
- [[DECISIONS]] — Decision #18: MinigameEngine as host-only registry (2026-03-18)
- `src/minigames/README.md` — Catalogue of 8 planned minigame types
