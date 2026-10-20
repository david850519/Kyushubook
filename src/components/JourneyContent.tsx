import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  ChevronDown,
  Navigation,
} from "lucide-react";
import type { Trip } from "../lib/travel";
import {
  dayHighlights,
  dayTitle,
  excerpt,
  journeyPlaces,
  meaningfulText,
  needsConfirmation,
} from "../lib/tripPresentation";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T12:00:00+09:00`));
}

export function JourneyOverview({
  trip,
  onSelect,
}: {
  trip: Trip;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="journey-overview">
      <div className="section-heading">
        <h2>旅程的每一天</h2>
      </div>
      <div className="journey-days">
        {trip.days.map((day, index) => {
          const stay = journeyPlaces(trip, index).find(
            (place) => place.category === "住宿",
          );
          return (
            <button
              className="day-row"
              key={day.id}
              onClick={() => onSelect(index)}
            >
              <span className="day-number">
                <small>DAY</small>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="day-title">
                <small>{dateLabel(day.date)}</small>
                <strong title={day.title}>{dayTitle(day)}</strong>
                <span className="day-highlights">
                  {dayHighlights(day).join(" · ")}
                </span>
                {stay && (
                  <span className="day-stay">
                    <BedDouble size={12} />
                    <span>
                      {stay.name}
                      {stay.period === "續住" ? " · 續住" : ""}
                    </span>
                  </span>
                )}
              </span>
              <span className="day-row-action" aria-hidden="true">
                <img
                  src={`${import.meta.env.BASE_URL}illustrations/${index === 0 || index === trip.days.length - 1 ? "plane.png" : index % 2 ? "camera.png" : "leaves.png"}`}
                  alt=""
                  width="40"
                  height="36"
                />
                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function JourneyDay({
  trip,
  index,
  onSelect,
}: {
  trip: Trip;
  index: number;
  onSelect: (index: number) => void;
}) {
  const [filter, setFilter] = useState("all");
  const day = trip.days[index];
  const allPlaces = journeyPlaces(trip, index);
  const places = allPlaces.filter((place) => {
    if (filter === "food") return /餐飲|預約/.test(place.category);
    if (filter === "stays") return /住宿|交通|租車/.test(place.category);
    if (filter === "sights")
      return !/餐飲|預約|住宿|交通|租車/.test(place.category);
    return true;
  });
  return (
    <section className="day-content">
      <div className="section-heading">
        <h2>今日散策</h2>
        <span>{dateLabel(day.date)}</span>
      </div>
      {day.places.length > 5 && (
        <div className="reading-tabs" role="group" aria-label="停留類型">
          {[
            ["all", "全部"],
            ["sights", "風景"],
            ["food", "食光"],
            ["stays", "移動與住宿"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <ol className="timeline reading-timeline">
        {places.map((place) => {
          const originalIndex = allPlaces.indexOf(place);
          const english = meaningfulText(place.english);
          const address = meaningfulText(place.address);
          const summary = excerpt(place.description);
          const time = /^\d{1,2}:\d{2}/.test(place.period) ? place.period : "";
          const pending = needsConfirmation(`${place.period} ${place.name}`);
          return (
            <li key={place.id}>
              <div className="timeline-marker">
                {String(originalIndex + 1).padStart(2, "0")}
              </div>
              <div className="place-body">
                <div className="place-meta">
                  <span>{place.category}</span>
                  {(time || place.period === "續住") && (
                    <time>{time || "續住"}</time>
                  )}
                  {pending && <span className="confirmation-mark">待確認</span>}
                  {place.period === "依當日開放" && (
                    <span className="confirmation-mark">當日管制</span>
                  )}
                </div>
                <div className="place-heading">
                  <h3>{place.name}</h3>
                  <a
                    className="map-link icon-button"
                    aria-label="開啟地圖"
                    title={`在 Google 地圖查看${place.name}`}
                    href={
                      place.mapUrl ??
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${address}`.trim())}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={18} />
                  </a>
                </div>
                {english && <p className="place-english">{english}</p>}
                {summary && <p className="place-excerpt">{summary}</p>}
                <details className="reading-details">
                  <summary>
                    景點資訊
                    <ChevronDown size={14} />
                  </summary>
                  <div className="reading-details-body">
                    <p>{place.description}</p>
                    {place.note && <p className="place-note">{place.note}</p>}
                    {address && <p className="place-address">{address}</p>}
                    {place.period !== "彈性" && (
                      <p className="place-address">{place.period}</p>
                    )}
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
      {!places.length && <p className="empty-message">這一天沒有這類停留。</p>}
      <div className="day-pagination">
        <button
          disabled={index === 0}
          onClick={() => onSelect(index - 1)}
          aria-label="前一天"
        >
          <ArrowLeft size={16} />
          <span>{trip.days[index - 1]?.title ?? "第一天"}</span>
        </button>
        <button
          disabled={index === trip.days.length - 1}
          onClick={() => onSelect(index + 1)}
          aria-label="後一天"
        >
          <span>{trip.days[index + 1]?.title ?? "最後一天"}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
