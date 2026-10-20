import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = new URL("../dist/", import.meta.url);
const path = (process.env.PAGES_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "");
const base = path ? `/${path}/` : "/";
const forbidden =
  /(^|[\\/])private([\\/]|$)|\.(kykey|kyushu|kybackup)$|(^|[\\/])(source-trip\.json|ready-trip\.json|extraction-notes\.md|九州小書v1\.pdf)$/i;

const manifest = JSON.parse(
  await readFile(new URL("manifest.webmanifest", dist), "utf8"),
);
assert.equal(
  manifest.name,
  "晨萱九州遊",
  "PWA name must match the application name",
);
assert.equal(
  manifest.short_name,
  "晨萱九州遊",
  "Home screen name must match the application name",
);
assert.equal(manifest.id, base, "PWA id must use the deployment path");
assert.equal(
  manifest.start_url,
  base,
  "PWA start URL must use the deployment path",
);
assert.equal(manifest.scope, base, "PWA scope must use the deployment path");
assert.ok(
  manifest.icons.every((icon) => icon.src.startsWith(base)),
  "Icons must stay under the deployment path",
);
const html = await readFile(new URL("index.html", dist), "utf8");
assert.ok(
  html.includes("<title>晨萱九州遊｜隨身旅遊手帖</title>"),
  "Browser title is incorrect",
);
assert.ok(
  html.includes(`href="${base}apple-touch-icon.png"`),
  "Home screen icon path is incorrect",
);
assert.ok(
  html.includes(`href="${base}manifest.webmanifest"`),
  "Manifest path is incorrect",
);
for (const [filename, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
]) {
  const image = await readFile(new URL(filename, dist));
  assert.equal(image.readUInt32BE(16), size, "Icon width is incorrect");
  assert.equal(image.readUInt32BE(20), size, "Icon height is incorrect");
}
for (const entry of await readdir(dist, { recursive: true })) {
  assert.ok(
    !forbidden.test(entry),
    "Private file found in deployment artifact",
  );
  if (entry.endsWith(".pdf"))
    assert.equal(
      entry.replaceAll("\\", "/"),
      "demo/sample-ticket.pdf",
      "Only the fictional sample PDF may be public",
    );
}

let tracked;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  if (process.env.GITHUB_ACTIONS === "true")
    throw new Error("Cannot verify tracked repository files");
}
if (tracked !== undefined)
  assert.ok(
    tracked
      .split("\0")
      .filter(Boolean)
      .every((entry) => !forbidden.test(entry)),
    "Private file is tracked by Git; remove it before publishing",
  );
console.log(
  `PASS: GitHub Pages path ${base}, PWA metadata, icons and public artifact isolation.`,
);

if (process.env.PAGES_SMOKE_URL) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.PAGES_SMOKE_URL);
    await page
      .getByRole("heading", { name: "晨萱九州遊", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".footer-credit").innerText(),
      "Made by Koala Travel Agency, 2026",
    );
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    assert.equal(new URL(page.url()).pathname, base);
    assert.ok(
      await page
        .locator(".trip-photo img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    );
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    );
    assert.equal(
      new URL(scope).pathname,
      base,
      "Service worker scope must stay under the project path",
    );
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("heading", { name: "晨萱九州遊", exact: true })
      .waitFor();
    await page
      .locator("nav:visible")
      .getByRole("button", { name: "旅務", exact: true })
      .click();
    await page.getByRole("button", { name: "查看附件", exact: true }).click();
    await page.locator('canvas[data-rendered="true"]').waitFor();
    assert.deepEqual(
      errors,
      [],
      "Project path must load without runtime errors",
    );
    console.log(
      "PASS: project-path startup, photo, scoped service worker, offline reload and PDF reader.",
    );
    await context.close();
  } finally {
    await browser.close();
  }
}
