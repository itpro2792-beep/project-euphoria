#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_PATH = path.join(ROOT, "questions", "content.v1.json");
const OUTPUT_PATH = path.join(ROOT, "questions", "index.html");

const DOCUMENT_KEYS = ["schema", "version", "lastReviewed", "heldCount", "entries"];
const BLOCKED_KEYS = ["id", "slug", "status", "riskClass", "question", "blocker"];
const PUBLISHED_KEYS = [
  "id",
  "slug",
  "status",
  "riskClass",
  "question",
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
];
const REVIEW_KEYS = ["status", "reviewerRole"];
const SOURCE_KEYS = ["title", "publisher", "url"];

const STATUSES = new Set(["publish", "blocked_review"]);
const RISK_CLASSES = new Set(["general", "medical", "mental-health", "recovery"]);
const HIGH_RISK_CLASSES = new Set(["medical", "mental-health", "recovery"]);
const EVIDENCE_CLASSES = new Set([
  "External evidence (cited)",
  "Household experience (not generalizable)",
  "Measured project observation",
  "Design hypothesis",
  "Unknown",
]);
const GENERAL_REVIEW_STATES = new Set(["editorial-reviewed", "qualified-reviewed"]);
const AUTHORITATIVE_HOSTS = [
  "cdc.gov",
  "hhs.gov",
  "nih.gov",
  "samhsa.gov",
  "who.int",
  "nhs.uk",
  "nice.org.uk",
];

export class QuestionsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuestionsValidationError";
  }
}

function fail(location, message) {
  throw new QuestionsValidationError(`${location}: ${message}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, location) {
  if (!isPlainObject(value)) fail(location, "must be an object");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !wanted.includes(key));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing ${missing.join(", ")}`);
    if (extra.length) parts.push(`unexpected ${extra.join(", ")}`);
    fail(location, parts.join("; "));
  }
}

function assertNonEmptyString(value, location, maximum = 2_000) {
  if (typeof value !== "string" || !value.trim()) fail(location, "must be a non-empty string");
  if (value.length > maximum) fail(location, `must be ${maximum} characters or fewer`);
}

function assertIsoDate(value, location) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(location, "must be an ISO date in YYYY-MM-DD form");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(location, "must be a real calendar date");
  }
}

function assertSlug(value, location) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    fail(location, "must contain lowercase letters, numbers, and single hyphens only");
  }
  if (value.length > 80) fail(location, "must be 80 characters or fewer");
}

function isAuthoritativeHttpsSource(urlValue) {
  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  const hostname = parsed.hostname.toLowerCase();
  return AUTHORITATIVE_HOSTS.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
  );
}

