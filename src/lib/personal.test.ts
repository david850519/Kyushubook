import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { createActivation, sealTrip, type Trip } from "./travel";
import {
  convertMinor,
  emptyPersonal,
  expenseTotals,
  openBackup,
  parseAmount,
  parseRate,
  type Expense,
} from "./personal";
import {
  clearTravel,
  deleteExpense,
  exportPersonalBackup,
  importTravel,
  previewPersonalBackup,
  restorePersonalBackup,
  restoreSession,
  saveExpense,
  saveRate,
  setChecked,
} from "./storage";

const trip: Trip = {
  version: 1,
  id: "finance-test",
  revision: 1,
  title: "示意旅程",
  subtitle: "測試",
  demo: true,
  days: [
    {
      id: "day",
      date: "2027-04-12",
      title: "熊本",
      subtitle: "示意",
      places: [
        {
          id: "place",
          name: "景點",
          english: "Place",
          period: "上午",
          category: "散策",
          address: "示意",
          description: "測試",
        },
      ],
    },
  ],
  checklist: [{ id: "passport", category: "文件", label: "護照" }],
  documents: [],
  assets: [],
};
const expense: Expense = {
  id: "expense-1",
  title: "午餐",
  amountMinor: 1500,
  currency: "JPY",
  date: "2027-04-12",
  category: "餐飲",
  note: "測試",
};
beforeEach(clearTravel);

it("金額與匯率精確解析，拒絕日圓小數、負數和無效精度", () => {
  expect(parseAmount("123.45", "TWD")).toBe(12345);
  expect(parseAmount("123", "JPY")).toBe(123);
  for (const invalid of ["-1", "0", "12.3", "abc", "1e3"])
    expect(() => parseAmount(invalid, "JPY")).toThrow();
  expect(parseRate("0.221234")).toBe(221234);
  expect(() => parseRate("0.1234567")).toThrow();
  expect(convertMinor(1000, "JPY", 220000)).toBe(22000);
  expect(convertMinor(22000, "TWD", 220000)).toBe(1000);
});

it("新增、修改、刪除與匯率可持久化，更新旅遊包不清空花費", async () => {
  const activation = await createActivation(
    trip.id,
    "public-test-password-only",
  );
  await importTravel(
    JSON.stringify(await sealTrip(trip, activation.keyring)),
    JSON.stringify(activation.file),
  );
  await saveExpense(trip.id, expense);
  await saveExpense(trip.id, { ...expense, amountMinor: 1800 });
  await saveRate(trip.id, 220000);
  await importTravel(
    JSON.stringify(
      await sealTrip({ ...trip, revision: 2 }, activation.keyring),
    ),
  );
  const saved = (await restoreSession())!.record.personal!;
  expect(saved.expenses).toHaveLength(1);
  expect(expenseTotals(saved).estimatedTwd).toBe(39600);
  await deleteExpense(trip.id, expense.id);
  expect((await restoreSession())!.record.personal!.expenses).toHaveLength(0);
});

it("備份沒有明文，預覽不變更，確認恢復才取代個人資料", async () => {
  const activation = await createActivation(
    trip.id,
    "public-test-password-only",
  );
  await importTravel(
    JSON.stringify(await sealTrip(trip, activation.keyring)),
    JSON.stringify(activation.file),
  );
  await saveExpense(trip.id, expense);
  await setChecked(trip.id, "passport", true);
  const backup = await exportPersonalBackup();
  expect(backup).not.toContain("午餐");
  expect(backup).not.toContain("public-test-password-only");
  await deleteExpense(trip.id, expense.id);
  expect((await previewPersonalBackup(backup)).personal.expenses).toHaveLength(
    1,
  );
  expect((await restoreSession())!.record.personal!.expenses).toHaveLength(0);
  await restorePersonalBackup(backup);
  expect((await restoreSession())!.record.personal!.expenses).toHaveLength(1);
  expect((await restoreSession())!.record.checked.passport).toBe(true);
});

it("遭修改的備份與其他設定無法覆蓋有效個人資料", async () => {
  const activation = await createActivation(
    trip.id,
    "public-test-password-only",
  );
  await importTravel(
    JSON.stringify(await sealTrip(trip, activation.keyring)),
    JSON.stringify(activation.file),
  );
  await saveExpense(trip.id, expense);
  const backup = await exportPersonalBackup();
  const damaged = JSON.parse(backup);
  damaged.ciphertext = "invalid";
  await expect(
    restorePersonalBackup(JSON.stringify(damaged)),
  ).rejects.toThrow();
  expect((await restoreSession())!.record.personal!.expenses).toHaveLength(1);
  const wrong = await createActivation(trip.id, "another-public-test-password");
  await expect(openBackup(backup, wrong.keyring)).rejects.toThrow("不相符");
});

it("舊設定仍可閱讀與記帳，但不誤用旅遊包金鑰當備份金鑰", async () => {
  const activation = await createActivation(trip.id);
  await importTravel(
    JSON.stringify(await sealTrip(trip, activation.keyring)),
    JSON.stringify(activation.file),
  );
  expect((await restoreSession())!.record.personal).toEqual(emptyPersonal());
  await expect(exportPersonalBackup()).rejects.toThrow("備份金鑰");
});
