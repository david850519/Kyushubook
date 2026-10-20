import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchReferenceRate,
  parseReferenceRate,
  REFERENCE_RATE_URL,
} from "./exchange";

const now = Date.parse("2027-04-12T12:00:00.000Z");
const fixture = {
  result: "success",
  base_code: "JPY",
  time_last_update_unix: Date.parse("2027-04-12T00:00:00.000Z") / 1000,
  time_next_update_unix: Date.parse("2027-04-13T00:00:00.000Z") / 1000,
  rates: { TWD: 0.2134567 },
};
afterEach(() => vi.unstubAllGlobals());

describe("日圓與新臺幣每日參考匯率", () => {
  it("驗證 JPY 基準、精度與來源時間", () => {
    expect(parseReferenceRate(fixture, now)).toMatchObject({
      provider: "ExchangeRate-API",
      rateMicros: 213457,
      updatedAt: "2027-04-12T00:00:00.000Z",
      fetchedAt: "2027-04-12T12:00:00.000Z",
    });
    expect(() =>
      parseReferenceRate({ ...fixture, base_code: "USD" }, now),
    ).toThrow();
    expect(() =>
      parseReferenceRate({ ...fixture, rates: { TWD: -1 } }, now),
    ).toThrow();
    expect(() =>
      parseReferenceRate(
        { ...fixture, time_next_update_unix: fixture.time_last_update_unix },
        now,
      ),
    ).toThrow();
    expect(() => parseReferenceRate(fixture, now - 86400000)).toThrow();
  });
  it("使用尚未到更新時間的本機快取，不重複連線", async () => {
    const quote = {
      ...parseReferenceRate(fixture, now),
      nextUpdateAt: new Date(Date.now() + 3600000).toISOString(),
    };
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await fetchReferenceRate(quote)).toBe(quote);
    expect(request).not.toHaveBeenCalled();
  });
  it("只請求固定匯率端點，省略憑證與旅遊資料", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ...fixture,
            time_last_update_unix: timestamp - 10,
            time_next_update_unix: timestamp + 86400,
          }),
        ),
      );
    vi.stubGlobal("fetch", request);
    expect((await fetchReferenceRate()).rateMicros).toBe(213457);
    expect(request).toHaveBeenCalledWith(
      REFERENCE_RATE_URL,
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
  });
  it("連線失敗或壞資料會拒絕，不提供捏造匯率", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchReferenceRate()).rejects.toThrow("已保留原有設定");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    await expect(fetchReferenceRate()).rejects.toThrow("回應不正確");
  });
});
