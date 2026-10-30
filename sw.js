/* Janah Mart service worker.
   Naikkan VERSION setiap kali daftar file/cache di bawah berubah. */
const VERSION = "v2";
const SHELL = "jm-shell-" + VERSION;
const RUN = "jm-run-" + VERSION;
const IMG = "jm-img-v1"; // dihapus oleh aplikasi saat logout
const MAX_IMG = 150;

const SB_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap";
const CROSS_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
const LOCAL = ["./", "index.html", "manifest.json", "logo-janah-mart.png", "ikon-janah-mart.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "favicon-48.png", "apple-touch-icon.png"];

const corsReq = (url) => new Request(url, { mode: "cors", credentials: "omit" });

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.allSettled(LOCAL.map((u) => shell.add(new Request(u, { cache: "reload" }))));
    const run = await caches.open(RUN);
    await Promise.allSettled([SB_CDN, FONT_CSS].map((u) => run.add(corsReq(u))));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (![SHELL, RUN, IMG].includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

const isShellPath = (u) => u.pathname === "/" || u.pathname === "/index.html";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // API Supabase (data, login) tidak pernah di-cache oleh service worker.
  if (url.hostname.endsWith(".supabase.co")) {
    if (url.pathname.startsWith("/storage/v1/object/public/")) e.respondWith(imageFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    // Hanya halaman utama; halaman lain (mis. admin) dibiarkan langsung ke jaringan.
    if (url.origin === location.origin && isShellPath(url)) e.respondWith(navigate(req));
    return;
  }

  if (url.origin === location.origin) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (CROSS_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req, RUN));
});

async function navigate(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    if (res && res.ok && !res.redirected) c.put("index.html", res.clone());
    return res;
  } catch (_) {
    return (await c.match("index.html")) || (await c.match("./")) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(corsReq(req.url));
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (_) {
    return Response.error();
  }
}

async function imageFirst(req) {
  const c = await caches.open(IMG);
  const hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(corsReq(req.url));
    if (r && r.ok) { await c.put(req, r.clone()); trimCache(c); }
    return r;
  } catch (_) {
    return Response.error();
  }
}

async function trimCache(c) {
  const ks = await c.keys();
  if (ks.length > MAX_IMG) await Promise.all(ks.slice(0, ks.length - MAX_IMG).map((k) => c.delete(k)));
}
