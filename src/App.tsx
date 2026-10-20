import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileKey2,
  FileText,
  Image,
  LoaderCircle,
  MapPin,
  Navigation,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  Upload,
  WifiOff,
  Wallet,
  X,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { DEMO_REVISION, getDemoKit } from "./lib/demo";
import {
  importTravel,
  clearTravel,
  restoreSession,
  setChecked,
  type TravelSession,
} from "./lib/storage";
import {
  assetUrl,
  initialDayIndex,
  MAX_FILE_BYTES,
  parseActivation,
  type TravelAsset,
} from "./lib/travel";
import { emptyPersonal } from "./lib/personal";
import { downloadText } from "./lib/files";

const DocumentReader = lazy(() => import("./components/DocumentReader"));
const Expenses = lazy(() => import("./components/Expenses"));
const BackupControls = lazy(() => import("./components/BackupControls"));
const illustrationBase = `${import.meta.env.BASE_URL}illustrations/`;
const appName = "晨萱九州遊";
type View = "itinerary" | "documents" | "checklist" | "expenses";
let startup: Promise<TravelSession> | undefined;

function loadSession() {
  startup ??= restoreSession()
    .then(async (restored) => {
      if (
        restored &&
        (!restored.trip.demo ||
          restored.trip.id !== "kyushu-demo" ||
          restored.trip.revision >= DEMO_REVISION)
      )
        return restored;
      const kit = await getDemoKit();
      return importTravel(kit.package, kit.settings);
    })
    .catch((error: unknown) => {
      startup = undefined;
      throw error;
    });
  return startup;
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="關閉"
            title="關閉"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function AssetImage({ asset }: { asset: TravelAsset }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = assetUrl(asset);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [asset]);
  return <img ref={image} alt={asset.name} />;
}

