# Chord Wars: Visual Process Flow Summary
**Integration of Phase 1D & Phase 2A with Current Codebase**
**Date:** March 2026

> **Status:** HISTORICAL — planning document from Phase 1D/2A transition.
> **Vault links:** [[PROJECT_HISTORY]] | [[ROADMAP]] | [[ARCHITECTURE]]
> **Note:** `src/minigames/` and `src/systems/systemMap.js` listed here were PLANNED but not built. Actual Phase 2A focused on bug fixes. Minigames deferred to Phase 2D.
**For:** Duncan (developer) and AI agents (Sonnet, Grok, Haiku)

---

## Three Process Flows (Visual Overview)

I've created three integrated flowcharts that show how Phase 1D and Phase 2A fit into your existing architecture:

### 1. **Development Roadmap Flowchart**
Shows the sequence of Phase 1D tasks and how they converge into a launch-ready MVP.

**What it shows:**
- **Phase 1C complete** (tablature, attack sequences, settings)
- **7 Phase 1D tasks in priority order:** Stats → Tutorial → Balance → Domain/Perf (parallel)
- **Convergence gate:** v1.0-mvp checkpoint
- **Phase 2A preview:** 5 parallel workstreams (Sound, MIDI, Minigames, Graphics, System Map)
- **Testing cycle:** What gets validated at each stage

**Key insight:** Phase 1D is sequential; Phase 2A is parallel. All phases feed into shared game loop.

---

### 2. **File Architecture Diagram**
Shows how all files relate to each other and which ones change in each phase.

**What it shows:**
- **Core hub:** `game.js` (state) + `renderer.js` (drawing)
- **Left column:** Audio pipeline (capture → chords → **NEW: soundEngine**)
- **Right column:** Game systems (units, waves, combat — all complete)
- **Center column:** UI & prompts (hud, screens, **NEW: tutorial**)
- **Color coding:**
  - Purple = audio files
  - Blue = core game loop
  - Teal = game systems (complete)
  - Amber = UI files
  - Coral = new Phase 1D/2A additions

**Phase 1D changes:**
- Modify: `src/ui/screens.js` (end-screen stats), `src/game.js` (state), `src/renderer.js` (drawing)
- Create: `src/ui/tutorial.js` (first-time UX)
- Tune: `src/constants.js`, `src/systems/waves.js`, `src/data/maps.js` (balance)

**Phase 2A additions:**
- New: `src/minigames/` directory (8 minigame modules)
- New: `src/audio/soundEngine.js` (4-layer audio architecture)
- New: `src/systems/systemMap.js` (progression visualization)
- Extend: `src/audio/midi.js` (Web MIDI API for controllers)

---

### 3. **Developer Workflow Diagram**
Shows the human/AI collaboration loop for each task.

**What it shows:**
- **4 stakeholders:** Duncan (tester/reviewer), Sonnet (code), GitHub (version control), Vercel (live)
- **Per-task workflow:**
  1. Duncan tests and identifies gaps
  2. Creates GitHub branch
  3. Writes briefing prompt for Sonnet (one task per chat)
  4. Sonnet generates complete code + tests
  5. Duncan reviews on live PR preview
  6. Merge to master → auto-deploy to Vercel
  7. Iterate if bugs found

**Phase 2A agent pattern:**
- 5 specialized agents (Sound, Graphics, Gameplay, Composition, AI)
- Each reports convergence metrics (latency, FPS, balance, coherence, NPC quality)
- Duncan integrates and validates results
- All agents share the same codebase and chat for consistency

---

## Quick Start Checklist: Phase 1D (Next 8 Days)

### Pre-work (Today)
- [ ] Read `PHASE_1D_ACTION_PLAN.md` (full implementation guide)
- [ ] Review both documents provided: `PHASE_1D_ACTION_PLAN.md` and `PHASE_2A_STRATEGY.md`
- [ ] Save these as reference in your project root

### Day 18–19: Task 1 (End-Screen Stats)
**File:** `src/ui/screens.js`  
**Changes:** Victory/defeat screens with stats grid

**Prompt template for Sonnet:**
```
Working on: src/ui/screens.js
Phase: 1D, Task 1
This file does: Render victory and defeat screens with stats

Current state fields needed:
- state.score
- state.wave (max 10)
- state.killCount
- state.stats.bestCombo
- state.stats.totalChordsFired
- state.baseHP (player remaining HP)

What I need:
- Victory screen: 3-star rating (based on baseHP %), stats grid (score, accuracy, waves, enemies, time, chord breakdown), "Next Level" and "Retry" buttons
- Defeat screen: same stats, plus coaching tip (show lowest-accuracy chord), "Retry Wave X" button
- Mobile responsive (fits on phone screen)
- Colors from existing palette (gold stars, success green, warning red)
- Chord breakdown as inline % displays

Here is current screens.js:
[paste current code]

Here is game.js state structure:
[paste relevant state fields]
```

