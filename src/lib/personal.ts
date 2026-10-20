import { z } from "zod";
import { fromBase64, MAX_FILE_BYTES, toBase64, type Keyring } from "./travel";

export const expenseCategories = [
  "餐飲",
  "交通",
  "住宿",
  "門票",
  "購物",
  "其他",
] as const;
export const expenseSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().trim().min(1, "請填寫項目名稱。").max(80),
  amountMinor: z.number().int().positive().max(100000000),
  currency: z.enum(["JPY", "TWD"]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) =>
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value,
    ),
  category: z.enum(expenseCategories),
  note: z.string().max(300),
});
export const personalSchema = z.object({
  expenses: z
    .array(expenseSchema)
    .max(10000)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
    ),
  rateMicros: z.number().int().min(1).max(10000000).nullable(),
});
export type Expense = z.infer<typeof expenseSchema>;
export type PersonalState = z.infer<typeof personalSchema>;
export const emptyPersonal = (): PersonalState => ({
  expenses: [],
  rateMicros: null,
});

const backupDataSchema = z.object({
  version: z.literal(1),
  tripId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  createdAt: z.string().datetime(),
  checked: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.boolean()),
  personal: personalSchema,
});
const backupEnvelopeSchema = z.object({
  format: z.literal("kyushu-backup"),
  version: z.literal(1),
  tripId: z.string().max(80),
  keyId: z.string().max(80),
  iv: z.string().max(40),
  ciphertext: z.string().max(MAX_FILE_BYTES),
});
export type BackupData = z.infer<typeof backupDataSchema>;

export function parseAmount(
  value: string,
  currency: Expense["currency"],
): number {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match || (currency === "JPY" && match[2]))
    throw new Error(
      currency === "JPY" ? "日圓金額請填正整數。" : "金額最多兩位小數。",
    );
  const amount =
    Number(match[1]) * (currency === "TWD" ? 100 : 1) +
    (currency === "TWD" ? Number((match[2] ?? "").padEnd(2, "0")) : 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)
    throw new Error("金額超出可記錄範圍。");
  return amount;
}

export function parseRate(value: string): number {
  const match = /^(\d{1,2})(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) throw new Error("參考匯率最多六位小數。");
  const rate =
    Number(match[1]) * 1000000 + Number((match[2] ?? "").padEnd(6, "0"));
  if (rate < 1 || rate > 10000000)
    throw new Error("請填寫大於 0、且不超過 10 的參考匯率。");
  return rate;
}

export function convertMinor(
  amountMinor: number,
  source: Expense["currency"],
  rateMicros: number,
): number {
  return source === "JPY"
    ? Math.round((amountMinor * rateMicros) / 10000)
    : Math.round((amountMinor * 10000) / rateMicros);
}

export function expenseTotals(state: PersonalState) {
  const jpy = state.expenses
    .filter((entry) => entry.currency === "JPY")
    .reduce((total, entry) => total + entry.amountMinor, 0);
  const twd = state.expenses
    .filter((entry) => entry.currency === "TWD")
    .reduce((total, entry) => total + entry.amountMinor, 0);
  return {
    jpy,
    twd,
    estimatedTwd: state.rateMicros
      ? twd + convertMinor(jpy, "JPY", state.rateMicros)
      : null,
  };
}

export function formatMoney(
  amountMinor: number,
  currency: Expense["currency"],
): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amountMinor / (currency === "TWD" ? 100 : 1));
}

function backupAuth(tripId: string, keyId: string) {
  return new TextEncoder().encode(
    JSON.stringify({ format: "kyushu-backup", version: 1, tripId, keyId }),
  );
}

export async function sealBackup(
  input: BackupData,
  keyring: Keyring,
): Promise<string> {
  if (!keyring.backup)
    throw new Error("此設定檔尚未包含備份金鑰，請先匯入新版私密設定。");
  const data = backupDataSchema.parse(input);
  if (data.tripId !== keyring.tripId) throw new Error("備份旅程不相符。");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: backupAuth(data.tripId, keyring.backup.keyId),
    },
    keyring.backup.key,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return JSON.stringify({
    format: "kyushu-backup",
    version: 1,
    tripId: data.tripId,
    keyId: keyring.backup.keyId,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(bytes)),
  });
}

export async function openBackup(
  text: string,
  keyring: Keyring,
): Promise<BackupData> {
  if (!keyring.backup) throw new Error("此設定檔尚未包含備份金鑰。");
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error("備份檔過大。");
  let envelope: z.infer<typeof backupEnvelopeSchema>;
  try {
    envelope = backupEnvelopeSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("備份格式或版本不支援。");
  }
  if (
    envelope.tripId !== keyring.tripId ||
    envelope.keyId !== keyring.backup.keyId
  )
    throw new Error("備份與目前的旅程設定不相符。");
  let data: BackupData;
  try {
    const iv = fromBase64(envelope.iv);
    if (iv.length !== 12) throw new Error("invalid iv");
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: backupAuth(envelope.tripId, envelope.keyId),
      },
      keyring.backup.key,
      fromBase64(envelope.ciphertext),
    );
    data = backupDataSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error("備份無法解密或內容損壞，現有資料未變更。");
  }
  if (data.tripId !== keyring.tripId) throw new Error("備份旅程不相符。");
  return data;
}
