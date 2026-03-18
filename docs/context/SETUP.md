# ChordWars Setup & Development

## Quick Start

```bash
# Clone
git clone https://github.com/sczach/chordwars.git
cd chordwars

# Serve (any static file server works)
npx serve .
# or
python -m http.server 8000
# or just open index.html in a browser (mic won't work without HTTPS/localhost)
```

No build step. No npm install. No dependencies.

## Requirements

- **Browser:** Chrome or Safari (must test both — Web Audio API differs)
- **HTTPS or localhost:** Required for `getUserMedia` (mic access)
- **Mic access:** Optional but core to gameplay — keyboard/touch works without it

## Project Structure

```
chordwars/
├── index.html          ← single-page app shell
├── style.css           ← all styles
├── src/                ← all JavaScript (ES modules)
├── docs/               ← documentation
│   ├── context/        ← AI context files (this directory)
│   └── skills/         ← engine skill definitions
├── .claude/            ← Claude Code config
│   └── commands/       ← /gametest, /audiotest, /balancecheck
├── CLAUDE.md           ← project instructions for Claude
└── README.md
```

## No Build Step

- All JS is native ES modules (`import`/`export`)
- No bundler (Webpack, Vite, Rollup — none)
- No transpilation (no Babel, no TypeScript)
- No package.json, no node_modules
- Entry point: `<script type="module" src="src/game.js">` in index.html

## Deployment

- **Platform:** Vercel (static deploy)
- **URL:** https://chordwars.vercel.app
- **Process:** Push to GitHub → Vercel auto-deploys
- No build command needed — Vercel serves static files

## Local Development

1. Start any static file server at the project root
2. Open `http://localhost:<port>` in Chrome
3. Allow mic access when prompted (or use keyboard: H J K L ; ' Enter)
4. Press backtick (`` ` ``) to toggle debug overlay (audio pipeline stats)

## Browser Testing Checklist

### Chrome
- Primary development browser
- AudioContext usually auto-resumes
- Standard Web Audio API behavior

### Safari
- `webkitAudioContext` fallback needed (handled in capture.js)
- AudioContext often suspends — needs user gesture to resume
- `getByteTimeDomainData` fallback for Safari <14 (handled in analyzer.js)
- ES module circular imports cause hard failures (avoided via constants.js extraction)

## localStorage Keys

| Key | Content | Reset to clear |
|-----|---------|---------------|
| `chordwars-progress` | Stars, purchased skills, tutorial state | `localStorage.removeItem('chordwars-progress')` |
| `chordwars_settings` | Full settings JSON | `localStorage.removeItem('chordwars_settings')` |
| `cw_difficulty` | Legacy difficulty | `localStorage.removeItem('cw_difficulty')` |
| `cw_showNoteLabels` | Legacy note labels | `localStorage.removeItem('cw_showNoteLabels')` |

**Full reset:** `localStorage.clear()` then reload.

## Git Workflow

- **Never push to master directly** — all changes go through PRs
- Branch naming: `claude/<slug>` for AI, `feat/<name>` / `fix/<name>` for humans
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `perf:`, `refactor:`
- Remote: `https://github.com/sczach/chordwars`

## Claude Code Commands

| Command | Purpose |
|---------|---------|
| `/gametest` | Full gameplay test pass (title → tutorial → world map → level) |
| `/audiotest` | Audio pipeline test (piano tones, kill melody, victory melody, mic) |
| `/balancecheck` | Game balance evaluation (damage, economy, pacing, scoring) |

## Debug Overlay

Press backtick (`` ` ``) during PLAYING to toggle debug overlay showing:
- Current scene
- AudioContext state
- Audio ready flag
- RMS level
- Noise floor
- Pitch stable flag
- Detected note
- Detected chord + confidence

## See Also

- [[ARCHITECTURE]] — System overview
- `CLAUDE.md` — Full project instructions for AI sessions
