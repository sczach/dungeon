# Chord Wars — Phase 1D Action Plan & Roadmap
**Status:** Late Phase 1C → Phase 1D (Immediate Next: Days 18–25)
**Updated:** March 2026

> **Current Status:** HISTORICAL — Phase 1D is complete. Phase 2A complete. Now on Phase 2B.
> **Vault links:** [[PROJECT_HISTORY]] | [[ROADMAP]] | [[GAME_SYSTEMS]]
> **Key design note:** Star formula here (HP-based) was CHANGED — actual implementation uses note accuracy %. See `CLAUDE.md → Scoring` for current formula.
**Developer:** Duncan  
**Project:** https://github.com/szach/chordwars

---

## Phase 1D Overview
Phase 1D bridges the MVP game core (nearly complete in Phase 1C) to production launch. The focus is **polish, balance, onboarding, and launch readiness**. No major architectural changes.

**Target Completion:** 7–8 calendar days of focused work.  
**Success Criteria:** Game feels complete, new player understands it in 60 seconds, 30+ FPS on mid-range Android Chrome, shareable score cards, production domain live.

---

## Priority Matrix: Impact vs. Effort

| Feature | Impact | Effort | Priority | Reasoning |
|---------|--------|--------|----------|-----------|
| End-screen stats display | High | Low | **1st** | Immediate satisfaction, shows player what they accomplished |
| Tutorial overlay (first-time UI) | High | Medium | **2nd** | Reduces confusion, enables casual players to engage |
| Difficulty balance pass | High | Medium | **3rd** | Makes waves 1–10 feel fair and engaging (core loop satisfaction) |
| 3-star victory rating | Medium | Low | **4th** | Encourages replay; low effort, high motivation boost |
| Shareable score URL + OG cards | Medium | High | **5th** | Viral growth vector; requires backend/Vercel Functions; defer if time-pressed |
| Production domain (chordwars.com) | Medium | Low | **6th** | Cosmetic; critical for launch perception but technically simple |
| Performance audit (Android) | High | Medium | **7th** | Do last; if 30+ FPS already achieved, skip intensive optimization |
| iOS Safari AudioContext edge case | Low | Medium | **8th** | Rare scenario; only if users report issues during testing |

**Recommended Sequence:** 1 → 2 → 3 → 4 → {5/6 in parallel} → 7 → 8

---

## 1. End-Screen Stats Display (Days 18–19)

**File:** `src/ui/screens.js` (victory/defeat screen rendering)  
**Depends on:** Current game state from `game.js` containing kill counts, accuracy, final HP, combo peaks

### What to Display (Victory Screen)

| Stat | Source | Notes |
|------|--------|-------|
| **3-star rating** | `state.baseHP / 100 * 100%` | 100% HP = ⭐⭐⭐, 50% = ⭐⭐, <50% = ⭐ |
| **Final Score** | `state.score` | Total accumulated points |
| **Accuracy (%)** | `(correctChords / totalChords) * 100` | Requires tracking in game.js |
| **Enemies Defeated** | `state.killCount` | Cumulative kill count |
| **Waves Survived** | `state.wave` (max 10) | Display as `N/10` |
| **Best Combo** | `state.stats.bestCombo` | Peak kill streak |
| **Chords Played** | `state.stats.totalChordsFired` | Count of detected chords (guitar) or key presses (piano) |
| **Time** | `state.playTime` (calculate from `Date.now() - startTime`) | MM:SS format |
| **Chord Breakdown** | `state.stats.chordAccuracy` per chord | G: 95%, C: 88%, D: 91%, etc. |

### Implementation Steps

1. **Augment game.js state** to track:
   ```javascript
   state.stats = {
     bestCombo: 0,
     totalChordsFired: 0,
     chordAccuracy: { G: 0, C: 0, D: 0, Em: 0, Am: 0, E: 0 }, // hit/miss per chord
     startTime: null, // set on PLAYING entry
   }
   ```

2. **Track accuracy in real time:**
   - When `prompts.js` fires a chord prompt and expects a match → flag as "attempted"
   - If match within debounce → increment hit for that chord
   - Else → increment miss; accuracy = hits / (hits + misses) * 100

