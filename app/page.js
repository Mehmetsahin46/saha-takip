'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';
import DilSecici from '@/components/DilSecici';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [personelNo, setPersonelNo] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    // Aktif oturum varsa otomatik yönlendir
    const kayit = localStorage.getItem('aktifOturum');
    if (kayit) {
      try {
        const parsed = JSON.parse(kayit);
        if (parsed.rol === 'patron') router.push('/patron');
        else if (parsed.rol === 'personel' || parsed.rol === 'formen') router.push('/personel');
      } catch (e) {
        localStorage.removeItem('aktifOturum');
      }
    }
  }, [router]);

  async function girisYap(e) {
    if (e) e.preventDefault();
    setHata('');
    if (!personelNo.trim() || !sifre.trim()) {
      setHata('Lütfen Personel No ve Şifrenizi girin.');
      return;
    }

    setYukleniyor(true);

    try {
      // 1. Supabase'den sorgula
      const { data, error } = await supabase
        .from('personel')
        .select('*')
        .eq('personel_no', personelNo.trim())
        .eq('sifre', sifre.trim())
        .maybeSingle();

      if (error && error.message && !error.message.includes('FetchError')) {
        console.warn('Supabase sorgu hatası:', error.message);
      }

      let kullanici = data;

      // 2. Çevrimdışı/Demo Yedek Girişler
      if (!kullanici) {
        const demoKullanicilar = [
          { personel_no: '1000', sifre: '1234', ad: 'Ahmet Yılmaz (Patron)', rol: 'patron', gunluk_ucret: 0 },
          { personel_no: '1001', sifre: '1234', ad: 'Mehmet Demir (Formen)', rol: 'formen', gunluk_ucret: 350 },
          { personel_no: '1002', sifre: '1234', ad: 'Ali Kaya (Usta)', rol: 'personel', gunluk_ucret: 250 },
          { personel_no: '1003', sifre: '1234', ad: 'Can Yılmaz (İşçi)', rol: 'personel', gunluk_ucret: 200 },
        ];
        kullanici = demoKullanicilar.find(
          (k) => k.personel_no === personelNo.trim() && k.sifre === sifre.trim()
        );
      }

      if (!kullanici) {
        setHata('Hatalı personel numarası veya şifre!');
        setYukleniyor(false);
        return;
      }

      localStorage.setItem('aktifOturum', JSON.stringify(kullanici));

      if (kullanici.rol === 'patron') {
        router.push('/patron');
      } else {
        router.push('/personel');
      }
    } catch (err) {
      setHata('Giriş yapılırken bir hata oluştu: ' + err.message);
      setYukleniyor(false);
    }
  }

  function hizliGiris(no, pass) {
    setPersonelNo(no);
    setSifre(pass);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ maxWidth: 430, width: '100%', padding: '32px 28px', borderRadius: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-patron)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
              S
            </div>
            <span className="brand" style={{ fontSize: 18 }}>{t('appAdi')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <DilSecici />
            <ThemeToggle />
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Sisteme Giriş Yap</h1>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 20 }}>
          Şantiye ve personel yönetim paneline erişmek için kimlik bilgilerinizi girin.
        </div>

        <form onSubmit={girisYap}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Personel No / ID</label>
          <input
            type="text"
            value={personelNo}
            onChange={(e) => setPersonelNo(e.target.value)}
            placeholder="Örn: 1001"
            autoFocus
            style={{ marginBottom: 12 }}
          />

          <label style={{ fontSize: 12, fontWeight: 700 }}>Şifre</label>
          <input
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            placeholder="••••"
            style={{ marginBottom: 16 }}
          />

          <button
            type="submit"
            className="action btn-ai"
            disabled={yukleniyor}
            style={{ fontSize: 14, padding: 12 }}
          >
            {yukleniyor ? 'Giriş Yapılıyor...' : 'Oturum Aç'}
          </button>
        </form>

        {hata && <div className="feedback err" style={{ marginTop: 14 }}>{hata}</div>}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 10, textAlign: 'center', letterSpacing: '0.04em' }}>
            HIZLI TEST GİRİŞLERİ
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="action btn-secondary"
              style={{ margin: 0, padding: '8px 10px', fontSize: 11.5 }}
              onClick={() => hizliGiris('9001', 'admin123')}
            >
              Patron (9001)
            </button>
            <button
              type="button"
              className="action btn-secondary"
              style={{ margin: 0, padding: '8px 10px', fontSize: 11.5 }}
              onClick={() => hizliGiris('1001', '1234')}
            >
              Formen (1001)
            </button>
            <button
              type="button"
              className="action btn-secondary"
              style={{ margin: 0, padding: '8px 10px', fontSize: 11.5 }}
              onClick={() => hizliGiris('1002', '1234')}
            >
              Usta - Ali (1002)
            </button>
            <button
              type="button"
              className="action btn-secondary"
              style={{ margin: 0, padding: '8px 10px', fontSize: 11.5 }}
              onClick={() => hizliGiris('1003', '1234')}
            >
              İşçi - Can (1003)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

