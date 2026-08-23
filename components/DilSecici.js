'use client';

import { useLocale } from '@/lib/i18n';

export default function DilSecici() {
  const { locale, setLocale } = useLocale();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        aria-label="Dil Seçimi"
        style={{
          background: 'var(--card)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '5px 8px',
          fontSize: 13,
          cursor: 'pointer',
          outline: 'none',
          fontWeight: 600,
        }}
      >
        <option value="tr">🇹🇷 TR</option>
        <option value="pl">🇵🇱 PL</option>
        <option value="en">🇬🇧 EN</option>
      </select>
    </div>
  );
}
