// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _self = self as any;

_self.addEventListener('install', (event: any) => {
  event.waitUntil(_self.skipWaiting());
});

_self.addEventListener('activate', (event: any) => {
  event.waitUntil(_self.clients.claim());
});

_self.addEventListener('push', (event: any) => {
  let data = {} as Record<string, unknown>;
  try {
    data = event.data?.json() || {};
  } catch {
    // ignore malformed push payloads
  }

  const title = (data.title as string) || 'القرآن الكريم';
  const options = {
    body: (data.body as string) || '',
    icon: (data.icon as string) || '/assets/icons/icon-192.png',
    data: (data.url as string) || '/'
  };

  event.waitUntil(_self.registration.showNotification(title, options));
});

_self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(_self.clients.openWindow(String(url)));
});

 type WorkboxManifestEntry = { url: string; revision?: string };
const precacheManifest: WorkboxManifestEntry[] = (self as unknown as { __WB_MANIFEST?: WorkboxManifestEntry[] }).__WB_MANIFEST || [];
void precacheManifest;
