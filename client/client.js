import { hexGeometry, pointInHex, traceHex } from "./hex.js";
import { BUDGET_PRESETS } from "./budget.js";
import { AlertEventKeys, operationalAlerts } from "./alert-events.js";
import { applyDelta } from "./state-sync.js";
const canvas = document.querySelector("#map"),
  ctx = canvas.getContext("2d");
const reconnectCredential = localStorage.getItem("onco-reconnect");
const socket = new WebSocket(
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${reconnectCredential ? `?credential=${encodeURIComponent(reconnectCredential)}` : ""}`,
);
const commandSession = crypto.randomUUID(),
  alertEventKeys = new AlertEventKeys();
let state = null,
  previousState = null,
  myId = null,
  selectedRegion = null,
  hoveredRegion = null,
  keyboardRegion = 0,
  commandSequence = 0,
  spectator = false,
  lastOutcomeSequence = 0,
  seenEventIds = new Set();
let stateMatchId = null,
  stateVersion = 0;
const mapViewport = { zoom: 1, offsetX: 0, offsetY: 0 };
const MIN_ZOOM = 1,
  MAX_ZOOM = 2.5,
  ZOOM_STEP = 0.25;
const send = (message) =>
  socket.readyState === WebSocket.OPEN &&
  socket.send(
    JSON.stringify({
      ...message,
      commandId: `web-${commandSession}-${++commandSequence}`,
    }),
  );
socket.addEventListener(
  "open",
  () => (document.querySelector("#connection").textContent = "● Live"),
);
socket.addEventListener(
  "close",
  () => (document.querySelector("#connection").textContent = "○ Disconnected"),
);
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === "welcome") {
    myId = message.id;
    spectator = message.spectator;
    if (message.credential)
      localStorage.setItem("onco-reconnect", message.credential);
    if (message.reconnected || message.spectator)
      document.querySelector("#join").classList.add("hidden");
  }
  if (message.type === "rejected")
    showNotice(
      `Command rejected: ${message.reason}`,
      `rejection:${message.commandId ?? message.reason}`,
    );
  if (message.type === "state" || message.type === "delta") {
    let nextState;
    if (message.type === "state") {
      nextState = message.state;
    } else if (
      !state ||
      message.matchId !== stateMatchId ||
      message.baseVersion !== stateVersion
    ) {
      send({ type: "sync" });
      return;
    } else {
      nextState = applyDelta(state, message);
    }
    previousState = state;
    state = nextState;
    stateMatchId = message.matchId;
    stateVersion = message.version;
    const outcome = state.commandOutcomes
      ?.filter(
        (item) =>
          item.companyId === myId && item.sequence > lastOutcomeSequence,
      )
      .at(-1);
    if (outcome) {
      lastOutcomeSequence = outcome.sequence;
      if (outcome.status === "rejected")
        showNotice(
          `Command rejected: ${outcome.reason}`,
          `rejection:${outcome.commandId ?? outcome.sequence}`,
        );
    }
    for (const event of [
      ...(state.routeInterruptions || []),
      ...(state.arrivalReports || []),
    ])
      if (event.companyId === myId && !seenEventIds.has(event.id)) {
        seenEventIds.add(event.id);
        if (event.discardedCapacity > 0)
          showNotice(
            `Arrival admitted ${event.admittedCapacity.toFixed(1)} capacity; ${event.discardedCapacity.toFixed(1)} excess discarded.`,
            `arrival:${event.id}`,
          );
        else if (event.convoyId)
          showNotice(
            `Route interrupted at Region ${event.regionId + 1}; supply stopped there.`,
            `route:${event.id}`,
          );
      }
    collectAlerts();
    render();
  }
});
function showNotice(text, key = text) {
  if (seenEventIds.has(`alert:${key}`)) return;
  seenEventIds.add(`alert:${key}`);
  const notice = document.querySelector("#notice");
  notice.textContent = text;
  notice.classList.add("visible");
  const item = document.createElement("div");
  item.textContent = text;
  document.querySelector("#alerts").prepend(item);
  while (document.querySelector("#alerts").children.length > 4)
    document.querySelector("#alerts").lastElementChild.remove();
  setTimeout(() => notice.classList.remove("visible"), 4000);
}
function collectAlerts() {
  if (!previousState) return;
  for (const alert of operationalAlerts(
    previousState,
    state,
    myId,
    alertEventKeys,
  ))
    showNotice(alert.text, alert.key);
  const me = state.players.find((p) => p.id === myId),
    before = previousState.players.find((p) => p.id === myId);
  if (!me || !before) return;
  for (const id of me.completed)
    if (!before.completed.includes(id))
      showNotice(
        `${id} research complete; capability unlocked.`,
        `unlock:${id}`,
      );
}
document.querySelector("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  send({
    type: "join",
    name: document.querySelector("#name").value,
    specialty: document.querySelector("#specialty").value || undefined,
  });
  document.querySelector("#join").classList.add("hidden");
});
document.querySelector("#surrender").addEventListener("click", () => {
  if (confirm("Hand this company permanently to automation?"))
    send({ type: "surrender" });
});
const allocationNames = ["research", "manufacturing", "infrastructure"];
const allocations = document.querySelector("#allocations");
for (const name of allocationNames) {
  const wrap = document.createElement("div");
  wrap.className = "allocation";
  wrap.innerHTML = `<label>${name}<output>0%</output></label><input type="range" min="0" max="100" step="5" data-allocation="${name}">`;
  allocations.append(wrap);
  wrap.querySelector("input").addEventListener("change", (event) =>
    send({
      type: "budget",
      category: name,
      value: Number(event.target.value),
    }),
  );
}
const presets = document.querySelector("#budget-presets");
for (const [name, allocation] of Object.entries(BUDGET_PRESETS)) {
  const button = document.createElement("button");
  button.textContent = `${name[0].toUpperCase() + name.slice(1)} ${allocation.research}/${allocation.manufacturing}/${allocation.infrastructure}`;
  button.onclick = () => send({ type: "budgetPreset", preset: name });
  presets.append(button);
}
const commitment = document.querySelector("#commitment"),
  dispatchFilter = document.querySelector("#dispatch-filter");
commitment.addEventListener(
  "input",
  () =>
    (document.querySelector("#commit-output").textContent =
      `${commitment.value}%`),
);
commitment.addEventListener("change", () =>
  send({
    type: "dispatchPreferences",
    commitment: Number(commitment.value),
    filter: dispatchFilter.value,
  }),
);
dispatchFilter.addEventListener("change", () =>
  send({
    type: "dispatchPreferences",
    commitment: Number(commitment.value),
    filter: dispatchFilter.value,
  }),
);
document.querySelectorAll("[data-commit]").forEach((button) =>
  button.addEventListener("click", () => {
    commitment.value = button.dataset.commit;
    commitment.dispatchEvent(new Event("input"));
    commitment.dispatchEvent(new Event("change"));
  }),
);
canvas.addEventListener("mousemove", (event) => {
  if (!state) return;
  const rect = canvas.getBoundingClientRect(),
    x = ((event.clientX - rect.left) * canvas.width) / rect.width,
    y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  hoveredRegion = state.regions.find((item) => inside(item, x, y))?.id ?? null;
  renderDispatchStatus(state.players.find((player) => player.id === myId));
});
function setMapZoom(value) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  if (next === mapViewport.zoom) return;
  const worldCentreX =
      (canvas.width / 2 - mapViewport.offsetX) / mapViewport.zoom,
    worldCentreY = (canvas.height / 2 - mapViewport.offsetY) / mapViewport.zoom;
  mapViewport.zoom = next;
  mapViewport.offsetX = canvas.width / 2 - worldCentreX * next;
  mapViewport.offsetY = canvas.height / 2 - worldCentreY * next;
  if (next === MIN_ZOOM) {
    mapViewport.offsetX = 0;
    mapViewport.offsetY = 0;
  }
  render();
}
function centreOnCompany() {
  if (!state) return;
  const me = state.players.find((player) => player.id === myId),
    region = state.regions[me?.mapFocusRegionId];
  if (!region) return;
  const focus = hexGeometry(region, state.map, canvas.width, canvas.height);
  mapViewport.offsetX = canvas.width / 2 - focus.cx * mapViewport.zoom;
  mapViewport.offsetY = canvas.height / 2 - focus.cy * mapViewport.zoom;
  render();
  canvas.focus();
}
document
  .querySelector("#zoom-in")
  .addEventListener("click", () => setMapZoom(mapViewport.zoom + ZOOM_STEP));
document
  .querySelector("#zoom-out")
  .addEventListener("click", () => setMapZoom(mapViewport.zoom - ZOOM_STEP));
document
  .querySelector("#centre-company")
  .addEventListener("click", centreOnCompany);
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    setMapZoom(mapViewport.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  },
  { passive: false },
);
canvas.addEventListener("click", (event) => {
  if (!state) return;
  const rect = canvas.getBoundingClientRect(),
    x = ((event.clientX - rect.left) * canvas.width) / rect.width,
    y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  activateRegion(state.regions.find((item) => inside(item, x, y)));
});
function activateRegion(region) {
  if (!region || spectator || state.phase === "finished") return;
  const me = state.players.find((player) => player.id === myId);
  if (!me || me.controlState === "surrendered") return;
  if (!me.started) {
    if (state.phase === "placement" && state.availablePads.includes(region.id))
      send({
        type: "start",
        regionId: region.id,
        specialty: document.querySelector("#specialty").value || undefined,
      });
    selectedRegion = region.id;
    render();
    return;
  }
  if (state.phase !== "active") return;
  if (selectedRegion === null) {
    selectedRegion = region.id;
    render();
    return;
  }
  const source = state.regions[selectedRegion];
  if (region.id === selectedRegion) {
    selectedRegion = null;
    render();
    return;
  }
  if (
    source.campaigns[myId] &&
    region.ownerId === myId &&
    source.neighbours.includes(region.id)
  )
    send({ type: "withdraw", regionId: source.id, toId: region.id });
  else if (source.ownerId === myId)
    send({ type: "dispatch", fromId: source.id, toId: region.id });
  else {
    selectedRegion = region.id;
    render();
    return;
  }
  selectedRegion = region.ownerId === myId ? region.id : null;
  render();
}
canvas.addEventListener("keydown", (event) => {
  if (!state) return;
  const columns = state.map.columns;
  if (event.key === "Escape") {
    selectedRegion = null;
    render();
    return;
  }
  const delta = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
  }[event.key];
  if (delta) {
    event.preventDefault();
    keyboardRegion = Math.max(
      0,
      Math.min(state.regions.length - 1, keyboardRegion + delta),
    );
    hoveredRegion = keyboardRegion;
    render();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateRegion(state.regions[keyboardRegion]);
  }
});
const geometry = (region) =>
  hexGeometry(region, state.map, canvas.width, canvas.height, mapViewport);
const inside = (region, x, y) =>
  pointInHex(region, x, y, state.map, canvas.width, canvas.height, mapViewport);
function render() {
  const me = state.players.find((player) => player.id === myId),
    telemetry = state.telemetry?.totals;
  document.querySelector("#match-record").textContent =
    `Balance ${state.balance?.version ?? state.version} · seed ${state.seed} · ${telemetry?.dispatches ?? 0} dispatches · ${(telemetry?.contestSeconds ?? 0).toFixed(1)} contest-seconds${state.result ? ` · ${state.result.type} result` : ""}`;
  renderPlaytest();
  document.querySelector("#phase").textContent =
    `${state.phase[0].toUpperCase() + state.phase.slice(1)} · ${state.players.length}/${state.lobbySize}`;
  document.querySelector("#clock").textContent =
    state.phase === "placement"
      ? `Starts in ${Math.ceil(state.placementRemaining)}s`
      : `${String(Math.floor(state.remaining / 60)).padStart(2, "0")}:${String(Math.floor(state.remaining % 60)).padStart(2, "0")}`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.querySelector("#zoom-level").textContent =
    `${Math.round(mapViewport.zoom * 100)}%`;
  document.querySelector("#zoom-out").disabled = mapViewport.zoom === MIN_ZOOM;
  document.querySelector("#zoom-in").disabled = mapViewport.zoom === MAX_ZOOM;
  for (const region of state.regions) drawRegion(region);
  drawTerritoryBoundaries();
  drawConvoys();
  if (!me) {
    document.querySelector("#centre-company").disabled = true;
    document.querySelector("#instruction").textContent =
      "Spectating this match.";
    return;
  }
  document.querySelector("#centre-company").disabled =
    me.mapFocusRegionId == null;
  commitment.min = state.balance.movement.commitmentMinimum;
  commitment.max = state.balance.movement.commitmentMaximum;
  commitment.step = state.balance.movement.commitmentIncrement;
  commitment.value = me.commitment;
  document.querySelector("#commit-output").textContent = `${me.commitment}%`;
  dispatchFilter.value = me.filter;
  renderDispatchStatus(me);
  for (const name of allocationNames) {
    const input = document.querySelector(`[data-allocation="${name}"]`);
    input.value = me.allocation[name];
    input.previousElementSibling.querySelector("output").textContent =
      `${me.allocation[name]}%`;
  }
  const switchRemaining = Math.max(
      0,
      me.manufacturingAvailableAt - state.elapsed,
    ),
    treatmentBox = document.querySelector("#treatments");
  treatmentBox.replaceChildren();
  for (const [name, treatment] of Object.entries(state.treatments)) {
    const button = document.createElement("button");
    button.className = `treatment ${me.selectedTreatment === name ? "selected" : ""}`;
    button.disabled =
      !me.unlocked.includes(name) || Boolean(me.pendingTreatment);
    button.append(
      document.createTextNode(
        `${me.unlocked.includes(name) ? "" : "🔒 "}${treatment.label}${me.pendingTreatment === name ? " (queued)" : ""}`,
      ),
    );
    const small = document.createElement("small");
    small.textContent = `${treatment.id} · ${treatment.cost} credits/unit · level ${treatment.level}`;
    button.append(small);
    button.onclick = () => send({ type: "selectTreatment", treatment: name });
    treatmentBox.append(button);
  }
  document.querySelector("#switch-status").textContent = me.pendingTreatment
    ? `Producing ${state.treatments[me.selectedTreatment].id}; switches to ${state.treatments[me.pendingTreatment].id} in ${switchRemaining.toFixed(1)}s`
    : "Ready to switch product";
  document.querySelector("#company").innerHTML =
    `<div class="metric"><span>Control</span><b>${me.controlState}</b></div><div class="metric"><span>Own regions</span><b>${me.ownRegionCount}</b></div><div class="metric"><span>Net / gross</span><b>${me.net.toFixed(1)} / ${me.gross.toFixed(1)}</b></div><div class="metric"><span>Upkeep</span><b>${me.upkeep.toFixed(1)}/s</b></div><div class="metric"><span>Effective R / M / I</span><b>${me.researchSpend.toFixed(1)} / ${me.manufacturingSpend.toFixed(1)} / ${me.infrastructureSpend.toFixed(1)}</b></div><div class="metric"><span>Actual output</span><b>${me.production.toFixed(1)} units/s</b></div><div class="metric"><span>Direct / redirected</span><b>${me.directManufacturingFunding.toFixed(1)} / ${me.overflow.toFixed(1)}</b></div><div class="metric"><span>Unused funding</span><b>${me.unusedManufacturing.toFixed(1)}/s</b></div><div class="metric"><span>Commit / filter</span><b>${me.commitment}% / ${state.treatments[me.filter]?.id ?? "ALL"}</b></div><div class="metric"><span>Dominance</span><b>${me.dominance.regions}/${me.dominance.threshold} · ${me.dominance.seconds.toFixed(1)}/${me.dominance.requiredSeconds}s</b></div>`;
  renderIntel();
  renderResearch(me);
  renderInfrastructure(me);
  const leaders = document.querySelector("#leaders");
  leaders.replaceChildren();
  for (const leader of state.leaderboard) {
    const li = document.createElement("li");
    li.textContent = `${leader.initials} · ${leader.name}`;
    li.style.color = leader.color;
    const score = document.createElement("b");
    score.textContent = `${leader.regions} regions`;
    li.append(score);
    leaders.append(li);
  }
  document.querySelector("#surrender").disabled =
    me.surrendered || state.phase !== "active";
  document.querySelector("#instruction").textContent = me.surrendered
    ? "Company handed to automation. You may continue observing."
    : state.phase === "placement" && !me.started
      ? "Select an available outlined placement pad."
      : state.phase === "placement"
        ? "Pad reserved. All companies begin together when placement ends."
        : "Select one of your regions, then an adjacent target.";
  if (state.winner) {
    const winner = state.players.find((player) => player.id === state.winner);
    document.querySelector("#instruction").textContent =
      `${winner?.name ?? "A company"} controls the network!`;
  }
}
function renderAcceptance() {
  const coverage = state.acceptance,
    summary = document.querySelector("#acceptance-summary"),
    list = document.querySelector("#acceptance-scenarios");
  list.replaceChildren();
  if (!coverage) {
    summary.textContent = "Acceptance coverage unavailable.";
    return;
  }
  summary.textContent = `Acceptance scenarios ${coverage.automated}/${coverage.total} automated`;
  for (const scenario of coverage.scenarios) {
    const item = document.createElement("li");
    item.textContent = `${String(scenario.id).padStart(2, "0")} · ${scenario.title}`;
    item.dataset.automated = String(scenario.automated);
    list.append(item);
  }
}
function renderPlaytest() {
  renderAcceptance();
  const report = state.playtest,
    list = document.querySelector("#playtest-report"),
    summary = document.querySelector("#playtest-summary"),
    gate = state.releaseGate;
  document.querySelector("#release-status").textContent = gate
    ? `MVP gate: ${gate.ready ? "ready" : `pending ${gate.blockers.length} evidence groups`} · ${gate.acceptanceScenarios.length} acceptance scenarios · lobby sizes ${gate.lobbySizes.join("/")}`
    : "Release evidence unavailable.";
  list.replaceChildren();
  if (!report) {
    list.append(
      Object.assign(document.createElement("li"), {
        textContent: "Balance observations unavailable.",
      }),
    );
    summary.textContent = "No observations yet.";
    return;
  }
  let observed = 0,
    onTarget = 0;
  for (const [name, target] of Object.entries(report.targets)) {
    const item = document.createElement("li"),
      label = name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`),
      value =
        target.value == null
          ? "pending"
          : `${target.value.toFixed(1)} ${target.unit}`;
    item.dataset.status = target.status;
    item.textContent = `${label}: ${value} — ${target.status}`;
    list.append(item);
    if (target.value != null) {
      observed++;
      if (target.status === "on-target") onTarget++;
    }
  }
  summary.textContent = `${onTarget}/${observed} observed targets on target · ${report.observations.completedContests} completed contests${report.complete ? " · final report" : " · live report"}`;
}
function programmeStatus(region) {
  const programme = region.programme;
  if (!programme) return "No continuity programme";
  if (programme.pending)
    return `Pending · activates in ${Math.max(0, programme.completesAt - state.elapsed).toFixed(1)}s`;
  const remaining = Math.max(0, programme.expiresAt - state.elapsed),
    protection =
      programme.protection > 0
        ? `${programme.protection.toFixed(1)}/${programme.maxProtection} protection`
        : "protection depleted";
  return `Active · ${protection} · expires in ${remaining.toFixed(1)}s`;
}
function renderIntel() {
  const region = state.regions[selectedRegion],
    el = document.querySelector("#intel"),
    me = state.players.find((player) => player.id === myId);
  if (!region) {
    el.textContent = "Select a region.";
    return;
  }
  const owner = state.players.find((p) => p.id === region.ownerId),
    owned = region.ownerId === myId,
    unlocked = me?.completed.includes("R09"),
    available =
      owned &&
      unlocked &&
      !region.programme &&
      region.inventories.vaccine >= state.balance.programme.vaccineUnits,
    nextCost = state.balance.infrastructure.costs[region.level + 1];
  el.innerHTML = `<b>${region.name}</b><br><span class="profile-icon ${region.profile}">${{ solid: "◆", blood: "●", rare: "▲", mixed: "■" }[region.profile]}</span> ${region.profile} · owner ${owner ? `${owner.initials} (${owner.name})` : "Neutral"}<br>Level ${region.level}${nextCost ? ` · upgrade ${region.upgradeProgress.toFixed(1)}/${nextCost} IP` : " · fully developed"}<br>Acquired ${region.acquiredAt == null ? "—" : formatTime(region.acquiredAt)} · commissioning ${region.commissioningRemaining.toFixed(1)}s · dispatch ${region.dispatchRemaining.toFixed(1)}s<br>Protection: base ${region.protection.toFixed(1)} + programme ${(region.programme?.protection || 0).toFixed(1)}<br>Capacity ${region.storageUsed.toFixed(1)}/${region.storageCapacity}${region.overCapacity ? " · OVER CAPACITY" : ""}<br>Production ${region.productionEligible ? "eligible" : "not eligible"} · quiet ${region.quietTime.toFixed(1)}s<br>Focus: production ${me?.productionPin === region.id ? "ON" : "off"} · development ${me?.developmentPin === region.id ? "ON" : "off"}<div class="programme-status"><b>Continuity</b><br>${programmeStatus(region)}</div><div class="inventory">${Object.entries(
    region.inventories,
  )
    .map(([key, value]) => `${state.treatments[key].id} ${value.toFixed(1)}`)
    .join("<br>")}</div>`;
  if (owned) {
    const controls = document.createElement("div");
    controls.className = "region-controls";
    for (const kind of ["production", "development"]) {
      const pin = document.createElement("button");
      pin.textContent = `${me[`${kind}Pin`] === region.id ? "Clear" : "Set"} ${kind} focus`;
      pin.onclick = () => send({ type: "pin", kind, regionId: region.id });
      controls.append(pin);
    }
    const button = document.createElement("button");
    button.disabled = !available;
    button.textContent = region.programme
      ? "Unavailable until scheduled expiry"
      : !unlocked
        ? "Requires R09"
        : region.inventories.vaccine < state.balance.programme.vaccineUnits
          ? `Needs ${state.balance.programme.vaccineUnits} VAC (${region.inventories.vaccine.toFixed(1)} available)`
          : `Activate · consume ${state.balance.programme.vaccineUnits} VAC · ${state.balance.programme.pendingSeconds}s pending`;
    button.onclick = () => send({ type: "programme", regionId: region.id });
    controls.append(button);
    el.append(controls);
  }
}
function renderResearch(me) {
  const el = document.querySelector("#research"),
    queuePositions = new Map(
      me.researchQueue.map((id, index) => [id, index + 1]),
    );
  el.replaceChildren();
  for (const id of state.researchOrder) {
    const project = state.research[id],
      complete = me.completed.includes(id),
      active = me.researchActive === id,
      position = queuePositions.get(id),
      button = document.createElement("button");
    button.className = `research-node${active ? " active" : ""}${complete ? " complete" : ""}`;
    button.disabled = complete;
    const prerequisite =
        project[1] && !me.completed.includes(project[1])
          ? ` · queued after ${project[1]}`
          : "",
      schedule = complete
        ? "complete"
        : active
          ? "active"
          : position
            ? `queue ${position}`
            : "not queued";
    button.innerHTML = `<b>${id}</b> ${project[0]}<small>${(me.researchProgress[id] || 0).toFixed(1)} / ${project[2]} RP · ${schedule}${prerequisite}${active ? ` · ${me.researchSpend.toFixed(1)} RP/s · ETA ${formatEta(me.researchEta)}` : ""}</small>`;
    button.onclick = () => {
      let indication;
      if (id === "R05" && !me.r05Choice)
        indication = document.querySelector("#r05-choice").value || undefined;
      send({ type: "research", project: id, indication });
    };
    el.append(button);
  }
  document.querySelector("#research-status").textContent =
    `Priority ready in ${Math.max(0, me.priorityAvailableAt - state.elapsed).toFixed(1)}s · R05 indication: ${me.r05Choice ?? me.r05RequestedChoice ?? "automatic on first spend"}`;
}
function renderInfrastructure(me) {
  const region = state.regions[me.infrastructureActive],
    costs = state.balance.infrastructure.costs,
    next = region ? region.level + 1 : null;
  document.querySelector("#infrastructure").textContent = region
    ? `${region.name}: level ${region.level} → ${next}; ${region.upgradeProgress.toFixed(1)}/${costs[next]} IP at ${me.infrastructureSpend.toFixed(1)} IP/s; ETA ${formatEta(me.infrastructureEta)}. Selected by ${me.infrastructureReason}.`
    : "All regions fully developed.";
}
function force(me, key, profile, defending = false) {
  const balance = state.balance,
    profiles = balance.treatmentProfiles,
    effects = balance.researchEffects;
  let value = balance.treatments[key].cost,
    multiplier =
      key === "radiotherapy"
        ? profiles.radiotherapy[profile]
        : key === "immunotherapy"
          ? (profiles.immunotherapy[profile] ?? profiles.immunotherapy.default)
          : key === "vaccine"
            ? profiles.vaccine
            : 1;
  if (key === "targeted")
    multiplier = me.targetedIndications.includes(profile)
      ? profiles.targeted.indicated
      : profiles.targeted.other;
  if (key === "medicine" && me.completed.includes("R02"))
    multiplier *= effects.medicineProtocols;
  if (
    key === "medicine" &&
    me.completed.includes("R03") &&
    profile === me.specialty
  )
    multiplier *= effects.diagnosticSpecialty;
  if (key === "radiotherapy" && defending)
    multiplier *= me.completed.includes("R07")
      ? effects.radiationDefense
      : effects.radiationDefenseBase;
  return value * multiplier;
}
function stockLabel(ratio) {
  return ratio >= state.balance.preview.advantageRatio
    ? "advantage"
    : ratio >= state.balance.preview.comparableRatio
      ? "comparable"
      : "disadvantage";
}
function renderDispatchStatus(me) {
  const el = document.querySelector("#dispatch-status");
  if (!me || selectedRegion == null) {
    el.textContent = "Select an owned source to preview an order.";
    return;
  }
  const source = state.regions[selectedRegion],
    target = state.regions[hoveredRegion];
  if (source.ownerId !== myId) {
    el.textContent = source.campaigns[myId]
      ? `Withdrawal available: select an adjacent owned destination; ${state.balance.movement.withdrawalRetained * 100}% travels in one convoy.`
      : "This region is not an authorized source.";
    return;
  }
  const keys =
      me.filter === "all" ? Object.keys(state.treatments) : [me.filter],
    capacity = keys.reduce(
      (sum, key) =>
        sum +
        (source.inventories[key] * state.treatments[key].cost * me.commitment) /
          100,
      0,
    ),
    cooldown = Math.max(0, source.dispatchAvailableAt - state.elapsed),
    status = me.dispatchStatus;
  let text = `Packet ${capacity.toFixed(1)} capacity · source ready ${cooldown ? `in ${cooldown.toFixed(1)}s` : "now"} · convoys ${status.convoySlotsUsed}/${status.convoySlots} · foreign targets ${status.foreignTargetsUsed}/${status.foreignTargetSlots}`;
  if (target) {
    const committed = status.targetCommitments[target.id] || 0;
    text += ` · target committed ${committed.toFixed(1)}/${state.balance.movement.targetCapacity}`;
    const arriving = keys.reduce(
        (sum, key) =>
          sum +
          ((source.inventories[key] * me.commitment) / 100) *
            force(me, key, target.profile),
        0,
      ),
      parties = [];
    if (target.ownerId !== myId) {
      const owner = state.players.find(
          (player) => player.id === target.ownerId,
        ),
        local =
          target.protection +
          (target.programme?.protection || 0) +
          (owner
            ? Object.entries(target.inventories).reduce(
                (sum, [key, value]) =>
                  sum + value * force(owner, key, target.profile, true),
                0,
              )
            : 0);
      if (local > 0)
        parties.push(
          `${owner?.name ?? "neutral"} ${stockLabel(arriving / local)}`,
        );
      for (const [id, supply] of Object.entries(target.campaigns)) {
        if (id === myId) continue;
        const company = state.players.find((player) => player.id === id),
          value = company
            ? Object.entries(supply).reduce(
                (sum, [key, quantity]) =>
                  sum + quantity * force(company, key, target.profile),
                0,
              )
            : 0;
        if (value > 0)
          parties.push(
            `${company?.name ?? "campaign"} ${stockLabel(arriving / value)}`,
          );
      }
    }
    text += ` · Stock comparison: ${parties.length ? parties.join(", ") : "unopposed"}. Not a result forecast.`;
  }
  el.textContent = text;
}
function drawConvoys() {
  for (const convoy of state.convoys) {
    ctx.beginPath();
    convoy.path.slice(convoy.index).forEach((id, index) => {
      const hex = geometry(state.regions[id]);
      if (index) ctx.lineTo(hex.cx, hex.cy);
      else ctx.moveTo(hex.cx, hex.cy);
    });
    ctx.strokeStyle = convoy.companyId === myId ? "#fff" : "#76a8b0";
    ctx.lineWidth = convoy.companyId === myId ? 3 : 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const destination = geometry(state.regions[convoy.targetId]);
    ctx.fillStyle = convoy.companyId === myId ? "#46ddb0" : "#76a8b0";
    ctx.beginPath();
    ctx.arc(destination.cx, destination.cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
const formatEta = (value) =>
  Number.isFinite(value) ? `${Math.ceil(value)}s` : "—";
const formatTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
function drawRegion(region) {
  const hex = geometry(region),
    owner = state.players.find((player) => player.id === region.ownerId),
    mine = owner?.id === myId,
    contest = region.contestParties?.length > 1,
    profileSymbol = { solid: "◆", blood: "●", rare: "▲", mixed: "■" }[
      region.profile
    ],
    supply = region.localSupply?.capacity ?? region.storageUsed;
  traceHex(ctx, hex);
  ctx.fillStyle = owner ? owner.color : "#132c32";
  ctx.globalAlpha = mine ? 0.9 : 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (owner) {
    ctx.save();
    traceHex(ctx, hex);
    ctx.clip();
    ctx.strokeStyle = "#ffffff35";
    ctx.lineWidth = 1;
    // Retain a sparse non-colour ownership texture without letting hatching
    // compete with supply, profile, and defence labels.
    const spacing = 20 + (owner.ownershipPattern ?? 0) * 5;
    for (
      let x = hex.cx - hex.size * 2;
      x < hex.cx + hex.size * 2;
      x += spacing
    ) {
      ctx.beginPath();
      ctx.moveTo(x, hex.cy - hex.size);
      ctx.lineTo(x + hex.size, hex.cy + hex.size);
      ctx.stroke();
    }
    ctx.restore();
  }
  const availablePad =
    state.phase === "placement" && state.availablePads.includes(region.id);
  traceHex(ctx, hex);
  ctx.strokeStyle =
    selectedRegion === region.id
      ? "#fff"
      : hoveredRegion === region.id
        ? "#ffc857"
        : availablePad
          ? "#46ddb0"
          : "#203b41";
  ctx.lineWidth =
    selectedRegion === region.id ? 4 : mine ? 3 : availablePad ? 3 : 1;
  ctx.stroke();
  // A double boundary and YOU marker make local ownership recognizable in
  // monochrome and for players who cannot distinguish the company colours.
  if (mine) {
    traceHex(ctx, { ...hex, size: Math.max(1, hex.size - 4) });
    ctx.strokeStyle = "#f5fffc";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = {
    solid: "#ff7878",
    blood: "#a98bff",
    rare: "#58b9ff",
    mixed: "#ffc857",
  }[region.profile];
  ctx.textAlign = "center";
  ctx.font = `800 ${Math.max(10, hex.size * 0.25)}px system-ui`;
  ctx.fillText(profileSymbol, hex.cx, hex.cy - hex.size * 0.5);
  ctx.fillStyle = "#dcebea";
  ctx.font = `900 ${Math.max(15, Math.min(25, hex.size * 0.42))}px ui-monospace, monospace`;
  ctx.fillText(Math.round(supply), hex.cx, hex.cy + hex.size * 0.04);
  ctx.font = `800 ${Math.max(7, Math.min(10, hex.size * 0.15))}px system-ui`;
  ctx.fillStyle = "#f5fffc";
  ctx.fillText("SUPPLY", hex.cx, hex.cy + hex.size * 0.22);
  ctx.font = `700 ${Math.max(8, Math.min(11, hex.size * 0.18))}px system-ui`;
  ctx.fillStyle = "#dcebea";
  ctx.fillText(
    `${mine ? "YOU · " : owner ? `${owner.initials} · ` : ""}L${region.level} · DEF ${Math.floor(region.protection)}`,
    hex.cx,
    hex.cy + hex.size * 0.46,
  );
  if (contest) {
    ctx.strokeStyle = "#ef647d";
    ctx.lineWidth = 4;
    traceHex(ctx, hex);
    ctx.stroke();
    const total = region.contestParties.reduce((sum, p) => sum + p.force, 0),
      width = hex.size * 1.35,
      left = hex.cx - width / 2,
      y = hex.cy + hex.size * 0.57;
    let offset = 0;
    for (const party of region.contestParties) {
      const company = state.players.find((p) => p.id === party.companyId),
        part = (width * party.force) / total;
      ctx.fillStyle = company?.color ?? "#9aa";
      ctx.fillRect(left + offset, y, part, 4);
      offset += part;
    }
  }
}

function drawTerritoryBoundaries() {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const region of state.regions) {
    if (!region.territoryBoundaryEdges?.length) continue;
    const hex = geometry(region);
    ctx.beginPath();
    for (const edge of region.territoryBoundaryEdges) {
      const start = hex.points[edge],
        end = hex.points[(edge + 1) % hex.points.length];
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.strokeStyle = region.ownerId === myId ? "#f5fffc" : "#789da0";
    ctx.lineWidth = region.ownerId === myId ? 4 : 2.5;
    ctx.stroke();
  }
  ctx.restore();
}
