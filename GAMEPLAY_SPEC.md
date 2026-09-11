# onco.io MVP gameplay specification

Version 0.2 • Reviewed gameplay rules and initial balance values • 10 September 2026

**onco.io is a real-time multiplayer strategy game in which rival oncology companies compete to supply a hospital network. Treatments are the forces players produce, position, commit, and preserve.** The map should remain the centre of attention: expanding a production network, choosing useful research, and reacting to an exposed border must be more important than navigating menus.

This specification defines one complete MVP ruleset. Unless explicitly labelled as a later feature or a playtest target, the mechanics and numbers below are implementation defaults. The economy, research totals, example contests, and several exploit cases have been checked numerically. This revision addresses identified design weaknesses; competitive balance and enjoyment still require actual multiplayer playtests.

> This is a fictional strategy game. Its deliberately stylized systems do not model clinical care, treatment efficacy, or real-world cancer research, and it does not provide medical advice.

## 1. The player experience

The core loop is **expand → earn → research → produce → contest → consolidate**.

You start with a small oncology company, a functioning production site, and enough basic medicine to secure a few nearby contracts. New regions increase income and provide places to produce and store treatment capacity. You distribute income between research, manufacturing, and infrastructure. The recurring decision is: **how much supply can I commit here while still being able to respond elsewhere?**

The theme is commercial and operational competition. Regions change supplier contracts; inventories represent allocated treatment capacity. The game does not depict companies attacking patients, making cancers spread, or destroying hospitals.

### Design constraints

- A useful action should be available every 3–8 seconds during active play.
- Routine income, production, research, and construction run automatically.
- There is no individual-unit pathfinding, patient simulation, ammunition crafting, or worker management. Pooled reinforcements follow one shortest route through owned regions.
- Treatment suitability depends on the destination, not a weapon counter chart.
- Starts are economically identical; specialty affects later research only.
- Combat is deterministic, and there are no persistent between-match advantages.

## 2. Match format and victory

| Setting | MVP rule |
|---|---|
| Format | Free-for-all; no formal teams |
| Lobbies | 20, 30, or 40 companies, including bots |
| Default | 20 slots; bots fill vacancies after a 20-second lobby |
| Map size | 8 regions per company: 160, 240, or 320 |
| Match | 720 seconds; normal contests from time zero |
| Dominance | Hold `ceil(0.60 × totalRegions)` continuously for 60 seconds |
| Timed result | Most regions; then region-seconds; exact ties are shared |
| Elimination | Zero regions after a fully resolved step |
| Last standing | Immediate victory |

Contested regions count for their incumbent. A disputed ownerless region counts for nobody. Dominance resets immediately below its threshold. Resolve the final step ending at 720 seconds before applying, in order: last standing, dominance, timed score. Freeze after a result.

## 3. Map, profiles, and placement

Use contiguous odd-row hex templates of 16×10, 20×12, and 20×16. Every region is capturable, equally weighted, and has up to six neighbours. Ship seeded, validated maps with one pad per company. Pads have at least four neighbours, are at least three graph edges apart, and have every profile within two edges. Candidate pads may use axial `q = column − (row − row%2)/2`, `r = row`, the smallest qualifying `(q + 3r) mod 7` class, and seeded farthest-point selection.

Profiles are immutable, seeded in patches of roughly 2–5, and exactly evenly allocated:

| Profile | Illustrative services | Allocation |
|---|---|---:|
| Solid | Breast, thoracic, gastrointestinal oncology | 25% |
| Blood | Leukaemia, lymphoma, myeloma services | 25% |
| Rare | Sarcoma and uncommon-cancer referral | 25% |
| Mixed | Regional multidisciplinary network | 25% |

Region state includes name, neighbours, owner, profile, level and upgrade progress, per-treatment inventories, base protection, quiet time, acquisition/commissioning/dispatch times, and optional programme. Contests and convoys are public information; there is no fog of war.

Players reserve unused pads during placement. Remaining players and bots receive pads at countdown end, and production begins simultaneously. Late joiners spectate or use another lobby.

### Starting assets

Each company starts with one level-1 region, 120 MED, 35 filled base protection, zero other supply and banks, no completed research, a 20/65/15 budget, MED manufacturing, and 50% commitment. It chooses a specialty, defaulting to its start profile. Neutral regions are level 0 with 30 protection, no inventory, and no income.

