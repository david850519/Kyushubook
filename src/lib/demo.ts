import { createActivation, sealTrip, toBase64, type Trip } from "./travel";

export const DEMO_REVISION = 4;

let kitPromise: Promise<{ settings: string; package: string }> | undefined;

export function getDemoKit() {
  kitPromise ??= makeDemoKit().catch((error: unknown) => {
    kitPromise = undefined;
    throw error;
  });
  return kitPromise;
}

async function makeDemoKit() {
  const base = import.meta.env.BASE_URL;
  const [photo, pdf] = await Promise.all(
    ["kumamoto.jpg", "sample-ticket.pdf"].map(async (name) => {
      const response = await fetch(`${base}demo/${name}`);
      if (!response.ok) throw new Error("示範附件尚未備妥，請連線後重試。");
      return toBase64(new Uint8Array(await response.arrayBuffer()));
    }),
  );
  const trip: Trip = {
    version: 1,
    id: "kyushu-demo",
    revision: DEMO_REVISION,
    title: "晨萱九州遊",
    subtitle: "熊本的一日散策",
    demo: true,
    days: [
      {
        id: "kumamoto-day",
        date: "2027-04-12",
        title: "熊本",
        subtitle: "城下散策，慢慢走。",
        heroId: "castle-photo",
        places: [
          {
            id: "kumamoto-castle",
            name: "熊本城",
            english: "Kumamoto Castle",
            period: "上午",
            category: "城郭散策",
            address: "熊本県熊本市中央区本丸1-1",
            mapUrl: "https://maps.app.goo.gl/JTzKSeoTQtCim2tP7",
            description:
              "從石垣旁的小徑開始，抬頭看見黑白相間的天守。把第一個上午留給城下的風景，不必急著趕路。",
            note: "開放範圍與參觀時間，以當日官方公告為準。",
          },
          {
            id: "josaien",
            name: "櫻之馬場・城彩苑",
            english: "Sakura-no-baba Josaien",
            period: "午間",
            category: "午餐與小店",
            address: "熊本県熊本市中央区二の丸1-1",
            mapUrl: "https://www.google.com/maps?cid=4335317393072890667",
            description:
              "沿著城下町的小店散步，找一份喜歡的午餐，再留點胃口給沿路的甜點。",
          },
          {
            id: "suizenji",
            name: "水前寺成趣園",
            english: "Suizenji Jojuen",
            period: "午後",
            category: "庭園散策",
            address: "熊本県熊本市中央区水前寺公園8-1",
            mapUrl: "https://www.google.com/maps?cid=8430181699338578675",
            description:
              "走進池泉與綠意之間，在池畔停一下，替這一天留一段安靜的時間。",
            note: "出發前確認營業與最後入園時間。",
          },
        ],
      },
    ],
    checklist: [
      { id: "passport", category: "重要文件", label: "護照正本" },
      { id: "driving-license", category: "重要文件", label: "駕照與日文譯本" },
      { id: "insurance", category: "重要文件", label: "旅遊保險資料" },
      { id: "cash", category: "隨身物品", label: "日圓現金與信用卡" },
      { id: "medicine", category: "隨身物品", label: "常備藥品" },
      { id: "umbrella", category: "隨身物品", label: "折傘" },
      { id: "charger", category: "3C 配備", label: "充電器與充電線" },
      { id: "power-bank", category: "3C 配備", label: "行動電源" },
      { id: "internet", category: "3C 配備", label: "行動網路方案" },
    ],
    documents: [
      {
        id: "ticket",
        title: "示範票券",
        kind: "PDF 附件",
        detail: "2027.04.12 · 2 人\n示意文件，非有效票券",
        reference: "DEMO-ONLY",
        assetId: "sample-pdf",
      },
      {
        id: "stay",
        title: "住宿資料示意",
        kind: "住宿",
        detail: "入住 15:00 ／ 退房 10:00\n僅為版面示意，無真實訂房資料",
        reference: "DEMO-STAY",
      },
      {
        id: "rental",
        title: "租還車資料示意",
        kind: "租車",
        detail: "取車與還車時間待實際資料匯入\n此頁不含真實預約資訊",
      },
    ],
    assets: [
      { id: "castle-photo", name: "熊本城", mime: "image/jpeg", data: photo },
      {
        id: "sample-pdf",
        name: "示範票券.pdf",
        mime: "application/pdf",
        data: pdf,
      },
    ],
  };
  const { file, keyring } = await createActivation(
    trip.id,
    "public-sample-only-not-a-real-password",
  );
  return {
    settings: JSON.stringify(file),
    package: JSON.stringify(await sealTrip(trip, keyring)),
  };
}
