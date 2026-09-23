// ============================================================================
// 서비스 워커 — 홈 화면 추가(PWA) · 오프라인 캐시
//   BUILD 는 배포 워크플로가 커밋 SHA 로 바꿔 넣는다. 값이 바뀌면 새 워커가 설치되고
//   예전 캐시는 activate 때 지운다.
//   전략:
//     - 페이지(HTML)·js·css : 네트워크 우선, 실패하면 캐시 (배포 직후에도 항상 최신을 받고, 오프라인이면 마지막 사본)
//     - 이미지·아이콘·폰트·CDN 스크립트 : 캐시 우선 + 뒤에서 갱신
//     - Supabase 등 그 밖의 다른 출처 요청 : 손대지 않음 (기록 데이터는 절대 캐시하지 않는다)
// ============================================================================
const BUILD = "__BUILD__";
const CACHE = "cm-" + BUILD;
const PRECACHE = [
  "./", "./index.html", "./stats.html", "./record.html", "./product-form.html", "./settings.html", "./login.html", "./signup.html", "./admin.html",
  "./css/style.css",
  "./js/config.js", "./js/seed-products.js", "./js/auth.js", "./js/store.js", "./js/ui.js", "./js/app.js", "./js/stats.js", "./js/record.js", "./js/admin.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
];
const CDN_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나가 실패해도 나머지는 담는다 (배포 중 잠깐 404 가 나도 설치는 되게)
    await Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch((err) => console.warn("[sw] precache 실패", u, err))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("cm-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isSameOrigin(url) { return url.origin === self.location.origin; }
function isShell(url) { return isSameOrigin(url) && /\.(html|js|css|webmanifest)$/.test(url.pathname) || (isSameOrigin(url) && url.pathname.endsWith("/")); }
function isAsset(url) { return (isSameOrigin(url) && /\.(png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf)$/.test(url.pathname)) || CDN_HOSTS.includes(url.host); }

/** 네트워크 우선 — 성공하면 캐시 갱신, 실패하면 캐시(쿼리 무시) */
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // 처음 보는 페이지를 오프라인에서 열면 메인으로
    if (req.mode === "navigate") { const home = await c.match("./index.html", { ignoreSearch: true }); if (home) return home; }
    throw err;
  }
}

/** 캐시 우선 — 있으면 바로 주고 뒤에서 갱신, 없으면 네트워크 */
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url; try { url = new URL(req.url); } catch (err) { return; }
  if (req.mode === "navigate" || isShell(url)) { e.respondWith(networkFirst(req)); return; }
  if (isAsset(url)) { e.respondWith(staleWhileRevalidate(req)); return; }
  // 그 밖(Supabase API 등)은 브라우저 기본 동작
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
