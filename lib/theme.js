export function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem('tema');
  if (saved === 'dark' || saved === 'light') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function temaUygula(tema) {
  if (typeof window === 'undefined') return;
  const t = tema === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  if (t === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('tema', t);
}

export function temaDegistir(mevcutTema) {
  const yeniTema = mevcutTema === 'dark' ? 'light' : 'dark';
  temaUygula(yeniTema);
  return yeniTema;
}
