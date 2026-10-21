import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  FileText,
  Image,
  Plane,
  Ticket,
  Wifi,
} from "lucide-react";
import type { TravelAsset, Trip } from "../lib/travel";
import {
  documentGroup,
  documentTitle,
  excerpt,
  flightInfo,
  isOriginalBook,
  needsConfirmation,
  type DocumentGroup,
} from "../lib/tripPresentation";

const groups: { id: Exclude<DocumentGroup, "notes">; label: string }[] = [
  { id: "transport", label: "交通與移動" },
  { id: "stays", label: "住宿手帖" },
  { id: "bookings", label: "餐桌預約" },
  { id: "files", label: "隨身檔案" },
];

export default function TripDocuments({
  trip,
  onOpen,
}: {
  trip: Trip;
  onOpen: (asset: TravelAsset) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [esimOpen, setEsimOpen] = useState(false);
  const esimDocuments = trip.documents.filter(
    (document) => document.assetId && /esim/i.test(document.title),
  );
  const esimImages = esimDocuments.filter((document) =>
    trip.assets.some(
      (asset) =>
        asset.id === document.assetId && asset.mime.startsWith("image/"),
    ),
  );
  const originalBooks = trip.documents.filter(
    (document) => document.assetId && isOriginalBook(document),
  );
  const featured = trip.documents.filter(
    (document) =>
      document.assetId &&
      (isOriginalBook(document) ||
        (esimImages.length === 0 && document === esimDocuments[0])),
  );
  const notes = trip.documents.filter(
    (document) => documentGroup(document) === "notes",
  );
  function openAsset(assetId: string) {
    const asset = trip.assets.find((item) => item.id === assetId);
    if (asset) onOpen(asset);
  }
  return (
    <section className="documents-section travel-wallet">
      {!!(originalBooks.length || esimDocuments.length) && (
        <div className="wallet-shortcuts">
          {originalBooks.map((document) => {
            return (
              <button
                className="wallet-shortcut"
                key={document.id}
                onClick={() => openAsset(document.assetId!)}
                aria-label="閱讀原始小書"
              >
                <BookOpen size={24} strokeWidth={1.4} />
                <span>
                  <strong>旅遊小書</strong>
                  <small>THE ORIGINAL BOOK</small>
                </span>
                <ArrowRight size={16} />
              </button>
            );
          })}
          {!!esimDocuments.length && (
            <button
              className="wallet-shortcut"
              aria-label="查看 eSIM 憑證"
              aria-expanded={esimImages.length ? esimOpen : undefined}
              aria-controls={esimImages.length ? "esim-credentials" : undefined}
              onClick={() =>
                esimImages.length
                  ? setEsimOpen(!esimOpen)
                  : openAsset(esimDocuments[0].assetId!)
              }
            >
              <Wifi size={24} strokeWidth={1.4} />
              <span>
                <strong>eSIM 憑證</strong>
                <small>STAY CONNECTED</small>
              </span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {esimOpen && esimImages.length > 0 && (
        <section
          className="esim-credentials"
          id="esim-credentials"
          aria-label="eSIM 圖片憑證"
        >
          {esimImages.map((document) => (
            <button
              key={document.id}
              className="esim-credential"
              onClick={() => openAsset(document.assetId!)}
              aria-label={`查看${document.title}`}
            >
              <Image size={22} strokeWidth={1.4} />
              <span>{document.title}</span>
              <ArrowRight size={16} />
            </button>
          ))}
        </section>
      )}
      <div
        className="reading-tabs wallet-tabs"
        role="group"
        aria-label="旅務分類"
      >
        {[
          ["all", "全部"],
          ["transport", "交通"],
          ["stays", "住宿"],
          ["bookings", "預約"],
          ["files", "檔案"],
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
      {groups
        .filter((group) => filter === "all" || group.id === filter)
        .map((group) => {
          const documents = trip.documents.filter(
            (document) =>
              (filter === "files"
                ? !!document.assetId
                : documentGroup(document) === group.id) &&
              !featured.includes(document),
          );
          if (!documents.length) return null;
          return (
            <section className="wallet-group" key={group.id}>
              <div className="section-heading">
                <h2>{group.label}</h2>
                <span>{String(documents.length).padStart(2, "0")}</span>
              </div>
              <div
                className={`wallet-items ${group.id === "files" ? "wallet-files" : ""}`}
              >
                {documents.map((document) => {
                  const flight = flightInfo(document);
                  const pending =
                    needsConfirmation(document.title) ||
                    /不完全一致|日期衝突/.test(document.detail);
                  return (
                    <article
                      className={`document-entry wallet-entry ${flight ? "flight-entry" : ""}`}
                      key={document.id}
                    >
                      <div className="wallet-entry-heading">
                        <span className="small-label">
                          {flight ? (
                            <>
                              <Plane size={14} /> {flight.number}
                            </>
                          ) : (
                            document.kind
                          )}
                        </span>
                        {pending && (
                          <span className="confirmation-mark">待核對</span>
                        )}
                        {flight?.date && <time>{flight.date}</time>}
                      </div>
                      <h2>{documentTitle(document)}</h2>
                      {flight ? (
                        <div className="flight-route">
                          <div>
                            <strong>{flight.departure.time}</strong>
                            <span>{flight.departure.airport}</span>
                          </div>
                          <div className="flight-connection">
                            <span />
                            <Plane size={18} />
                            <span />
                          </div>
                          <div>
                            <strong>{flight.arrival.time}</strong>
                            <span>{flight.arrival.airport}</span>
                          </div>
                        </div>
                      ) : (
                        document.detail && (
                          <p className="document-excerpt">
                            {excerpt(document.detail, 60)}
                          </p>
                        )
                      )}
                      {document.assetId && (
                        <button
                          className="attachment-button"
                          onClick={() => openAsset(document.assetId!)}
                        >
                          <FileText size={17} />
                          查看附件
                          <ArrowRight size={15} />
                        </button>
                      )}
                      {(document.detail || document.reference) && (
                        <details className="reading-details document-details">
                          <summary>
                            詳細資訊
                            <ChevronDown size={14} />
                          </summary>
                          <div className="reading-details-body">
                            <p>{document.detail}</p>
                            {document.reference && (
                              <p className="reference-line">
                                {document.reference}
                              </p>
                            )}
                          </div>
                        </details>
                      )}
                      {!document.detail && !document.assetId && (
                        <Ticket size={18} />
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      {!!notes.length && (
        <details className="source-notes reading-details">
          <summary>
            旅途筆記
            <ChevronDown size={15} />
          </summary>
          <div className="reading-details-body">
            {notes.map((document) => (
              <section key={document.id}>
                <h3>{document.title}</h3>
                <p>{document.detail}</p>
                {document.reference && <p>{document.reference}</p>}
              </section>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
