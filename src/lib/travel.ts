import { z } from "zod";

export const MAX_FILE_BYTES = 72 * 1024 * 1024;
export const MAX_TRIP_BYTES = 50 * 1024 * 1024;

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const shortText = z.string().min(1).max(240);
const googleMapsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [
        "maps.app.goo.gl",
        "www.google.com",
        "maps.google.com",
        "goo.gl",
      ].includes(url.hostname)
    );
  }, "地圖網址必須是 Google Maps 的 HTTPS 連結");
const assetSchema = z.object({
  id: identifier,
  name: shortText,
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  data: z.string().max(40 * 1024 * 1024),
});

export const tripSchema = z.object({
  version: z.literal(1),
  id: identifier,
  revision: z.number().int().positive(),
  title: shortText,
  subtitle: shortText,
  demo: z.boolean(),
  days: z
    .array(
      z.object({
        id: identifier,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        title: shortText,
        subtitle: shortText,
        heroId: identifier.optional(),
        places: z
          .array(
            z.object({
              id: identifier,
              name: shortText,
              english: shortText,
              period: shortText,
              category: shortText,
              description: z.string().max(2000),
              address: shortText,
              mapUrl: googleMapsUrl.optional(),
              note: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .min(1)
    .max(60),
  checklist: z
    .array(z.object({ id: identifier, category: shortText, label: shortText }))
    .max(500),
  documents: z
    .array(
      z.object({
        id: identifier,
        title: shortText,
        kind: shortText,
        detail: z.string().max(2000),
        assetId: identifier.optional(),
        reference: shortText.optional(),
      }),
    )
    .max(100),
  assets: z.array(assetSchema).max(50),
  placeList: z
    .object({
      title: shortText,
      sourceUrl: googleMapsUrl,
      importedAt: z.string().datetime(),
      places: z
        .array(
          z.object({
            id: identifier,
            name: shortText,
            region: shortText,
            address: z.string().max(1000),
            mapUrl: googleMapsUrl,
            latitude: z.number().min(-90).max(90).optional(),
            longitude: z.number().min(-180).max(180).optional(),
            note: z.string().max(2000).optional(),
          }),
        )
        .max(300),
    })
    .optional(),
});

const activationSchema = z.object({
  format: z.literal("kyushu-settings"),
  version: z.literal(1),
  tripId: identifier,
  keyId: identifier,
  key: z.string().max(100),
  backup: z
    .object({
      keyId: identifier,
      key: z.string().max(100),
      salt: z.string().max(100),
    })
    .optional(),
});

const envelopeSchema = z.object({
  format: z.literal("kyushu-trip"),
  version: z.literal(1),
  tripId: identifier,
  keyId: identifier,
  iv: z.string().max(40),
  ciphertext: z.string().max(MAX_FILE_BYTES),
});

export type Trip = z.infer<typeof tripSchema>;
export type TravelAsset = Trip["assets"][number];
export type ActivationFile = z.infer<typeof activationSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export type Keyring = {
  tripId: string;
  keyId: string;
  key: CryptoKey;
  backup?: { keyId: string; key: CryptoKey };
};

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function readJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error("檔案超過 72 MiB 上限。");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("檔案格式不正確，請選擇設定檔或旅遊包。");
  }
}

export function validateTrip(input: unknown): Trip {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) throw new Error("旅遊內容格式或版本不支援。");
  const trip = parsed.data;
  if (
    trip.placeList &&
    new Set(trip.placeList.places.map((place) => place.id)).size !==
      trip.placeList.places.length
  )
    throw new Error("收藏清單含有重複地點。");
  const assetIds = new Set(trip.assets.map((asset) => asset.id));
  if (
    assetIds.size !== trip.assets.length ||
    new Set(trip.checklist.map((item) => item.id)).size !==
      trip.checklist.length
  ) {
    throw new Error("旅遊包含有重複識別碼。");
  }
  for (const reference of [
    ...trip.days.map((day) => day.heroId),
    ...trip.documents.map((document) => document.assetId),
  ]) {
    if (reference && !assetIds.has(reference))
      throw new Error("旅遊包缺少圖片或附件。");
  }
  for (const asset of trip.assets) {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(asset.data);
    } catch {
      throw new Error("附件編碼不正確。");
    }
    const signature = Array.from(bytes.subarray(0, 12));
    const valid =
      asset.mime === "application/pdf"
        ? String.fromCharCode(...signature.slice(0, 5)) === "%PDF-"
        : asset.mime === "image/jpeg"
          ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
          : asset.mime === "image/png"
            ? signature.slice(0, 8).join() === "137,80,78,71,13,10,26,10"
            : String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
    if (!valid) throw new Error("附件內容與檔案類型不符。");
  }
  return trip;
}

export async function createActivation(
  tripId: string,
  backupPassphrase?: string,
): Promise<{ file: ActivationFile; keyring: Keyring }> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const file: ActivationFile = {
    format: "kyushu-settings",
    version: 1,
    tripId,
    keyId: crypto.randomUUID(),
    key: toBase64(rawKey),
  };
  if (backupPassphrase !== undefined) {
    if (backupPassphrase.length < 12 || backupPassphrase.length > 256)
      throw new Error("備份密語請使用 12～256 個字元。");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(backupPassphrase),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000 },
      material,
      256,
    );
    file.backup = {
      keyId: crypto.randomUUID(),
      key: toBase64(new Uint8Array(derived)),
      salt: toBase64(salt),
    };
  }
  return { file, keyring: await parseActivation(JSON.stringify(file)) };
}

