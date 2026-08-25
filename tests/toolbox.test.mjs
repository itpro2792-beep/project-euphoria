import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTOCOL_BOUNDARIES,
  ROUTE_RECOMMENDATIONS,
  SCHEMA_VERSION,
  buildAgreementText,
  buildPlanText,
  createDefaultState,
  createSirenHandoff,
  createStore,
  escapeCsvCell,
  formatDateTime,
  formatDuration,
  localDateInputValue,
  localDateTimeInputValue,
  mergeStates,
  migrateV2Snapshot,
  migrateV3Snapshot,
  normalizeState,
  parseLocalDateTime,
  safeFragmentId,
  validCalendarDateString,
  validateSirenHandoff,
  validateProtocolAgreement,
  validateStateSnapshot,
  validateUseTonightPlan
} from "../toolbox/app.v0.3.0.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE_KEYS = Object.freeze({
  canonical: "euphoria_toolbox_v3",
  compatibility: "euphoria_toolbox_v2",
  counterV1: "euphoria_counter_start",
  ledgerV1: "euphoria_ledger_v1",
  obsoleteActive: "euphoria_toolbox_state",
  obsoleteV1: "euphoria_toolbox_v1",
  obsoleteRecoveryV3: "euphoria_toolbox_migration_recovery_v3",
  obsoleteRecoveryV2: "euphoria_toolbox_migration_recovery_v2",
  obsoleteRecoveryCounter: "euphoria_toolbox_migration_recovery_counter_v1",
  obsoleteRecoveryLedger: "euphoria_toolbox_migration_recovery_ledger_v1"
});
const ALL_STORAGE_KEYS = Object.freeze(Object.values(STORAGE_KEYS));
const RECOVERY_MAGIC = "PROJECT-EUPHORIA-TOOLBOX-RECOVERY-1";

function encodeRecovery(fromVersion, sources, timezone = "UTC") {
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

function v3Snapshot({ thread = "v3 thread", rows = [] } = {}) {
  const state = createDefaultState();
  state.version = 3;
  delete state.plan;
  state.continuity.thread = thread;
  state.ledger = rows;
  return state;
}

function v2Snapshot({ thread = "v2 thread", rows = [] } = {}) {
  const state = createDefaultState();
  state.version = 2;
  delete state.plan;
  state.continuity.thread = thread;
  state.ledger = rows;
  state.agreement.reviewAt = "";
  delete state.agreement.reviewTimezone;
  return state;
}

const ledgerRow = (id, text = `row ${id}`) => ({
  id,
  text,
  result: "Worked",
  date: "2026-08-25",
  createdAt: Date.UTC(2026, 7, 25, 12, 0, 0)
});

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.failNextSetFor = null;
    this.failNextRemoveFor = null;
    this.operations = [];
    this.afterSet = null;
    this.afterRemove = null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.operations.push(["set", key]);
    if (this.failNextSetFor === key) {
      this.failNextSetFor = null;
      throw new Error(`Injected write failure for ${key}`);
    }
    this.values.set(key, String(value));
    this.afterSet?.(key, String(value), this);
  }

  removeItem(key) {
    this.operations.push(["remove", key]);
    if (this.failNextRemoveFor === key) {
      this.failNextRemoveFor = null;
      throw new Error(`Injected remove failure for ${key}`);
    }
    this.values.delete(key);
    this.afterRemove?.(key, this);
  }
}

function withStorageWindow(storage, callback) {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    return callback();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("datetime-local round trip preserves the instant to the minute in any timezone", () => {
  const epoch = Date.now();
  const input = localDateTimeInputValue(epoch);
  const parsed = parseLocalDateTime(input);
  assert.ok(Number.isFinite(parsed));
  assert.ok(Math.abs(parsed - epoch) < 60_000);
});

test("datetime parser rejects impossible dates and daylight-saving gaps", (context) => {
  assert.equal(parseLocalDateTime("2026-02-30T12:00"), null);
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== "America/New_York") {
    context.skip("DST-gap assertion runs in the America/New_York matrix job");
    return;
  }
  assert.equal(parseLocalDateTime("2026-03-08T02:30"), null);
});

test("local ledger date does not use tomorrow's UTC date", () => {
  const lateLocalTime = new Date(2026, 7, 25, 23, 30, 0);
  assert.equal(localDateInputValue(lateLocalTime), "2026-08-25");
});

test("calendar validation rejects normalized impossible dates", () => {
  assert.equal(validCalendarDateString("2024-02-29"), true);
  assert.equal(validCalendarDateString("2026-02-29"), false);
  assert.equal(validCalendarDateString("2026-04-31"), false);
});

test("stored timezone controls rendering even when the process timezone differs", () => {
  const epoch = Date.UTC(2026, 7, 25, 16, 0, 0);
  const expected = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York"
  }).format(new Date(epoch));
  assert.equal(formatDateTime(epoch, "America/New_York"), expected);
  assert.notEqual(formatDateTime(epoch, "America/New_York"), formatDateTime(epoch, "Pacific/Auckland"));
  assert.equal(formatDateTime(9e15, "UTC"), "Invalid date");
});

test("duration is nonnegative and includes seconds", () => {
  assert.equal(formatDuration(-10), "00h 00m 00s");
  assert.equal(formatDuration(90_061_000), "1d 01h 01m 01s");
});

test("CSV export neutralizes formula-leading cells and escapes quotes", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(\"bad\")"), "\"'=HYPERLINK(\"\"bad\"\")\"");
  assert.equal(escapeCsvCell('said "hello"'), '"said ""hello"""');
});

test("malformed URL fragments fail closed", () => {
  assert.equal(safeFragmentId("#ledger"), "ledger");
  assert.equal(safeFragmentId("#%"), "");
});

test("default state is a valid current snapshot with all five instruments", () => {
  const state = createDefaultState();
  assert.equal(state.version, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(state).sort(), ["agreement", "continuity", "counter", "ledger", "plan", "version"]);
  assert.equal(validateStateSnapshot(state).ok, true);
});

test("normalization rejects invalid rows without throwing", () => {
  const state = normalizeState({
    version: SCHEMA_VERSION,
    counter: {
      current: { label: "", startAt: "not a number" },
      history: [{ label: "old", startAt: 10, endAt: 20, durationMs: 10 }]
    },
    ledger: [
      { text: "real row", result: "Worked", date: "2026-08-25", createdAt: 1 },
      { text: "", result: "Worked", date: "2026-08-25" },
      { text: "bad date", result: "Pending", date: "tomorrow" }
    ]
  });

  assert.equal(state.counter.current, null);
  assert.equal(state.counter.history.length, 1);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0].text, "real row");
  assert.equal(state.version, SCHEMA_VERSION);
});

