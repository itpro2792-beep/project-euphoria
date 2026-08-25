import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PROTOCOL_BOUNDARIES, createDefaultState, createSirenHandoff } from "../../toolbox/app.v0.3.0.js";

const TOOLBOX_PATH = "/toolbox/";
const FROZEN_V3_HTML = await readFile(new URL("../fixtures/toolbox-v0.2.html.txt", import.meta.url), "utf8");
const WRITER_LOCK = "project-euphoria-toolbox-writer-v1";

function parseRecoveryRecord(raw) {
  const magic = "PROJECT-EUPHORIA-TOOLBOX-RECOVERY-1";
  expect(raw).toMatch(new RegExp(`^${magic}`));
  let offset = magic.length + 1;
  const readLine = () => {
    const end = raw.indexOf("\n", offset);
    const value = raw.slice(offset, end);
    offset = end + 1;
    return value;
  };
  const fromVersion = Number(readLine());
  const timezoneLength = Number(readLine());
  const sourceCount = Number(readLine());
  const timezone = raw.slice(offset, offset + timezoneLength);
  offset += timezoneLength + 1;
  const sources = [];
  for (let index = 0; index < sourceCount; index += 1) {
    const keyLength = Number(readLine());
    const rawLength = Number(readLine());
    const key = raw.slice(offset, offset + keyLength);
    offset += keyLength;
    const sourceRaw = raw.slice(offset, offset + rawLength);
    offset += rawLength;
    sources.push({ key, raw: sourceRaw });
  }
  expect(offset).toBe(raw.length);
  return { fromVersion, timezone, sources };
}

function asV3(state, thread = "") {
  const value = structuredClone(state);
  value.version = 3;
  delete value.plan;
  if (thread) {
    value.continuity.thread = thread;
    value.continuity.updatedAt = 1_700_000_000_000;
  }
  return value;
}

function asV2(state, thread = "") {
  const value = asV3(state, thread);
  value.version = 2;
  value.agreement.reviewAt = "";
  delete value.agreement.reviewTimezone;
  return value;
}

async function openFrozenV3(page) {
  await page.route("**/toolbox/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: FROZEN_V3_HTML
  }));
  await page.goto(TOOLBOX_PATH);
}

async function waitForLock(page, held) {
  await expect.poll(() => page.evaluate(async (name) => {
    const snapshot = await navigator.locks.query();
    return snapshot.held.some((entry) => entry.name === name);
  }, WRITER_LOCK)).toBe(held);
}

async function expectWriter(page) {
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "writer");
}

