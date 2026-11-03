// Service Worker — เช็คสตอคอะไหล่
// หลักการ: "ข้อมูล" ต้องสดเสมอ / แคชเฉพาะ "เปลือกแอป" ไว้เปิดออฟไลน์เท่านั้น
const VERSION = 'v3-2026-11-03';           // เปลี่ยนเลขนี้ทุกครั้งที่อยากบังคับล้างแคชเก่า
const SHELL_CACHE = 'stockcheck-shell-' + VERSION;
const CDN_CACHE   = 'stockcheck-cdn-' + VERSION;
const SHELL_FILES = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
const CDN_HOSTS   = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      return Promise.all(SHELL_FILES.map(function (f) {
        return c.add(new Request(f, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // ลบแคชเก่าทุกอันที่ไม่ใช่ของเวอร์ชันนี้ (รวมแคชข้อมูลเก่าที่ทำให้เห็นข้อมูลค้าง)
      return Promise.all(keys.filter(function (k) {
        return k !== SHELL_CACHE && k !== CDN_CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                        // POST/PATCH/RPC ผ่านเน็ตตรงๆ
  var url = new URL(req.url);

  // 1) Supabase (ข้อมูลอะไหล่ / รูป / realtime) — ห้ามแคช ปล่อยให้เบราว์เซอร์ยิงไปเซิร์ฟเวอร์ตรงๆ
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // 2) ตัวหน้าแอป index.html — ลองโหลดจากเน็ตก่อนเสมอ (ได้เวอร์ชันล่าสุด) ถ้าออฟไลน์ค่อยใช้ที่แคช
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 3) ไลบรารีจาก CDN — ใช้ของแคชได้เลยแล้วอัปเดตเงียบๆ (เปิดออฟไลน์ได้)
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(CDN_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // 4) ไฟล์ static ของแอปเอง (manifest, icon) — เน็ตก่อน ถ้าไม่ได้ค่อยใช้แคช
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
  }
});