test("strict validation rejects structural damage, unknown versions, bad zones, and unrenderable time", () => {
  const structural = createDefaultState();
  structural.ledger = "oops";
  assert.equal(validateStateSnapshot(structural).ok, false);

  const future = createDefaultState();
  future.version = 999;
  assert.match(validateStateSnapshot(future).error, /Unsupported/);

  const invalidEpoch = createDefaultState();
  invalidEpoch.continuity.updatedAt = 9e15;
  assert.equal(validateStateSnapshot(invalidEpoch).ok, false);

  const invalidZone = createDefaultState();
  invalidZone.counter.current = {
    id: "counter",
    label: "Decision",
    startAt: Date.now(),
    timezone: "Not/A_Timezone"
  };
  assert.equal(validateStateSnapshot(invalidZone).ok, false);
});

test("strict validation quarantines unknown fields instead of normalizing their bytes away", () => {
  const base = createDefaultState();
  base.counter.current = { id: "current", label: "Now", startAt: 1, timezone: "UTC" };
  base.counter.history = [{ id: "past", label: "Before", startAt: 1, endAt: 2, durationMs: 1, timezone: "UTC" }];
  base.ledger = [ledgerRow("ledger")];
  const mutations = [
    (state) => { state.unrecognizedPrivateField = "root bytes"; },
    (state) => { state.counter.unrecognizedPrivateField = "counter bytes"; },
    (state) => { state.counter.current.unrecognizedPrivateField = "current bytes"; },
    (state) => { state.counter.history[0].unrecognizedPrivateField = "history bytes"; },
    (state) => { state.ledger[0].unrecognizedPrivateField = "ledger bytes"; },
    (state) => { state.continuity.unrecognizedPrivateField = "continuity bytes"; },
    (state) => { state.plan.unrecognizedPrivateField = "plan bytes"; },
    (state) => { state.agreement.unrecognizedPrivateField = "agreement bytes"; },
    (state) => { state.agreement.checkin.unrecognizedPrivateField = "check-in bytes"; }
  ];
  for (const mutate of mutations) {
    const candidate = clone(base);
    mutate(candidate);
    assert.match(validateStateSnapshot(candidate).error, /unexpected unrecognizedPrivateField/);
  }

  const v3 = v3Snapshot();
  v3.plan = { unrecognizedPrivateField: "must not be overwritten by a default" };
  assert.match(migrateV3Snapshot(v3).error, /unexpected plan/);
  const v2 = v2Snapshot();
  v2.agreement.reviewTimezone = "UTC";
  assert.match(migrateV2Snapshot(v2, "UTC").error, /unexpected reviewTimezone/);

  const persisted = clone(base);
  persisted.unrecognizedPrivateField = "only copy";
  const raw = JSON.stringify(persisted);
  const storage = new MemoryStorage();
  storage.values.set(STORAGE_KEYS.canonical, raw);
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.blockedByCorruption, true);
    assert.equal(store.corruptRaw, raw);
    assert.equal(store.quarantineSnapshot.v3, raw);
    assert.deepEqual(storage.operations, []);
    store.setWriteEnabled(true);
    assert.equal(store.save(), false);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), raw);
  });
});

test("plan validation enforces bounded fields, consent, protocol, and review time", () => {
  const state = createDefaultState();
  state.plan = {
    title: "Tonight",
    situation: "A conversation starts running long.",
    protocol: "Talking Stick",
    firstStep: "Set two voluntary five-minute turns.",
    stopCondition: "Either person says stop.",
    checkAt: Date.UTC(2026, 7, 26, 1),
    checkTimezone: "America/New_York",
    consent: true,
    updatedAt: Date.UTC(2026, 7, 25, 22)
  };
  assert.equal(validateStateSnapshot(state).ok, true);

  const invalidConsent = clone(state);
  invalidConsent.plan.consent = "yes";
  assert.match(validateStateSnapshot(invalidConsent).error, /consent/);

  const invalidProtocol = clone(state);
  invalidProtocol.plan.protocol = "Control the room";
  assert.match(validateStateSnapshot(invalidProtocol).error, /protocol/);

  const tooLong = clone(state);
  tooLong.plan.firstStep = "x".repeat(401);
  assert.match(validateStateSnapshot(tooLong).error, /firstStep/);
});

test("Use-Tonight Plan requires a current, bounded review and copies the selected protocol boundary", () => {
  const now = Date.UTC(2026, 7, 25, 12);
  const plan = {
    ...createDefaultState().plan,
    title: "One try",
    situation: "Two people interrupt.",
    protocol: "Safe Word",
    firstStep: "Try the chosen signal once.",
    stopCondition: "Either person stops it.",
    checkAt: now + 60 * 60 * 1000,
    checkTimezone: "UTC",
    consent: true,
    updatedAt: now
  };
  assert.equal(validateUseTonightPlan(plan, now), "");
  assert.match(validateUseTonightPlan({ ...plan, checkAt: now - 2 * 60_000 }, now), /already passed/);
  assert.match(validateUseTonightPlan({ ...plan, checkAt: now + 25 * 60 * 60 * 1000 }, now), /24 hours/);
  for (const [protocol, boundary] of Object.entries(PROTOCOL_BOUNDARIES)) {
    assert.match(buildPlanText({ ...plan, protocol }), new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(
      buildAgreementText({ ...createDefaultState().agreement, protocol }),
      new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }
});

test("Protocol Agreement requires a current bounded review and explicit consent", () => {
  const now = Date.UTC(2026, 7, 25, 12);
  const agreement = {
    ...createDefaultState().agreement,
    signal: "Blue card",
    pause: "Either person can stop without penalty.",
    reviewAt: now + 24 * 60 * 60 * 1000,
    consent: true
  };
  assert.equal(validateProtocolAgreement(agreement, now), "");
  assert.match(validateProtocolAgreement({ ...agreement, reviewAt: now - 2 * 60_000 }, now), /already passed/);
  assert.match(validateProtocolAgreement({ ...agreement, reviewAt: now + 31 * 24 * 60 * 60 * 1000 }, now), /30 days/);
  assert.match(validateProtocolAgreement({ ...agreement, consent: false }, now), /mutual-consent/);
});

test("strict validation blocks capacity overflow instead of trimming records", () => {
  const ledgerOverflow = createDefaultState();
  ledgerOverflow.ledger = Array.from({ length: 2001 }, (_, index) => ledgerRow(`l-${index}`));
  assert.match(validateStateSnapshot(ledgerOverflow).error, /2000-entry limit/);
  assert.equal(ledgerOverflow.ledger[0].id, "l-0");

  const historyOverflow = createDefaultState();
  historyOverflow.counter.history = Array.from({ length: 501 }, (_, index) => ({
    id: `h-${index}`,
    label: `chapter ${index}`,
    startAt: index * 1000,
    endAt: index * 1000 + 500,
    durationMs: 500,
    timezone: "UTC"
  }));
  assert.match(validateStateSnapshot(historyOverflow).error, /500-chapter limit/);
  assert.equal(historyOverflow.counter.history[0].id, "h-0");
});

test("v2 state migrates review wall-time explicitly into a v4 instant and timezone", () => {
  const v2 = v2Snapshot();
  v2.agreement.reviewAt = "2026-08-25T14:30";
  const migrated = migrateV2Snapshot(v2, "America/New_York");
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.version, SCHEMA_VERSION);
  assert.equal(migrated.state.agreement.reviewAt, parseLocalDateTime("2026-08-25T14:30"));
  assert.equal(migrated.state.agreement.reviewTimezone, "America/New_York");
});

test("v3 state migrates losslessly into v4 with a default plan", () => {
  const v3 = createDefaultState();
  v3.version = 3;
  delete v3.plan;
  v3.continuity.thread = "Preserve this sentence exactly.";
  v3.ledger = [ledgerRow("v3-row")];
  const migrated = migrateV3Snapshot(v3);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.version, 4);
  assert.equal(migrated.state.continuity.thread, v3.continuity.thread);
  assert.deepEqual(migrated.state.ledger, v3.ledger);
  assert.deepEqual(migrated.state.plan, createDefaultState().plan);
});

