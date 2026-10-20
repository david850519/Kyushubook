import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createActivation,
  initialDayIndex,
  MAX_FILE_BYTES,
  MAX_TRIP_BYTES,
  openTrip,
  parseEnvelope,
  sealTrip,
  validateTrip,
  type Trip,
} from "./travel";
import {
  clearTravel,
  importTravel,
  restoreSession,
  setChecked,
} from "./storage";

const fixture: Trip = {
  version: 1,
  id: "sample-trip",
  revision: 1,
  title: "示意旅程",
  subtitle: "無私人資料",
  demo: true,
  days: [
    {
      id: "day-1",
      date: "2027-04-12",
      title: "熊本",
      subtitle: "城下散策",
      places: [
        {
          id: "castle",
          name: "熊本城",
          english: "Kumamoto Castle",
          period: "上午",
          category: "散策",
          description: "示意內容",
          address: "熊本市",
        },
      ],
    },
  ],
  checklist: [{ id: "passport", category: "文件", label: "護照" }],
  documents: [],
  assets: [],
};

beforeEach(async () => {
  await clearTravel();
});

describe("旅遊包與本機持久化", () => {
  it("保留指定地圖網址並拒絕不安全的外部網址", () => {
    const withMap = (mapUrl: string) => ({
      ...fixture,
      days: [
        {
          ...fixture.days[0],
          places: [{ ...fixture.days[0].places[0], mapUrl }],
        },
      ],
    });
    const exact = "https://maps.app.goo.gl/JTzKSeoTQtCim2tP7";
    expect(validateTrip(withMap(exact)).days[0].places[0].mapUrl).toBe(exact);
    for (const unsafe of [
      "javascript:alert(1)",
      "http://www.google.com/maps",
      "https://maps.app.goo.gl.example.com/place",
    ]) {
      expect(() => validateTrip(withMap(unsafe))).toThrow();
    }
  });

  it("以隨機金鑰加密，能解密且儲存的 CryptoKey 不可匯出", async () => {
    const { keyring } = await createActivation(fixture.id);
    const envelope = await sealTrip(fixture, keyring);
    expect(JSON.stringify(envelope)).not.toContain("熊本城");
    expect(await openTrip(envelope, keyring)).toEqual(fixture);
    expect(keyring.key.extractable).toBe(false);
  });

  it("50 MiB 行程能製包並讀回，超過上限仍拒絕", async () => {
    const trip: Trip = {
      ...fixture,
      assets: ["large-1", "large-2"].map((id) => ({
        id,
        name: `${id}.pdf`,
        mime: "application/pdf",
        data: btoa("%PDF-1.7\n"),
      })),
    };
    const initialBytes = new TextEncoder().encode(JSON.stringify(trip)).length;
    const paddingBytes = Math.floor((MAX_TRIP_BYTES - initialBytes) / 4) * 4;
    const firstPadding = Math.floor(paddingBytes / 8) * 4;
    trip.assets[0].data += "A".repeat(firstPadding);
    trip.assets[1].data += "A".repeat(paddingBytes - firstPadding);
    const tripBytes = new TextEncoder().encode(JSON.stringify(trip)).length;
    expect(tripBytes).toBeGreaterThan(MAX_TRIP_BYTES - 4);
    expect(tripBytes).toBeLessThanOrEqual(MAX_TRIP_BYTES);

    const { keyring } = await createActivation(trip.id);
    await expect(
      sealTrip({ ...trip, title: `${trip.title} exceeds-limit` }, keyring),
    ).rejects.toThrow("50 MiB");
    const envelopeText = JSON.stringify(await sealTrip(trip, keyring));
    const envelopeBytes = new TextEncoder().encode(envelopeText).length;
    expect(envelopeBytes).toBeGreaterThan(64 * 1024 * 1024);
    expect(envelopeBytes).toBeLessThan(MAX_FILE_BYTES);
    const restored = await openTrip(parseEnvelope(envelopeText), keyring);
    expect(restored.id).toBe(trip.id);
    expect(restored.assets.map((asset) => asset.data.length)).toEqual(
      trip.assets.map((asset) => asset.data.length),
    );
  }, 60000);

  it("仍拒絕超過 72 MiB 的旅遊包檔案", () => {
    expect(() => parseEnvelope(" ".repeat(MAX_FILE_BYTES + 1))).toThrow(
      "72 MiB",
    );
  });

  it("重啟讀取不需密語，並保留個人勾選", async () => {
    const { file, keyring } = await createActivation(fixture.id);
    const envelope = await sealTrip(fixture, keyring);
    await importTravel(JSON.stringify(envelope), JSON.stringify(file));
    await setChecked(fixture.id, "passport", true);
    const restored = await restoreSession();
    expect(restored?.trip).toEqual(fixture);
    expect(restored?.record.checked.passport).toBe(true);
  });

  it("遭竄改的密文無法取代既有內容與勾選", async () => {
    const { file, keyring } = await createActivation(fixture.id);
    const envelope = await sealTrip(fixture, keyring);
    await importTravel(JSON.stringify(envelope), JSON.stringify(file));
    await setChecked(fixture.id, "passport", true);
    const tampered = {
      ...envelope,
      ciphertext:
        (envelope.ciphertext[0] === "A" ? "B" : "A") +
        envelope.ciphertext.slice(1),
    };
    await expect(importTravel(JSON.stringify(tampered))).rejects.toThrow(
      "無法解密",
    );
    expect((await restoreSession())?.record.checked.passport).toBe(true);
    expect((await restoreSession())?.trip.revision).toBe(1);
  });

  it("錯誤設定檔無法解密原包", async () => {
    const original = await createActivation(fixture.id);
    const wrong = await createActivation(fixture.id);
    await expect(
      openTrip(await sealTrip(fixture, original.keyring), wrong.keyring),
    ).rejects.toThrow("不相符");
  });

  it("更新行程依穩定識別碼保留勾選，拒絕舊版", async () => {
    const { file, keyring } = await createActivation(fixture.id);
    const oldEnvelope = await sealTrip(fixture, keyring);
    await importTravel(JSON.stringify(oldEnvelope), JSON.stringify(file));
    await setChecked(fixture.id, "passport", true);
    const updated = {
      ...fixture,
      revision: 2,
      checklist: [{ ...fixture.checklist[0], label: "護照正本" }],
    };
    await importTravel(JSON.stringify(await sealTrip(updated, keyring)));
    expect((await restoreSession())?.record.checked.passport).toBe(true);
    await expect(importTravel(JSON.stringify(oldEnvelope))).rejects.toThrow(
      "版本較舊",
    );
    expect((await restoreSession())?.trip.revision).toBe(2);
  });

  it("拒絕偽裝 PDF 的可執行內容及遺失附件", () => {
    expect(() =>
      validateTrip({
        ...fixture,
        assets: [
          {
            id: "evil",
            name: "fake.pdf",
            mime: "application/pdf",
            data: btoa("<script>"),
          },
        ],
      }),
    ).toThrow("類型不符");
    expect(() =>
      validateTrip({
        ...fixture,
        documents: [
          {
            id: "missing",
            title: "票券",
            kind: "PDF",
            detail: "",
            assetId: "absent",
          },
        ],
      }),
    ).toThrow("缺少");
  });

  it("當日採日本日期，非旅行日回到總覽", () => {
    expect(initialDayIndex(fixture, new Date("2027-04-11T15:30:00Z"))).toBe(0);
    expect(
      initialDayIndex(fixture, new Date("2027-05-12T00:00:00Z")),
    ).toBeNull();
  });

  it("收藏清單隨旅遊包加密，沿用金鑰更新仍保留勾選", async () => {
    const { file, keyring } = await createActivation(fixture.id);
    await importTravel(
      JSON.stringify(await sealTrip(fixture, keyring)),
      JSON.stringify(file),
    );
    await setChecked(fixture.id, "passport", true);
    const updated: Trip = {
      ...fixture,
      revision: 2,
      placeList: {
        title: "示範收藏",
        sourceUrl: "https://maps.app.goo.gl/example",
        importedAt: "2027-04-01T00:00:00.000Z",
        places: [
          {
            id: "map-1",
            name: "示範咖啡店",
            region: "熊本",
            address: "示範地址",
            mapUrl: "https://www.google.com/maps?cid=123",
            latitude: 32.8,
            longitude: 130.7,
          },
        ],
      },
    };
    const envelopeText = JSON.stringify(await sealTrip(updated, keyring));
    expect(envelopeText).not.toContain("示範咖啡店");
    await importTravel(envelopeText);
    const restored = await restoreSession();
    expect(restored?.trip.placeList).toEqual(updated.placeList);
    expect(restored?.record.checked.passport).toBe(true);
    expect(() =>
      validateTrip({
        ...updated,
        placeList: {
          ...updated.placeList,
          places: [updated.placeList!.places[0], updated.placeList!.places[0]],
        },
      }),
    ).toThrow("重複地點");
    expect(() =>
      validateTrip({
        ...updated,
        placeList: {
          ...updated.placeList,
          places: [
            {
              ...updated.placeList!.places[0],
              mapUrl: "https://example.com/fake-map",
            },
          ],
        },
      }),
    ).toThrow();
  });
});
