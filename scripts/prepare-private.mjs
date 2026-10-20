import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MAX_TRIP_BYTES, toBase64, validateTrip } from "../src/lib/travel.ts";

const directory = fileURLToPath(new URL("../private/", import.meta.url));
const source = validateTrip(
  JSON.parse(await readFile(`${directory}/source-trip.json`, "utf8")),
);
const original = new Uint8Array(
  await readFile(new URL("../../九州小書v1.pdf", import.meta.url)),
);
if (original.byteLength > 30 * 1024 * 1024)
  throw new Error("Original PDF exceeds the local attachment limit.");
const assetId = "original-book";
const content = validateTrip({
  ...source,
  demo: false,
  assets: [
    ...source.assets.filter((asset) => asset.id !== assetId),
    {
      id: assetId,
      name: "九州小書v1.pdf",
      mime: "application/pdf",
      data: toBase64(original),
    },
  ],
  documents: [
    ...source.documents.filter((item) => item.id !== "original-book-reference"),
    {
      id: "original-book-reference",
      title: "九州小書v1.pdf",
      kind: "原始小書",
      detail: "原稿完整內容；日期或資訊有疑義時請參照原頁。",
      assetId,
    },
  ],
});
const text = JSON.stringify(content);
if (new TextEncoder().encode(text).byteLength > MAX_TRIP_BYTES)
  throw new Error("Prepared private source exceeds package limits.");
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/ready-trip.json`, text, { mode: 0o600 });
console.log(
  `PASS: private ready-trip.json generated locally (${content.days.length} days, ${content.days.reduce((count, day) => count + day.places.length, 0)} places, original PDF attached). No keys, passphrase or public assets generated.`,
);
