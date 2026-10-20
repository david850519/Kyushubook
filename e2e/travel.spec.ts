import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  openTrip,
  parseActivation,
  parseEnvelope,
  sealTrip,
} from "../src/lib/travel";

async function navigate(page: Page, name: string) {
  await page
    .locator("nav:visible")
    .getByRole("button", { name, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("晨萱九州遊｜隨身旅遊手帖");
  await expect(page.locator(".footer-credit")).toHaveText(
    "Made by Koala Travel Agency, 2026",
  );
  await expect(page.getByText("離線已備妥", { exact: true })).toBeVisible();
});

test("搜尋、當日詳情與導航連結", async ({ page }) => {
  await page.getByRole("textbox", { name: "搜尋地點" }).fill("水前寺");
  await expect(
    page.getByRole("heading", { name: "找到 1 個地方" }),
  ).toBeVisible();
  await page.locator(".result-row").click();
  await expect(page.getByRole("heading", { name: "今日散策" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "水前寺成趣園", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "開啟地圖" }).first(),
  ).toHaveAttribute("href", "https://maps.app.goo.gl/JTzKSeoTQtCim2tP7");
  await expect(page.getByRole("link", { name: "開啟地圖" }).first()).toHaveText(
    "",
  );
  await expect(page.getByRole("button", { name: /複製/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "開啟地圖" }).nth(1),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps?cid=4335317393072890667",
  );
  await expect(
    page.getByRole("link", { name: "開啟地圖" }).nth(2),
  ).toHaveAttribute(
    "href",
    "https://www.google.com/maps?cid=8430181699338578675",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("行前勾選在重開後保留，伴手禮已移除", async ({ page }) => {
  await navigate(page, "清單");
  await expect(
    page.getByRole("button", { name: "伴手禮", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("明太子仙貝", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "護照正本" }).check();
  await expect(page.getByRole("checkbox", { name: "護照正本" })).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  await navigate(page, "清單");
  await expect(page.getByRole("checkbox", { name: "護照正本" })).toBeChecked();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("真實選檔匯入新包、拒絕損壞包且不向網路傳送資料", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173/") &&
      !request.url().startsWith("blob:")
    )
      externalRequests.push(request.url());
  });
  await page.getByRole("button", { name: "設定與匯入" }).click();
  const importInput = page.getByLabel("選取設定檔與旅遊包");
  await expect(importInput).not.toHaveAttribute("accept", /.+/);
  await importInput.setInputFiles({
    name: "unsupported.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK\u0003\u0004"),
  });
  await expect(page.getByRole("alert")).toContainText("檔案格式不正確");
  const [settingsDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載示範設定" }).click(),
  ]);
  const [packageDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載示範旅遊包" }).click(),
  ]);
  const settingsText = await readFile((await settingsDownload.path())!, "utf8");
  const envelopeText = await readFile((await packageDownload.path())!, "utf8");
  const keyring = await parseActivation(settingsText);
  const trip = await openTrip(parseEnvelope(envelopeText), keyring);
  const envelope = await sealTrip(
    {
      ...trip,
      revision: trip.revision + 1,
      title: "私密測試旅程",
      demo: false,
    },
    keyring,
  );
  await importInput.setInputFiles([
    {
      name: "settings.kykey",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(settingsText),
    },
    {
      name: "trip.kyushu",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(JSON.stringify(envelope)),
    },
  ]);
  await expect(page.getByText("旅遊包匯入完成", { exact: true })).toBeVisible();
  await page.getByLabel("選取設定檔與旅遊包").setInputFiles({
    name: "bad.kyushu",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...envelope, ciphertext: "broken" })),
  });
  await expect(page.getByRole("alert")).toContainText("無法解密");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "私密測試旅程", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "私密測試旅程", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "設定與匯入" }).click();
  const legacyEnvelope = await sealTrip(
    { ...trip, revision: trip.revision + 2, title: "九州小書", demo: false },
    keyring,
  );
  await importInput.setInputFiles({
    name: "legacy-trip.kyushu",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(JSON.stringify(legacyEnvelope)),
  });
  await expect(page.getByText("旅遊包匯入完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("舊示範資料升版後保留行前勾選並使用固定地圖", async ({ page }) => {
  await page.getByRole("button", { name: "設定與匯入" }).click();
  const [settingsDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載示範設定" }).click(),
  ]);
  const [packageDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下載示範旅遊包" }).click(),
  ]);
  const settingsText = await readFile((await settingsDownload.path())!, "utf8");
  const envelopeText = await readFile((await packageDownload.path())!, "utf8");
  const keyring = await parseActivation(settingsText);
  const trip = await openTrip(parseEnvelope(envelopeText), keyring);
  const oldTrip = {
    ...trip,
    revision: 1,
    days: trip.days.map((day) => ({
      ...day,
      places: day.places.map((place) => ({ ...place, mapUrl: undefined })),
    })),
    checklist: [
      ...trip.checklist,
      { id: "old-shopping", category: "伴手禮", label: "舊版採買項目" },
    ],
  };
  const oldEnvelope = await sealTrip(oldTrip, keyring);
  await page.evaluate(
    (envelope) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("kyushu-travel-book", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("state", "readwrite");
          const store = transaction.objectStore("state");
          const current = store.get("current");
          current.onsuccess = () => {
            const record = current.result;
            record.envelope = envelope;
            record.checked.passport = true;
            store.put(record, "current");
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    oldEnvelope,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  await navigate(page, "清單");
  await expect(page.getByRole("checkbox", { name: "護照正本" })).toBeChecked();
  await expect(page.getByText("舊版採買項目", { exact: true })).toHaveCount(0);
  await navigate(page, "行程");
  await page.locator(".day-row").first().click();
  await expect(
    page.getByRole("link", { name: "開啟地圖" }).first(),
  ).toHaveAttribute("href", "https://maps.app.goo.gl/JTzKSeoTQtCim2tP7");
});

test("飛航情境重開，離線 PDF 非空白且可以縮放", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("離線中", { exact: true })).toBeVisible();
  await navigate(page, "旅務");
  await page.getByRole("button", { name: "查看附件" }).click();
  const canvas = page.locator('canvas[data-rendered="true"]');
  await expect(canvas).toBeVisible();
  const colored = await canvas.evaluate((element) => {
    const context = element.getContext("2d")!;
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 16)
      if (data[index] < 180 && data[index + 3] > 0) count++;
    return count;
  });
  expect(colored).toBeGreaterThan(100);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.locator(".zoom-label")).toHaveText("125%");
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("手機與桌面截圖：照片正常、頁面無溢位", async ({ page }, testInfo) => {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".heading-illustration")).toBeVisible();
  expect(
    await page
      .locator(".heading-illustration")
      .evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
  ).toBe(true);
  expect(
    await page
      .locator(".trip-photo img")
      .evaluate((image: HTMLImageElement) => image.naturalWidth > 0),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("overview.png"),
    fullPage: true,
  });
  await page.locator(".day-row").first().click();
  await page.screenshot({
    path: testInfo.outputPath("day.png"),
    fullPage: true,
  });
  await navigate(page, "清單");
  await expect(page.locator(".illustration-suitcase")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("checklist.png"),
    fullPage: true,
  });
  await navigate(page, "花費");
  await page.screenshot({
    path: testInfo.outputPath("expenses.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page.screenshot({
    path: testInfo.outputPath("settings.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("small-mobile.png"),
      fullPage: true,
    });
  }
});