test("three-way merge preserves independent instruments and concurrent new rows", () => {
  const base = createDefaultState();
  const current = clone(base);
  const latest = clone(base);
  current.counter.current = {
    id: "clock",
    label: "Today",
    startAt: Date.UTC(2026, 7, 25, 12),
    timezone: "UTC"
  };
  current.ledger.push(ledgerRow("a"));
  latest.ledger.push(ledgerRow("b"));
  latest.continuity.thread = "remote thread";
  latest.continuity.updatedAt = Date.UTC(2026, 7, 25, 13);

  const merged = mergeStates(base, current, latest);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.state.counter.current.id, "clock");
  assert.deepEqual(new Set(merged.state.ledger.map((row) => row.id)), new Set(["a", "b"]));
  assert.equal(merged.state.continuity.thread, "remote thread");
});

test("three-way merge fails closed on delete-vs-edit and same-field conflicts", () => {
  const base = createDefaultState();
  base.ledger = [ledgerRow("receipt")];
  const deleted = clone(base);
  deleted.ledger = [];
  const edited = clone(base);
  edited.ledger[0].text = "edited elsewhere";
  assert.ok(mergeStates(base, deleted, edited).conflicts.some((name) => name.startsWith("ledger.")));

  const here = clone(base);
  const elsewhere = clone(base);
  here.continuity.thread = "here";
  elsewhere.continuity.thread = "elsewhere";
  assert.ok(mergeStates(base, here, elsewhere).conflicts.includes("continuity.thread"));
});

test("three-way merge keeps consent-bearing cards atomic across concurrent edits", () => {
  const base = createDefaultState();
  const here = clone(base);
  const elsewhere = clone(base);
  here.plan.firstStep = "Set the timer.";
  here.plan.updatedAt = 10;
  elsewhere.plan.stopCondition = "Stop when either person asks.";
  elsewhere.plan.updatedAt = 20;
  const independent = mergeStates(base, here, elsewhere);
  assert.ok(independent.conflicts.includes("plan.card"));

  const conflict = clone(base);
  conflict.plan.firstStep = "Take one minute.";
  assert.ok(mergeStates(base, here, conflict).conflicts.includes("plan.card"));

  const agreementHere = clone(base);
  const agreementElsewhere = clone(base);
  agreementHere.agreement.signal = "Blue card";
  agreementHere.agreement.consent = true;
  agreementElsewhere.agreement.pause = "Either person says stop.";
  agreementElsewhere.agreement.consent = true;
  assert.ok(mergeStates(base, agreementHere, agreementElsewhere).conflicts.includes("agreement.card"));

  const checkedAgreement = createDefaultState();
  checkedAgreement.agreement.signal = "Blue card";
  checkedAgreement.agreement.pause = "Either person can stop.";
  checkedAgreement.agreement.reviewAt = Date.UTC(2026, 7, 25, 14);
  checkedAgreement.agreement.reviewTimezone = "UTC";
  checkedAgreement.agreement.consent = true;
  checkedAgreement.agreement.updatedAt = Date.UTC(2026, 7, 25, 12);
  checkedAgreement.agreement.checkin = {
    consent: "Yes",
    tension: "Lower",
    worked: "The first version worked.",
    change: "",
    next: "Revise",
    updatedAt: Date.UTC(2026, 7, 25, 13)
  };
  const revisedAgreement = clone(checkedAgreement);
  revisedAgreement.agreement.signal = "Green card";
  revisedAgreement.agreement.updatedAt = Date.UTC(2026, 7, 25, 13, 30);
  revisedAgreement.agreement.checkin = createDefaultState().agreement.checkin;
  const invalidated = mergeStates(checkedAgreement, revisedAgreement, checkedAgreement);
  assert.deepEqual(invalidated.conflicts, []);
  assert.equal(invalidated.state.agreement.signal, "Green card");
  assert.deepEqual(invalidated.state.agreement.checkin, createDefaultState().agreement.checkin);

  const concurrentCheckin = clone(checkedAgreement);
  concurrentCheckin.agreement.checkin.worked = "A concurrent old-agreement check-in.";
  concurrentCheckin.agreement.checkin.updatedAt = Date.UTC(2026, 7, 25, 13, 45);
  assert.ok(mergeStates(checkedAgreement, revisedAgreement, concurrentCheckin).conflicts.includes("agreement.card"));
});

test("a stale tab does not resurrect rows cleared elsewhere", () => {
  const base = createDefaultState();
  base.ledger = [ledgerRow("old")];
  const staleWithIndependentEdit = clone(base);
  staleWithIndependentEdit.counter.current = {
    id: "clock",
    label: "New clock",
    startAt: Date.UTC(2026, 7, 25, 12),
    timezone: "UTC"
  };
  const clearedElsewhere = createDefaultState();
  const merged = mergeStates(base, staleWithIndependentEdit, clearedElsewhere);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.state.ledger.length, 0);
  assert.equal(merged.state.counter.current.id, "clock");
});

test("blank and current B stores save only to the stable canonical key", () => {
  const blankStorage = new MemoryStorage();
  withStorageWindow(blankStorage, () => {
    const store = createStore();
    assert.equal(store.migrationPending, false);
    assert.deepEqual(blankStorage.operations, []);
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    store.state.continuity.thread = "first current save";
    assert.equal(store.save(), true);
    assert.equal(JSON.parse(blankStorage.getItem(STORAGE_KEYS.canonical)).version, SCHEMA_VERSION);
    assert.equal(blankStorage.getItem(STORAGE_KEYS.compatibility), null);
  });

  const currentStorage = new MemoryStorage();
  const current = createDefaultState();
  current.continuity.thread = "already current";
  currentStorage.setItem(STORAGE_KEYS.canonical, JSON.stringify(current));
  currentStorage.operations = [];
  withStorageWindow(currentStorage, () => {
    const store = createStore();
    assert.equal(store.state.continuity.thread, "already current");
    assert.equal(store.migrationPending, false);
    assert.deepEqual(currentStorage.operations, []);
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    store.state.ledger.push(ledgerRow("current-row"));
    assert.equal(store.save(), true);
    assert.equal(JSON.parse(currentStorage.getItem(STORAGE_KEYS.canonical)).ledger[0].id, "current-row");
    assert.equal(currentStorage.getItem(STORAGE_KEYS.compatibility), null);
  });
});

