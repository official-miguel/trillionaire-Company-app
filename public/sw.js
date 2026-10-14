// Service worker: keeps the app opening without a connection.
//  • App files (_next/static, icons) are kept and served from the device.
//  • Pages are fetched fresh when online and kept as a copy; offline, the last
//    copy is shown (the calendar then reads its data from the device).
//  • Signing out clears the kept pages.
const VERSION = "v3";
const PAGES = `td-pages-${VERSION}`;
const ASSETS = `td-assets-${VERSION}`;
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f5;color:#0a0a0a">
<div style="text-align:center;padding:24px;max-width:340px"><p style="font-size:20px;font-weight:600;margin:0 0 8px">You're offline</p>
<p style="color:#6b6b6b;margin:0 0 16px">This page hasn't been opened on this device yet. Your calendar works offline once you've opened it online once.</p>
<a href="/calendar" style="display:inline-block;background:#32cd32;color:#0a0a0a;border-radius:999px;padding:10px 20px;font-weight:600;text-decoration:none">Open calendar</a></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ASSETS).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("td-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App files: from the device first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(ASSETS).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  const isPage = req.mode === "navigate";
  const isRsc = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (!isPage && !isRsc) return;

  // Pages: fresh when online, last copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected && !url.pathname.startsWith("/login")) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreVary: true });
        if (hit) return hit;
        if (isPage) {
          const calendar = await caches.match("/calendar", { ignoreVary: true });
          return calendar || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        return Response.error();
      }),
  );
});

// A reminder pushed from Supabase while the app is closed. The tag matches
// the in-app reminder, so a device that has the app open shows it only once.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Reminder" };
  }
  // Reminders and tasks pop up over whatever is on screen and stay there
  // until dismissed (on a laptop), with a buzz on phones. Notices about
  // setting changes are quieter.
  const important = data.kind !== "notice";
  event.waitUntil(
    self.registration.showNotification(data.title || "Reminder", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      requireInteraction: important,
      silent: false,
      vibrate: important ? [250, 120, 250, 120, 400] : [150],
      timestamp: Date.now(),
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      actions: [
        { action: "open", title: "Open" },
        { action: "dismiss", title: "Dismiss" },
      ],
      data: { url: data.url || "/calendar" },
    }),
  );
});

// Tapping a reminder (or "Open") opens the calendar or the page it points to.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const target = (event.notification.data && event.notification.data.url) || "/calendar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith(target));
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