function App() {
  const [session, setSession] = useState<TravelSession | null>(null);
  const [fatal, setFatal] = useState("");
  const [view, setView] = useState<View>("itinerary");
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [reader, setReader] = useState<TravelAsset | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [cached, setCached] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [pendingSettings, setPendingSettings] = useState<string | undefined>();
  const [settingsName, setSettingsName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    let cancelled = false;
    void loadSession()
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded);
          setDayIndex(initialDayIndex(loaded.trip));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFatal(
            error instanceof Error ? error.message : "本機資料無法讀取。",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("caches" in window)
      void caches
        .match(
          new URL(`${import.meta.env.BASE_URL}index.html`, location.origin),
          { ignoreSearch: true },
        )
        .then((response) => setCached(!!response));
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [offlineReady]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function toggleCheck(itemId: string, checked: boolean) {
    if (!session) return;
    const tripId = session.trip.id;
    const previous = !!session.record.checked[itemId];
    setSession((current) =>
      current
        ? {
            ...current,
            record: {
              ...current.record,
              checked: { ...current.record.checked, [itemId]: checked },
            },
          }
        : current,
    );
    try {
      await setChecked(tripId, itemId, checked);
    } catch {
      setSession((current) =>
        current?.trip.id === tripId &&
        current.record.checked[itemId] === checked
          ? {
              ...current,
              record: {
                ...current.record,
                checked: { ...current.record.checked, [itemId]: previous },
              },
            }
          : current,
      );
      setNotice("勾選儲存失敗，請重試。");
    }
  }

  async function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    setImporting(true);
    setImportError("");
    try {
      let settings = pendingSettings;
      let envelope: string | undefined;
      let name = settingsName;
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) throw new Error("檔案超過容量上限。");
        const text = await file.text();
        let data: { format?: string };
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("檔案格式不正確。");
        }
        if (data?.format === "kyushu-settings") {
          await parseActivation(text);
          settings = text;
          name = file.name;
        } else if (data?.format === "kyushu-trip") envelope = text;
        else throw new Error("請選擇私密設定檔或加密旅遊包。");
      }
      if (envelope) {
        const loaded = await importTravel(envelope, settings);
        setSession(loaded);
        setDayIndex(initialDayIndex(loaded.trip));
        setView("itinerary");
        setPendingSettings(undefined);
        setSettingsName("");
        setNotice("旅遊包匯入完成");
      } else {
        setPendingSettings(settings);
        setSettingsName(name);
      }
    } catch (error: unknown) {
      setImportError(
        error instanceof Error ? error.message : "匯入失敗，原有資料已保留。",
      );
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function sampleDownload(kind: "settings" | "package") {
    try {
      const kit = await getDemoKit();
      downloadText(
        kind === "settings" ? "sample-settings.kykey" : "sample-trip.kyushu",
        kit[kind],
      );
    } catch {
      setImportError("示範檔案無法產生，請連線後重試。");
    }
  }

  async function resetLocalData() {
    await clearTravel();
    startup = undefined;
    setSession(null);
    setReader(null);
    setPendingSettings(undefined);
    setSettingsName("");
    setShowSettings(false);
    try {
      const loaded = await loadSession();
      setSession(loaded);
      setDayIndex(initialDayIndex(loaded.trip));
      setView("itinerary");
    } catch {
      setFatal("私人資料已清除；示範內容暫時無法載入，請連線後重開。");
    }
  }

  if (fatal)
    return (
      <main className="loading-screen">
        <ShieldCheck size={36} />
        <h1>本機資料暫時無法開啟</h1>
        <p role="alert">{fatal}</p>
        <button className="primary-button" onClick={() => location.reload()}>
          重新讀取
        </button>
      </main>
    );
  if (!session)
    return (
      <main className="loading-screen">
        <BookOpen size={36} />
        <h1>{appName}</h1>
        <LoaderCircle className="spin" />
        <p>整理行囊中</p>
      </main>
    );

  const { trip, record } = session;
  const tripTitle = trip.title === "九州小書" ? appName : trip.title;
  const selectedDay = dayIndex === null ? null : trip.days[dayIndex];
  const heroDay = selectedDay ?? trip.days[0];
  const hero = trip.assets.find((asset) => asset.id === heroDay.heroId);
  const isOfflineReady = offlineReady || cached;
  const pageLabel =
    view === "itinerary"
      ? selectedDay
        ? `DAY ${String((dayIndex ?? 0) + 1).padStart(2, "0")}`
        : "旅程總覽"
      : view === "documents"
        ? "旅務資料"
        : view === "expenses"
          ? "花費紀錄"
          : "行前準備";
  const listItems = trip.checklist.filter((item) => item.category !== "伴手禮");
  const completed = listItems.filter((item) => record.checked[item.id]).length;
  const visibleItems = listItems.filter(
    (item) => !pendingOnly || !record.checked[item.id],
  );
  const categories = [...new Set(visibleItems.map((item) => item.category))];
  const matches = trip.days.flatMap((day, index) =>
    day.places
      .filter((place) =>
        `${place.name} ${place.english} ${place.address}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
      .map((place) => ({ place, index })),
  );
  const navigationItems = [
    { id: "itinerary" as const, icon: MapPin, label: "行程" },
    { id: "documents" as const, icon: Ticket, label: "旅務" },
    { id: "checklist" as const, icon: ClipboardList, label: "清單" },
    { id: "expenses" as const, icon: Wallet, label: "花費" },
  ];

  return (
    <div className="app-shell">
      <aside className="desktop-rail">
        <div className="rail-brand">
          <span>KYUSHU TRAVEL NOTES</span>
          <img
            className="rail-logo"
            src={`${illustrationBase}title.png`}
            alt="九州"
            width="170"
            height="121"
          />
          <p className="rail-caption">{appName}</p>
        </div>
        <div className="rail-divider" />
        <nav aria-label="桌面主要導覽">
          {navigationItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`rail-link ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => {
                setView(id);
                setSearch("");
              }}
            >
              <Icon size={19} />
              {label}
              <ChevronRight size={15} />
            </button>
          ))}
        </nav>
        <div className="rail-footer">
          <span className="small-label">A LITTLE JOURNEY</span>
          <p>兩個人的九州時光</p>
          <span className="rail-edition">
            {trip.demo ? "示範旅程" : `旅程版本 ${trip.revision}`}
          </span>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-header">
          <button
            className="mobile-brand"
            onClick={() => {
              setView("itinerary");
              setDayIndex(null);
              setSearch("");
            }}
            aria-label={`${appName}旅程總覽`}
          >
            <img
              className="mobile-logo"
              src={`${illustrationBase}title.png`}
              alt=""
              width="65"
              height="46"
            />
            <span>{appName}</span>
          </button>
          <span className="desktop-breadcrumb">
            {appName} <ChevronRight size={13} /> {pageLabel}
          </span>
          <div className="header-actions">
            {trip.demo && <span className="demo-badge">示範</span>}
            <button
              className="icon-button"
              aria-label="設定與匯入"
              title="設定與匯入"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">KYUSHU / {pageLabel}</p>
              <h1>
                {view === "itinerary"
                  ? (selectedDay?.title ?? tripTitle)
                  : view === "documents"
                    ? "旅務資料"
                    : view === "expenses"
                      ? "花費紀錄"
                      : "行前準備"}
              </h1>
              <p className="page-subtitle">
                {view === "itinerary"
                  ? (selectedDay?.subtitle ?? trip.subtitle)
                  : view === "documents"
                    ? "交通・住宿・隨身票券"
                    : view === "expenses"
                      ? "日圓・新臺幣"
                      : "行囊輕一點，準備剛剛好。"}
              </p>
            </div>
            <span className={`offline-pill ${isOfflineReady ? "ready" : ""}`}>
              {!online ? (
                <WifiOff size={14} />
              ) : isOfflineReady ? (
                <CheckCheck size={14} />
              ) : (
                <LoaderCircle size={14} className="spin" />
              )}
              {!online
                ? "離線中"
                : isOfflineReady
                  ? "離線已備妥"
                  : import.meta.env.DEV
                    ? "開發預覽"
                    : "離線準備中"}
            </span>
            <img
              className={`heading-illustration ${view === "checklist" ? "illustration-suitcase" : "illustration-road"}`}
              src={`${illustrationBase}${view === "checklist" ? "suitcase.png" : "road-trip.png"}`}
              alt=""
              aria-hidden="true"
              width={view === "checklist" ? 130 : 560}
              height={view === "checklist" ? 179 : 190}
            />
          </div>

          {view === "itinerary" && (
            <>
              <div className="trip-tools">
                {selectedDay ? (
                  <button
                    className="text-button"
                    onClick={() => setDayIndex(null)}
                  >
                    <ArrowLeft size={16} />
                    旅程總覽
                  </button>
                ) : (
                  <span className="trip-count">
                    {trip.days.length} DAY{trip.days.length > 1 ? "S" : ""}
                    <span />
                    {trip.days.reduce(
                      (total, day) => total + day.places.length,
                      0,
                    )}{" "}
                    個停留
                  </span>
                )}
                <label className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="搜尋地點"
                    placeholder="找一個地方"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button
                      className="search-clear"
                      title="清除搜尋"
                      aria-label="清除搜尋"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>
              {search.trim() ? (
                <section className="search-results" aria-label="搜尋結果">
                  <h2>找到 {matches.length} 個地方</h2>
                  {matches.map(({ place, index }) => (
                    <button
                      className="result-row"
                      key={place.id}
                      onClick={() => {
                        setDayIndex(index);
                        setSearch("");
                      }}
                    >
                      <MapPin size={19} />
                      <span>
                        <strong>{place.name}</strong>
                        <small>
                          DAY {String(index + 1).padStart(2, "0")} ·{" "}
                          {place.address}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                  {!matches.length && (
                    <p className="empty-message">沒有找到這個地方。</p>
                  )}
                </section>
              ) : (
                <>
                  {hero && (
                    <figure className="trip-photo">
                      <button
                        onClick={() => setReader(hero)}
                        aria-label={`放大${hero.name}照片`}
                      >
                        <AssetImage asset={hero} />
                        <span className="photo-index">
                          {selectedDay
                            ? `DAY ${String((dayIndex ?? 0) + 1).padStart(2, "0")}`
                            : "01 / THE JOURNEY"}
                          <span>{heroDay.title}</span>
                        </span>
                        <Image className="photo-expand" size={19} />
                      </button>
                      {trip.demo && (
                        <figcaption>
                          熊本城{" "}
                          <span>
                            Photo:{" "}
                            <a
                              href="https://commons.wikimedia.org/wiki/File:Kumamoto_Castle_03n4272.jpg"
                              target="_blank"
                              rel="noreferrer"
                            >
                              663highland · CC BY 2.5
                            </a>
                          </span>
                        </figcaption>
                      )}
                    </figure>
                  )}
                  {selectedDay ? (
                    <section className="day-content">
                      <div className="section-heading">
                        <h2>今日散策</h2>
                        <span>時間皆為日本當地時間</span>
                      </div>
                      <ol className="timeline">
                        {selectedDay.places.map((place, index) => (
                          <li key={place.id}>
                            <div className="timeline-marker">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <div className="place-body">
                              <div className="place-meta">
                                <span>{place.period}</span>
                                <span>{place.category}</span>
                              </div>
                              <h3>{place.name}</h3>
                              <p className="place-english">{place.english}</p>
                              <p className="place-description">
                                {place.description}
                              </p>
                              {place.note && (
                                <p className="place-note">{place.note}</p>
                              )}
                              <div className="place-actions">
                                <a
                                  className="map-link icon-button"
                                  aria-label="開啟地圖"
                                  title={`在 Google 地圖查看${place.name}`}
                                  href={
                                    place.mapUrl ??
                                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Navigation size={15} />
                                </a>
                              </div>
                              <p className="place-address">{place.address}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : (
                    <section className="journey-overview">
                      <div className="section-heading">
                        <h2>旅程的每一天</h2>
                        <span>{trip.demo ? "示意日期" : "日本時間"}</span>
                      </div>
                      {trip.days.map((day, index) => (
                        <button
                          className="day-row"
                          key={day.id}
                          onClick={() => setDayIndex(index)}
                        >
                          <span className="day-number">
                            <small>DAY</small>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="day-title">
                            <small>{day.date.replaceAll("-", ".")}</small>
                            <strong>{day.title}</strong>
                            <span>
                              {day.places
                                .map((place) => place.name)
                                .join(" → ")}
                            </span>
                          </span>
                          <ArrowRight size={21} />
                        </button>
                      ))}
                      <div className="travel-summary">
                        <span className="small-label">KEEP CLOSE</span>
                        <h2>隨身的旅務資料</h2>
                        {trip.documents.slice(0, 2).map((document) => (
                          <button
                            className="summary-row"
                            key={document.id}
                            onClick={() => {
                              if (document.assetId)
                                setReader(
                                  trip.assets.find(
                                    (asset) => asset.id === document.assetId,
                                  ) ?? null,
                                );
                              else setView("documents");
                            }}
                          >
                            <FileText size={19} />
                            <span>
                              {document.title}
                              <small>{document.kind}</small>
                            </span>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {view === "documents" && (
            <section className="documents-section">
              {trip.documents.map((document) => (
                <article className="document-entry" key={document.id}>
                  <div className="document-icon">
                    <Ticket size={23} strokeWidth={1.4} />
                  </div>
                  <div className="document-content">
                    <span className="small-label">{document.kind}</span>
                    <h2>{document.title}</h2>
                    <p>{document.detail}</p>
                    {document.reference && (
                      <div className="reference-line">
                        <span>{document.reference}</span>
                      </div>
                    )}
                    {document.assetId && (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setReader(
                            trip.assets.find(
                              (asset) => asset.id === document.assetId,
                            ) ?? null,
                          )
                        }
                      >
                        <FileText size={17} />
                        查看附件
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}

          {view === "checklist" && (
            <section className="checklist-section">
              <div className="progress-summary">
                <div>
                  <span>已備妥</span>
                  <strong>
                    {completed}
                    <small> / {listItems.length}</small>
                  </strong>
                </div>
                <CheckCheck size={29} strokeWidth={1.3} />
              </div>
              <progress
                value={completed}
                max={listItems.length || 1}
                aria-label="清單完成進度"
              />
              <label className="filter-toggle">
                <input
                  type="checkbox"
                  checked={pendingOnly}
                  onChange={(event) => setPendingOnly(event.target.checked)}
                />
                只看未完成
              </label>
              {categories.map((category) => (
                <section className="checklist-group" key={category}>
                  <h2>{category}</h2>
                  {visibleItems
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <label
                        className={`checklist-item ${record.checked[item.id] ? "completed" : ""}`}
                        key={item.id}
                      >
                        <input
                          type="checkbox"
                          checked={!!record.checked[item.id]}
                          onChange={(event) =>
                            void toggleCheck(item.id, event.target.checked)
                          }
                        />
                        <span>{item.label}</span>
                        {record.checked[item.id] && <Check size={16} />}
                      </label>
                    ))}
                </section>
              ))}
              {!categories.length && (
                <p className="empty-message">
                  <CheckCheck size={26} />
                  這份清單都備妥了。
                </p>
              )}
            </section>
          )}

          {view === "expenses" && (
            <Suspense
              fallback={
                <p className="reader-fallback">
                  <LoaderCircle className="spin" />
                  讀取花費
                </p>
              }
            >
              <Expenses
                key={trip.id}
                tripId={trip.id}
                personal={record.personal ?? emptyPersonal()}
                onChange={(personal) =>
                  setSession((current) =>
                    current?.trip.id === trip.id
                      ? { ...current, record: { ...current.record, personal } }
                      : current,
                  )
                }
              />
            </Suspense>
          )}

          <footer className="page-footer">
            <div className="footer-identity">
              <img
                className="footer-leaves"
                src={`${illustrationBase}leaves.png`}
                alt=""
                aria-hidden="true"
                width="27"
                height="40"
              />
              <span>{appName}</span>
              <span className="footer-dot">·</span>
              <span>{trip.demo ? "示範資料" : `第 ${trip.revision} 版`}</span>
            </div>
            <p className="footer-credit">Made by Koala Travel Agency, 2026</p>
          </footer>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="手機主要導覽">
        {navigationItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            className={view === id ? "active" : ""}
            onClick={() => {
              setView(id);
              setSearch("");
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon size={21} strokeWidth={view === id ? 2 : 1.6} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showSettings && (
        <Modal title="這本小書" onClose={() => setShowSettings(false)}>
          <div className="settings-body">
            <div className="status-row">
              <ShieldCheck size={21} />
              <span>
                <strong>{trip.demo ? "示範旅程" : trip.title}</strong>
                <small>
                  第 {trip.revision} 版 · {trip.assets.length} 個離線附件
                </small>
              </span>
              <span className="status-mark">
                <Check size={17} />
              </span>
            </div>
            <div className="status-row">
              <FileCheck2 size={21} />
              <span>
                <strong>
                  {isOfflineReady
                    ? "離線資源已備妥"
                    : import.meta.env.DEV
                      ? "開發預覽模式"
                      : "離線資源準備中"}
                </strong>
                <small>{online ? "目前已連線" : "目前離線"}</small>
              </span>
            </div>
            <hr />
            <h3>匯入旅遊包</h3>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              aria-label="選取設定檔與旅遊包"
              onChange={(event) => void selectFiles(event.target.files)}
            />
            <button
              className="primary-button full-width"
              disabled={importing}
              onClick={() => fileInput.current?.click()}
            >
              {importing ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Upload size={18} />
              )}
              {importing ? "匯入中" : "選取設定檔／旅遊包"}
            </button>
            {pendingSettings && (
              <p className="import-staged">
                <Check size={15} />
                設定已選取：{settingsName}
              </p>
            )}
            {importError && (
              <p role="alert" className="error-message">
                {importError}
              </p>
            )}
            {trip.demo && (
              <>
                <hr />
                <h3>示範檔案</h3>
                <p className="muted small-copy">虛構資料，不含私人資訊。</p>
                <div className="sample-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void sampleDownload("settings")}
                  >
                    <FileKey2 size={17} />
                    下載示範設定
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void sampleDownload("package")}
                  >
                    <ArrowDownToLine size={17} />
                    下載示範旅遊包
                  </button>
                </div>
              </>
            )}
            <hr />
            <Suspense fallback={<LoaderCircle className="spin" size={17} />}>
              <BackupControls
                session={session}
                onRestore={setSession}
                onClear={resetLocalData}
              />
            </Suspense>
            {["localhost", "127.0.0.1", "[::1]"].includes(
              location.hostname,
            ) && (
              <>
                <hr />
                <a
                  className="secondary-button full-width"
                  href={`${import.meta.env.BASE_URL}#prepare`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileKey2 size={17} />
                  本機製包工具
                </a>
              </>
            )}
            {needRefresh && (
              <>
                <hr />
                <button
                  className="secondary-button full-width"
                  onClick={() => void updateServiceWorker(true)}
                >
                  <ArrowDownToLine size={17} />
                  更新應用程式
                </button>
              </>
            )}
            <p className="local-note">
              <ShieldCheck size={14} />
              旅遊內容保存在這台裝置
            </p>
          </div>
        </Modal>
      )}

      {reader && (
        <Modal title={reader.name} wide onClose={() => setReader(null)}>
          {reader.mime === "application/pdf" ? (
            <Suspense
              fallback={
                <p className="reader-fallback">
                  <LoaderCircle className="spin" />
                  讀取附件
                </p>
              }
            >
              <DocumentReader asset={reader} />
            </Suspense>
          ) : (
            <div className="image-stage">
              <AssetImage asset={reader} />
            </div>
          )}
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
    </div>
  );
}

export default App;