## 4. Economy and budgets

For `N` regions, levels `Lr`, commissioning multiplier `mr` (0.5 for ten seconds, else 1), `d=max(0,N−8)`, and scheduling factor `a` (0.85 with R12, else 1):

```text
gross/s = 8 + Σowned [mr × (3 + 0.4 × Lr)]
operating upkeep/s = Σowned [1 + 0.1 × Lr]
administrative upkeep/s = a × 1.5 × N × d / (d + 20)
net/s = max(0, gross − operating upkeep − administrative upkeep)
```

The grant ends on elimination. Upkeep is credits, not inventory. New captures receive half revenue for ten seconds and full upkeep immediately.

Budget sliders total 100%, move in 5-point increments, and apply next step. Moving one redistributes the remainder proportionally, rounds the first remaining slider to the nearest 5 (halves upward), and gives the residual to the last in Research, Manufacturing, Infrastructure order. If both are zero, split as evenly as possible. Presets are Balanced 20/65/15, Expansion 10/80/10, and Development 40/40/20.

One credit makes one RP or IP. Banks cap at 300. Projects spend old bank plus current funding before the cap; excess redirects once to manufacturing:

```text
available = oldBank + allocatedCredits
spend = min(available, remainingCost, rateCap × dt)
newBank = min(300, available − spend)
overflow = max(0, available − spend − 300)
manufacturingFunding = requestedManufacturing + RPoverflow + IPoverflow
```

No remaining research redirects new research funding immediately. Manufacturing cannot bank; show overflow, unused funding, and actual output.

## 5. Treatments, production, storage, and suitability

| ID | Treatment | Cost | Produce at level | Edge time | Role |
|---|---|---:|---:|---:|---|
| MED | Basic medicines | 1 | 0 | 3 s | Flexible expansion |
| RAD | Radiotherapy capacity | 2 | 1 | 5 s | Resilient local control |
| TGT | Targeted therapies | 2.5 | 1 | 3 s | Researched indications |
| IMM | Immunotherapy | 3 | 2 | 4 s | Broad advanced product; best in mixed |
| VAC | Therapeutic vaccines | 4 | 2 | 5 s | Finite continuity protection |

One treatment is manufactured globally. Switching to an unlocked product has a five-second cooldown. Regional processing is `4 + 4×level` credits/s. R01 makes 1.10 units per credit without raising that limit. Eligible border regions have production weight 3, interiors 1, and a production-focus pin triples its normal weight. Weighted redistribution must cap every factory by throughput and storage.

`newUnits = acceptedCredits × productionEfficiency / baseCost`. Storage is `200 + 100×level` capacity, with usage `Σ(quantity×baseCost)`. Transfers admit proportionally when full. Winning capture supply may remain over capacity, but that region cannot manufacture or receive until space is available.

Force per unit is `baseCost × profileMultiplier × researchMultiplier`:

| Treatment | Solid | Blood | Rare | Mixed |
|---|---:|---:|---:|---:|
| MED | 1.00 | 1.00 | 1.00 | 1.00 |
| RAD | 1.35 | 0.55 | 0.85 | 1.00 |
| TGT | 1.60 in researched indications; 0.75 otherwise | same | same | same |
| IMM | 1.25 | 1.25 | 1.25 | 1.35 |
| VAC | 0.70 | 0.70 | 0.70 | 0.70 |

R02 gives MED ×1.15. R03 gives another ×1.05 in the specialty. Defending RAD gets ×1.15, replaced by ×1.30 after R07. R04 makes the specialty the first TGT indication; R05 adds one different profile. Mixed inventories add force without a combination bonus.

## 6. Research

One active project and ordered queue run automatically. Prioritizing moves a project and unfinished ancestors ahead without duplicates; paid progress remains. Priority has a five-second cooldown. A project spends at most `cost/minimumActiveTime` RP/s, and the next project cannot spend until the next step.

