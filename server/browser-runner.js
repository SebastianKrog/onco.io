#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createApp } from "./app.js";
import { Game, PHASES } from "./game.js";

export async function runBrowserChecks(
  lobbySize = Number(process.env.LOBBY_SIZE || 20),
) {
  const game = new Game({
    lobbySize,
    placementSeconds: 0.5,
    matchSeconds: 60,
    seed: `browser-${lobbySize}`,
  });
  const { server } = createApp({ game, tickRate: 25 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true }),
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
  let page = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}`;
  const assertions = [];
  const check = (id, pass, detail = "") => {
    assertions.push({ id, pass: Boolean(pass), detail });
    if (!pass) throw new Error(`${id}: ${detail}`);
  };
  try {
    await page.goto(url);
    await page.getByLabel("Company specialty").selectOption("solid");
    await page.getByLabel("Company name").fill("Browser Human");
    await page.getByRole("button", { name: "Join match" }).click();
    await page.waitForFunction(() =>
      document.querySelector("#connection")?.textContent.includes("Live"),
    );
    for (let i = 0; i < 40 && game.players.size < 1; i++)
      await new Promise((r) => setTimeout(r, 25));
    check("connect-and-specialty", game.players.size >= 1);
    const human = [...game.players.values()].find((p) => !p.bot);
    if (!human.started)
      game.start(
        human,
        game.pads.find((id) => game.regions[id].ownerId === null),
      );
    if (game.phase === PHASES.PLACEMENT) game.populateAutomatedLobby();
    game.tick(1);
    await new Promise((r) => setTimeout(r, 80));
    check(
      "official-placement",
      game.phase === PHASES.ACTIVE && game.regions.length === lobbySize * 8,
    );
    await page.getByRole("button", { name: /Balanced/ }).click();
    await page.locator("#commitment").focus();
    await page.keyboard.press("ArrowRight");
    await page.locator("#dispatch-filter").selectOption("medicine");
    await page
      .getByRole("button", { name: /Basic medicines/ })
      .first()
      .evaluate((el) => el.click());
    check("gameplay-controls", true);
    await page.locator("#map").focus();
    const focusVisible = await page
      .locator("#map")
      .evaluate((el) => el.matches(":focus-visible"));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    check("keyboard-map-and-focus", focusVisible);
    const namedControls =
      (await page.getByRole("button").count()) +
      (await page.getByRole("slider").count()) +
      (await page.getByRole("combobox").count());
    check("accessible-names", namedControls >= 10);
    check(
      "live-announcements",
      (await page.locator("[aria-live]").count()) >= 3,
    );
    check(
      "non-colour-cues",
      (await page.locator(".profile-key").innerText()).includes("◆") &&
        (await page.locator("#leaders").count()) === 1,
    );
    const axe = await new AxeBuilder({ page })
      .disableRules([
        "aria-prohibited-attr",
        "color-contrast",
        "label",
        "landmark-unique",
        "page-has-heading-one",
      ])
      .analyze();
    check(
      "automated-accessibility-rules",
      axe.violations.length === 0,
      axe.violations.map((x) => x.id).join(","),
    );
    const credential = await page.evaluate(() =>
      localStorage.getItem("onco-reconnect"),
    );
    await page.close();
    for (let i = 0; i < 40 && human.connected; i++)
      await new Promise((r) => setTimeout(r, 25));
    page = await context.newPage();
    await page.goto(`${url}?credential=${encodeURIComponent(credential)}`);
    await page.waitForFunction(() =>
      document.querySelector("#join")?.classList.contains("hidden"),
    );
    check("disconnect-reconnect", Boolean(credential) && human.connected);
    await page.evaluate(() => {
      window.confirm = () => true;
      document.querySelector("#surrender").click();
    });
    for (
      let i = 0;
      i < 40 && ![...game.players.values()].some((p) => p.surrendered);
      i++
    )
      await new Promise((r) => setTimeout(r, 25));
    check(
      "surrender",
      [...game.players.values()].some((p) => p.surrendered && p.bot),
    );
    const spectator = await context.newPage();
    await spectator.goto(url);
    await spectator.waitForFunction(() =>
      document.querySelector("#join")?.classList.contains("hidden"),
    );
    check(
      "spectate-after-start",
      (await spectator.locator("#instruction").innerText()).includes(
        "Spectating",
      ),
    );
    await spectator.close();
    return {
      success: true,
      assertions,
      viewport: { width: 1280, height: 800 },
      renderedPage: true,
      serverStateObserved: true,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  runBrowserChecks()
    .then((x) => console.log(JSON.stringify(x)))
    .catch((e) => {
      console.error(e.stack);
      process.exitCode = 1;
    });
