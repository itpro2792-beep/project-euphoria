// Keep the deployed alpha-0.2 key canonical. A cached v3 page knows how to
// delete or replace this key, so its explicit Clear and Restore controls stay
// truthful after schema 4 ships. The historical name is now intentionally
// stable across future schema versions.
const STATE_KEY = "euphoria_toolbox_v3";
const COMPATIBILITY_KEY = "euphoria_toolbox_v2";
const OBSOLETE_STATE_KEY = "euphoria_toolbox_state";
const OBSOLETE_RECOVERY_KEYS = [
  "euphoria_toolbox_migration_recovery_v3",
  "euphoria_toolbox_migration_recovery_v2",
  "euphoria_toolbox_migration_recovery_counter_v1",
  "euphoria_toolbox_migration_recovery_ledger_v1",
  "euphoria_toolbox_v1"
];
const LEGACY_COUNTER_KEY = "euphoria_counter_start";
const LEGACY_LEDGER_KEY = "euphoria_ledger_v1";
const TOOLBOX_STORAGE_KEYS = Object.freeze([
  STATE_KEY,
  COMPATIBILITY_KEY,
  LEGACY_COUNTER_KEY,
  LEGACY_LEDGER_KEY,
  OBSOLETE_STATE_KEY,
  ...OBSOLETE_RECOVERY_KEYS
]);
const SCHEMA_NAME = "project-euphoria-toolbox";
export const SCHEMA_VERSION = 4;

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

export const ROUTE_RECOMMENDATIONS = Object.freeze({
  "fresh-page": {
    target: "fresh-page",
    title: "Fresh Page Card",
    reason: "Preserve the unfinished thought, what is already understood, and the next thing you need.",
    boundary: "A handoff card is not real-time help. If someone may be unsafe, use the safety boundary instead."
  },
  "talking-stick": {
    target: "talking-stick",
    title: "Talking Stick",
    reason: "Use voluntary, timed turns so nobody has to fight for the floor.",
    boundary: "The object manages turns—not truth, decisions, or power. Anyone may decline or stop."
  },
  "safe-word": {
    target: "safe-word",
    title: "Safe Word",
    reason: "Use a talker-chosen signal as a voluntary brake for a monologue.",
    boundary: "Never use the signal to block danger, leaving, urgent help, or an attempt to name harm."
  },
  "off-record": {
    target: "off-record",
    title: "Off the Record",
    reason: "Agree on privacy and its real limits before the disclosure begins.",
    boundary: "Never promise secrecy you cannot keep or use privacy to conceal abuse, threats, or imminent harm."
  },
  "loop-detector": {
    target: "loop-detector",
    title: "Loop Detector",
    reason: "Use one pre-agreed word to flag repetition without diagnosing or dismissing the person.",
    boundary: "The receiver may say “not a loop.” The detector then stops arguing."
  },
  "no-flinch": {
    target: "no-flinch",
    title: "No-Flinch",
    reason: "Ask for calm listening while keeping direct safety questions and outside help available.",
    boundary: "Heavy is not automatically emergency, but the protocol never overrules genuine safety concern."
  },
  "paved-crossings": {
    target: "paved-crossings",
    title: "Paved Crossings",
    reason: "Co-design a voluntary, revocable plan before a known risky moment.",
    boundary: "It authorizes no force, restraint, confinement, surveillance, confiscation, retaliation, or delayed care."
  },
  agreement: {
    target: "agreement",
    title: "Protocol Agreement",
    reason: "Write the signal, stop condition, consent boundary, and review time together.",
    boundary: "An agreement is valid only while everyone can freely say no, pause, leave, or seek outside help."
  },
  "tonight-plan": {
    target: "tonight-plan",
    title: "Use-Tonight Plan",
    reason: "Turn one observable situation into one reversible step and a scheduled review.",
    boundary: "This is a coordination card—not diagnosis, treatment, crisis planning, or permission to control anyone."
  },
  counter: {
    target: "counter",
    title: "Since Counter",
    reason: "Name the decision and preserve elapsed time without turning a streak into a verdict.",
    boundary: "Starting again archives the earlier chapter. A broken streak is data, not damnation."
  },
  ledger: {
    target: "ledger",
    title: "Ledger",
    reason: "Date what worked, what did not, and what remains pending.",
    boundary: "The ledger belongs to its writer. Never require, seize, expose, or publish another person’s entries."
  },
  "immediate-help": {
    target: "immediate-help",
    title: "Real-time help boundary",
    reason: "Household protocols stop when someone may be unsafe or cannot freely say no or leave.",
    boundary: "In the United States or its territories, call or text 988 for crisis support; call 911 for a life-threatening emergency. Elsewhere, use local crisis or emergency services."
  }
});

export const PROTOCOL_BOUNDARIES = Object.freeze({
  "Talking Stick": ROUTE_RECOMMENDATIONS["talking-stick"].boundary,
  "Safe Word": ROUTE_RECOMMENDATIONS["safe-word"].boundary,
  "Off the Record": ROUTE_RECOMMENDATIONS["off-record"].boundary,
  "Loop Detector": ROUTE_RECOMMENDATIONS["loop-detector"].boundary,
  "No-Flinch": ROUTE_RECOMMENDATIONS["no-flinch"].boundary,
  "Paved Crossings": ROUTE_RECOMMENDATIONS["paved-crossings"].boundary,
  Receipts: ROUTE_RECOMMENDATIONS.ledger.boundary
});

