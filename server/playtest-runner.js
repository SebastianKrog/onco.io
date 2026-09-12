#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { BALANCE } from "./balance.js";
import { Game, PHASES, replayMatch } from "./game.js";
import { aggregatePlaytests, CAMPAIGN_CRITERIA } from "./playtest.js";

export const DEFAULT_SEEDS = Object.freeze([
  "clinical-alpha",
  "clinical-beta",
  "clinical-gamma",
]);
export const DEFAULT_ARTIFACT_DIR = resolve(
  "playtest-artifacts",
  `balance-${BALANCE.version}`,
);
// Match artifacts intentionally use compact JSON: replay digests and aggregate
// evidence are machine-consumed, and indentation adds roughly 50% to each file.
const artifactJson = (artifact) => `${JSON.stringify(artifact)}\n`;
const hashSeed = (seed) => {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const seededRandom = (seed) => {
  let x = hashSeed(seed) || 1;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function runMatch({
  lobbySize,
  seed,
  matchSeconds = BALANCE.match.seconds,
} = {}) {
  let id = 0;
  const game = new Game({
    lobbySize,
    seed,
    matchSeconds,
    random: seededRandom(`${seed}:${lobbySize}`),
    id: () => `company-${lobbySize}-${++id}`,
    now: () => 0,
  });
  game.populateAutomatedLobby();
  while (game.phase !== PHASES.FINISHED) game.tick(BALANCE.match.step);
  return {
    artifactVersion: CAMPAIGN_CRITERIA.artifactVersion,
    balanceVersion: BALANCE.version,
    lobbySize,
    seed: String(seed),
    finalPlaytestReport: game.snapshot().playtest,
    replay: game.exportReplay(),
  };
}

export function verifyArtifacts(
  artifacts,
  { minimumSamples = CAMPAIGN_CRITERIA.minimumSamplesPerLobby } = {},
) {
  if (!Array.isArray(artifacts) || !artifacts.length)
    throw new Error("No campaign artifacts");
  const versions = new Set(artifacts.map((a) => a?.balanceVersion));
  if (versions.size !== 1 || !versions.has(BALANCE.version))
    throw new Error("Mixed or unsupported balance versions");
  const byLobby = {},
    replayBoundaries = {};
  for (const artifact of artifacts) {
    if (
      artifact?.artifactVersion !== CAMPAIGN_CRITERIA.artifactVersion ||
      !BALANCE.match.lobbySizes.includes(artifact.lobbySize) ||
      !artifact.finalPlaytestReport ||
      !artifact.replay
    )
      throw new Error("Malformed campaign evidence");
    if (!artifact.finalPlaytestReport.complete || !artifact.replay.result)
      throw new Error("Incomplete match");
    const replay = replayMatch(artifact.replay);
    if (
      !replay.ok ||
      JSON.stringify(replay.actualResult) !==
        JSON.stringify(replay.expectedResult)
    )
      throw new Error(
        `Replay divergence: ${artifact.lobbySize}/${artifact.seed} at ${replay.differences[0]?.at ?? "result"}s`,
      );
    replayBoundaries[artifact.lobbySize] =
      (replayBoundaries[artifact.lobbySize] ?? 0) + replay.verifiedBoundaries;
    (byLobby[artifact.lobbySize] ??= []).push(artifact.finalPlaytestReport);
  }
  const lobbyResults = Object.fromEntries(
    BALANCE.match.lobbySizes.map((size) => [
      size,
      aggregatePlaytests(byLobby[size] ?? [], { minimumSamples }),
    ]),
  );
  return {
    artifactVersion: CAMPAIGN_CRITERIA.artifactVersion,
    balanceVersion: BALANCE.version,
    minimumSamples,
    lobbyResults,
    replayBoundaries: Object.fromEntries(
      BALANCE.match.lobbySizes.map((size) => [
        size,
        {
          total: replayBoundaries[size] ?? 0,
          verified: replayBoundaries[size] ?? 0,
          divergences: 0,
        },
      ]),
    ),
    verified: true,
    pass: Object.values(lobbyResults).every((x) => x.pass),
  };
}
export async function runCampaign({
  seeds = DEFAULT_SEEDS,
  outputDir = DEFAULT_ARTIFACT_DIR,
  minimumSamples = CAMPAIGN_CRITERIA.minimumSamplesPerLobby,
} = {}) {
  const artifacts = [];
  for (const lobbySize of BALANCE.match.lobbySizes)
    for (const seed of seeds) artifacts.push(runMatch({ lobbySize, seed }));
  const aggregate = verifyArtifacts(artifacts, { minimumSamples });
  await mkdir(outputDir, { recursive: true });
  for (const artifact of artifacts) {
    artifact.aggregateResult = aggregate.lobbyResults[artifact.lobbySize];
    await writeFile(
      resolve(outputDir, `${artifact.lobbySize}-${artifact.seed}.json`),
      artifactJson(artifact),
    );
  }
  await writeFile(
    resolve(outputDir, "aggregate.json"),
    JSON.stringify(aggregate, null, 2) + "\n",
  );
  return aggregate;
}
export async function loadArtifacts(directory = DEFAULT_ARTIFACT_DIR) {
  const files = (await readdir(directory))
    .filter((x) => x.endsWith(".json") && x !== "aggregate.json")
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}
const child = (args) => {
  const result = spawnSync(
    process.execPath,
    [new URL(import.meta.url).pathname, ...args],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Playtest child failed");
};
const childAsync = (args) =>
  new Promise((resolveChild, reject) => {
    const processChild = spawn(
      process.execPath,
      [new URL(import.meta.url).pathname, ...args],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let error = "";
    processChild.stderr.on("data", (chunk) => (error += chunk));
    processChild.on("error", reject);
    processChild.on("close", (code) =>
      code === 0
        ? resolveChild()
        : reject(new Error(error || "Playtest child failed")),
    );
  });
const runVerificationWorkers = async (files) => {
  // Keep a warm V8 instance for several replays instead of paying startup/JIT costs
  // once per artifact. Round-robin assignment also prevents a slow replay from
  // holding up an otherwise idle worker at a batch barrier.
  const workerCount = Math.min(files.length, availableParallelism());
  const queues = Array.from({ length: workerCount }, () => []);
  files.forEach((file, index) => queues[index % workerCount].push(file));
  await Promise.all(
    queues.map((queue) => childAsync([`--check-batch=${queue.join(",")}`])),
  );
};
async function main() {
  const single = process.argv.find((x) => x.startsWith("--single=")),
    check = process.argv.find((x) => x.startsWith("--check=")),
    checkBatch = process.argv.find((x) => x.startsWith("--check-batch="));
  if (single) {
    const [lobbySize, seed, file] = single.slice(9).split(",");
    await mkdir(resolve(file, ".."), { recursive: true });
    await writeFile(
      file,
      artifactJson(runMatch({ lobbySize: Number(lobbySize), seed })),
    );
    return;
  }
  if (check) {
    verifyArtifacts([JSON.parse(await readFile(check.slice(8), "utf8"))], {
      minimumSamples: 1,
    });
    return;
  }
  if (checkBatch) {
    for (const file of checkBatch.slice(14).split(","))
      verifyArtifacts([JSON.parse(await readFile(file, "utf8"))], {
        minimumSamples: 1,
      });
    return;
  }
  const verify = process.argv.includes("--verify"),
    arg = process.argv.find((x) => x.startsWith("--samples=")),
    minimumSamples = arg
      ? Number(arg.split("=")[1])
      : CAMPAIGN_CRITERIA.minimumSamplesPerLobby;
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1)
    throw new Error("--samples must be a positive integer");
  const seeds = Array.from(
    { length: minimumSamples },
    (_, i) => DEFAULT_SEEDS[i] ?? `clinical-${i + 1}`,
  );
  await mkdir(DEFAULT_ARTIFACT_DIR, { recursive: true });
  if (!verify)
    for (const size of BALANCE.match.lobbySizes)
      for (const seed of seeds)
        child([
          `--single=${size},${seed},${resolve(DEFAULT_ARTIFACT_DIR, `${size}-${seed}.json`)}`,
        ]);
  const artifacts = await loadArtifacts();
  await runVerificationWorkers(
    artifacts.map((artifact) =>
      resolve(
        DEFAULT_ARTIFACT_DIR,
        `${artifact.lobbySize}-${artifact.seed}.json`,
      ),
    ),
  );
  const grouped = Object.fromEntries(
    BALANCE.match.lobbySizes.map((size) => [
      size,
      artifacts
        .filter((a) => a.lobbySize === size)
        .map((a) => a.finalPlaytestReport),
    ]),
  );
  const lobbyResults = Object.fromEntries(
    BALANCE.match.lobbySizes.map((size) => [
      size,
      aggregatePlaytests(grouped[size], { minimumSamples }),
    ]),
  );
  const result = {
    artifactVersion: CAMPAIGN_CRITERIA.artifactVersion,
    balanceVersion: BALANCE.version,
    minimumSamples,
    lobbyResults,
    verified: true,
    pass: Object.values(lobbyResults).every((x) => x.pass),
  };
  if (!verify) {
    for (const artifact of artifacts) {
      artifact.aggregateResult = lobbyResults[artifact.lobbySize];
      await writeFile(
        resolve(
          DEFAULT_ARTIFACT_DIR,
          `${artifact.lobbySize}-${artifact.seed}.json`,
        ),
        artifactJson(artifact),
      );
    }
    await writeFile(
      resolve(DEFAULT_ARTIFACT_DIR, "aggregate.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
