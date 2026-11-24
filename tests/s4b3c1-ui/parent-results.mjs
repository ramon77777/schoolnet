// C.1 browser checks using fictitious families and intercepted local API responses.
// Start Vite on 127.0.0.1:5178 with VITE_SUPABASE_URL=http://127.0.0.1:59999
// and a fictitious VITE_SUPABASE_ANON_KEY. No hosted project is contacted.
// SCHOOLNET_PLAYWRIGHT_MODULE must name an absolute playwright/index.mjs path.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const BASE = "http://127.0.0.1:5178";
const FAKE_API = "http://127.0.0.1:59999";
const EXPECTED_SCENARIOS = 12;
const modulePath = process.env.SCHOOLNET_PLAYWRIGHT_MODULE;
assert(modulePath && isAbsolute(modulePath), "SCHOOLNET_PLAYWRIGHT_MODULE must be an absolute module path.");
const artifactDirectory = resolve(process.env.SCHOOLNET_UI_ARTIFACT_DIR || "tmp/s4b3c1-ui");
mkdirSync(artifactDirectory, { recursive: true });

const ids = {
  parentA: "f0000000-0000-4000-8000-000000000001",
  parentB: "f0000000-0000-4000-8000-000000000002",
  childA: "c0000000-0000-4000-8000-000000000001",
  childB: "c0000000-0000-4000-8000-000000000002",
  assessmentA: "a0000000-0000-4000-8000-000000000001",
  assessmentB: "a0000000-0000-4000-8000-000000000002",
};
const rows = [
  {
    childId: ids.childA, childName: "Aïcha TEST",
    courseId: "c1000000-0000-4000-8000-000000000001", assessmentId: ids.assessmentA,
    schoolId: "51000000-0000-4000-8000-000000000001", schoolName: "Collège TEST A",
    classId: "c2000000-0000-4000-8000-000000000001", className: "6e A",
    schoolYear: "2026–2027", subjectName: "Mathématiques", courseTitle: "Mathématiques — Calcul et nombres",
    title: "Nombres entiers", type: "quiz", maxScore: 20, score: 20,
    publishedAt: "2026-11-24T08:00:00+00:00",
  },
  {
    childId: ids.childB, childName: "Yao TEST",
    courseId: "c1000000-0000-4000-8000-000000000002", assessmentId: ids.assessmentB,
    schoolId: "51000000-0000-4000-8000-000000000002", schoolName: "Collège TEST B",
    classId: "c2000000-0000-4000-8000-000000000002", className: "5e B",
    schoolYear: "2026–2027", subjectName: "Français", courseTitle: "Français — Expression écrite",
    title: "Rédaction", type: "assignment", maxScore: 20, score: 14,
    publishedAt: "2026-11-24T07:00:00+00:00",
  },
];
const catalog = { children: rows.map((row) => ({ childId: row.childId, fullName: row.childName })), results: rows };
const feedback = "Très bon travail. <img src=x onerror=alert(1)> Ceci reste du texte.";
const EMPTY = { children: [], results: [] };
const responseHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "content-type": "application/json",
};

function mockUser(id) {
  return {
    id, aud: "authenticated", role: "authenticated",
    email: id === ids.parentA ? "parent.a@example.invalid" : "parent.b@example.invalid",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
    created_at: "2026-11-24T00:00:00Z",
  };
}

function mockSession(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", exp })}.fixture`,
    refresh_token: `fixture-only-${id}`, expires_at: exp, expires_in: 3600,
    token_type: "bearer", user: mockUser(id),
  };
}

function requestUser(request) {
  try {
    const payload = (request.headers().authorization || "").split(".")[1];
    return JSON.parse(Buffer.from(payload || "", "base64url").toString()).sub || ids.parentA;
  } catch {
    return ids.parentA;
  }
}

function deferred() {
  let release;
  const promise = new Promise((resolvePromise) => { release = resolvePromise; });
  return { promise, release };
}

let mode = "normal";
let slowStarted = null;
let browser;
let page;
let closing = false;
let failure = null;
const slowRequests = new Set();
const reports = [];
const pageErrors = [];
const routeErrors = [];
const blockedOrigins = new Set();
const screenshots = [];

