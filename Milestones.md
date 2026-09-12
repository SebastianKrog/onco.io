# onco.io — Milestones

Make the existing strategy easier to understand, more satisfying to play, and clearer to look at. Preserve the current gameplay rules during the first round of interface improvements.

This roadmap follows the initial bot playtest and source review. Human multiplayer balance still needs playtesting. All milestones below are proposed unless explicitly marked complete.

**Next product release:** M01–M03: map readability, order previews, and action feedback. Transport work can proceed alongside these improvements.

## Technical foundation

- [x] Memory protection merged in [PR #31](https://github.com/SebastianKrog/onco.io/pull/31): bounded WebSocket output, protection against slow clients, reduced snapshot frequency, and removal of growing telemetry history from live updates. Deployment has not been verified.
- [ ] Implement versioned delta updates as described in T01 below.

## M01 — Make the map and HUD readable

**Priority: first release**

- [x] Give the player's territory a consistent, distinctive colour, with an additional selection/ownership cue that does not depend on colour alone.
- [x] Make local supply the most prominent region number; enlarge useful labels and treatment/profile symbols.
- [ ] Reduce diagonal hatching and internal grid emphasis. Strengthen the outer borders of connected territories.
- [ ] Add map zoom and a “Centre on my company” control.
- [ ] Prioritise territory count, income, production, and current research in the HUD. Move balance targets, acceptance scenarios, and release diagnostics into an explicit developer view.

**Done when:** a new player can find their territory, read its available supply, and identify an adjacent expansion opportunity without deciphering the sidebars. Zooming and selection remain accurate.

## M02 — Preview orders where the decision happens

**Priority: first release**

- [ ] Show a compact preview beside the selected target, with a layout that stays inside the viewport.
- [ ] Include the amount sent, stock remaining at the source, estimated arrival time, treatment suitability, and the relevant defence comparison.
- [ ] Show destination storage and explicitly warn when a reinforcement would overflow it. The playtest allowed a transfer of 225 capacity into a full friendly region without warning; all of it was discarded.
- [ ] Explain invalid targets and routes before submission. Refresh or invalidate the preview if the underlying state changes.
- [ ] Present combat estimates as comparisons of currently known state, since incoming reinforcements can change the outcome.

**Done when:** players can explain the cost and expected effect of an order before committing. Full destinations and invalid orders produce clear, actionable feedback.

## M03 — Make captures, movement, and research feel rewarding

**Priority: first release**

- [ ] Add a brief territory colour sweep and “Contract secured” feedback on capture, with the resulting income change.
- [ ] Make convoys visibly move along their routes and make contested regions easy to recognise.
- [ ] Replace research IDs in player-facing announcements with the unlocked treatment or actual benefit, using the values from the game rules.
- [ ] Group repeated production warnings. Let players select a warning to focus the affected region.
- [ ] Keep effects brief and legible, with reduced-motion support.

**Done when:** players notice a completed order, capture, or research upgrade without watching a text log. Repeated warnings do not overwhelm useful feedback.

## M04 — Give new players a clear first minute

**Priority: next**

- [ ] Start the player's placement countdown after they are ready, rather than while they are still reading the name screen. Preserve a bounded lobby flow so one inactive player cannot stall everyone.
- [ ] Add a short, skippable introduction: capture a neighbour, choose an upgrade, and reinforce a border.
- [ ] Highlight the relevant region or control and advance after the player performs the action.

**Done when:** a first-time player can complete those three actions without external instructions, while returning players can get straight into play.

## M05 — Explain treatment strategies and research choices

**Priority: next**

- [ ] Give treatment cards plain-language roles: MED for flexible expansion, RAD for defensive control, and TGT for matching a researched profile.
- [ ] Show suitability, research prerequisites, required production level, and the benefit of each available upgrade.
- [ ] Make the first strategic choice visible without requiring players to read the entire research queue.
- [ ] Surface the existing rules before changing their balance.

**Done when:** players can explain why they selected a treatment and what their next research unlock enables. Displayed benefits match the authoritative rules.

## M06 — Keep essential controls available on small screens

**Priority: next; build on M01–M02**

- [ ] Replace the current narrow-screen behaviour that hides the right sidebar with tabs, a drawer, or a bottom sheet.
- [ ] Keep region intelligence, research, budget controls, and order confirmation accessible.
- [ ] Make map selection, pan, zoom, and order controls usable with touch without accidental submissions.

**Done when:** a player can inspect a region, choose research, and issue an informed order on a narrow viewport without needing desktop-only controls.

## M07 — Make it easy to play another match

**Priority: next**

- [ ] Give late arrivals a clear explanation of the current match state and a route into the next available match.
- [ ] Add a results screen with a visible “Play again” action and a fresh-lobby flow.
- [ ] Reset match state cleanly, including selections, orders, notifications, and network synchronisation.

**Done when:** late joiners can reach a playable match, and players can finish one match and start another without reloading or encountering stale state.

## M08 — Reduce repetitive supply transfers

**Priority: later; build on M02**

- [ ] Add an optional rally destination or recurring transfer rule, such as “Send surplus here; keep 30% locally.”
- [ ] Show which regions have active rules, their destination, and how to pause or cancel them.
- [ ] Respect storage, valid routes, ownership changes, and existing movement constraints. Explain when a rule cannot run.

**Done when:** players can sustain a chosen frontline with fewer repeated orders while retaining control over local reserves. Automation does not silently waste supply or continue toward an invalid destination.

## M09 — Test distinctive locations on the map

**Priority: later experiment**

- [ ] Prototype a small number of recognisable research centres or logistics hubs with clearly explained benefits.
- [ ] Give players a reason to contest particular locations beyond increasing their territory count.
- [ ] Check whether placement creates interesting choices without giving particular starts an excessive advantage.

**Done when:** playtests show that these locations create useful strategic decisions. Keep this experimental until the readability and core interaction milestones are working well.

## T01 — Send deltas with safe full-state recovery

**Priority: technical follow-up to PR #31**

- [ ] Clients request a full snapshot on join, reconnect, or synchronisation failure. Otherwise send changed fields and explicit deletions.
- [ ] Include `matchId`, `baseVersion`, and `version`. Apply a delta only to its matching baseline; reject mismatches and request a full snapshot.
- [ ] Keep immutable server baselines. Patch client state without mutating `previousState`, which alerts depend on.
- [ ] Preserve the 250 ms broadcast interval, queue limits, and slow-client protection. Skipped updates must lead to safe resynchronisation.
- [ ] Compute shared deltas once per broadcast, bound retained history, and avoid repeating unchanged map geometry and rules.
- [ ] Preserve gameplay, diagnostics, replay data, and existing renderer behaviour.

**Done when:** tests show that reconstructed state matches full snapshots, including deletions, reconnects, skipped updates, and match changes. Report bandwidth and memory measurements against the merged implementation, including a slow-client scenario.

## Delivery and playtesting

- Implement in small, reviewable changes. Edit client source and rebuild generated assets when applicable.
- Verify meaningful risks: preview accuracy, transfer overflow, state reset, and synchronisation. Keep interface checks focused on the changed flows.
- After M01–M03, run short sessions with new players. Observe time to first capture, misunderstood orders, wasted transfers, and whether players notice captures and research completion.
- After onboarding and rematches are available, observe whether players can finish the introduction and voluntarily start another match.
- Use those observations to adjust later priorities before adding more strategic complexity.