function validateSource(source, location, { authoritativeRequired }) {
  assertExactKeys(source, SOURCE_KEYS, location);
  assertNonEmptyString(source.title, `${location}.title`, 240);
  assertNonEmptyString(source.publisher, `${location}.publisher`, 160);
  assertNonEmptyString(source.url, `${location}.url`, 2_000);
  let parsed;
  try {
    parsed = new URL(source.url);
  } catch {
    fail(`${location}.url`, "must be a valid URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail(`${location}.url`, "must be an HTTPS URL without embedded credentials");
  }
  if (authoritativeRequired && !isAuthoritativeHttpsSource(source.url)) {
    fail(
      `${location}.url`,
      "must use an approved authoritative health source (government, WHO, NHS, or NICE)",
    );
  }
}

function validatePublishedEntry(entry, location) {
  assertExactKeys(entry, PUBLISHED_KEYS, location);
  assertNonEmptyString(entry.question, `${location}.question`, 320);
  assertNonEmptyString(entry.answerFirst, `${location}.answerFirst`, 800);
  if (!Array.isArray(entry.bodyParagraphs) || entry.bodyParagraphs.length < 1 || entry.bodyParagraphs.length > 6) {
    fail(`${location}.bodyParagraphs`, "must contain between 1 and 6 paragraphs");
  }
  entry.bodyParagraphs.forEach((paragraph, index) => {
    assertNonEmptyString(paragraph, `${location}.bodyParagraphs[${index}]`, 2_400);
  });
  if (!EVIDENCE_CLASSES.has(entry.evidenceClass)) {
    fail(`${location}.evidenceClass`, "is not an approved evidence class");
  }
  if (!Array.isArray(entry.sources) || entry.sources.length > 12) {
    fail(`${location}.sources`, "must be an array with no more than 12 sources");
  }
  assertNonEmptyString(entry.unknowns, `${location}.unknowns`, 1_600);
  assertNonEmptyString(entry.limits, `${location}.limits`, 1_600);
  assertNonEmptyString(entry.nextStep, `${location}.nextStep`, 1_600);
  assertNonEmptyString(entry.safetyBoundary, `${location}.safetyBoundary`, 1_600);
  assertIsoDate(entry.lastReviewed, `${location}.lastReviewed`);

  assertExactKeys(entry.review, REVIEW_KEYS, `${location}.review`);
  if (!GENERAL_REVIEW_STATES.has(entry.review.status)) {
    fail(`${location}.review.status`, "must be editorial-reviewed or qualified-reviewed");
  }
  assertNonEmptyString(entry.review.reviewerRole, `${location}.review.reviewerRole`, 240);

  const highRisk = HIGH_RISK_CLASSES.has(entry.riskClass);
  if (highRisk && entry.review.status !== "qualified-reviewed") {
    fail(`${location}.review.status`, `${entry.riskClass} content requires qualified-reviewed`);
  }
  if (highRisk && entry.evidenceClass !== "External evidence (cited)") {
    fail(`${location}.evidenceClass`, `${entry.riskClass} content requires External evidence (cited)`);
  }
  if (highRisk && entry.sources.length === 0) {
    fail(`${location}.sources`, `${entry.riskClass} content requires an authoritative HTTPS source`);
  }
  entry.sources.forEach((source, index) => {
    validateSource(source, `${location}.sources[${index}]`, { authoritativeRequired: highRisk });
  });
  if (highRisk) {
    fail(
      `${location}.status`,
      "higher-risk publication is disabled until a credential-verification and independent release-approval process exists",
    );
  }
}

function validateBlockedEntry(entry, location) {
  assertExactKeys(entry, BLOCKED_KEYS, location);
  assertNonEmptyString(entry.question, `${location}.question`, 320);
  assertNonEmptyString(entry.blocker, `${location}.blocker`, 800);
  if (!HIGH_RISK_CLASSES.has(entry.riskClass)) {
    fail(`${location}.riskClass`, "blocked_review is reserved for medical, mental-health, or recovery content");
  }
}

export function validateQuestionsDocument(document) {
  assertExactKeys(document, DOCUMENT_KEYS, "document");
  if (document.schema !== "project-euphoria-questions") {
    fail("document.schema", "must equal project-euphoria-questions");
  }
  if (document.version !== 1) fail("document.version", "must equal 1");
  assertIsoDate(document.lastReviewed, "document.lastReviewed");
  if (!Number.isSafeInteger(document.heldCount) || document.heldCount < 0 || document.heldCount > 100) {
    fail("document.heldCount", "must be an integer from 0 through 100");
  }
  if (!Array.isArray(document.entries) || document.entries.length === 0) {
    fail("document.entries", "must be a non-empty array");
  }

  const ids = new Set();
  const slugs = new Set();
  document.entries.forEach((entry, index) => {
    const location = `document.entries[${index}]`;
    if (!isPlainObject(entry)) fail(location, "must be an object");
    assertSlug(entry.id, `${location}.id`);
    assertSlug(entry.slug, `${location}.slug`);
    if (ids.has(entry.id)) fail(`${location}.id`, `duplicate id ${entry.id}`);
    if (slugs.has(entry.slug)) fail(`${location}.slug`, `duplicate slug ${entry.slug}`);
    ids.add(entry.id);
    slugs.add(entry.slug);
    if (!STATUSES.has(entry.status)) fail(`${location}.status`, "must be publish or blocked_review");
    if (!RISK_CLASSES.has(entry.riskClass)) fail(`${location}.riskClass`, "is not an approved risk class");
    if (entry.status === "publish") validatePublishedEntry(entry, location);
    else validateBlockedEntry(entry, location);
  });

  return document;
}

export function validatePublicQuestionsDocument(document) {
  validateQuestionsDocument(document);
  if (document.entries.some((entry) => entry.status !== "publish")) {
    fail("document.entries", "the deployable content file may contain published entries only; keep held titles and drafts out of the public artifact");
  }
  return document;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSources(sources) {
  if (sources.length === 0) return "<p>No external source is claimed for this household or design entry.</p>";
  return `<ul class="source-list">${sources
    .map(
      (source) =>
        `<li><a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a> <span>— ${escapeHtml(source.publisher)}</span></li>`,
    )
    .join("")}</ul>`;
}

function renderQuestion(entry, index) {
  const reviewLabel = entry.review.status === "qualified-reviewed" ? "Qualified review" : "Editorial review";
  const paragraphs = entry.bodyParagraphs.map((paragraph) => `          <p>${escapeHtml(paragraph)}</p>`).join("\n");
  return `    <article class="question-card" id="${escapeHtml(entry.slug)}">
      <details${index === 0 ? " open" : ""}>
        <summary>
          <span class="question-label">Question ${index + 1}</span>
          <span class="question-text">${escapeHtml(entry.question)}</span>
          <span class="answer-first"><strong>Answer:</strong> ${escapeHtml(entry.answerFirst)}</span>
          <span class="open-label" aria-hidden="true">Open the full answer</span>
        </summary>
        <div class="answer-body">
${paragraphs}
          <div class="action-box">
            <h3>One reversible next step</h3>
            <p>${escapeHtml(entry.nextStep)}</p>
          </div>
          <div class="answer-grid">
            <div>
              <h3 id="evidence-${escapeHtml(entry.id)}">Evidence</h3>
              <p><span class="evidence-chip">${escapeHtml(entry.evidenceClass)}</span></p>
              ${renderSources(entry.sources)}
            </div>
            <div>
              <h3 id="unknowns-${escapeHtml(entry.id)}">What remains unknown</h3>
              <p>${escapeHtml(entry.unknowns)}</p>
            </div>
            <div>
              <h3 id="limits-${escapeHtml(entry.id)}">Limits</h3>
              <p>${escapeHtml(entry.limits)}</p>
            </div>
            <div class="safety-note">
              <h3 id="safety-${escapeHtml(entry.id)}">Stop condition</h3>
              <p>${escapeHtml(entry.safetyBoundary)}</p>
            </div>
          </div>
          <p class="review-line">${escapeHtml(reviewLabel)} by ${escapeHtml(entry.review.reviewerRole)} · Last reviewed ${escapeHtml(entry.lastReviewed)}</p>
        </div>
      </details>
    </article>`;
}

export function renderQuestionsPage(document) {
  validateQuestionsDocument(document);
  const published = document.entries.filter((entry) => entry.status === "publish");
  const held = document.heldCount + document.entries.filter((entry) => entry.status === "blocked_review").length;
  const cards = published.map(renderQuestion).join("\n\n");
  const countLabel = `${published.length} ${published.length === 1 ? "answer" : "answers"} published; ${held} held pending qualified review.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf7f0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-src 'none'; img-src 'self' data:; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'self'; worker-src 'none'">
  <title>We Answer the Question — Project Euphoria</title>
  <meta name="description" content="Plain answers with their evidence class, unknowns, limits, next step, safety boundary, and review state visible.">
  <meta property="og:title" content="We Answer the Question — Project Euphoria">
  <meta property="og:description" content="The answer first. The evidence boundary beside it. High-risk answers stay unpublished until qualified review.">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://itpro2792-beep.github.io/project-euphoria/art/worldtree.png">
  <meta property="og:image:alt" content="A painted world tree from Project Euphoria's house saga">
  <meta property="og:url" content="https://itpro2792-beep.github.io/project-euphoria/questions/">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://itpro2792-beep.github.io/project-euphoria/questions/">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9D%93%3C/text%3E%3C/svg%3E">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to the published answers</a>
  <nav class="topnav" aria-label="Primary">
    <a href="../">Home</a>
    <a href="../toolbox/">The Toolbox</a>
    <a href="./" aria-current="page">Questions</a>
    <a href="../status/">Status</a>
    <a href="../book/">The Book</a>
    <a href="../music/">The Catalog</a>
    <a href="../saga/">The Saga</a>
    <a href="../receipts/">Receipts</a>
  </nav>

  <main id="main" tabindex="-1">
    <header class="intro">
      <div class="kicker">The answer first · the boundary beside it</div>
      <h1>WE ANSWER THE QUESTION</h1>
      <p class="lede">Plain answers from household practice and project design. Each card names what supports it, what remains unknown, where it stops, and who reviewed it.</p>
      <p class="release-count"><strong>${escapeHtml(countLabel)}</strong> Review record dated ${escapeHtml(document.lastReviewed)}.</p>
    </header>

    <aside class="immediate-boundary" aria-labelledby="immediateTitle">
      <div class="kicker">When this page is not the tool</div>
      <h2 id="immediateTitle">Immediate danger needs a real-time response</h2>
      <p>If someone may be in immediate danger, cannot safely say no or leave, or needs help staying safe, stop here and use real-time support. In the United States and its territories, call or text <a href="https://988lifeline.org/">988</a>; call <a href="tel:911">911</a> for a life-threatening emergency. Elsewhere, use local crisis or emergency services.</p>
    </aside>

    <section class="reading-key" aria-labelledby="keyTitle">
      <div>
        <div class="kicker">Read the label literally</div>
        <h2 id="keyTitle">Experience is not clinical evidence</h2>
      </div>
      <p>These published entries are general household practices or design hypotheses, not diagnoses, treatment, crisis monitoring, or proof of benefit. This release does not publish medical, mental-health, or recovery answers. Open only the cards you need.</p>
    </section>

    <section class="questions" aria-label="Published questions">
${cards}
    </section>

    <section class="held-boundary" aria-labelledby="heldTitle">
      <div class="kicker">Held means held</div>
      <h2 id="heldTitle">${held} higher-risk ${held === 1 ? "answer is" : "answers are"} not published</h2>
      <p>The public source records only this count; it contains no held question titles or draft answers. Publication additionally requires a real qualified-review and independent release process. Structural build checks can reject incomplete records, but they do not authenticate credentials or authorize release.</p>
      <p><a href="../status/">See the evidence and product-status boundary</a>.</p>
    </section>

    <section class="feedback-boundary" aria-labelledby="feedbackTitle">
      <div class="kicker">A public corrections channel</div>
      <h2 id="feedbackTitle">Ask a general question—not a private one</h2>
      <p><a href="https://github.com/itpro2792-beep/project-euphoria/issues/new?template=general-question.yml">Propose a general question or correction</a>. GitHub issues are public and are not monitored for urgent help. Do not include names, dates, locations, diagnoses, account details, transcripts, health information, household events, abuse details, threats, or anything you need kept private. The project cannot provide private or individual advice there.</p>
    </section>

    <footer>
      <p>Answer the question. Preserve the unknown. Name the stop condition.</p>
      <p><a href="../toolbox/">Use the Toolbox</a> · <a href="../status/">Check the evidence record</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

export async function loadQuestionsDocument() {
  const raw = await readFile(CONTENT_PATH, "utf8");
  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new QuestionsValidationError(`content.v1.json: invalid JSON (${error.message})`);
  }
  return validatePublicQuestionsDocument(document);
}

export async function buildQuestions({ check = false } = {}) {
  const document = await loadQuestionsDocument();
  const rendered = renderQuestionsPage(document);
  if (check) {
    const existing = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
    if (existing !== rendered) {
      throw new QuestionsValidationError(
        "questions/index.html is out of date; run node scripts/build-questions.mjs",
      );
    }
    return { mode: "check", published: document.entries.filter((entry) => entry.status === "publish").length };
  }
  await writeFile(OUTPUT_PATH, rendered, "utf8");
  return { mode: "write", published: document.entries.filter((entry) => entry.status === "publish").length };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (unknownArgs.length) {
    console.error(`Unknown argument: ${unknownArgs[0]}`);
    process.exitCode = 2;
  } else {
    try {
      const result = await buildQuestions({ check: process.argv.includes("--check") });
      console.log(
        result.mode === "check"
          ? `Questions page is current (${result.published} published).`
          : `Built questions/index.html (${result.published} published).`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
