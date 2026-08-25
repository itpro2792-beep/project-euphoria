import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "toolbox", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "toolbox", "app.v0.3.0.js"), "utf8");
const currentStyles = fs.readFileSync(path.join(root, "toolbox", "styles.v0.3.0.css"), "utf8");
const deployedApp = fs.readFileSync(path.join(root, "toolbox", "app.js"));
const deployedStyles = fs.readFileSync(path.join(root, "toolbox", "styles.css"));
const frozenToolboxHtml = fs.readFileSync(path.join(root, "tests", "fixtures", "toolbox-v0.2.html.txt"));
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const questions = fs.readFileSync(path.join(root, "questions", "index.html"), "utf8");
const questionContent = JSON.parse(fs.readFileSync(path.join(root, "questions", "content.v1.json"), "utf8"));
const status = fs.readFileSync(path.join(root, "status", "index.html"), "utf8");
const book = fs.readFileSync(path.join(root, "book", "index.html"), "utf8");
const bookSummary = fs.readFileSync(path.join(root, "book", "summary", "index.html"), "utf8");
const saga = fs.readFileSync(path.join(root, "saga", "index.html"), "utf8");
const receipts = fs.readFileSync(path.join(root, "receipts", "index.html"), "utf8");
const sirenThreatModel = fs.readFileSync(path.join(root, "docs", "SIREN_BRIDGE_THREAT_MODEL.md"), "utf8");
const feedbackTemplate = fs.readFileSync(path.join(root, ".github", "ISSUE_TEMPLATE", "toolbox-feedback.yml"), "utf8");
const questionTemplate = fs.readFileSync(path.join(root, ".github", "ISSUE_TEMPLATE", "general-question.yml"), "utf8");

const failures = [];
const requireMatch = (pattern, message) => {
  if (!pattern.test(html)) failures.push(message);
};
const requireIn = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message);
};
const sha256 = (source) => crypto.createHash("sha256").update(source).digest("hex");

const cards = [...html.matchAll(/<details class="protocol-card" id="([^"]+)">([\s\S]*?)<\/details>/g)];
if (cards.length !== 7) failures.push(`Expected exactly 7 protocol cards; found ${cards.length}.`);

for (const [, id, body] of cards) {
  const required = ["May help when:", "Use only if:", "Start with:", "Stop and repair:", "Do not use"];
  for (const phrase of required) {
    if (!body.includes(phrase)) failures.push(`${id} is missing "${phrase}".`);
  }
}

requireMatch(/connect-src 'none'/, "CSP must block scripted network connections.");
requireMatch(/form-action 'none'/, "CSP must block form submissions.");
requireMatch(/shared across the entire[\s\S]*itpro2792-beep\.github\.io[\s\S]*current or future code served anywhere on that origin/, "Privacy copy must name the shared origin and current/future same-origin access.");
requireMatch(/not to <code>\/project-euphoria\/toolbox\/<\/code>/, "Privacy copy must say storage is not isolated to the Toolbox path.");
requireMatch(/exclusive browser Web Lock/, "Privacy copy must disclose the single-writer persistence boundary.");
requireMatch(/not therapy, crisis care/, "The global non-clinical boundary is missing.");
requireMatch(/Are you safe right now\?/, "No-Flinch must permit a direct safety question.");
requireMatch(/Never promise secrecy you cannot keep/, "Off-the-Record must not promise absolute secrecy.");
requireMatch(/force, restraint, confinement, surveillance, confiscation/, "The noncoercion boundary is incomplete.");
requireMatch(/Qualified clinical and safeguarding review is still pending/, "Pending professional review must be explicit.");

