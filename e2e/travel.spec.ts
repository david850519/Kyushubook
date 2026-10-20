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
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect(page.locator(".offline-pill")).toHaveCount(0);
});

test("精簡總覽、當日詳情與導航連結", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "搜尋地點" })).toHaveCount(0);
  await expect(
    page.getByText("OUR LITTLE JOURNEY", { exact: true }),
  ).toHaveCount(0);
  await page.locator(".day-row").first().click();
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
  await page.getByRole("button", { name: "設定與匯入" }).click();
  await expect(page.getByText("目前離線", { exact: true })).toBeVisible();
  await expect(page.getByText("離線資源已備妥", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
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
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  for (let step = 0; step < 3; step++)
    await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.locator('canvas[data-rendered="true"]')).toBeVisible();
  await expect(page.locator(".pdf-stage")).toHaveCSS(
    "overscroll-behavior",
    "contain",
  );
  const viewport = page.viewportSize()!;
  const modal = await page.locator(".modal-wide").boundingBox();
  expect(modal!.height).toBeGreaterThan(viewport.height * 0.9);
  if (viewport.width < 800)
    expect(modal!.width).toBeGreaterThan(viewport.width * 0.98);
  await page.locator(".pdf-stage").evaluate((element) => {
    element.scrollTop = 80;
  });
  expect(
    await page.locator(".pdf-stage").evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  const backgroundPosition = await page
    .locator("body")
    .evaluate((element) =>
      Math.max(0, -Number.parseFloat(element.style.top || "0")),
    );
  await page.locator(".pdf-stage").hover();
  await page.mouse.wheel(0, 120);
  await expect
    .poll(() =>
      page.locator(".pdf-stage").evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(80);
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
  expect(await page.evaluate(() => scrollY)).toBe(backgroundPosition);
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
  await page.getByLabel("選擇個人備份").setInputFiles({
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
  await maker.getByLabel("行程資料 JSON", { exact: true }).setInputFiles({
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

test("八天閱讀版：精簡總覽、景點展開與旅務分類", async ({ page }, testInfo) => {
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
  const keyring = await parseActivation(settingsText);
  const sample = await openTrip(
    parseEnvelope(await readFile((await packageDownload.path())!, "utf8")),
    keyring,
  );
  const themes = [
    "城下散步",
    "山野風景",
    "湖畔小鎮",
    "小城日和",
    "海港時光",
    "街角咖啡",
    "城市漫步",
    "歸途",
  ];
  const stops = [
    "山丘展望台",
    "湖畔散步",
    "午後咖啡",
    "湖畔旅宿",
    "舊城街道",
    "晚餐食堂",
  ];
  const categories = ["展望", "自然", "餐飲", "住宿", "街區", "餐飲"];
  const trip = {
    ...sample,
    revision: sample.revision + 1,
    title: "晨萱九州遊",
    demo: false,
    days: themes.map((title, dayIndex) => ({
      ...sample.days[0],
      id: `day-${dayIndex}`,
      date: new Date(Date.UTC(2027, 3, 12 + dayIndex))
        .toISOString()
        .slice(0, 10),
      title,
      heroId: undefined,
      places: stops.map((name, index) => ({
        ...sample.days[0].places[0],
        id: `place-${dayIndex}-${index}`,
        name: dayIndex === 3 && index === 3 ? "第四天原稿住宿待確認" : name,
        category: categories[index],
        english: "原稿未提供英文名稱",
        address: "請參閱原稿",
        period: "彈性",
        description: "山頂展望與綠意。這是僅在展開後呈現的完整示範內容。",
        note: "來源：虛構示範原稿。實際安排待確認。",
      })),
    })),
    documents: [
      {
        id: "flight-out",
        title: "出發航班",
        kind: "航班",
        detail: "IT999；2027/04/12 TPE Terminal 1 07:10 → HSG 10:25",
        reference: "DEMO-REFERENCE",
      },
      {
        id: "flight-back",
        title: "回家航班",
        kind: "航班",
        detail: "IT998；2027/04/19 HSG 11:25 → TPE Terminal 1 13:05",
      },
      {
        id: "stay",
        title: "湖畔旅宿：日期待確認",
        kind: "住宿",
        detail: "湖畔的一夜。完整訂房說明保留在原稿資訊。",
      },
      {
        id: "original",
        title: "虛構小書.pdf",
        kind: "原始小書",
        detail: "",
        assetId: "sample-pdf",
      },
      {
        id: "esim",
        title: "示範 eSIM.pdf",
        kind: "PDF 附件",
        detail: "",
        assetId: "sample-pdf",
      },
      {
        id: "ticket",
        title: "景點票券.pdf",
        kind: "PDF 附件",
        detail: "",
        assetId: "sample-pdf",
      },
      {
        id: "flight-file",
        title: "機票電子確認單.pdf",
        kind: "PDF 附件",
        detail: "",
        assetId: "sample-pdf",
      },
      {
        id: "notes",
        title: "示範原稿校對",
        kind: "原稿校對",
        detail: "此為虛構測試資料，沒有私人資訊。",
      },
    ],
    placeList: {
      title: "示範收藏",
      sourceUrl: "https://maps.app.goo.gl/example",
      importedAt: "2027-04-01T00:00:00.000Z",
      places: [
        {
          id: "saved-1",
          name: "第一咖啡",
          region: "熊本",
          address: "示範熊本地址",
          mapUrl: "https://www.google.com/maps?cid=123",
        },
        {
          id: "saved-2",
          name: "第二咖啡",
          region: "熊本",
          address: "示範熊本地址",
          mapUrl: "https://www.google.com/maps?cid=456",
        },
        {
          id: "saved-3",
          name: "湖邊甜點",
          region: "由布院",
          address: "示範由布院地址",
          mapUrl: "https://www.google.com/maps?cid=789",
        },
        {
          id: "saved-4",
          name: "街角食堂",
          region: "福岡",
          address: "示範福岡地址",
          mapUrl: "https://www.google.com/maps?cid=101112",
        },
      ],
    },
  };
  await page.getByLabel("選取設定檔與旅遊包").setInputFiles([
    {
      name: "settings.kykey",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(settingsText),
    },
    {
      name: "trip.kyushu",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(JSON.stringify(await sealTrip(trip, keyring))),
    },
  ]);
  await expect(page.getByText("旅遊包匯入完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(page.locator(".day-row")).toHaveCount(8);
  await expect(page.locator(".day-row").nth(3).locator(".day-stay")).toHaveText(
    "湖畔旅宿 · 續住",
  );
  await expect(
    page.getByText("旅遊包匯入完成", { exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".day-highlights").first()).toHaveText(
    "山丘展望台 · 湖畔散步 · 舊城街道",
  );
  await page.screenshot({
    path: testInfo.outputPath("reading-overview.png"),
    fullPage: true,
  });
  await page.locator(".day-row").first().click();
  await expect(
    page.getByText("原稿未提供英文名稱", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("請參閱原稿", { exact: true })).toHaveCount(0);
  await expect(page.locator(".reading-details[open]")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("reading-day.png"),
    fullPage: true,
  });
  await page.locator(".reading-details > summary").first().click();
  await expect(
    page.locator(".reading-details[open] .reading-details-body"),
  ).toContainText("僅在展開後呈現");
  await page.getByRole("button", { name: "食光", exact: true }).click();
  await expect(page.locator(".timeline > li")).toHaveCount(2);
  await navigate(page, "旅務");
  await expect(page.locator(".flight-route")).toHaveCount(2);
  await expect(page.locator(".wallet-shortcut")).toHaveCount(2);
  await expect(page.locator(".source-notes[open]")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("reading-wallet.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "檔案", exact: true }).click();
  await expect(page.locator(".wallet-entry")).toHaveCount(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("reading-wallet-narrow.png"),
    fullPage: true,
  });
  await navigate(page, "收藏");
  await expect(page.locator(".saved-place")).toHaveCount(4);
  await page
    .getByRole("group", { name: "收藏地區" })
    .getByRole("button", { name: /^熊本/ })
    .click();
  await expect(page.locator(".saved-place")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜尋收藏地點" }).fill("第二");
  await expect(page.locator(".saved-place")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "在 Google 地圖開啟第二咖啡" }),
  ).toHaveAttribute("href", "https://www.google.com/maps?cid=456");
  await page.getByRole("button", { name: "清除收藏搜尋" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("saved-places-narrow.png"),
    fullPage: true,
  });
  await page.context().setOffline(true);
  await page.reload();
  await navigate(page, "收藏");
  await expect(page.locator(".saved-place")).toHaveCount(4);
});

test("網路參考匯率保存，手動與離線設定仍受保護", async ({ page, context }) => {
  const endpoint = "https://open.er-api.com/v6/latest/JPY";
  let requests = 0;
  await page.route(endpoint, async (route) => {
    requests++;
    const now = Math.floor(Date.now() / 1000);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        result: "success",
        base_code: "JPY",
        time_last_update_unix: now - 60,
        time_next_update_unix: now + 86400,
        rates: { TWD: 0.214321 },
      }),
    });
  });
  await navigate(page, "花費");
  await page.getByRole("button", { name: "更新網路參考匯率" }).click();
  await expect(page.getByRole("textbox", { name: "參考匯率" })).toHaveValue(
    "0.214321",
  );
  await expect(page.locator(".rate-source")).toContainText("每日參考價");
  await expect(
    page.getByRole("link", { name: "Rates By Exchange Rate API" }),
  ).toHaveAttribute("href", "https://www.exchangerate-api.com");
  await page.reload();
  await navigate(page, "花費");
  await expect(page.getByRole("textbox", { name: "參考匯率" })).toHaveValue(
    "0.214321",
  );
  await page.getByRole("button", { name: "更新網路參考匯率" }).click();
  await expect(
    page.getByRole("button", { name: "更新網路參考匯率" }),
  ).toBeEnabled();
  expect(requests).toBe(1);
  await page.getByRole("textbox", { name: "參考匯率" }).fill("0.25");
  await page.getByRole("button", { name: "儲存參考匯率" }).click();
  await expect(page.locator(".rate-source")).toContainText("手動匯率");
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.getByRole("button", { name: "更新網路參考匯率" }).click();
  await expect(page.locator(".rate-error")).toContainText("已保留原有設定");
  await expect(page.getByRole("textbox", { name: "參考匯率" })).toHaveValue(
    "0.25",
  );
  await context.setOffline(true);
  await page.getByRole("button", { name: "更新網路參考匯率" }).click();
  await expect(page.locator(".rate-error")).toContainText("目前離線");
  await expect(page.getByRole("textbox", { name: "參考匯率" })).toHaveValue(
    "0.25",
  );
});
