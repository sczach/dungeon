Run the audio pipeline diagnostic checklist before making any changes.

Audio pipeline architecture (do not change):
```
Mic → AnalyserNode → buildChromagram() → matchChord() → gates → detectedChord
```

Diagnostic checklist:
1. **Mic capture** — Is `startCapture()` resolving? Check `src/audio/capture.js` for getUserMedia errors
2. **AnalyserNode** — Is `getByteFrequencyData()` returning non-zero values? Log the buffer in `src/audio/analyzer.js`
3. **Chromagram** — Is `buildChromagram()` in `src/audio/chords.js` producing values above the floor (−89 dB)?
4. **Chord matching** — Is `matchChord()` returning a chord with confidence ≥ 0.60?
5. **Debounce gate** — Is `SPAWN_DEBOUNCE = 0.5s` blocking rapid re-triggers?
6. **Game dispatch** — Is `detectedChord` reaching `game.js` and being passed to `updateAudio()`?

Constants to verify:
- `CONFIDENCE_THRESHOLD = 0.60`
- `MARGIN = 0.15`
- `SPAWN_DEBOUNCE = 0.5s`
- Chroma range: 80–4000 Hz

After running the checklist, report which step in the pipeline is failing and what the observed vs expected values are.
