import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  QuestionsValidationError,
  escapeHtml,
  renderQuestionsPage,
  validatePublicQuestionsDocument,
  validateQuestionsDocument,
} from "../scripts/build-questions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_PATH = path.join(ROOT, "questions", "content.v1.json");
const OUTPUT_PATH = path.join(ROOT, "questions", "index.html");

async function loadFixture() {
  return JSON.parse(await readFile(CONTENT_PATH, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertValidationFailure(document, pattern) {
  assert.throws(
    () => validateQuestionsDocument(document),
    (error) => error instanceof QuestionsValidationError && pattern.test(error.message),
  );
}

function makeQualifiedEntry(entry, riskClass = "medical") {
  const candidate = clone(entry);
  candidate.riskClass = riskClass;
  candidate.evidenceClass = "External evidence (cited)";
  candidate.sources = [
    {
      title: "Authoritative guidance",
      publisher: "National Institutes of Health",
      url: "https://www.nih.gov/health-information",
    },
  ];
  candidate.review = {
    status: "qualified-reviewed",
    reviewerRole: "Licensed clinician reviewing within scope",
  };
  return candidate;
}

function makeBlockedEntry(overrides = {}) {
  return {
    id: "held-test",
    slug: "held-test",
    status: "blocked_review",
    riskClass: "medical",
    question: "A synthetic high-risk test question",
    blocker: "Synthetic fixture: qualified review is required.",
    ...overrides,
  };
}

test("the source document passes the complete v1 contract", async () => {
  const document = await loadFixture();
  assert.equal(validateQuestionsDocument(document), document);
  assert.equal(document.entries.filter((entry) => entry.status === "publish").length, 5);
  assert.equal(document.entries.filter((entry) => entry.status === "blocked_review").length, 0);
  assert.equal(document.heldCount, 5);
  assert.equal(validatePublicQuestionsDocument(document), document);
});

test("document schema and version are exact", async () => {
  const fixture = await loadFixture();
  const wrongSchema = clone(fixture);
  wrongSchema.schema = "something-else";
  assertValidationFailure(wrongSchema, /document\.schema/);

  const futureVersion = clone(fixture);
  futureVersion.version = 2;
  assertValidationFailure(futureVersion, /document\.version/);

  const extraField = clone(fixture);
  extraField.privateDrafts = [];
  assertValidationFailure(extraField, /unexpected privateDrafts/);
});

test("ids and slugs are safe and unique", async () => {
  const fixture = await loadFixture();
  const duplicateId = clone(fixture);
  duplicateId.entries[1].id = duplicateId.entries[0].id;
  assertValidationFailure(duplicateId, /duplicate id/);

  const duplicateSlug = clone(fixture);
  duplicateSlug.entries[1].slug = duplicateSlug.entries[0].slug;
  assertValidationFailure(duplicateSlug, /duplicate slug/);

  const unsafeSlug = clone(fixture);
  unsafeSlug.entries[0].slug = "Unsafe/../slug";
  assertValidationFailure(unsafeSlug, /single hyphens only/);
});

test("a general published entry needs every content and boundary field", async () => {
  const fixture = await loadFixture();
  for (const field of [
    "answerFirst",
    "bodyParagraphs",
    "evidenceClass",
    "sources",
    "unknowns",
    "limits",
    "nextStep",
    "safetyBoundary",
    "lastReviewed",
    "review",
  ]) {
    const candidate = clone(fixture);
    delete candidate.entries[0][field];
    assertValidationFailure(candidate, new RegExp(`missing .*${field}|missing ${field}`));
  }
});

test("general publication requires editorial or qualified review", async () => {
  const fixture = await loadFixture();
  const candidate = clone(fixture);
  candidate.entries[0].review.status = "draft";
  assertValidationFailure(candidate, /editorial-reviewed or qualified-reviewed/);
});

test("source records require complete metadata and credential-free HTTPS URLs", async () => {
  const fixture = await loadFixture();
  const missingPublisher = clone(fixture);
  missingPublisher.entries[0].sources = [{ title: "A source", url: "https://www.nih.gov/" }];
  assertValidationFailure(missingPublisher, /missing publisher/);

  const insecure = clone(fixture);
  insecure.entries[0].sources = [
    { title: "A source", publisher: "Publisher", url: "http://www.nih.gov/" },
  ];
  assertValidationFailure(insecure, /must be an HTTPS URL/);

  const credentials = clone(fixture);
  credentials.entries[0].sources = [
    { title: "A source", publisher: "Publisher", url: "https://user:secret@www.nih.gov/" },
  ];
  assertValidationFailure(credentials, /without embedded credentials/);
});

for (const riskClass of ["medical", "mental-health", "recovery"]) {
  test(`${riskClass} publication is gated on qualified review`, async () => {
    const fixture = await loadFixture();
    const candidate = clone(fixture);
    candidate.entries[0].riskClass = riskClass;
    assertValidationFailure(candidate, new RegExp(`${riskClass} content requires qualified-reviewed`));
  });

  test(`${riskClass} publication is gated on cited external evidence`, async () => {
    const fixture = await loadFixture();
    const candidate = makeQualifiedEntry(fixture.entries[0], riskClass);
    candidate.evidenceClass = "Household experience (not generalizable)";
    fixture.entries[0] = candidate;
    assertValidationFailure(fixture, new RegExp(`${riskClass} content requires External evidence`));
  });

  test(`${riskClass} publication is gated on authoritative HTTPS sources`, async () => {
    const fixture = await loadFixture();
    const candidate = makeQualifiedEntry(fixture.entries[0], riskClass);
    candidate.sources[0].url = "https://example.com/opinion";
    fixture.entries[0] = candidate;
    assertValidationFailure(fixture, /approved authoritative health source/);
  });
}

test("structured fields cannot self-authorize a high-risk publication", async () => {
  const fixture = await loadFixture();
  fixture.entries[0] = makeQualifiedEntry(fixture.entries[0], "medical");
  assertValidationFailure(fixture, /credential-verification and independent release-approval/);
});

test("blocked-review records are high-risk placeholders with an explicit blocker", async () => {
  const fixture = await loadFixture();
  const generalBlock = clone(fixture);
  generalBlock.entries.push(makeBlockedEntry({ riskClass: "general" }));
  assertValidationFailure(generalBlock, /blocked_review is reserved/);

  const missingBlocker = clone(fixture);
  missingBlocker.entries.push(makeBlockedEntry({ blocker: "" }));
  assertValidationFailure(missingBlocker, /blocker: must be a non-empty string/);

  const hiddenDraft = clone(fixture);
  hiddenDraft.entries.push({ ...makeBlockedEntry(), draftAnswer: "This must never hitchhike into the page." });
  assertValidationFailure(hiddenDraft, /unexpected draftAnswer/);

  const publicPlaceholder = clone(fixture);
  publicPlaceholder.entries.push(makeBlockedEntry());
  assert.throws(
    () => validatePublicQuestionsDocument(publicPlaceholder),
    (error) => error instanceof QuestionsValidationError && /deployable content file may contain published entries only/.test(error.message),
  );
});

test("rendering excludes every blocked record, including its question and blocker", async () => {
  const fixture = await loadFixture();
  fixture.entries.push(makeBlockedEntry());
  const html = renderQuestionsPage(fixture);
  for (const entry of fixture.entries.filter((item) => item.status === "blocked_review")) {
    assert.equal(html.includes(entry.id), false, `rendered blocked id ${entry.id}`);
    assert.equal(html.includes(entry.slug), false, `rendered blocked slug ${entry.slug}`);
    assert.equal(html.includes(entry.question), false, `rendered blocked question ${entry.id}`);
    assert.equal(html.includes(entry.blocker), false, `rendered blocked reason ${entry.id}`);
  }
});

test("all source-controlled copy is HTML-escaped during rendering", async () => {
  const fixture = await loadFixture();
  fixture.entries[0].question = '<script data-test="question">alert(1)</script>';
  fixture.entries[0].answerFirst = 'A & B say "stop" <now>.';
  fixture.entries[0].bodyParagraphs[0] = "<img src=x onerror=alert(1)>";
  fixture.entries[0].review.reviewerRole = "Editor <admin>";
  fixture.entries[0].sources = [
    {
      title: "Source <title>",
      publisher: "Publisher & partners",
      url: 'https://www.nih.gov/?query="><source-test>',
    },
  ];
  const html = renderQuestionsPage(fixture);
  assert.equal(html.includes("<script data-test"), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<source-test>"), false);
  assert.match(html, /&lt;script data-test=&quot;question&quot;&gt;/);
  assert.match(html, /A &amp; B say &quot;stop&quot; &lt;now&gt;\./);
  assert.match(html, /Editor &lt;admin&gt;/);
  assert.equal(escapeHtml("'<&>\""), "&#39;&lt;&amp;&gt;&quot;");
});

test("the generated page is static, bounded, navigable, and transparent about held answers", async () => {
  const html = await readFile(OUTPUT_PATH, "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /style-src 'self'/);
  assert.doesNotMatch(html, /<script(?:\s|>)/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.match(html, /rel="canonical" href="https:\/\/itpro2792-beep\.github\.io\/project-euphoria\/questions\/"/);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /href="\.\.\/toolbox\/"/);
  assert.match(html, /href="\.\.\/status\/"/);
  assert.match(html, /5 answers published; 5 held pending qualified review\./);
  assert.match(html, /public source records only this count/);
  assert.match(html, /call or text <a href="https:\/\/988lifeline\.org\/">988<\/a>/);
  assert.match(html, /call <a href="tel:911">911<\/a>/);
  assert.match(html, /GitHub issues are public and are not monitored for urgent help/);
  assert.match(html, /Do not include names, dates, locations, diagnoses/);
});

test("the committed Questions page exactly matches a fresh build", () => {
  const result = spawnSync(process.execPath, ["scripts/build-questions.mjs", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Questions page is current \(5 published\)\./);
});
