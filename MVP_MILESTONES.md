# MVP implementation milestones

This plan tracks the work required to bring the current implementation into
conformance with `GAMEPLAY_SPEC.md` version 0.2. Tasks are grouped by the system
they change so that each item has one clear owner and completion condition.
Unless stated otherwise, a task includes focused automated tests for its own
acceptance criteria.

## Milestone 1 — Match lifecycle and authoritative input

- [x] **Introduce explicit lobby and match phases.** Model waiting, placement,
  active, and finished phases; start the 720-second match clock only when the
  active phase begins; reject gameplay commands that are invalid for the current
  phase; and freeze state after a result.
- [x] **Support the three lobby sizes.** Allow 20, 30, or 40 company slots,
  default to 20, associate each size with its specified map template, and enforce
  the selected capacity for human and bot participants.
- [x] **Run the placement countdown.** Reserve pads selected by players, fill all
  vacant slots with bots after 20 seconds, assign unplaced companies to remaining
  pads deterministically, and begin every company's automation simultaneously.
- [x] **Handle late connections.** Prevent placement into an active match and
  either attach the connection as a spectator or direct it to a waiting lobby.
- [x] **Queue commands at fixed-step boundaries.** Store valid command envelopes
  with a unique client ID, receive time, and acceptance sequence; process them in
  order at stage one of the next 250 ms step; and deduct commitments only then.
- [x] **Make command outcomes reproducible.** Retain enough accepted/rejected
  command metadata to replay a match, return a specific rejection reason without
  partial mutation, and define whether rejected IDs remain consumed.
- [x] **Add persistent reconnect identity.** Issue a reconnect credential,
  associate a new socket with its existing company, restore human control before
  or after the 30-second bot takeover, and permanently reject reconnection to a
  surrendered company.

### Milestone acceptance

- [x] Integration tests cover lobby sizes, countdown bot filling, simultaneous
  start, spectators, phase validation, ordered same-step commands, duplicate
  commands, disconnect takeover, reconnect, surrender, and post-result freeze.

## Milestone 2 — Seeded maps and placement pads

- [x] **Create the official templates.** Ship contiguous odd-row hex templates of
  16×10, 20×12, and 20×16 regions with stable IDs and up to six neighbors.
- [x] **Generate seeded profile patches.** Allocate Solid, Blood, Rare, and Mixed
  exactly evenly while arranging deterministic patches of roughly two to five
  regions and preserving the seed in match metadata.
- [x] **Generate and validate candidate pads.** Apply the axial-coordinate class
  rule and seeded farthest-point selection, then verify that every pad has at
  least four neighbors, is at least three graph edges from every other pad, and
  has every profile within two edges.
- [x] **Restrict placement to pads.** Expose available/reserved pads in snapshots,
  reject arbitrary or already-reserved starts, and default specialty to the
  selected pad's profile when no specialty is submitted.
- [x] **Render actual hexes.** Replace rectangular hit areas and tiles with the
  odd-row hex geometry used by the server while keeping selection and scaling
  accurate on all three map sizes.

### Milestone acceptance

- [x] Seed-repeatability and invariant tests validate region counts, equal profile
  allocation, connectivity, neighbor symmetry, patch sizing targets, pad spacing,
  pad degree, nearby-profile access, and client hit testing.

## Milestone 3 — Economy, production, research, and infrastructure fidelity

- [ ] **Implement normative budget redistribution.** Make sliders use five-point
  steps; redistribute the remainder proportionally; round the first remaining
  slider to the nearest five with halves upward; assign the residual in Research,
  Manufacturing, Infrastructure order; and handle two zero sliders evenly.
- [ ] **Add budget presets.** Provide Balanced 20/65/15, Expansion 10/80/10, and
  Development 40/40/20 controls that become effective on the next simulation
  step.
- [ ] **Enforce the manufacturing switch delay.** Keep the old product active or
  pause output, as defined by the specification, until the five-second switch
  completes; prevent another switch during the cooldown; and expose the remaining
  time.
