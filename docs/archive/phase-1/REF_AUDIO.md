> **Archive** — superseded by [[AUDIO_PIPELINE]]. **Vault links:** [[PROJECT_HISTORY]] | [[AUDIO_PIPELINE]]

# Chord Wars — Audio Engine Reference (Phase 1A)
Paste this into conversations about capture.js, analyzer.js, pitch.js, or chords.js.

## Microphone Pipeline Detail
1. `capture.js`: navigator.mediaDevices.getUserMedia({audio:true}) → AudioContext(44100Hz) → MediaStreamSource → AnalyserNode(fftSize:2048)
2. `analyzer.js`: AnalyserNode.getFloatTimeDomainData(buffer) → Float32Array[2048] (~46ms window). Also: getFloatFrequencyData for spectral view.
3. `pitch.js`: YIN algorithm on time-domain buffer → fundamental frequency (Hz) → note name via A440 reference (A4=440Hz, each semitone = freq × 2^(1/12)). Return: {frequency, note, octave, confidence} or null.
4. `chords.js`: Collect detected notes over ~200ms rolling window → match against chord templates → return {chord, confidence, notes[]}. Templates for MVP:
   - G: G2-B3-D4-G4-B4-G5 (320,247,392,392,494,784 Hz approx)
   - C: C3-E3-G3-C4-E4 (131,165,196,262,330)
   - D: D3-A3-D4-F#4 (147,220,294,370)
   - Em: E2-B2-E3-G3-B3-E4 (82,123,165,196,247,330)
   - Am: A2-E3-A3-C4-E4 (110,165,220,262,330)
   - E: E2-B2-E3-G#3-B3-E4 (82,123,165,208,247,330)

## Key Constraints
- Noise gate: measure ambient floor in calibration, set threshold 10-15dB above
- Confidence threshold: 0.6 default (below = ignore). Adjustable in settings.
- Debounce: 150ms minimum between chord change events
- iOS Safari: AudioContext must be created/resumed inside user gesture handler (click/touch)
- Partial matches OK: 4 of 6 notes matching = reduced confidence, still valid
- Guitar harmonics: template matching must account for octave equivalence
- Tuning tolerance: ±30 cents from expected frequency

## MIDI Pipeline (Phase 2, for reference)
Web MIDI API → note-on/note-off messages → 100% accurate, near-zero latency. Velocity (0-127) maps to unit strength multiplier. CC messages for expression tier.
