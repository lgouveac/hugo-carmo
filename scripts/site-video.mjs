#!/usr/bin/env node
/**
 * Grava um vídeo (tour) do site inteiro.
 *
 * Sobe o site desta pasta num servidor local, resolve os assets externos
 * (Tailwind, GSAP, Lucide, content.json e fotos do Supabase) a partir do
 * próprio repositório e grava um passeio por todas as páginas públicas.
 *
 *   node scripts/site-video.mjs                      # 1920x1080, mp4
 *   node scripts/site-video.mjs --width 1080 --height 1920   # vertical (reels)
 *   node scripts/site-video.mjs --speed 420 --out /tmp/tour.mp4
 *
 * Saída padrão: .video-build/hugo-carmo-site.mp4
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = path.join(ROOT, ".video-build");
const TOOLS = path.join(BUILD, "tools");

/* ------------------------------------------------------------------ args */
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i === -1 ? fallback : argv[i + 1];
};
const flag = (name) => argv.includes("--" + name);

const WIDTH = Number(arg("width", 1920));
const HEIGHT = Number(arg("height", 1080));
const SPEED = Number(arg("speed", Math.round(HEIGHT * 0.5))); // px por segundo
const OUT = path.resolve(arg("out", path.join(BUILD, "hugo-carmo-site.mp4")));
const ONLY = arg("only", "");           // ex.: --only /,/loja
const CRF = String(Number(arg("crf", 23)));  // qualidade do mp4 (menor = melhor/maior)
const KEEP_WEBM = flag("keep-webm");
const SHOTS = flag("shots");             // diagnóstico: screenshots + erros, sem gravar

/* ------------------------------------------------- ferramentas (npm local) */
const TOOL_DEPS = {
  playwright: "1.56.1",
  tailwindcss: "3.4.17",
  gsap: "3.12.5",
  lucide: "0.544.0",
  "@ffmpeg-installer/ffmpeg": "1.1.0",
};

async function ensureTools() {
  const pkgPath = path.join(TOOLS, "package.json");
  const pkg = {
    name: "hugo-carmo-video-tools",
    private: true,
    version: "1.0.0",
    dependencies: TOOL_DEPS,
  };
  await fs.mkdir(TOOLS, { recursive: true });
  const current = await fs.readFile(pkgPath, "utf8").catch(() => "");
  const wanted = JSON.stringify(pkg, null, 2) + "\n";
  const installed = await fs.stat(path.join(TOOLS, "node_modules")).then(() => true, () => false);
  if (current !== wanted || !installed) {
    await fs.writeFile(pkgPath, wanted);
    console.log("• instalando ferramentas (playwright, tailwind, gsap, lucide, ffmpeg)…");
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error"], {
      cwd: TOOLS,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error("npm install falhou em " + TOOLS);
  }
}

const toolPath = (...p) => path.join(TOOLS, "node_modules", ...p);

/* ------------------------------------------------------- tailwind offline */
// O site usa o Tailwind via CDN (JIT no navegador). Sem rede, geramos o CSS
// equivalente varrendo os próprios arquivos do site.
async function buildTailwind() {
  const input = path.join(BUILD, "tw-input.css");
  const config = path.join(BUILD, "tailwind.config.cjs");
  const out = path.join(BUILD, "tailwind.css");
  await fs.writeFile(input, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  await fs.writeFile(
    config,
    'module.exports = { content: ["./*.html", "./content.json"], theme: { extend: {} }, plugins: [] };\n'
  );
  console.log("• gerando tailwind.css…");
  const r = spawnSync(
    process.execPath,
    [toolPath("tailwindcss", "lib", "cli.js"), "-c", config, "-i", input, "-o", out, "--minify"],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] }
  );
  if (r.status !== 0) throw new Error("build do tailwind falhou");
  return out;
}

/* ------------------------------------------------------- fonte (Inter) */
// Baixa a Inter uma vez e serve local, para o vídeo não depender de rede.
const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";

function curl(url, out) {
  const args = ["-fsSL", "-A",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
    url];
  if (out) args.push("-o", out);
  const r = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 ? (out ? true : r.stdout) : null;
}

