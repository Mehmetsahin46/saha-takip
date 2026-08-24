'use client';

import { useState, useEffect } from 'react';
import { getInitialTheme, temaUygula, temaDegistir } from '@/lib/theme';

export default function ThemeToggle({ showLabel = false, className = '' }) {
  const [tema, setTema] = useState('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const guncel = getInitialTheme();
    setTema(guncel);
    temaUygula(guncel);
  }, []);

  function degistir() {
    const yeni = temaDegistir(tema);
    setTema(yeni);
  }

  if (!mounted) {
    return (
      <button className={'theme-toggle ' + className} aria-label="Tema Değiştir" style={{ opacity: 0.5 }}>
        <span>◐</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={degistir}
      className={'theme-toggle ' + className}
      title={tema === 'dark' ? 'Açık Temaya Geç' : 'Karanlık Temaya Geç'}
      aria-label="Tema Değiştir"
    >
      {tema === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      )}
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>
          {tema === 'dark' ? 'Açık Mod' : 'Koyu Mod'}
        </span>
      )}
    </button>
  );
}

