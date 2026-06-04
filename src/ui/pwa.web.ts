// PWA setup (web) — register the service worker that caches the app shell for
// offline use. Mirrors the legacy registration (docs/index.html:7072).
export function setupPWA(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // Inject the PWA manifest + apple-touch-icon links (the bare Expo-web template
  // doesn't emit them). Idempotent.
  const head = document.head;
  if (head && !document.querySelector('link[rel="manifest"]')) {
    const m = document.createElement('link');
    m.rel = 'manifest';
    m.href = '/manifest.webmanifest';
    head.appendChild(m);
    const apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = '/icons/apple-touch-icon.png';
    head.appendChild(apple);
  }

  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}
