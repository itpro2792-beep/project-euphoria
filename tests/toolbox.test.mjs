import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  createDefaultState,
  createStore,
  escapeCsvCell,
  formatDateTime,
  formatDuration,
  localDateInputValue,
  localDateTimeInputValue,
  mergeStates,
  migrateV2Snapshot,
  normalizeState,
  parseLocalDateTime,
  safeFragmentId,
  validCalendarDateString,
  validateStateSnapshot
} from "../toolbox/app.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
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
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
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

test("default state is a valid current snapshot with all four instruments", () => {
  const state = createDefaultState();
  assert.equal(state.version, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(state).sort(), ["agreement", "continuity", "counter", "ledger", "version"]);
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

test("v2 state migrates review wall-time explicitly into a v3 instant and timezone", () => {
  const v2 = createDefaultState();
  v2.version = 2;
  v2.agreement.reviewAt = "2026-08-25T14:30";
  delete v2.agreement.reviewTimezone;
  const migrated = migrateV2Snapshot(v2, "America/New_York");
  assert.equal(migrated.ok, true);
  assert.equal(migrated.state.version, SCHEMA_VERSION);
  assert.equal(migrated.state.agreement.reviewAt, parseLocalDateTime("2026-08-25T14:30"));
  assert.equal(migrated.state.agreement.reviewTimezone, "America/New_York");
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

test("store integrates sequential tab edits and then requires a reload", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const first = createStore();
    const second = createStore();
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
    first.state.continuity.thread = "first tab";
    first.state.continuity.updatedAt = Date.now();
    assert.equal(first.save(), true);
    second.state.continuity.thread = "second tab";
    second.state.continuity.updatedAt = Date.now() + 1;
    assert.equal(second.save(), false);
    assert.equal(second.lastError, "conflict");
    assert.equal(createStore().state.continuity.thread, "first tab");
  });
});

test("single-writer gate blocks save, restore, and erase without touching storage", () => {
  const storage = new MemoryStorage();
  withStorageWindow(storage, () => {
    const store = createStore();
    store.state.continuity.thread = "draft";
    store.setWriteEnabled(false);
    assert.equal(store.save(), false);
    assert.equal(store.lastError, "tab-lock");
    assert.equal(storage.getItem("euphoria_toolbox_v3"), null);
    assert.equal(store.replace(createDefaultState(), true), false);
    assert.equal(store.clear(), false);
    assert.equal(store.state.continuity.thread, "draft");
  });
});

test("store quarantines parseable structural damage and preserves the raw value", () => {
  const storage = new MemoryStorage();
  const damaged = JSON.stringify({ version: SCHEMA_VERSION, ledger: "oops" });
  storage.setItem("euphoria_toolbox_v3", damaged);
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.blockedByCorruption, true);
    assert.equal(store.corruptRaw, damaged);
    store.state.continuity.thread = "do not overwrite raw";
    assert.equal(store.save(), false);
    assert.equal(storage.getItem("euphoria_toolbox_v3"), damaged);
  });
});

test("store migrates a prior v2 browser snapshot", () => {
  const storage = new MemoryStorage();
  const v2 = createDefaultState();
  v2.version = 2;
  v2.agreement.reviewAt = "";
  delete v2.agreement.reviewTimezone;
  v2.ledger = [ledgerRow("legacy")];
  storage.setItem("euphoria_toolbox_v2", JSON.stringify(v2));
  withStorageWindow(storage, () => {
    const store = createStore();
    assert.equal(store.blockedByCorruption, false);
    assert.equal(store.state.version, SCHEMA_VERSION);
    assert.equal(store.state.ledger[0].id, "legacy");
    assert.equal(storage.getItem("euphoria_toolbox_v2"), null);
    assert.ok(storage.getItem("euphoria_toolbox_v3"));
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
    await import(`../toolbox/app.js?dom-smoke=${Date.now()}`);
    assert.equal(elements.get("continuityMoment").value, "ordinary");
    assert.equal(elements.get("ledgerSubmitBtn").textContent, "Add entry");
    assert.equal(elements.get("counterHistory").children.length, 1);
  } finally {
    for (const [name, value] of Object.entries(savedGlobals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