**Acceptance criteria:**
- Victory screen displays correct stats
- Defeat screen shows coaching tip for weakest chord
- Stars animate on entry
- Mobile layout works (no horizontal scroll)
- All stats calculate correctly

### Day 19–21: Task 2 (Tutorial Overlay)
**File:** `src/ui/tutorial.js` (new)  
**Changes:** 5-panel tutorial that appears on first play

**Prompt template:**
```
Working on: src/ui/tutorial.js (new file)
Phase: 1D, Task 2
This file does: First-time onboarding tutorial with 5 panels

What I need:
- New file src/ui/tutorial.js that exports initTutorial() function
- 5 sequential panels (welcome, summon, combat, waves, tips)
- Each panel: text description + visual highlight (dashed circle around relevant UI)
- Auto-advance on timer or click "Next" button
- Store "hasSeenTutorial" in localStorage
- Graceful skip (Spacebar/Escape dismisses all)
- Mobile responsive
- Panels integrate with existing renderer (draw overlay on canvas)

Here is game.js scene state machine:
[paste PLAYING scene structure]

Here is renderer.js Canvas context setup:
[paste canvas setup code]
```

**Acceptance criteria:**
- Tutorial appears only on first launch (localStorage check)
- All 5 panels display correctly
- Highlight circles render around correct UI elements
- Skip button works without breaking game state
- Mobile layout readable

### Day 21–23: Task 3 (Difficulty Balance)
**Files:** `src/constants.js`, `src/systems/waves.js`  
**Changes:** Tune wave difficulty curves for Easy/Medium/Hard

**Workflow (different from above):**
1. Play through all 10 waves at each difficulty setting
2. Time each run, note: "felt too easy" / "felt fair" / "felt punishing"
3. Identify bottlenecks: "wave 7 is a wall" or "early game is boring"
4. Request specific tuning: "reduce spawn interval from 8s to 7s on Medium", etc.
5. Sonnet adjusts constants and explains the math
6. Test again, iterate

**Key values to adjust:**
- Initial spawn interval (Easy: 12s, Medium: 8s, Hard: 5s)
- Interval reduction rate (−0.25s, −0.5s, −0.75s per 60s)
- Wave advancement speed (40s, 30s, 25s per wave)
- Enemy tier probabilities (% T1, T2, T3 by wave)

**Acceptance criteria:**
- All 3 difficulties feel distinct
- Easy: completable in 6–8 min (casual)
- Medium: 8–10 min (engaging)
- Hard: 12–15 min (intense, fair)

### Day 23–24: Task 4 (3-Star Rating)
**File:** `src/ui/screens.js`  
**Changes:** Add animated stars based on base HP remaining

