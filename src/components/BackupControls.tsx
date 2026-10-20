import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  FileKey2,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  exportPersonalBackup,
  previewPersonalBackup,
  restorePersonalBackup,
  type TravelSession,
} from "../lib/storage";
import { type BackupData } from "../lib/personal";
import { MAX_FILE_BYTES } from "../lib/travel";
import { downloadText } from "../lib/files";

export default function BackupControls({
  session,
  onRestore,
  onClear,
}: {
  session: TravelSession;
  onRestore: (session: TravelSession) => void;
  onClear: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    data: BackupData;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [clearing, setClearing] = useState(false);

  async function exportBackup() {
    setBusy(true);
    setError("");
    try {
      const text = await exportPersonalBackup();
      downloadText(
        `${session.trip.id}-${new Date().toISOString().slice(0, 10)}.kybackup`,
        text,
      );
      setStatus("加密備份檔已準備");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "備份失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function selectBackup(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setStatus("");
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("備份檔過大。");
      const text = await file.text();
      setPreview({ data: await previewPersonalBackup(text), text });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "備份無法讀取。");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function restore() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      onRestore(await restorePersonalBackup(preview.text));
      setPreview(null);
      setStatus("個人資料已復原");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "復原失敗。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup-section">
      <h3>個人資料備份</h3>
      <div className="sample-actions">
        <button
          className="secondary-button"
          disabled={busy || !session.record.keyring.backup}
          onClick={() => void exportBackup()}
        >
          <ArrowDownToLine size={17} />
          匯出備份
        </button>
        <button
          className="secondary-button"
          disabled={busy || !session.record.keyring.backup}
          onClick={() => input.current?.click()}
        >
          <RotateCcw size={17} />
          復原備份
        </button>
      </div>
      <input
        className="sr-only"
        ref={input}
        aria-label="選擇個人備份"
        type="file"
        accept=".kybackup,.json,application/json"
        onChange={(event) => void selectBackup(event.target.files?.[0])}
      />
      {!session.record.keyring.backup && (
        <p className="muted small-copy">需先匯入含備份金鑰的新版私密設定。</p>
      )}
      {preview && (
        <div className="backup-preview">
          <div className="section-heading">
            <h3>備份預覽</h3>
            <button
              className="icon-button"
              title="取消復原"
              aria-label="取消復原"
              onClick={() => setPreview(null)}
            >
              <X size={17} />
            </button>
          </div>
          <dl>
            <div>
              <dt>備份時間</dt>
              <dd>
                {new Intl.DateTimeFormat("zh-TW", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Tokyo",
                }).format(new Date(preview.data.createdAt))}
              </dd>
            </div>
            <div>
              <dt>行前勾選</dt>
              <dd>
                {Object.values(preview.data.checked).filter(Boolean).length} 項
              </dd>
            </div>
            <div>
              <dt>支出紀錄</dt>
              <dd>{preview.data.personal.expenses.length} 筆</dd>
            </div>
          </dl>
          <p className="muted small-copy">
            確認後會取代這台裝置的個人資料，不會合併；旅遊內容保持不變。
          </p>
          <button
            className="primary-button full-width"
            disabled={busy}
            onClick={() => void restore()}
          >
            <RotateCcw size={16} />
            確認取代並復原
          </button>
        </div>
      )}
      {busy && <LoaderCircle className="spin" size={17} />}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="save-status">
          {status}
        </p>
      )}
      <p className="muted small-copy backup-note">
        <FileKey2 size={13} />
        共用私密設定可解開兩人的備份
      </p>
      <hr />
      <button className="danger-button" onClick={() => setClearing(true)}>
        <Trash2 size={16} />
        清除此裝置資料
      </button>
      {clearing && (
        <div className="clear-confirm">
          <p>清除後回到示範旅程。請先保存私密設定、旅遊包及個人備份。</p>
          <div className="sample-actions">
            <button
              className="secondary-button"
              onClick={() => setClearing(false)}
            >
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onClear().catch(() => {
                  setError("清除失敗，請重試。");
                  setBusy(false);
                });
              }}
            >
              <Trash2 size={15} />
              確認清除
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