3. **Update renderer to display victory stats:**
   - Grid layout: 2 cols × 6 rows (score, accuracy, enemies, waves, combo, time, chord breakdown full-width)
   - Highlight personal bests with badge color (yellow or gold)
   - Chord breakdown as horizontal bar chart or inline % displays

4. **Defeat screen variant:**
   - Omit "Personal Best" badges
   - Add **Coaching Tip** (yellow callout box):
     - Detect lowest-accuracy chord
     - Suggest practice focus: *"Your {chord} accuracy was 48% (lowest). Try placing your index closer to the fret."*
     - Link to "Practice {chord}" button

### Design Reference
See `Chord_Wars_Wireframes.jsx` (VictoryScreen / DefeatScreen sections) for exact layout and color scheme. Reuse badge component and grid styling.

### Testing Checklist
- [ ] Victory screen displays with correct calculations
- [ ] Defeat screen shows coaching tip for weakest chord
- [ ] Stats persist across screen refreshes (localStorage for last session?)
- [ ] Mobile responsive (stats fit on phone screen without horizontal scroll)
- [ ] "Next Level" button works (advances to next map, Phase 2A; for now, loops back to title)
- [ ] "Retry" button resets wave 1 with same difficulty setting

---

## 2. Tutorial Overlay (Days 19–21)

**File:** `src/ui/tutorial.js` (new module)  
**When Triggered:** First-time launch (detect via localStorage `hasSeenTutorial` flag)  
**Scope:** 3–5 short panels explaining core loop

### Tutorial Panels (Sequence)

| Panel | Trigger | Content | Duration | Action |
|-------|---------|---------|----------|--------|
| **1. Welcome** | Game starts (PLAYING scene) | "Use piano keys (QWERTY) to summon units. Defend your base!" | 5s auto-advance + click | "Next →" button |
| **2. Summon** | Show tablature prompt (e.g., "Play C-E-G") | Highlight keyboard, explain 3-note sequence. Show resource cost. | Interactive (user must press 3 keys) | Auto-advance on success |
| **3. Combat** | First enemy appears | "Units auto-attack enemies. Destroy the enemy base!" | 3s auto-advance | "Next →" |
| **4. Wave & Difficulty** | Wave 2 transition | "Waves get harder. Adapt your summons!" | 2s | "Got it!" dismisses |
| **5. Retry/Menu** | (Optional) Post-game | If user loses wave 1, suggest "Practice Mode" via tutorial card | 3s | Dismiss |

### Implementation Details

1. **Tutorial state in game.js:**
   ```javascript
   state.ui.tutorialActive = false;
   state.ui.tutorialStep = 0;
   state.ui.showTutorialOverlay = false;
   ```

2. **Rendering in renderer.js:**
   - Semi-transparent overlay canvas (50% opacity dark background)
   - Central modal card with text, arrows, highlight circles (radius 60px) around relevant UI
   - Dismiss button + "Got It" button

3. **Interactivity:**
   - "Next" button or auto-advance timer
   - Click anywhere to dismiss (optional, varies per panel)
   - Track `localStorage.setItem('hasSeenTutorial', 'true')` on final dismiss
   - Spacebar / Escape key to skip all tutorials

4. **Positioning for piano mode:**
   - Panel 1: Center screen, text above canvas
   - Panel 2: Overlay QWERTY keyboard diagram, highlight C/E/G keys, show "Press these 3 keys" prompt
   - Panel 3: Arrow pointing to enemy, "Units attack automatically"
   - Panel 4: Wave number display, "Difficulty scaling" callout

### Testing Checklist
- [ ] Tutorial appears only on first play (localStorage check works)
- [ ] Each panel displays correctly, no text cutoff on mobile
- [ ] Highlight circles render around correct UI elements (keyboard, enemy, wave counter)
- [ ] Auto-advance timing feels natural (not too fast, not too slow)
- [ ] Skip button works; skips to game without breaking state
- [ ] `hasSeenTutorial` flag persists across refresh/reload
- [ ] Tutorial disabled on "Practice Mode" start (mic calibration only)

---

## 3. Difficulty Balance Pass (Days 21–23)

**Files:** `src/constants.js`, `src/systems/waves.js`, `src/data/maps.js`  
**Testing Method:** Manual playthroughs at Easy/Medium/Hard; measure time-to-completion, resource flow, engagement