**Quick add-on (low effort, high impact):**
- Victory screen: display ⭐⭐⭐ / ⭐⭐ / ⭐ based on `state.baseHP / 100`
- Animation: stars pop in and rotate on victory screen entry
- Color: gold (#f1c40f) with glow effect
- Formula: 80%+ HP = 3 stars, 50–79% = 2 stars, 1–49% = 1 star

**Prompt:** Brief task, can be done in one conversation with screens.js author.

### Days 24–25: Tasks 5–7 (Share URL, Domain, Perf)
**Low priority, run in parallel:**

**Task 5 (optional):** Twitter share button on victory screen
- Share intent with score + stars
- Copy-to-clipboard fallback
- Can be deferred to post-launch if time-pressed

**Task 6 (fast):** Move from `chordwars.vercel.app` → `chordwars.com`
- Register domain (Namecheap, ~$12/year)
- Add to Vercel project settings
- Wait for DNS propagation (10 min to 24 hrs)
- Update README + docs
- ~30 min total work

**Task 7:** Performance audit on Android
- Open Chrome DevTools Performance tab
- Record 30s gameplay (wave 5–7)
- Check FPS graph: target 30+ FPS
- If already achieved, skip further optimization
- If below target, identify bottleneck (canvas draws, memory leaks, audio processing)

---

## Phase 2A Preparation (Weeks 4–6)

**When Phase 1D ships (tag v1.0-mvp):**

1. Rename `SONNET_PROJECT_INSTRUCTIONS_1C.md` → `CLAUDE.md` (repo root)
2. Update `Current Phase:` field to **Phase 2A**
3. Create five specialized agent briefs (one for each workstream)

**Schedule Haiku planning session:**
- Use prompt template in `BRIEFING_PROMPTS.md` → "HAIKU PROMPT — Chord Wars Phase 2 Planning"
- Output: 8 minigame designs, sound engine architecture, agent skill definitions, priority matrix
- Result feeds directly into Phase 2A task breakdown

**Five parallel agents:**
1. **Sound Engine Agent** → Implement rhythm, harmony, FX, melodic layers
2. **Graphics Agent** → Minigame UI, falling blocks, pitch visualizer
3. **Gameplay Agent** → Minigame scoring, difficulty scaling, rewards
4. **Composition Agent** → Backing tracks, chord voicings, music theory
5. **AI Agent** → NPC opponent logic, skill assessment, daily challenges

Each agent works independently but commits to same repo.

---

## File Structure Reference

**Phase 1D files:**
```
src/ui/screens.js           ← Modified (stats display)
src/ui/tutorial.js          ← NEW
src/game.js                 ← Modified (state augmentation)
src/renderer.js             ← Modified (stats/tutorial rendering)
src/constants.js            ← Tuned (difficulty values)
src/systems/waves.js        ← Tuned (wave progression)
```

**Phase 2A files (preview):**
```
src/minigames/              ← NEW directory
  metronome.js
  chordMemory.js
  shredder.js
  arpeggioAccelerator.js
  harmonyExplorer.js
  bandBattle.js
  improvCanvas.js
  pitchPerfect.js
src/audio/soundEngine.js    ← NEW (rhythm + harmony + FX + melodic)
src/systems/systemMap.js    ← NEW (progression, unlocks, cosmetics)
src/audio/midi.js           ← Extended (Web MIDI support)
```

---

## Key Principles to Remember

1. **One task per chat** — When briefing Sonnet, focus on a single file/task. Include all dependency code.

2. **Branch + PR always** — Never push directly to master. Create feature branches, open PRs, review on live preview before merging.

3. **State lives in game.js** — All other modules receive state as a reference parameter. No subsystem owns state.

4. **Renderer is pure** — renderer.js only draws. It reads state but never mutates it.

5. **Mobile-first thinking** — Canvas scales by `devicePixelRatio`. Avoid allocations in game loop. Test on Pixel 4a or equivalent (mid-range Android).

6. **Audio latency matters** — Target sub-100ms from chord detection to visual feedback. Use `requestAnimationFrame` for timing, not `setInterval`.

7. **Iterate fast** — Test locally, review PR preview on Vercel, merge when confident. If bug found, fix in same conversation with Sonnet, push new commit to same PR.

---

## How to Use These Documents

1. **Print or bookmark the three flowcharts** (shown above)
   - Reference them when explaining tasks to Sonnet
   - Use them to track progress visually

2. **Keep `PHASE_1D_ACTION_PLAN.md` open** during implementation
   - Detailed step-by-step for each task
   - Exact acceptance criteria for testing
   - Design specs and edge cases

3. **Save `PHASE_2A_STRATEGY.md`** for after Phase 1D ships
   - Reference when planning Phase 2A agents
   - Use minigame designs as Sonnet input
   - Share agent skill definitions with team

4. **Update project instructions** after each phase
   - Move to next phase in `CLAUDE.md`
   - Update any architectural decisions
   - Keep settled values current (difficulty, thresholds, etc.)

---

## Success Checklist: Phase 1D Complete

- [ ] All 7 Phase 1D tasks implemented and merged to master
- [ ] 30+ FPS on mid-range Android Chrome (verified)
- [ ] New player completes tutorial + first game in <5 min (user tested)
- [ ] Victory/defeat screens show all required stats
- [ ] Tutorial overlay appears once, can be skipped
- [ ] All 3 difficulty levels feel balanced (8–15 min playtime)
- [ ] Production domain chordwars.com live and SSL-verified
- [ ] v1.0-mvp tag created on GitHub
- [ ] README updated with live link + feature checklist
- [ ] Ready for external launch (Product Hunt, Hacker News, Reddit)

**When all above ✓:** Move to Phase 2A. Schedule Haiku planning session for minigame + sound engine design.

---

**Questions?** Refer back to the three flowcharts or the detailed action plan document. The visual flows answer "how does X fit together" and the action plan answers "how do I build X".

Good luck, Duncan! Phase 1D is the home stretch. 🎸⚔️