async function fillValidPlan(page, suffix = "") {
  const reviewAt = await page.evaluate(() => {
    const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await page.getByLabel("Plan name").fill(`Finish one thought${suffix}`);
  await page.getByLabel("The observable situation—not a label for a person").fill("We interrupt before either person reaches the end of a thought.");
  await page.getByLabel("Protocol to try").selectOption("Talking Stick");
  await page.getByLabel("Our first small step").fill("Try one voluntary two-minute turn each.");
  await page.getByLabel("When we stop or leave this plan").fill("Either person says stop, pauses, leaves, or seeks outside help without penalty.");
  await page.getByLabel("When we review what happened").fill(reviewAt);
  await page.locator("#planConsent").check();
}

test("one tab writes, the second reads, and control transfers after close and reload", async ({ context, page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);

  const second = await context.newPage();
  await second.goto(TOOLBOX_PATH);
  await expect(second.locator("body")).toHaveAttribute("data-writer-state", "reader");
  await expect(second.locator("#storageWarning")).toContainText("Another Toolbox tab is the active writer");

  await second.getByLabel("Where I was going").fill("This draft must not persist from the reader tab.");
  await second.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await expect(second.locator("#continuityStatus")).toContainText("does not hold the Toolbox single-writer lock");

  await page.close();
  await second.reload();
  await expectWriter(second);
  await expect(second.getByLabel("Where I was going")).toHaveValue("");

  await second.getByLabel("Where I was going").fill("The transferred writer owns this saved thread.");
  await second.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await expect(second.locator("#continuityStatus")).toContainText("Saved in this browser");
  await second.reload();
  await expectWriter(second);
  await expect(second.getByLabel("Where I was going")).toHaveValue("The transferred writer owns this saved thread.");
});

test("Use-Tonight Plan survives a reload with its consent and review fields", async ({ page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await expect(page.locator("#planForm #planProtocolBoundary")).toHaveText(PROTOCOL_BOUNDARIES["Talking Stick"]);
  await page.getByLabel("Protocol to try").selectOption("Safe Word");
  await expect(page.locator("#planForm #planProtocolBoundary")).toHaveText(PROTOCOL_BOUNDARIES["Safe Word"]);
  await fillValidPlan(page, " — reload test");
  const reviewAt = await page.getByLabel("When we review what happened").inputValue();

  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.locator("#planStatus")).toHaveText("Use-Tonight Plan saved.");
  await page.reload();
  await expectWriter(page);

  await expect(page.getByLabel("Plan name")).toHaveValue("Finish one thought — reload test");
  await expect(page.getByLabel("The observable situation—not a label for a person")).toHaveValue("We interrupt before either person reaches the end of a thought.");
  await expect(page.getByLabel("Our first small step")).toHaveValue("Try one voluntary two-minute turn each.");
  await expect(page.getByLabel("When we stop or leave this plan")).toHaveValue("Either person says stop, pauses, leaves, or seeks outside help without penalty.");
  await expect(page.getByLabel("When we review what happened")).toHaveValue(reviewAt);
  await expect(page.locator("#planConsent")).toBeChecked();

  await page.getByLabel("Plan name").fill("Materially changed plan");
  await expect(page.locator("#planConsent")).not.toBeChecked();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.locator("#planStatus")).toContainText("Confirm the voluntary-consent");
  await page.getByLabel("What happened", { exact: true }).fill("Save one unrelated receipt.");
  await page.getByRole("button", { name: "Add entry" }).click();
  const afterUnrelatedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(afterUnrelatedSave.plan.title).toBe("Finish one thought — reload test");
  expect(afterUnrelatedSave.plan.consent).toBe(true);
  await page.locator("#planConsent").check();
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.locator("#planStatus")).toHaveText("Use-Tonight Plan saved.");
});

