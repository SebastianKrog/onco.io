# onco.io

**onco.io is a real-time multiplayer strategy game in which rival oncology companies compete to supply a hospital network. Treatments are the forces players produce, position, commit, and preserve.**

The map stays at the centre of play. Companies establish a production site, expand into neighbouring contracts, divide continuous income between research, manufacturing, and infrastructure, and move locally stored treatment supply to reinforce or contest regions. Regional service profiles make different treatment portfolios useful, while limited reserves reward consolidation instead of unchecked expansion.

The core loop is **expand → earn → research → produce → contest → consolidate**. Matches support 20, 30, or 40 companies on seeded hex maps, last 12 minutes, and end early if one company is left or a company holds 60% of all regions for 60 seconds. Otherwise, region count and then accumulated region-seconds determine the winner.

The complete, versioned rules, balance values, simulation order, validation requirements, and acceptance scenarios are in the **[MVP gameplay specification](GAMEPLAY_SPEC.md)**. Engine work should follow that document rather than treating this overview as normative.

> This is a fictional strategy game. Its deliberately stylized systems do not model clinical care, treatment efficacy, or real-world cancer research, and it does not provide medical advice.

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000> in multiple browser tabs. Set `PORT` to use another port and `LOBBY_SIZE` to `20`, `30`, or `40` (the default is `20`). The first connection opens the 20-second placement phase; unfilled companies become bots when it expires. A browser-held reconnect credential restores the same company, while connections arriving after play begins spectate.

## Test

```bash
npm test
npm run test:coverage
```

The project uses Node.js built-ins on the server and dependency-free HTML, CSS, and JavaScript in the browser.

## Balance, telemetry, and replay

The immutable ruleset in `server/balance.js` is identified by the balance
version included in every state message. Matches collect aggregate and event
telemetry in `snapshot().telemetry`; events identify human decisions and each
deterministic bot policy without including reconnect credentials.

Call `game.exportReplay()` to retain a match seed, version, roster, accepted
commands, result, and compact SHA-256 fixed-step boundary records. Passing that
record to `replayMatch(record)` re-simulates the match and reports the first
divergent boundary. Replay records should be retained alongside playtest data so
balance results remain reproducible after a new ruleset version is introduced.

## Deterministic balance campaign

Run the documented three-seed campaign for every 20, 30, and 40-company lobby, then verify every replay:

```sh
npm run playtest:balance
npm run playtest:verify
```

Versioned artifacts are written to `playtest-artifacts/balance-<version>/`. Each match artifact contains its balance version, lobby size, seed, final report, lobby aggregate, and replay record. Match files use compact JSON to avoid spending repository space on indentation; `aggregate.json` remains pretty-printed for review and contains the verified campaign evidence. Use `npm run playtest:balance -- --samples=N` to configure the full campaign sample count explicitly (the documented minimum is three per lobby).

A pass requires complete, replay-identical matches of one balance version, at least half of observations in each target, and an explicit victory mix: 50–100% timed wins and 0–25% dominance wins. Missing values remain in the denominator and are explicitly classified as `not-observed` rather than discarded. “Opening” is completion of automated placement at simulation time zero; `firstContest` is the first actual rival contest. Specialist production includes radiotherapy, targeted therapies, and immunotherapy, but excludes vaccines (vaccines remain advanced output and programme supply).

All numeric tuning occurs only in `server/balance.js`, with a balance version bump so evidence from different rulesets can never be combined.

## Client development

The readable browser JavaScript lives in `client/`. After changing it, rebuild the
minified modules and source maps served from `public/`:

```sh
npm run build
```

Use `npm run format:client` to format the client sources and build script before
rebuilding generated assets. Server sources are kept readable in `server/`; use
`npm run format:server` for those files, or `npm run format` to format all runtime
JavaScript. The development server serves the checked-in build, so a fresh clone
can start without compiling first.