function text(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validEpoch(value) {
  return finiteNumber(value) !== null && !Number.isNaN(new Date(value).getTime());
}

function validIsoInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
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
    plan: {
      title: "",
      situation: "",
      protocol: "Talking Stick",
      firstStep: "",
      stopCondition: "",
      checkAt: null,
      checkTimezone: "Local time",
      consent: false,
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

const STATE_KEYS = Object.freeze(["version", "counter", "ledger", "continuity", "plan", "agreement"]);
const LEGACY_STATE_KEYS = Object.freeze(["version", "counter", "ledger", "continuity", "agreement"]);
const COUNTER_KEYS = Object.freeze(["current", "history"]);
const CURRENT_COUNTER_KEYS = Object.freeze(["id", "label", "startAt", "timezone"]);
const HISTORY_COUNTER_KEYS = Object.freeze(["id", "label", "startAt", "timezone", "endAt", "durationMs"]);
const LEDGER_ROW_KEYS = Object.freeze(["id", "text", "result", "date", "createdAt"]);
const CONTINUITY_KEYS = Object.freeze(["thread", "understood", "need", "moment", "updatedAt"]);
const PLAN_KEYS = Object.freeze(["title", "situation", "protocol", "firstStep", "stopCondition", "checkAt", "checkTimezone", "consent", "updatedAt"]);
const AGREEMENT_KEYS = Object.freeze(["protocol", "people", "signal", "pause", "limit", "reviewAt", "reviewTimezone", "consent", "updatedAt", "checkin"]);
const V2_AGREEMENT_KEYS = Object.freeze(["protocol", "people", "signal", "pause", "limit", "reviewAt", "consent", "updatedAt", "checkin"]);
const CHECKIN_KEYS = Object.freeze(["consent", "tension", "worked", "change", "next", "updatedAt"]);

function exactKeyError(value, expectedKeys, path) {
  if (!isRecord(value)) return `${path} must be an object.`;
  const expected = new Set(expectedKeys);
  const actual = Object.keys(value);
  const missing = expectedKeys.filter((key) => !Object.hasOwn(value, key));
  const unexpected = actual.filter((key) => !expected.has(key));
  if (!missing.length && !unexpected.length) return "";
  const details = [];
  if (missing.length) details.push(`missing ${missing.join(", ")}`);
  if (unexpected.length) details.push(`unexpected ${unexpected.join(", ")}`);
  return `${path} has ${details.join("; ")}.`;
}

function validateCounterRecord(value, path, includeEnd = false) {
  if (!isRecord(value)) return `${path} must be an object.`;
  const keyError = exactKeyError(value, includeEnd ? HISTORY_COUNTER_KEYS : CURRENT_COUNTER_KEYS, path);
  if (keyError) return keyError;
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
  let keyError = exactKeyError(value, STATE_KEYS, "saved state");
  if (keyError) return fail(keyError);
  if (!isRecord(value.counter)) return fail("counter must be an object.");
  keyError = exactKeyError(value.counter, COUNTER_KEYS, "counter");
  if (keyError) return fail(keyError);
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
    keyError = exactKeyError(row, LEDGER_ROW_KEYS, path);
    if (keyError) return fail(keyError);
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
  keyError = exactKeyError(continuity, CONTINUITY_KEYS, "continuity");
  if (keyError) return fail(keyError);
  if (!validStoredString(continuity.thread, 700)) return fail("continuity.thread is invalid.");
  if (!validStoredString(continuity.understood, 700)) return fail("continuity.understood is invalid.");
  if (!validStoredString(continuity.need, 500)) return fail("continuity.need is invalid.");
  if (!["ordinary", "heavy", "immediate"].includes(continuity.moment)) return fail("continuity.moment is unsupported.");
  if (!validNullableTimestamp(continuity.updatedAt)) return fail("continuity.updatedAt is invalid.");

  if (!isRecord(value.plan)) return fail("plan must be an object.");
  const plan = value.plan;
  keyError = exactKeyError(plan, PLAN_KEYS, "plan");
  if (keyError) return fail(keyError);
  if (!validStoredString(plan.title, 80)) return fail("plan.title is invalid.");
  if (!validStoredString(plan.situation, 240)) return fail("plan.situation is invalid.");
  if (!PROTOCOL_NAMES.has(plan.protocol)) return fail("plan.protocol is unsupported.");
  if (!validStoredString(plan.firstStep, 400)) return fail("plan.firstStep is invalid.");
  if (!validStoredString(plan.stopCondition, 400)) return fail("plan.stopCondition is invalid.");
  if (!validNullableTimestamp(plan.checkAt)) return fail("plan.checkAt is invalid.");
  if (!validTimeZone(plan.checkTimezone)) return fail("plan.checkTimezone is invalid.");
  if (typeof plan.consent !== "boolean") return fail("plan.consent must be true or false.");
  if (!validNullableTimestamp(plan.updatedAt)) return fail("plan.updatedAt is invalid.");

  if (!isRecord(value.agreement)) return fail("agreement must be an object.");
  const agreement = value.agreement;
  keyError = exactKeyError(agreement, AGREEMENT_KEYS, "agreement");
  if (keyError) return fail(keyError);
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
  keyError = exactKeyError(checkin, CHECKIN_KEYS, "agreement.checkin");
  if (keyError) return fail(keyError);
  if (!["", "Yes", "No", "Unclear"].includes(checkin.consent)) return fail("agreement.checkin.consent is unsupported.");
  if (!["", "Lower", "Same", "Higher"].includes(checkin.tension)) return fail("agreement.checkin.tension is unsupported.");
  if (!validStoredString(checkin.worked, 400)) return fail("agreement.checkin.worked is invalid.");
  if (!validStoredString(checkin.change, 400)) return fail("agreement.checkin.change is invalid.");
  if (!["", "Use again", "Revise", "Retire"].includes(checkin.next)) return fail("agreement.checkin.next is unsupported.");
  if (!validNullableTimestamp(checkin.updatedAt)) return fail("agreement.checkin.updatedAt is invalid.");

  return { ok: true, error: "", state: normalizeState(value) };
}

export function migrateV3Snapshot(value) {
  const fail = (error) => ({ ok: false, error, state: null });
  if (!isRecord(value) || value.version !== 3) return fail("This is not a Toolbox v3 state snapshot.");
  const keyError = exactKeyError(value, LEGACY_STATE_KEYS, "v3 state");
  if (keyError) return fail(keyError);
  const migrated = cloneValue(value);
  migrated.version = SCHEMA_VERSION;
  migrated.plan = createDefaultState().plan;
  return validateStateSnapshot(migrated);
}

export function migrateV2Snapshot(value, timeZone = "Local time") {
  const fail = (error) => ({ ok: false, error, state: null });
  if (!isRecord(value) || value.version !== 2) return fail("This is not a Toolbox v2 state snapshot.");
  let keyError = exactKeyError(value, LEGACY_STATE_KEYS, "v2 state");
  if (keyError) return fail(keyError);
  if (!isRecord(value.agreement)) return fail("agreement must be an object.");
  keyError = exactKeyError(value.agreement, V2_AGREEMENT_KEYS, "v2 agreement");
  if (keyError) return fail(keyError);
  if (typeof value.agreement.reviewAt !== "string") return fail("agreement.reviewAt must be a v2 local date-time string.");
  const reviewAt = value.agreement.reviewAt ? parseLocalDateTime(value.agreement.reviewAt) : null;
  if (value.agreement.reviewAt && reviewAt === null) return fail("agreement.reviewAt is not a valid local date-time.");
  const migrated = cloneValue(value);
  migrated.version = SCHEMA_VERSION;
  migrated.plan = createDefaultState().plan;
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
  const planValue = value.plan || {};
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
    plan: {
      title: text(planValue.title, 80),
      situation: text(planValue.situation, 240),
      protocol: PROTOCOL_NAMES.has(planValue.protocol) ? planValue.protocol : base.plan.protocol,
      firstStep: text(planValue.firstStep, 400),
      stopCondition: text(planValue.stopCondition, 400),
      checkAt: validEpoch(planValue.checkAt) ? planValue.checkAt : null,
      checkTimezone: text(planValue.checkTimezone, 100) || "Local time",
      consent: planValue.consent === true,
      updatedAt: validEpoch(planValue.updatedAt) ? planValue.updatedAt : null
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

function mergeConsentCard(base, current, latest, fields, prefix, conflicts) {
  const pick = (value) => Object.fromEntries(fields.map((field) => [field, value[field]]));
  const baseCard = pick(base);
  const currentCard = pick(current);
  const latestCard = pick(latest);
  const changedHere = !valuesEqual(currentCard, baseCard);
  const changedElsewhere = !valuesEqual(latestCard, baseCard);

  if (!changedHere) return { ...cloneValue(latest), ...cloneValue(latestCard) };
  if (changedElsewhere && !valuesEqual(currentCard, latestCard)) {
    conflicts.push(`${prefix}.card`);
    return { ...cloneValue(latest), ...cloneValue(latestCard) };
  }
  return { ...cloneValue(latest), ...cloneValue(currentCard) };
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
  const plan = mergeConsentCard(
    base.plan,
    current.plan,
    latest.plan,
    ["title", "situation", "protocol", "firstStep", "stopCondition", "checkAt", "checkTimezone", "consent"],
    "plan",
    conflicts
  );
  plan.updatedAt = newestTimestamp(current.plan.updatedAt, latest.plan.updatedAt);
  const agreement = mergeConsentCard(
    base.agreement,
    current.agreement,
    latest.agreement,
    ["protocol", "people", "signal", "pause", "limit", "reviewAt", "reviewTimezone", "consent", "checkin"],
    "agreement",
    conflicts
  );
  agreement.updatedAt = newestTimestamp(current.agreement.updatedAt, latest.agreement.updatedAt);
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
      plan,
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

const RECOVERY_MAGIC = "PROJECT-EUPHORIA-TOOLBOX-RECOVERY-1";

function encodeMigrationRecovery(fromVersion, sources, timezone) {
  const parts = [
    `${RECOVERY_MAGIC}\n`,
    `${fromVersion}\n`,
    `${timezone.length}\n`,
    `${sources.length}\n`,
    timezone,
    "\n"
  ];
  for (const source of sources) {
    parts.push(`${source.key.length}\n`, `${source.raw.length}\n`, source.key, source.raw);
  }
  return parts.join("");
}

function parseMigrationRecovery(raw) {
  if (typeof raw !== "string" || !raw.startsWith(`${RECOVERY_MAGIC}\n`)) return null;
  let offset = RECOVERY_MAGIC.length + 1;
  const readLine = () => {
    const end = raw.indexOf("\n", offset);
    if (end < 0) return null;
    const value = raw.slice(offset, end);
    offset = end + 1;
    return value;
  };
  const readInteger = (maximum) => {
    const value = readLine();
    if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number <= maximum ? number : null;
  };

  const fromVersion = readInteger(3);
  const timezoneLength = readInteger(100);
  const sourceCount = readInteger(4);
  if (![1, 2, 3].includes(fromVersion) || timezoneLength === null || sourceCount === null || sourceCount < 1) return null;
  const timezone = raw.slice(offset, offset + timezoneLength);
  offset += timezoneLength;
  if (raw[offset] !== "\n" || !validTimeZone(timezone)) return null;
  offset += 1;

  const sources = [];
  for (let index = 0; index < sourceCount; index += 1) {
    const keyLength = readInteger(120);
    const rawLength = readInteger(20_000_000);
    if (keyLength === null || rawLength === null || keyLength < 1) return null;
    const key = raw.slice(offset, offset + keyLength);
    offset += keyLength;
    const sourceRaw = raw.slice(offset, offset + rawLength);
    offset += rawLength;
    if (key.length !== keyLength || sourceRaw.length !== rawLength) return null;
    sources.push({ key, raw: sourceRaw });
  }
  if (offset !== raw.length || new Set(sources.map((source) => source.key)).size !== sources.length) return null;

  const keys = sources.map((source) => source.key);
  const v1Keys = [LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY].filter((key) => keys.includes(key));
  if (fromVersion === 3) {
    const canonicalOrder = [
      STATE_KEY,
      COMPATIBILITY_KEY,
      LEGACY_COUNTER_KEY,
      LEGACY_LEDGER_KEY
    ].filter((key) => keys.includes(key));
    if (
      keys[0] !== STATE_KEY ||
      keys.length !== canonicalOrder.length ||
      keys.some((key, index) => key !== canonicalOrder[index])
    ) return null;
  } else if (fromVersion === 2) {
    const canonicalOrder = [
      COMPATIBILITY_KEY,
      LEGACY_COUNTER_KEY,
      LEGACY_LEDGER_KEY
    ].filter((key) => keys.includes(key));
    if (
      keys[0] !== COMPATIBILITY_KEY ||
      keys.length !== canonicalOrder.length ||
      keys.some((key, index) => key !== canonicalOrder[index])
    ) return null;
  } else if (keys.length !== v1Keys.length || keys.some((key, index) => key !== v1Keys[index])) {
    return null;
  }
  return { fromVersion, timezone, sources };
}

function migrateLegacySourceBytes(sources, timezone) {
  const sourceMap = new Map(sources.map((source) => [source.key, source.raw]));
  const migrated = createDefaultState();
  if (sourceMap.has(LEGACY_COUNTER_KEY)) {
    const counterRaw = sourceMap.get(LEGACY_COUNTER_KEY);
    const startAt = new Date(counterRaw).getTime();
    if (!Number.isFinite(startAt)) return { ok: false, error: "The legacy counter value is invalid.", state: null };
    migrated.counter.current = {
      id: makeId(),
      label: "Imported counter",
      startAt,
      timezone
    };
  }
  if (sourceMap.has(LEGACY_LEDGER_KEY)) {
    let rows;
    try {
      rows = JSON.parse(sourceMap.get(LEGACY_LEDGER_KEY));
    } catch {
      return { ok: false, error: "The legacy ledger value is invalid.", state: null };
    }
    if (!Array.isArray(rows)) return { ok: false, error: "The legacy ledger value is invalid.", state: null };
    migrated.ledger = [];
    for (const row of rows) {
      if (!isRecord(row) || typeof row.t !== "string" || !row.t.trim() || !validCalendarDateString(row.d)) {
        return { ok: false, error: "A legacy ledger row is invalid.", state: null };
      }
      migrated.ledger.push({
        id: makeId(),
        text: text(row.t, 240).trim(),
        result: row.k === "W" ? "Worked" : "Did not work",
        date: row.d,
        createdAt: new Date(`${row.d}T12:00:00`).getTime()
      });
    }
  }
  return validateStateSnapshot(migrated);
}

function migrateRecoveryRecord(record) {
  try {
    if (record.fromVersion === 3) {
      const source = record.sources.find((candidate) => candidate.key === STATE_KEY);
      return migrateV3Snapshot(JSON.parse(source.raw));
    }
    if (record.fromVersion === 2) {
      return migrateV2Snapshot(JSON.parse(record.sources[0].raw), record.timezone);
    }
    return migrateLegacySourceBytes(record.sources, record.timezone);
  } catch {
    return { ok: false, error: "The migration recovery source is invalid.", state: null };
  }
}

export function createStore() {
  let storage = null;
  let persistent = false;
  let blockedByCorruption = false;
  let corruptRaw = null;
  let quarantineSnapshot = null;
  let lastError = "";
  let requiresReload = false;
  let writeEnabled = false;
  let pendingMigration = null;
  let storageMode = "blank";
  let state = createDefaultState();
  let baseline = cloneValue(state);
  let expectedSnapshot = null;

  function readCandidateSnapshot() {
    const snapshot = {};
    for (const key of TOOLBOX_STORAGE_KEYS) snapshot[key] = storage.getItem(key);
    return snapshot;
  }

  function sameSnapshot(left, right, keys = TOOLBOX_STORAGE_KEYS) {
    return Boolean(left && right && keys.every((key) => left[key] === right[key]));
  }

  function snapshotForBackup(snapshot) {
    const candidateBytes = {};
    for (const key of TOOLBOX_STORAGE_KEYS) candidateBytes[key] = snapshot[key];
    return {
      format: "project-euphoria-toolbox-quarantine-v2",
      candidateBytes,
      active: snapshot[OBSOLETE_STATE_KEY],
      v3: snapshot[STATE_KEY],
      v2: snapshot[COMPATIBILITY_KEY],
      counterV1: snapshot[LEGACY_COUNTER_KEY],
      ledgerV1: snapshot[LEGACY_LEDGER_KEY],
      migrationRecovery: {
        v3: snapshot["euphoria_toolbox_migration_recovery_v3"],
        v2: snapshot["euphoria_toolbox_migration_recovery_v2"],
        counterV1: snapshot["euphoria_toolbox_migration_recovery_counter_v1"],
        ledgerV1: snapshot["euphoria_toolbox_migration_recovery_ledger_v1"]
      }
    };
  }

  function firstCandidateRaw(snapshot) {
    for (const key of TOOLBOX_STORAGE_KEYS) {
      if (snapshot[key] !== null) return snapshot[key];
    }
    return null;
  }

  function block(reason, raw, snapshot) {
    blockedByCorruption = true;
    corruptRaw = raw;
    quarantineSnapshot = snapshotForBackup(snapshot);
    persistent = false;
    lastError = reason;
    storageMode = "blocked";
    pendingMigration = null;
    state = createDefaultState();
    baseline = cloneValue(state);
    expectedSnapshot = { ...snapshot };
  }

  function hasObsoleteCandidate(snapshot) {
    return [OBSOLETE_STATE_KEY, ...OBSOLETE_RECOVERY_KEYS].some((key) => snapshot[key] !== null);
  }

  function hasV1Candidate(snapshot) {
    return snapshot[LEGACY_COUNTER_KEY] !== null || snapshot[LEGACY_LEDGER_KEY] !== null;
  }

  function classifyCanonical(raw) {
    if (raw === null) return { kind: "none" };
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version === SCHEMA_VERSION) {
        const validation = validateStateSnapshot(parsed);
        return validation.ok
          ? { kind: "v4", state: validation.state }
          : { kind: "corrupt", error: validation.error };
      }
      if (parsed?.version === 3) {
        const migration = migrateV3Snapshot(parsed);
        return migration.ok
          ? { kind: "v3", state: migration.state }
          : { kind: "corrupt", error: migration.error };
      }
      if (typeof parsed?.version === "number" && parsed.version > SCHEMA_VERSION) return { kind: "future" };
      return { kind: "corrupt" };
    } catch {
      return { kind: "corrupt" };
    }
  }

  function classifyCompatibility(raw) {
    if (raw === null) return { kind: "none" };
    if (raw.startsWith(`${RECOVERY_MAGIC}\n`)) {
      const record = parseMigrationRecovery(raw);
      if (!record) return { kind: "corrupt" };
      const migration = migrateRecoveryRecord(record);
      return migration.ok
        ? { kind: "recovery", record, state: migration.state }
        : { kind: "corrupt", error: migration.error };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 2) return { kind: "corrupt" };
      const migration = migrateV2Snapshot(parsed, getTimezone());
      return migration.ok
        ? { kind: "v2", state: migration.state }
        : { kind: "corrupt", error: migration.error };
    } catch {
      return { kind: "corrupt" };
    }
  }

  function stageMigration(fromVersion, sources, timezone, migratedState, recoveryRaw = null) {
    const encoded = recoveryRaw ?? encodeMigrationRecovery(fromVersion, sources, timezone);
    const parsed = parseMigrationRecovery(encoded);
    const validation = parsed ? migrateRecoveryRecord(parsed) : { ok: false };
    if (!parsed || !validation.ok) throw new TypeError("The migration recovery record could not be validated.");
    state = migratedState;
    baseline = cloneValue(state);
    storageMode = "migration";
    pendingMigration = {
      fromVersion,
      sources: sources.map((source) => ({ key: source.key, raw: source.raw })),
      timezone,
      recoveryRaw: encoded,
      state: migratedState,
      preRecoverySnapshot: Object.fromEntries(
        [STATE_KEY, COMPATIBILITY_KEY, LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY]
          .map((key) => [key, expectedSnapshot?.[key] ?? null])
      )
    };
  }

  function v1SourcesFromSnapshot(snapshot) {
    return [LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY]
      .filter((key) => snapshot[key] !== null)
      .map((key) => ({ key, raw: snapshot[key] }));
  }

  function recoveryMatchesRemainingV1(record, snapshot) {
    const recorded = new Map(record.sources.map((source) => [source.key, source.raw]));
    for (const key of [LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY]) {
      const currentRaw = snapshot[key];
      if (currentRaw !== null && recorded.get(key) !== currentRaw) return false;
    }
    return true;
  }

  function loadSnapshot(snapshot) {
    expectedSnapshot = { ...snapshot };
    if (hasObsoleteCandidate(snapshot)) {
      block("split-brain", firstCandidateRaw(snapshot), snapshot);
      return;
    }

    const canonicalRaw = snapshot[STATE_KEY];
    const compatibilityRaw = snapshot[COMPATIBILITY_KEY];
    const canonical = classifyCanonical(canonicalRaw);
    const compatibility = classifyCompatibility(compatibilityRaw);
    const hasV1 = hasV1Candidate(snapshot);

    if (canonical.kind === "future") {
      block("future-version", canonicalRaw, snapshot);
      return;
    }
    if (canonical.kind === "corrupt") {
      block("corruption", canonicalRaw, snapshot);
      return;
    }

    if (canonical.kind === "v4") {
      if (compatibility.kind === "corrupt") {
        block("corruption", compatibilityRaw, snapshot);
      } else if (compatibility.kind === "v2" || hasV1) {
        block("split-brain", compatibilityRaw ?? firstCandidateRaw(snapshot), snapshot);
      } else {
        state = canonical.state;
        baseline = cloneValue(state);
        storageMode = "active";
      }
      return;
    }

    if (canonical.kind === "v3") {
      const recordedCanonical = compatibility.kind === "recovery" && compatibility.record.fromVersion === 3
        ? compatibility.record.sources.find((source) => source.key === STATE_KEY)?.raw
        : null;
      if (recordedCanonical === canonicalRaw) {
        if (!recoveryMatchesRemainingV1(compatibility.record, snapshot)) {
          block("split-brain", compatibilityRaw, snapshot);
          return;
        }
        try {
          // This is an interrupted v3 roll-forward. Reuse the complete old
          // envelope so displaced C/D/E bytes are not lost after cleanup has
          // already begun.
          stageMigration(
            3,
            compatibility.record.sources,
            compatibility.record.timezone,
            canonical.state,
            compatibilityRaw
          );
        } catch {
          block("corruption", compatibilityRaw, snapshot);
        }
        return;
      }
      const sources = [{ key: STATE_KEY, raw: canonicalRaw }];
      // A deployed v3 Restore writes B and treats it as authoritative. If it
      // leaves an older/non-recovery C behind, keep those exact bytes inside
      // the new recovery record instead of discarding the evidence.
      if (compatibility.kind === "v2" || compatibility.kind === "corrupt") {
        sources.push({ key: COMPATIBILITY_KEY, raw: compatibilityRaw });
      }
      sources.push(...v1SourcesFromSnapshot(snapshot));
      try {
        stageMigration(3, sources, getTimezone(), canonical.state);
      } catch {
        block("corruption", canonicalRaw, snapshot);
      }
      return;
    }

    if (compatibility.kind === "corrupt") {
      block("corruption", compatibilityRaw, snapshot);
      return;
    }
    if (compatibility.kind === "v2") {
      try {
        stageMigration(
          2,
          [
            { key: COMPATIBILITY_KEY, raw: compatibilityRaw },
            ...v1SourcesFromSnapshot(snapshot)
          ],
          getTimezone(),
          compatibility.state
        );
      } catch {
        block("corruption", compatibilityRaw, snapshot);
      }
      return;
    }
    if (compatibility.kind === "recovery") {
      // Every deployed-0.2 Clear removes B before C. An orphaned recovery of
      // any source version is therefore indistinguishable from an interrupted
      // explicit erase. Never roll it forward automatically and resurrect
      // data; keep it quarantined for explicit backup, erase, or restore.
      block("split-brain", compatibilityRaw, snapshot);
      return;
    }
    if (hasV1) {
      const sources = v1SourcesFromSnapshot(snapshot);
      const timezone = getTimezone();
      const migration = migrateLegacySourceBytes(sources, timezone);
      if (!migration.ok) {
        block("corruption", firstCandidateRaw(snapshot), snapshot);
        return;
      }
      try {
        stageMigration(1, sources, timezone, migration.state);
      } catch {
        block("corruption", firstCandidateRaw(snapshot), snapshot);
      }
      return;
    }
    storageMode = "blank";
  }

  try {
    storage = window.localStorage;
    loadSnapshot(readCandidateSnapshot());
  } catch {
    storage = null;
    persistent = false;
    lastError = "storage";
    expectedSnapshot = null;
  }

  function restoreStorageValue(key, raw) {
    if (raw === null) storage.removeItem(key);
    else storage.setItem(key, raw);
  }

  function verifyWritableStorage() {
    const probe = "__euphoria_storage_probe__";
    let before = null;
    try {
      before = storage.getItem(probe);
      storage.setItem(probe, "1");
      if (storage.getItem(probe) !== "1") throw new Error("Storage probe verification failed.");
      restoreStorageValue(probe, before);
      return true;
    } catch {
      try {
        restoreStorageValue(probe, before);
      } catch {
        // Persistence stays disabled if even the exact probe rollback fails.
      }
      return false;
    }
  }

  function readSnapshotOrFail() {
    try {
      return readCandidateSnapshot();
    } catch {
      persistent = false;
      lastError = "storage";
      return null;
    }
  }

  function failForStaleSnapshot(snapshot, error = "reload") {
    if (sameSnapshot(snapshot, expectedSnapshot)) return false;
    requiresReload = true;
    persistent = false;
    lastError = error;
    return true;
  }

  function externalStorageRace() {
    const error = new Error("Browser storage changed during a write.");
    error.name = "ExternalStorageRaceError";
    return error;
  }

  function replaceCleanupFailure() {
    const error = new Error("The restored state was verified, but the prior recovery copy could not be removed.");
    error.name = "ReplaceCleanupError";
    return error;
  }

  function verifyCanonicalV4(raw) {
    if (raw === null) return null;
    const classification = classifyCanonical(raw);
    return classification.kind === "v4" ? classification.state : null;
  }

  function collectMigrationRecovery() {
    if (!storage) return {};
    try {
      const raw = storage.getItem(COMPATIBILITY_KEY);
      return parseMigrationRecovery(raw) ? { [COMPATIBILITY_KEY]: raw } : {};
    } catch {
      return {};
    }
  }

  function blockCurrentSnapshot(reason, raw, snapshot) {
    block(reason, raw, snapshot);
    return false;
  }

  function currentSnapshotAllowsV4(snapshot, { allowBlank = false } = {}) {
    if (hasObsoleteCandidate(snapshot) || hasV1Candidate(snapshot)) return false;
    const compatibility = classifyCompatibility(snapshot[COMPATIBILITY_KEY]);
    if (!["none", "recovery"].includes(compatibility.kind)) return false;
    const canonical = classifyCanonical(snapshot[STATE_KEY]);
    return canonical.kind === "v4" || allowBlank && canonical.kind === "none";
  }

  function matchesPendingPreRecoverySnapshot(snapshot) {
    if (!pendingMigration || hasObsoleteCandidate(snapshot)) return false;
    return [STATE_KEY, COMPATIBILITY_KEY, LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY]
      .every((key) => snapshot[key] === pendingMigration.preRecoverySnapshot[key]);
  }

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
    get quarantineSnapshot() {
      return quarantineSnapshot === null ? null : cloneValue(quarantineSnapshot);
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
    get migrationPending() {
      return pendingMigration !== null;
    },
    get migrationRecovery() {
      return collectMigrationRecovery();
    },
    setWriteEnabled(enabled) {
      writeEnabled = enabled === true;
      if (!writeEnabled) persistent = false;
    },
    markExternalChange() {
      requiresReload = true;
      persistent = false;
    },
    commitPendingMigration() {
      if (!writeEnabled) {
        lastError = "tab-lock";
        return false;
      }
      if (!storage) {
        lastError = "storage";
        return false;
      }
      if (blockedByCorruption || requiresReload) return false;
      const currentSnapshot = readSnapshotOrFail();
      if (!currentSnapshot) return false;
      if (failForStaleSnapshot(currentSnapshot, pendingMigration ? "migration-race" : "reload")) return false;
      if (!verifyWritableStorage()) {
        persistent = false;
        lastError = "storage";
        return false;
      }
      if (!pendingMigration) {
        const validMode =
          storageMode === "active" && currentSnapshotAllowsV4(currentSnapshot) ||
          storageMode === "blank" && currentSnapshotAllowsV4(currentSnapshot, { allowBlank: true });
        if (!validMode) return blockCurrentSnapshot("split-brain", firstCandidateRaw(currentSnapshot), currentSnapshot);
        persistent = true;
        lastError = "";
        return true;
      }
      try {
        let wroteRecovery = false;
        const migrationRace = () => {
          const error = new Error("A migration source changed during the locked write.");
          error.name = "MigrationRaceError";
          return error;
        };
        if (currentSnapshot[COMPATIBILITY_KEY] !== pendingMigration.recoveryRaw) {
          // A prior failed attempt may leave a verified recovery envelope, but
          // no retry may recreate it from stale in-memory bytes after a cached
          // page or another tab has cleared or replaced the primary source.
          if (!matchesPendingPreRecoverySnapshot(currentSnapshot)) throw migrationRace();
          storage.setItem(COMPATIBILITY_KEY, pendingMigration.recoveryRaw);
          wroteRecovery = true;
        }
        const recoveryWritten = storage.getItem(COMPATIBILITY_KEY);
        if (recoveryWritten !== pendingMigration.recoveryRaw) throw migrationRace();
        if (wroteRecovery) {
          const postRecoverySnapshot = readCandidateSnapshot();
          const sources = new Map(pendingMigration.sources.map((source) => [source.key, source.raw]));
          const primaryStillExact = pendingMigration.fromVersion === 3
            ? postRecoverySnapshot[STATE_KEY] === sources.get(STATE_KEY)
            : postRecoverySnapshot[STATE_KEY] === null;
          const v1StillExact = [LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY].every((key) =>
            postRecoverySnapshot[key] === (sources.has(key) ? sources.get(key) : null)
          );
          if (!primaryStillExact || !v1StillExact || hasObsoleteCandidate(postRecoverySnapshot)) {
            // We created C after a concurrent Clear/Restore changed the
            // primary bytes. Remove only our still-exact envelope; never
            // recreate or roll back the external writer's data.
            if (storage.getItem(COMPATIBILITY_KEY) === pendingMigration.recoveryRaw) {
              storage.removeItem(COMPATIBILITY_KEY);
            }
            throw migrationRace();
          }
          if (postRecoverySnapshot[COMPATIBILITY_KEY] !== pendingMigration.recoveryRaw) throw migrationRace();
        }
        const recoveryRecord = parseMigrationRecovery(recoveryWritten);
        const recoveryMigration = recoveryRecord ? migrateRecoveryRecord(recoveryRecord) : { ok: false };
        if (!recoveryRecord || !recoveryMigration.ok) {
          throw new Error("Migration recovery verification failed.");
        }
        if (
          pendingMigration.fromVersion === 1 ||
          pendingMigration.sources.some((source) =>
            source.key === LEGACY_COUNTER_KEY || source.key === LEGACY_LEDGER_KEY
          )
        ) {
          const recoveredSources = new Map(
            pendingMigration.sources.map((source) => [source.key, source.raw])
          );
          for (const key of [LEGACY_COUNTER_KEY, LEGACY_LEDGER_KEY]) {
            if (storage.getItem(COMPATIBILITY_KEY) !== pendingMigration.recoveryRaw) throw migrationRace();
            const currentRaw = storage.getItem(key);
            if (currentRaw !== null && recoveredSources.get(key) !== currentRaw) throw migrationRace();
            if (currentRaw !== null) storage.removeItem(key);
            if (storage.getItem(COMPATIBILITY_KEY) !== pendingMigration.recoveryRaw) throw migrationRace();
            if (storage.getItem(key) !== null) throw new Error("Legacy cleanup verification failed.");
          }
          if (storage.getItem(LEGACY_COUNTER_KEY) !== null || storage.getItem(LEGACY_LEDGER_KEY) !== null) {
            throw new Error("Legacy cleanup verification failed.");
          }
        }
        const expectedCanonicalRaw = pendingMigration.fromVersion === 3
          ? pendingMigration.sources.find((source) => source.key === STATE_KEY)?.raw
          : null;
        const beforeCanonicalWrite = readCandidateSnapshot();
        if (
          beforeCanonicalWrite[STATE_KEY] !== expectedCanonicalRaw ||
          beforeCanonicalWrite[COMPATIBILITY_KEY] !== pendingMigration.recoveryRaw ||
          hasV1Candidate(beforeCanonicalWrite) ||
          hasObsoleteCandidate(beforeCanonicalWrite)
        ) throw migrationRace();
        const candidate = JSON.stringify(pendingMigration.state);
        storage.setItem(STATE_KEY, candidate);
        const writtenRaw = storage.getItem(STATE_KEY);
        if (writtenRaw !== candidate) throw migrationRace();
        const validation = validateStateSnapshot(JSON.parse(writtenRaw));
        if (!validation.ok) throw new Error(validation.error);
        const afterMigration = readCandidateSnapshot();
        if (
          afterMigration[STATE_KEY] !== candidate ||
          afterMigration[COMPATIBILITY_KEY] !== pendingMigration.recoveryRaw ||
          hasV1Candidate(afterMigration) ||
          hasObsoleteCandidate(afterMigration)
        ) throw migrationRace();
        state = validation.state;
        baseline = cloneValue(state);
        pendingMigration = null;
        storageMode = "active";
        expectedSnapshot = afterMigration;
        persistent = true;
        lastError = "";
        requiresReload = false;
        return true;
      } catch (error) {
        try {
          expectedSnapshot = readCandidateSnapshot();
        } catch {
          // The already-verified recovery record remains the roll-forward source.
        }
        persistent = false;
        if (error?.name === "MigrationRaceError") requiresReload = true;
        lastError = error?.name === "MigrationRaceError" ? "migration-race" : "migration";
        return false;
      }
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
      if (pendingMigration) {
        persistent = false;
        lastError = "migration";
        return false;
      }
      if (blockedByCorruption) {
        persistent = false;
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
        const snapshot = readCandidateSnapshot();
        const nonCanonicalKeys = TOOLBOX_STORAGE_KEYS.filter((key) => key !== STATE_KEY);
        if (!sameSnapshot(snapshot, expectedSnapshot, nonCanonicalKeys)) {
          requiresReload = true;
          persistent = false;
          lastError = "reload";
          return false;
        }
        if (!currentSnapshotAllowsV4(snapshot, { allowBlank: storageMode === "blank" })) {
          const canonicalKind = classifyCanonical(snapshot[STATE_KEY]).kind;
          const reason = canonicalKind === "future" ? "future-version" : canonicalKind === "corrupt" ? "corruption" : "split-brain";
          return blockCurrentSnapshot(reason, snapshot[STATE_KEY] ?? firstCandidateRaw(snapshot), snapshot);
        }
        if (expectedSnapshot[STATE_KEY] !== null && snapshot[STATE_KEY] === null) {
          requiresReload = true;
          persistent = false;
          lastError = "reload";
          return false;
        }

        const raw = snapshot[STATE_KEY];
        let latest = createDefaultState();
        if (raw !== null) {
          latest = classifyCanonical(raw).state;
        }
        const absorbedExternalChange = snapshot[STATE_KEY] !== expectedSnapshot[STATE_KEY] && !valuesEqual(latest, baseline);
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
        const beforeRaw = snapshot[STATE_KEY];
        const candidate = JSON.stringify(mergedValidation.state);
        try {
          storage.setItem(STATE_KEY, candidate);
          const writtenRaw = storage.getItem(STATE_KEY);
          if (writtenRaw !== candidate) throw externalStorageRace();
          const written = validateStateSnapshot(JSON.parse(writtenRaw));
          if (!written.ok) throw new Error(written.error);
          const afterWrite = readCandidateSnapshot();
          if (
            afterWrite[STATE_KEY] !== candidate ||
            !sameSnapshot(afterWrite, snapshot, nonCanonicalKeys)
          ) throw externalStorageRace();
          state = written.state;
        } catch (error) {
          if (error?.name !== "ExternalStorageRaceError") {
            try {
              // Never overwrite null/different bytes: they may be a cached
              // page's Clear or Restore. Roll back only our still-live value.
              if (storage.getItem(STATE_KEY) === candidate) restoreStorageValue(STATE_KEY, beforeRaw);
            } catch {
              // A later read will quarantine an unverifiable canonical value.
            }
          }
          throw error;
        }
        baseline = cloneValue(state);
        storageMode = "active";
        expectedSnapshot = readCandidateSnapshot();
        persistent = true;
        lastError = "";
        requiresReload = absorbedExternalChange;
        return true;
      } catch (error) {
        persistent = false;
        if (error?.name === "ExternalStorageRaceError") requiresReload = true;
        lastError = error?.name === "ExternalStorageRaceError" ? "reload" : "storage";
        return false;
      }
    },
    replace(nextState, allowCorruptOverwrite = false) {
      if (!writeEnabled) {
        persistent = false;
        lastError = "tab-lock";
        return false;
      }
      if (requiresReload) {
        persistent = false;
        lastError = "reload";
        return false;
      }
      const validation = validateStateSnapshot(nextState);
      if (!validation.ok) {
        lastError = "validation";
        return false;
      }
      if (pendingMigration) {
        persistent = false;
        lastError = "migration";
        return false;
      }
      const explicitCorruptionOverwrite = blockedByCorruption && allowCorruptOverwrite && lastError === "corruption";
      if (blockedByCorruption && !explicitCorruptionOverwrite) {
        return false;
      }
      if (!storage) {
        state = validation.state;
        baseline = cloneValue(state);
        persistent = false;
        lastError = "storage";
        return false;
      }
      try {
        const snapshot = readCandidateSnapshot();
        if (failForStaleSnapshot(snapshot)) return false;
        const compatibility = classifyCompatibility(snapshot[COMPATIBILITY_KEY]);
        const otherConflict = hasObsoleteCandidate(snapshot) || hasV1Candidate(snapshot);
        const normalReplace = !blockedByCorruption && currentSnapshotAllowsV4(snapshot, { allowBlank: true });
        const safeCorruptionOverwrite =
          explicitCorruptionOverwrite &&
          !otherConflict &&
          ["none", "recovery"].includes(compatibility.kind) &&
          ["corrupt", "none"].includes(classifyCanonical(snapshot[STATE_KEY]).kind);
        if (!normalReplace && !safeCorruptionOverwrite) {
          lastError = "split-brain";
          return false;
        }
        const beforeB = snapshot[STATE_KEY];
        const candidate = JSON.stringify(validation.state);
        let canonicalValidated = false;
        try {
          storage.setItem(STATE_KEY, candidate);
          const writtenRaw = storage.getItem(STATE_KEY);
          if (writtenRaw !== candidate) throw externalStorageRace();
          const written = validateStateSnapshot(JSON.parse(writtenRaw));
          if (!written.ok) throw new Error(written.error);
          canonicalValidated = true;
          try {
            storage.removeItem(COMPATIBILITY_KEY);
            if (storage.getItem(COMPATIBILITY_KEY) !== null) throw replaceCleanupFailure();
          } catch (error) {
            if (error?.name === "ReplaceCleanupError") throw error;
            throw replaceCleanupFailure();
          }
          const afterReplace = readCandidateSnapshot();
          const untouchedKeys = TOOLBOX_STORAGE_KEYS.filter(
            (key) => key !== STATE_KEY && key !== COMPATIBILITY_KEY
          );
          if (
            afterReplace[STATE_KEY] !== candidate ||
            afterReplace[COMPATIBILITY_KEY] !== null ||
            !sameSnapshot(afterReplace, snapshot, untouchedKeys)
          ) throw externalStorageRace();
          state = written.state;
        } catch (error) {
          if (
            canonicalValidated &&
            error?.name === "ReplaceCleanupError" &&
            storage.getItem(STATE_KEY) === candidate
          ) {
            state = validation.state;
            baseline = cloneValue(state);
            blockedByCorruption = false;
            corruptRaw = null;
            quarantineSnapshot = null;
            pendingMigration = null;
            storageMode = "active";
            expectedSnapshot = readCandidateSnapshot();
            requiresReload = true;
            persistent = false;
            lastError = "replace-cleanup";
            return false;
          }
          if (canonicalValidated) requiresReload = true;
          if (!canonicalValidated && error?.name !== "ExternalStorageRaceError") {
            try {
              if (storage.getItem(STATE_KEY) === candidate) restoreStorageValue(STATE_KEY, beforeB);
            } catch {
              // A reload will quarantine any partial restore.
            }
          }
          throw error;
        }
        baseline = cloneValue(state);
        blockedByCorruption = false;
        corruptRaw = null;
        quarantineSnapshot = null;
        pendingMigration = null;
        storageMode = "active";
        expectedSnapshot = readCandidateSnapshot();
        persistent = true;
        lastError = "";
        requiresReload = false;
        return true;
      } catch (error) {
        persistent = false;
        if (error?.name === "ExternalStorageRaceError") requiresReload = true;
        lastError = error?.name === "ExternalStorageRaceError" ? "reload" : "storage";
        return false;
      }
    },
    clearMigrationRecovery() {
      if (!writeEnabled || !storage) {
        lastError = writeEnabled ? "storage" : "tab-lock";
        return false;
      }
      if (requiresReload) {
        persistent = false;
        lastError = "reload";
        return false;
      }
      try {
        if (blockedByCorruption || pendingMigration) {
          lastError = blockedByCorruption ? lastError : "migration";
          return false;
        }
        const snapshot = readCandidateSnapshot();
        if (failForStaleSnapshot(snapshot)) return false;
        if (!currentSnapshotAllowsV4(snapshot) || !verifyCanonicalV4(snapshot[STATE_KEY])) {
          lastError = "split-brain";
          return false;
        }
        const raw = snapshot[COMPATIBILITY_KEY];
        if (raw === null) return true;
        if (!parseMigrationRecovery(raw)) {
          lastError = "split-brain";
          return false;
        }
        storage.removeItem(COMPATIBILITY_KEY);
        if (storage.getItem(COMPATIBILITY_KEY) !== null) throw new Error("Recovery removal verification failed.");
        expectedSnapshot = readCandidateSnapshot();
        persistent = true;
        lastError = "";
        return true;
      } catch {
        requiresReload = true;
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
      if (requiresReload) {
        persistent = false;
        lastError = "reload";
        return false;
      }
      if (!storage) {
        persistent = false;
        lastError = "storage";
        return false;
      }
      try {
        const snapshot = readCandidateSnapshot();
        if (failForStaleSnapshot(snapshot)) return false;
        const nonCanonicalKeys = TOOLBOX_STORAGE_KEYS.filter((key) => key !== STATE_KEY);
        try {
          for (const key of nonCanonicalKeys) storage.removeItem(key);
          if (nonCanonicalKeys.some((key) => storage.getItem(key) !== null)) {
            throw new Error("Noncanonical erase verification failed.");
          }
          storage.removeItem(STATE_KEY);
          if (storage.getItem(STATE_KEY) !== null) throw new Error("Canonical erase verification failed.");
        } catch (error) {
          // Erase is an explicit destructive intent. Never recreate bytes that
          // were already removed; a reload can safely classify any remainder.
          throw error;
        }
        state = createDefaultState();
        baseline = cloneValue(state);
        blockedByCorruption = false;
        corruptRaw = null;
        quarantineSnapshot = null;
        pendingMigration = null;
        storageMode = "blank";
        expectedSnapshot = readCandidateSnapshot();
        persistent = true;
        lastError = "";
        requiresReload = false;
        return true;
      } catch {
        persistent = false;
        requiresReload = true;
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
  if (copied) {
    area.remove();
    return;
  }

  document.querySelector(".manual-copy-panel")?.remove();
  const panel = document.createElement("section");
  panel.className = "manual-copy-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "manualCopyTitle");
  const title = document.createElement("h2");
  title.id = "manualCopyTitle";
  title.textContent = "Copy manually";
  const instruction = document.createElement("p");
  instruction.textContent = "The browser blocked automatic copying. The complete text is selected below; use your device’s Copy command.";
  area.className = "manual-copy-text";
  area.setAttribute("aria-label", "Text to copy manually");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close manual copy";
  close.addEventListener("click", () => panel.remove());
  panel.append(title, instruction, area, close);
  document.body.append(panel);
  area.focus();
  area.select();
  throw new Error("Copy was blocked. The complete text is selected in the manual-copy panel.");
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
  if (store.lastError === "replace-cleanup") {
    return "Restore completed and the new Toolbox data was verified, but the previous migration recovery copy could not be removed. Reload before editing or using another data control.";
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
  if (store.lastError === "migration" || store.lastError === "migration-race") {
    return "Not saved: the locked migration could not be verified without risking older data. The original and recovery copy were left in place. Export what you need, then reload before trying again.";
  }
  if (store.lastError === "split-brain") {
    return "Not saved: current and legacy Toolbox datasets both exist. Neither was chosen or overwritten. Download a recovery backup before erasing or restoring.";
  }
  if (store.lastError === "future-version") {
    return "Not saved: this browser contains Toolbox data from a newer unsupported version. It was left untouched. Use the newer Toolbox version or export a recovery backup.";
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

export function buildPlanText(plan) {
  return [
    "USE-TONIGHT PLAN",
    `Name: ${plan.title || "—"}`,
    `Situation: ${plan.situation || "—"}`,
    `Protocol: ${plan.protocol}`,
    `Protocol boundary: ${PROTOCOL_BOUNDARIES[plan.protocol] || "Use only by mutual consent; stop when anyone declines, pauses, leaves, or seeks outside help."}`,
    `First step: ${plan.firstStep || "—"}`,
    `Stop condition: ${plan.stopCondition || "—"}`,
    `Review at: ${plan.checkAt !== null ? `${formatDateTime(plan.checkAt, plan.checkTimezone)} (${plan.checkTimezone})` : "not scheduled"}`,
    "",
    "CONSENT BOUNDARY",
    "Everyone involved can freely decline, pause, leave, or seek outside help. This plan authorizes no force, restraint, confinement, surveillance, confiscation, retaliation, blocked communication or care, or secrecy about abuse, threats, or imminent harm."
  ].join("\n");
}

export function validateUseTonightPlan(value, now = Date.now()) {
  if (!value?.title) return "Give the plan a short name.";
  if (!value.situation) return "Describe the observable situation without labeling a person.";
  if (!PROTOCOL_NAMES.has(value.protocol)) return "Choose a supported protocol.";
  if (!value.firstStep) return "Write the first small step.";
  if (!value.stopCondition) return "Write how either person can stop or leave the plan.";
  if (!validEpoch(value.checkAt)) return "Choose a real review time.";
  if (value.checkAt < now - 60_000) return "Choose a review time that has not already passed.";
  if (value.checkAt > now + 24 * 60 * 60 * 1000) return "Choose a review time within the next 24 hours.";
  if (!value.consent) return "Confirm the voluntary-consent and noncoercion boundary.";
  return "";
}

export function validateProtocolAgreement(value, now = Date.now()) {
  if (!value.signal) return "Name the object, word, or signal.";
  if (!value.pause) return "Write how either person can pause or end the agreement.";
  if (value.reviewAt === null) return "Choose a real review time.";
  if (value.reviewAt < now - 60 * 1000) return "Choose a review time that has not already passed.";
  if (value.reviewAt > now + 30 * 24 * 60 * 60 * 1000) return "Choose a review time within the next 30 days.";
  if (!value.consent) return "Confirm the mutual-consent and noncoercion boundary.";
  return "";
}

export function createSirenHandoff(continuity, options = {}) {
  const exportedAt = options.exportedAt || new Date().toISOString();
  const exportedEpoch = new Date(exportedAt).getTime();
  const requestId = options.requestId || makeId();
  const expiresAt = options.expiresAt || new Date(exportedEpoch + 24 * 60 * 60 * 1000).toISOString();
  return {
    schema: "project-euphoria-siren-handoff",
    version: 1,
    requestId,
    exportedAt,
    expiresAt,
    sourceVersion: `toolbox-schema-${SCHEMA_VERSION}`,
    source: "Project Euphoria Toolbox — Fresh Page Card",
    includedFields: ["thread", "understood", "need", "moment", "updatedAt"],
    consent: {
      explicitExport: true,
      purpose: "User-controlled Fresh Page handoff"
    },
    data: {
      thread: text(continuity?.thread, 700),
      understood: text(continuity?.understood, 700),
      need: text(continuity?.need, 500),
      moment: ["ordinary", "heavy", "immediate"].includes(continuity?.moment) ? continuity.moment : "ordinary",
      updatedAt: validEpoch(continuity?.updatedAt) ? continuity.updatedAt : null
    },
    boundary: "Local file handoff only. Import does not prove Siren ingestion, retention, understanding, identity, or consciousness."
  };
}

export function validateSirenHandoff(value, now = Date.now()) {
  const fail = (error) => ({ ok: false, error, continuity: null });
  if (!isRecord(value) || value.schema !== "project-euphoria-siren-handoff" || value.version !== 1) {
    return fail("This is not a supported Siren handoff file.");
  }
  const topLevelKeys = ["boundary", "consent", "data", "expiresAt", "exportedAt", "includedFields", "requestId", "schema", "source", "sourceVersion", "version"];
  if (exactKeyError(value, topLevelKeys, "Siren handoff")) return fail("The Siren handoff has unsupported fields.");
  if (!validStoredString(value.requestId, 100, { allowEmpty: false }) || !/^[A-Za-z0-9._:-]{8,100}$/.test(value.requestId)) {
    return fail("The Siren handoff request ID is invalid.");
  }
  if (!/^toolbox-schema-[1-9]\d*$/.test(value.sourceVersion)) return fail("The Siren handoff source version is unsupported.");
  if (value.source !== "Project Euphoria Toolbox — Fresh Page Card") return fail("The Siren handoff source is unsupported.");
  const includedFields = ["thread", "understood", "need", "moment", "updatedAt"];
  if (
    !Array.isArray(value.includedFields) ||
    value.includedFields.length !== includedFields.length ||
    !includedFields.every((field, index) => value.includedFields[index] === field)
  ) {
    return fail("The Siren handoff field-consent list is invalid.");
  }
  if (
    !isRecord(value.consent) ||
    exactKeyError(value.consent, ["explicitExport", "purpose"], "Siren handoff consent") ||
    value.consent.explicitExport !== true ||
    value.consent.purpose !== "User-controlled Fresh Page handoff"
  ) {
    return fail("The Siren handoff does not contain explicit field-export consent.");
  }
  const exportedEpoch = new Date(value.exportedAt).getTime();
  const expiresEpoch = new Date(value.expiresAt).getTime();
  if (!validIsoInstant(value.exportedAt)) {
    return fail("The Siren handoff export time is invalid.");
  }
  if (!validIsoInstant(value.expiresAt) || expiresEpoch <= exportedEpoch || expiresEpoch - exportedEpoch > 7 * 24 * 60 * 60 * 1000) {
    return fail("The Siren handoff expiry is invalid.");
  }
  if (exportedEpoch > now + 5 * 60 * 1000) return fail("The Siren handoff export time is in the future.");
  if (expiresEpoch < now) return fail("The Siren handoff has expired. Export a new one from the source device.");
  if (!isRecord(value.data)) return fail("The Siren handoff data is missing.");
  if (exactKeyError(value.data, ["moment", "need", "thread", "understood", "updatedAt"], "Siren handoff data")) {
    return fail("The Siren handoff data has unsupported fields.");
  }
  if (!validStoredString(value.data.thread, 700)) return fail("The handoff thread is invalid.");
  if (!validStoredString(value.data.understood, 700)) return fail("The handoff context is invalid.");
  if (!validStoredString(value.data.need, 500)) return fail("The handoff next step is invalid.");
  if (!["ordinary", "heavy", "immediate"].includes(value.data.moment)) return fail("The handoff moment is unsupported.");
  if (!validNullableTimestamp(value.data.updatedAt)) return fail("The handoff timestamp is invalid.");
  if (value.data.updatedAt !== null && value.data.updatedAt > exportedEpoch + 5 * 60 * 1000) {
    return fail("The handoff timestamp is later than its export time.");
  }
  if (value.boundary !== "Local file handoff only. Import does not prove Siren ingestion, retention, understanding, identity, or consciousness.") {
    return fail("The Siren handoff boundary is invalid.");
  }
  return { ok: true, error: "", continuity: cloneValue(value.data) };
}

function downloadTextFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildAgreementText(agreement) {
  const lines = [
    `${agreement.protocol.toUpperCase()} — SHARED AGREEMENT`,
    `Protocol boundary: ${PROTOCOL_BOUNDARIES[agreement.protocol] || "Use only by mutual consent; stop when anyone declines, pauses, leaves, or seeks outside help."}`,
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
  let continuityImportDraft = null;
  let planDirty = new Set();
  let agreementDirty = new Set();
  let agreementCheckinStale = false;
  let checkinDirty = new Set();
  let editingLedgerId = null;
  let deletedLedgerStack = [];
  let printOpenState = [];

  const storageWarning = $("storageWarning");
  if (!store.persistent) {
    storageWarning.hidden = false;
    if (store.blockedByCorruption) {
      const blockedMessages = {
        "future-version": "This browser contains Toolbox data from a newer, unsupported version. It was left untouched. Export a recovery backup; do not overwrite it with this version.",
        "split-brain": "Both current and legacy Toolbox datasets exist. They were left untouched because choosing one silently could lose data. Export a recovery backup before erasing anything.",
        corruption: "Saved Toolbox data appears damaged and has been left untouched. New changes will stay in this tab only. Download a recovery backup or erase all local data before saving again."
      };
      storageWarning.textContent = blockedMessages[store.lastError] || blockedMessages.corruption;
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
    document.body.dataset.writerState = "waiting";
    const lockManager = globalThis.navigator?.locks;
    if (!lockManager?.request) {
      document.body.dataset.writerState = "unsupported";
      showWriterLockWarning("This browser cannot provide the single-writer lock the Toolbox requires. Existing data can be read and exported, but new changes stay in this tab only. Use a current browser with Web Locks support to persist changes safely.");
      return;
    }

    writerLockPending = true;
    Promise.resolve(
      lockManager.request(writerLockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        writerLockPending = false;
        if (!lock || !pageActive) {
          store.setWriteEnabled(false);
          document.body.dataset.writerState = "reader";
          if (pageActive) {
            showWriterLockWarning("Another Toolbox tab is the active writer. This tab can read, copy, and export, but it will not persist changes. Close the writer tab and reload this one before editing.");
          }
          return;
        }

        store.setWriteEnabled(true);
        const ready = store.commitPendingMigration();
        if (!ready) {
          document.body.dataset.writerState = "error";
          showWriterLockWarning(persistenceMessage(store, ""));
        } else {
          document.body.dataset.writerState = "writer";
          renderAll();
        }
        if (store.storageAvailable && !store.blockedByCorruption && !store.requiresReload) {
          storageWarning.hidden = ready;
        }
        await new Promise((resolve) => {
          releaseWriterLock = resolve;
        });
        releaseWriterLock = null;
        store.setWriteEnabled(false);
        if (pageActive) document.body.dataset.writerState = "reader";
      })
    ).catch(() => {
      writerLockPending = false;
      store.setWriteEnabled(false);
      document.body.dataset.writerState = "error";
      showWriterLockWarning("The Toolbox could not acquire its single-writer lock. Existing data can be read and exported, but new changes stay in this tab only. Reload to try again.");
    });
  }

  acquireWriterLock();
  window.addEventListener("pagehide", () => {
    pageActive = false;
    document.body.dataset.writerState = "inactive";
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
    if (event.key !== null && !TOOLBOX_STORAGE_KEYS.includes(event.key)) return;
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
    const recommendation = ROUTE_RECOMMENDATIONS[id];
    if (!recommendation) {
      $("routeResult").hidden = true;
      setStatus($("routeStatus"), "Choose the closest fit first.", "error");
      return;
    }
    $("routeTitle").textContent = recommendation.title;
    $("routeReason").textContent = recommendation.reason;
    $("routeBoundary").textContent = recommendation.boundary;
    $("routeOpenBtn").dataset.routeTarget = recommendation.target;
    $("routeResult").hidden = false;
    $("routeOpenBtn").focus();
    setStatus($("routeStatus"), "Recommendation ready. You may use it, ignore it, or choose again.", "success");
  });

  $("routeOpenBtn").addEventListener("click", () => {
    const id = $("routeOpenBtn").dataset.routeTarget;
    if (!ROUTE_RECOMMENDATIONS[id] && !document.getElementById(id)) return;
    history.replaceState(null, "", `#${id}`);
    openTarget(id);
    setStatus($("routeStatus"), "Opened the selected tool.", "success");
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

  // Use-Tonight Plan
  function populatePlan() {
    const value = store.state.plan;
    $("planTitle").value = value.title;
    $("planSituation").value = value.situation;
    $("planProtocol").value = value.protocol;
    $("planFirstStep").value = value.firstStep;
    $("planStopCondition").value = value.stopCondition;
    $("planCheckAt").value = localDateTimeInputValue(value.checkAt ?? Date.now() + 2 * 60 * 60 * 1000);
    $("planConsent").checked = value.consent;
    $("planProtocolBoundary").textContent = PROTOCOL_BOUNDARIES[value.protocol];
  }

  const planFields = {
    planTitle: "title",
    planSituation: "situation",
    planProtocol: "protocol",
    planFirstStep: "firstStep",
    planStopCondition: "stopCondition",
    planCheckAt: "checkAt",
    planConsent: "consent"
  };
  Object.entries(planFields).forEach(([id, field]) => {
    $(id).addEventListener("input", () => {
      planDirty.add(field);
      if (field === "protocol") {
        $("planProtocolBoundary").textContent = PROTOCOL_BOUNDARIES[$("planProtocol").value];
      }
      if (field !== "consent") {
        $("planConsent").checked = false;
        planDirty.add("consent");
      }
    });
  });

  function readPlan(commitSuggestedCheck = false) {
    const value = cloneValue(store.state.plan);
    if (planDirty.has("title")) value.title = $("planTitle").value.trim().slice(0, 80);
    if (planDirty.has("situation")) value.situation = $("planSituation").value.trim().slice(0, 240);
    if (planDirty.has("protocol")) value.protocol = $("planProtocol").value;
    if (planDirty.has("firstStep")) value.firstStep = $("planFirstStep").value.trim().slice(0, 400);
    if (planDirty.has("stopCondition")) value.stopCondition = $("planStopCondition").value.trim().slice(0, 400);
    if (planDirty.has("checkAt") || (commitSuggestedCheck && value.checkAt === null)) {
      value.checkAt = parseLocalDateTime($("planCheckAt").value);
      value.checkTimezone = getTimezone();
    }
    if (planDirty.has("consent")) value.consent = $("planConsent").checked;
    if (planDirty.size || (commitSuggestedCheck && value.updatedAt === null)) value.updatedAt = Date.now();
    return value;
  }

  function persistPlan(value) {
    const previous = store.state.plan;
    store.state.plan = value;
    const saved = store.save();
    if (!saved) store.state.plan = previous;
    return saved;
  }

  function validatePlan(value) {
    return validateUseTonightPlan(value);
  }

  $("planForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = readPlan(true);
    const error = validatePlan(value);
    if (error) {
      setStatus($("planStatus"), error, "error");
      return;
    }
    const saved = persistPlan(value);
    if (saved) planDirty.clear();
    setStatus($("planStatus"), persistenceMessage(store, "Use-Tonight Plan saved."), saved ? "success" : "error");
  });

  $("copyPlanBtn").addEventListener("click", async () => {
    const value = readPlan(true);
    const error = validatePlan(value);
    if (error) {
      setStatus($("planStatus"), error, "error");
      return;
    }
    const saved = persistPlan(value);
    if (saved) planDirty.clear();
    try {
      await copyText(buildPlanText(value));
      const message = saved
        ? "Plan copied. Copying does not create consent; clipboard contents may be visible or synced."
        : `Plan copied, but browser persistence failed. ${persistenceMessage(store, "")}`;
      setStatus($("planStatus"), message, saved ? "success" : "error");
    } catch (copyError) {
      setStatus($("planStatus"), copyError.message, "error");
    }
  });

  $("clearPlanBtn").addEventListener("click", () => {
    if (!window.confirm("Clear the Use-Tonight Plan from this browser?")) return;
    const clearedPlan = createDefaultState().plan;
    planDirty.clear();
    const saved = persistPlan(clearedPlan);
    if (saved) populatePlan();
    setStatus($("planStatus"), persistenceMessage(store, "Use-Tonight Plan cleared."), saved ? "success" : "error");
  });

  // Fresh Page Card
  function populateContinuity() {
    const value = continuityImportDraft ?? store.state.continuity;
    $("continuityThread").value = value.thread;
    $("continuityUnderstood").value = value.understood;
    $("continuityNeed").value = value.need;
    $("continuityMoment").value = value.moment;
    $("continuitySafety").hidden = value.moment !== "immediate";
  }

  function readContinuity() {
    const value = cloneValue(continuityImportDraft ?? store.state.continuity);
    if (continuityDirty.has("thread")) value.thread = $("continuityThread").value.slice(0, 700);
    if (continuityDirty.has("understood")) value.understood = $("continuityUnderstood").value.slice(0, 700);
    if (continuityDirty.has("need")) value.need = $("continuityNeed").value.slice(0, 500);
    if (continuityDirty.has("moment")) value.moment = $("continuityMoment").value;
    if (continuityDirty.size) value.updatedAt = Date.now();
    return value;
  }

  function saveContinuity(announce = false) {
    const value = readContinuity();
    if (continuityImportDraft !== null) {
      continuityImportDraft = value;
      $("continuitySafety").hidden = value.moment !== "immediate";
      if (announce) {
        setStatus(
          $("continuityStatus"),
          "Imported handoff remains an unsaved draft. Choose Save Fresh Page Card to store it explicitly.",
          "success"
        );
      }
      return false;
    }
    const persistedContinuity = store.state.continuity;
    store.state.continuity = value;
    const saved = store.save();
    if (!saved) store.state.continuity = persistedContinuity;
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
      if (continuityImportDraft !== null) {
        setStatus(
          $("continuityStatus"),
          "Imported handoff remains an unsaved draft. Choose Save Fresh Page Card to store it explicitly.",
          "success"
        );
      } else {
        continuitySaveTimer = setTimeout(() => {
          continuitySaveTimer = null;
          saveContinuity(true);
        }, 550);
      }
      if (id === "continuityMoment") {
        $("continuitySafety").hidden = $("continuityMoment").value !== "immediate";
      }
    });
  });

  $("saveContinuityBtn").addEventListener("click", () => {
    if (continuityImportDraft === null) {
      saveContinuity(true);
      return;
    }
    saveContinuity(false);
    const importedDraft = cloneValue(continuityImportDraft);
    const persistedContinuity = store.state.continuity;
    store.state.continuity = importedDraft;
    continuityImportDraft = null;
    const saved = store.save();
    if (saved) {
      continuityDirty.clear();
      setStatus($("continuityStatus"), `Saved in this browser at ${new Date().toLocaleTimeString()}.`, "success");
    } else {
      store.state.continuity = persistedContinuity;
      continuityImportDraft = importedDraft;
      setStatus($("continuityStatus"), persistenceMessage(store, ""), "error");
    }
  });

  $("copyContinuityBtn").addEventListener("click", async () => {
    const importedDraft = continuityImportDraft !== null;
    const saved = saveContinuity(false);
    try {
      await copyText(buildContinuityText(readContinuity()));
      const message = importedDraft
        ? "Clean handoff copied from the unsaved imported draft. Nothing was stored; clipboard contents may be visible or synced."
        : saved
        ? "Clean handoff copied. Clipboard contents may be visible to other software or synced devices."
        : `Clean handoff copied, but browser persistence failed. ${persistenceMessage(store, "")}`;
      setStatus($("continuityStatus"), message, importedDraft || saved ? "success" : "error");
    } catch (error) {
      setStatus($("continuityStatus"), error.message, "error");
    }
  });

  $("exportSirenBtn").addEventListener("click", () => {
    const importedDraft = continuityImportDraft !== null;
    const continuity = readContinuity();
    if (continuity.moment === "immediate") {
      history.replaceState(null, "", "#immediate-help");
      openTarget("immediate-help");
      setStatus($("continuityStatus"), "Siren handoff not exported: an immediate safety concern needs real-time help, not a file workflow.", "error");
      return;
    }
    const saved = saveContinuity(false);
    const payload = createSirenHandoff(continuity);
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      "application/json",
      `project-euphoria-siren-handoff-${localDateInputValue()}.json`
    );
    const message = importedDraft
      ? "Siren handoff downloaded from the unsaved imported draft; nothing was stored. This page made no network request for this export. Your browser, operating system, downloads folder, clipboard, or sync services are outside that boundary."
      : saved
      ? "Siren handoff downloaded as plain-text JSON. This page made no network request for this export. Your browser, operating system, downloads folder, clipboard, or sync services are outside that boundary."
      : `Siren handoff downloaded from this tab, but browser persistence failed. ${persistenceMessage(store, "")}`;
    setStatus($("continuityStatus"), message, "success");
  });

  $("sirenImportFile").addEventListener("change", async () => {
    const file = $("sirenImportFile").files?.[0];
    if (!file) return;
    try {
      if (file.size > 100 * 1024) throw new Error("Siren handoff is larger than the 100 KB import limit.");
      const validation = validateSirenHandoff(JSON.parse(await file.text()));
      if (!validation.ok) throw new Error(validation.error);
      if (validation.continuity.moment === "immediate") {
        history.replaceState(null, "", "#immediate-help");
        openTarget("immediate-help");
        throw new Error("Siren handoff not imported: an immediate safety concern needs real-time help, not a file workflow.");
      }
      if (continuityImportDraft !== null) {
        throw new Error("A Siren handoff is already open as an unsaved draft. Save or clear that draft before importing another file.");
      }
      if (!window.confirm("Load this Siren handoff into the Fresh Page Card as an unsaved draft? Other Toolbox data will remain unchanged.")) return;
      clearTimeout(continuitySaveTimer);
      continuitySaveTimer = null;
      continuityImportDraft = cloneValue(validation.continuity);
      continuityDirty = new Set(["thread", "understood", "need", "moment"]);
      populateContinuity();
      setStatus(
        $("continuityStatus"),
        "Siren handoff loaded as an unsaved draft. Review it, then choose Save Fresh Page Card if you want it stored. This page made no network request for this import. Your browser, operating system, downloads folder, clipboard, or sync services are outside that boundary.",
        "success"
      );
    } catch (error) {
      setStatus($("continuityStatus"), error.message || "The Siren handoff could not be imported.", "error");
    } finally {
      $("sirenImportFile").value = "";
    }
  });

  $("importSirenBtn").addEventListener("click", () => $("sirenImportFile").click());

  $("clearContinuityBtn").addEventListener("click", () => {
    const prompt = continuityImportDraft !== null
      ? "Discard the unsaved imported draft and clear the stored Fresh Page Card from this browser?"
      : "Clear the Fresh Page Card from this browser?";
    if (!window.confirm(prompt)) return;
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    continuityDirty.clear();
    continuityImportDraft = null;
    store.state.continuity = createDefaultState().continuity;
    const saved = store.save();
    populateContinuity();
    setStatus($("continuityStatus"), persistenceMessage(store, "Fresh Page Card cleared."), saved ? "success" : "error");
  });

  window.addEventListener("pagehide", () => {
    if (continuitySaveTimer !== null && continuityImportDraft === null) {
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
    $("agreementProtocolBoundary").textContent = PROTOCOL_BOUNDARIES[value.protocol];
    $("checkinConsent").value = value.checkin.consent;
    $("checkinTension").value = value.checkin.tension;
    $("checkinWorked").value = value.checkin.worked;
    $("checkinChange").value = value.checkin.change;
    $("checkinNext").value = value.checkin.next;
    agreementCheckinStale = false;
  }

  function clearDisplayedCheckin() {
    $("checkinConsent").value = "";
    $("checkinTension").value = "";
    $("checkinWorked").value = "";
    $("checkinChange").value = "";
    $("checkinNext").value = "";
    checkinDirty.clear();
    agreementCheckinStale = true;
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
    $(id).addEventListener("input", () => {
      agreementDirty.add(field);
      if (field === "protocol") {
        $("agreementProtocolBoundary").textContent = PROTOCOL_BOUNDARIES[$("agreementProtocol").value];
      }
      if (field !== "consent") {
        $("agreementConsent").checked = false;
        agreementDirty.add("consent");
        clearDisplayedCheckin();
      }
    });
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
    const value = cloneValue(store.state.agreement);
    if (agreementCheckinStale) value.checkin = createDefaultState().agreement.checkin;
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
    const value = cloneValue(store.state.agreement.checkin);
    if (checkinDirty.has("consent")) value.consent = $("checkinConsent").value;
    if (checkinDirty.has("tension")) value.tension = $("checkinTension").value;
    if (checkinDirty.has("worked")) value.worked = $("checkinWorked").value.trim().slice(0, 400);
    if (checkinDirty.has("change")) value.change = $("checkinChange").value.trim().slice(0, 400);
    if (checkinDirty.has("next")) value.next = $("checkinNext").value;
    if (checkinDirty.size) value.updatedAt = Date.now();
    return value;
  }

  function persistAgreement(value) {
    const previous = store.state.agreement;
    store.state.agreement = value;
    const saved = store.save();
    if (!saved) store.state.agreement = previous;
    return saved;
  }

  function persistCheckin(value) {
    const previous = store.state.agreement.checkin;
    store.state.agreement.checkin = value;
    const saved = store.save();
    if (!saved) store.state.agreement.checkin = previous;
    return saved;
  }

  function validateAgreement(value) {
    return validateProtocolAgreement(value);
  }

  $("agreementForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = readAgreement(true);
    const error = validateAgreement(value);
    if (error) {
      setStatus($("agreementStatus"), error, "error");
      return;
    }
    const saved = persistAgreement(value);
    if (saved) {
      agreementDirty.clear();
      agreementCheckinStale = false;
    }
    setStatus($("agreementStatus"), persistenceMessage(store, "Agreement saved."), saved ? "success" : "error");
  });

  $("copyAgreementBtn").addEventListener("click", async () => {
    const value = readAgreement(true);
    const error = validateAgreement(value);
    if (error) {
      setStatus($("agreementStatus"), error, "error");
      return;
    }
    const saved = persistAgreement(value);
    if (saved) {
      agreementDirty.clear();
      agreementCheckinStale = false;
    }
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
    const clearedAgreement = createDefaultState().agreement;
    agreementDirty.clear();
    agreementCheckinStale = false;
    checkinDirty.clear();
    const saved = persistAgreement(clearedAgreement);
    if (saved) populateAgreement();
    setStatus($("agreementStatus"), persistenceMessage(store, "Agreement cleared."), saved ? "success" : "error");
  });

  $("checkinForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (agreementCheckinStale || agreementDirty.size) {
      setStatus($("checkinStatus"), "Save and reconfirm the revised agreement before recording a new check-in.", "error");
      return;
    }
    const value = readCheckin();
    const saved = persistCheckin(value);
    if (saved) checkinDirty.clear();
    setStatus($("checkinStatus"), persistenceMessage(store, "Check-in saved."), saved ? "success" : "error");
  });

  document.querySelectorAll("[data-plan-protocol]").forEach((button) => {
    button.addEventListener("click", () => {
      $("agreementProtocol").value = button.dataset.planProtocol;
      $("agreementProtocolBoundary").textContent = PROTOCOL_BOUNDARIES[button.dataset.planProtocol];
      $("agreementConsent").checked = false;
      agreementDirty.add("protocol");
      agreementDirty.add("consent");
      clearDisplayedCheckin();
      history.replaceState(null, "", "#agreement");
      openTarget("agreement");
      $("agreementSignal").focus();
      setStatus($("agreementStatus"), "Protocol selected. Review the complete agreement and confirm consent before saving.");
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
    if (continuityImportDraft !== null) {
      setStatus(
        $("dataStatus"),
        "Backup not downloaded: the imported Siren handoff is still an unsaved draft. Save or clear that draft first.",
        "error"
      );
      return;
    }
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    const backupState = cloneValue(store.state);
    backupState.continuity = readContinuity();
    backupState.plan = readPlan();
    backupState.agreement = readAgreement();
    if (!agreementCheckinStale) backupState.agreement.checkin = readCheckin();
    const backupValidation = validateStateSnapshot(backupState);
    if (!backupValidation.ok) {
      setStatus($("dataStatus"), `Backup not downloaded: ${backupValidation.error}`, "error");
      return;
    }
    const payload = {
      schema: SCHEMA_NAME,
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: backupValidation.state
    };
    if (store.corruptRaw !== null) payload.recoveryRaw = store.corruptRaw;
    if (store.quarantineSnapshot !== null) payload.quarantineSnapshot = store.quarantineSnapshot;
    if (Object.keys(store.migrationRecovery).length) payload.migrationRecovery = store.migrationRecovery;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-euphoria-toolbox-${localDateInputValue()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    let message = store.quarantineSnapshot !== null
      ? "Recovery backup downloaded with this tab’s values and every readable current, legacy, and migration-recovery candidate left untouched in browser storage."
      : "Backup downloaded with the current visible form values. Exporting did not change browser storage.";
    setStatus($("dataStatus"), message, "success");
  });

  $("importFile").addEventListener("change", async () => {
    const file = $("importFile").files?.[0];
    if (!file) return;
    try {
      if (continuityImportDraft !== null) {
        throw new Error("Backup restore is blocked while a Siren handoff is open as an unsaved draft. Save or clear that draft first.");
      }
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup is larger than the 5 MB restore limit.");
      const parsed = JSON.parse(await file.text());
      if (parsed?.schema !== SCHEMA_NAME || !isRecord(parsed.state)) {
        throw new Error("This is not a supported Toolbox backup.");
      }
      let validation;
      if (parsed.version === SCHEMA_VERSION && parsed.state.version === SCHEMA_VERSION) {
        validation = validateStateSnapshot(parsed.state);
      } else if (parsed.version === 3 && parsed.state.version === 3) {
        validation = migrateV3Snapshot(parsed.state);
      } else if (parsed.version === 2 && parsed.state.version === 2) {
        validation = migrateV2Snapshot(parsed.state, getTimezone());
      } else {
        throw new Error(`Unsupported Toolbox backup version: ${String(parsed.version)}.`);
      }
      if (!validation.ok) throw new Error(`Backup failed validation: ${validation.error}`);
      const nextState = validation.state;
      nextState.plan.consent = false;
      nextState.agreement.consent = false;
      const confirmation = `Restore all Toolbox data from this file—including the Fresh Page Card, Use-Tonight Plan, protocol agreement and check-in, current counter, ${nextState.counter.history.length} archived chapter${nextState.counter.history.length === 1 ? "" : "s"}, and ${nextState.ledger.length} ledger entr${nextState.ledger.length === 1 ? "y" : "ies"}? This replaces all current Toolbox data in this browser. Plan and agreement confirmations will be reset so everyone can review the restored cards again.`;
      if (!window.confirm(confirmation)) {
        $("importFile").value = "";
        return;
      }
      const persisted = store.replace(nextState, true);
      if (persisted) {
        continuityImportDraft = null;
        continuityDirty.clear();
      }
      renderAll();
      if (persisted) document.body.dataset.writerState = "writer";
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

  $("clearMigrationRecoveryBtn").addEventListener("click", () => {
    if (!window.confirm("Delete the byte-exact migration recovery copy? The current Toolbox data will remain.")) return;
    const cleared = store.clearMigrationRecovery();
    $("clearMigrationRecoveryBtn").hidden = cleared;
    setStatus(
      $("dataStatus"),
      cleared ? "Migration recovery copy deleted. Current Toolbox data remains." : persistenceMessage(store, ""),
      cleared ? "success" : "error"
    );
  });

  $("clearAllBtn").addEventListener("click", () => {
    if (continuityImportDraft !== null) {
      setStatus(
        $("dataStatus"),
        "Erase all is blocked while a Siren handoff is open as an unsaved draft. Save or clear that draft first.",
        "error"
      );
      return;
    }
    const confirmed = window.confirm("Erase all Toolbox data stored by this site in this browser? Download a backup first if you may need it.");
    if (!confirmed) return;
    const cleared = store.clear();
    if (cleared) continuityImportDraft = null;
    renderAll();
    if (cleared) document.body.dataset.writerState = "writer";
    storageWarning.hidden = cleared;
    if (!cleared) storageWarning.textContent = persistenceMessage(store, "");
    setStatus($("dataStatus"), cleared ? "All Toolbox data was erased from this browser." : persistenceMessage(store, ""), cleared ? "success" : "error");
  });

  function renderAll() {
    clearTimeout(continuitySaveTimer);
    continuitySaveTimer = null;
    continuityDirty.clear();
    planDirty.clear();
    agreementDirty.clear();
    agreementCheckinStale = false;
    checkinDirty.clear();
    editingLedgerId = null;
    deletedLedgerStack = [];
    $("undoLedgerBtn").hidden = true;
    $("clearMigrationRecoveryBtn").hidden = Object.keys(store.migrationRecovery).length === 0;
    populateContinuity();
    populatePlan();
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