if (/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/.test(html)) {
  failures.push("Inline JavaScript is not allowed on the Toolbox page.");
}
if (/\sstyle=/.test(html)) failures.push("Inline style attributes are not allowed on the Toolbox page.");
if (/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(app)) {
  failures.push("Toolbox JavaScript contains a network-capable API.");
}
if (!app.includes("navigator?.locks") || !app.includes("setWriteEnabled(false)")) {
  failures.push("Toolbox must fail closed behind an exclusive browser writer lock.");
}
if (!app.includes('const STATE_KEY = "euphoria_toolbox_v3"')) failures.push("Toolbox must retain the deployed schema-3 key as its stable active storage key.");
if (!app.includes('const COMPATIBILITY_KEY = "euphoria_toolbox_v2"') || !app.includes("PROJECT-EUPHORIA-TOOLBOX-RECOVERY-1") || !app.includes("commitPendingMigration()")) {
  failures.push("Toolbox must expose its locked, exact recovery-record migration behavior.");
}
if (app.includes("migration-tombstone")) failures.push("Current Toolbox code must not rely on compatibility tombstones.");
if (!html.includes('<link rel="stylesheet" href="styles.v0.3.0.css">') || !html.includes('<script type="module" src="app.v0.3.0.js"></script>')) {
  failures.push("Toolbox 0.3 HTML must reference only its versioned 0.3 code and style assets.");
}
if (sha256(deployedApp) !== "056fd25e3e3d249d31b68cc557e1a88dc77b4ed3b1b943b539a82a8db32fc46f") {
  failures.push("The deployed 0.2 app.js cache-compatibility asset changed.");
}
if (sha256(deployedStyles) !== "b355adec0311b7fa4ff2312372ae1d6f4ed1ce1ffb7ecd2843f4fbd51135a0be") {
  failures.push("The deployed 0.2 styles.css cache-compatibility asset changed.");
}
if (sha256(frozenToolboxHtml) !== "d778967d8b701d28ffbad886ac698856a640a847138001c5697fe944a00cfffb") {
  failures.push("The frozen deployed-0.2 HTML browser fixture changed.");
}
if ((html.match(/<meta property="og:url"/g) || []).length !== 1) failures.push("Toolbox must contain exactly one og:url tag.");
if ((html.match(/<link rel="canonical"/g) || []).length !== 1) failures.push("Toolbox must contain exactly one canonical link.");
if (!html.includes('aria-live="polite"')) failures.push("Accessible status announcements are missing.");
if (!html.includes('aria-current="page"')) failures.push("Current navigation state is missing.");
if (!html.includes('class="skip-link"')) failures.push("Skip link is missing.");
if (!/\.tool-section,[\s\S]*\.data-section,[\s\S]*footer[\s\S]*display:\s*none\s*!important/.test(currentStyles)) {
  failures.push("Print CSS must hide personal tool sections.");
}
if (home.includes("one hundred expert personas")) failures.push("Home still mislabels simulated personas as experts.");
if (!home.includes("Robbie</b> is the name used in the room")) failures.push("Home does not distinguish Robbie from Siren.");
if (!home.includes("not a product claim")) failures.push("Home is missing the consciousness claim boundary.");
if (!home.includes("public Toolbox is an early household-practice alpha")) failures.push("Home is missing the Toolbox/Layer boundary.");
if (!home.includes('<body id="top">')) failures.push("Home must expose #top for cross-page return links.");
if (!home.includes("five higher-risk questions remain held for qualified review")) failures.push("Home must disclose the Questions publication hold.");
if (!home.includes('href="receipts/"')) failures.push("Home must link the reviewed Receipts route.");
if (home.includes("Nothing you type leaves your device")) failures.push("Home still contains the absolute privacy promise.");
if (/does not transmit what you type|sends no entries to us/i.test(home)) failures.push("Home still contains an overbroad transmission promise.");
if (!readme.includes("does not yet contain an open-source license")) failures.push("README must state the repository's current reuse status.");
if (!readme.includes("public alpha 0.3")) failures.push("README must name the current Toolbox alpha.");
if (!readme.includes("five higher-risk items are held elsewhere") || !readme.includes("disables medical, mental-health, and recovery publication")) failures.push("README must disclose the Questions review gate without exposing held drafts.");

requireIn(questions, /connect-src 'none'/, "Questions CSP must block scripted network connections.");
requireIn(questions, /script-src 'none'/, "Questions CSP must block scripts.");
requireIn(questions, /5 answers published; 5 held pending qualified review/, "Questions must disclose published and held counts.");
requireIn(questions, /Evidence is not clinical evidence|Experience is not clinical evidence/, "Questions must distinguish experience from clinical evidence.");
requireIn(questions, /GitHub issues are public and are not monitored for urgent help/, "Questions must disclose the public feedback boundary.");
if (/<script\b/i.test(questions)) failures.push("Questions must remain a no-JavaScript page.");
if (/\sstyle=/.test(questions)) failures.push("Inline style attributes are not allowed on the Questions page.");
const publishedQuestions = questionContent.entries.filter((entry) => entry.status === "publish");
const blockedQuestions = questionContent.entries.filter((entry) => entry.status === "blocked_review");
if (publishedQuestions.length !== 5 || blockedQuestions.length !== 0 || questionContent.heldCount !== 5) {
  failures.push("Questions v1 must publish five entries, expose no held titles, and record a held count of five.");
}
for (const entry of blockedQuestions) {
  if (questions.includes(`id="${entry.slug}"`) || questions.includes(entry.question)) {
    failures.push(`Blocked Questions entry rendered publicly: ${entry.slug}.`);
  }
}
for (const phrase of [
  "roughly fifteen minutes",
  "almost never survives",
  "works almost every time",
  "tool, not symptom"
]) {
  if (questions.toLowerCase().includes(phrase)) failures.push(`Questions contains the unsupported phrase: ${phrase}.`);
}

