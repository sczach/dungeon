# ChordWars Roadmap

> Phase-by-phase development plan. Load this when making architectural decisions or planning new work.

## Current Status: Phase 2A Complete → Phase 2B Next

---

## Phase Overview

| Phase | Focus | Status | Key Deliverables |
|-------|-------|--------|-----------------|
| 0 | Scaffold + deploy | ✅ Complete | index.html, game.js rAF loop, renderer.js, Vercel deploy |
| 1A | Audio engine | ✅ Complete | capture, analyzer, pitch (YIN), chord detection (chromagram) |
| 1B | Game core | ✅ Complete | entities, paths, waves, combat, HUD |
| 1C | Integration | ✅ Complete | tablature summon, attack sequences, input modes, prompts |
| 1D | Polish | ✅ Complete | tutorial levels T1-T4, world map, victory/defeat screens, 3★ scoring |
| **2A** | Bug crush | ✅ **Complete** | All 9 Phase 2A bugs fixed (see [[GAME_SYSTEMS]] bug table) |
| **2B** | Sound Engine | ⏭ **Next** | Beat/bass/harmony layers, event SFX, musical feel |
| 2C | Content expansion | ⬜ Planned | 5+ new levels, skill tree polish, world map regions |
| 2D | Guitar & Voice | ⬜ Planned | Guitar mic mode, voice input, instrument parity |
| 3A | Multiplayer spike | ⬜ Future | Architecture decision: WebSockets or peer-to-peer |
| 3B | Multiplayer | ⬜ Future | 1v1, 2v2, ELO leaderboard, Firebase auth |
| 4A | Ship beta | ⬜ Future | Marketing, Product Hunt, monetization, domain |

---

## Phase 2B — Sound Engine (Next)

**Goal:** The game should feel like you're playing music, not pressing buttons.

**What to build:** `src/audio/soundEngine.js` (already exists — improve/extend it)

Layers:
1. **Beat** — kick/snare at 90+5/wave BPM via scheduled AudioContext
2. **Bass** — root note of detected chord, beats 1 & 3
3. **Harmony** — sustained pad following player's chord context (very low gain)
4. **Percussion** — kill/spawn/wave-transition hits tied to game events
5. **FX** — mode switch, resource gain, damage rumble

**Prompt to use:** `BRIEFING_PROMPTS_V2.md` → Phase 2B section
**Skill file:** `docs/skills/SOUND_ENGINE.md`
**Agent tuning:** `AGENT_TUNING_WORKFLOW.md` → Sound Engine section

**Convergence criteria:** Player reports the game "feels musical" during playtesting. Notes feel like they belong to a song, not isolated beeps.

---

## Phase 2C — Content Expansion

**Goal:** Enough content to justify returning players.

- 5+ new world map levels (currently: campfire, crossing, siege + 4 tutorial)
- Skill tree polish (currently: 9 skills, 3 paths)
- World map region unlocking (Tone, Rhythm, Theory, Musicianship)
- Lesson system expansion

**Skill file:** `docs/skills/GAMEPLAY_ENGINE.md`

---

## Phase 2D — Guitar & Voice

**Goal:** Instrument parity — guitar and voice work as well as piano.

**Guitar:** Chord detection already built (chromagram in `audio/chords.js`). Needs: calibration polish, MIDI support (already in `input/midi.js`), guitar-specific HUD.

**Voice:** Pitch detection built (YIN in `audio/pitch.js`). Needs: note-to-game mapping, voice-specific UI, tolerance tuning.

**Key constraint:** Must use same `_handleNote()` pipeline — instruments don't change game logic, only input.

---

## Phase 3A — Multiplayer Spike

**Goal:** Architecture decision before building.

Questions to answer:
- WebSockets (server) vs WebRTC peer-to-peer?
- Firebase Realtime DB or custom server?
- Authoritative server or client-side rollback?

**Defer until:** 2D ships. See `Phase 1/REF_BACKEND.md` for Firebase notes.

---

## Minigame Framework (Planned, Phase 2D+)

Mario Party-style short musical games. All planned concepts are in `PHASE_2A_STRATEGY.md` (bottom section) and `PHASE_2A_STRATEGY.md` draft.

Planned minigames:
1. Arpeggio Accelerator (speed training)
2. Chord Memory (Simon Says)
3. Scale Shredder (note pattern, Guitar Hero style)
4. Metronome Mastery (rhythm precision)
5. Harmony Explorer (chord voicing ear training)
6. Band Battle Royale (vs AI)
7. Improvisation Canvas (freeform backing track)
8. Pitch Perfect (voice input preview)

**Not started.** Will need `src/minigames/` directory when built.

---

## What Ships Never Change

Core design principles that survive every phase:

> Instrument is the only controller. Every game action is a musical action.

> Failure never stops the music. The game continues if you play poorly.

> Every level teaches one musical concept.

> Better music = better gameplay. Always mechanically optimal to play well.

> Levels end on a musical arc, not just HP=0.

---

## File Creation Order (Phase 2B)

```
1. Read docs/skills/SOUND_ENGINE.md (constraints)
2. Run /audiotest to establish baseline
3. Improve src/audio/soundEngine.js
4. Run /audiotest again — verify convergence criteria
5. Update docs/skills/SOUND_ENGINE.md with new constraints
6. Commit: fix/sound-engine-v2
```

## See Also

- [[PROJECT_HISTORY]] — What was built in each phase and when
- [[WORKFLOW]] — How to run Claude Code sessions
- [[ARCHITECTURE]] — Current system design
- `AGENT_TUNING_WORKFLOW.md` — Engine development loop
- `BRIEFING_PROMPTS_V2.md` — Ready-to-use session prompts