test("store integrates sequential tab edits and then requires a reload", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const first = createStore();
    const second = createStore();
    first.setWriteEnabled(true);
    second.setWriteEnabled(true);
    assert.equal(first.commitPendingMigration(), true);
    assert.equal(second.commitPendingMigration(), true);
    first.state.ledger.push(ledgerRow("first"));
    assert.equal(first.save(), true);
    second.state.counter.current = {
      id: "clock",
      label: "Second tab",
      startAt: Date.UTC(2026, 7, 25, 12),
      timezone: "UTC"
    };
    assert.equal(second.save(), true);
    assert.equal(second.requiresReload, true);
    assert.equal(second.save(), false);
    assert.equal(second.lastError, "reload");

    const loaded = createStore();
    assert.equal(loaded.state.ledger[0].id, "first");
    assert.equal(loaded.state.counter.current.id, "clock");
  });
});

test("store refuses same-field tab conflicts without overwriting persisted data", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const first = createStore();
    const second = createStore();
    first.setWriteEnabled(true);
    second.setWriteEnabled(true);
    assert.equal(first.commitPendingMigration(), true);
    assert.equal(second.commitPendingMigration(), true);
    first.state.continuity.thread = "first tab";
    first.state.continuity.updatedAt = Date.now();
    assert.equal(first.save(), true);
    const persisted = storage.getItem(STORAGE_KEYS.canonical);
    second.state.continuity.thread = "second tab";
    second.state.continuity.updatedAt = Date.now() + 1;
    assert.equal(second.save(), false);
    assert.equal(second.lastError, "conflict");
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), persisted);
  });
});

test("single-writer gate blocks every destructive or persistent operation without a write", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const store = createStore();
    store.state.continuity.thread = "draft";
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.save(), false);
    assert.equal(store.replace(createDefaultState(), true), false);
    assert.equal(store.clearMigrationRecovery(), false);
    assert.equal(store.clear(), false);
    assert.equal(store.lastError, "tab-lock");
    assert.equal(store.state.continuity.thread, "draft");
    assert.deepEqual(storage.operations, []);
  });
});

test("v3 B takes precedence over C, D, and E while preserving the exact old envelope", () => {
  const storage = new MemoryStorage();
  const bRaw = JSON.stringify(v3Snapshot({ thread: "B wins 🧭", rows: [ledgerRow("b-row")] }));
  const cRaw = JSON.stringify(v2Snapshot({ thread: "C does not win", rows: [ledgerRow("c-row")] }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const eRaw = JSON.stringify([{ t: "E exact Ω", k: "W", d: "2026-08-25" }]);
  storage.setItem(STORAGE_KEYS.canonical, bRaw);
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  storage.setItem(STORAGE_KEYS.ledgerV1, eRaw);
  storage.operations = [];

  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.blockedByCorruption, false);
    assert.equal(store.migrationPending, true);
    assert.equal(store.state.continuity.thread, "B wins 🧭");
    assert.deepEqual(storage.operations, [], "migration staging must be read-only before writer ownership");
    const expectedRecovery = encodeRecovery(3, [
      { key: STORAGE_KEYS.canonical, raw: bRaw },
      { key: STORAGE_KEYS.compatibility, raw: cRaw },
      { key: STORAGE_KEYS.counterV1, raw: dRaw },
      { key: STORAGE_KEYS.ledgerV1, raw: eRaw }
    ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), expectedRecovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), null);
    const current = JSON.parse(storage.getItem(STORAGE_KEYS.canonical));
    assert.equal(current.version, SCHEMA_VERSION);
    assert.equal(current.continuity.thread, "B wins 🧭");
    assert.deepEqual(current.plan, createDefaultState().plan);
  });
});

test("v2 C takes precedence over D and E while preserving all three exact sources", () => {
  const storage = new MemoryStorage();
  const cRaw = JSON.stringify(v2Snapshot({ thread: "C wins", rows: [ledgerRow("c-row")] }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const eRaw = JSON.stringify([{ t: "legacy E", k: "N", d: "2026-08-25" }]);
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  storage.setItem(STORAGE_KEYS.ledgerV1, eRaw);
  storage.operations = [];

  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.migrationPending, true);
    assert.equal(store.state.continuity.thread, "C wins");
    assert.deepEqual(storage.operations, []);
    const expectedRecovery = encodeRecovery(2, [
      { key: STORAGE_KEYS.compatibility, raw: cRaw },
      { key: STORAGE_KEYS.counterV1, raw: dRaw },
      { key: STORAGE_KEYS.ledgerV1, raw: eRaw }
    ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), expectedRecovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), null);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).continuity.thread, "C wins");
  });
});

test("D and E migrate together from v1 with one exact, clearable recovery record", () => {
  const storage = new MemoryStorage();
  const dRaw = "2026-08-25T12:00:00.000Z";
  const eRaw = JSON.stringify([{ t: "legacy row", k: "W", d: "2026-08-25" }]);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  storage.setItem(STORAGE_KEYS.ledgerV1, eRaw);
  storage.operations = [];
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.migrationPending, true);
    assert.equal(store.state.counter.current.label, "Imported counter");
    assert.equal(store.state.ledger[0].text, "legacy row");
    assert.deepEqual(storage.operations, []);
    const expectedRecovery = encodeRecovery(1, [
      { key: STORAGE_KEYS.counterV1, raw: dRaw },
      { key: STORAGE_KEYS.ledgerV1, raw: eRaw }
    ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), expectedRecovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), null);
    assert.equal(store.clearMigrationRecovery(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
  });
});

test("an interrupted v3 migration resumes from its original recovery envelope", () => {
  const bRaw = JSON.stringify(v3Snapshot({ thread: "resume B" }));
  const displacedC = JSON.stringify(v2Snapshot({ thread: "displaced C" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const eRaw = JSON.stringify([{ t: "remaining E", k: "W", d: "2026-08-25" }]);
  const recovery = encodeRecovery(3, [
    { key: STORAGE_KEYS.canonical, raw: bRaw },
    { key: STORAGE_KEYS.compatibility, raw: displacedC },
    { key: STORAGE_KEYS.counterV1, raw: dRaw },
    { key: STORAGE_KEYS.ledgerV1, raw: eRaw }
  ]);
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.canonical, bRaw);
  storage.setItem(STORAGE_KEYS.compatibility, recovery);
  storage.setItem(STORAGE_KEYS.ledgerV1, eRaw);
  storage.operations = [];
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.migrationPending, true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.deepEqual(storage.operations, []);
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), null);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).version, SCHEMA_VERSION);
  });
});

test("every orphaned recovery hard-blocks instead of resurrecting a cached-v3 Clear", () => {
  const bRaw = JSON.stringify(v3Snapshot({ thread: "must not resurrect B" }));
  const cRaw = JSON.stringify(v2Snapshot({ thread: "must not resurrect C" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const recoveries = [
    encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: bRaw }]),
    encodeRecovery(2, [{ key: STORAGE_KEYS.compatibility, raw: cRaw }]),
    encodeRecovery(1, [{ key: STORAGE_KEYS.counterV1, raw: dRaw }])
  ];
  for (const recovery of recoveries) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.compatibility, recovery);
    storage.operations = [];
    withStorageWindow(storage, () => {
      const store = createStore();
      assert.equal(store.blockedByCorruption, true);
      assert.equal(store.lastError, "split-brain");
      assert.equal(store.migrationPending, false);
      assert.deepEqual(storage.operations, []);
      store.setWriteEnabled(true);
      assert.equal(store.commitPendingMigration(), false);
      assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);
      assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    });
  }
});