function writeReport() {
  writeFileSync(join(artifactDirectory, "report.json"), JSON.stringify({
    passed: reports.length, expected: EXPECTED_SCENARIOS, scenarios: reports,
    failure, pageErrors, routeErrors, blockedOrigins: [...blockedOrigins], screenshots,
    fixturesOnly: true, base: BASE, fakeApi: FAKE_API,
  }, null, 2));
}

// This is a hard ceiling for the complete browser run, including cleanup.
const hardDeadline = setTimeout(() => {
  failure = "C.1 browser checks exceeded the global 120-second deadline.";
  mode = "normal";
  for (const pending of slowRequests) pending.wait.release();
  slowStarted?.release();
  writeReport();
  console.error(failure);
  process.exit(1);
}, 120_000);

async function releaseSlowRequests() {
  mode = "normal";
  const pending = [...slowRequests];
  for (const entry of pending) entry.wait.release();
  slowStarted?.release();
  await Promise.allSettled(pending.map((entry) => entry.finished.promise));
  await Promise.allSettled(pending.map(async (entry) => {
    const response = await entry.request.response();
    await response?.finished();
  }));
}

async function intercept(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === BASE) return route.continue();
  if (url.origin !== FAKE_API) {
    blockedOrigins.add(url.origin);
    return route.abort();
  }
  if (request.method() === "OPTIONS") {
    return route.fulfill({ status: 204, headers: responseHeaders, body: "" });
  }

  const uid = requestUser(request);
  let value = [];
  let pending = null;
  try {
    if (url.pathname === "/auth/v1/user") value = mockUser(uid);
    else if (url.pathname === "/auth/v1/token") value = mockSession(uid);
    else if (url.pathname === "/rest/v1/profiles") {
      const filter = url.searchParams.get("id") || "";
      if (filter.startsWith("in.(")) {
        const selected = new Set(filter.slice(4, -1).split(","));
        value = rows.filter((row) => selected.has(row.childId)).map((row) => ({
          id: row.childId, role: "student", full_name: row.childName, class_name: row.className,
        }));
      } else {
        const id = filter.startsWith("eq.") ? filter.slice(3) : uid;
        const profile = { id, role: "parent", full_name: id === ids.parentA ? "Parent TEST A" : "Parent TEST B", avatar_url: null };
        value = (request.headers().accept || "").includes("object") ? profile : [profile];
      }
    } else if (url.pathname === "/rest/v1/parent_links") {
      value = uid === ids.parentA ? rows.map((row) => ({ student_id: row.childId })) : [];
    } else if (url.pathname === "/rest/v1/rpc/schoolnet_parent_official_results") {
      const requestMode = mode;
      if (requestMode === "error") {
        return route.fulfill({ status: 503, headers: responseHeaders, body: JSON.stringify({ message: "C1 mock unavailable" }) });
      }
      if (requestMode === "slow" && uid === ids.parentA) {
        pending = { wait: deferred(), finished: deferred(), request };
        slowRequests.add(pending);
        slowStarted?.release();
        await pending.wait.promise;
      }
      value = uid === ids.parentB || requestMode === "nochildren" ? EMPTY
        : requestMode === "empty" ? { children: catalog.children, results: [] } : catalog;
    } else if (url.pathname === "/rest/v1/rpc/schoolnet_parent_official_result") {
      const params = request.postDataJSON();
      if (mode === "slow-detail" && uid === ids.parentA && params.p_child_id === ids.childA) {
        pending = { wait: deferred(), finished: deferred(), request };
        slowRequests.add(pending);
        slowStarted?.release();
        await pending.wait.promise;
      }
      const row = uid === ids.parentA
        ? rows.find((candidate) => candidate.childId === params.p_child_id && candidate.assessmentId === params.p_assessment_id)
        : null;
      value = row ? { found: true, result: row, feedback } : { found: false };
    }
    // Other local requests (notifications, V1 enrollments) return empty fixtures.
    await route.fulfill({ status: 200, headers: responseHeaders, body: JSON.stringify(value) });
  } catch (error) {
    if (!closing && !request.failure()) routeErrors.push(String(error));
    await route.abort().catch(() => undefined);
  } finally {
    if (pending) {
      slowRequests.delete(pending);
      pending.finished.release();
    }
  }
}

