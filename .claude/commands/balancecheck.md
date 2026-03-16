# /balancecheck — Game Balance Evaluation

Verify that damage math, resource economy, wave pacing, and star scoring create a fair,
learnable difficulty curve. Run this whenever you change: `BASE_DIRECT_DAMAGE`, accuracy
floor, wave schedules, unit costs, or star thresholds.

---

## Setup

1. Open `index.html` in Chrome with DevTools console open.
2. Clear localStorage: `localStorage.clear(); location.reload()`
3. Complete the tutorial to reach the world map, then select a regular level.

---

## Test 1: Damage floor (zero-skill player)

**Scenario**: Play notes randomly — zero aim, just spam keys — while the enemy base
is the only target (no enemies in lane).

1. Complete tutorial-1 (you'll need to hit the base a few times; that's fine).
2. In a regular level, spam random keys while watching enemy base HP.

- [ ] Enemy base HP decreases by a visible amount per note (minimum ~3 HP per hit visible)
- [ ] After 10 spam notes, base has taken ≥ 10% damage (visible progress)
- [ ] Console `attackMisses` counter does NOT increase when no enemies present
- [ ] Base is defeatable within 5 minutes even at 0% accuracy (floor prevents infinite stall)

**Expected math**: `BASE_DIRECT_DAMAGE(10) × accuracy_floor(0.30) = 3 HP/hit`.
100 HP base ÷ 3 = ~33 hits to kill. At 2 hits/sec that's ~17 seconds minimum.

---

## Test 2: Damage ceiling (skilled player)

**Scenario**: Hit every note precisely — only play notes when enemies are present and
match their sequences.

1. Play a regular level with careful, deliberate note matching (or simulate with rapid
   correct-key presses against visible enemies).
- [ ] First 5 hits deal approximately 10 HP each (full BASE_DIRECT_DAMAGE, no miss decay)
- [ ] Accuracy stays high (≥ 70%) after 20 hits
- [ ] Level completable in ≤ 3 minutes with this playstyle

---

## Test 3: Accuracy decay rate

1. Deliberately miss 5 notes in a row (press wrong keys while enemies are present).
2. Then hit 5 correct notes.

- [ ] After 5 misses: damage per hit is noticeably reduced (visually smaller HP drops)
- [ ] Damage does NOT drop below 30% of base (~3 HP/hit minimum — verify in console)
- [ ] Console shows: `attackMisses` increments on each miss
- [ ] After missing 7+ times, accuracy stabilizes at floor (does not go negative)

**Expected**: miss × 10% penalty → floor at 30%. 7 misses → 1 - 0.70 = 0.30 exactly.

---

## Test 4: Resource economy (SUMMON mode)

1. Switch to SUMMON mode in a regular level.
2. Play the 3-note summon sequence (visible in tablature bar).

- [ ] Resources start at 50+ (enough for at least 1 archer summon at 25 cost)
- [ ] Successfully summoning an Archer costs 25 resources (visible in HUD counter)
- [ ] Successfully summoning a Knight costs 50 resources
- [ ] Attempting to summon with insufficient resources shows "Not enough resources!" flash
- [ ] Resources regenerate over time (passively) — within 30s player can afford another unit

---

## Test 5: Wave pacing

1. Play a multi-wave level (any non-tutorial level with 3+ waves).
- [ ] Wave 1 spawns within 3 seconds of level start
- [ ] Wave 2 does NOT spawn while wave 1 enemies are still alive and marching
- [ ] At difficulty=easy: gap between waves feels relaxed (≥ 8s after last enemy dies)
- [ ] At difficulty=hard: gap is tight (3–5s) but not zero (player has time to breathe)

---

## Test 6: Star scoring

1. Win a level with ≥ 90% note accuracy → should award 3★
2. Win a level with ≈ 70% note accuracy → should award 2★
3. Win a level with < 50% note accuracy → should award 1★

- [ ] 3★ threshold feels earned — requires deliberate, accurate play
- [ ] 1★ is always achievable regardless of accuracy (any win = 1★)
- [ ] Stars persist in localStorage after reload (open DevTools → Application → localStorage)

---

## Pass criteria
All checkboxes checked. Damage numbers, resource costs, and star thresholds match
expected values in the comments above.

## Fail criteria
Any test fails, or gameplay feels "impossible" (player can make no visible progress) or
"trivial" (player wins without engaging with musical mechanics). File a balance bug with:
- Test number and step
- Observed value vs expected value
- Difficulty setting tested
- Whether the issue is worse/better at hard vs easy
