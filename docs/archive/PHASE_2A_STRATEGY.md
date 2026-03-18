# Chord Wars — Phase 2A Strategy
**Bug Crush & Core Polish — Phase 2A (2026-03)**
**Status:** Implementation complete — see `claude/phase2a-bug-crush` PR

> **Vault links:** [[GAME_SYSTEMS]] (current state) | [[PROJECT_HISTORY]] | [[ROADMAP]]
> **This file has two parts:** Top = active bug-fix reference (how each bug was fixed). Bottom = historical Phase 2A draft (minigames/sound vision that was de-scoped). Read top section for implementation context; bottom section is planning history.

> **Note:** This file was originally a draft for an earlier planning session.
> The canonical Phase 2A bug list and root causes are now maintained in CLAUDE.md in the repo.
> See below for the full bug-fix reference as implemented.

---

## Phase 2A Bugs Fixed (Implementation Reference)

See the repo `CLAUDE.md → Known Bugs` table for current status.
See the repo `docs/skills/` for engine-specific constraints post-fix.

### Bug 1 — World map locked after tutorial
`isNodeUnlocked`: added `'hub'` special case → satisfied by `tutorialComplete === true`.
File: `src/data/worldMap.js`

### Bug 2 — Enemy base 1% damage per hit
`BASE_DIRECT_DAMAGE` 8→10; accuracy floor 10%→30%; miss only counted when enemies present.
File: `src/systems/attackSequence.js`

### Bug 3 — Overlapping enemy cues
Y-band bucketing (40px); non-nearest enemies at 45% opacity.
File: `src/renderer.js`

### Bug 4 — Input mode not obvious
Color-coded 3px top border on HUD panel (blue/red/amber).
File: `src/ui/hud.js`

### Bug 5 — Victory buttons blocked
Buttons enabled immediately; melody plays in background.
File: `src/game.js`

### Bug 6 — Kill melody simultaneous
Each oscillator: `ctx.currentTime + 0.02 + i * 0.15` (not batched).
File: `src/input/keyboard.js`

### Bug 7 — Touch piano silent
Added `[click] px py note` debug logging; coordinate fix pending device test.
File: `src/ui/hud.js`

### Bug 8 — Settings never appears
Import + call `wireSettingsUI()` in game.js init.
File: `src/game.js`, `src/ui/screens.js`

### Bug 9 — Summon cues invisible mid-fight
Large "Play: C3 → E3 → G3" text below tablature bar.
File: `src/renderer.js`

---

# Original DRAFT below (historical reference)
**Minigame Framework, Sound Engine, & Agent-Tuning Approach**
**Timeline:** Weeks 4–6 (after Phase 1D complete)
**Status:** SUPERSEDED — see above for actual Phase 2A implementation

---

## Executive Summary

Phase 2A introduces three core expansions to Chord Wars:
1. **Minigame Framework** (Mario Party-style variety, 5–10 min diversions)
2. **Sound Engine Architecture** (rhythm generation, accompaniment, musical feel)
3. **System Map** (progression visualization, composition levels, achievement tracking)

This document proposes 8 minigame concepts and a multi-layer sound engine architecture compatible with Web Audio API and vanilla JavaScript.

---

## Part 1: Minigame Framework

### Design Principles
- **Short play loops:** 30 sec – 3 min per minigame (mosaic variety, not boss battles)
- **Musical skill training:** Each minigame teaches a specific technique (rhythm, scale, speed, pitch)
- **Rewards integration:** Earnings feed back into main RTS (resources, cosmetics, unlocks)
- **Fallback to main game:** Always able to skip and return to campaign (optional)
- **Cross-platform input:** Works with piano keys, guitar mic, and voice (Phase 2+)

### Minigame #1: Arpeggio Accelerator

**Category:** Speed + Rhythm Training  
**Duration:** 1–2 minutes  
**Input:** Piano keys (QWERTY: C/D/E/F/G/A) or guitar (6 strings as arpeggio notes)

