/**
 * Chord Wars — Audio Capture (Phase 1A)
 *
 * Responsibilities:
 *  • Request microphone access via navigator.mediaDevices.getUserMedia
 *  • Create an AudioContext at 44 100 Hz
 *  • Return a MediaStreamSourceNode ready to be wired into the analysis chain
 *
 * Design notes:
 *  - echoCancellation / noiseSuppression / autoGainControl are all disabled so
 *    raw guitar signal reaches the pitch detector unmodified.
 *  - The AudioContext is NOT connected to the destination; we never want to
 *    hear the mic fed back through speakers.
 *  - Callers must invoke initAudio() from inside a user-gesture handler (click,
 *    keydown …) to satisfy browser autoplay policies.
 */

'use strict';

// ── getUserMedia constraints ───────────────────────────────────────────────────

const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation:  false,
    noiseSuppression:  false,
    autoGainControl:   false,
    channelCount:      1,        // mono — pitch detection needs only one channel
    sampleRate:        44100,    // request 44.1 kHz; browser may ignore this
  },
  video: false,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the audio capture pipeline.
 *
 * @returns {Promise<{ audioContext: AudioContext,
 *                     stream: MediaStream,
 *                     source: MediaStreamAudioSourceNode }>}
 * @throws  {Error} if the browser lacks getUserMedia / Web Audio support,
 *                  or the user denies microphone permission.
 */
export async function initAudio() {
  _assertSupport();

  const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);

  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  const audioContext     = new AudioContextCtor({ sampleRate: 44100 });

  // Some browsers (notably Chrome) start contexts in 'suspended' state until
  // a user gesture has been processed by the event loop.
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(stream);

  return { audioContext, stream, source };
}

/**
 * Tear down a previously initialised audio pipeline.
 * Safe to call even if the pipeline was never fully initialised.
 *
 * @param {{ audioContext?: AudioContext, stream?: MediaStream }} pipeline
 */
export function stopAudio({ audioContext, stream } = {}) {
  stream?.getTracks().forEach(track => track.stop());
  audioContext?.close();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _assertSupport() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Chord Wars requires microphone access (getUserMedia) ' +
      'which is not available in this browser or context. ' +
      'Make sure you are on HTTPS or localhost.'
    );
  }

  if (!(window.AudioContext ?? window.webkitAudioContext)) {
    throw new Error(
      'Chord Wars requires the Web Audio API which is not supported ' +
      'in this browser.'
    );
  }
}
