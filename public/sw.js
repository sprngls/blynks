
const CACHE_NAME = 'blynks-cache-v2';
const STATIC_CACHE = 'blynks-static-v2';
const API_CACHE = 'blynks-api-v2';


const STATIC_ASSETS = [
  '/',
  '/dashboard.html',
  '/login.html',
  '/register.html',
  '/js/auth.js',
  '/js/chat.js',
  '/js/pwa.js',
  '/logo.png',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];


self.addEventListener('install', (event) => {
  console.log('[SW] Installiere Service Worker');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});


self.addEventListener('activate', (event) => {
  console.log('[SW] Aktiviere Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
            console.log('[SW] Lösche alten Cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else if (url.pathname.match(/\.(css|js|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        });
      })
    );
  } else if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return caches.match('/dashboard.html');
          });
        })
    );
  }
});


self.addEventListener('push', (event) => {
  console.log('[SW] Push-Nachricht erhalten:', event);
  
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'BLYNKS',
      body: 'Neue Nachricht',
      icon: '/logo.png',
      badge: '/logo.png'
    };
  }
  
  const options = {
    body: data.body || 'Neue Nachricht erhalten',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    vibrate: [200, 100, 200],
    sound: '/notification.mp3',
    data: {
      url: data.url || '/dashboard.html',
      chatId: data.chatId || null
    },
    actions: [
      {
        action: 'open',
        title: 'Öffnen',
        icon: '/logo.png'
      },
      {
        action: 'close',
        title: 'Schließen',
        icon: '/logo.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'BLYNKS', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/dashboard.html';
  const chatId = event.notification.data?.chatId;
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'OPEN_CHAT',
              chatId: chatId
            });
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  const cache = await caches.open('pending-messages');
  const requests = await cache.keys();
  
  for (const request of requests) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.delete(request);
        console.log('[SW] Nachricht synchronisiert');
      }
    } catch (error) {
      console.log('[SW] Sync fehlgeschlagen, später erneut versuchen');
    }
  }
}