async function ensureFonts() {
  const dir = path.join(BUILD, "fonts");
  const cssFile = path.join(dir, "inter.css");
  const vendor = {};
  const cached = await fs.readFile(cssFile, "utf8").catch(() => null);
  let css = cached;
  if (!css) {
    await fs.mkdir(dir, { recursive: true });
    const raw = curl(FONT_CSS_URL);
    if (!raw) {
      console.log("  (sem acesso ao Google Fonts — usando fonte do sistema)");
      return { css: null, files: vendor };
    }
    const urls = [...raw.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    css = raw;
    for (const [i, u] of urls.entries()) {
      const name = `inter-${i}${path.extname(u.split("?")[0]) || ".woff2"}`;
      if (!curl(u, path.join(dir, name))) continue;
      css = css.split(u).join(`/__vendor/fonts/${name}`);
    }
    await fs.writeFile(cssFile, css);
  }
  for (const f of await fs.readdir(dir)) vendor["fonts/" + f] = path.join(dir, f);
  return { css, files: vendor };
}

/* --------------------------------------------------- servidor local do site */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

async function startServer(vendor) {
  const server = http.createServer(async (req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath.startsWith("/__vendor/")) {
      const file = vendor[urlPath.slice("/__vendor/".length)];
      if (!file) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      return createReadStream(file).pipe(res);
    }
    if (urlPath.startsWith("/en/")) urlPath = urlPath.slice(3);        // vercel rewrites
    else if (urlPath === "/en") urlPath = "/";
    if (urlPath.startsWith("/viagem/")) urlPath = "/viagem.html";
    if (urlPath === "/") urlPath = "/index.html";
    let file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let stat = await fs.stat(file).catch(() => null);
    if (!stat && !path.extname(file)) {                                 // cleanUrls
      file += ".html";
      stat = await fs.stat(file).catch(() => null);
    }
    if (!stat || stat.isDirectory()) return res.writeHead(404).end("not found");
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/* ------------------------------------------- assets externos → locais */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200">
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff"
        font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="120" letter-spacing="26">KINA</text>
</svg>`;

async function buildAssetResolver() {
  const files = await fs.readdir(path.join(ROOT, "images"));
  const byName = new Map(files.map((f) => [f.toLowerCase(), path.join(ROOT, "images", f)]));
  const montagens = files.filter((f) => f.startsWith("montagem-")).sort();
  const fotos = files.filter((f) => f.startsWith("foto-")).sort();
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (url) => {
    const name = decodeURIComponent(url.split("?")[0].split("/").pop() || "").toLowerCase();
    const local = byName.get(name);
    if (local) return { file: local };
    if (/captura de tela|logo/.test(name)) return { body: LOGO_SVG, type: "image/svg+xml" };
    // imagens que vivem em buckets inacessíveis (produtos, capas): usa o acervo local
    const pool = /\.(avif|webp)$/.test(name) ? montagens : fotos;
    const pick = pool[hash(url) % pool.length];
    return { file: path.join(ROOT, "images", pick) };
  };
}

/* ------------------------------------------------------------ roteiro */
const TOUR = [
  {
    path: "/",
    label: "hugocarmo.com.br",
    actions: [
      { type: "hold", ms: 2600 },
      { type: "scroll" },
      { type: "lightbox", sel: "#galeria-grid img" },
      { type: "menu" },
    ],
  },
  { path: "/loja", label: "Loja", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/temas", label: "Temas", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/fotolivros", label: "Fotolivros", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/cicloviagens", label: "Cicloviagens", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/provador", label: "Provador IA", actions: [{ type: "hold", ms: 1800 }, { type: "scroll" }] },
  { path: "/blog", label: "Diário de viagem", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/viagem/alagoas", label: "Cicloviagem · Alagoas", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
  { path: "/sobre", label: "Sobre", actions: [{ type: "hold", ms: 1600 }, { type: "scroll" }] },
  { path: "/faq", label: "Perguntas frequentes", actions: [{ type: "hold", ms: 1400 }, { type: "scroll" }] },
];

/* ------------------------------------------------- helpers de página */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FADE_INIT = `
(() => {
  const mount = () => {
    const root = document.documentElement;
    if (!root || document.getElementById('__tour_fade')) return;
    const d = document.createElement('div');
    d.id = '__tour_fade';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0b0a;opacity:1;' +
      'transition:opacity .55s ease;pointer-events:none;display:flex;align-items:center;' +
      'justify-content:center;color:#fff;font-family:ui-monospace,Menlo,monospace;' +
      'letter-spacing:.35em;text-transform:uppercase;font-size:14px';
    root.appendChild(d);
    const s = document.createElement('style');
    s.textContent = 'html{scroll-behavior:auto !important}';
    root.appendChild(s);
  };
  mount();
  document.addEventListener('readystatechange', mount);
  document.addEventListener('DOMContentLoaded', mount);
})();`;

async function fadeIn(page, label) {
  await page.evaluate((text) => {
    const d = document.getElementById("__tour_fade");
    if (!d) return;
    d.textContent = text || "";
  }, label);
  await sleep(450);
  await page.evaluate(() => {
    const d = document.getElementById("__tour_fade");
    if (d) d.style.opacity = "0";
  });
  await sleep(620);
}

async function fadeOut(page) {
  await page.evaluate(() => {
    const d = document.getElementById("__tour_fade");
    if (d) {
      d.textContent = "";
      d.style.opacity = "1";
    }
  });
  await sleep(650);
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(() => {});
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(
          [...document.images]
            .filter((i) => !i.complete)
            .map((i) => new Promise((r) => i.addEventListener("load", r, { once: true }) || i.addEventListener("error", r, { once: true })))
        ),
        new Promise((r) => setTimeout(r, 2500)),
      ])
    )
    .catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await sleep(300);
}

async function smoothScroll(page, speed) {
  await page.evaluate(
    ({ speed }) =>
      new Promise((done) => {
        const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
        let y = window.scrollY;
        let last = performance.now();
        const t0 = last;
        const step = (now) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const remaining = maxY - y;
          const elapsed = (now - t0) / 1000;
          if (remaining <= 1.5 || elapsed > 90) return done();
          const rampIn = smooth(elapsed / 1.1);
          const rampOut = smooth(remaining / (window.innerHeight * 0.8));
          y = Math.min(maxY, y + speed * dt * Math.max(0.1, rampIn * rampOut));
          window.scrollTo(0, y);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { speed }
  );
  await sleep(900);
}

async function scrollToTop(page) {
  await page.evaluate(
    () =>
      new Promise((done) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 900);
          const e = 1 - Math.pow(1 - p, 3);
          window.scrollTo(0, start * (1 - e));
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      })
  );
}

async function runAction(page, action, speed) {
  if (action.type === "hold") return sleep(action.ms || 1500);
  if (action.type === "scroll") {
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight > 40
    );
    return scrollable ? smoothScroll(page, speed) : sleep(1800);
  }
  if (action.type === "menu") {
    const btn = page.locator("#menu-btn").first();
    if (!(await btn.count())) return;
    if (!(await btn.isVisible().catch(() => false))) return;
    await btn.click({ timeout: 3000 }).catch(() => {});
    await sleep(2200);
    const close = page.locator("#drawer-close, #drawer-bg").first();
    await close.click({ force: true, timeout: 3000 }).catch(() => page.keyboard.press("Escape"));
    await sleep(1200);
  }
  if (action.type === "lightbox") {
    const img = page.locator(action.sel).first();
    if (!(await img.count())) return;
    await img.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(600);
    await img.click({ force: true, timeout: 3000 }).catch(() => {});
    await sleep(2600);
    await page
      .locator("#modal-close")
      .first()
      .click({ force: true, timeout: 3000 })
      .catch(() => page.keyboard.press("Escape"));
    await sleep(1200);
    await scrollToTop(page);
    await sleep(400);
  }
}

/* --------------------------------------------------------------- main */
async function main() {
  await fs.mkdir(BUILD, { recursive: true });
  await ensureTools();
  const tailwindCss = await buildTailwind();
  console.log("• preparando fontes…");
  const fonts = await ensureFonts();

  const vendor = {
    "tailwind.css": tailwindCss,
    "gsap.js": toolPath("gsap", "dist", "gsap.min.js"),
    "lucide.js": toolPath("lucide", "dist", "umd", "lucide.js"),
    ...fonts.files,
  };
  const { server, base } = await startServer(vendor);
  const resolveAsset = await buildAssetResolver();

  const { chromium } = await import(toolPath("playwright", "index.mjs"));
  const videoDir = path.join(BUILD, "raw");
  await fs.rm(videoDir, { recursive: true, force: true });

  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--force-device-scale-factor=1"],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  });
  await context.addInitScript(FADE_INIT);

  const contentJson = await fs.readFile(path.join(ROOT, "content.json"), "utf8");

  await context.route("**/*", async (route) => {
    const url = route.request().url();
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();
    if (host === "127.0.0.1" || host === "localhost") return route.continue();
    if (host === "cdn.tailwindcss.com")
      return route.fulfill({
        contentType: "text/javascript",
        body: `window.tailwind={config:{}};(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='${base}/__vendor/tailwind.css';document.head.appendChild(l);})();`,
      });
    if (host === "unpkg.com") return route.fulfill({ path: vendor["lucide.js"], contentType: "text/javascript" });
    if (host === "cdn.jsdelivr.net") return route.fulfill({ path: vendor["gsap.js"], contentType: "text/javascript" });
    if (host.endsWith("fonts.googleapis.com")) {
      return fonts.css
        ? route.fulfill({ contentType: "text/css; charset=utf-8", body: fonts.css })
        : route.abort();
    }
    if (host.endsWith("fonts.gstatic.com")) {
      const local = vendor["fonts/" + path.basename(url.split("?")[0])];
      return local ? route.fulfill({ path: local }) : route.abort();
    }
    if (host.endsWith("supabase.co")) {
      if (url.includes("content.json"))
        return route.fulfill({ contentType: "application/json; charset=utf-8", body: contentJson });
      const asset = resolveAsset(url);
      return asset.file
        ? route.fulfill({ path: asset.file })
        : route.fulfill({ contentType: asset.type, body: asset.body });
    }
    return route.abort(); // analytics, redes sociais, etc.
  });

  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("JS: " + (e.stack || e.message)));
  page.on("console", (m) => m.type() === "error" && problems.push("console: " + m.text()));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!/localhost|127\.0\.0\.1|fonts\.|supabase/.test(u)) return;
    problems.push("request: " + u + " → " + (r.failure() && r.failure().errorText));
  });
  const pages = ONLY ? TOUR.filter((p) => ONLY.split(",").includes(p.path)) : TOUR;

  if (SHOTS) {
    const dir = path.join(BUILD, "shots");
    await fs.mkdir(dir, { recursive: true });
    for (const entry of pages) {
      problems.length = 0;
      await page.goto(base + entry.path, { waitUntil: "commit" }).catch(() => {});
      await settle(page);
      await page.evaluate(() => {
        const d = document.getElementById("__tour_fade");
        if (d) d.remove();
      });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const name = (entry.path === "/" ? "home" : entry.path.slice(1)) + ".jpg";
      await page.screenshot({ path: path.join(dir, name), fullPage: true, type: "jpeg", quality: 70 });
      console.log(`  ${entry.path.padEnd(16)} altura ${String(h).padStart(6)}px  ${problems.length ? "⚠ " + problems.slice(0, 4).join(" | ") : "ok"}`);
    }
    await context.close();
    await browser.close();
    server.close();
    return;
  }

  for (const entry of pages) {
    console.log("• gravando", entry.path);
    await page.goto(base + entry.path, { waitUntil: "commit" }).catch(() => {});
    await settle(page);
    await fadeIn(page, entry.label);
    for (const action of entry.actions) await runAction(page, action, SPEED);
    await sleep(700);
    await fadeOut(page);
  }

  const video = page.video();
  await context.close();
  await browser.close();
  server.close();

  const webm = await video.path();
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const ffmpeg = (await import(toolPath("@ffmpeg-installer", "ffmpeg", "index.js"))).default.path;
  console.log("• convertendo para mp4…");
  await new Promise((resolve, reject) => {
    const p = spawn(
      ffmpeg,
      ["-y", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-pix_fmt", "yuv420p",
       "-vf", "fps=30", "-movflags", "+faststart", OUT],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg saiu com " + code))));
  });
  if (!KEEP_WEBM) await fs.rm(path.join(BUILD, "raw"), { recursive: true, force: true });

  const { size } = await fs.stat(OUT);
  console.log(`\n✓ ${OUT} (${(size / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