| ID | Project | Prerequisite | RP | Min time | Effect |
|---|---|---|---:|---:|---|
| R01 | Manufacturing scale-up | — | 140 | 40 s | Production efficiency ×1.10 |
| R02 | Optimized protocols | — | 80 | 25 s | MED force ×1.15 |
| R03 | Molecular diagnostics | — | 100 | 30 s | Specialty MED ×1.05; open branches |
| R04 | Targeted platform | R03 | 180 | 45 s | Unlock TGT and specialty indication |
| R05 | Second indication | R04 | 360 | 120 s | Add one different TGT indication |
| R06 | Radiation planning | — | 140 | 35 s | Unlock RAD |
| R07 | Image guidance | R06 | 360 | 120 s | Defensive RAD becomes ×1.30 |
| R08 | Immune engineering | R03 | 220 | 55 s | Unlock IMM |
| R09 | Therapeutic vaccine platform | R08 | 260 | 65 s | Unlock VAC and programmes |
| R10 | Immune memory programme | R09 | 360 | 120 s | New programmes 75/120 s |
| R11 | Cold-chain logistics | R01 | 140 | 35 s | New convoy edge times ×0.80 |
| R12 | Network scheduling | R11 | 220 | 55 s | Administrative upkeep ×0.85 |

Total: 2,560 RP and 745 seconds minimum serial time. Default order: `R02 → R03 → R04 → R01 → R06 → R11 → R08 → R09 → R12 → R05 → R07 → R10`. R05's choice locks on first spend; without a choice, use the most common adjacent non-owned profile, then map frequency, ties Solid/Blood/Rare/Mixed.

## 7. Infrastructure

| Level | Incremental IP | Min time | Storage | Protection max | Gross/s | Processing/s | Products |
|---|---:|---:|---:|---:|---:|---:|---|
| 0 | baseline | — | 200 | 20 | 3.0 | 4 | MED |
| 1 | 60 | 20 s | 300 | 35 | 3.4 | 8 | MED, RAD, TGT |
| 2 | 140 | 35 s | 400 | 50 | 3.8 | 12 | all five |
| 3 | 260 | 50 s | 500 | 65 | 4.2 | 16 | all five |

One upgrade spends per company. A development pin wins priority; otherwise build a site able to make the selected product; otherwise upgrade the lowest-level region, breaking ties by acquisition then ID. Progress survives pre-emption but is discarded on loss. Capture reduces completed level by one exactly once. Completion affects the next step and never fills protection for free.

## 8. Dispatches, transfers, and withdrawals

Select an owned source and destination. The persistent filter defaults to All supply; commitment defaults to 50% and ranges 10–100% in 5-point steps with 25/50/75 shortcuts. Each included quantity is `localQuantity×commitment`. Minimum packet capacity is `Σ(quantity×baseCost) ≥ 10`. Fractions are authoritative.

The source has a five-second post-capture lock and one dispatch per second. Deduct on acceptance. One company may have 16 convoys. Reserved foreign targets are `min(6,3+floor(N/16))`; existing commitments are grandfathered after shrinkage. Each company may commit at most 1,000 capacity to one target.

Hostile orders travel one edge. Friendly transfers use one BFS shortest path through owned regions, ascending region ID for ties. Edge time is the slowest included treatment, frozen at launch and ×0.80 when R11 is already complete. Transit does not defend or use storage. At each edge: a lost reached region becomes a campaign; at a friendly destination unload; continue over an owned next edge; otherwise halt at the last friendly node. Never reroute automatically.

Arrivals in one step aggregate by company before capacity or combat. Current ownership determines reinforce versus campaign. At a friendly region, the admitted fraction fills the remaining storage proportionally across included treatments and all excess is discarded; the arrival report exposes admitted and discarded capacity. Withdrawals require an adjacent owned destination and convoy slot, immediately remove the whole campaign, destroy exactly 20% of every treatment, and send the remaining 80% as one convoy.

## 9. Simultaneous deterministic contests

Simulation runs at `dt=0.25 s`. Defender force is base protection + programme protection + regional inventory force, with the RAD defensive modifier only on RAD. Attackers are separate parties; there are no alliances.

For every positive-force party in one snapshot:

```text
pressure/s_i = 0.10 × force_i + min(4, force_i)
pressure_j_to_i = pressure/s_j × force_i / Σ(force of parties other than j)
loss_i = min(force_i, dt × Σ pressure_j_to_i)
```

Apply losses simultaneously. Defender losses consume programme, base protection, then the same fraction of every inventory. A contested party below 1 force is exhausted. With fewer than two parties, resolve ownership without attrition.

