import { openDB, type DBSchema } from "idb";
import {
  openTrip,
  parseActivation,
  parseEnvelope,
  type Envelope,
  type Keyring,
  type Trip,
} from "./travel";
import {
  emptyPersonal,
  expenseSchema,
  openBackup,
  personalSchema,
  sealBackup,
  type BackupData,
  type Expense,
  type PersonalState,
} from "./personal";

export type TravelRecord = {
  keyring: Keyring;
  envelope: Envelope;
  checked: Record<string, boolean>;
  personal?: PersonalState;
};
export type TravelSession = { record: TravelRecord; trip: Trip };

interface TravelDatabase extends DBSchema {
  state: { key: string; value: TravelRecord };
}

const database = openDB<TravelDatabase>("kyushu-travel-book", 1, {
  upgrade(connection) {
    connection.createObjectStore("state");
  },
});

export async function restoreSession(): Promise<TravelSession | null> {
  const record = await (await database).get("state", "current");
  if (!record) return null;
  return { record, trip: await openTrip(record.envelope, record.keyring) };
}

export async function importTravel(
  envelopeText: string,
  settingsText?: string,
): Promise<TravelSession> {
  const previous = await (await database).get("state", "current");
  const keyring = settingsText
    ? await parseActivation(settingsText)
    : previous?.keyring;
  if (!keyring) throw new Error("請先選擇私密設定檔。");
  const envelope = parseEnvelope(envelopeText);
  const trip = await openTrip(envelope, keyring);
  if (previous?.envelope.tripId === trip.id) {
    const previousTrip = await openTrip(previous.envelope, previous.keyring);
    if (trip.revision < previousTrip.revision)
      throw new Error("此旅遊包版本較舊，現有內容已保留。");
  }
  const record: TravelRecord = {
    keyring,
    envelope,
    checked:
      previous?.envelope.tripId === trip.id ? { ...previous.checked } : {},
    personal:
      previous?.envelope.tripId === trip.id
        ? personalSchema.parse(previous.personal ?? emptyPersonal())
        : emptyPersonal(),
  };
  await (await database).put("state", record, "current");
  return { record, trip };
}

export async function setChecked(
  tripId: string,
  itemId: string,
  checked: boolean,
): Promise<void> {
  const transaction = (await database).transaction("state", "readwrite");
  const record = await transaction.store.get("current");
  if (!record || record.envelope.tripId !== tripId)
    throw new Error("目前旅程已變更，請重新開啟。");
  record.checked[itemId] = checked;
  await transaction.store.put(record, "current");
  await transaction.done;
}

export async function clearTravel(): Promise<void> {
  await (await database).delete("state", "current");
}

async function updatePersonal(
  tripId: string,
  change: (state: PersonalState) => PersonalState,
): Promise<PersonalState> {
  const transaction = (await database).transaction("state", "readwrite");
  const record = await transaction.store.get("current");
  if (!record || record.envelope.tripId !== tripId)
    throw new Error("目前旅程已變更。");
  record.personal = personalSchema.parse(
    change(personalSchema.parse(record.personal ?? emptyPersonal())),
  );
  await transaction.store.put(record, "current");
  await transaction.done;
  return record.personal;
}

export function saveExpense(tripId: string, expense: Expense) {
  const entry = expenseSchema.parse(expense);
  return updatePersonal(tripId, (state) => ({
    ...state,
    expenses: [...state.expenses.filter((item) => item.id !== entry.id), entry],
  }));
}

export function deleteExpense(tripId: string, expenseId: string) {
  return updatePersonal(tripId, (state) => ({
    ...state,
    expenses: state.expenses.filter((item) => item.id !== expenseId),
  }));
}

export function saveRate(tripId: string, rateMicros: number | null) {
  return updatePersonal(tripId, (state) => ({ ...state, rateMicros }));
}

export async function exportPersonalBackup(): Promise<string> {
  const record = await (await database).get("state", "current");
  if (!record) throw new Error("請先匯入旅程。");
  return sealBackup(
    {
      version: 1,
      tripId: record.envelope.tripId,
      createdAt: new Date().toISOString(),
      checked: record.checked,
      personal: personalSchema.parse(record.personal ?? emptyPersonal()),
    },
    record.keyring,
  );
}

export async function previewPersonalBackup(text: string): Promise<BackupData> {
  const record = await (await database).get("state", "current");
  if (!record) throw new Error("請先匯入旅程與私密設定。");
  return openBackup(text, record.keyring);
}

export async function restorePersonalBackup(
  text: string,
): Promise<TravelSession> {
  const original = await (await database).get("state", "current");
  if (!original) throw new Error("請先匯入旅程。");
  const backup = await openBackup(text, original.keyring);
  const trip = await openTrip(original.envelope, original.keyring);
  const transaction = (await database).transaction("state", "readwrite");
  const current = await transaction.store.get("current");
  if (
    !current ||
    current.envelope.keyId !== original.envelope.keyId ||
    current.envelope.ciphertext !== original.envelope.ciphertext
  )
    throw new Error("旅程已變更，請重新預覽備份。");
  const checklistIds = new Set(
    trip.checklist
      .filter((item) => item.category !== "伴手禮")
      .map((item) => item.id),
  );
  current.checked = Object.fromEntries(
    Object.entries(backup.checked).filter(([id]) => checklistIds.has(id)),
  );
  current.personal = backup.personal;
  await transaction.store.put(current, "current");
  await transaction.done;
  return { record: current, trip };
}