- [ ] **Correct production accounting.** Report actual units per second after
  dividing processed credits by product cost, separately report processed
  manufacturing credits, and distinguish direct manufacturing funding from RP/IP
  overflow and unused funding.
- [ ] **Verify weighted factory redistribution.** Ensure each redistribution pass
  respects regional processing and storage caps, border weight is three, a
  production pin triples its normal weight, and over-capacity regions neither
  manufacture nor receive.
- [ ] **Lock the R05 indication on first spend.** Accept an explicit different
  profile choice, lock it when R05 first receives RP, and otherwise use adjacent
  non-owned frequency, then whole-map frequency, then the specified profile order
  for ties.
- [ ] **Complete research scheduling feedback.** Identify the active project,
  queued projects and ancestors, paid progress, spending rate, ETA, priority
  cooldown, completed effects, and the locked R05 choice.
- [ ] **Complete infrastructure scheduling feedback.** Show the active region,
  saved progress, current and next level, spending rate, ETA, and why a region was
  selected; verify completion affects only the next step.

### Milestone acceptance

- [ ] Automated conservation tests reconcile net credits with RP/IP spending,
  bank changes, processed manufacturing, overflow, and unused funding, including
  bank caps, no-project cases, factory saturation, product switches, pins, R05
  locking, pre-emption, capture, and staged completion.

## Milestone 4 — Dispatch, convoy, and contest correctness

- [ ] **Persist dispatch preferences.** Add authoritative All/single-treatment
  filters and 10–100% commitment in five-point steps, including 25/50/75
  shortcuts, without changing the selected manufacturing product.
- [ ] **Expose order validation and capacity.** Show packet capacity, source
  cooldown, convoy slots, reserved foreign-target slots, and per-target committed
  capacity before submission; display the server's exact rejection reason.
- [ ] **Visualize and resolve convoy routes.** Draw the chosen BFS route and
  destination, preserve launch-time edge speed, aggregate terminal arrivals by
  company, halt broken friendly routes at the last reached node, and alert once
  when a route is interrupted.
- [ ] **Define full-storage arrival disposition.** Confirm in the normative spec
  whether the non-admitted fraction is discarded, remains in transit, or is
  returned, then implement and visibly report that outcome without hidden supply
  loss.
- [ ] **Expose withdrawals.** Permit withdrawal only to an adjacent owned region
  with a convoy slot, remove the entire campaign immediately, destroy exactly 20%
  of every included treatment, and send the remaining 80% as one convoy.
- [ ] **Preserve surviving parties in disputed regions.** When the incumbent is
  exhausted and multiple attackers remain, make the region ownerless while
  retaining those campaigns for subsequent simultaneous resolution; do not erase
  their surviving supply.
- [ ] **Complete simultaneous-contest edge cases.** Preserve prior ownership or
  neutrality when every party exhausts together, apply capture downgrades exactly
  once, retain over-capacity winning supply, and delay all ownership updates until
  every region in the step has resolved.
- [ ] **Add stock-comparison previews.** Compare arriving force with every visible
  incumbent party and label it advantage, comparable, disadvantage, or unopposed
  using the specified thresholds and non-predictive wording.

### Milestone acceptance

- [ ] Tests cover all published solver examples, pressure conservation, equal
  two- and three-party exhaustion, persistent multi-attacker disputes, mixed
  inventories, same-step arrival aggregation, three-edge R11 timing, route breaks,
  source loss, slot grandfathering, unexpected hostile arrivals, withdrawals,
  capture commissioning, and dominance reset timing.

## Milestone 5 — Continuity programmes and bot policy

- [ ] **Expose continuity programmes.** Add activation controls and show the ten
  VAC cost, eight-second pending state, 60/75 protection, 90/120-second expiry,
  depletion, unavailability until scheduled expiry, and cancellation on loss.
- [ ] **Implement bot threat continuity.** As the highest-priority tactical
  action, activate or supply a continuity programme on a threatened border while
  obeying identical stock, route, cooldown, and information rules.