test("個人花費與匯率保存，加密備份需確認才復原", async ({ page }, testInfo) => {
  await navigate(page, "花費");
  await page
    .getByRole("textbox", { name: "參考匯率", exact: true })
    .fill("0.22");
  await page.getByRole("button", { name: "儲存參考匯率", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "參考匯率已儲存" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增支出", exact: true }).click();
  await page
    .getByRole("textbox", { name: "項目名稱", exact: true })
    .fill("測試拉麵");
  await page.getByRole("textbox", { name: "金額", exact: true }).fill("1200");
  await page.screenshot({
    path: testInfo.outputPath("expense-form.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "儲存支出", exact: true }).click();
  await expect(page.locator(".expense-totals")).toContainText("1,200");
  await page.getByRole("button", { name: "編輯測試拉麵", exact: true }).click();
  await page.getByRole("textbox", { name: "金額", exact: true }).fill("1500");
  await page.getByRole("button", { name: "儲存支出", exact: true }).click();
  await expect(page.locator(".estimated-total")).toContainText("330");
  await page.screenshot({
    path: testInfo.outputPath("expenses-filled.png"),
    fullPage: true,
  });
  await page.getByLabel("換算金額", { exact: true }).fill("1000");
  await expect(page.locator(".conversion-result")).toContainText("220");
  await page.reload();
  await navigate(page, "花費");
  await expect(page.locator(".expense-totals")).toContainText("1,500");
  await page.getByRole("button", { name: "設定與匯入" }).click();
  const [backupDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "匯出備份", exact: true }).click(),
  ]);
  const backupText = await readFile((await backupDownload.path())!, "utf8");
  expect(backupText).not.toContain("測試拉麵");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "刪除測試拉麵", exact: true }).click();
  await page.getByRole("button", { name: "確認刪除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "測試拉麵", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page
    .getByLabel("選擇個人備份")
    .setInputFiles({
      name: "personal.kybackup",
      mimeType: "application/json",
      buffer: Buffer.from(backupText),
    });
  await expect(
    page.getByRole("heading", { name: "備份預覽", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".expense-totals")).toContainText("0");
  await page
    .getByRole("button", { name: "確認取代並復原", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "個人資料已復原" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "測試拉麵", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".estimated-total")).toContainText("330");
});

test("清除本機資料需確認，之後回到無個人紀錄的示範", async ({ page }) => {
  await navigate(page, "清單");
  await page.getByRole("checkbox", { name: "護照正本" }).check();
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page
    .getByRole("button", { name: "清除此裝置資料", exact: true })
    .click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "護照正本" })).toBeChecked();
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page
    .getByRole("button", { name: "清除此裝置資料", exact: true })
    .click();
  await page.getByRole("button", { name: "確認清除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "晨萱九州遊", exact: true }),
  ).toBeVisible();
  await navigate(page, "清單");
  await expect(
    page.getByRole("checkbox", { name: "護照正本" }),
  ).not.toBeChecked();
});

test("本機製包工具不傳送檔案，產物可匯回小書", async ({ page, context }) => {
  const source = {
    version: 1,
    id: "owner-sample",
    revision: 1,
    title: "本機製包測試",
    subtitle: "虛構內容",
    demo: false,
    days: [
      {
        id: "day-1",
        date: "2027-04-12",
        title: "熊本",
        subtitle: "示意",
        places: [
          {
            id: "castle",
            name: "熊本城",
            english: "Kumamoto Castle",
            period: "上午",
            category: "散策",
            address: "示意地址",
            description: "測試",
          },
        ],
      },
    ],
    checklist: [{ id: "passport", category: "文件", label: "護照" }],
    documents: [],
    assets: [],
  };
  const maker = await context.newPage();
  await maker.goto("/#prepare");
  await expect(
    maker.getByRole("heading", { name: "旅遊包製作", exact: true }),
  ).toBeVisible();
  const mutations: string[] = [];
  maker.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      !request.url().startsWith("http://127.0.0.1:4173/")
    )
      mutations.push(request.url());
  });
  await maker
    .getByLabel("行程資料 JSON", { exact: true })
    .setInputFiles({
      name: "source.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source)),
    });
  await maker
    .getByLabel("附加 PDF／圖片", { exact: true })
    .setInputFiles(
      "app/public/demo/sample-ticket.pdf".replace(
        /^app\//,
        process.cwd().endsWith("app") ? "" : "app/",
      ),
    );
  await maker
    .getByLabel("共用備份密語", { exact: true })
    .fill("public-e2e-test-password-only");
  await maker
    .getByLabel("確認密語", { exact: true })
    .fill("public-e2e-test-password-only");
  await maker
    .getByRole("button", { name: "產生加密旅遊包", exact: true })
    .click();
  await expect(maker.getByRole("region", { name: "製包完成" })).toBeVisible();
  const [settingsDownload] = await Promise.all([
    maker.waitForEvent("download"),
    maker.getByRole("button", { name: "下載私密設定", exact: true }).click(),
  ]);
  const [tripDownload] = await Promise.all([
    maker.waitForEvent("download"),
    maker.getByRole("button", { name: "下載加密旅遊包", exact: true }).click(),
  ]);
  const settingsText = await readFile((await settingsDownload.path())!, "utf8");
  const tripText = await readFile((await tripDownload.path())!, "utf8");
  expect(settingsText).not.toContain("public-e2e-test-password-only");
  expect(tripText).not.toContain("本機製包測試");
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await page.getByLabel("選取設定檔與旅遊包").setInputFiles([
    {
      name: "settings.kykey",
      mimeType: "application/json",
      buffer: Buffer.from(settingsText),
    },
    {
      name: "trip.kyushu",
      mimeType: "application/json",
      buffer: Buffer.from(tripText),
    },
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "旅遊包匯入完成" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本機製包測試", exact: true }),
  ).toBeVisible();
  await navigate(page, "旅務");
  await page.getByRole("button", { name: "查看附件", exact: true }).click();
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible();
  await maker.close();
});
