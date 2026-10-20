import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Save, RefreshCw, Trash2, X } from "lucide-react";
import {
  deleteExpense,
  saveExpense,
  saveRate,
  saveReferenceRate,
} from "../lib/storage";
import { fetchReferenceRate } from "../lib/exchange";
import {
  convertMinor,
  expenseCategories,
  expenseTotals,
  formatMoney,
  parseAmount,
  parseRate,
  type Expense,
  type PersonalState,
} from "../lib/personal";

const todayInJapan = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const newForm = () => ({
  title: "",
  amount: "",
  currency: "JPY" as Expense["currency"],
  date: todayInJapan(),
  category: "餐飲" as Expense["category"],
  note: "",
});

export default function Expenses({
  tripId,
  personal,
  onChange,
}: {
  tripId: string;
  personal: PersonalState;
  onChange: (state: PersonalState) => void;
}) {
  const [form, setForm] = useState(newForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [rateInput, setRateInput] = useState(
    personal.rateMicros ? String(personal.rateMicros / 1000000) : "",
  );
  const [conversionAmount, setConversionAmount] = useState("");
  const [conversionCurrency, setConversionCurrency] =
    useState<Expense["currency"]>("JPY");
  const [saved, setSaved] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState("");
  const totals = expenseTotals(personal);
  const entries = personal.expenses
    .filter((expense) => category === "all" || expense.category === category)
    .toSorted((first, second) => second.date.localeCompare(first.date));
  let converted: string | null = null;
  if (personal.rateMicros && conversionAmount) {
    try {
      converted = formatMoney(
        convertMinor(
          parseAmount(conversionAmount, conversionCurrency),
          conversionCurrency,
          personal.rateMicros,
        ),
        conversionCurrency === "JPY" ? "TWD" : "JPY",
      );
    } catch {
      converted = "—";
    }
  }

  function startEdit(expense?: Expense) {
    setEditing(expense?.id ?? null);
    setForm(
      expense
        ? {
            title: expense.title,
            amount: String(
              expense.amountMinor / (expense.currency === "TWD" ? 100 : 1),
            ),
            currency: expense.currency,
            date: expense.date,
            category: expense.category,
            note: expense.note,
          }
        : newForm(),
    );
    setFormOpen(true);
    setError("");
    setSaved("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const expense: Expense = {
        id: editing ?? crypto.randomUUID(),
        title: form.title.trim(),
        amountMinor: parseAmount(form.amount, form.currency),
        currency: form.currency,
        date: form.date,
        category: form.category,
        note: form.note.trim(),
      };
      onChange(await saveExpense(tripId, expense));
      setFormOpen(false);
      setSaved(editing ? "支出已更新" : "支出已儲存");
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : "儲存失敗，請重試。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      onChange(await deleteExpense(tripId, id));
      setDeleting(null);
      setSaved("支出已刪除");
    } catch {
      setError("刪除失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }

  async function submitRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRateError("");
    try {
      onChange(await saveRate(tripId, parseRate(rateInput)));
      setSaved("參考匯率已儲存");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "匯率無法儲存。");
    } finally {
      setBusy(false);
    }
  }

  async function updateReferenceRate() {
    setRateError("");
    if (!navigator.onLine) {
      setRateError("目前離線，沿用已儲存匯率。");
      return;
    }
    setRateBusy(true);
    try {
      const quote = await fetchReferenceRate(personal.rateQuote);
      onChange(await saveReferenceRate(tripId, quote));
      setRateInput(String(quote.rateMicros / 1000000));
    } catch (failure: unknown) {
      setRateError(
        failure instanceof Error
          ? failure.message
          : "目前無法更新匯率，已保留原有設定。",
      );
    } finally {
      setRateBusy(false);
    }
  }

  return (
    <section className="expenses-section">
      <div className="expense-totals">
        <div>
          <span>日圓支出</span>
          <strong>{formatMoney(totals.jpy, "JPY")}</strong>
        </div>
        <div>
          <span>新臺幣支出</span>
          <strong>{formatMoney(totals.twd, "TWD")}</strong>
        </div>
      </div>
      <div className="estimated-total">
        <span>估計合計 · 新臺幣</span>
        <strong>
          {totals.estimatedTwd === null
            ? "—"
            : formatMoney(totals.estimatedTwd, "TWD")}
        </strong>
      </div>
      <div className="section-heading expense-heading">
        <h2>每一筆花費</h2>
        <button className="primary-button" onClick={() => startEdit()}>
          <Plus size={17} />
          新增支出
        </button>
      </div>
      {formOpen && (
        <form
          className="expense-form"
          aria-label={editing ? "編輯支出" : "新增支出"}
          onSubmit={(event) => void submit(event)}
        >
          <div className="section-heading">
            <h3>{editing ? "編輯支出" : "新增支出"}</h3>
            <button
              type="button"
              className="icon-button"
              title="取消編輯"
              aria-label="取消編輯"
              onClick={() => setFormOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <label className="field-label">
            項目名稱
            <input
              required
              maxLength={80}
              autoFocus
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label className="field-label">
              金額
              <input
                required
                inputMode="decimal"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              幣別
              <select
                value={form.currency}
                onChange={(event) =>
                  setForm({
                    ...form,
                    currency: event.target.value as Expense["currency"],
                  })
                }
              >
                <option value="JPY">JPY 日圓</option>
                <option value="TWD">TWD 新臺幣</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="field-label">
              日期
              <input
                required
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              分類
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({
                    ...form,
                    category: event.target.value as Expense["category"],
                  })
                }
              >
                {expenseCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-label">
            備註
            <textarea
              maxLength={300}
              rows={2}
              value={form.note}
              onChange={(event) =>
                setForm({ ...form, note: event.target.value })
              }
            />
          </label>
          <button className="primary-button" disabled={busy}>
            <Save size={16} />
            儲存支出
          </button>
        </form>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="save-status" role="status">
          <Check size={14} />
          {saved}
        </p>
      )}
      <label className="category-filter">
        分類篩選
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">全部分類</option>
          {expenseCategories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <div className="expense-list">
        {entries.map((expense) => (
          <article className="expense-row" key={expense.id}>
            <div className="expense-item-main">
              <span className="expense-category">{expense.category}</span>
              <h3>{expense.title}</h3>
              <small>{expense.date.replaceAll("-", ".")}</small>
              {expense.note && <p>{expense.note}</p>}
            </div>
            <div className="expense-item-right">
              <strong>
                {formatMoney(expense.amountMinor, expense.currency)}
              </strong>
              <div>
                <button
                  className="icon-button"
                  title={`編輯${expense.title}`}
                  aria-label={`編輯${expense.title}`}
                  onClick={() => startEdit(expense)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  title={`刪除${expense.title}`}
                  aria-label={`刪除${expense.title}`}
                  onClick={() => setDeleting(expense.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {deleting === expense.id && (
              <div className="delete-confirm">
                <span>刪除這筆支出？</span>
                <button
                  className="secondary-button"
                  onClick={() => setDeleting(null)}
                >
                  取消
                </button>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => void remove(expense.id)}
                >
                  <Trash2 size={15} />
                  確認刪除
                </button>
              </div>
            )}
          </article>
        ))}
        {!entries.length && (
          <p className="empty-message">
            {personal.expenses.length
              ? "這個分類沒有支出。"
              : "還沒有記下花費。"}
          </p>
        )}
      </div>
      <section className="exchange-section">
        <div className="section-heading">
          <h2>匯率換算</h2>
          <button
            type="button"
            className="icon-button"
            title="更新網路參考匯率"
            aria-label="更新網路參考匯率"
            disabled={rateBusy || busy}
            onClick={() => void updateReferenceRate()}
          >
            <RefreshCw size={18} className={rateBusy ? "spin" : undefined} />
          </button>
        </div>
        <form
          onSubmit={(event) => void submitRate(event)}
          className="rate-form"
        >
          <label className="field-label">
            1 日圓 ≈ 新臺幣
            <input
              aria-label="參考匯率"
              inputMode="decimal"
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
              placeholder="未設定"
              required
            />
          </label>
          <button
            className="icon-button"
            title="儲存參考匯率"
            aria-label="儲存參考匯率"
            disabled={busy || rateBusy}
          >
            <Save size={18} />
          </button>
        </form>
        <div className="rate-source">
          {personal.rateQuote ? (
            <>
              <span>
                每日參考價 ·{" "}
                {new Intl.DateTimeFormat("zh-TW", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Tokyo",
                }).format(new Date(personal.rateQuote.updatedAt))}{" "}
                日本時間
              </span>
              <a
                href="https://www.exchangerate-api.com"
                target="_blank"
                rel="noreferrer"
              >
                Rates By Exchange Rate API
              </a>
            </>
          ) : (
            <span>手動匯率</span>
          )}
          <span>非銀行買賣價或刷卡結算匯率</span>
        </div>
        {rateError && (
          <p className="rate-error" role="alert">
            {rateError}
          </p>
        )}
        <div className="form-grid conversion-form">
          <label className="field-label">
            換算金額
            <input
              inputMode="decimal"
              value={conversionAmount}
              onChange={(event) => setConversionAmount(event.target.value)}
            />
          </label>
          <label className="field-label">
            換算幣別
            <select
              value={conversionCurrency}
              onChange={(event) =>
                setConversionCurrency(event.target.value as Expense["currency"])
              }
            >
              <option value="JPY">JPY → TWD</option>
              <option value="TWD">TWD → JPY</option>
            </select>
          </label>
        </div>
        <output className="conversion-result">
          {personal.rateMicros ? (converted ?? "—") : "未設定匯率"}
        </output>
      </section>
    </section>
  );
}