function pass(name) {
  reports.push(name);
  console.log(`PASS ${reports.length.toString().padStart(2, "0")} ${name}`);
}

async function capture(filename) {
  await page.screenshot({ path: join(artifactDirectory, filename), fullPage: true });
  screenshots.push(filename);
}

async function assertNoHorizontalOverflow() {
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert(size.content <= size.viewport + 1, `Horizontal overflow: ${JSON.stringify(size)}`);
}

try {
  const { chromium } = await import(pathToFileURL(modulePath).href);
  browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  context.setDefaultTimeout(8_000);
  context.setDefaultNavigationTimeout(15_000);
  await context.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.removeItem("sn_demo_role");
  }, mockSession(ids.parentA));
  await context.route("**/*", intercept);
  await context.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.hostname === "127.0.0.1" && url.port === "5178") {
      socket.connectToServer();
      return;
    }
    blockedOrigins.add(url.origin);
    return socket.close();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", async (dialog) => {
    pageErrors.push(`Unexpected dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });

  const official = page.locator('section[aria-labelledby="official-results-title"]');
  const childSelect = official.locator("select").nth(0);
  const typeSelect = official.locator("select").nth(1);
  const detailLinks = official.getByRole("link", { name: "Voir le résultat et l’appréciation", exact: true });
  const backLink = page.getByRole("link", { name: "← Retour aux résultats", exact: true });
  const titleA = page.getByRole("heading", { name: "Nombres entiers", exact: true });
  const titleB = page.getByRole("heading", { name: "Rédaction", exact: true });

  await page.goto(`${BASE}/app/parent/results`);
  await titleA.waitFor();
  await titleB.waitFor();
  assert.equal(await official.locator("article").count(), 2);
  pass("Catalogue officiel et fratrie sans inscriptions V1");
  await capture("01-results-desktop.png");

  await childSelect.selectOption(ids.childA);
  await titleB.waitFor({ state: "hidden" });
  assert.equal(await official.locator("article").count(), 1);
  await detailLinks.click();
  await page.getByRole("heading", { name: "Appréciation de l’enseignant", exact: true }).waitFor();
  assert((await page.locator("body").innerText()).includes(feedback));
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  assert.equal(new URL(page.url()).searchParams.get("source"), "official");
  pass("Détail parent et appréciation texte sans exécution HTML");
  await capture("02-detail-desktop.png");

  await backLink.click();
  await titleA.waitFor();
  assert.equal(await childSelect.inputValue(), ids.childA);
  pass("Retour conservant l’enfant sélectionné");

  await childSelect.selectOption("all");
  await titleB.waitFor();
  await detailLinks.first().click();
  await page.getByRole("heading", { name: "Appréciation de l’enseignant", exact: true }).waitFor();
  await backLink.click();
  await titleB.waitFor();
  assert.equal(await childSelect.inputValue(), "all");
  pass("Retour conservant Tous mes enfants");

  await typeSelect.selectOption("assignment");
  await titleA.waitFor({ state: "hidden" });
  await titleB.waitFor();
  assert.equal(await official.locator("article").count(), 1);
  await typeSelect.selectOption("all");
  await official.getByRole("searchbox").fill("Collège TEST A");
  await titleB.waitFor({ state: "hidden" });
  await titleA.waitFor();
  assert.equal(await official.locator("article").count(), 1);
  await official.getByRole("searchbox").fill("");
  await titleB.waitFor();
  pass("Filtre type et recherche sans mélange entre enfants");

  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  mode = "slow-detail";
  slowStarted = deferred();
  await childSelect.selectOption(ids.childA);
  await titleB.waitFor({ state: "hidden" });
  await detailLinks.click();
  await slowStarted.promise;
  await page.getByText("Chargement du résultat…", { exact: true }).waitFor();
  await backLink.click();
  await titleA.waitFor();
  await childSelect.selectOption(ids.childB);
  await titleA.waitFor({ state: "hidden" });
  await detailLinks.click();
  await titleB.waitFor();
  await page.getByRole("heading", { name: "Appréciation de l’enseignant", exact: true }).waitFor();
  assert(slowRequests.size > 0, "The test must hold child A's detail while child B's detail is visible.");
  await releaseSlowRequests();
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  assert.equal(await titleB.count(), 1);
  assert.equal(await titleA.count(), 0);
  assert.equal(new URL(page.url()).searchParams.get("childId"), ids.childB);
  assert.equal(await page.evaluate(() => performance.timeOrigin), documentOrigin, "Child changes must use SPA links without a document reload.");
  await backLink.click();
  await titleB.waitFor();
  assert.equal(await childSelect.inputValue(), ids.childB);
  await childSelect.selectOption("all");
  await titleA.waitFor();
  pass("Détail retardé de l’enfant A ignoré après navigation SPA vers l’enfant B");

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow();
  await capture("03-results-mobile.png");
  await detailLinks.first().click();
  await page.getByRole("heading", { name: "Appréciation de l’enseignant", exact: true }).waitFor();
  await assertNoHorizontalOverflow();
  await capture("04-detail-mobile.png");
  await backLink.click();
  await titleA.waitFor();
  pass("Liste et détail mobiles à 390 px sans débordement horizontal");

  mode = "nochildren";
  await page.reload();
  await page.getByRole("heading", { name: "Aucun enfant lié à votre compte", exact: true }).waitFor();
  pass("État aucun enfant lié");

  mode = "empty";
  await page.reload();
  await page.getByRole("heading", { name: "Aucun résultat officiel publié", exact: true }).waitFor();
  pass("État enfant lié sans résultat publié");

  mode = "error";
  await page.reload();
  await page.getByRole("heading", { name: "Résultats officiels indisponibles", exact: true }).waitFor();
  await page.getByRole("link", { name: "Cours libres", exact: true }).click();
  await page.getByText("Résultats des cours libres", { exact: true }).waitFor();
  await page.getByText("Aucun résultat", { exact: true }).waitFor();
  assert.equal(await page.getByText("Chargement impossible", { exact: true }).count(), 0);
  pass("Erreur officielle laissant les Cours libres accessibles");

  mode = "slow";
  slowStarted = deferred();
  await page.goto(`${BASE}/app/parent/results`);
  await slowStarted.promise;
  await page.evaluate(async (session) => {
    const { supabase } = await import("/src/lib/supabaseClient.ts");
    const result = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (result.error) throw result.error;
  }, mockSession(ids.parentB));
  await page.getByRole("heading", { name: "Aucun enfant lié à votre compte", exact: true }).waitFor();
  assert(slowRequests.size > 0, "The test must hold at least one parent A response before switching accounts.");
  await releaseSlowRequests();
  // Flush the browser's network/render turn after every held response was released.
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  assert.equal(await page.getByText("Nombres entiers", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Aucun enfant lié à votre compte", exact: true }).count(), 1);
  pass("Réponse retardée du parent A ignorée après connexion du parent B");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(routeErrors, []);
  pass("Aucune erreur JavaScript ni erreur du simulateur réseau");
  assert.equal(reports.length, EXPECTED_SCENARIOS);
} catch (error) {
  failure = String(error?.stack || error);
  process.exitCode = 1;
  console.error("FAIL", failure);
  if (page && !page.isClosed()) {
    console.error("URL", page.url());
    console.error((await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "Page unavailable")).slice(0, 4500));
    await capture("failure.png").catch(() => undefined);
  }
} finally {
  closing = true;
  await releaseSlowRequests();
  if (browser) await browser.close();
  clearTimeout(hardDeadline);
  writeReport();
  console.log(JSON.stringify({ passed: reports.length, expected: EXPECTED_SCENARIOS, failure, scenarios: reports }, null, 2));
}
