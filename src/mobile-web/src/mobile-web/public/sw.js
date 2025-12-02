// Service Worker for NikCLI Mobile PWA
const CACHE_NAME = 'nikcli-mobile-v1'
const RUNTIME_CACHE = 'nikcli-runtime'

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching assets')
      return cache.addAll(PRECACHE_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name)
            return caches.delete(name)
          })
      )
    })
  )
  self.clients.claim()
})

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip cross-origin requests (API calls)
  if (url.origin !== self.location.origin) {
    return
  }

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return
  }

  // Network first strategy for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Cache first strategy for static assets
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Network first for everything else (HTML pages)
  event.respondWith(networkFirst(request))
})

// Network first strategy
async function networkFirst(request) {
  try {
    const response = await fetch(request)

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request)
    if (cached) {
      console.log('[SW] Serving from cache:', request.url)
      return cached
    }

    // If it's a navigation request, show offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/')
      if (offlinePage) {
        return offlinePage
      }
    }

    throw error
  }
}

// Cache first strategy
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) {
    console.log('[SW] Serving from cache:', request.url)
    return cached
  }

  try {
    const response = await fetch(request)

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    console.error('[SW] Fetch failed:', error)
    throw error
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(RUNTIME_CACHE).then(() => {
      event.ports[0].postMessage({ success: true })
    })
  }
})

// Push notification support (for future)
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'default',
    data: data.url ? { url: data.url } : undefined,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'NikCLI', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }

      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

console.log('[SW] Service worker loaded')
