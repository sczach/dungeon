# ChordWars State Reference

> All mutable state lives in the object returned by `createInitialState()` in `game.js`.
> Subsystems receive this object by reference. `game.js` is the single owner.

## Scene State Machine

**Enum:** `SCENE` in `src/constants.js`

| Scene | Rendering | Input | HTML Overlay |
|-------|-----------|-------|-------------|
| TITLE | Canvas stars + glow | HTML buttons | `#screen-title` |
| INSTRUMENT_SELECT | Canvas bg | HTML cards | `#screen-instrument-select` |
| WORLD_MAP | Canvas map (WorldMapRenderer) | Canvas mouse/touch/wheel | `#screen-world-map` |
| LEVEL_START | Canvas stars | HTML overlay | `#screen-level-start` |
| CALIBRATION | Canvas waveform | HTML buttons | `#screen-calibration` |
| PLAYING | Full game render | Keyboard + touch + mic | `#screen-hud` |
| VICTORY | Color tint | HTML overlay | `#screen-victory` |
| DEFEAT | Color tint | HTML overlay | `#screen-defeat` |
| ENDGAME | Golden glow | HTML overlay | — |

**Transitions:** `setScene(scene)` in game.js updates `state.scene` and `document.body.dataset.scene`.

## State Object Shape

### Core
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `scene` | string (SCENE) | TITLE | game.js |
| `time` | number | 0 | game.js |
| `frameCount` | number | 0 | game.js |
| `paused` | boolean | false | game.js |

### Audio
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `audio.ready` | boolean | false | audio/index.js |
| `audio.waveformData` | Float32Array | null | audio/index.js |
| `audio.noiseFloor` | number | 0 | audio/index.js |
| `audio.detectedNote` | string\|null | null | audio/index.js, keyboard.js |
| `audio.detectedChord` | string\|null | null | audio/index.js, keyboard.js |
| `audio.confidence` | number | 0 | audio/index.js, keyboard.js |
| `audio.rms` | number | 0 | audio/index.js |
| `audio.ctxState` | string | '' | audio/index.js |
| `audio.pitchStable` | boolean | false | audio/index.js |

### Input
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `inputMode` | 'summon'\|'attack'\|'charge' | 'summon' | keyboard.js |
| `allowedModes` | string[]\|null | null | game.js (from level config) |
| `input.pressedKeys` | Set | new Set() | keyboard.js |
| `noteDisplay` | {note, time}\|null | null | keyboard.js |

### Tablature (Summon)
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `tablature.queue` | string[] | [] | TablatureSystem |
| `tablature.activeIndex` | number | 0 | TablatureSystem |
| `tablature.pendingSpawn` | number | 0 | TablatureSystem |
| `tablature.unitType` | string\|null | null | TablatureSystem |
| `tablature.combo` | number | 0 | TablatureSystem |
| `tablature.totalHits` | number | 0 | TablatureSystem |
| `tablature.totalMisses` | number | 0 | TablatureSystem |
| `tablature.summonCooldownEnd` | number | 0 | TablatureSystem |
| `tablature.blocked` | boolean | false | TablatureSystem |

### Combat & Units
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `units` | Unit[] | [] | game.js |
| `enemies` | Enemy[] | [] | WaveManager |
| `playerBase` | Base | — | game.js |
| `enemyBases` | Base[] | [] | game.js |
| `wave` | number | 1 | WaveManager |
| `resources` | number | 200 | game.js, TablatureSystem, CueSystem |
| `score` | number | 0 | game.js |
| `combo` | number | 0 | TablatureSystem, keyboard.js |

### Charge Attack
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `chargeNote` | string\|null | null | keyboard.js |
| `chargeStartTime` | number | 0 | keyboard.js |
| `chargeProgress` | number | 0 | game.js (update), keyboard.js |
| `chargeUnlocksBase` | boolean | false | game.js (from level config) |

### Visual Effects
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `lightningBolts` | object[] | [] | AttackSequenceSystem |
| `projectiles` | object[] | [] | Unit |
| `damageNumbers` | object[] | [] | AttackSequenceSystem |
| `shakeTime` | number | 0 | AttackSequenceSystem |
| `shakeIntensity` | number | 0 | AttackSequenceSystem |

### World Map
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `worldMap.selectedNodeId` | string\|null | null | game.js |
| `worldMap.lastPlayedNodeId` | string\|null | null | game.js |
| `worldMap.cameraX` | number | — | game.js |
| `worldMap.cameraY` | number | — | game.js |
| `worldMap.zoom` | number | 0.5 | game.js |
| `worldMap.isDragging` | boolean | false | game.js |
| `worldMap.showTutorialComplete` | boolean | false | game.js |

### Progression
| Field | Type | Default | Written By |
|-------|------|---------|-----------|
| `currentLevel` | LevelConfig\|null | null | game.js |
| `pendingLevel` | WorldMapNode\|null | null | game.js |
| `currentLesson` | object\|null | null | lessons.js |
| `difficulty` | 'easy'\|'medium'\|'hard' | 'medium' | settings.js |

### Skill Buffs (reset by `applySkills`)
| Field | Default | Effect |
|-------|---------|--------|
| `skillSummonCooldownBonus` | 0 | ms reduction to summon cooldown |
| `skillBaseHpBonus` | 0 | added to player base maxHp |
| `skillMaxUnitsBonus` | 0 | added to max player units (default 8) |
| `skillUnitHpMult` | 1.0 | multiplier on player unit HP |
| `skillUnitDamageMult` | 1.0 | multiplier on player unit damage |
| `skillSpawnIntervalBonus` | 0 | seconds added to enemy spawn interval |
| `skillTimingWindowMult` | 1.0 | multiplier on timing windows |
| `skillChordMemory` | false | chord memory skill active |
| `skillRhythmReading` | false | rhythm reading skill active |
| `skillSightReading` | false | sight reading skill active |
| `skillTempoMaster` | false | tempo master skill active |
| `skillUnlockMage` | false | mage archetype unlocked |
| `skillComboDoubleMilestone` | false | doubles combo milestone rewards |

### Settings
| Field | Default | Stored In |
|-------|---------|-----------|
| `audioThreshold` | 50 | `chordwars_settings` |
| `masterVolume` | 80 | `chordwars_settings` |
| `showChordCues` | true | `chordwars_settings` |
| `showNoteLabels` | true | `chordwars_settings` / `cw_showNoteLabels` |
| `cueDisplayStyle` | 'note' | `chordwars_settings` |
| `instrument` | 'piano' | `chordwars_settings` |
| `hardcoreMode` | false | `chordwars_settings` |

## localStorage Keys

| Key | Format | Used By |
|-----|--------|---------|
| `chordwars-progress` | JSON: `{bestStars, purchased, tutorialComplete}` | progression.js |
| `chordwars_settings` | JSON: 8 settings fields | settings.js |
| `cw_difficulty` | string | screens.js (legacy) |
| `cw_showNoteLabels` | string | screens.js (legacy) |

## See Also

- [[ARCHITECTURE]] — System overview
- [[GAME_SYSTEMS]] — How systems read/write state
- [[INPUT_SYSTEM]] — How input flows into state
