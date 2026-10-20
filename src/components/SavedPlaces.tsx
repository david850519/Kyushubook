import { useState } from "react";
import {
  Bookmark,
  ExternalLink,
  MapPin,
  Navigation,
  Search,
  X,
} from "lucide-react";
import type { Trip } from "../lib/travel";

const regionOrder = [
  "熊本",
  "阿蘇",
  "高千穗",
  "九重・久住",
  "黑川溫泉",
  "由布院",
  "別府",
  "大分",
  "北九州",
  "福岡",
  "太宰府",
  "糸島",
  "佐賀",
  "唐津",
  "嬉野",
  "長崎",
  "佐世保",
  "宮崎",
  "待分類",
];

export default function SavedPlaces({
  trip,
  onImport,
}: {
  trip: Trip;
  onImport: () => void;
}) {
  const [region, setRegion] = useState("全部");
  const [query, setQuery] = useState("");
  const list = trip.placeList;
  if (!list?.places.length)
    return (
      <section className="saved-empty">
        <Bookmark size={36} strokeWidth={1.2} />
        <h2>想去的地方</h2>
        <p>收藏名單尚未匯入</p>
        <button className="secondary-button" onClick={onImport}>
          匯入旅遊包
        </button>
      </section>
    );
  const regions = Array.from(
    new Set(list.places.map((place) => place.region)),
  ).sort((left, right) => {
    const leftIndex = regionOrder.indexOf(left);
    const rightIndex = regionOrder.indexOf(right);
    return (
      (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) ||
      left.localeCompare(right, "zh-Hant")
    );
  });
  const selected = list.places.filter(
    (place) =>
      (region === "全部" || region === place.region) &&
      `${place.name} ${place.address} ${place.note ?? ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section className="saved-places">
      <div className="saved-tools">
        <span>{list.places.length} PLACES</span>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="搜尋收藏地點"
            placeholder="店名、地址"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="search-clear"
              title="清除收藏搜尋"
              aria-label="清除收藏搜尋"
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="saved-regions" role="group" aria-label="收藏地區">
        {["全部", ...regions].map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={region === value}
            onClick={() => {
              setRegion(value);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          >
            {value}
            <span>
              {value === "全部"
                ? list.places.length
                : list.places.filter((place) => place.region === value).length}
            </span>
          </button>
        ))}
      </div>
      {!selected.length && (
        <p className="empty-message">沒有符合的收藏地點。</p>
      )}
      {regions
        .filter((value) => selected.some((place) => place.region === value))
        .map((value) => (
          <section className="saved-region" key={value}>
            <div className="section-heading">
              <h2>{value}</h2>
              <span>
                {selected.filter((place) => place.region === value).length}{" "}
                個收藏
              </span>
            </div>
            <div className="saved-place-list">
              {selected
                .filter((place) => place.region === value)
                .map((place) => (
                  <article className="saved-place" key={place.id}>
                    <MapPin size={17} strokeWidth={1.4} aria-hidden="true" />
                    <div>
                      <h3>
                        <a href={place.mapUrl} target="_blank" rel="noreferrer">
                          {place.name}
                        </a>
                      </h3>
                      {place.address && (
                        <p className="saved-address">{place.address}</p>
                      )}
                      {place.note && <p className="saved-note">{place.note}</p>}
                    </div>
                    <a
                      className="icon-button saved-map-link"
                      href={place.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`在 Google 地圖開啟${place.name}`}
                      title={`在 Google 地圖開啟${place.name}`}
                    >
                      <Navigation size={18} />
                    </a>
                  </article>
                ))}
            </div>
          </section>
        ))}
      <a
        className="saved-source"
        href={list.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        <span>{list.title} · Google Maps</span>
        <ExternalLink size={13} />
      </a>
    </section>
  );
}