### Current Baseline (from SONNET_PROJECT_INSTRUCTIONS_1C.md)

| Parameter | Easy | Medium | Hard |
|-----------|------|--------|------|
| Initial spawn interval | 12s | 8s | 5s |
| Interval reduction rate | −0.25s / 60s | −0.5s / 60s | −0.75s / 60s |
| Wave advancement speed | 40s per wave | 30s per wave | 25s per wave |
| Enemy T1:T2:T3 ratio (wave 8–10) | 30:50:20 | 20:50:30 | 10:50:40 |

### Balance Testing Script (Do This)

1. **Play through all 10 waves at each difficulty:**
   - Record: time to completion, final HP%, peak resources, peak enemy count
   - Subjective: "Did I feel challenged?" "Did I feel in control?" "Pacing felt good?"

2. **Adjust these parameters if needed:**

   **If Early Game Too Easy:**
   - Reduce initial spawn interval: 12s → 10s (Easy), 8s → 7s (Medium)
   - Increase T2 ratio in waves 1–3: 20% → 30%

   **If Mid-Game Too Hard:**
   - Extend wave duration: 30s → 35s (Medium)
   - Reduce spawn interval reduction: −0.5s → −0.3s per 60s
   - Increase resource earn: Kill T2 from +30 → +40

   **If Late Game Too Grindy:**
   - Accelerate wave advancement: 30s → 25s (feels faster)
   - Increase T3 spawn chance: 30% → 40% (more variety)
   - Keep resource caps reasonable (soft cap 200, hard cap 999)

3. **Document final values:**
   - Update `SONNET_PROJECT_INSTRUCTIONS_1C.md` with final balance numbers
   - Commit with message: `"Difficulty balance pass: Easy/Med/Hard tuned for engagement across all 10 waves"`

### Success Criteria
- All three difficulties feel **distinct and fair** (not just number tweaks)
- **Easy:** Can be beaten by casual player with minimal resource management
- **Medium:** Requires tactical unit mixing and timing awareness
- **Hard:** Punishing; zero margin for error; 20 min play time (not tedious, not too short)

---

## 4. 3-Star Victory Rating (Days 23–24)

**File:** `src/ui/screens.js` (victory screen)  
**Logic:** Stars based on **base HP remaining at win**

### Star Formula

```javascript
const hpPercentage = (state.baseHP / 100) * 100;
let stars = 0;
if (hpPercentage >= 80) stars = 3;  // ⭐⭐⭐ — pristine
else if (hpPercentage >= 50) stars = 2; // ⭐⭐ — solid
else if (hpPercentage > 0) stars = 1;   // ⭐ — survived
// 0 HP = DEFEAT screen, no stars
```

### Display

- Large stars at top of victory screen (size ≈ 48px each)
- **Gold color:** `#f1c40f` (from color palette in wireframes)
- Glow effect: `textShadow: "0 0 20px #f1c40f40"`
- Animate stars on screen entry (pop in, rotate 360°, settle)

### Leaderboard Future-Proofing

When Firebase leaderboards launch (Phase 2B), sort by:
1. **Stars** (descending: 3 → 2 → 1)
2. **Final score** (tiebreaker: higher = better rank)
3. **Time** (tertiary tiebreaker: faster = better)

### Testing Checklist
- [ ] 3 stars display when beating game with HP ≥ 80%
- [ ] 2 stars display when HP is 50–79%
- [ ] 1 star displays when HP is 1–49%
- [ ] Stars animate smoothly on entry
- [ ] Star count matches displayed HP value (no off-by-one errors)

---

## 5. Shareable Score URL + Open Graph Cards (Days 24–25, *optional if time-pressed*)

**Complexity:** Medium-High (requires backend work)  
**Payoff:** High (viral growth via social sharing)  
**Defer to Phase 2 if time-critical.**

### Architecture

**Option A: Vercel Serverless Functions (Recommended)**
- Create `/api/score-card.js` (Vercel Function)
- Accepts query params: `score`, `stars`, `chords`, `wave`, `player` (name)
- Generates PNG via canvas or SVG
- Returns `image/png` Content-Type

