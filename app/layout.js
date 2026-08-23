import './globals.css';
import { LocaleProvider } from '@/lib/i18n';

export const metadata = {
  title: 'Saha Takip — Şantiye & Personel Yönetim Sistemi',
  description: 'İnşaat ve şantiye yönetim, mesai, puantaj, araç filosu ve harcama takip platformu',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
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