- A surviving incumbent keeps ownership.
- One attacker after incumbent exhaustion captures.
- Multiple attackers make the region disputed and ownerless.
- If all exhaust together, retain the ownership/neutral status from the substep start.

On capture: clear former local state; downgrade level once; preserve all winning campaign supply even over capacity; set protection to zero; commission for ten seconds; lock dispatch for five; reset quiet time; and update ownership only after all regions resolve.

Base protection maximum is `20+15×level` for owners and 30 for ownerless regions. Positive campaigns reset quiet time. After exactly five quiet seconds, regenerate `(2+level)/s` when owned or 2/s when ownerless. Programmes never regenerate.

Reference solver results: 60 vs 30 resolves after 3.25 combat seconds with 42.20 attacker; 120 vs 100 after 8.50 with 46.96 attacker; 80 vs 120 after 6.00 with 72.70 defender; equal two- or three-party forces of 100 exhaust after 12.75 and retain prior ownership.

## 10. Continuity programmes

After R09, consume exactly ten VAC at an owned region with no pending/active programme. After eight seconds, if ownership remains, create 60 finite protection for 90 seconds. With R10 at activation completion, record 75 protection for 120 seconds. It absorbs contest loss first, never regenerates, cannot stack or refresh early, and remains unavailable until scheduled expiry even if depleted. Ownership loss cancels it without refund.

## 11. Interface and feedback

Keep the map visible. Persistently show clock, own count, leaders, net/gross/upkeep, three sliders with effective spending and overflow, manufacturing selector and actual output, commitment controls, research ETA, and selected-region infrastructure, capacity, protection, programmes, five inventories, and over-capacity state. Research uses a twelve-node drawer; production and development pins must be distinct.

Ownership colour is supplemented by initials/patterns; profiles use icons. Contests show borders and segmented bars; convoys show route and destination. Previews compare arriving force to all visible incumbent parties: advantage ≥1.25, comparable 0.80–1.25, disadvantage <0.80, or unopposed. Call these stock comparisons, not victory forecasts. Alerts cover contests, losses, unlocks, route interruption, production blockage/unused funding, and dominance without repeating each step. Use calm operational language and no weapon or patient-harm imagery.

## 12. Bots, disconnects, and surrender

Bots obey identical information, stock, cooldowns, routes, and limits. Evaluate every two seconds with seeded offsets and at most one tactical action. Prefer: continuity on threatened borders; reinforcement arriving within 12 seconds while retaining 30%; then 50%/65% attacks meeting force ratios 1.35 neutral or 1.60 rival and pressure above defender production. Rank deterministically. Bots use Balanced budgets and one of three slot-based research priorities, choose production by force/processed-credit, build a level-2 site for advanced products, and may make an exact ten-VAC programme delivery objective without becoming stuck on a broken route.

Disconnects preserve automation. After 30 seconds a bot takes over until reconnection. Surrender permanently hands the intact company to a bot; it never deletes assets or changes scoring. On elimination, remove convoys and foreign campaigns only after every region resolves. A simultaneous last-region loss and capture preserves the company.

## 13. Authoritative simulation contract

The server owns all state. Clients submit idempotent intentions and render confirmed snapshots. Commands received during an interval wait for its next boundary. Every fixed 250 ms step:

1. Accept ordered validated commands at `t`; reject duplicate IDs and deduct accepted commitments.
2. Deliver due convoys, aggregate terminal arrivals, expire programmes, then complete activations.
3. Snapshot state, integrate region-seconds, and compute income with exact commissioning portions.
4. Fund and advance the projects active at interval start, route overflow, manufacture within snapshotted limits, and stage completions.
5. Update quiet/regeneration, snapshot forces, and apply simultaneous attrition.
6. At `t+dt`, apply staged completions, captures, and disputes.
7. Timestamp transitions, clear invalid pins, recompute priorities, then eliminate.
8. Credit/reset dominance based on boundary counts and evaluate victory, including the final interval.
9. Publish state and continue only if unresolved.

Minimum objects are Match, Company, Region, Campaign, Convoy, Programme, and Command with IDs, timing, ownership/control, inventories, queues/progress, routes, cooldowns, and acceptance sequence sufficient to reproduce every derived value.

Every command validates life/control, ownership, connectivity, unlocks, cooldowns, finite legal quantities, packet/campaign/convoy limits, and a unique client command ID. Rejection returns a specific reason and makes no partial change. Clients cannot invent fractional quantities, manipulate other queues, donate to neutrals, or duplicate actions.

