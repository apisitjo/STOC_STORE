// ===== Service Worker: เช็คสตอคอะไหล่ =====
// หน้าที่หลัก: ทำให้ติดตั้งเป็นแอป (PWA) ได้ + แคชหน้าเปลือกแอปไว้เปิดได้เร็ว/มีสัญญาณอินเทอร์เน็ตไม่ดีก็ยังเปิดแอปติด
// หมายเหตุ: ข้อมูลสต๊อกจริงดึงจาก Supabase (เรียลไทม์) ตัว service worker นี้ "ไม่ได้" ทำให้เบิก/บันทึกข้อมูลตอนออฟไลน์ได้
// ถ้าอยากได้ออฟไลน์แบบเขียนข้อมูลได้จริง ต้องทำ queue+sync เพิ่มอีกชั้นภายหลัง

const CACHE_VERSION = 'v3';
const CACHE_NAME = `stockcheck-shell-${CACHE_VERSION}`;

// ไฟล์เปลือกแอปที่จะแคชไว้ตอนติดตั้ง
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('stockcheck-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // ไม่ยุ่งกับ POST/PUT ไปยัง Supabase

  const url = new URL(req.url);

  // หน้าเว็บหลัก: network-first — พยายามโหลดของใหม่ก่อนเสมอ ถ้าออฟไลน์ค่อย fallback ไปแคช
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', resClone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ไฟล์อื่น (ไอคอน/แมนิเฟสต์/ไลบรารีจาก CDN): cache-first แล้วค่อยไปเน็ตถ้ายังไม่มีในแคช
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // แคชเฉพาะ response ที่โหลดสำเร็จ (กัน error ตัดสัญญาณ/CORS ทำพัง)
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
