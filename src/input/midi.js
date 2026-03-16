/**
 * @file src/input/midi.js
 * Web MIDI input — maps any MIDI note-on to the game's C3-octave note names
 * and dispatches through the shared KeyboardInput pipeline.
 *
 * Design notes
 * ────────────
 *   • navigator.requestMIDIAccess() must be called on/after a user gesture
 *     on some browsers (Chrome on Android, Firefox).  Call midi.start() from
 *     the same button-click handler that starts audio capture.
 *
 *   • All MIDI notes are folded into the C3 octave that the game uses
 *     (e.g. MIDI D4 = 62 → 'D3').  This means any MIDI keyboard octave works.
 *
 *   • Velocity < 10 is treated as note-off / ghost touch and ignored.
 *
 *   • Only note-on (status 0x9n with velocity > 0) messages are acted on.
 *     Note-off and control-change messages are ignored.
 */

/** MIDI chromatic note names — index matches (midiNote % 12). */
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Map any MIDI note number to the game's C3-octave note name.
 * @param {number} midiNote  0–127
 * @returns {string}  e.g. 'C3', 'F#3', 'B3'
 */
function midiNoteToGameNote(midiNote) {
  return CHROMATIC[midiNote % 12] + '3';
}

export class MidiInput {
  constructor() {
    /** @type {MIDIAccess|null} */
    this._access   = null;
    /** Callback to invoke with a resolved game note string. */
    this._onNote   = null;
    this._started  = false;
  }

  /**
   * Request MIDI access and wire all MIDI inputs.
   * Safe to call multiple times — subsequent calls are no-ops if already started.
   *
   * @param {function(string):void} onNote  Called with game note name on each note-on.
   */
  async start(onNote) {
    if (this._started) return;
    if (!navigator.requestMIDIAccess) {
      console.warn('[midi] Web MIDI API not available in this browser');
      return;
    }
    this._onNote  = onNote;
    this._started = true;

    try {
      this._access = await navigator.requestMIDIAccess({ sysex: false });
      console.info(`[midi] Access granted — ${this._access.inputs.size} input(s) found`);

      this._wireMidi();

      // Re-wire when devices are plugged/unplugged while the page is open
      this._access.onstatechange = () => {
        console.log('[midi] Device state changed — re-wiring inputs');
        this._wireMidi();
      };
    } catch (err) {
      console.warn('[midi] requestMIDIAccess failed:', err);
      this._started = false;
    }
  }

  /** Attach onmidimessage to every available input port. */
  _wireMidi() {
    if (!this._access) return;
    let count = 0;
    for (const input of this._access.inputs.values()) {
      input.onmidimessage = (e) => this._onMidiMessage(e);
      count++;
      console.log(`[midi] Wired input: "${input.name}"`);
    }
    if (count === 0) console.log('[midi] No MIDI inputs connected yet');
  }

  /**
   * Handle a raw MIDI message.
   * @param {MIDIMessageEvent} event
   */
  _onMidiMessage(event) {
    const [status, note, velocity] = event.data;
    const isNoteOn = (status & 0xF0) === 0x90 && velocity > 10;
    if (!isNoteOn) return;

    const gameName = midiNoteToGameNote(note);
    console.log(`[midi] note-on MIDI=${note} velocity=${velocity} → game="${gameName}"`);
    if (this._onNote) this._onNote(gameName);
  }

  /** Stop listening (detaches all MIDI message handlers). */
  stop() {
    if (this._access) {
      for (const input of this._access.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this._started = false;
    this._onNote  = null;
  }
}

/** Singleton — import and call start(onNote) after a user gesture. */
export const midiInput = new MidiInput();
