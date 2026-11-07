# Rules engine

Pure, deterministic TypeScript. No I/O. Everything the app shows about the rules comes from here.

| File | What it does |
|---|---|
| `map/standard.ts` | 75 provinces, 34 supply centers, split coasts, army/fleet adjacency, standard start |
| `variants.ts` | 2–7 player setups (rulebook p.20) |
| `orders/legal.ts` | Legal-order generator (drives the phone pickers) and server-side validator |
| `adjudicate/movement.ts` | Movement adjudicator (Kruijswijk decision algorithm with guess/backup) |
| `adjudicate/explain.ts` | Plain-English explanation of every order's outcome |
| `adjudicate/retreat.ts` | Retreats |
| `adjudicate/adjust.ts` | Supply-center ownership, builds, disbands, civil disorder |
| `phase.ts` | Game state and phase machine (Spring → retreats → Fall → retreats → Winter) |
| `checklist.ts` | What to change on the physical board after each phase |
| `custom.ts` | Checks for a position entered by hand ("start from a custom position") |

## Rules source and option choices

Source of truth: the *Diplomacy* 5th edition (2008) rulebook. Its rules are the same as the 2000 rulebook, so DATC's "2000 rules" options apply. Where the rulebook takes no position, DATC v3.0's preferred option is used.

| DATC issue | Choice | Source |
|---|---|---|
| 4.A.1 multi-route convoy disruption | Disrupted only when every route is disrupted | 2008 rulebook p.18 |
| 4.A.2 convoy paradoxes | A convoyed army doesn't cut support for an attack on a fleet it needs for its own convoy; Szykman rule as backup for paradoxes this doesn't resolve. Differs from DATC (pure Szykman) only in 6.F.17. | 2008 rulebook p.18 |
| 4.A.3 convoy to adjacent province | Convoy route only with "via convoy" or a same-power fleet convoying; no land fallback | 2008 rulebook p.17, DATC v3 |
| 4.A.4 support cut by a convoyed attack on itself | Not cut | DATC |
| 4.A.5 retreat when dislodged by convoy | May retreat to the attacker's origin | DATC |
| 4.A.7 dislodged unit bouncing a third unit | Only no effect when dislodged in a head-to-head | DATC |
| 4.B.4 coast in support order | Optional; must match if given (the app never sets it) | DATC |
| 4.D.4 / 4.D.6 too many builds / disbands | Handled one by one; extras fail | DATC |
| 4.D.7 waiving builds | Allowed | 2008 rulebook |
| 4.D.8 civil-disorder removals | Farthest from home supply centers first; armies may count sea steps, fleets move as fleets; ties: fleets before armies, then alphabetical (English names). `rulebook-2023` option gives DATC's answer (distance to owned centers). DATC 6.J.6, 6.J.10 and 6.J.11 differ between the two; both are tested. | 2008 rulebook p.19 |
| 4.D.9 hold support for a unit in civil disorder | Counts | DATC |
| 4.E.1 illegal orders | Treated as holds (the app only offers legal orders anyway) | DATC |

## Tests

- `__tests__/datc/` — every DATC v3.0 case in 6.A–6.J, transcribed into fixtures (`cases/`), plus snapshots of every explanation.
- `orders/legal.test.ts` — legal-order generator, including a locked golden file of all 22 starting units.
- `adjudicate/movement.property.test.ts` — random legal positions and orders (`PROPERTY_RUNS=10000` for the long run).
- `phase.test.ts`, `checklist.test.ts` — phase machine, variants, physical-board checklist, custom positions.