test("Agreement edits revoke consent, invalidate the old check-in, and stay isolated until saved", async ({ page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  const reviewAt = await page.evaluate(() => {
    const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await page.getByLabel("Our object, word, or signal").fill("Blue card");
  await page.getByLabel("How either person pauses or ends this without penalty").fill("Either person says stop and can leave without penalty.");
  await page.getByLabel("Review this plan").fill(reviewAt);
  await page.locator("#agreementConsent").check();
  await page.getByRole("button", { name: "Save agreement" }).click();
  await expect(page.locator("#agreementStatus")).toHaveText("Agreement saved.");

  await page.locator("details.checkin > summary").click();
  await page.getByLabel("Did everyone freely consent?").selectOption("Yes");
  await page.getByLabel("What happened to tension?").selectOption("Lower");
  await page.getByLabel("What worked?").fill("The first version stayed voluntary.");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.locator("#checkinStatus")).toHaveText("Check-in saved.");

  await page.getByLabel("Our object, word, or signal").fill("Green card");
  await expect(page.locator("#agreementConsent")).not.toBeChecked();
  await expect(page.getByLabel("What worked?")).toHaveValue("");
  await page.getByRole("button", { name: "Save agreement" }).click();
  await expect(page.locator("#agreementStatus")).toContainText("Confirm the mutual-consent");

  await page.getByLabel("What happened", { exact: true }).fill("An unrelated ledger save must not commit the rejected agreement draft.");
  await page.getByRole("button", { name: "Add entry" }).click();
  const afterUnrelatedSave = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(afterUnrelatedSave.agreement.signal).toBe("Blue card");
  expect(afterUnrelatedSave.agreement.checkin.worked).toBe("The first version stayed voluntary.");

  await page.locator("#agreementConsent").check();
  await page.getByRole("button", { name: "Save agreement" }).click();
  await expect(page.locator("#agreementStatus")).toHaveText("Agreement saved.");
  const revised = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(revised.agreement.signal).toBe("Green card");
  expect(revised.agreement.checkin.updatedAt).toBeNull();

  await page.locator("#off-record").evaluate((details) => { details.open = true; });
  await page.locator('[data-plan-protocol="Off the Record"]').click();
  await expect(page.locator("#agreementConsent")).not.toBeChecked();
  await expect(page.locator("#agreementProtocolBoundary")).toHaveText(PROTOCOL_BOUNDARIES["Off the Record"]);
  const afterQuickSelect = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(afterQuickSelect.agreement.protocol).toBe("Talking Stick");
});

test("v3 data causes zero writes without the writer lock, then migrates with exact recovery", async ({ context, page }) => {
  const legacyRaw = JSON.stringify(asV3(createDefaultState(), "Preserve these exact v3 bytes."));
  await page.goto("/");
  await page.evaluate((raw) => localStorage.setItem("euphoria_toolbox_v3", raw), legacyRaw);

  const lockHolder = await context.newPage();
  await lockHolder.goto("/");
  await lockHolder.evaluate((name) => {
    navigator.locks.request(name, { mode: "exclusive" }, async () => {
      document.body.dataset.testLock = "held";
      await new Promise(() => {});
    });
  }, WRITER_LOCK);
  await expect(lockHolder.locator("body")).toHaveAttribute("data-test-lock", "held");

  await page.goto(TOOLBOX_PATH);
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "reader");
  const beforeLock = await page.evaluate(() => ({
    canonical: localStorage.getItem("euphoria_toolbox_v3"),
    compatibility: localStorage.getItem("euphoria_toolbox_v2"),
    obsolete: localStorage.getItem("euphoria_toolbox_state")
  }));
  expect(beforeLock).toEqual({ canonical: legacyRaw, compatibility: null, obsolete: null });

  await lockHolder.close();
  await page.reload();
  await expectWriter(page);
  const migrated = await page.evaluate(() => ({
    canonical: JSON.parse(localStorage.getItem("euphoria_toolbox_v3")),
    compatibility: localStorage.getItem("euphoria_toolbox_v2")
  }));
  expect(migrated.canonical.version).toBe(4);
  expect(migrated.canonical.continuity.thread).toBe("Preserve these exact v3 bytes.");
  expect(migrated.canonical.plan).toEqual(createDefaultState().plan);
  const recovery = parseRecoveryRecord(migrated.compatibility);
  expect(recovery.fromVersion).toBe(3);
  expect(recovery.sources).toEqual([{ key: "euphoria_toolbox_v3", raw: legacyRaw }]);
});

test("the exact deployed v3 client leaves legacy v1 bytes and current v4 preserves all of them", async ({ context, page }) => {
  const counterRaw = "2026-08-25T08:15:00.000Z";
  const ledgerRaw = JSON.stringify([{ t: "Exact frozen-v3 ledger text.", k: "W", d: "2026-08-25" }]);
  await page.goto("/");
  await page.evaluate(({ counterRaw: counter, ledgerRaw: ledger }) => {
    localStorage.setItem("euphoria_counter_start", counter);
    localStorage.setItem("euphoria_ledger_v1", ledger);
  }, { counterRaw, ledgerRaw });

  await openFrozenV3(page);
  await waitForLock(page, true);
  const frozenResult = await page.evaluate(() => ({
    canonical: localStorage.getItem("euphoria_toolbox_v3"),
    counter: localStorage.getItem("euphoria_counter_start"),
    ledger: localStorage.getItem("euphoria_ledger_v1")
  }));
  expect(JSON.parse(frozenResult.canonical).version).toBe(3);
  expect(frozenResult.counter).toBe(counterRaw);
  expect(frozenResult.ledger).toBe(ledgerRaw);
  await page.close();

  const current = await context.newPage();
  await current.goto(TOOLBOX_PATH);
  await expectWriter(current);
  const migrated = await current.evaluate(() => ({
    canonical: JSON.parse(localStorage.getItem("euphoria_toolbox_v3")),
    recovery: localStorage.getItem("euphoria_toolbox_v2"),
    counter: localStorage.getItem("euphoria_counter_start"),
    ledger: localStorage.getItem("euphoria_ledger_v1")
  }));
  expect(migrated.canonical.version).toBe(4);
  expect(migrated.canonical.plan).toEqual(createDefaultState().plan);
  expect(migrated.canonical.counter.current.label).toBe("Imported counter");
  expect(migrated.canonical.ledger[0].text).toBe("Exact frozen-v3 ledger text.");
  expect(migrated.counter).toBeNull();
  expect(migrated.ledger).toBeNull();
  const recovery = parseRecoveryRecord(migrated.recovery);
  expect(recovery.fromVersion).toBe(3);
  expect(recovery.sources).toEqual([
    { key: "euphoria_toolbox_v3", raw: frozenResult.canonical },
    { key: "euphoria_counter_start", raw: counterRaw },
    { key: "euphoria_ledger_v1", raw: ledgerRaw }
  ]);
});

test("the exact deployed v3 Clear and Restore remain recoverable across v4", async ({ context, page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.getByLabel("Where I was going").fill("Original v4 state.");
  await page.getByRole("button", { name: "Save Fresh Page Card" }).click();
  const originalV4 = await page.evaluate(() => localStorage.getItem("euphoria_toolbox_v3"));

  const restoredState = asV3(createDefaultState(), "Restored by the exact deployed v3 client.");
  const restoredBackup = {
    schema: "project-euphoria-toolbox",
    version: 3,
    exportedAt: new Date().toISOString(),
    state: restoredState
  };
  const frozen = await context.newPage();
  await openFrozenV3(frozen);
  await expect(frozen.locator("#storageWarning")).toContainText("Another Toolbox tab is the active writer");

  frozen.once("dialog", (dialog) => dialog.accept());
  await frozen.getByRole("button", { name: "Erase all local data" }).click();
  await expect(frozen.locator("#dataStatus")).toContainText("does not hold the Toolbox single-writer lock");
  frozen.once("dialog", (dialog) => dialog.accept());
  await frozen.locator("#importFile").setInputFiles({
    name: "frozen-v3-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restoredBackup))
  });
  await expect(frozen.locator("#dataStatus")).toContainText("does not hold the Toolbox single-writer lock");
  expect(await frozen.evaluate(() => localStorage.getItem("euphoria_toolbox_v3"))).toBe(originalV4);

  await page.close();
  await frozen.reload();
  await waitForLock(frozen, true);
  frozen.once("dialog", (dialog) => dialog.accept());
  await frozen.locator("#importFile").setInputFiles({
    name: "frozen-v3-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restoredBackup))
  });
  await expect(frozen.locator("#dataStatus")).toContainText("Backup restored");
  const restoredV3Raw = await frozen.evaluate(() => localStorage.getItem("euphoria_toolbox_v3"));
  expect(JSON.parse(restoredV3Raw).continuity.thread).toBe("Restored by the exact deployed v3 client.");
  await frozen.close();

  const current = await context.newPage();
  await current.goto(TOOLBOX_PATH);
  await expectWriter(current);
  const remigrated = await current.evaluate(() => ({
    canonical: JSON.parse(localStorage.getItem("euphoria_toolbox_v3")),
    recovery: localStorage.getItem("euphoria_toolbox_v2")
  }));
  expect(remigrated.canonical.version).toBe(4);
  expect(remigrated.canonical.continuity.thread).toBe("Restored by the exact deployed v3 client.");
  expect(remigrated.canonical.plan).toEqual(createDefaultState().plan);
  expect(parseRecoveryRecord(remigrated.recovery).sources[0]).toEqual({
    key: "euphoria_toolbox_v3",
    raw: restoredV3Raw
  });
  await current.close();

  const frozenClear = await context.newPage();
  await openFrozenV3(frozenClear);
  await waitForLock(frozenClear, true);
  frozenClear.once("dialog", (dialog) => dialog.accept());
  await frozenClear.getByRole("button", { name: "Erase all local data" }).click();
  await expect(frozenClear.locator("#dataStatus")).toHaveText("All Toolbox data was erased from this browser.");
  const cleared = await frozenClear.evaluate(() => ({
    b: localStorage.getItem("euphoria_toolbox_v3"),
    c: localStorage.getItem("euphoria_toolbox_v2"),
    d: localStorage.getItem("euphoria_counter_start"),
    e: localStorage.getItem("euphoria_ledger_v1")
  }));
  expect(cleared).toEqual({ b: null, c: null, d: null, e: null });
  await frozenClear.close();

  const fresh = await context.newPage();
  await fresh.goto(TOOLBOX_PATH);
  await expectWriter(fresh);
  await expect(fresh.getByLabel("Where I was going")).toHaveValue("");
  await fresh.getByLabel("Where I was going").fill("Fresh state after cached Clear.");
  await fresh.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await fresh.reload();
  await expect(fresh.getByLabel("Where I was going")).toHaveValue("Fresh state after cached Clear.");
});

test("an interrupted cached-v3 Clear leaves orphan recovery quarantined instead of resurrecting it", async ({ context, page }) => {
  const legacyV2Raw = JSON.stringify(asV2(createDefaultState(), "This must not resurrect after Clear."));
  await page.goto("/");
  await page.evaluate((raw) => localStorage.setItem("euphoria_toolbox_v2", raw), legacyV2Raw);
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  const beforeClear = await page.evaluate(() => ({
    b: localStorage.getItem("euphoria_toolbox_v3"),
    c: localStorage.getItem("euphoria_toolbox_v2")
  }));
  expect(JSON.parse(beforeClear.b).version).toBe(4);
  expect(parseRecoveryRecord(beforeClear.c).fromVersion).toBe(2);
  await page.close();

  const frozen = await context.newPage();
  await frozen.addInitScript(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function patchedRemove(key) {
      remove.call(this, key);
      if (key === "euphoria_toolbox_v3") throw new Error("Injected process interruption after cached Clear removed B");
    };
  });
  await openFrozenV3(frozen);
  await waitForLock(frozen, true);
  frozen.once("dialog", (dialog) => dialog.accept());
  await frozen.getByRole("button", { name: "Erase all local data" }).click();
  const interrupted = await frozen.evaluate(() => ({
    b: localStorage.getItem("euphoria_toolbox_v3"),
    c: localStorage.getItem("euphoria_toolbox_v2")
  }));
  expect(interrupted).toEqual({ b: null, c: beforeClear.c });
  await frozen.close();

  const current = await context.newPage();
  await current.goto(TOOLBOX_PATH);
  await expect(current.locator("body")).toHaveAttribute("data-writer-state", "error");
  await expect(current.locator("#storageWarning")).toContainText("current and legacy Toolbox datasets");
  await expect(current.getByLabel("Where I was going")).toHaveValue("");
  expect(await current.evaluate(() => localStorage.getItem("euphoria_toolbox_v2"))).toBe(beforeClear.c);

  current.once("dialog", (dialog) => dialog.accept());
  await current.getByRole("button", { name: "Erase all local data" }).click();
  await expect(current.locator("#dataStatus")).toHaveText("All Toolbox data was erased from this browser.");
  expect(await current.evaluate(() => ({
    b: localStorage.getItem("euphoria_toolbox_v3"),
    c: localStorage.getItem("euphoria_toolbox_v2")
  }))).toEqual({ b: null, c: null });
});

test("a storage event gates save, restore, recovery deletion, and erase until reload", async ({ context, page }) => {
  const legacyRaw = JSON.stringify(asV3(createDefaultState(), "Original migrated state."));
  await page.goto("/");
  await page.evaluate((raw) => localStorage.setItem("euphoria_toolbox_v3", raw), legacyRaw);
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await expect(page.locator("#clearMigrationRecoveryBtn")).toBeVisible();

  const external = await context.newPage();
  await external.goto("/");
  const externalRaw = await external.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("euphoria_toolbox_v3"));
    state.continuity.thread = "External valid v4 update.";
    state.continuity.updatedAt = Date.now();
    const raw = JSON.stringify(state);
    localStorage.setItem("euphoria_toolbox_v3", raw);
    return raw;
  });
  await expect(page.locator("#storageWarning")).toContainText("now read-only for persistence");
  const recoveryRaw = await page.evaluate(() => localStorage.getItem("euphoria_toolbox_v2"));

  await page.getByLabel("Where I was going").fill("Rejected stale draft.");
  await page.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await expect(page.locator("#continuityStatus")).toContainText("another Toolbox tab changed browser data");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#clearMigrationRecoveryBtn").click();
  await expect(page.locator("#dataStatus")).toContainText("another Toolbox tab changed browser data");
  expect(await page.evaluate(() => localStorage.getItem("euphoria_toolbox_v2"))).toBe(recoveryRaw);

  const backup = {
    schema: "project-euphoria-toolbox",
    version: 4,
    exportedAt: new Date().toISOString(),
    state: createDefaultState()
  };
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#importFile").setInputFiles({
    name: "stale-restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(page.locator("#dataStatus")).toContainText("another Toolbox tab changed browser data");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Erase all local data" }).click();
  await expect(page.locator("#dataStatus")).toContainText("another Toolbox tab changed browser data");
  expect(await page.evaluate(() => ({
    b: localStorage.getItem("euphoria_toolbox_v3"),
    c: localStorage.getItem("euphoria_toolbox_v2")
  }))).toEqual({ b: externalRaw, c: recoveryRaw });

  await external.close();
  await page.reload();
  await expectWriter(page);
  await expect(page.getByLabel("Where I was going")).toHaveValue("External valid v4 update.");
});

