> **Archive** — deferred to Phase 3B. **Vault links:** [[PROJECT_HISTORY]] | [[ROADMAP]]

# Chord Wars — Backend & Multiplayer Reference (Phase 2-3)
Paste this into conversations about Firebase, leaderboards, payments, or PvP.

## Firebase (Phase 2B)
- Auth: Google + email/password sign-in. firebase.js initializes SDK, exports auth/db refs.
- Firestore collections: users/{uid} (profile, settings), scores/{id} (userId, mapId, score, accuracy, wave, combo, timestamp), leaderboards/{mapId}/entries
- Leaderboard queries: orderBy("score","desc").limit(100). Per-map and global.
- Anti-tamper: Cloud Functions validate score submissions (max theoretical score = wave × max_enemies × max_points_per_kill).

## Payments (Phase 2C)
- Gumroad: single product "$7.99 Premium Upgrade". After purchase, store license key in Firestore user doc. Check on login.
- Alternative: Stripe Checkout session → webhook → update Firestore.
- Feature gating: check user.premium boolean before loading non-Campfire maps, MIDI, online leaderboards.

## PvP (Phase 3)
- Transport: Socket.io on Railway/Render (or Firebase Realtime DB for simpler but higher-latency option)
- Match flow: queue → matchmaking (Elo ±200 range, expand over time) → room creation → countdown → gameplay → result
- State sync: each client sends chord events to server. Server validates, spawns units authoritatively, broadcasts state at 20Hz.
- Map: The Void (symmetric 3-lane). Each player has base at their end.
- Elo: K=32 for new players, K=16 for established. Standard Elo formula.
- Anti-cheat: server-side validation of chord event timing, rate limiting, audio fingerprint variance check.
- Match length: 3-5 minutes. Sudden death at 5min (both bases lose HP over time).

## Monetization Tiers
Free: Campfire, 6 chords, survival, local scores, practice
Premium ($7.99): all maps, all tiers, MIDI, online leaderboards, song mode, all updates
Patreon: Supporter $3 (credits, Discord, updates) | Builder $7 (early access, voting) | Champion $15 (custom skin, design input)
