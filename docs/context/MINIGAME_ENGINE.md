# Minigame Engine

> **Moved.** The full skill definition is at [[docs/skills/MINIGAME_ENGINE]].
>
> Load `docs/skills/MINIGAME_ENGINE.md` for any minigame development session.

## Worktree Path Reminder

All paths must use the **worktree root** (current working directory).
Do NOT use the main repo path (`C:/Users/wbryk/OneDrive/Desktop/Chordwars/src/...`) — it will 404.
Use: `C:/Users/wbryk/OneDrive/Desktop/Chordwars/.claude/worktrees/<name>/src/...`

## Key Files

| File | Purpose |
|------|---------|
| `src/systems/minigameEngine.js` | Registry, lifecycle host, `BaseMinigame` base class |
| `src/minigames/` | Self-contained handler classes (each runs its own rAF) |
| `src/data/worldMap.js` | Node definitions — add `gameType` field to wire nodes |
| `src/game.js` | Registration point — `minigameEngine.register(id, Class)` |

## See Also

- [[GAME_SYSTEMS]] — Tower-defense systems (separate from minigames)
- [[DATA_MODELS]] — WorldMapNode shape, `gameType` field
- `docs/skills/MINIGAME_ENGINE.md` — Full skill definition, BaseMinigame contract, build guide