test("guided chooser previews one bounded recommendation before opening it", async ({ page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.getByLabel("Choose the closest fit").selectOption("tonight-plan");
  await page.getByRole("button", { name: "Recommend one tool" }).click();

  await expect(page.locator("#routeResult")).toBeVisible();
  await expect(page.locator("#routeTitle")).toHaveText("Use-Tonight Plan");
  await expect(page.locator("#routeReason")).toContainText("one observable situation");
  await expect(page.locator("#routeBoundary")).toContainText("not diagnosis");
  await expect(page).not.toHaveURL(/#tonight-plan$/);

  await page.getByRole("button", { name: "Open this tool" }).click();
  await expect(page).toHaveURL(/#tonight-plan$/);
  await expect(page.locator("#tonight-plan")).toBeFocused();
});

test("Siren handoff refuses a file workflow for an immediate safety state", async ({ page }) => {
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.getByLabel("Where I was going").fill("An immediate state must route away from export.");
  await page.getByLabel("What kind of moment is this?").selectOption("immediate");
  await page.getByRole("button", { name: "Download Siren handoff" }).click();

  await expect(page.locator("#continuityStatus")).toContainText("Siren handoff not exported");
  await expect(page).toHaveURL(/#immediate-help$/);
  await expect(page.locator("#immediate-help")).toBeFocused();
  expect(downloads).toBe(0);
});

test("copy denial leaves the complete text visible and selected for manual copying", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => ({ writeText: () => Promise.reject(new Error("blocked for test")) })
    });
    document.execCommand = () => false;
  });
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.getByLabel("Where I was going").fill("Keep this complete sentence available for manual copy.");
  await page.getByRole("button", { name: "Copy clean handoff" }).click();
  await expect(page.locator(".manual-copy-panel")).toBeVisible();
  await expect(page.getByLabel("Text to copy manually")).toHaveValue(/Keep this complete sentence available for manual copy\./);
  await expect(page.getByLabel("Text to copy manually")).toBeFocused();
  await expect(page.locator("#continuityStatus")).toContainText("manual-copy panel");
  await page.getByRole("button", { name: "Close manual copy" }).click();
  await expect(page.locator(".manual-copy-panel")).toHaveCount(0);
});