- [ ] **Implement bot reinforcement.** Evaluate reinforcements that arrive within
  12 seconds and retain at least 30% at the source, then rank candidates
  deterministically.
- [ ] **Implement bot attacks.** Evaluate 50% and 65% packets while retaining the
  required reserve, enforce 1.35 neutral and 1.60 rival force ratios, require
  pressure above defender production, and take at most one tactical action per
  seeded two-second evaluation.
- [ ] **Implement bot strategic management.** Keep Balanced budgets, assign one of
  three slot-based research priorities, choose production by force per processed
  credit, and build a level-2 factory before selecting advanced products.
- [ ] **Implement the exact programme objective.** Allow a bot to manufacture and
  route exactly ten VAC to its selected programme site, and abandon or re-plan the
  objective if its route breaks so production cannot become stuck.

### Milestone acceptance

- [ ] Deterministic scenario tests separately verify tactical priority, arrival
  limits, retained reserves for both packet sizes, attack thresholds, one-action
  limits, research slots, advanced-product preparation, exact VAC delivery, and
  broken-route recovery.

## Milestone 6 — Complete player interface and operational feedback

- [ ] **Complete persistent company metrics.** Always show clock, own region
  count, leaders, gross/net/upkeep, effective spending, overflow, unused funding,
  actual product output, commitment, filter, research ETA, and dominance progress.
- [ ] **Complete selected-region intelligence.** Show owner, profile icon, level,
  upgrade progress, acquisition/commissioning/dispatch times, storage usage and
  over-capacity state, protection components, programme state, five inventories,
  production eligibility, and both focus pins.
- [ ] **Add all gameplay controls.** Provide specialty selection during placement,
  production and development pins, programme activation, withdrawal, research
  prioritization/choice, surrender, and spectator/reconnect states.
- [ ] **Improve map state communication.** Supplement ownership colors with
  initials and patterns, use profile icons, draw convoy routes/destinations, and
  show contest borders with segmented bars for every party.
- [ ] **Implement deduplicated alerts.** Cover new contests, losses, unlocks,
  command rejection, route interruption, production blockage, unused funding,
  over-capacity state, programme transitions, and dominance without repeating an
  unchanged alert each step.
- [ ] **Audit language and accessibility.** Use calm operational language and
  stock-comparison terminology, avoid weapon or patient-harm imagery, support
  keyboard interaction and non-color cues, and keep the map central at supported
  viewport sizes.

### Milestone acceptance

- [ ] Browser-level tests exercise a complete human flow from lobby placement
  through budgets, research, production, pins, dispatch, reinforcement, contest,
  withdrawal, programme activation, surrender, reconnect, spectating, and match
  result, including keyboard-only and non-color identification checks.

## Milestone 7 — Balance configuration, telemetry, and release gate

- [ ] **Centralize versioned balance data.** Move match settings, economy values,
  treatments, research, infrastructure, movement, contest, programme, and bot
  thresholds into one immutable versioned configuration exposed in match metadata.
- [ ] **Record match telemetry.** Capture elimination, region-seconds, research,
  treatment output, factory use, redirected and unused funding, dispatches, routes,
  launch force ratios, contest durations, programmes, and victory type, separating
  human decisions from each bot policy.
- [ ] **Build a deterministic replay check.** Re-run a match from its seed,
  configuration version, companies, and accepted command sequence and assert the
  same boundary snapshots and result.
- [ ] **Automate every MVP acceptance scenario.** Add explicit tests for all 22
  scenarios in section 14 of the gameplay specification rather than relying on
  broad unit coverage or direct state mutation.
- [ ] **Run multiplayer playtests against balance targets.** Measure opening,
  neutral capture, first research and contest timing, ordinary contest duration,
  advanced-product availability, completed research, specialist production,
  programme counterplay, and victory distribution; tune only through the
  versioned balance configuration.
- [ ] **Complete the MVP release gate.** Require all unit, integration, browser,
  replay, acceptance, accessibility, and load checks to pass for every lobby size;
  document any deliberately accepted deviation in `GAMEPLAY_SPEC.md` before
  declaring the MVP complete.