test("future, corrupt, malformed recovery, and split-brain candidates stay byte-exact", () => {
  const currentRaw = JSON.stringify(createDefaultState());
  const fixtures = [
    {
      label: "future B",
      values: [[STORAGE_KEYS.canonical, JSON.stringify({ version: 99, note: "future" })]],
      reason: "future-version"
    },
    {
      label: "corrupt B",
      values: [[STORAGE_KEYS.canonical, JSON.stringify({ version: SCHEMA_VERSION, ledger: "oops" })]],
      reason: "corruption"
    },
    {
      label: "empty B",
      values: [[STORAGE_KEYS.canonical, ""]],
      reason: "corruption"
    },
    {
      label: "malformed recovery C",
      values: [[STORAGE_KEYS.compatibility, `${RECOVERY_MAGIC}\n3\n`]],
      reason: "corruption"
    },
    {
      label: "current B plus legacy C",
      values: [
        [STORAGE_KEYS.canonical, currentRaw],
        [STORAGE_KEYS.compatibility, JSON.stringify(v2Snapshot())]
      ],
      reason: "split-brain"
    },
    {
      label: "current B plus D",
      values: [
        [STORAGE_KEYS.canonical, currentRaw],
        [STORAGE_KEYS.counterV1, "2026-08-25T12:00:00.000Z"]
      ],
      reason: "split-brain"
    }
  ];
  for (const fixture of fixtures) {
    const storage = new MemoryStorage();
    for (const [key, raw] of fixture.values) storage.setItem(key, raw);
    const before = new Map(storage.values);
    storage.operations = [];
    withStorageWindow(storage, () => {
      const store = createStore();
      assert.equal(store.blockedByCorruption, true, fixture.label);
      assert.equal(store.lastError, fixture.reason, fixture.label);
      assert.deepEqual(storage.operations, [], fixture.label);
      store.setWriteEnabled(true);
      assert.equal(store.save(), false, fixture.label);
      assert.deepEqual(storage.values, before, fixture.label);
    });
  }
});

test("recovery records reject trailing data, bad lengths, invalid zones, and noncanonical source order", () => {
  const legacyRaw = JSON.stringify(v3Snapshot({ thread: "strict recovery" }));
  const valid = encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: legacyRaw }]);
  const badLength = [
    `${RECOVERY_MAGIC}\n`,
    "3\n",
    "3\n",
    "1\n",
    "UTC\n",
    `${STORAGE_KEYS.canonical.length}\n`,
    `${legacyRaw.length + 1}\n`,
    STORAGE_KEYS.canonical,
    legacyRaw
  ].join("");
  const malformed = [
    `${valid}x`,
    badLength,
    encodeRecovery(3, [{ key: STORAGE_KEYS.compatibility, raw: legacyRaw }]),
    encodeRecovery(3, [
      { key: STORAGE_KEYS.canonical, raw: legacyRaw },
      { key: STORAGE_KEYS.canonical, raw: legacyRaw }
    ]),
    encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: legacyRaw }], "Not/A_Timezone"),
    encodeRecovery(4, [{ key: STORAGE_KEYS.canonical, raw: legacyRaw }])
  ];
  for (const raw of malformed) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.canonical, JSON.stringify(createDefaultState()));
    storage.setItem(STORAGE_KEYS.compatibility, raw);
    storage.operations = [];
    withStorageWindow(storage, () => {
      const store = createStore();
      assert.equal(store.blockedByCorruption, true);
      assert.equal(store.lastError, "corruption");
      assert.equal(store.quarantineSnapshot.v2, raw);
      assert.deepEqual(storage.operations, []);
    });
  }
});

test("every obsolete unshipped key quarantines the complete candidate set", () => {
  const obsoleteKeys = [
    STORAGE_KEYS.obsoleteActive,
    STORAGE_KEYS.obsoleteV1,
    STORAGE_KEYS.obsoleteRecoveryV3,
    STORAGE_KEYS.obsoleteRecoveryV2,
    STORAGE_KEYS.obsoleteRecoveryCounter,
    STORAGE_KEYS.obsoleteRecoveryLedger
  ];
  for (const obsoleteKey of obsoleteKeys) {
    const storage = new MemoryStorage();
    const currentRaw = JSON.stringify(createDefaultState());
    storage.setItem(STORAGE_KEYS.canonical, currentRaw);
    storage.setItem(obsoleteKey, `exact:${obsoleteKey}`);
    storage.operations = [];
    withStorageWindow(storage, () => {
      const store = createStore();
      assert.equal(store.blockedByCorruption, true, obsoleteKey);
      assert.equal(store.lastError, "split-brain", obsoleteKey);
      assert.equal(store.quarantineSnapshot.candidateBytes[STORAGE_KEYS.canonical], currentRaw);
      assert.equal(store.quarantineSnapshot.candidateBytes[obsoleteKey], `exact:${obsoleteKey}`);
      assert.deepEqual(storage.operations, [], obsoleteKey);
    });
  }
});

test("quarantine backup retains every B/C/D/E and obsolete candidate byte-for-byte", () => {
  const storage = new MemoryStorage();
  for (const key of ALL_STORAGE_KEYS) storage.setItem(key, `raw:${key}:Ω`);
  withStorageWindow(storage, () => {
    const snapshot = createStore().quarantineSnapshot;
    assert.equal(snapshot.format, "project-euphoria-toolbox-quarantine-v2");
    for (const key of ALL_STORAGE_KEYS) assert.equal(snapshot.candidateBytes[key], `raw:${key}:Ω`, key);
    assert.equal(snapshot.active, `raw:${STORAGE_KEYS.obsoleteActive}:Ω`);
    assert.equal(snapshot.v3, `raw:${STORAGE_KEYS.canonical}:Ω`);
    assert.equal(snapshot.v2, `raw:${STORAGE_KEYS.compatibility}:Ω`);
    assert.equal(snapshot.counterV1, `raw:${STORAGE_KEYS.counterV1}:Ω`);
    assert.equal(snapshot.ledgerV1, `raw:${STORAGE_KEYS.ledgerV1}:Ω`);
  });
});

test("a migration source changed before the lock is re-read and never overwritten", () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify(v3Snapshot({ thread: "original" }));
  const changed = JSON.stringify(v3Snapshot({ thread: "changed elsewhere" }));
  storage.setItem(STORAGE_KEYS.canonical, original);
  withStorageWindow(storage, () => {
    const store = createStore();
    storage.setItem(STORAGE_KEYS.canonical, changed);
    storage.operations = [];
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "migration-race");
    assert.equal(store.requiresReload, true);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), changed);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
    assert.deepEqual(storage.operations, []);
  });
});