test("an imported Siren draft stays unsaved through edit, copy, export, backup, and pagehide", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4173" });
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.getByLabel("Where I was going").fill("Persisted original thread.");
  await page.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await expect(page.locator("#continuityStatus")).toContainText("Saved in this browser");

  const handoff = createSirenHandoff(
    {
      thread: "Imported unsaved thread.",
      understood: "Imported context.",
      need: "Imported next step.",
      moment: "heavy",
      updatedAt: Date.now()
    },
    {
      exportedAt: new Date().toISOString(),
      requestId: "e2e-request-1234"
    }
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#sirenImportFile").setInputFiles({
    name: "siren-handoff.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(handoff))
  });
  await expect(page.getByLabel("Where I was going")).toHaveValue("Imported unsaved thread.");
  await expect(page.locator("#continuityStatus")).toContainText("unsaved draft");

  await page.getByLabel("Where I was going").fill("Edited imported draft.");
  await page.waitForTimeout(700);
  await expect(page.locator("#continuityStatus")).toContainText("remains an unsaved draft");
  await page.getByRole("button", { name: "Copy clean handoff" }).click();
  await expect(page.locator("#continuityStatus")).toContainText("copied from the unsaved imported draft");

  await page.getByLabel("What happened", { exact: true }).fill("An unrelated ledger entry while a Siren draft is open.");
  await page.getByRole("button", { name: "Add entry" }).click();
  const afterLedgerSave = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(afterLedgerSave.continuity.thread).toBe("Persisted original thread.");

  await page.locator("#sirenImportFile").setInputFiles({
    name: "second-siren-handoff.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(handoff))
  });
  await expect(page.locator("#continuityStatus")).toContainText("already open as an unsaved draft");

  const blockedRestore = {
    schema: "project-euphoria-toolbox",
    version: 4,
    exportedAt: new Date().toISOString(),
    state: createDefaultState()
  };
  await page.locator("#importFile").setInputFiles({
    name: "toolbox-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(blockedRestore))
  });
  await expect(page.locator("#dataStatus")).toContainText("restore is blocked while a Siren handoff is open");
  await page.getByRole("button", { name: "Erase all local data" }).click();
  await expect(page.locator("#dataStatus")).toContainText("Erase all is blocked while a Siren handoff is open");

  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Siren handoff" }).click();
  const download = await downloadPromise;
  await download.cancel();
  await expect(page.locator("#continuityStatus")).toContainText("downloaded from the unsaved imported draft");
  expect(downloads).toBe(1);

  await page.getByRole("button", { name: "Download backup" }).click();
  await expect(page.locator("#dataStatus")).toContainText("imported Siren handoff is still an unsaved draft");
  expect(downloads).toBe(1);
  const persistedBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(persistedBeforeReload.continuity.thread).toBe("Persisted original thread.");

  await page.reload();
  await expectWriter(page);
  await expect(page.getByLabel("Where I was going")).toHaveValue("Persisted original thread.");
});