## 14. MVP acceptance scenarios

1. One commissioned level-1 start earns 10.30 net credits/s; fixed Balanced R02 completes at 39.00 s.
2. A level-1 factory processes ≤8 credits/s, or 8.8 capacity/s after R01, through every redistribution pass.
3. RP/IP spend, bank increases, processed manufacturing, and unused funding conserve net credits; overflow counts once.
4. Research totals 2,560 RP/745 minimum seconds, is acyclic, and cannot all finish in 720 seconds.
5. 50% of 120 MED sends/leaves 60; 4 TGT or 2.5 VAC meets the same ten-capacity minimum.
6. All supply sends the percentage of each inventory, uses its slowest transit time, and never changes manufacturing.
7. A three-edge MED transfer takes 9 s, or 7.5 s with R11 under boundary rounding, using one command.
8. Broken routes halt at the last friendly node; losing an old source does not cancel an in-transit convoy.
9. Emitted pressure is conserved; 0.1 force emits 0.11/s.
10. Contest examples reproduce the listed durations/survivors; equal parties retain prior ownership on mutual exhaustion.
11. Multiple surviving attackers immediately dispute an exhausted incumbent and suppress its income/production.
12. Capturing level 2 yields level 1; 450 winning capacity remains over the normal 300 cap.
13. Capture earns no preceding income, gets ten seconds half revenue, and starts dominance at zero.
14. Arrival suppresses regeneration immediately; positive regeneration begins only beyond five quiet seconds.
15. A programme costs ten VAC, activates in eight seconds, provides 60/75 finite protection for 90/120 seconds, and never regenerates.
16. Same-company arrivals are order-independent after aggregation.
17. Withdrawal retains exactly 80% of every treatment in one convoy without duplication.
18. Existing commitments survive slot shrinkage; unexpected hostile transfer arrivals are not deleted.
19. Bot 65% packets can retain 30%; unreachable programme routes do not trap production objectives.
20. Surrender changes only control; ordinary reconnect may restore human control.
21. Simultaneous last-region loss and capture preserves the company.
22. Duplicate, unauthorized, or invalid commands return a reason and change no state.

## 15. Balance targets

Target neutral capture within 10 seconds, first optional research in 30–60 seconds, first player contest in 0:45–2:00, ordinary contests in 5–20 seconds, useful advanced products before the final third, 6–9 projects for typical contenders, meaningful specialist production, finite programme counterplay, occasional dominance wins, and one-order network reinforcement.

Record elimination, region-seconds, research, treatment output, factory use, redirected/unused funding, dispatches, routes, force ratios, contest durations, programmes, and victory type, separating human and bot policies. Tune in order: opening/neutral/movement; pressure/cleanup; income/upkeep; research costs/rates; treatment multipliers/gates; programme value. Keep every number in one versioned balance configuration and expose its version in match metadata.

## 16. MVP scope boundary

The MVP includes placement, bots, five local inventories, production limits, routed transfers, budget banks/overflow, twelve projects, three upgrades, focus pins, simultaneous contests, withdrawal, finite programmes, elimination, reconnect/surrender, and both victories.

Later features: changing resistance/profiles; added biomarkers/treatments; alliances/trading/patents/pricing; roads, persistent routes, and convoy combat; headquarters/encirclement; multiple production lines and granular buildings; ranked persistence and monetization.

## 17. Sources for terminology

Sources inform broad treatment terminology only—not gameplay costs, timings, multipliers, or effectiveness:

1. National Cancer Institute, [Types of Cancer Treatment](https://www.cancer.gov/about-cancer/treatment/types).
2. National Cancer Institute, [External Beam Radiation Therapy for Cancer](https://www.cancer.gov/about-cancer/treatment/types/radiation-therapy/external-beam).
3. National Cancer Institute, [Immunotherapy to Treat Cancer](https://www.cancer.gov/about-cancer/treatment/types/immunotherapy).
4. National Cancer Institute, [Cancer Treatment Vaccines](https://www.cancer.gov/about-cancer/treatment/types/immunotherapy/cancer-treatment-vaccines).

All economic and contest equations, research structure, UI rules, and match numbers in this document are proposed original game design.
