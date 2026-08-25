const STATE_KEY = "euphoria_toolbox_v3";
const PREVIOUS_STATE_KEY = "euphoria_toolbox_v2";
const LEGACY_COUNTER_KEY = "euphoria_counter_start";
const LEGACY_LEDGER_KEY = "euphoria_ledger_v1";
const SCHEMA_NAME = "project-euphoria-toolbox";
export const SCHEMA_VERSION = 3;

const MAX_LEDGER_ENTRIES = 2000;
const MAX_COUNTER_HISTORY = 500;

const PROTOCOL_NAMES = new Set([
  "Talking Stick",
  "Safe Word",
  "Off the Record",
  "Loop Detector",
  "No-Flinch",
  "Paved Crossings",
  "Receipts"
]);
const LEDGER_RESULTS = new Set(["Worked", "Did not work", "Pending"]);

function text(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validEpoch(value) {
  return finiteNumber(value) !== null && !Number.isNaN(new Date(value).getTime());
}

export function validCalendarDateString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateTimeInputValue(epochMs) {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseLocalDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || "");
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00"] = match;
  if (!validCalendarDateString(`${yearText}-${monthText}-${dayText}`)) return null;
  const expected = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (expected[3] > 23 || expected[4] > 59 || expected[5] > 59) return null;
  const date = new Date(value);
  const actual = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  ];
  return !Number.isNaN(date.getTime()) && actual.every((part, index) => part === expected[index])
    ? date.getTime()
    : null;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(minutes).padStart(2, "0")}m`);
  parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}

export function escapeCsvCell(value) {
  let safe = String(value);
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createDefaultState() {
  return {
    version: SCHEMA_VERSION,
    counter: {
      current: null,
      history: []
    },
    ledger: [],
    continuity: {
      thread: "",
      understood: "",
      need: "",
      moment: "ordinary",
      updatedAt: null
    },
    agreement: {
      protocol: "Talking Stick",
      people: "",
      signal: "",
      pause: "",
      limit: "",
      reviewAt: null,
      reviewTimezone: "Local time",
      consent: false,
      updatedAt: null,
      checkin: {
        consent: "",
        tension: "",
        worked: "",
        change: "",
        next: "",
        updatedAt: null
      }
    }
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validStoredString(value, maxLength, { allowEmpty = true, trimmed = false } = {}) {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0) &&
    (!trimmed || value === value.trim())
  );
}

function validNullableTimestamp(value) {
  return value === null || validEpoch(value);
}

function validTimeZone(value) {
  if (value === "Local time") return true;
  if (!validStoredString(value, 100, { allowEmpty: false })) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function validateCounterRecord(value, path, includeEnd = false) {
  if (!isRecord(value)) return `${path} must be an object.`;
  if (!validStoredString(value.id, 100, { allowEmpty: false })) return `${path}.id is missing or invalid.`;
  if (!validStoredString(value.label, 80, { allowEmpty: false, trimmed: true })) return `${path}.label is missing or invalid.`;
  if (!validEpoch(value.startAt)) return `${path}.startAt must be a renderable timestamp.`;
  if (!validTimeZone(value.timezone)) return `${path}.timezone is missing or invalid.`;
  if (includeEnd) {
    if (!validEpoch(value.endAt)) return `${path}.endAt must be a renderable timestamp.`;
    if (finiteNumber(value.durationMs) === null || value.durationMs < 0) return `${path}.durationMs must be a nonnegative finite number.`;
  }
  return "";
}

/**
 * Strictly validates persisted or imported v2 data before normalization. The
 * normalizer is intentionally forgiving for form input and legacy migration;
 * this gate prevents a damaged saved snapshot from being silently rewritten.
 */
export function validateStateSnapshot(value) {
  const fail = (error) => ({ ok: false, error, state: null });
  if (!isRecord(value)) return fail("The saved state must be an object.");
  if (value.version !== SCHEMA_VERSION) return fail(`Unsupported saved-state version: ${String(value.version)}.`);
  if (!isRecord(value.counter)) return fail("counter must be an object.");
  if (value.counter.current !== null) {
    const error = validateCounterRecord(value.counter.current, "counter.current");
    if (error) return fail(error);
  }
  if (!Array.isArray(value.counter.history)) return fail("counter.history must be an array.");
  if (value.counter.history.length > MAX_COUNTER_HISTORY) return fail(`counter.history exceeds the ${MAX_COUNTER_HISTORY}-chapter limit.`);
  const historyIds = new Set();
  for (let index = 0; index < value.counter.history.length; index += 1) {
    const row = value.counter.history[index];
    const error = validateCounterRecord(row, `counter.history[${index}]`, true);
    if (error) return fail(error);
    if (historyIds.has(row.id)) return fail(`counter.history contains duplicate id ${row.id}.`);
    historyIds.add(row.id);
  }

  if (!Array.isArray(value.ledger)) return fail("ledger must be an array.");
  if (value.ledger.length > MAX_LEDGER_ENTRIES) return fail(`ledger exceeds the ${MAX_LEDGER_ENTRIES}-entry limit.`);
  const ledgerIds = new Set();
  for (let index = 0; index < value.ledger.length; index += 1) {
    const row = value.ledger[index];
    const path = `ledger[${index}]`;
    if (!isRecord(row)) return fail(`${path} must be an object.`);
    if (!validStoredString(row.id, 100, { allowEmpty: false })) return fail(`${path}.id is missing or invalid.`);
    if (ledgerIds.has(row.id)) return fail(`ledger contains duplicate id ${row.id}.`);
    ledgerIds.add(row.id);
    if (!validStoredString(row.text, 240, { allowEmpty: false, trimmed: true })) return fail(`${path}.text is missing or invalid.`);
    if (!LEDGER_RESULTS.has(row.result)) return fail(`${path}.result is unsupported.`);
    if (!validCalendarDateString(row.date)) return fail(`${path}.date is invalid.`);
    if (!validEpoch(row.createdAt)) return fail(`${path}.createdAt must be a renderable timestamp.`);
  }

  if (!isRecord(value.continuity)) return fail("continuity must be an object.");
  const continuity = value.continuity;
  if (!validStoredString(continuity.thread, 700)) return fail("continuity.thread is invalid.");
  if (!validStoredString(continuity.understood, 700)) return fail("continuity.understood is invalid.");
  if (!validStoredString(continuity.need, 500)) return fail("continuity.need is invalid.");
  if (!["ordinary", "heavy", "immediate"].includes(continuity.moment)) return fail("continuity.moment is unsupported.");
  if (!validNullableTimestamp(continuity.updatedAt)) return fail("continuity.updatedAt is invalid.");

  if (!isRecord(value.agreement)) return fail("agreement must be an object.");
  const agreement = value.agreement;
  if (!PROTOCOL_NAMES.has(agreement.protocol)) return fail("agreement.protocol is unsupported.");
  if (!validStoredString(agreement.people, 120)) return fail("agreement.people is invalid.");
  if (!validStoredString(agreement.signal, 120)) return fail("agreement.signal is invalid.");
  if (!validStoredString(agreement.pause, 400)) return fail("agreement.pause is invalid.");
  if (!validStoredString(agreement.limit, 80)) return fail("agreement.limit is invalid.");
  if (!validNullableTimestamp(agreement.reviewAt)) return fail("agreement.reviewAt is invalid.");
  if (!validTimeZone(agreement.reviewTimezone)) return fail("agreement.reviewTimezone is invalid.");
  if (typeof agreement.consent !== "boolean") return fail("agreement.consent must be true or false.");
  if (!validNullableTimestamp(agreement.updatedAt)) return fail("agreement.updatedAt is invalid.");
  if (!isRecord(agreement.checkin)) return fail("agreement.checkin must be an object.");
  const checkin = agreement.checkin;
  if (!["", "Yes", "No", "Unclear"].includes(checkin.consent)) return fail("agreement.checkin.consent is unsupported.");
  if (!["", "Lower", "Same", "Higher"].includes(checkin.tension)) return fail("agreement.checkin.tension is unsupported.");
  if (!validStoredString(checkin.worked, 400)) return fail("agreement.checkin.worked is invalid.");
  if (!validStoredString(checkin.change, 400)) return fail("agreement.checkin.change is invalid.");
  if (!["", "Use again", "Revise", "Retire"].includes(checkin.next)) return fail("agreement.checkin.next is unsupported.");
  if (!validNullableTimestamp(checkin.updatedAt)) return fail("agreement.checkin.updatedAt is invalid.");

  return { ok: true, error: "", state: normalizeState(value) };
}

export function migrateV2Snapshot(value, timeZone = "Local time") {
  const fail = (error) => ({ ok: false, error, state: null });
  if (!isRecord(value) || value.version !== 2) return fail("This is not a Toolbox v2 state snapshot.");
  if (!isRecord(value.agreement)) return fail("agreement must be an object.");
  if (typeof value.agreement.reviewAt !== "string") return fail("agreement.reviewAt must be a v2 local date-time string.");
  const reviewAt = value.agreement.reviewAt ? parseLocalDateTime(value.agreement.reviewAt) : null;
  if (value.agreement.reviewAt && reviewAt === null) return fail("agreement.reviewAt is not a valid local date-time.");
  const migrated = cloneValue(value);
  migrated.version = SCHEMA_VERSION;
  migrated.agreement.reviewAt = reviewAt;
  migrated.agreement.reviewTimezone = timeZone || "Local time";
  return validateStateSnapshot(migrated);
}

function normalizeCounterRecord(value, includeEnd = false) {
  if (!value || typeof value !== "object") return null;
  const startAt = validEpoch(value.startAt) ? value.startAt : null;
  const label = text(value.label, 80).trim();
  if (startAt === null || !label) return null;
  const record = {
    id: text(value.id, 100) || makeId(),
    label,
    startAt,
    timezone: text(value.timezone, 100) || "Local time"
  };
  if (includeEnd) {
    const endAt = validEpoch(value.endAt) ? value.endAt : null;
    if (endAt === null) return null;
    record.endAt = endAt;
    record.durationMs = Math.max(0, finiteNumber(value.durationMs) ?? endAt - startAt);
  }
  return record;
}

export function normalizeState(value) {
  const base = createDefaultState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;

  const current = normalizeCounterRecord(value.counter?.current);
  const history = Array.isArray(value.counter?.history)
    ? value.counter.history
        .map((item) => normalizeCounterRecord(item, true))
        .filter(Boolean)
        .slice(-MAX_COUNTER_HISTORY)
    : [];

  const ledger = Array.isArray(value.ledger)
    ? value.ledger
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const entryText = text(item.text, 240).trim();
          const result = LEDGER_RESULTS.has(item.result) ? item.result : "Pending";
          const date = validCalendarDateString(item.date) ? item.date : "";
          if (!entryText || !date) return null;
          return {
            id: text(item.id, 100) || makeId(),
            text: entryText,
            result,
            date,
            createdAt: validEpoch(item.createdAt) ? item.createdAt : Date.now()
          };
        })
        .filter(Boolean)
        .slice(-MAX_LEDGER_ENTRIES)
    : [];

  const continuityValue = value.continuity || {};
  const moment = ["ordinary", "heavy", "immediate"].includes(continuityValue.moment)
    ? continuityValue.moment
    : "ordinary";

  const agreementValue = value.agreement || {};
  const checkinValue = agreementValue.checkin || {};
  return {
    version: SCHEMA_VERSION,
    counter: { current, history },
    ledger,
    continuity: {
      thread: text(continuityValue.thread, 700),
      understood: text(continuityValue.understood, 700),
      need: text(continuityValue.need, 500),
      moment,
      updatedAt: validEpoch(continuityValue.updatedAt) ? continuityValue.updatedAt : null
    },
    agreement: {
      protocol: PROTOCOL_NAMES.has(agreementValue.protocol) ? agreementValue.protocol : base.agreement.protocol,
      people: text(agreementValue.people, 120),
      signal: text(agreementValue.signal, 120),
      pause: text(agreementValue.pause, 400),
      limit: text(agreementValue.limit, 80),
      reviewAt: validEpoch(agreementValue.reviewAt) ? agreementValue.reviewAt : null,
      reviewTimezone: text(agreementValue.reviewTimezone, 100) || "Local time",
      consent: agreementValue.consent === true,
      updatedAt: validEpoch(agreementValue.updatedAt) ? agreementValue.updatedAt : null,
      checkin: {
        consent: ["Yes", "No", "Unclear"].includes(checkinValue.consent) ? checkinValue.consent : "",
        tension: ["Lower", "Same", "Higher"].includes(checkinValue.tension) ? checkinValue.tension : "",
        worked: text(checkinValue.worked, 400),
        change: text(checkinValue.change, 400),
        next: ["Use again", "Revise", "Retire"].includes(checkinValue.next) ? checkinValue.next : "",
        updatedAt: validEpoch(checkinValue.updatedAt) ? checkinValue.updatedAt : null
      }
    }
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeScalar(base, current, latest, name, conflicts) {
  const changedHere = !valuesEqual(current, base);
  const changedElsewhere = !valuesEqual(latest, base);
  if (!changedHere) return cloneValue(latest);
  if (changedElsewhere && !valuesEqual(current, latest)) {
    conflicts.push(name);
    return cloneValue(latest);
  }
  return cloneValue(current);
}

function mergeObjectFields(base, current, latest, fields, prefix, conflicts) {
  const result = cloneValue(latest);
  for (const field of fields) {
    result[field] = mergeScalar(base[field], current[field], latest[field], `${prefix}.${field}`, conflicts);
  }
  return result;
}

function mergeArrayById(base, current, latest, name, limit, conflicts) {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const latestMap = new Map(latest.map((item) => [item.id, item]));
  const result = latest.map((item) => cloneValue(item));

  const remove = (id) => {
    const index = result.findIndex((item) => item.id === id);
    if (index >= 0) result.splice(index, 1);
  };
  const replace = (id, item) => {
    const index = result.findIndex((candidate) => candidate.id === id);
    if (index >= 0) result[index] = cloneValue(item);
    else result.push(cloneValue(item));
  };

  for (const [id, baseItem] of baseMap) {
    const currentItem = currentMap.get(id);
    const latestItem = latestMap.get(id);
    if (!currentItem) {
      if (!latestItem) continue;
      if (valuesEqual(latestItem, baseItem)) remove(id);
      else conflicts.push(`${name}.${id}`);
      continue;
    }
    if (valuesEqual(currentItem, baseItem)) continue;
    if (!latestItem) {
      conflicts.push(`${name}.${id}`);
    } else if (valuesEqual(latestItem, baseItem) || valuesEqual(latestItem, currentItem)) {
      replace(id, currentItem);
    } else {
      conflicts.push(`${name}.${id}`);
    }
  }

  for (const [id, currentItem] of currentMap) {
    if (baseMap.has(id)) continue;
    const latestItem = latestMap.get(id);
    if (!latestItem) result.push(cloneValue(currentItem));
    else if (!valuesEqual(latestItem, currentItem)) conflicts.push(`${name}.${id}`);
  }
  if (result.length > limit) conflicts.push(`${name}.capacity`);
  return result;
}

function newestTimestamp(...values) {
  const timestamps = values.filter((value) => finiteNumber(value) !== null);
  return timestamps.length ? Math.max(...timestamps) : null;
}

export function mergeStates(baseValue, currentValue, latestValue) {
  const base = normalizeState(baseValue);
  const current = normalizeState(currentValue);
  const latest = normalizeState(latestValue);
  const conflicts = [];
  const counter = {
    current: mergeScalar(base.counter.current, current.counter.current, latest.counter.current, "counter.current", conflicts),
    history: mergeArrayById(
      base.counter.history,
      current.counter.history,
      latest.counter.history,
      "counter.history",
      MAX_COUNTER_HISTORY,
      conflicts
    )
  };
  const continuity = mergeObjectFields(
    base.continuity,
    current.continuity,
    latest.continuity,
    ["thread", "understood", "need", "moment"],
    "continuity",
    conflicts
  );
  continuity.updatedAt = newestTimestamp(current.continuity.updatedAt, latest.continuity.updatedAt);
  const agreement = mergeObjectFields(
    base.agreement,
    current.agreement,
    latest.agreement,
    ["protocol", "people", "signal", "pause", "limit", "reviewAt", "reviewTimezone", "consent"],
    "agreement",
    conflicts
  );
  agreement.updatedAt = newestTimestamp(current.agreement.updatedAt, latest.agreement.updatedAt);
  agreement.checkin = mergeObjectFields(
    base.agreement.checkin,
    current.agreement.checkin,
    latest.agreement.checkin,
    ["consent", "tension", "worked", "change", "next"],
    "agreement.checkin",
    conflicts
  );
  agreement.checkin.updatedAt = newestTimestamp(
    current.agreement.checkin.updatedAt,
    latest.agreement.checkin.updatedAt
  );
  const ledger = mergeArrayById(
    base.ledger,
    current.ledger,
    latest.ledger,
    "ledger",
    MAX_LEDGER_ENTRIES,
    conflicts
  );
  return {
    state: {
      version: SCHEMA_VERSION,
      counter,
      ledger,
      continuity,
      agreement
    },
    conflicts
  };
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  } catch {
    return "Local time";
  }
}

export function formatDateTime(epoch, timeZone = "") {
  const date = new Date(epoch);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const options = {
    dateStyle: "medium",
    timeStyle: "short"
  };
  if (timeZone && timeZone !== "Local time") options.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    delete options.timeZone;
    try {
      return new Intl.DateTimeFormat(undefined, options).format(date);
    } catch {
      return date.toISOString();
    }
  }
}

function formatCalendarDate(value) {
  const noon = new Date(`${value}T12:00:00`);
  if (Number.isNaN(noon.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(noon);
}

export function safeFragmentId(hash) {
  try {
    return decodeURIComponent(String(hash || "").replace(/^#/, ""));
  } catch {
    return "";
  }
}

export function createStore() {
  let storage = null;
  let persistent = false;
  let blockedByCorruption = false;
  let corruptRaw = null;
  let lastError = "";
  let requiresReload = false;
  let writeEnabled = true;
  let state = createDefaultState();
  let baseline = cloneValue(state);

  try {
    storage = window.localStorage;
    const probe = "__euphoria_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    persistent = true;
  } catch {
    storage = null;
  }

  function migrateLegacy() {
    if (!storage) return;
    const migrated = createDefaultState();
    let hasLegacy = false;
    try {
      const oldCounter = storage.getItem(LEGACY_COUNTER_KEY);
      if (oldCounter) {
        const startAt = new Date(oldCounter).getTime();
        if (Number.isFinite(startAt)) {
          migrated.counter.current = {
            id: makeId(),
            label: "Imported counter",
            startAt,
            timezone: getTimezone()
          };
          hasLegacy = true;
        }
      }
      const oldLedgerRaw = storage.getItem(LEGACY_LEDGER_KEY);
      if (oldLedgerRaw) {
        const rows = JSON.parse(oldLedgerRaw);
        if (Array.isArray(rows)) {
          migrated.ledger = rows
            .map((row) => {
              if (!row || !row.t || !validCalendarDateString(row.d)) return null;
              return {
                id: makeId(),
                text: text(row.t, 240),
                result: row.k === "W" ? "Worked" : "Did not work",
                date: row.d,
                createdAt: new Date(`${row.d}T12:00:00`).getTime()
              };
            })
            .filter(Boolean);
          hasLegacy = hasLegacy || migrated.ledger.length > 0;
        }
      }
      if (hasLegacy) {
        state = normalizeState(migrated);
        storage.setItem(STATE_KEY, JSON.stringify(state));
      }
    } catch {
      // Legacy data stays untouched. A failed migration must not destroy it.
    }
  }

  if (storage) {
    let raw = null;
    try {
      raw = storage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const validation = validateStateSnapshot(parsed);
        if (!validation.ok) throw new TypeError(validation.error);
        state = validation.state;
      } else {
        const previousRaw = storage.getItem(PREVIOUS_STATE_KEY);
        if (previousRaw) {
          raw = previousRaw;
          const migrated = migrateV2Snapshot(JSON.parse(previousRaw), getTimezone());
          if (!migrated.ok) throw new TypeError(migrated.error);
          state = migrated.state;
          storage.setItem(STATE_KEY, JSON.stringify(state));
          storage.removeItem(PREVIOUS_STATE_KEY);
        } else {
          migrateLegacy();
        }
      }
      if (!raw && storage.getItem(STATE_KEY)) {
        raw = storage.getItem(STATE_KEY);
        const validation = validateStateSnapshot(JSON.parse(raw));
        if (!validation.ok) throw new TypeError(validation.error);
        state = validation.state;
      }
    } catch {
      blockedByCorruption = true;
      corruptRaw = raw;
      persistent = false;
      lastError = "corruption";
      state = createDefaultState();
    }
  }
  baseline = cloneValue(state);

  return {
    get state() {
      return state;
    },
    get persistent() {
      return persistent;
    },
    get storageAvailable() {
      return storage !== null;
    },
    get blockedByCorruption() {
      return blockedByCorruption;
    },
    get corruptRaw() {
      return corruptRaw;
    },
    get lastError() {
      return lastError;
    },
    get requiresReload() {
      return requiresReload;
    },
    get writeEnabled() {
      return writeEnabled;
    },
    setWriteEnabled(enabled) {
      writeEnabled = enabled === true;
    },
    markExternalChange() {
      requiresReload = true;
    },
    save() {
      if (!writeEnabled) {
        persistent = false;
        lastError = "tab-lock";
        return false;
      }
      if (!storage) {
        persistent = false;
        lastError = "storage";
        return false;
      }
      if (blockedByCorruption) {
        persistent = false;
        lastError = "corruption";
        return false;
      }
      if (requiresReload) {
        persistent = false;
        lastError = "reload";
        return false;
      }
      try {
        const currentValidation = validateStateSnapshot(state);
        if (!currentValidation.ok) {
          persistent = false;
          lastError = currentValidation.error.includes("exceeds") ? "capacity" : "validation";
          return false;
        }

        const raw = storage.getItem(STATE_KEY);
        let latest = createDefaultState();
        if (raw) {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            blockedByCorruption = true;
            corruptRaw = raw;
            persistent = false;
            lastError = "corruption";
            return false;
          }
          const validation = validateStateSnapshot(parsed);
          if (!validation.ok) {
            blockedByCorruption = true;
            corruptRaw = raw;
            persistent = false;
            lastError = "corruption";
            return false;
          }
          latest = validation.state;
        }

        const absorbedExternalChange = !valuesEqual(latest, baseline);
        const merged = mergeStates(baseline, currentValidation.state, latest);
        if (merged.conflicts.length) {
          persistent = false;
          lastError = merged.conflicts.some((name) => name.endsWith(".capacity")) ? "capacity" : "conflict";
          return false;
        }
        const mergedValidation = validateStateSnapshot(merged.state);
        if (!mergedValidation.ok) {
          persistent = false;
          lastError = "validation";
          return false;
        }
        storage.setItem(STATE_KEY, JSON.stringify(mergedValidation.state));
        state = mergedValidation.state;
        baseline = cloneValue(state);
        persistent = true;
        lastError = "";
        requiresReload = absorbedExternalChange;
        return true;
      } catch {
        persistent = false;
        lastError = "storage";
        return false;
      }
    },
    replace(nextState, allowCorruptOverwrite = false) {
      if (!writeEnabled) {
        persistent = false;
        lastError = "tab-lock";
        return false;
      }
      const validation = validateStateSnapshot(nextState);
      if (!validation.ok) {
        lastError = "validation";
        return false;
      }
      if (blockedByCorruption && !allowCorruptOverwrite) {
        lastError = "corruption";
        return false;
      }
      state = validation.state;
      if (!storage) {
        baseline = cloneValue(state);
        persistent = false;
        lastError = "storage";
        return false;
      }
      try {
        storage.setItem(STATE_KEY, JSON.stringify(state));
        baseline = cloneValue(state);
        blockedByCorruption = false;
        corruptRaw = null;
        persistent = true;
        lastError = "";
        requiresReload = false;
        return true;
      } catch {
        persistent = false;
        lastError = "storage";
        return false;
      }
    },
    clear() {
      if (!writeEnabled) {
        persistent = false;
        lastError = "tab-lock";
        return false;
      }
      state = createDefaultState();
      baseline = cloneValue(state);
      if (!storage) {
        persistent = false;
        lastError = "storage";
        return false;
      }
      try {
        storage.removeItem(STATE_KEY);
        storage.removeItem(PREVIOUS_STATE_KEY);
        storage.removeItem(LEGACY_COUNTER_KEY);
        storage.removeItem(LEGACY_LEDGER_KEY);
        blockedByCorruption = false;
        corruptRaw = null;
        persistent = true;
        lastError = "";
        requiresReload = false;
        return true;
      } catch {
        persistent = false;
        lastError = "storage";
        return false;
      }
    }
  };
}

async function copyText(value) {
  if (!value) throw new Error("There is nothing to copy.");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue to the explicit-selection fallback.
  }

  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.className = "copy-fallback";
  document.body.append(area);
  area.select();
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Copy was blocked. Select and copy the text manually.");
}

function setStatus(element, message, state = "") {
  element.textContent = message;
  if (state) element.dataset.state = state;
  else delete element.dataset.state;
}

function persistenceMessage(store, successMessage) {
  if (store.persistent) {
    return store.requiresReload
      ? `${successMessage} Another tab’s independent changes were preserved too. Reload this tab before editing anything else.`
      : successMessage;
  }
  if (store.lastError === "reload") {
    return "Not saved: another Toolbox tab changed browser data. Download a backup of this tab’s drafts if needed, then reload before editing.";
  }
  if (store.lastError === "tab-lock") {
    return "Not saved: this tab does not hold the Toolbox single-writer lock. Keep the writer tab open, or close it and reload this tab; download a backup for any drafts you need first.";
  }
  if (store.lastError === "conflict") {
    return "Not saved: another open Toolbox tab changed the same field or entry. Download a backup of this tab before reloading if you need its version.";
  }
  if (store.lastError === "capacity") {
    return "Not saved: this local dataset reached its safety limit. Export a backup, then remove older entries before trying again.";
  }
  if (store.lastError === "corruption") {
    return "Not saved: existing browser data failed validation and was left untouched. Download a recovery backup before erasing or restoring.";
  }
  if (store.lastError === "validation") {
    return "Not saved: the in-tab data failed validation. Download a backup before reloading if you need to recover it.";
  }
  return "Not saved: browser storage is unavailable. The current value remains in this tab until it closes or reloads.";
}

function buildContinuityText(continuity) {
  const momentLabels = {
    ordinary: "Ordinary or unclear",
    heavy: "Heavy, not an immediate safety concern",
    immediate: "Immediate safety concern—real-time help is needed"
  };
  const lines = [
    "FRESH PAGE CARD",
    `Updated: ${continuity.updatedAt ? formatDateTime(continuity.updatedAt) : "not yet saved"}`,
    `Moment: ${momentLabels[continuity.moment]}`,
    "",
    "WHERE I WAS GOING",
    continuity.thread || "—",
    "",
    "ALREADY UNDERSTOOD—DO NOT MAKE ME RETEACH THIS",
    continuity.understood || "—",
    "",
    "WHAT I NEED NEXT",
    continuity.need || "—"
  ];
  return lines.join("\n");
}

function buildAgreementText(agreement) {
  const lines = [
    `${agreement.protocol.toUpperCase()} — SHARED AGREEMENT`,
    `People or roles: ${agreement.people || "not specified"}`,
    `Object, word, or signal: ${agreement.signal || "not specified"}`,
    `How either person pauses or ends it: ${agreement.pause || "not specified"}`,
    `Time limit: ${agreement.limit || "not specified"}`,
    `Review at: ${agreement.reviewAt !== null ? `${formatDateTime(agreement.reviewAt, agreement.reviewTimezone)} (${agreement.reviewTimezone})` : "not scheduled"}`,
    "",
    "CONSENT BOUNDARY",
    "Everyone can freely say no, pause, leave, or seek outside help. This agreement authorizes no force, restraint, confinement, surveillance, confiscation, retaliation, blocked communication or care, or secrecy about abuse, threats, imminent harm, or information someone is legally or ethically required to report."
  ];
  const checkin = agreement.checkin;
  if (checkin.updatedAt) {
    lines.push(
      "",
      "CHECK-IN",
      `Everyone freely consented: ${checkin.consent || "not answered"}`,
      `Tension: ${checkin.tension || "not answered"}`,
      `What worked: ${checkin.worked || "—"}`,
      `What changes: ${checkin.change || "—"}`,
      `Decision: ${checkin.next || "not decided"}`
    );
  }
  return lines.join("\n");
}

function init() {
  const $ = (id) => document.getElementById(id);
  const store = createStore();
  let continuitySaveTimer = null;
  let continuityDirty = new Set();
  let agreementDirty = new Set();
  let checkinDirty = new Set();
  let editingLedgerId = null;
  let deletedLedgerStack = [];
  let printOpenState = [];

  const storageWarning = $("storageWarning");
  if (!store.persistent) {
    storageWarning.hidden = false;
    if (store.blockedByCorruption) {
      storageWarning.textContent = "Saved Toolbox data appears damaged and has been left untouched. New changes will stay in this tab only. Download a recovery backup or erase all local data before saving again.";
    }
  }

  const writerLockName = "project-euphoria-toolbox-writer-v1";
  let releaseWriterLock = null;
  let writerLockPending = false;
  let pageActive = true;

  function showWriterLockWarning(message) {
    storageWarning.hidden = false;
    storageWarning.textContent = message;
  }

  function acquireWriterLock() {
    if (writerLockPending || releaseWriterLock) return;
    store.setWriteEnabled(false);
    const lockManager = globalThis.navigator?.locks;
    if (!lockManager?.request) {
      showWriterLockWarning("This browser cannot provide the single-writer lock the Toolbox requires. Existing data can be read and exported, but new changes stay in this tab only. Use a current browser with Web Locks support to persist changes safely.");
      return;
    }

    writerLockPending = true;
    Promise.resolve(
      lockManager.request(writerLockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        writerLockPending = false;
        if (!lock || !pageActive) {
          store.setWriteEnabled(false);
          if (pageActive) {
            showWriterLockWarning("Another Toolbox tab is the active writer. This tab can read, copy, and export, but it will not persist changes. Close the writer tab and reload this one before editing.");
          }
          return;
        }

        store.setWriteEnabled(true);
        if (store.storageAvailable && !store.blockedByCorruption && !store.requiresReload) {
          storageWarning.hidden = true;
        }
        await new Promise((resolve) => {
          releaseWriterLock = resolve;
        });
        releaseWriterLock = null;
        store.setWriteEnabled(false);
      })
    ).catch(() => {
      writerLockPending = false;
      store.setWriteEnabled(false);
      showWriterLockWarning("The Toolbox could not acquire its single-writer lock. Existing data can be read and exported, but new changes stay in this tab only. Reload to try again.");
    });
  }

  acquireWriterLock();
  window.addEventListener("pagehide", () => {
    pageActive = false;
    if (releaseWriterLock) {
      const release = releaseWriterLock;
      queueMicrotask(() => {
        store.setWriteEnabled(false);
        release();
      });
    } else {
      store.setWriteEnabled(false);
    }
  });
  window.addEventListener("pageshow", (event) => {
    pageActive = true;
    if (event.persisted) acquireWriterLock();
  });

  window.addEventListener("storage", (event) => {
    if (![STATE_KEY, PREVIOUS_STATE_KEY].includes(event.key)) return;
    store.markExternalChange();
    storageWarning.hidden = false;
    storageWarning.textContent = "Another Toolbox tab changed this origin’s browser data. This tab is now read-only for persistence: download a backup of any drafts you need, then reload before editing.";
  });

  function openTarget(id, moveFocus = true) {
    const target = document.getElementById(id);
    if (!target) return false;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.setAttribute("tabindex", "-1");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (moveFocus) target.focus({ preventScroll: true });
    return true;
  }

  $("routeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("needPicker").value;
    if (!id) {
      setStatus($("routeStatus"), "Choose the closest fit first.", "error");
      return;
    }
    history.replaceState(null, "", `#${id}`);
    openTarget(id);
    setStatus($("routeStatus"), "Opened the closest matching tool.", "success");
  });

  window.addEventListener("hashchange", () => {
    const id = safeFragmentId(location.hash);
    if (id) openTarget(id);
  });

  if (location.hash) {
    requestAnimationFrame(() => {
      const id = safeFragmentId(location.hash);
      const target = document.getElementById(id);
      if (target instanceof HTMLDetailsElement) target.open = true;
    });
  }

  // Fresh Page Card
  function populateContinuity() {
    const value = store.state.continuity;
    $("continuityThread").value = value.thread;
    $("continuityUnderstood").value = value.understood;
    $("continuityNeed").value = value.need;
    $("continuityMoment").value = value.moment;
    $("continuitySafety").hidden = value.moment !== "immediate";
  }

  function saveContinuity(announce = false) {
    const value = store.state.continuity;
    if (continuityDirty.has("thread")) value.thread = $("continuityThread").value.slice(0, 700);
    if (continuityDirty.has("understood")) value.understood = $("continuityUnderstood").value.slice(0, 700);
    if (continuityDirty.has("need")) value.need = $("continuityNeed").value.slice(0, 500);
    if (continuityDirty.has("moment")) value.moment = $("continuityMoment").value;
    if (continuityDirty.size) value.updatedAt = Date.now();
    const saved = store.save();
    if (saved) continuityDirty.clear();
    $("continuitySafety").hidden = value.moment !== "immediate";
    if (announce) {
      setStatus(
        $("continuityStatus"),
        persistenceMessage(store, `Saved in this browser at ${new Date().toLocaleTimeString()}.`),
        saved ? "success" : "error"
      );
    }
    return saved;
  }

  const continuityFields = {
    continuityThread: "thread",
    continuityUnderstood: "understood",
    continuityNeed: "need",
    continuityMoment: "moment"
  };
  Object.entries(continuityFields).forEach(([id, field]) => {
    $(id).addEventListener("input", () => {
      continuityDirty.add(field);
      clearTimeout(continuitySaveTimer);
      continuitySaveTimer = setTimeout(() => {
        continuitySaveTimer = null;
        saveContinuity(true);
      }, 550);
      if (id === "continuityMoment") {
        $("continuitySafety").hidden = $("continuityMoment").value !== "immediate";
      }
    });
  });

  $("copyContinuityBtn").addEventListener("click", async () => {
    const saved = saveContinuity(false);
    try {
      await copyText(buildContinuityText(store.state.continuity));
      const message = saved
        ? "Clean handoff copied. Clipboard contents may be visible to other software or synced devices."
        : `Clean handoff copied, but browser persistence failed. ${persistenceMessage(store, "")}`;
      setStatus($("continuityStatus"), message, saved ? "success" : "error");
    } catch (error) {
      setStatus($("continuityStatus"), error.message, "error");
    }
  });

  $("clearContinuityBtn").addEventListener("click", () => {
    if (!window.confirm("Clear the Fresh Page Card from this browser?")) return;
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    continuityDirty.clear();
    store.state.continuity = createDefaultState().continuity;
    const saved = store.save();
    populateContinuity();
    setStatus($("continuityStatus"), persistenceMessage(store, "Fresh Page Card cleared."), saved ? "success" : "error");
  });

  window.addEventListener("pagehide", () => {
    if (continuitySaveTimer !== null) {
      clearTimeout(continuitySaveTimer);
      continuitySaveTimer = null;
      saveContinuity(false);
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (continuitySaveTimer === null) return;
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    if (!saveContinuity(false)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Agreement and check-in
  function populateAgreement() {
    const value = store.state.agreement;
    $("agreementProtocol").value = value.protocol;
    $("agreementPeople").value = value.people;
    $("agreementSignal").value = value.signal;
    $("agreementPause").value = value.pause;
    $("agreementLimit").value = value.limit;
    $("agreementReviewAt").value = localDateTimeInputValue(value.reviewAt ?? Date.now() + 24 * 60 * 60 * 1000);
    $("agreementConsent").checked = value.consent;
    $("checkinConsent").value = value.checkin.consent;
    $("checkinTension").value = value.checkin.tension;
    $("checkinWorked").value = value.checkin.worked;
    $("checkinChange").value = value.checkin.change;
    $("checkinNext").value = value.checkin.next;
  }

  const agreementFields = {
    agreementProtocol: "protocol",
    agreementPeople: "people",
    agreementSignal: "signal",
    agreementPause: "pause",
    agreementLimit: "limit",
    agreementReviewAt: "reviewAt",
    agreementConsent: "consent"
  };
  Object.entries(agreementFields).forEach(([id, field]) => {
    $(id).addEventListener("input", () => agreementDirty.add(field));
  });

  const checkinFields = {
    checkinConsent: "consent",
    checkinTension: "tension",
    checkinWorked: "worked",
    checkinChange: "change",
    checkinNext: "next"
  };
  Object.entries(checkinFields).forEach(([id, field]) => {
    $(id).addEventListener("input", () => checkinDirty.add(field));
  });

  function readAgreement(commitSuggestedReview = false) {
    const value = store.state.agreement;
    if (agreementDirty.has("protocol")) value.protocol = $("agreementProtocol").value;
    if (agreementDirty.has("people")) value.people = $("agreementPeople").value.trim().slice(0, 120);
    if (agreementDirty.has("signal")) value.signal = $("agreementSignal").value.trim().slice(0, 120);
    if (agreementDirty.has("pause")) value.pause = $("agreementPause").value.trim().slice(0, 400);
    if (agreementDirty.has("limit")) value.limit = $("agreementLimit").value.trim().slice(0, 80);
    if (agreementDirty.has("reviewAt") || (commitSuggestedReview && value.reviewAt === null)) {
      value.reviewAt = parseLocalDateTime($("agreementReviewAt").value);
      value.reviewTimezone = getTimezone();
    }
    if (agreementDirty.has("consent")) value.consent = $("agreementConsent").checked;
    if (agreementDirty.size || (commitSuggestedReview && value.updatedAt === null)) value.updatedAt = Date.now();
    return value;
  }

  function readCheckin() {
    const value = store.state.agreement.checkin;
    if (checkinDirty.has("consent")) value.consent = $("checkinConsent").value;
    if (checkinDirty.has("tension")) value.tension = $("checkinTension").value;
    if (checkinDirty.has("worked")) value.worked = $("checkinWorked").value.trim().slice(0, 400);
    if (checkinDirty.has("change")) value.change = $("checkinChange").value.trim().slice(0, 400);
    if (checkinDirty.has("next")) value.next = $("checkinNext").value;
    if (checkinDirty.size) value.updatedAt = Date.now();
    return value;
  }

  function validateAgreement(value) {
    if (!value.signal) return "Name the object, word, or signal.";
    if (!value.pause) return "Write how either person can pause or end the agreement.";
    if (value.reviewAt === null) return "Choose a real review time.";
    if (!value.consent) return "Confirm the mutual-consent and noncoercion boundary.";
    return "";
  }

  $("agreementForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = readAgreement(true);
    const error = validateAgreement(value);
    if (error) {
      setStatus($("agreementStatus"), error, "error");
      return;
    }
    const saved = store.save();
    if (saved) agreementDirty.clear();
    setStatus($("agreementStatus"), persistenceMessage(store, "Agreement saved."), saved ? "success" : "error");
  });

  $("copyAgreementBtn").addEventListener("click", async () => {
    const value = readAgreement(true);
    const error = validateAgreement(value);
    if (error) {
      setStatus($("agreementStatus"), error, "error");
      return;
    }
    const saved = store.save();
    if (saved) agreementDirty.clear();
    try {
      await copyText(buildAgreementText(value));
      const message = saved
        ? "Agreement copied. Clipboard contents may be visible to other software or synced devices."
        : `Agreement copied, but browser persistence failed. ${persistenceMessage(store, "")}`;
      setStatus($("agreementStatus"), message, saved ? "success" : "error");
    } catch (copyError) {
      setStatus($("agreementStatus"), copyError.message, "error");
    }
  });

  $("clearAgreementBtn").addEventListener("click", () => {
    if (!window.confirm("Clear the agreement and its check-in from this browser?")) return;
    store.state.agreement = createDefaultState().agreement;
    agreementDirty.clear();
    checkinDirty.clear();
    const saved = store.save();
    populateAgreement();
    setStatus($("agreementStatus"), persistenceMessage(store, "Agreement cleared."), saved ? "success" : "error");
  });

  $("checkinForm").addEventListener("submit", (event) => {
    event.preventDefault();
    readCheckin();
    const saved = store.save();
    if (saved) checkinDirty.clear();
    setStatus($("checkinStatus"), persistenceMessage(store, "Check-in saved."), saved ? "success" : "error");
  });

  document.querySelectorAll("[data-plan-protocol]").forEach((button) => {
    button.addEventListener("click", () => {
      $("agreementProtocol").value = button.dataset.planProtocol;
      store.state.agreement.protocol = button.dataset.planProtocol;
      const saved = store.save();
      history.replaceState(null, "", "#agreement");
      openTarget("agreement");
      $("agreementSignal").focus();
      if (!saved) setStatus($("agreementStatus"), persistenceMessage(store, ""), "error");
    });
  });

  // Counter
  function archiveCurrent(endAt = Date.now()) {
    const current = store.state.counter.current;
    if (!current) return true;
    if (store.state.counter.history.length >= MAX_COUNTER_HISTORY) return false;
    store.state.counter.history.push({
      ...current,
      endAt,
      durationMs: Math.max(0, endAt - current.startAt)
    });
    store.state.counter.current = null;
    return true;
  }

  function renderCounter() {
    const current = store.state.counter.current;
    $("endChapterBtn").hidden = !current;
    if (!current) {
      $("countLabel").textContent = "No clock running";
      $("countNum").textContent = "—";
      $("countSub").textContent = "Name a decision, then start now or choose the real starting time.";
    } else {
      const delta = Date.now() - current.startAt;
      $("countLabel").textContent = current.label;
      $("countNum").textContent = formatDuration(Math.abs(delta));
      $("countSub").textContent =
        delta < 0
          ? `Begins ${formatDateTime(current.startAt, current.timezone)} (${current.timezone}).`
          : `Running since ${formatDateTime(current.startAt, current.timezone)} (${current.timezone}). Every second counts; none is a verdict.`;
    }

    const history = $("counterHistory");
    history.replaceChildren();
    const rows = [...store.state.counter.history].reverse();
    $("counterHistoryCount").textContent = String(rows.length);
    for (const row of rows) {
      const item = document.createElement("li");
      item.textContent = `${row.label}: ${formatDateTime(row.startAt, row.timezone)} → ${formatDateTime(row.endAt, row.timezone)} (${formatDuration(row.durationMs)}, ${row.timezone})`;
      history.append(item);
    }
    if (!rows.length) {
      const item = document.createElement("li");
      item.textContent = "No previous chapters.";
      history.append(item);
    }
  }

  function startCounter(startAt) {
    const label = $("counterName").value.trim().slice(0, 80);
    if (!label) {
      setStatus($("counterStatus"), "Name what you are counting first.", "error");
      $("counterName").focus();
      return;
    }
    if (!Number.isFinite(startAt)) {
      setStatus($("counterStatus"), "Choose a valid starting time.", "error");
      return;
    }
    if (store.state.counter.current) {
      const confirmed = window.confirm("Archive the current chapter and start a new one?");
      if (!confirmed) return;
      if (!archiveCurrent()) {
        setStatus($("counterStatus"), `History is full at ${MAX_COUNTER_HISTORY} chapters. Download a backup, then clear the history before starting another chapter.`, "error");
        return;
      }
    }
    store.state.counter.current = {
      id: makeId(),
      label,
      startAt,
      timezone: getTimezone()
    };
    const saved = store.save();
    renderCounter();
    setStatus($("counterStatus"), persistenceMessage(store, "Clock started. Any earlier chapter was preserved."), saved ? "success" : "error");
  }

  $("startNowBtn").addEventListener("click", () => startCounter(Date.now()));
  $("startAtBtn").addEventListener("click", () => {
    const value = $("startAt").value;
    if (!value) {
      setStatus($("counterStatus"), "Choose a starting time or use Start now.", "error");
      $("startAt").focus();
      return;
    }
    startCounter(parseLocalDateTime(value));
  });
  $("endChapterBtn").addEventListener("click", () => {
    if (!store.state.counter.current) return;
    if (!window.confirm("End this chapter and preserve it in history?")) return;
    if (!archiveCurrent()) {
      setStatus($("counterStatus"), `History is full at ${MAX_COUNTER_HISTORY} chapters. Download a backup, then clear the history before ending this chapter.`, "error");
      return;
    }
    const saved = store.save();
    renderCounter();
    setStatus($("counterStatus"), persistenceMessage(store, "Chapter ended and preserved."), saved ? "success" : "error");
  });

  $("clearCounterHistoryBtn").addEventListener("click", () => {
    if (!store.state.counter.history.length) {
      setStatus($("counterStatus"), "There is no counter history to clear.");
      return;
    }
    if (!window.confirm("Clear every archived counter chapter? Download a backup first if you may need them.")) return;
    store.state.counter.history = [];
    const saved = store.save();
    renderCounter();
    setStatus($("counterStatus"), persistenceMessage(store, "Counter history cleared."), saved ? "success" : "error");
  });

  // Ledger
  function renderLedger() {
    const body = $("ledgerBody");
    body.replaceChildren();
    const rows = [...store.state.ledger].sort((a, b) => {
      if (a.date === b.date) return b.createdAt - a.createdAt;
      return b.date.localeCompare(a.date);
    });
    $("ledgerEmpty").hidden = rows.length > 0;

    for (const row of rows) {
      const tr = document.createElement("tr");
      const dateCell = document.createElement("td");
      dateCell.textContent = formatCalendarDate(row.date);
      const resultCell = document.createElement("td");
      const result = document.createElement("span");
      result.className = `ledger-result ${row.result.toLowerCase().replaceAll(" ", "-")}`;
      result.textContent = row.result;
      resultCell.append(result);
      const textCell = document.createElement("td");
      textCell.textContent = row.text;
      const actionCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "table-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.dataset.editLedger = row.id;
      const entryDescription = `${row.result}: ${row.text.slice(0, 60)}`;
      edit.setAttribute("aria-label", `Edit ${entryDescription}, dated ${row.date}`);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.className = "quiet-button";
      remove.dataset.removeLedger = row.id;
      remove.setAttribute("aria-label", `Remove ${entryDescription}, dated ${row.date}`);
      actions.append(edit, remove);
      actionCell.append(actions);
      tr.append(dateCell, resultCell, textCell, actionCell);
      body.append(tr);
    }
  }

  function resetLedgerForm() {
    editingLedgerId = null;
    $("entryText").value = "";
    $("entryKind").value = "Worked";
    $("entryDate").value = localDateInputValue();
    $("ledgerSubmitBtn").textContent = "Add entry";
    $("cancelLedgerEditBtn").hidden = true;
  }

  $("ledgerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const entryText = $("entryText").value.trim().slice(0, 240);
    const date = $("entryDate").value;
    if (!entryText) {
      setStatus($("ledgerStatus"), "Write what happened first.", "error");
      $("entryText").focus();
      return;
    }
    if (!validCalendarDateString(date)) {
      setStatus($("ledgerStatus"), "Choose a valid local date.", "error");
      $("entryDate").focus();
      return;
    }
    if (editingLedgerId) {
      const row = store.state.ledger.find((item) => item.id === editingLedgerId);
      if (row) {
        row.text = entryText;
        row.result = $("entryKind").value;
        row.date = date;
      }
    } else {
      if (store.state.ledger.length >= MAX_LEDGER_ENTRIES) {
        setStatus($("ledgerStatus"), `The ledger is full at ${MAX_LEDGER_ENTRIES} entries. Download a backup, then remove entries before adding another.`, "error");
        return;
      }
      store.state.ledger.push({
        id: makeId(),
        text: entryText,
        result: $("entryKind").value,
        date,
        createdAt: Date.now()
      });
    }
    const saved = store.save();
    const action = editingLedgerId ? "Entry updated." : "Entry added with your local date.";
    setStatus($("ledgerStatus"), persistenceMessage(store, action), saved ? "success" : "error");
    resetLedgerForm();
    renderLedger();
  });

  $("ledgerBody").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-ledger]");
    if (editButton) {
      const row = store.state.ledger.find((item) => item.id === editButton.dataset.editLedger);
      if (!row) return;
      editingLedgerId = row.id;
      $("entryText").value = row.text;
      $("entryKind").value = row.result;
      $("entryDate").value = row.date;
      $("ledgerSubmitBtn").textContent = "Save changes";
      $("cancelLedgerEditBtn").hidden = false;
      $("entryText").focus();
      return;
    }

    const removeButton = event.target.closest("[data-remove-ledger]");
    if (removeButton) {
      const index = store.state.ledger.findIndex((item) => item.id === removeButton.dataset.removeLedger);
      if (index < 0) return;
      deletedLedgerStack.push({ entry: store.state.ledger[index], index });
      store.state.ledger.splice(index, 1);
      const saved = store.save();
      $("undoLedgerBtn").hidden = false;
      renderLedger();
      const successMessage = `Entry removed. ${deletedLedgerStack.length} removal${deletedLedgerStack.length === 1 ? "" : "s"} can be undone until reload or restore.`;
      setStatus($("ledgerStatus"), persistenceMessage(store, successMessage), saved ? "success" : "error");
    }
  });

  $("cancelLedgerEditBtn").addEventListener("click", () => {
    resetLedgerForm();
    setStatus($("ledgerStatus"), "Edit cancelled.");
  });

  $("undoLedgerBtn").addEventListener("click", () => {
    const deleted = deletedLedgerStack.pop();
    if (!deleted) return;
    store.state.ledger.splice(Math.min(deleted.index, store.state.ledger.length), 0, deleted.entry);
    $("undoLedgerBtn").hidden = deletedLedgerStack.length === 0;
    const saved = store.save();
    renderLedger();
    const successMessage = deletedLedgerStack.length
      ? `Removal undone. ${deletedLedgerStack.length} earlier removal${deletedLedgerStack.length === 1 ? "" : "s"} can still be undone.`
      : "Removal undone.";
    setStatus($("ledgerStatus"), persistenceMessage(store, successMessage), saved ? "success" : "error");
  });

  $("copyLedgerBtn").addEventListener("click", async () => {
    if (!store.state.ledger.length) {
      setStatus($("ledgerStatus"), "There are no ledger entries to copy.", "error");
      return;
    }
    const output = [...store.state.ledger]
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map((row) => `${row.date}  [${row.result}]  ${row.text}`)
      .join("\n");
    try {
      await copyText(output);
      setStatus($("ledgerStatus"), "Ledger copied. Clipboard contents may be visible to other software or synced devices.", "success");
    } catch (error) {
      setStatus($("ledgerStatus"), error.message, "error");
    }
  });

  $("exportLedgerCsvBtn").addEventListener("click", () => {
    if (!store.state.ledger.length) {
      setStatus($("ledgerStatus"), "There are no ledger entries to export.", "error");
      return;
    }
    const rows = [...store.state.ledger]
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map((row) => [row.date, row.result, row.text].map(escapeCsvCell).join(","));
    const csv = ["Date,Result,What happened", ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-euphoria-ledger-${localDateInputValue()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus($("ledgerStatus"), "Ledger CSV downloaded.", "success");
  });

  // Protocol controls
  document.querySelectorAll("[data-copy-protocol]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = document.getElementById(button.dataset.copyProtocol);
      const clone = card.cloneNode(true);
      clone.querySelectorAll("button").forEach((node) => node.remove());
      const output = clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
      try {
        await copyText(output);
        setStatus($("protocolStatus"), "Protocol copied. Review it together; copying does not create consent.", "success");
      } catch (error) {
        setStatus($("protocolStatus"), error.message, "error");
      }
    });
  });

  $("openAllBtn").addEventListener("click", () => {
    document.querySelectorAll(".protocol-card").forEach((card) => {
      card.open = true;
    });
  });

  $("closeAllBtn").addEventListener("click", () => {
    document.querySelectorAll(".protocol-card").forEach((card) => {
      card.open = false;
    });
  });

  $("printBtn").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => {
    printOpenState = [...document.querySelectorAll(".protocol-card")].map((card) => card.open);
    document.querySelectorAll(".protocol-card").forEach((card) => {
      card.open = true;
    });
  });
  window.addEventListener("afterprint", () => {
    document.querySelectorAll(".protocol-card").forEach((card, index) => {
      card.open = printOpenState[index] ?? false;
    });
  });

  // Backup, restore, erase
  $("exportBtn").addEventListener("click", () => {
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    saveContinuity(false);
    readAgreement();
    readCheckin();
    const saved = store.save();
    const payload = {
      schema: SCHEMA_NAME,
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: store.state
    };
    if (store.corruptRaw !== null) payload.recoveryRaw = store.corruptRaw;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-euphoria-toolbox-${localDateInputValue()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    let message = store.corruptRaw !== null
      ? "Recovery backup downloaded with this tab’s values and the untouched damaged browser data."
      : "Backup downloaded with the current visible form values.";
    message = saved ? persistenceMessage(store, message) : `${message} ${persistenceMessage(store, "")}`;
    setStatus($("dataStatus"), message, "success");
  });

  $("importFile").addEventListener("change", async () => {
    const file = $("importFile").files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup is larger than the 5 MB restore limit.");
      const parsed = JSON.parse(await file.text());
      if (parsed?.schema !== SCHEMA_NAME || !isRecord(parsed.state)) {
        throw new Error("This is not a supported Toolbox backup.");
      }
      let validation;
      if (parsed.version === SCHEMA_VERSION && parsed.state.version === SCHEMA_VERSION) {
        validation = validateStateSnapshot(parsed.state);
      } else if (parsed.version === 2 && parsed.state.version === 2) {
        validation = migrateV2Snapshot(parsed.state, getTimezone());
      } else {
        throw new Error(`Unsupported Toolbox backup version: ${String(parsed.version)}.`);
      }
      if (!validation.ok) throw new Error(`Backup failed validation: ${validation.error}`);
      const nextState = validation.state;
      const confirmation = `Restore ${nextState.ledger.length} ledger entr${nextState.ledger.length === 1 ? "y" : "ies"} and ${nextState.counter.history.length} archived counter chapter${nextState.counter.history.length === 1 ? "" : "s"}? This replaces the Toolbox data in this browser.`;
      if (!window.confirm(confirmation)) {
        $("importFile").value = "";
        return;
      }
      const persisted = store.replace(nextState, true);
      renderAll();
      storageWarning.hidden = persisted;
      if (!persisted) storageWarning.textContent = persistenceMessage(store, "");
      setStatus($("dataStatus"), persistenceMessage(store, "Backup restored."), persisted ? "success" : "error");
    } catch (error) {
      setStatus($("dataStatus"), error.message || "The backup could not be restored.", "error");
    } finally {
      $("importFile").value = "";
    }
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());

  $("clearAllBtn").addEventListener("click", () => {
    const confirmed = window.confirm("Erase all Toolbox data stored by this site in this browser? Download a backup first if you may need it.");
    if (!confirmed) return;
    const cleared = store.clear();
    renderAll();
    storageWarning.hidden = cleared;
    if (!cleared) storageWarning.textContent = persistenceMessage(store, "");
    setStatus($("dataStatus"), cleared ? "All Toolbox data was erased from this browser." : persistenceMessage(store, ""), cleared ? "success" : "error");
  });

  function renderAll() {
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    continuityDirty.clear();
    agreementDirty.clear();
    checkinDirty.clear();
    editingLedgerId = null;
    deletedLedgerStack = [];
    $("undoLedgerBtn").hidden = true;
    populateContinuity();
    populateAgreement();
    const current = store.state.counter.current;
    $("counterName").value = current?.label || "";
    $("startAt").value = current ? localDateTimeInputValue(current.startAt) : "";
    renderCounter();
    resetLedgerForm();
    renderLedger();
  }

  renderAll();
  setInterval(renderCounter, 1000);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  init();
}