test("a source changed after recovery write removes only the stale envelope it just created", () => {
  const storage = new MemoryStorage();
  const cRaw = JSON.stringify(v2Snapshot({ thread: "source C" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const changedD = "2026-08-26T12:00:00.000Z";
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  const recovery = encodeRecovery(2, [
    { key: STORAGE_KEYS.compatibility, raw: cRaw },
    { key: STORAGE_KEYS.counterV1, raw: dRaw }
  ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
  withStorageWindow(storage, () => {
    const store = createStore();
    storage.afterSet = (key, _value, target) => {
      if (key === STORAGE_KEYS.compatibility) {
        target.values.set(STORAGE_KEYS.counterV1, changedD);
        target.afterSet = null;
      }
    };
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "migration-race");
    assert.equal(store.requiresReload, true);
    assert.notEqual(recovery, cRaw);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), changedD);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);
  });
});

test("migration recovery-write failure leaves every legacy source untouched", () => {
  const storage = new MemoryStorage();
  const cRaw = JSON.stringify(v2Snapshot());
  const dRaw = "2026-08-25T12:00:00.000Z";
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.failNextSetFor = STORAGE_KEYS.compatibility;
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "migration");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), cRaw);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), dRaw);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);
  });
});

test("migration cleanup failure leaves verified recovery and never recreates removed data", () => {
  const storage = new MemoryStorage();
  const bRaw = JSON.stringify(v3Snapshot({ thread: "cleanup recovery" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const eRaw = JSON.stringify([{ t: "cleanup row", k: "W", d: "2026-08-25" }]);
  const recovery = encodeRecovery(3, [
    { key: STORAGE_KEYS.canonical, raw: bRaw },
    { key: STORAGE_KEYS.counterV1, raw: dRaw },
    { key: STORAGE_KEYS.ledgerV1, raw: eRaw }
  ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
  storage.setItem(STORAGE_KEYS.canonical, bRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  storage.setItem(STORAGE_KEYS.ledgerV1, eRaw);
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.failNextRemoveFor = STORAGE_KEYS.ledgerV1;
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "migration");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), eRaw);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), bRaw);

    const resumed = createStore();
    resumed.setWriteEnabled(true);
    assert.equal(resumed.commitPendingMigration(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), null);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).continuity.thread, "cleanup recovery");
  });
});

test("canonical migration-write failure rolls forward from recovery on reload", () => {
  const storage = new MemoryStorage();
  const bRaw = JSON.stringify(v3Snapshot({ thread: "canonical recovery" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const recovery = encodeRecovery(3, [
    { key: STORAGE_KEYS.canonical, raw: bRaw },
    { key: STORAGE_KEYS.counterV1, raw: dRaw }
  ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
  storage.setItem(STORAGE_KEYS.canonical, bRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.failNextSetFor = STORAGE_KEYS.canonical;
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "migration");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), bRaw);

    const resumed = createStore();
    assert.equal(resumed.migrationPending, true);
    resumed.setWriteEnabled(true);
    assert.equal(resumed.commitPendingMigration(), true);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).continuity.thread, "canonical recovery");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
  });
});

test("a v2 canonical-write failure leaves an exact orphan recovery but never auto-resurrects it", () => {
  const storage = new MemoryStorage();
  const cRaw = JSON.stringify(v2Snapshot({ thread: "recover manually, never resurrect" }));
  const dRaw = "2026-08-25T12:00:00.000Z";
  const recovery = encodeRecovery(2, [
    { key: STORAGE_KEYS.compatibility, raw: cRaw },
    { key: STORAGE_KEYS.counterV1, raw: dRaw }
  ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time");
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, dRaw);
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.failNextSetFor = STORAGE_KEYS.canonical;
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);

    const reloaded = createStore();
    assert.equal(reloaded.blockedByCorruption, true);
    assert.equal(reloaded.lastError, "split-brain");
    assert.equal(reloaded.migrationPending, false);
    assert.equal(reloaded.quarantineSnapshot.v2, recovery);
    assert.deepEqual(reloaded.state, createDefaultState());
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);
  });
});

test("storage writability is probed only after write access is enabled", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.deepEqual(storage.operations, []);
    store.setWriteEnabled(true);
    storage.failNextSetFor = "__euphoria_storage_probe__";
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.lastError, "storage");
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
  });
});

test("every store mutator refuses after a storage event until reload", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    store.state.continuity.thread = "preserve me";
    assert.equal(store.save(), true);
    const active = storage.getItem(STORAGE_KEYS.canonical);
    const external = encodeRecovery(3, [{
      key: STORAGE_KEYS.canonical,
      raw: JSON.stringify(v3Snapshot({ thread: "old recovery" }))
    }]);
    storage.setItem(STORAGE_KEYS.compatibility, external);
    store.markExternalChange();
    assert.equal(store.commitPendingMigration(), false);
    assert.equal(store.save(), false);
    assert.equal(store.replace(createDefaultState(), true), false);
    assert.equal(store.clearMigrationRecovery(), false);
    assert.equal(store.clear(), false);
    assert.equal(store.lastError, "reload");
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), active);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), external);
  });
});

test("Clear removes noncanonical data first, canonical B last, and leaves no resurrection source", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.canonical, JSON.stringify(createDefaultState()));
  for (const key of ALL_STORAGE_KEYS) {
    if (key !== STORAGE_KEYS.canonical) storage.setItem(key, `erase:${key}`);
  }
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.operations = [];
    assert.equal(store.clear(), true);
    for (const key of ALL_STORAGE_KEYS) assert.equal(storage.getItem(key), null, key);
    const removals = storage.operations.filter(([operation]) => operation === "remove");
    assert.equal(removals.at(-1)[1], STORAGE_KEYS.canonical);
    assert.equal(storage.operations.some(([operation]) => operation === "set"), false);
    const reloaded = createStore();
    assert.equal(reloaded.blockedByCorruption, false);
    assert.equal(reloaded.migrationPending, false);
    assert.deepEqual(reloaded.state, createDefaultState());
  });
});

test("partial Clear never recreates removed bytes and keeps canonical B until the end", () => {
  const storage = new MemoryStorage();
  const bRaw = JSON.stringify(createDefaultState());
  const cRaw = encodeRecovery(3, [{
    key: STORAGE_KEYS.canonical,
    raw: JSON.stringify(v3Snapshot())
  }]);
  storage.setItem(STORAGE_KEYS.canonical, bRaw);
  storage.setItem(STORAGE_KEYS.compatibility, cRaw);
  storage.setItem(STORAGE_KEYS.counterV1, "2026-08-25T12:00:00.000Z");
  storage.setItem(STORAGE_KEYS.ledgerV1, "[]");
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    storage.operations = [];
    storage.failNextRemoveFor = STORAGE_KEYS.ledgerV1;
    assert.equal(store.clear(), false);
    assert.equal(store.requiresReload, true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
    assert.equal(storage.getItem(STORAGE_KEYS.counterV1), null);
    assert.equal(storage.getItem(STORAGE_KEYS.ledgerV1), "[]");
    assert.equal(storage.getItem(STORAGE_KEYS.canonical), bRaw);
    assert.equal(storage.operations.some(([operation]) => operation === "set"), false);
  });
});

