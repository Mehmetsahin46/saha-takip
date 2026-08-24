import './globals.css';
import { LocaleProvider } from '@/lib/i18n';

export const metadata = {
  title: 'Saha Takip — Şantiye & Personel Yönetim Sistemi',
  description: 'İnşaat ve şantiye yönetim, mesai, puantaj, araç filosu ve harcama takip platformu',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Saha Takip',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#d97706',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var savedTheme = localStorage.getItem('tema');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.setAttribute('data-theme', 'light');
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}

              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  var file = (e && e.filename) || '';
                  var msg = (e && e.message) || '';
                  var stack = (e && e.error && e.error.stack) || '';
                  if (
                    file.indexOf('chrome-extension:') !== -1 ||
                    file.indexOf('moz-extension:') !== -1 ||
                    msg.indexOf('M_ID') !== -1 ||
                    stack.indexOf('chrome-extension:') !== -1 ||
                    stack.indexOf('moz-extension:') !== -1
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var str = (e && e.reason && (e.reason.stack || e.reason.message || '')) || '';
                  if (
                    str.indexOf('chrome-extension:') !== -1 ||
                    str.indexOf('moz-extension:') !== -1 ||
                    str.indexOf('M_ID') !== -1
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);
              }
            `,
          }}
        />
      </head>
      <body>
        <LocaleProvider>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}