export async function parseActivation(text: string): Promise<Keyring> {
  const parsed = activationSchema.safeParse(readJson(text));
  if (!parsed.success) throw new Error("這不是有效的私密設定檔。");
  const settings = parsed.data;
  let rawKey: ReturnType<typeof fromBase64>;
  try {
    rawKey = fromBase64(settings.key);
  } catch {
    throw new Error("設定檔金鑰不正確。");
  }
  if (rawKey.length !== 32) throw new Error("設定檔金鑰長度不正確。");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  let backup: Keyring["backup"];
  if (settings.backup) {
    let backupBytes: ReturnType<typeof fromBase64>;
    try {
      backupBytes = fromBase64(settings.backup.key);
    } catch {
      throw new Error("備份設定金鑰不正確。");
    }
    if (
      backupBytes.length !== 32 ||
      fromBase64(settings.backup.salt).length !== 16
    )
      throw new Error("備份設定金鑰不正確。");
    backup = {
      keyId: settings.backup.keyId,
      key: await crypto.subtle.importKey("raw", backupBytes, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]),
    };
  }
  return {
    tripId: settings.tripId,
    keyId: settings.keyId,
    key,
    ...(backup ? { backup } : {}),
  };
}

export function parseEnvelope(text: string): Envelope {
  const parsed = envelopeSchema.safeParse(readJson(text));
  if (!parsed.success) throw new Error("這不是有效的加密旅遊包。");
  return parsed.data;
}

function additionalData(tripId: string, keyId: string) {
  return new TextEncoder().encode(
    JSON.stringify({ format: "kyushu-trip", version: 1, tripId, keyId }),
  );
}

export async function sealTrip(
  input: Trip,
  keyring: Keyring,
): Promise<Envelope> {
  const trip = validateTrip(input);
  if (trip.id !== keyring.tripId) throw new Error("設定檔與旅程不相符。");
  const plaintext = new TextEncoder().encode(JSON.stringify(trip));
  if (plaintext.byteLength > MAX_TRIP_BYTES)
    throw new Error("旅遊內容超過 50 MiB 製包上限，請減少或壓縮附件。");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(trip.id, keyring.keyId),
    },
    keyring.key,
    plaintext,
  );
  return {
    format: "kyushu-trip",
    version: 1,
    tripId: trip.id,
    keyId: keyring.keyId,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

export async function openTrip(
  envelope: Envelope,
  keyring: Keyring,
): Promise<Trip> {
  if (envelope.tripId !== keyring.tripId || envelope.keyId !== keyring.keyId)
    throw new Error("設定檔與旅遊包不相符。");
  let decrypted: ArrayBuffer;
  try {
    const iv = fromBase64(envelope.iv);
    if (iv.length !== 12) throw new Error("invalid iv");
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: additionalData(envelope.tripId, envelope.keyId),
      },
      keyring.key,
      fromBase64(envelope.ciphertext),
    );
  } catch {
    throw new Error("旅遊包無法解密，請確認設定檔，或重新取得完整檔案。");
  }
  const trip = validateTrip(readJson(new TextDecoder().decode(decrypted)));
  if (trip.id !== envelope.tripId) throw new Error("旅程識別碼不相符。");
  return trip;
}

export function assetUrl(asset: TravelAsset): string {
  return URL.createObjectURL(
    new Blob([fromBase64(asset.data)], { type: asset.mime }),
  );
}

export function initialDayIndex(trip: Trip, now = new Date()): number | null {
  const japanDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const index = trip.days.findIndex((day) => day.date === japanDate);
  return index < 0 ? null : index;
}