test("cached-v3 Clear cannot resurrect v4 data, including at its B-then-C midpoint", () => {
  const storage = new MemoryStorage();
  const current = createDefaultState();
  current.continuity.thread = "current private data";
  const oldB = JSON.stringify(v3Snapshot({ thread: "migration source" }));
  const recovery = encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: oldB }]);
  storage.setItem(STORAGE_KEYS.canonical, JSON.stringify(current));
  storage.setItem(STORAGE_KEYS.compatibility, recovery);

  storage.removeItem(STORAGE_KEYS.canonical);
  withStorageWindow(storage, () => {
    const midpoint = createStore();
    assert.equal(midpoint.blockedByCorruption, true);
    assert.equal(midpoint.lastError, "split-brain");
    assert.deepEqual(midpoint.state, createDefaultState());
  });
  storage.removeItem(STORAGE_KEYS.compatibility);
  withStorageWindow(storage, () => {
    const completed = createStore();
    assert.equal(completed.blockedByCorruption, false);
    assert.equal(completed.migrationPending, false);
    assert.deepEqual(completed.state, createDefaultState());
  });
});

test("cached-v3 Restore makes restored B authoritative and rebuilds its recovery", () => {
  const storage = new MemoryStorage();
  const current = createDefaultState();
  current.continuity.thread = "newer current value";
  const priorV3Raw = JSON.stringify(v3Snapshot({ thread: "prior migration source" }));
  const priorRecovery = encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: priorV3Raw }]);
  storage.setItem(STORAGE_KEYS.canonical, JSON.stringify(current));
  storage.setItem(STORAGE_KEYS.compatibility, priorRecovery);

  const restoredRaw = JSON.stringify(v3Snapshot({ thread: "restored by cached v3", rows: [ledgerRow("restored")] }));
  storage.setItem(STORAGE_KEYS.canonical, restoredRaw);
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.migrationPending, true);
    assert.equal(store.state.continuity.thread, "restored by cached v3");
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).continuity.thread, "restored by cached v3");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), encodeRecovery(3, [
      { key: STORAGE_KEYS.canonical, raw: restoredRaw }
    ], Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time"));
  });
});

test("a restore that validates B but cannot remove recovery stays recoverable and reload-only", () => {
  const storage = new MemoryStorage();
  const current = createDefaultState();
  const oldV3Raw = JSON.stringify(v3Snapshot({ thread: "old exact recovery" }));
  const recovery = encodeRecovery(3, [{ key: STORAGE_KEYS.canonical, raw: oldV3Raw }]);
  storage.setItem(STORAGE_KEYS.canonical, JSON.stringify(current));
  storage.setItem(STORAGE_KEYS.compatibility, recovery);
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    const replacement = createDefaultState();
    replacement.ledger.push(ledgerRow("replacement"));
    storage.failNextRemoveFor = STORAGE_KEYS.compatibility;
    assert.equal(store.replace(replacement), false);
    assert.equal(store.lastError, "replace-cleanup");
    assert.equal(store.requiresReload, true);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).ledger[0].id, "replacement");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), recovery);

    const reloaded = createStore();
    assert.equal(reloaded.blockedByCorruption, false);
    assert.equal(reloaded.state.ledger[0].id, "replacement");
    reloaded.setWriteEnabled(true);
    assert.equal(reloaded.commitPendingMigration(), true);
    assert.equal(reloaded.clearMigrationRecovery(), true);
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
  });
});

test("corrupt and future B can be explicitly cleared, then reloaded and freshly saved", () => {
  const raws = [
    JSON.stringify({ version: SCHEMA_VERSION, ledger: "damaged" }),
    JSON.stringify({ version: 99, note: "future" })
  ];
  for (const raw of raws) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.canonical, raw);
    withStorageWindow(storage, () => {
      const blocked = createStore();
      assert.equal(blocked.blockedByCorruption, true);
      assert.equal(blocked.corruptRaw, raw);
      blocked.setWriteEnabled(true);
      assert.equal(blocked.clear(), true);
      assert.equal(storage.getItem(STORAGE_KEYS.canonical), null);

      const fresh = createStore();
      fresh.setWriteEnabled(true);
      assert.equal(fresh.commitPendingMigration(), true);
      fresh.state.continuity.thread = "fresh after explicit erase";
      assert.equal(fresh.save(), true);
      assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.canonical)).continuity.thread, "fresh after explicit erase");
      assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
    });
  }
});

test("validated state can be saved, exported, erased, and restored", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const store = createStore();
    store.setWriteEnabled(true);
    assert.equal(store.commitPendingMigration(), true);
    store.state.ledger.push(ledgerRow("backup-row"));
    store.state.plan.title = "One reversible step";
    assert.equal(store.save(), true);
    const exported = storage.getItem(STORAGE_KEYS.canonical);
    assert.equal(validateStateSnapshot(JSON.parse(exported)).ok, true);

    assert.equal(store.clear(), true);
    for (const key of ALL_STORAGE_KEYS) assert.equal(storage.getItem(key), null, key);
    const erasedReload = createStore();
    assert.equal(erasedReload.blockedByCorruption, false);
    assert.equal(erasedReload.migrationPending, false);
    erasedReload.setWriteEnabled(true);
    assert.equal(erasedReload.commitPendingMigration(), true);

    assert.equal(store.replace(JSON.parse(exported)), true);
    assert.equal(store.state.ledger[0].id, "backup-row");
    assert.equal(store.state.plan.title, "One reversible step");
    assert.equal(storage.getItem(STORAGE_KEYS.compatibility), null);
  });
});

test("normalization preserves counter history and the heavy-not-immediate distinction", () => {
  const state = normalizeState({
    counter: {
      current: { id: "now", label: "Decision", startAt: 1000, timezone: "America/New_York" },
      history: [
        { id: "before", label: "Earlier", startAt: 0, endAt: 500, durationMs: 500, timezone: "UTC" }
      ]
    },
    continuity: {
      thread: "Keep this",
      understood: "Already known",
      need: "Let me finish",
      moment: "heavy",
      updatedAt: 100
    }
  });

  assert.equal(state.counter.current.label, "Decision");
  assert.equal(state.counter.history[0].label, "Earlier");
  assert.equal(state.continuity.moment, "heavy");
  assert.equal(state.continuity.need, "Let me finish");
});

test("unsupported ledger labels become Pending rather than inventing a result", () => {
  const state = normalizeState({
    ledger: [{ id: "x", text: "Unknown result", result: "Amazing", date: "2026-08-25", createdAt: 10 }]
  });
  assert.equal(state.ledger[0].result, "Pending");
});

