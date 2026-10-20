import type { Trip } from "./travel";

type Day = Trip["days"][number];
type Document = Trip["documents"][number];
export type DocumentGroup =
  | "transport"
  | "stays"
  | "bookings"
  | "files"
  | "notes";

export function isOriginalBook(document: Document) {
  return document.kind === "原始小書" || /小書v\d+\.pdf$/i.test(document.title);
}

export function meaningfulText(value?: string) {
  const text = value?.trim() ?? "";
  return /^(?:原稿未提供.*|請參閱原稿|未提供|未載|待確認|無)$/.test(text)
    ? ""
    : text;
}

export function excerpt(value: string, limit = 56) {
  const text =
    meaningfulText(value)
      .split(/[。！？\n]/)[0]
      ?.trim() ?? "";
  if (/^(?:原稿僅列|原稿未提供|請參閱)/.test(text)) return "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function dayHighlights(day: Day) {
  const sightseeing = day.places.filter(
    (place) => !/餐飲|住宿|交通|租車|預約/.test(place.category),
  );
  return (sightseeing.length ? sightseeing : day.places)
    .slice(0, 3)
    .map((place) => place.name);
}

export function dayTitle(day: Day) {
  const regions = day.title.split("・");
  return day.title.length > 14 && regions.length > 2
    ? `${regions[0]}・${regions.at(-1)}`
    : day.title;
}

export function documentGroup(document: Document): DocumentGroup {
  if (/原稿校對|原稿參考|附件待加入/.test(document.kind)) return "notes";
  const label = `${document.kind} ${document.title}`;
  if (/航班|機票|租車/.test(label)) return "transport";
  if (/住宿/.test(label)) return "stays";
  if (/預約|確認單|\d{2}_\d{2}\(JST\)/.test(label)) return "bookings";
  return "files";
}

export function documentTitle(document: Document) {
  return document.title
    .replace(/\.pdf$/i, "")
    .replace(/^\d{4}_\d{2}_\d{2}\([^)]*\)\s*\d{2}_\d{2}\(JST\)\s*/, "")
    .split(/[：]/)[0];
}

export function flightInfo(document: Document) {
  if (document.kind !== "航班") return null;
  const number = document.detail.match(/\bIT\s?\d{2,4}\b/)?.[0];
  const stops = Array.from(
    document.detail.matchAll(
      /\b([A-Z]{3})(?:\s+Terminal\s*\d+)?\s*(\d{1,2}:\d{2})/g,
    ),
  );
  if (!number || stops.length < 2) return null;
  return {
    number,
    date: document.detail.match(/\d{4}\/\d{2}\/\d{2}/)?.[0] ?? "",
    departure: { airport: stops[0][1], time: stops[0][2] },
    arrival: { airport: stops[1][1], time: stops[1][2] },
  };
}

export function needsConfirmation(value: string) {
  return /待確認|待核對|日期衝突|不完全一致|未預約|不列已確認/.test(value);
}
