import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { validateTrip } from "../src/lib/travel.ts";

let stage = "source";
let browser;
try {
  const sourcePath = fileURLToPath(
    new URL("../private/source-trip.json", import.meta.url),
  );
  const pdfPath = fileURLToPath(
    new URL("../../九州小書v1.pdf", import.meta.url),
  );
  const source = validateTrip(JSON.parse(await readFile(sourcePath, "utf8")));
  if (source.demo || source.days.length !== 8)
    throw new Error("unexpected source");
  stage = "deployment-isolation";
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  const entries = await readdir(dist, { recursive: true });
  const markers = [
    source.id,
    ...source.documents
      .map((item) => item.reference)
      .filter((value) => value && value.length >= 8),
  ];
  for (const entry of entries) {
    if (
      ["source-trip.json", "extraction-notes.md", "九州小書v1.pdf"].some(
        (name) => entry.includes(name),
      )
    )
      throw new Error("private file in deployment");
    if (/\.(js|json|html|txt)$/.test(entry)) {
      const text = await readFile(`${dist}/${entry}`, "utf8");
      if (markers.some((marker) => text.includes(marker)))
        throw new Error("private marker in deployment");
    }
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  stage = "local-maker";
  await page.goto("http://127.0.0.1:4173/#prepare");
  await page
    .getByLabel("行程資料 JSON", { exact: true })
    .setInputFiles(sourcePath);
  await page
    .getByLabel("附加 PDF／圖片", { exact: true })
    .setInputFiles(pdfPath);
  await page.locator(".attachment-list").waitFor();
  const ephemeralPassphrase = randomBytes(32).toString("hex");
  await page
    .getByLabel("共用備份密語", { exact: true })
    .fill(ephemeralPassphrase);
  await page.getByLabel("確認密語", { exact: true }).fill(ephemeralPassphrase);
  await page
    .getByRole("button", { name: "產生加密旅遊包", exact: true })
    .click();
  await page.getByRole("region", { name: "製包完成" }).waitFor();
  const [settingsDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載私密設定", exact: true }).click(),
  ]);
  const [tripDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載加密旅遊包", exact: true }).click(),
  ]);
  const settingsPath = await settingsDownload.path();
  const tripPath = await tripDownload.path();
  stage = "private-import";
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "晨萱九州遊", exact: true }).waitFor();
  await page.getByText("離線已備妥", { exact: true }).waitFor();
  const leakedRequests = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      !request.url().startsWith("http://127.0.0.1:4173/")
    )
      leakedRequests.push(true);
  });
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page
    .getByLabel("選取設定檔與旅遊包")
    .setInputFiles([settingsPath, tripPath]);
  await page
    .getByRole("status")
    .filter({ hasText: "旅遊包匯入完成" })
    .waitFor();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  if ((await page.locator(".day-row").count()) !== 8)
    throw new Error("missing days");
  stage = "offline-private-pdf";
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page
    .locator("nav:visible")
    .getByRole("button", { name: "旅務", exact: true })
    .click();
  const pdfEntry = page
    .locator(".document-entry")
    .filter({
      has: page.getByRole("heading", { name: "九州小書v1.pdf", exact: true }),
    });
  await pdfEntry.getByRole("button", { name: "查看附件", exact: true }).click();
  await page.locator('canvas[data-rendered="true"]').waitFor();
  if (!/1\s*\/\s*36/.test(await page.locator(".reader-tools").innerText()))
    throw new Error("unexpected page count");
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  await page.locator('canvas[data-rendered="true"]').waitFor();
  if (!/2\s*\/\s*36/.test(await page.locator(".reader-tools").innerText()))
    throw new Error("page change failed");
  if (leakedRequests.length) throw new Error("unexpected network activity");
  console.log(
    `PASS: private source ${source.days.length} days / ${source.days.reduce((count, day) => count + day.places.length, 0)} places; encrypted maker; import; offline 36-page original PDF; no private deployment or network upload; no screenshots or traces.`,
  );
  await context.close();
} catch {
  console.error(
    `FAIL: private verification stage=${stage}; details intentionally not printed.`,
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