test("guided routes are deterministic, bounded, and point only to existing Toolbox targets", () => {
  const html = fs.readFileSync(new URL("../toolbox/index.html", import.meta.url), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual(Object.keys(ROUTE_RECOMMENDATIONS).sort(), [
    "agreement",
    "counter",
    "fresh-page",
    "immediate-help",
    "ledger",
    "loop-detector",
    "no-flinch",
    "off-record",
    "paved-crossings",
    "safe-word",
    "talking-stick",
    "tonight-plan"
  ]);
  for (const [selection, route] of Object.entries(ROUTE_RECOMMENDATIONS)) {
    assert.equal(route.target, selection);
    assert.equal(ids.has(route.target), true, `${route.target} must exist in toolbox/index.html`);
    assert.ok(route.reason.length > 20);
    assert.ok(route.boundary.length > 20);
  }
  const planForm = html.match(/<form id="planForm">([\s\S]*?)<\/form>/)?.[1] || "";
  assert.match(planForm, /id="planProtocolBoundary"/);
});

test("Siren handoff contract is explicit, expiring, strict, and plain-data only", () => {
  const exportedAt = "2026-08-25T12:00:00.000Z";
  const expiresAt = "2026-08-26T12:00:00.000Z";
  const handoff = createSirenHandoff(
    {
      thread: "<b>This stays text.</b>",
      understood: "No diagnosis requested.",
      need: "Let me finish.",
      moment: "heavy",
      updatedAt: Date.UTC(2026, 7, 25, 11)
    },
    { exportedAt, expiresAt, requestId: "request-1234" }
  );
  const accepted = validateSirenHandoff(handoff, Date.UTC(2026, 7, 25, 13));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.continuity.thread, "<b>This stays text.</b>");
  assert.deepEqual(handoff.includedFields, ["thread", "understood", "need", "moment", "updatedAt"]);
  assert.equal(handoff.consent.explicitExport, true);
  assert.match(handoff.boundary, /does not prove Siren/);

  assert.match(validateSirenHandoff(handoff, Date.UTC(2026, 7, 27)).error, /expired/);

  const extraTopLevel = clone(handoff);
  extraTopLevel.execute = true;
  assert.match(validateSirenHandoff(extraTopLevel, Date.UTC(2026, 7, 25, 13)).error, /unsupported fields/);

  const extraConsent = clone(handoff);
  extraConsent.consent.hidden = "not consented";
  assert.match(validateSirenHandoff(extraConsent, Date.UTC(2026, 7, 25, 13)).error, /explicit field-export consent/);

  const collidedManifest = clone(handoff);
  collidedManifest.includedFields = ["thread|understood", "need", "moment", "updatedAt"];
  assert.match(validateSirenHandoff(collidedManifest, Date.UTC(2026, 7, 25, 13)).error, /field-consent list/);

  const collidedTopLevel = clone(handoff);
  delete collidedTopLevel.boundary;
  delete collidedTopLevel.consent;
  collidedTopLevel["boundary|consent"] = true;
  assert.match(validateSirenHandoff(collidedTopLevel, Date.UTC(2026, 7, 25, 13)).error, /unsupported fields/);

  const collidedConsent = clone(handoff);
  collidedConsent.consent = { "explicitExport|purpose": true };
  assert.match(validateSirenHandoff(collidedConsent, Date.UTC(2026, 7, 25, 13)).error, /explicit field-export consent/);

  const collidedData = clone(handoff);
  delete collidedData.data.moment;
  delete collidedData.data.need;
  collidedData.data["moment|need"] = "heavy";
  assert.match(validateSirenHandoff(collidedData, Date.UTC(2026, 7, 25, 13)).error, /unsupported fields/);

  const futureVersion = clone(handoff);
  futureVersion.version = 2;
  assert.match(validateSirenHandoff(futureVersion, Date.UTC(2026, 7, 25, 13)).error, /not a supported/);

  const tooLong = clone(handoff);
  tooLong.data.thread = "x".repeat(701);
  assert.match(validateSirenHandoff(tooLong, Date.UTC(2026, 7, 25, 13)).error, /thread/);

  const futureData = clone(handoff);
  futureData.data.updatedAt = Date.UTC(2099, 0, 1);
  assert.match(validateSirenHandoff(futureData, Date.UTC(2026, 7, 25, 13)).error, /later than its export/);

  const priorToolboxVersion = clone(handoff);
  priorToolboxVersion.sourceVersion = "toolbox-schema-3";
  assert.equal(validateSirenHandoff(priorToolboxVersion, Date.UTC(2026, 7, 25, 13)).ok, true);
});

test("Siren contract preserves an immediate marker for the UI safety refusal", () => {
  const handoff = createSirenHandoff(
    { thread: "", understood: "", need: "", moment: "immediate", updatedAt: null },
    {
      exportedAt: "2026-08-25T12:00:00.000Z",
      expiresAt: "2026-08-26T12:00:00.000Z",
      requestId: "request-5678"
    }
  );
  const result = validateSirenHandoff(handoff, Date.UTC(2026, 7, 25, 13));
  assert.equal(result.ok, true);
  assert.equal(result.continuity.moment, "immediate");
  const source = fs.readFileSync(new URL("../toolbox/app.v0.3.0.js", import.meta.url), "utf8");
  assert.match(source, /Siren handoff not exported: an immediate safety concern/);
  assert.match(source, /Siren handoff not imported: an immediate safety concern/);
});

test("Toolbox module completes a DOM initialization smoke test", async () => {
  const html = fs.readFileSync(new URL("../toolbox/index.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

  class FakeElement {
    constructor(id = "") {
      this.id = id;
      this.value = "";
      this.checked = false;
      this.hidden = false;
      this.textContent = "";
      this.dataset = {};
      this.children = [];
      this.listeners = new Map();
    }

    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }

    setAttribute() {}
    focus() {}
    scrollIntoView() {}
    click() {}
    closest() { return null; }
    querySelectorAll() { return []; }
    cloneNode() { return new FakeElement(this.id); }

    replaceChildren(...children) {
      this.children = children;
    }

    append(...children) {
      this.children.push(...children);
    }
  }

  class FakeDetailsElement extends FakeElement {}

  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  const storage = new MemoryStorage();
  const fakeDocument = {
    body: new FakeElement("body"),
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement()
  };
  const fakeWindow = {
    localStorage: storage,
    addEventListener() {},
    matchMedia: () => ({ matches: true }),
    confirm: () => false,
    print() {}
  };

  const savedGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLDetailsElement: globalThis.HTMLDetailsElement,
    history: globalThis.history,
    location: globalThis.location,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setInterval: globalThis.setInterval
  };
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;
  globalThis.HTMLDetailsElement = FakeDetailsElement;
  globalThis.history = { replaceState() {} };
  globalThis.location = { hash: "" };
  globalThis.requestAnimationFrame = (callback) => callback();
  globalThis.setInterval = () => 1;

  try {
    await import(`../toolbox/app.v0.3.0.js?dom-smoke=${Date.now()}`);
    assert.equal(elements.get("continuityMoment").value, "ordinary");
    assert.equal(elements.get("planProtocol").value, "Talking Stick");
    assert.equal(elements.get("planProtocolBoundary").textContent, PROTOCOL_BOUNDARIES["Talking Stick"]);
    assert.equal(elements.get("planConsent").checked, false);
    assert.equal(elements.get("ledgerSubmitBtn").textContent, "Add entry");
    assert.equal(elements.get("counterHistory").children.length, 1);
  } finally {
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