**Gameplay:**
- Screen shows a chord (e.g., "C Major: C–E–G")
- Player must play ascending arpeggio: C → E → G → C (one octave up)
- Tempo starts slow (60 BPM), accelerates every 8 beats (+20 BPM per stage)
- **Meter bar** fills on each correct note; **screenshake intensity** increases with tempo
- Player fails on wrong note or missed beat; game ends when meter hits 100% or player misses

**Scoring:**
- Base: 100 points per completed octave
- Bonus: +10 points per missed beat avoided
- Combo multiplier: 2× at 120 BPM, 3× at 160 BPM, 4× at 180+ BPM

**Musical Skill Taught:** Hand coordination, finger independence, tempo awareness

**Integration:**
- Unlock by beating wave 3 in campaign
- Win reward: +50 resources or cosmetic skin
- Appear in "Daily Challenge" rotation (Phase 2B)

**Reference Aesthetic:** Audiosurf (tempo-reactive visuals), Crypt of the NecroDancer (rhythm-driven)

---

### Minigame #2: Chord Memory (Simon Says)

**Category:** Chord Recognition + Memorization  
**Duration:** 1–3 minutes  
**Input:** Piano keys (QWERTY) or guitar chords (mic)

**Gameplay:**
- Game plays a sequence of chords: G → C → G → Em → C (5 chords, fixed sequence)
- Player must **hear and memorize**, then **play back the sequence correctly**
- Each round adds 1 chord to sequence (memory chain grows: 1 → 2 → 3 → ... → 10)
- Visual feedback: Chord names glow when played by AI, then fade. Player must play in order.
- **Difficulty scaling:** Tempo increases (slower = easier, faster = harder), feedback decreases (labels hide)

**Scoring:**
- Points per correct sequence: 50 × round number
- Bonus: +25 for perfect tempo (within ±100ms per chord)
- Streak multiplier: 1.5× if last 3 sequences were flawless

**Musical Skill Taught:** Interval ear training, chord recognition, muscle memory

**Integration:**
- Unlock by beating wave 5
- High score tracked separately (local leaderboard, Phase 2B → global)
- Reward: Cosmetic "Memory Master" badge

---

### Minigame #3: Scale Shredder (Note Pattern)

**Category:** Melodic Accuracy + Speed  
**Duration:** 30 sec – 1.5 min  
**Input:** Guitar mic (monophonic) or piano keys (one at a time)

**Gameplay:**
- Screen displays a scale pattern (e.g., "C Major ascending: C–D–E–F–G–A–B–C")
- Notes appear as falling blocks (Guitar Hero style) or buttons to press
- Player plays/presses notes in order, on beat (metronome ticks at 120 BPM, adjustable)
- Sections get faster (+20 BPM per 8 notes) or change scales (Major → Minor → Pentatonic)
- Game ends when player misses 3 notes or reaches end of chart (success)

**Scoring:**
- Base: 10 points per correct note
- Accuracy bonus: +5 if within 50ms of beat, +0 if 50–200ms, −10 if >200ms
- Combo chain: 2× at 15 correct, 3× at 30 correct

**Musical Skill Taught:** Finger dexterity, interval knowledge, timing precision

**Integration:**
- Unlock by beating wave 4
- Reward: +75 resources or "Shredder" cosmetic title
- Daily variant: Different scale each day (C/G/D/A rotation)

---

### Minigame #4: Metronome Mastery (Rhythm Accuracy)

**Category:** Rhythm Precision  
**Duration:** 1 minute  
**Input:** Any (piano, guitar, voice clap detection)

**Gameplay:**
- Metronome ticks at 120 BPM (adjustable: 80–160 BPM)
- Player must tap/strum **on every beat** for 60 seconds
- Game measures **timing accuracy:** How close each tap is to expected beat
- If off-beat by >100ms three times → game ends (fail) or continues with penalty (hard mode)
- **Visual feedback:** Circle pulses; player input shows as marker (green=on-time, yellow=slightly off, red=late)

