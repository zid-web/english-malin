/* =============================================================================
 * English Malin — Service Worker
 * -----------------------------------------------------------------------------
 * Stratégies de cache :
 *   1. Pré-cache (install)  : « app shell » (HTML, JS, manifest, icônes,
 *                             Tailwind CDN, contenu initial) → l'app démarre
 *                             hors ligne dès la 1re visite.
 *   2. Cache-First          : assets statiques et audios (rarement modifiés).
 *   3. Network-First        : contenu évolutif (/data/*.json) et pages HTML,
 *                             avec repli sur le cache puis sur offline.html.
 *
 * Pour publier une nouvelle version : incrémenter CACHE_VERSION. Les anciens
 * caches sont supprimés à l'activation.
 * ========================================================================== */

const CACHE_VERSION = "v1.4.1";
const SHELL_CACHE = `eq-shell-${CACHE_VERSION}`;     // app shell pré-caché
const ASSET_CACHE = `eq-assets-${CACHE_VERSION}`;    // assets / audios (cache-first)
const CONTENT_CACHE = `eq-content-${CACHE_VERSION}`; // contenu évolutif (network-first)
const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, CONTENT_CACHE];

// Tailwind (CDN, version figée) : mis en cache pour que le style survive hors ligne.
const TAILWIND_CDN = "https://cdn.tailwindcss.com/3.4.17";

// Fichiers indispensables au démarrage hors ligne.
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./js/app.js",
  "./js/illustrations.js",
  "./data/lessons.json",
  "./icons/icon-192-v2.png",
  "./icons/icon-512-v2.png",
  "./icons/icon-maskable-512-v2.png",
];

// Délai max. avant de basculer sur le cache en Network-First (réseau lent).
const NETWORK_TIMEOUT_MS = 3500;

/* ----------------------------------------------------------------------------
 * INSTALL : pré-cache de l'app shell
 * ------------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // cache: "reload" contourne le cache HTTP du navigateur : on pré-cache
      // toujours la version qui vient d'être déployée, jamais une copie périmée.
      await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" })));

      // Ressource cross-origin : requête « no-cors » → réponse opaque,
      // qu'on peut stocker mais pas lire. Un échec ne bloque pas l'install.
      try {
        const res = await fetch(new Request(TAILWIND_CDN, { mode: "no-cors" }));
        await cache.put(TAILWIND_CDN, res);
      } catch (err) {
        console.warn("[SW] Tailwind non pré-caché :", err);
      }
    })()
  );
  // Pas de skipWaiting() automatique : on laisse l'utilisateur accepter la
  // mise à jour (message SKIP_WAITING envoyé depuis index.html).
});

/* ----------------------------------------------------------------------------
 * ACTIVATE : nettoyage des anciens caches + prise de contrôle des onglets
 * ------------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("eq-") && !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* ----------------------------------------------------------------------------
 * MESSAGE : la page demande l'activation immédiate de la nouvelle version
 * ------------------------------------------------------------------------- */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* ----------------------------------------------------------------------------
 * FETCH : aiguillage des requêtes vers la bonne stratégie
 * ------------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // on ne met jamais en cache POST/PUT…

  const url = new URL(request.url);

  // 1. Tailwind CDN → Cache-First (version figée, ne change jamais).
  if (request.url.startsWith(TAILWIND_CDN)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Google Fonts (feuille CSS + fichiers de police) → Cache-First.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Les autres ressources externes passent directement par le réseau.
  if (url.origin !== self.location.origin) return;

  // 2. Navigation (pages HTML) → Network-First, repli cache puis offline.html.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // 3. Contenu évolutif (leçons JSON) → Network-First.
  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request, CONTENT_CACHE));
    return;
  }

  // 4. Audios → Cache-First avec support des requêtes « Range » (lecteurs média).
  if (request.destination === "audio" || /\.(mp3|ogg|m4a|wav)$/i.test(url.pathname)) {
    event.respondWith(audioCacheFirst(request));
    return;
  }

  // 5. Assets statiques (JS, CSS, images, polices, manifest) → Cache-First.
  if (["script", "style", "image", "font", "manifest"].includes(request.destination)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

/* ============================================================================
 * Stratégies
 * ========================================================================= */

/** Cache-First : cache si présent, sinon réseau puis mise en cache. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // On ne stocke que les réponses valides (ou opaques pour le cross-origin).
    if (response.ok || response.type === "opaque") {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response("Ressource indisponible hors ligne.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** Network-First : réseau (avec délai max.), sinon dernière version en cache. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Réseau KO ou trop lent → cache dédié, puis app shell (contenu pré-caché).
    const cached = (await cache.match(request)) || (await caches.match(request));
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Pages HTML : Network-First, puis index.html en cache, puis offline.html. */
async function navigationHandler(request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("./index.html", response.clone());
    }
    return response;
  } catch (err) {
    return (
      (await caches.match("./index.html")) ||
      (await caches.match("./offline.html")) ||
      new Response("Hors ligne", { status: 503 })
    );
  }
}

/**
 * Audios : Cache-First. Les balises <audio> envoient des en-têtes « Range »
 * (lecture partielle) ; une réponse complète en cache ne les satisfait pas,
 * on découpe donc nous-mêmes le fichier et on renvoie un 206.
 */
async function audioCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const url = request.url;
  let full = await cache.match(url);

  if (!full) {
    try {
      // On récupère le fichier entier (sans Range) pour pouvoir le mettre en cache.
      const response = await fetch(url);
      if (!response.ok) return response;
      await cache.put(url, response.clone());
      full = response;
    } catch (err) {
      return new Response("", { status: 503 });
    }
  }

  const range = request.headers.get("range");
  if (!range) return full;

  const buffer = await full.clone().arrayBuffer();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match && match[1] ? Number(match[1]) : 0;
  const end = match && match[2] ? Number(match[2]) : buffer.byteLength - 1;

  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${buffer.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

/** fetch() qui échoue si le réseau ne répond pas dans le délai imparti. */
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
