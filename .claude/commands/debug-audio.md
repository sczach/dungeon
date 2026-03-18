# /debug-audio — Audio Pipeline Diagnostic

Do not make any changes until the full checklist is complete.
Do not assume a fix works — verify with bash syntax checks first.

## Step 1 — Read context

Read vault audio doc (skip if missing, continue):
  C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/AUDIO_PIPELINE.md

Read source files — use offset/limit if file exceeds token limit:
  src/audio/index.js
  src/audio/capture.js
  src/audio/analyzer.js
  src/audio/chords.js

For each file over token limit:
  Search for key terms first: _sourceNode, noiseFloor, resumeAudioContext
  Then read only the relevant sections using offset/limit

## Step 2 — Run checklist

Check each item in the actual source code. Mark ✓ PASS or ✗ FAIL.

- [ ] A. `_sourceNode` stored at module level in index.js
        (not a local variable in startCapture)
- [ ] B. Noise gate multiplier is 1.2 or lower (not 1.5)
- [ ] C. Effective floor minimum: `Math.max(noiseFloor, 0.001)`
- [ ] D. No hard return on suspended AudioContext —
        `resume()` called then pipeline continues
- [ ] E. Piano bridge present: when pitchStable →
        `detectedChord = detectedNote`, `confidence = 0.85`
- [ ] F. `resumeAudioContext()` exported exactly once from index.js
- [ ] G. `btn-calibration-done` handler calls `resumeAudioContext()`
        before `startGame()`
- [ ] H. Canvas `touchstart` listener calls `resumeAudioContext()`
        during PLAYING scene
- [ ] I. `HOLD_FRAMES = 4` (not higher — higher = slower detection)
- [ ] J. cueSystem reads `state.audio.detectedChord`
        (not `detectedNote` directly)

## Step 3 — Report before fixing

Print the full checklist with PASS/FAIL for each item.
Print the exact line numbers of any failures.
Wait — do not fix anything yet.

## Step 4 — Fix only failures

Fix each FAIL item with a surgical edit.

After each edit run:
  node --input-type=module < [edited file] 2>&1 | head -10

to confirm no syntax errors were introduced.

## Step 5 — Update vault

If any fixes were made, update:
  C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/AUDIO_PIPELINE.md
  (update "Known issues" and any changed values)

Create branch, open PR.
