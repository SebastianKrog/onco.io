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

Open <http://localhost:3000> in multiple browser tabs. Set `PORT` to use another port.

## Test

```bash
npm test
npm run test:coverage
```

The project uses Node.js built-ins on the server and dependency-free HTML, CSS, and JavaScript in the browser.
