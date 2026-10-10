// Service Worker for Offline Support
const CACHE_NAME = 'lms-smkn1kras-v3';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/public/images/logo.png'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).catch(() => {}) // jangan gagal install hanya karena cache
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  // Skip API, auth, upload requests — selalu dari network
  if (event.request.url.match(/\/(api|attempts|submit|answer|upload)\//)) return;
  // Skip POST requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then((response) => {
      // Cache hanya response sukses untuk asset statik
      if (response && response.status === 200 && response.type === 'basic') {
        const url = event.request.url;
        if (url.includes('/public/')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
      }
      return response;
    }).catch(() => {
      // Fallback ke cache
      return caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Fallback offline page untuk navigasi
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-data') {
    event.waitUntil(Promise.resolve()); // placeholder
  }
});

// Push notification handling
self.addEventListener('push', (event) => {
  
  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || 'LMS SMKN 1 Kras';
  const options = {
    body: data.body || 'Anda memiliki notifikasi baru',
    icon: '/public/images/logo.png',
    badge: '/public/images/logo.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.id || 1,
      type: data.type,
      reference_id: data.reference_id
    },
    actions: [
      {
        action: 'open',
        title: 'Buka',
        icon: '/public/images/logo.png'
      },
      {
        action: 'close',
        title: 'Tutup',
        icon: '/public/images/logo.png'
      }
    ],
    tag: data.type || 'notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const data = event.notification.data;
  let url = '/dashboard';

  if (data.type === 'MATERIAL' && data.reference_id) {
    url = `/student/materials/${data.reference_id}`;
  } else if (data.type === 'EXAM' && data.reference_id) {
    url = `/student/exams/${data.reference_id}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NAVIGATE',
            url: url
          });
          return;
        }
      }
      
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

