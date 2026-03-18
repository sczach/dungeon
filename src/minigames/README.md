# Minigames

Each minigame lives in its own file and extends `BaseMinigame` from
`src/systems/minigameEngine.js`. The engine handles lifecycle; each
handler owns its own update/render loop.

## Planned Types

| ID                  | Name                | Region       | Concept                                    |
|---------------------|---------------------|--------------|--------------------------------------------|
| `metronome-mastery` | Metronome Mastery   | Rhythm       | Play notes in time with a metronome pulse  |
| `scale-runner`      | Scale Runner        | Tone         | Play ascending/descending scales quickly   |
| `interval-quiz`     | Interval Quiz       | Theory       | Identify intervals by ear                  |
| `chord-builder`     | Chord Builder       | Theory       | Build chords from root + intervals         |
| `call-response`     | Call & Response     | Musicianship | Echo back a musical phrase                 |
| `rhythm-repeat`     | Rhythm Repeat       | Rhythm       | Reproduce a rhythmic pattern               |
| `sight-read`        | Sight Reading       | Musicianship | Play notation in real time                 |
| `free-play`         | Free Play           | Any          | Open sandbox with scoring feedback         |

## Creating a New Minigame

```js
// src/minigames/metronome-mastery.js
import { BaseMinigame } from '../systems/minigameEngine.js';

export class MetronomeMastery extends BaseMinigame {
  start() {
    // Set up your game loop, draw calls, input handlers
    // Call this.done({ stars, score, accuracyPct, passed }) when finished
  }

  destroy() {
    super.destroy();
    // Remove any custom event listeners, clear timeouts, etc.
  }
}
```

Then register it in game.js (or a central registry file):

```js
import { minigameEngine } from './systems/minigameEngine.js';
import { MetronomeMastery } from './minigames/metronome-mastery.js';

minigameEngine.register('metronome-mastery', MetronomeMastery);
```