**Option B: Open Graph Meta Tags (Simpler)**
- On Victory screen, generate shareable URL: `chordwars.com/?score=4850&stars=3&wave=10`
- Update `index.html` meta tags dynamically on victory:
  ```html
  <meta property="og:title" content="I scored 4,850 on Chord Wars!" />
  <meta property="og:description" content="Beat all 10 waves with ⭐⭐⭐ rating!" />
  <meta property="og:image" content="https://chordwars.com/api/score-card?score=4850&stars=3" />
  ```

### Steps (Quick Implementation)

1. **Victory screen "Share to Twitter" button:**
   ```javascript
   const text = `I just scored ${state.score} on Chord Wars! ⭐⭐⭐ Beat wave ${state.wave}/10 with my guitar. 🎸`;
   const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${currentShareUrl}`;
   window.open(url, '_blank');
   ```

2. **Copy to clipboard button:**
   - Show sharable URL on victory screen
   - Highlight text, "Copy Link" button copies to clipboard
   - Show toast: "Copied! Share with friends."

3. **Update index.html meta tags on victory:**
   - Dynamically set `og:title`, `og:description`, `og:image`
   - Twitter Card meta tags (`twitter:title`, `twitter:image`)

### Testing Checklist
- [ ] Victory screen displays share button
- [ ] Twitter share intent opens with correct text
- [ ] Clipboard copy works (test on desktop + mobile)
- [ ] Meta tags update when sharing
- [ ] Link preview shows on Twitter/Discord (requires live testing)

---

## 6. Production Domain (Days 25, parallel with other tasks)

**Task:** Move from `chordwars.vercel.app` → `chordwars.com`

### Steps

1. **Registrar (Namecheap / Cloudflare Registrar):**
   - Domain should already be registered (if not, register now, ~$12/year)
   - Note the nameservers

2. **Vercel Domain Binding:**
   - Vercel dashboard → Project Settings → Domains
   - Add custom domain: `chordwars.com`
   - Vercel provides DNS records or auto-configures if using Vercel nameservers
   - Follow Vercel's DNS setup (typically A record + CNAME for www)

3. **DNS Propagation:**
   - Takes 10 min to 24 hours
   - Test with `dig chordwars.com` or `nslookup chordwars.com`
   - Update GitHub repo `README.md`: "Live: https://chordwars.com"
   - Update project instructions and marketing materials

4. **SSL Certificate:**
   - Vercel auto-provisions Let's Encrypt certificate (free)
   - Should appear automatically in Domain Settings (green checkmark)

### Testing Checklist
- [ ] Domain resolves to Vercel app
- [ ] HTTPS works (no warnings in browser)
- [ ] Redirects from `www.chordwars.com` work (if set up)
- [ ] README and docs updated
- [ ] Social links point to production domain

---

## 7. Performance Audit (Days 25–26, *if still in timeline*)

**Target:** 30+ FPS on mid-range Android Chrome (Pixel 4a, OnePlus 8, Samsung A12)  
**Tools:** Chrome DevTools Performance monitor, Lighthouse

### Quick Audit Checklist

1. **Open DevTools → Performance tab**
2. **Record a 30-second gameplay session (wave 5–7 with 4–6 units on screen)**
3. **Analyze FPS graph:**
   - Green zone: 30+ FPS ✅
   - Yellow zone: 15–30 FPS (acceptable for 2D canvas, not ideal)
   - Red zone: <15 FPS (problematic)

### Common Bottlenecks & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Excessive draw calls | FPS drops as unit count increases | Batch canvas draws, use offscreen canvas for complex shapes |
| Memory leaks (event listeners) | FPS degrades over 5+ minutes | Ensure cleanup in scene transitions; test with heap snapshots |
| Unoptimized audio processing | CPU spike on chord match | Audio pipeline is already async; verify no blocking calls |
| High-DPI rendering overhead | Blurry or slow on high-DPI displays | Confirm canvas context is pre-scaled by `devicePixelRatio` |
| Inefficient collision detection | O(n²) enemy-unit checks | Spatial partitioning or lane-based filtering (if not already done) |

### If Performance is Already Good (>30 FPS)
- Document baseline FPS in README
- Skip intensive optimization
- Move on to launch prep

### Testing Checklist
- [ ] 30 FPS achieved on mid-range Android Chrome (Pixel 4a or equivalent)
- [ ] No memory leaks over 10-minute play session
- [ ] Mobile touch input responsive (no input lag)
- [ ] Lighthouse Performance score ≥75 (optional; not critical for game)

---

## 8. iOS Safari AudioContext Edge Case (Days 26+, *low priority, defer if needed*)

**Issue:** iOS requires user gesture to create/resume AudioContext (mic access)  
**Current Status:** Should already be handled in `src/audio/capture.js` (see Phase 1A implementation)  
**Only investigate if:** Users report "no audio detected" on iOS Safari

### Test Scenario
1. Visit https://chordwars.com on iPhone (iOS 15+) Safari
2. Select "Guitar" mode
3. Click "Calibrate" (or start game)
4. Verify mic permission prompt appears
5. Grant permission
6. Verify calibration screen shows waveform (proof of audio capture)

### If Issues Occur
- Check that AudioContext creation is inside a click/touch handler
- Verify `audioContext.resume()` is called after user gesture
- Ensure no audio processing happens before context is initialized
- Test on multiple iOS versions (14, 15, 16) if possible

---

## Launch Readiness Checklist (Final)

**Before shipping Phase 1D:**

- [ ] **Game loop:** Stable 30+ FPS on mobile
- [ ] **First-time UX:** New player beats tutorial overlay + 1 game in <5 min
- [ ] **Feedback loops:** All audio feedback (sound, visuals) working
- [ ] **Stats display:** Victory and defeat screens show all required metrics
- [ ] **Balance:** All three difficulties feel distinct and fair
- [ ] **Mobile responsive:** Game fully playable on phones (landscape and portrait)
- [ ] **Domain:** chordwars.com live and SSL-verified
- [ ] **Share cards:** Twitter share works (at minimum copy-to-clipboard)
- [ ] **Error handling:** Graceful mic permission denial, AudioContext fallback
- [ ] **Settings persistence:** localStorage saving/loading works
- [ ] **Browser compatibility:** Chrome, Firefox, Safari (desktop + mobile)
- [ ] **Documentation:** README updated, project instructions locked for Phase 2A

---

## Phase 1D → Phase 2A Transition

**When Phase 1D is complete:**
1. Tag release: `v1.0-mvp` on GitHub
2. Update `SONNET_PROJECT_INSTRUCTIONS_1C.md` → rename to `CLAUDE.md` (repo root)
3. Update `Current Phase:` field to **Phase 2A**
4. Create new Phase 2A document: `PHASE_2A_ACTION_PLAN.md`

**Phase 2A scope preview:**
- MIDI controller support (`src/audio/midi.js`)
- Barre chord expansion (Bm, F, Cm, etc.)
- Second map: The Honky Tonk (2-lane layout)
- localStorage high-score leaderboard (local-only, no Firebase yet)
- 9 critical bug fixes from recent testing

---

## Time Estimate Summary

| Task | Effort | Days |
|------|--------|------|
| 1. End-screen stats | 1.5 days | 18–19 |
| 2. Tutorial overlay | 2 days | 19–21 |
| 3. Difficulty balance | 2 days | 21–23 |
| 4. 3-star rating | 0.5 days | 23–24 |
| 5. Share URL (optional) | 1.5 days | 24–25 |
| 6. Production domain | 0.5 days | 25 (parallel) |
| 7. Performance audit | 0.5–1 days | 25–26 |
| 8. iOS edge cases | 0.5 days | 26+ (if needed) |
| **Total** | **8–10 days** | **18–26** |

**Recommended pace:** 1–2 hours of focused work per task, with playtesting breaks between.

---

## Prompt Template for Sonnet (Phase 1D Tasks)

```
Working on: [FILENAME]
Phase: 1D
This file does: [responsibility]
Depends on: [dependency list]
Need: [specific feature/fix]

Current state from game.js:
[paste state structure showing relevant fields]

Here is the current code:
[paste existing code]

What I need:
[describe feature in detail — include edge cases, mobile responsiveness]
```

---

**Next: Start with Task 1 (end-screen stats) when ready. This builds foundation for all downstream features.**
