import { z } from "zod";
import { referenceRateSchema, type ReferenceRate } from "./personal";

export const REFERENCE_RATE_URL = "https://open.er-api.com/v6/latest/JPY";
const responseSchema = z.object({
  result: z.literal("success"),
  base_code: z.literal("JPY"),
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().positive(),
  rates: z.object({ TWD: z.number().positive().max(10) }),
});

export function parseReferenceRate(
  input: unknown,
  now = Date.now(),
): ReferenceRate {
  const result = responseSchema.safeParse(input);
  if (!result.success) throw new Error("匯率來源回應不正確。");
  const data = result.data;
  const updated = data.time_last_update_unix * 1000;
  const next = data.time_next_update_unix * 1000;
  if (updated > now + 300000 || next <= updated || next - updated > 172800000)
    throw new Error("匯率來源的更新時間不正確。");
  return referenceRateSchema.parse({
    provider: "ExchangeRate-API",
    rateMicros: Math.round(data.rates.TWD * 1000000),
    updatedAt: new Date(updated).toISOString(),
    nextUpdateAt: new Date(next).toISOString(),
    fetchedAt: new Date(now).toISOString(),
  });
}

export async function fetchReferenceRate(
  previous?: ReferenceRate,
): Promise<ReferenceRate> {
  if (previous && Date.parse(previous.nextUpdateAt) > Date.now())
    return previous;
  let response: Response;
  try {
    response = await fetch(REFERENCE_RATE_URL, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("目前無法更新匯率，已保留原有設定。");
  }
  if (!response.ok) throw new Error("匯率來源暫時無法使用，已保留原有設定。");
  const text = await response.text();
  if (text.length > 262144) throw new Error("匯率來源回應不正確。");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("匯率來源回應不正確。");
  }
  return parseReferenceRate(data);
}
