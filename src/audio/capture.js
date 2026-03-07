/**
 * @file src/audio/capture.js
 * getUserMedia microphone access, AudioContext creation, and iOS gesture unlock.
 *
 * ── iOS GOTCHAS ───────────────────────────────────────────────────────────────
 *  1. AudioContext MUST be created (and ideally resumed) inside a user-gesture
 *     handler (click / touchend).  Creating it outside a gesture leaves the
 *     context permanently 'suspended' on Safari ≤ 16.
 *  2. The context starts in 'suspended' even when created inside a gesture;
 *     call ctx.resume() immediately and also register unlockAudioContext() for
 *     any subsequent suspension (e.g. after the screen locks and unlocks).
 *  3. getUserMedia on iOS Safari requires a secure context (HTTPS / localhost).
 *     On WKWebView the 'allow microphone' permission must also be set in
 *     the Info.plist / entitlements.
 *  4. Safari < 14.1 uses the webkit-prefixed constructor: webkitAudioContext.
 *     Always check both.
 *  5. On iOS, echoCancellation / noiseSuppression / autoGainControl constraints
 *     are ignored silently — the raw signal is returned anyway, but verify
 *     you're still getting a reasonable sample rate.
 *
 * ── ANDROID CHROME GOTCHAS ───────────────────────────────────────────────────
 *  1. Requires HTTPS or localhost; navigator.mediaDevices is undefined on
 *     plain HTTP origins.
 *  2. Some Android devices clamp the actual sample rate to 48000 Hz regardless
 *     of the { sampleRate: 44100 } ideal constraint.  Read audioCtx.sampleRate
 *     rather than assuming 44100.
 *  3. Chrome on Android may apply aggressive echo cancellation/noise suppression
 *     even when asked not to, depending on hardware.  If pitch detection seems
 *     off, test with headphones to isolate the effect.
 */

/** @type {AudioContext|null} */
let _audioCtx = null;

/** @type {MediaStream|null} */
let _stream = null;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request microphone access and open an AudioContext.
 * MUST be called from within a user-gesture event handler (click / touchend).
 *
 * @returns {Promise<{ audioCtx: AudioContext, stream: MediaStream }>}
 * @throws  {Error} on permission denial or unsupported browser
 */
export async function initCapture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'getUserMedia unavailable — page must be served over HTTPS or localhost.'
    );
  }

  // Prefer 44.1 kHz mono; browser may ignore or partially honour these.
  const constraints = {
    audio: {
      sampleRate:        { ideal: 44100 },
      channelCount:      { ideal: 1 },
      echoCancellation:  false,   // keep raw signal for pitch detection
      noiseSuppression:  false,
      autoGainControl:   false,
    },
    video: false,
  };

  // Create AudioContext first (inside the gesture stack) before the async
  // getUserMedia call so iOS Safari recognises the gesture.
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API not supported.');

  _audioCtx = new AudioCtx({ sampleRate: 44100 });

  // Attempt immediate resume — succeeds on Chrome/Firefox, may no-op on Safari.
  if (_audioCtx.state === 'suspended') {
    await _audioCtx.resume().catch(() => {
      // iOS may reject here; unlockAudioContext() handles the retry.
    });
  }

  // Now request the mic (async — gesture context stays valid across awaits).
  _stream = await navigator.mediaDevices.getUserMedia(constraints);

  return { audioCtx: _audioCtx, stream: _stream };
}

/**
 * Install a one-shot gesture listener that resumes a suspended AudioContext.
 *
 * Call this immediately after initCapture().  It is a no-op when the context
 * is already 'running'.  On iOS the context may be suspended again after a
 * phone call or screen lock; re-call this after each such event if needed.
 *
 * @param {AudioContext} audioCtx
 */
export function unlockAudioContext(audioCtx) {
  if (audioCtx.state === 'running') return;

  const unlock = async () => {
    try {
      await audioCtx.resume();
    } catch (_) { /* swallow */ }

    if (audioCtx.state === 'running') {
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('click',    unlock, true);
    }
  };

  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click',    unlock, true);
}

/**
 * Stop all microphone tracks and close the AudioContext.
 * Safe to call when capture was never started.
 */
export function stopCapture() {
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;

  _audioCtx?.close().catch(() => {});
  _audioCtx = null;
}

/**
 * @returns {AudioContext|null} — the current context, or null before initCapture().
 */
export function getAudioContext() {
  return _audioCtx;
}