requireIn(status, /script-src 'none'/, "Status CSP must block scripts.");
for (const label of ["Live", "Tested", "Experience", "Planned", "Blocked", "Unknown"]) {
  if (!status.includes(`>${label}<`)) failures.push(`Status is missing the ${label} evidence label.`);
}
requireIn(status, /Questions publication gate/, "Status must report the Questions publication gate.");
requireIn(status, /current shared origin is not private-by-design/, "Status must reject a private-by-design claim on the shared origin.");
requireIn(status, /None published yet/, "Status must not invent public receipts.");
requireIn(status, /Machine consciousness remains an open philosophical question/, "Status must preserve the consciousness claim boundary.");
requireIn(book, /Archive Under Review/, "The Book must remain visibly held for review.");
requireIn(book, /not being presented here as guidance/, "The Book must not expose the prior unsourced text as guidance.");
requireIn(book, /AI-generated creative simulation/, "The Book must disclose its simulated authorship.");
requireIn(book, /img-src data:/, "The Book CSP must allow its declared data-URL favicon.");
requireIn(bookSummary, /Summary Under Review/, "The short Book route must remain visibly held for review.");
requireIn(bookSummary, /Shorter is not automatically safer or better sourced/, "The short Book route must explain why summarization does not clear the review gate.");
requireIn(bookSummary, /not testimony from the people, traditions, scientists, clinicians, or communities/, "The short Book route must reject simulated quotation authority.");
requireIn(bookSummary, /img-src data:/, "The short Book CSP must allow its declared data-URL favicon.");
if (/Council of (?:Indigenous Knowledge|Science|Abrahamic Faith)|<blockquote>|line worth keeping/i.test(bookSummary)) {
  failures.push("The held Book-summary route republishes simulated council claims or quotations.");
}
requireIn(saga, /FICTION \/ EVIDENCE BOUNDARY/, "The Saga must carry a persistent fiction/evidence boundary.");
requireIn(saga, /not an operational status page or consciousness claim/, "The Saga must not present mythology as status or consciousness evidence.");
requireIn(sirenThreatModel, /implemented in the public-alpha 0\.3 release candidate; exact public deployment is pending/, "The Siren threat model must not call the release candidate live before deployment.");

requireIn(receipts, /connect-src 'none'/, "Receipts CSP must block scripted network connections.");
requireIn(receipts, /script-src 'none'/, "Receipts must remain a no-JavaScript page.");
requireIn(receipts, /Build receipts are not outcome evidence/, "Receipts must distinguish source history from human outcomes.");
requireIn(receipts, /bounded to review records published by this project as of August 25, 2026/, "Receipts must bound its zeroes to the public project record.");
requireIn(receipts, /Public human-outcome receipts published/, "Receipts must disclose the empty outcome-evidence column.");
requireIn(receipts, /days without missing a shipment[\s\S]*intentionally not reported/i, "Receipts must explain why the self-expiring shipping streak was removed.");
for (const unsupported of ["ten questions answered", "no rented intelligence", "roughly $600/month", "Days the founders have missed shipping", "Paying agency customers", "Agency revenue received"]) {
  if (receipts.includes(unsupported)) failures.push(`Receipts retained an unsupported or self-expiring claim: ${unsupported}.`);
}
if (/\sstyle=/.test(receipts) || /\sstyle=/.test(bookSummary)) failures.push("New Receipts and Book-summary routes must not use inline style attributes.");

for (const [relativePath, purpose] of [
  ["CHANGELOG.md", "changelog"],
  ["SECURITY.md", "security policy"],
  ["docs/DEDICATED_ORIGIN.md", "dedicated-origin runbook"],
  ["docs/SIREN_BRIDGE_THREAT_MODEL.md", "Siren threat model"],
  [".github/ISSUE_TEMPLATE/toolbox-feedback.yml", "feedback template"],
  [".github/ISSUE_TEMPLATE/general-question.yml", "question template"]
]) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing ${purpose}: ${relativePath}.`);
}
requireIn(feedbackTemplate, /public and is not monitored for urgent help/i, "Feedback form must say it is public and non-urgent.");
requireIn(feedbackTemplate, /backup or handoff files, screenshots, names, contact details, transcripts, health information, household events, abuse, or threats/i, "Feedback form must prohibit private material.");
requireIn(questionTemplate, /public editorial inbox, not private advice/i, "Question form must disclose its public editorial boundary.");

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) failures.push(`Duplicate HTML ids: ${duplicateIds.join(", ")}.`);

const idSet = new Set(ids);
for (const [, target] of html.matchAll(/\sfor="([^"]+)"/g)) {
  if (!idSet.has(target)) failures.push(`Label points to missing control #${target}.`);
}

for (const [, source] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  if (/^(?:https?:|\/\/)/.test(source)) failures.push(`Toolbox loads an external script: ${source}.`);
}
for (const [, source] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
  if (/^(?:https?:|\/\/)/.test(source)) failures.push(`Toolbox loads an external code/style asset: ${source}.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Static trust, safety, privacy, and structure checks passed.");