**Scoring:**
- Base: 1 point per on-time beat (60 max at 120 BPM)
- Accuracy: +0.5 per beat within ±50ms, −0.5 per beat >100ms off
- Streak bonus: 1.5× multiplier if 30+ consecutive on-time beats

**Musical Skill Taught:** Internal clock, timing stability, groove feel

**Integration:**
- Unlock by beating wave 2 (tutorial minigame)
- Reward: +30 resources (lower value; more of a practice tool)
- Used in **Rhythm Tier** of skill tree (improves unit spawn rate in main game)

---

### Minigame #5: Harmony Explorer (Chord Voicing)

**Category:** Music Theory + Ear Training  
**Duration:** 2–3 minutes  
**Input:** Piano keys (standard QWERTY)

**Gameplay:**
- Game plays a **root note** (e.g., "C") then plays a chord voicing
- Player must identify the chord type: Major, Minor, Dominant 7, or Suspended
- Multiple rounds: 1 root → 5 chords to identify (correct/incorrect feedback)
- **Difficulty escalation:** Early rounds use clear voicings (open position); late rounds use tight voicings (jazz substitutions)
- **Time pressure:** 10 sec per chord (shows timer); running out of time = wrong answer

**Scoring:**
- Correct answer: 20 points
- Speed bonus: +10 if answered in <5 sec
- Streak: 1.5× after 3 correct in a row

**Musical Skill Taught:** Ear training, chord recognition, music theory knowledge

**Integration:**
- Unlock by beating wave 6
- Reward: Unlock "Jazz Chords" library (Phase 2A+)
- Used in **Harmony Tier** of skill tree

---

### Minigame #6: Band Battle Royale (Competitive AI)

