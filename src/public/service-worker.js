// Service Worker for Offline Support
const CACHE_NAME = 'lms-smkn1kras-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/public/images/logo.png',
  'https://cdn.tailwindcss.com'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip API requests from cache
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // Don't cache if not a success response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// Background sync for pending data
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'sync-pending-data') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Get pending data from IndexedDB or localStorage
  // Send to server when online
  console.log('[ServiceWorker] Syncing pending data...');
  
  try {
    // Example: sync pending exam submissions
    const pendingSubmissions = await getPendingSubmissions();
    
    for (const submission of pendingSubmissions) {
      await fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });
    }
    
    // Clear pending submissions after successful sync
    await clearPendingSubmissions();
    
    console.log('[ServiceWorker] Sync completed');
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
    throw error; // Retry sync
  }
}

async function getPendingSubmissions() {
  // Implement IndexedDB or localStorage retrieval
  return [];
}

async function clearPendingSubmissions() {
  // Implement clearing logic
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received:', event);
  
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
  console.log('[ServiceWorker] Notification click:', event);
  
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

console.log('[ServiceWorker] Loaded');
