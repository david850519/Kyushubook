import { useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  FileKey2,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import {
  createActivation,
  MAX_FILE_BYTES,
  parseActivation,
  sealTrip,
  toBase64,
  validateTrip,
  type Trip,
  type TravelAsset,
} from "../lib/travel";
import { downloadText } from "../lib/files";

export default function Prepare() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [attachments, setAttachments] = useState<TravelAsset[]>([]);
  const [settingsText, setSettingsText] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<{
    settings: string;
    package: string;
    id: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function readSource(file?: File) {
    if (!file) return;
    setError("");
    setResult(null);
    setTrip(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("行程資料過大。");
      setTrip(validateTrip(JSON.parse(await file.text())));
    } catch {
      setError("行程 JSON 格式不正確或內容尚未完整，未產生任何檔案。");
    }
  }

  async function readSettings(file?: File) {
    setResult(null);
    setError("");
    setSettingsText("");
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("設定檔過大。");
      const text = await file.text();
      const keyring = await parseActivation(text);
      if (!keyring.backup) throw new Error("請選擇包含備份金鑰的設定檔。");
      setSettingsText(text);
      setPassphrase("");
      setConfirmation("");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "設定檔無法讀取。");
    }
  }

  async function readAttachments(files: FileList | null) {
    if (!files?.length) {
      setAttachments([]);
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      let total = 0;
      const added: TravelAsset[] = [];
      for (const file of Array.from(files)) {
        total += file.size;
        if (file.size > 30 * 1024 * 1024 || total > 30 * 1024 * 1024)
          throw new Error("附件合計請控制在 30 MB 以內。");
        const extension = file.name.split(".").at(-1)?.toLowerCase();
        const mime = (
          {
            pdf: "application/pdf",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
          } as const
        )[extension as "pdf" | "jpg" | "jpeg" | "png" | "webp"];
        if (!mime) throw new Error("附件僅支援 PDF、JPEG、PNG 或 WebP。");
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          mime,
          data: toBase64(new Uint8Array(await file.arrayBuffer())),
        });
      }
      setAttachments(added);
    } catch (failure: unknown) {
      setAttachments([]);
      setError(failure instanceof Error ? failure.message : "附件無法讀取。");
    } finally {
      setBusy(false);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const content = validateTrip({
        ...trip,
        demo: false,
        assets: [...trip.assets, ...attachments],
        documents: [
          ...trip.documents,
          ...attachments.map((asset) => ({
            id: `doc-${asset.id}`,
            title: asset.name,
            kind: asset.mime === "application/pdf" ? "PDF 附件" : "圖片附件",
            detail: "",
            assetId: asset.id,
          })),
        ],
      });
      if (!settingsText && passphrase !== confirmation)
        throw new Error("兩次密語不一致。");
      const activation = settingsText
        ? {
            keyring: await parseActivation(settingsText),
            settings: settingsText,
          }
        : await createActivation(content.id, passphrase).then((created) => ({
            keyring: created.keyring,
            settings: JSON.stringify(created.file),
          }));
      if (activation.keyring.tripId !== content.id)
        throw new Error("既有設定與行程識別碼不相符。");
      const envelope = await sealTrip(content, activation.keyring);
      const packageText = JSON.stringify(envelope);
      if (new TextEncoder().encode(packageText).byteLength > MAX_FILE_BYTES)
        throw new Error("產出的旅遊包過大，請減少附件。");
      setResult({
        settings: activation.settings,
        package: packageText,
        id: content.id,
      });
      setPassphrase("");
      setConfirmation("");
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "製包失敗，請檢查內容與附件。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="prepare-page">
      <header className="prepare-header">
        <a className="text-button" href={import.meta.env.BASE_URL}>
          <ArrowLeft size={17} />
          返回小書
        </a>
        <span className="demo-badge">僅本機</span>
      </header>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KYUSHU / PRIVATE PACKAGE</p>
          <h1>旅遊包製作</h1>
          <p className="page-subtitle">私密設定與完整行程</p>
        </div>
        <ShieldCheck className="prepare-shield" size={37} strokeWidth={1.3} />
      </div>
      <form onSubmit={(event) => void generate(event)}>
        <section className="prepare-section">
          <h2>
            <span>01</span>行程內容
          </h2>
          <label className="field-label">
            行程資料 JSON
            <input
              type="file"
              required
              accept=".json,application/json"
              onChange={(event) => void readSource(event.target.files?.[0])}
            />
          </label>
          {trip && (
            <div className="source-summary">
              <Check size={17} />
              <span>
                {trip.title} · 第 {trip.revision} 版<br />
                <small>
                  {trip.days.length} 天 ·{" "}
                  {trip.days.reduce(
                    (count, day) => count + day.places.length,
                    0,
                  )}{" "}
                  筆行程 ·{" "}
                  {
                    trip.checklist.filter((item) => item.category !== "伴手禮")
                      .length
                  }{" "}
                  項準備
                </small>
              </span>
            </div>
          )}
        </section>
        <section className="prepare-section">
          <h2>
            <span>02</span>原稿與票券
          </h2>
          <label className="field-label">
            附加 PDF／圖片
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => void readAttachments(event.target.files)}
            />
          </label>
          <p className="muted small-copy">附件合計上限 30 MB</p>
          {attachments.length > 0 && (
            <ul className="attachment-list">
              {attachments.map((asset) => (
                <li key={asset.id}>{asset.name}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="prepare-section">
          <h2>
            <span>03</span>私密設定
          </h2>
          <label className="field-label">
            沿用既有設定（選填）
            <input
              type="file"
              accept=".kykey,.json,application/json"
              onChange={(event) => void readSettings(event.target.files?.[0])}
            />
          </label>
          {settingsText ? (
            <p className="save-status">
              <Check size={15} />
              沿用既有金鑰與備份設定
            </p>
          ) : (
            <>
              <label className="field-label">
                共用備份密語
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={passphrase}
                  onChange={(event) => {
                    setPassphrase(event.target.value);
                    setResult(null);
                  }}
                />
              </label>
              <label className="field-label">
                確認密語
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={256}
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setResult(null);
                  }}
                />
              </label>
              <p className="muted small-copy">12～256 個字元 · 只在本機處理</p>
            </>
          )}
        </section>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button full-width" disabled={busy || !trip}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <PackageCheck size={18} />
          )}
          {busy ? "製作中" : "產生加密旅遊包"}
        </button>
      </form>
      {result && (
        <section className="package-result" aria-label="製包完成">
          <h2>
            <Check size={20} />
            旅遊包已備妥
          </h2>
          <div className="sample-actions">
            <button
              className="secondary-button"
              onClick={() =>
                downloadText(`${result.id}-settings.kykey`, result.settings)
              }
            >
              <FileKey2 size={17} />
              下載私密設定
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                downloadText(`${result.id}.kyushu`, result.package)
              }
            >
              <ArrowDownToLine size={17} />
              下載加密旅遊包
            </button>
          </div>
          <p className="muted small-copy">
            設定檔等同鑰匙，請與旅遊包及備份分開傳遞、分開保管。
          </p>
        </section>
      )}
    </main>
  );
}
