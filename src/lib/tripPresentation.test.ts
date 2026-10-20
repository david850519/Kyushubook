import { describe, expect, it } from "vitest";
import {
  dayHighlights,
  dayTitle,
  documentGroup,
  documentTitle,
  excerpt,
  flightInfo,
  isOriginalBook,
  journeyPlaces,
  meaningfulText,
  needsConfirmation,
} from "./tripPresentation";
import type { Trip } from "./travel";

describe("旅行小書的閱讀層級", () => {
  it("本次八天旅程第四天沿用第三天住宿，不改原包或其他日程", () => {
    const hotel = {
      id: "hotel",
      name: "第三天旅宿",
      english: "Example Hotel",
      period: "15:00 入住",
      category: "住宿",
      description: "原始住宿資料",
      address: "示範地址",
      mapUrl: "https://maps.app.goo.gl/example",
    };
    const trip = {
      demo: false,
      days: Array.from({ length: 8 }, (_, index) => ({
        id: `day-${index}`,
        date: `2027-04-${String(12 + index).padStart(2, "0")}`,
        title: "示範日程",
        subtitle: "",
        places: [{ ...hotel, id: `hotel-${index}` }],
      })),
    } as Trip;
    trip.days[3].places[0].name = "原稿第四天住宿待確認";
    expect(journeyPlaces(trip, 3)[0]).toMatchObject({
      id: "hotel-3",
      name: "第三天旅宿",
      period: "續住",
      address: hotel.address,
      mapUrl: hotel.mapUrl,
    });
    expect(trip.days[3].places[0].name).toBe("原稿第四天住宿待確認");
    const corrected = {
      ...trip,
      days: trip.days.map((day, index) => ({
        ...day,
        places: journeyPlaces(trip, index),
      })),
    };
    expect(journeyPlaces(corrected, 3)[0].note).toBe(
      corrected.days[3].places[0].note,
    );
    expect(journeyPlaces(trip, 2)).toBe(trip.days[2].places);
    expect(journeyPlaces({ ...trip, demo: true }, 3)).toBe(trip.days[3].places);
    trip.days[2].places = [];
    expect(journeyPlaces(trip, 3)).toBe(trip.days[3].places);
  });

  it("隱藏缺漏佔位字，將長文縮成摘要而不改原文", () => {
    expect(meaningfulText("原稿未提供英文名稱")).toBe("");
    expect(meaningfulText("請參閱原稿")).toBe("");
    expect(meaningfulText("Kumamoto Castle")).toBe("Kumamoto Castle");
    const original = "山上的展望台。完整資訊保留在原文。";
    expect(excerpt(original)).toBe("山上的展望台");
    expect(original).toBe("山上的展望台。完整資訊保留在原文。");
    expect(needsConfirmation("日期衝突待確認")).toBe(true);
  });

  it("每日總覽只選三個景點，不把住宿與交通串成長句", () => {
    const day = {
      places: [
        { name: "機場", category: "交通" },
        { name: "飯店", category: "住宿" },
        { name: "城", category: "古城" },
        { name: "湖", category: "自然" },
        { name: "公園", category: "公園" },
        { name: "神社", category: "神社" },
      ],
    } as Trip["days"][number];
    expect(dayHighlights(day)).toEqual(["城", "湖", "公園"]);
    expect(day.places).toHaveLength(6);
    const longTitle = {
      ...day,
      title: "很長的風景旅程・溫泉街區・海邊小城・湖畔",
    };
    expect(dayTitle(longTitle)).toBe("很長的風景旅程・湖畔");
    expect(longTitle.title).toBe("很長的風景旅程・溫泉街區・海邊小城・湖畔");
  });

  it("將原稿校對歸入次要資訊，附件標題不顯示檔案格式與日期前綴", () => {
    const document = {
      id: "example",
      title: "2027_04_12(星期一) 18_00(JST) 晚餐.pdf",
      kind: "PDF 附件",
      detail: "",
    };
    expect(documentTitle(document)).toBe("晚餐");
    expect(documentGroup(document)).toBe("bookings");
    expect(documentGroup({ ...document, kind: "原稿校對" })).toBe("notes");
    expect(isOriginalBook({ ...document, title: "九州小書v1.pdf" })).toBe(true);
    expect(isOriginalBook(document)).toBe(false);
    expect(documentGroup({ ...document, title: "住宿.pdf" })).toBe("stays");
    expect(documentGroup({ ...document, title: "機票電子確認單.pdf" })).toBe(
      "transport",
    );
  });

  it("僅從已有文字取得航班、機場與時間，不補造資訊", () => {
    const document = {
      id: "flight",
      title: "示範航班",
      kind: "航班",
      detail: "IT999；2027/04/12 TPE Terminal 1 07:10 → HSG 10:25",
    };
    expect(flightInfo(document)).toEqual({
      number: "IT999",
      date: "2027/04/12",
      departure: { airport: "TPE", time: "07:10" },
      arrival: { airport: "HSG", time: "10:25" },
    });
    expect(flightInfo({ ...document, detail: "時間待確認" })).toBeNull();
  });
});