test("backup restore names the complete dataset and resets consent confirmations", async ({ page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  const state = createDefaultState();
  state.continuity = {
    thread: "Restored Fresh Page thread.",
    understood: "Restored context.",
    need: "Restored next step.",
    moment: "heavy",
    updatedAt: Date.now()
  };
  state.plan = {
    title: "Restored plan",
    situation: "One observable restored situation.",
    protocol: "Safe Word",
    firstStep: "Try one voluntary signal.",
    stopCondition: "Either person stops.",
    checkAt: Date.now() + 60 * 60 * 1000,
    checkTimezone: "UTC",
    consent: true,
    updatedAt: Date.now()
  };
  state.agreement.signal = "Restored signal";
  state.agreement.pause = "Either person can leave.";
  state.agreement.reviewAt = Date.now() + 2 * 60 * 60 * 1000;
  state.agreement.reviewTimezone = "UTC";
  state.agreement.consent = true;
  state.agreement.updatedAt = Date.now();
  state.agreement.checkin = {
    consent: "Yes",
    tension: "Lower",
    worked: "Restored check-in.",
    change: "Nothing yet.",
    next: "Use again",
    updatedAt: Date.now()
  };
  state.counter.current = { id: "current", label: "Restored counter", startAt: Date.now() - 1000, timezone: "UTC" };
  state.counter.history = [
    { id: "h1", label: "One", startAt: 1, endAt: 2, durationMs: 1, timezone: "UTC" },
    { id: "h2", label: "Two", startAt: 3, endAt: 4, durationMs: 1, timezone: "UTC" }
  ];
  state.ledger = [
    { id: "l1", text: "One", result: "Worked", date: "2026-08-24", createdAt: Date.now() - 2 },
    { id: "l2", text: "Two", result: "Pending", date: "2026-08-25", createdAt: Date.now() - 1 }
  ];
  const backup = { schema: "project-euphoria-toolbox", version: 4, exportedAt: new Date().toISOString(), state };

  const dialogPromise = page.waitForEvent("dialog");
  const uploadPromise = page.locator("#importFile").setInputFiles({
    name: "complete-toolbox-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain("Fresh Page Card, Use-Tonight Plan, protocol agreement and check-in, current counter, 2 archived chapters, and 2 ledger entries");
  expect(dialog.message()).toContain("confirmations will be reset");
  await dialog.accept();
  await uploadPromise;

  await expect(page.locator("#dataStatus")).toHaveText("Backup restored.");
  await expect(page.getByLabel("Where I was going")).toHaveValue("Restored Fresh Page thread.");
  await expect(page.getByLabel("Plan name")).toHaveValue("Restored plan");
  await expect(page.locator("#planConsent")).not.toBeChecked();
  await expect(page.locator("#agreementConsent")).not.toBeChecked();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("euphoria_toolbox_v3")));
  expect(restored.plan.consent).toBe(false);
  expect(restored.agreement.consent).toBe(false);
  expect(restored.agreement.checkin.worked).toBe("Restored check-in.");
});

test("corrupt browser data can be backed up, explicitly erased, and replaced by a clean save", async ({ page }) => {
  const damaged = JSON.stringify({ version: 4, ledger: "damaged" });
  await page.goto("/");
  await page.evaluate((raw) => localStorage.setItem("euphoria_toolbox_v3", raw), damaged);
  await page.goto(TOOLBOX_PATH);
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "error");
  await expect(page.locator("#storageWarning")).toContainText("failed validation and was left untouched");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const recovery = JSON.parse(await readFile(downloadPath, "utf8"));
  expect(recovery.recoveryRaw).toBe(damaged);
  expect(recovery.quarantineSnapshot.v3).toBe(damaged);
  expect(recovery.quarantineSnapshot.candidateBytes.euphoria_toolbox_v3).toBe(damaged);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Erase all local data" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "writer");
  await expect(page.locator("#dataStatus")).toHaveText("All Toolbox data was erased from this browser.");
  const erased = await page.evaluate(() => ({
    obsolete: localStorage.getItem("euphoria_toolbox_state"),
    canonical: localStorage.getItem("euphoria_toolbox_v3"),
    compatibility: localStorage.getItem("euphoria_toolbox_v2"),
    counterV1: localStorage.getItem("euphoria_counter_start"),
    ledgerV1: localStorage.getItem("euphoria_ledger_v1")
  }));
  expect(erased).toEqual({
    obsolete: null,
    canonical: null,
    compatibility: null,
    counterV1: null,
    ledgerV1: null
  });

  await page.reload();
  await expectWriter(page);
  await page.getByLabel("Where I was going").fill("A clean save after explicit recovery erase.");
  await page.getByRole("button", { name: "Save Fresh Page Card" }).click();
  await page.reload();
  await expect(page.getByLabel("Where I was going")).toHaveValue("A clean save after explicit recovery erase.");
});

test("skip navigation works by keyboard and print CSS excludes private instruments", async ({ page }) => {
  await page.goto(TOOLBOX_PATH);
  await expectWriter(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator("#main")).toBeFocused();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#tonight-plan")).toBeHidden();
  await expect(page.locator("#fresh-page")).toBeHidden();
  await expect(page.locator("#my-data")).toBeHidden();
  await expect(page.locator("#immediate-help")).toBeVisible();
  await expect(page.locator("#protocols")).toBeVisible();
});

test("a browser without Web Locks fails closed and does not persist drafts", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined
    });
  });
  await page.goto(TOOLBOX_PATH);
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "unsupported");
  await expect(page.locator("#storageWarning")).toContainText("cannot provide the single-writer lock");

  await fillValidPlan(page, " — unsupported browser");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.locator("#planStatus")).toContainText("does not hold the Toolbox single-writer lock");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("euphoria_toolbox_v3"))).toBeNull();

  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-writer-state", "unsupported");
  await expect(page.getByLabel("Plan name")).toHaveValue("");
});
