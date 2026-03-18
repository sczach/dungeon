# ChordWars Key Decisions & Rationale

> Why things are built the way they are. Reference this when considering architectural changes.

## 1. No Build Step

**Decision:** Pure ES modules, no bundler, no transpilation.

**Why:**
- Zero config, zero tooling debt
- Instant deploy to Vercel (just static files)
- ES modules are natively supported in all target browsers
- One less thing to break

**Trade-off:** No tree shaking, no minification, no TypeScript. Acceptable for a ~11K LOC vanilla JS game.

## 2. Single State Object in game.js

**Decision:** `createInitialState()` returns one object. All subsystems receive it by reference.

**Why:**
- Single source of truth — no sync bugs between scattered state
- Easy to inspect (one object = one debugger watch)
- Subsystems are stateless functions/classes that operate on shared state
- Makes save/load trivial (serialize one object)

**Trade-off:** Any subsystem can write any field. Discipline enforced by convention, not types.

## 3. constants.js Exists to Break Circular Imports

**Decision:** `SCENE` enum and layout constants live in `constants.js`, not in `game.js` or `renderer.js`.

**Why:** Safari and Vercel reject circular ES module bindings. Both `game.js` and `renderer.js` need `SCENE`. Without constants.js, they'd import from each other → circular → hard crash.

**Rule:** If two files need to share a value, extract to a third file.

## 4. renderer.js Never Mutates State

**Decision:** Renderer is pure output. Read state, draw pixels, return.

**Why:**
- Clear separation of concerns
- Makes debugging easier (state bugs are always in game.js or systems)
- Renderer can be swapped/mocked without affecting game logic
- Minor violation: `_drawBases` writes renderer-internal flash timers (not game state)

## 5. Instrument-as-Controller (Core Design)

**Decision:** Every game action maps to a musical action. No menus, buttons, or shortcuts bypass playing music.

**Why:** This IS the game. ChordWars is a music lesson disguised as an RTS. If you could win without playing music, it would be just another RTS with a music theme.

**Constraint this creates:** All input flows through the note detection pipeline. Even keyboard and touch input goes through `_handleNote()` as if it were a detected note.

## 6. Web Audio API Only (No `<audio>` Elements)

**Decision:** All sound through Web Audio API oscillators and nodes.

**Why:**
- Low latency (critical for real-time music game)
- Procedural generation (melodies, sound effects)
- Mic input requires Web Audio API anyway
- No audio file assets to load/manage

**Trade-off:** More complex code than `<audio>` elements. Worth it for latency.

## 7. Canvas for Game World, HTML for Overlays

**Decision:** Game rendering is pure canvas. Menus/settings/victory screens are HTML `<section>` elements toggled via CSS.

**Why:**
- Canvas: fast pixel drawing, DPR scaling, no DOM overhead in rAF loop
- HTML: accessible buttons, text selection, standard form controls for settings
- `body[data-scene]` CSS selectors make scene switching trivial

## 8. Pre-Allocated Buffers in Hot Path

**Decision:** Audio analysis and enemy path use pre-allocated arrays and out-parameters.

**Why:**
- Zero per-frame allocations = no GC pauses
- Critical for 60fps game loop + real-time audio processing
- `_byteBuffer` in analyzer.js, out-parameter in `getPositionOnPath()`

## 9. YIN Algorithm for Pitch Detection

**Decision:** YIN (de Cheveigne & Kawahara 2002) instead of autocorrelation or FFT peak.

**Why:**
- Better accuracy than raw autocorrelation
- Works well in the 60–1050 Hz range (covers all instruments)
- Parabolic interpolation gives sub-sample precision
- Well-studied, well-understood algorithm

## 10. Chromagram + Cosine Similarity for Chord Detection

**Decision:** 12-bin chromagram matched against L2-normalized chord templates.

**Why:**
- Octave-invariant (works regardless of which octave the player uses)
- Cosine similarity is fast and robust
- Margin guard (0.15) prevents ambiguous matches
- Confidence threshold (0.60) prevents false positives

## 11. Tutorial is Linear and Mandatory

**Decision:** First play forces T1→T2→T3→T4 in order. No skipping.

**Why:**
- Each tutorial level teaches exactly one mechanic
- Ensures every player learns: attack (T1), survival (T2), summon (T3), charge (T4)
- `progression.tutorialComplete` gates access to world map
- `allowedModes` restriction per tutorial level prevents confusion

## 12. Stars = Musical Performance, Not Just Winning

**Decision:** Stars awarded based on note accuracy percentage, not just defeating enemies.

**Why:**
- Reinforces the core design: better music = better gameplay
- `accuracyPct = hits / (hits + misses)` — directly measures musical skill
- Progression system (skills) uses stars as currency
- Players are incentivized to replay for higher accuracy, not just win

## 13. No External Dependencies

**Decision:** Zero npm packages, zero CDN imports, zero libraries.

**Why:**
- No supply chain risk
- No version conflicts
- No bundle size concerns
- Forces understanding of every line of code
- Deployment is just copying files

## 14. Current Focus: Piano Only

**Decision:** Guitar and Voice are planned but not active. Piano (keyboard + touch + mic) is the only instrument.

**Why:**
- Ship one thing well before expanding
- Piano input is the simplest to validate (discrete notes)
- Guitar requires chord detection (more complex, partially built)
- Voice requires pitch tracking (partially built, needs tuning)

## Known Bugs (Codebase)

1. `audio/index.js`: `resumeAudioContext` declared twice (~lines 132 and 244)
2. `game.js`: `btn-practice` listener wired twice (merge artifact)

## See Also

- [[ARCHITECTURE]] — How these decisions manifest in code
- `CLAUDE.md` — Design principles section

## 2026-03-17 — Mic input required for all instruments including Piano

**Decision:** All instruments (Piano, Guitar, Voice) use microphone as primary input.
On-screen piano keys and QWERTY keyboard input are dev/fallback only.

**Flow:** Instrument Select → CALIBRATION → mic permission + noise floor → startGame()

**Rejected approach:** Piano bypassing calibration and using only keyboard/touch input.
This was tried and reverted — it breaks the core design principle that the instrument
(physical instrument played into mic) is the only controller.

**Why mic is required:**
- Maintains the "instrument is the only controller" principle
- Calibration sets noise floor essential for gate accuracy on quiet phone mics
- AudioContext must be created inside a user gesture; calibration provides that gesture
- Keyboard/touch fallback exists for dev testing only, not gameplay

**Known issues fixed (2026-03-17):**
- Noise gate was 1.5× — too aggressive for quiet piano notes on phone mic → lowered to 1.2×
- Floor minimum of 0.001 prevents lockout when calibration was skipped
- Piano notes never scored above chord-match confidence threshold → pitch bridge added

**See also:** [[AUDIO_PIPELINE]] — full pipeline architecture and debug overlay