**Category:** Competitive / Dueling  
**Duration:** 3–5 minutes  
**Input:** Piano keys or guitar chords (user's normal input)

**Gameplay:**
- Player faces 1 AI opponent (increasingly difficult)
- Both players summon units via chord input (like main game but compressed)
- Match runs for 3 minutes (or until one base is destroyed)
- Shorter play time (1/3 of campaign) but same core loop
- **Scaling:** Easy AI makes mistakes, Medium AI reads player patterns, Hard AI is near-optimal

**Scoring:**
- Win: 200 points + resources earned
- Enemy HP remaining: Bonus points (1 pt per 1% of their max HP)
- Survival time: +1 pt per second (incentivizes not rushing)

**Musical Skill Taught:** Rhythm consistency, chord speed, resource management

**Integration:**
- Unlock by beating wave 7
- Reward: Premium cosmetic (custom unit skin) or +100 resources
- Future: Leaderboard ranking by win rate

---

### Minigame #7: Improvisation Canvas (Free Expression)

**Category:** Freeform / Exploration  
**Duration:** 2–5 minutes (user-driven)  
**Input:** Guitar mic or piano keys

**Gameplay:**
- Game provides a **backing track** (play button, loops a simple chord progression: I–vi–IV–V)
- Player improvises freely over the backing (no scoring, no pass/fail)
- Visual feedback: Chord detector shows detected chords in real-time (chromagram visualization or chord name display)
- Optional: Record improvisations (saves to localStorage, playback only)
- **Modifiers:** Change key, tempo, chord progression, or add drum track

**Scoring (Optional):**
- No scoring; purely creative/exploratory
- Reward system: Unlock after 10 min of total improvisation time (cosmetic badge)

**Musical Skill Taught:** Chord-scale relationship, improvisation confidence, creative ear development

**Integration:**
- Unlock by beating wave 4 (early access)
- No resource reward (intrinsically motivating)
- Replayable without limit
- Foundation for Phase 3+ "Composition Mode" (save + share user songs)

---

### Minigame #8: Pitch Perfect (Vocal Tuning, Voice Faction Preview)

**Category:** Voice / Pitch Control  
**Duration:** 1–2 minutes  
**Input:** Voice / mic (monophonic)

**Gameplay:**
- Game plays a **target note** (A4, 440 Hz)
- Player sings/hums the note
- Pitch detector shows how close they are (visual pitch slider: too low ← target note → too high)
- Goal: Hold pitch within ±20 cents for 8 beats (1 bar at 120 BPM)
- Multiple rounds: 5 different notes in sequence (C4, E4, G4, C5, E5)

**Scoring:**
- Perfect hold (±10 cents): 30 points
- Good hold (±20 cents): 20 points
- Close enough (±50 cents): 10 points
- Out of range: 0 points

**Musical Skill Taught:** Pitch control, ear training, vocal technique foundation

**Integration:**
- Unlock by selecting "Voice" faction on title screen (Phase 2+)
- Reward: +50 resources or "Pitch Perfect" cosmetic badge
- Gateway to Voice Faction gameplay (Phase 2C+)

---

## Minigame Progression & Unlocks

| Minigame | Unlock Wave | Reward | Replayable | Notes |
|----------|-------------|--------|-----------|-------|
| Metronome Mastery | 2 | +30 resources | Unlimited | Tutorial; practice focus |
| Chord Memory | 5 | +50 resources | Unlimited | Memory chain grows |
| Scale Shredder | 4 | +75 resources | Daily variant | Each day = different scale |
| Arpeggio Accelerator | 3 | +50 resources | Unlimited | Difficulty ramps fast |
| Harmony Explorer | 6 | Unlock Jazz Chords | Unlimited | Music theory focus |
| Band Battle Royale | 7 | Cosmetic skin | Unlimited | Competitive, high engagement |
| Improvisation Canvas | 4 | +0 (intrinsic) | Unlimited | Freeform creative |
| Pitch Perfect | Title (Voice) | +50 resources | Unlimited | Voice faction preview |

---

## Part 2: Sound Engine Architecture

### Design Goals
1. **Adaptive:** Responds to player input (what chord they played, tempo, accuracy)
2. **Layered:** Rhythm layer + harmony layer + melodic layer + FX layer
3. **Performant:** Runs on Web Audio API without heavy computation
4. **Modular:** Each layer can be toggled on/off or swapped
5. **Integrated with game loop:** Updates alongside unit spawning and combat events

### Proposed Layers

#### Layer 0: Rhythm Engine
**Responsibility:** Generates beat grid, tap points, metronome for player reference  
**Input:** Tempo (BPM), time signature (4/4, 3/4), difficulty (quantization strictness)  
**Output:** Beat markers, click/metronome audio  
**Implementation:**
```javascript
// Pseudo-code
class RhythmEngine {
  constructor(tempo, timeSig) {
    this.tempo = tempo;      // BPM
    this.timeSig = timeSig;  // '4/4', '3/4', etc.
    this.beatMs = (60000 / tempo) * 4;  // Quarter note in ms
    this.currentBeat = 0;
  }

  update(dt) {
    this.currentBeat += dt / this.beatMs;
    // Fire "beat" event every quarter note
    // Fire "downbeat" event every measure
  }

  // Quantize player input to nearest beat
  quantizeInput(inputTimeMs, quantizationLevel = 'sixteenth') {
    const quantMs = {
      'quarter': this.beatMs,
      'eighth': this.beatMs / 2,
      'sixteenth': this.beatMs / 4,
    }[quantizationLevel];
    return Math.round(inputTimeMs / quantMs) * quantMs;
  }
}
```

**Audio Output:** Metronome clicks or kick drum pattern (OscillatorNode or sampled audio)

---

#### Layer 1: Harmony / Accompaniment Engine
**Responsibility:** Generates chord accompaniment based on detected player chords  
**Input:** Detected chord (from chords.js), voice (bass, mid, stab), intensity (volume envelope)  
**Output:** Harmonic pad, bass line, or chord arpeggio  
**Implementation:**
```javascript
class AccompanimentEngine {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.voicingLibrary = {
      'C': { notes: [60, 64, 67], octaves: [3, 4] },  // C3, C4, E4, G4, etc.
      'G': { notes: [67, 71, 74], octaves: [3, 4] },
      // ... etc for all 6 chords
    };
  }

  playChordStab(detectedChord, duration = 1.0) {
    const voicing = this.voicingLibrary[detectedChord];
    // Trigger chord notes in Web Audio API
    // Apply envelope: attack 0.1s, release 0.3s, duration 1.0s
    voicing.notes.forEach(midi => {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);  // MIDI to Hz
      const osc = this.ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(this.ctx.destination);  // or to reverb bus
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration);
    });
  }

  playBassLine(detectedChord, tempo, durationBeats) {
    // Root note of chord at bass register (octave 1–2)
    // Generate 8th-note walking line or simple quarter-note pattern
  }
}
```

**Audio Output:** Synth pad, sampled bass, or chord arpeggio triggered by player input

---

#### Layer 2: Melodic Layer (Minigame Support)
**Responsibility:** Guides player via falling-block notation or musical prompts  
**Input:** Scale (C major, G major, etc.), difficulty (which notes to highlight), player input  
**Output:** Visual note grid, pitch feedback, success/failure audio cues  
**Implementation:**
```javascript
class MelodicLayer {
  constructor(scale, difficulty) {
    this.scale = scale;        // 'C Major', 'G Major', etc.
    this.noteSequence = [];    // Notes to play in current minigame
    this.difficulty = difficulty; // 'easy' (whole notes), 'medium' (eighth), 'hard' (sixteenth)
  }

  generatePattern(minigameType) {
    switch (minigameType) {
      case 'arpeggio':
        // Return ascending arpeggio of chord
        break;
      case 'scale':
        // Return scale ascending then descending
        break;
      case 'pattern':
        // Return user-selected melodic pattern
        break;
    }
  }

  checkPlayerNote(detectedNote, expectedNote, tolerance = 50) {
    // Tolerance in cents; pitch detected by YIN algorithm
    // Return { correct: bool, confidence: 0-1 }
  }
}
```

---

#### Layer 3: FX & Reactive Layer
**Responsibility:** Sonically reacts to game events (kills, combos, level-ups, failures)  
**Input:** Game event (kill, combo, wave change, game over), event intensity  
**Output:** Satisfying audio response (hit sound, level-up chime, game-over drone)  
**Implementation:**
```javascript
class FXLayer {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.samples = {
      'kill': audioBuffer_kill,      // Pre-loaded audio buffer
      'combo5': audioBuffer_combo5,
      'levelUp': audioBuffer_levelUp,
      'victory': audioBuffer_victory,
    };
  }

  triggerKillSound(intensity = 1.0) {
    // Pitch up based on kill streak
    // Volume up based on combo multiplier
    const source = this.ctx.createBufferSource();
    source.buffer = this.samples.kill;
    source.playbackRate.value = 0.8 + (intensity * 0.4); // 0.8–1.2x speed
    source.connect(this.ctx.destination);
    source.start(this.ctx.currentTime);
  }

  triggerComboMilestone(comboCount) {
    // 5-kill: subtle ping
    // 10-kill: rising pitch sweep
    // 20-kill: big triumphant horn
    if (comboCount === 5) this.triggerKillSound(0.5);
    else if (comboCount === 10) this.playSweep();
    else if (comboCount === 20) this.playHorn();
  }
}
```

---

### Sound Engine Integration Points

| Game Event | Audio Response | Layer |
|------------|---|--------|
| Chord detected (guitar) | Harmonic stab + chord name chime | Harmony + FX |
| Unit spawned | Ascending flourish (arpeggio of chord) | Melodic |
| Enemy killed | Hit sound (pitch ↑ with combo) | FX |
| Combo milestone (5/10/20) | Ascending pitch sweep or fanfare | FX |
| Wave change | Drum fill + bass riff | Rhythm + Harmony |
| Base damaged | Warning drone (descending pitch) | FX |
| Game victory | Triumphant orchestral swell | FX |
| Game defeat | Game-over drone + reverb tail | FX |

---

### Web Audio Graph Sketch

```
Mic Input (guitar mode)
  ├─→ AnalyserNode (pitch detection)
  └─→ Gain (input monitoring, optional)

Rhythm Engine
  ├─→ OscillatorNode (metronome click)
  └─→ Gain node

Harmony Engine
  ├─→ OscillatorNode × N (chord notes)
  └─→ Gain node

FX Layer
  ├─→ BufferSource × 3 (kill, combo, level-up sounds)
  └─→ Gain node

Reverb Bus (optional, Phase 2+)
  ├─→ ConvolverNode (reverb impulse response)
  └─→ DryWet Gain mix

Master Output
  ├─→ Metronome Gain
  ├─→ Harmony Gain
  ├─→ FX Gain
  ├─→ Reverb Bus Gain
  └─→ Destination (speakers)
```

**Key insight:** Each layer has an independent gain node, allowing the player to mix (e.g., "mute feedback sounds" or "no metronome").

---

## Part 3: Agent-Tuning Workflow

### Proposed Specialized Agents (Haiku/Claude)

#### Agent 1: Sound Engine Agent
**Specialization:** Audio pipeline, Web Audio API, rhythm generation  
**Responsibilities:**
- Implement RhythmEngine, AccompanimentEngine, FXLayer
- Debug audio latency, phase alignment, gain calibration
- Test Web Audio graph under load (5+ simultaneous sources)

**Inputs:** Game event stream (kills, chords, waves), user settings (volume, tempo)  
**Outputs:** Audio signals, latency metrics, CPU usage  
**Convergence Criteria:**
- Sub-50ms latency from game event to audible FX
- No audio artifacts or clicks
- <5% CPU usage on target device (mid-range Android)

---

#### Agent 2: Graphics Engine Agent
**Specialization:** Canvas 2D, minigame visuals, HUD updates  
**Responsibilities:**
- Render falling-block notation for Scale Shredder
- Render pitch slider for Pitch Perfect minigame
- Animated transitions between minigames and main game

**Inputs:** Minigame state, player input, detected notes  
**Outputs:** Canvas 2D draw commands  
**Convergence Criteria:**
- 30+ FPS during minigame play
- Clear, readable note visualization
- Responsive touch input feedback

---

#### Agent 3: Gameplay Engine Agent
**Specialization:** Game logic, minigame scoring, difficulty scaling  
**Responsibilities:**
- Implement scoring functions per minigame
- Auto-scale difficulty based on player performance
- Reward system integration (resources, cosmetics, unlocks)

**Inputs:** Player input accuracy, combo state, round progression  
**Outputs:** Score, reward amount, difficulty adjustment  
**Convergence Criteria:**
- Scoring feels fair and transparent
- Difficulty ramps naturally (not too easy early, not wall-hard late)
- Unlock system rewards progress without spoiling surprises

---

#### Agent 4: Composition Engine Agent
**Specialization:** Music theory, chord progressions, backing tracks  
**Responsibilities:**
- Generate backing tracks for Improvisation Canvas minigame
- Define chord progressions for different keys
- Implement chord voicing library

**Inputs:** Selected key, chord progression, tempo  
**Outputs:** Backing track definition (note list + timing), chord voicings  
**Convergence Criteria:**
- Backing tracks sound musically coherent
- Chord voicings are recognizable and useful
- Improvisation canvas feels supportive (not restrictive)

---

#### Agent 5: AI Engine Agent
**Specialization:** NPC opponent AI, skill assessment, adaptive difficulty  
**Responsibilities:**
- Implement "Band Battle Royale" opponent AI
- Auto-assess player skill level from gameplay metrics
- Generate daily challenge variations

**Inputs:** Player performance (accuracy, speed, resource management), game history  
**Outputs:** AI difficulty level, opponent unit summon decisions, daily challenge config  
**Convergence Criteria:**
- AI opponent feels like a real player (makes mistakes, strategic moves)
- Difficulty adapts to player skill without feeling unfair
- Daily challenges are novel but solvable

---

### Development Loop (Per Agent)

**Each agent session follows this structure:**

1. **Init:** Agent receives game state snapshot + minigame config
2. **Implement:** Generate code for assigned subsystem
3. **Test:** Run against reference implementations
4. **Metrics:** Measure latency, accuracy, CPU usage, or subjective quality
5. **Iterate:** If metrics miss targets, refine parameters or code
6. **Converge:** When metrics achieve threshold, lock implementation

**Example conversation (Sound Engine Agent):**

```
[Duncan]
Build the RhythmEngine class. It should:
- Accept tempo (BPM) and time signature
- Generate beat ticks at 120 BPM (quarter note = 500ms)
- Provide a quantizeInput() method that snaps player input to the nearest 16th note
- Have <1ms latency

[Sound Engine Agent]
[Generates RhythmEngine code]
[Tests quantization accuracy: ±5ms error across range]
[Returns: quantization error graph, latency report]

[Duncan (reviewing output)]
Latency looks good. Test it integrated with real mic input.

[Sound Engine Agent]
[Integrated test: mic input → chord detection → quantizeInput()]
[Measures end-to-end latency: 45ms average, 60ms max]
Result: ✅ CONVERGED (target 50ms achieved)
```

---

## Phase 2A Milestone Plan

| Week | Task | Owner | Deliverable |
|------|------|-------|-------------|
| 4 | Minigame framework scaffold + Rhythm Engine | Graphics + Sound Agents | Metronome Mastery (prototype) |
| 4–5 | Chord Memory + Arpeggio Accelerator | Gameplay Agent | 2 minigames + scoring |
| 5 | Scale Shredder + Band Battle Royale AI | Graphics + AI Agents | 2 minigames + opponent logic |
| 5–6 | Accompaniment layer + FX layer | Sound Engine Agent | Full sound graph integrated |
| 6 | System Map UI + progression visuals | Graphics Agent | Map screen, unlocks, cosmetics |
| 6 | Balance tuning + final integration | Gameplay Agent | All 8 minigames playable, balanced |

---

## Cosmetics & Reward System (Phase 2A+)

**Cosmetic unlocks earn via:**
- Minigame high scores (e.g., "Metronome Master" badge @ 500+ points)
- Achievement milestones (e.g., "Play 50 chords" → custom unit skin)
- Seasonal challenges (e.g., "Weekly: Beat Band Battle Royale" → limited cosmetic)

**Cosmetics include:**
- Unit skins (neon glow, pixel art, abstract shapes)
- Base themes (different arena backgrounds)
- UI themes (dark mode, high-contrast, colorblind modes)
- Player titles (neon "Shredder", "Memory Master", "Perfect Pitch")

---

## Open Questions for Haiku Planning Session

1. **Backing track generation:** Should we pre-author 10 backing tracks (I–vi–IV–V in C, G, D, A, E major) or procedurally generate?
2. **AI difficulty scaling:** Train on user gameplay metrics or rule-based difficulty curve?
3. **Voice input reliability:** How confident is pitch detection on cheap mics? Need speech-to-note conversion (Phase 3 challenge)?
4. **Minigame vs. main game time split:** Should players be encouraged to do minigames (XP boost?) or stay in campaign?
5. **Audio latency ceiling:** Is 50ms acceptable for rhythm minigames, or must we target <30ms?

---

## Next Steps

1. **Schedule Haiku planning session** with briefing prompt (see user memory docs)
2. **Finalize minigame designs** (confirm with Duncan any game feel preferences)
3. **Block out sound engine implementation** (identify any Web Audio API gotchas on iOS)
4. **Recruit agent team** (assign Sonnet or Grok to each specialization)
5. **Build Phase 2A dev environment** (branch structure, test framework)

---

**Ready for Phase 2A kickoff once Phase 1D ships.**
