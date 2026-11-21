// Vérification visuelle du site compilé (dossier out/) dans un vrai navigateur.
// Captures téléphone et PC de chaque page, détection des débordements horizontaux,
// ouverture d'une fiche de carte, simulation réelle, erreurs de console.
// Usage : node scripts/apercu.mjs <dossier de sortie>
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "apercu";
const ROOT = "out";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = join(ROOT, p);
  try { if ((await stat(f)).isDirectory()) f = join(f, "index.html"); } catch { f = f.endsWith(".html") ? f : f + ".html"; }
  try { res.writeHead(200, { "Content-Type": TYPES[extname(f)] ?? "application/octet-stream" }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end("404"); }
}).listen(4173);

await mkdir(OUT, { recursive: true });
const report = [];
const browser = await chromium.launch();
const PAGES = ["/", "/cartes/", "/collection/", "/simulateur/", "/meta/", "/tox/", "/patchs/"];
const VIEWS = { telephone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, pc: { width: 1440, height: 900 } };

for (const [vname, vp] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") report.push(`[${vname}] console : ${m.text()}`); });
  page.on("pageerror", (e) => report.push(`[${vname}] erreur JS : ${e.message}`));
  for (const p of PAGES) {
    await page.goto("http://localhost:4173" + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 2 && getComputedStyle(el).position !== "fixed"; })
        .filter((el) => !el.closest(".overflow-x-auto, .no-scrollbar, pre"))
        .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(el.getBoundingClientRect().right)}px)`);
      return { sw: document.documentElement.scrollWidth, w, bad };
    });
    report.push(`[${vname}] ${p} : largeur ${over.sw}/${over.w}${over.sw > over.w + 1 ? " ⚠ DÉBORDEMENT" : ""}${over.bad.length ? " · " + over.bad.join(" | ") : ""}`);
    const name = p === "/" ? "accueil" : p.replace(/\//g, "");
    await page.screenshot({ path: `${OUT}/${vname}-${name}.png`, fullPage: false });
    if (vname === "telephone") await page.screenshot({ path: `${OUT}/${vname}-${name}-complet.png`, fullPage: true, clip: undefined }).catch(() => {});
  }
  // fiche de carte
  await page.goto("http://localhost:4173/cartes/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const first = page.locator(".card-cell button").first();
  if (await first.count()) { await first.click(); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${vname}-fiche-carte.png` }); }
  await ctx.close();
}

// simulation réelle (PC) : toutes les cartes, précision rapide
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.push(`[simulation] erreur JS : ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.push(`[simulation] console : ${m.text()}`); });
  await page.goto("http://localhost:4173/simulateur/", { waitUntil: "networkidle" });
  await page.getByText("Toutes les cartes du jeu").click();
  const t0 = Date.now();
  await page.getByRole("button", { name: /Trouver les meilleurs decks/ }).click();
  try {
    await page.getByText("#1", { exact: true }).first().waitFor({ timeout: 600000 });
    report.push(`[simulation] terminée en ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/pc-simulation-resultats.png`, fullPage: true });
    const txt = await page.locator("section").first().innerText();
    await writeFile(`${OUT}/simulation.txt`, txt.slice(0, 6000));
  } catch (e) {
    report.push(`[simulation] ÉCHEC : ${e.message}`);
    await page.screenshot({ path: `${OUT}/pc-simulation-echec.png`, fullPage: true });
  }
  // téléphone : affichage des résultats
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "fr-FR" });
  await ctx.close();
  void m;
}
await browser.close();
server.close();
await writeFile(`${OUT}/rapport.txt`, report.join("\n") + "\n");
console.log(report.join("\n"));
