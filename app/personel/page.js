'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import { supabase } from '@/lib/supabase';
import { konumAl, mesafeMetre } from '@/lib/geo';
import QrOkuyucu from '@/components/QrOkuyucu';
import { useLocale } from '@/lib/i18n';
import DilSecici from '@/components/DilSecici';
import ThemeToggle from '@/components/ThemeToggle';
import AracTab from '@/components/personel/AracTab';
import ProjelerModulu from '@/components/ProjelerModulu';
import EkipmanTab from '@/components/personel/EkipmanTab';

function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

function formatPLN(deger) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(deger) || 0);
}

export default function PersonelPanel() {
  const router = useRouter();
  const { t } = useLocale();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('mesai');
  const [saat, setSaat] = useState('');
  const [tarihMetni, setTarihMetni] = useState('');
  const [aktifLokasyon, setAktifLokasyon] = useState(null);
  
  const [aktifGorevSayisi, setAktifGorevSayisi] = useState(0);
  const [bildirimler, setBildirimler] = useState([]); 
  const [bildirimKutusuAcik, setBildirimKutusuAcik] = useState(false);

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    try {
      const parsed = JSON.parse(kayit);
      if (parsed.rol !== 'personel' && parsed.rol !== 'formen') { router.push('/'); return; }
      setOturum(parsed);
    } catch (e) {
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSaat(now.toLocaleTimeString('tr-TR'));
      setTarihMetni(now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const bildirimleriYukle = useCallback(async () => {
    if (!oturum) return;
    const { data } = await supabase
      .from('gorevler')
      .select('*')
      .contains('atanan_personel_no', [oturum.personel_no])
      .neq('durum', 'Tamamlandı')
      .order('olusturulma_tarihi', { ascending: false });
    
    setBildirimler(data || []);
    setAktifGorevSayisi(data ? data.length : 0);
  }, [oturum]);

  useEffect(() => {
    if (oturum) bildirimleriYukle();
  }, [oturum, bildirimleriYukle]);

  useEffect(() => {
    if (!oturum) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('global-gorev-takip-' + oturum.personel_no)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'gorevler' }, 
        (payload) => {
          bildirimleriYukle();
          if (payload.eventType === 'INSERT') {
            const yeni = payload.new;
            if (Array.isArray(yeni.atanan_personel_no) && yeni.atanan_personel_no.includes(oturum.personel_no)) {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Yeni Görev Atandı', {
                  body: yeni.baslik + (yeni.lokasyon ? ' — ' + yeni.lokasyon : ''),
                  icon: '/favicon.ico',
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [oturum, bildirimleriYukle]);

  function cikisYapOturum() {
    localStorage.removeItem('aktifOturum');
    router.push('/');
  }

  if (!oturum) return null;

  return (
    <div>
      <div className="app-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: oturum.rol === 'formen' ? '#2563eb' : 'var(--accent-personel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16 }}>
            S
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: 'var(--ink)' }}>
                {oturum.rol === 'formen' ? 'SAHA TAKİP FORMEN' : 'SAHA TAKİP PERSONEL'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>
              👤 {oturum.ad} · {oturum.rol === 'formen' ? 'Saha Şefi / Formen' : 'Saha Çalışanı'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <DilSecici />
          <ThemeToggle />
          
          {/* Görev Bildirim Butonu */}
          <div style={{ position: 'relative' }}>
            <button 
              type="button"
              className="theme-toggle" 
              onClick={() => setBildirimKutusuAcik(!bildirimKutusuAcik)}
              style={{ position: 'relative', padding: '7px 11px' }}
              title="Görev Bildirimleri"
              aria-label="Görev Bildirimleri"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {aktifGorevSayisi > 0 && (
                <span style={{
                  position: 'absolute', top: '-3px', right: '-3px', background: 'var(--danger)', color: '#fff',
                  borderRadius: 9999, padding: '1px 5px', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', lineHeight: 1.2
                }}>
                  {aktifGorevSayisi}
                </span>
              )}
            </button>

            {bildirimKutusuAcik && (
              <div style={{
                position: 'absolute', top: '44px', right: '0', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                width: '300px', maxHeight: '360px', overflowY: 'auto', zIndex: 150, padding: '14px'
              }}>
                <div style={{ 
                  fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: '8px', 
                  marginBottom: '10px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: 'var(--ink)'
                }}>
                  <span>{t('sekmeGorevlerim')} ({aktifGorevSayisi})</span>
                  <span style={{ cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} onClick={() => setBildirimKutusuAcik(false)}>✕</span>
                </div>
                
                {bildirimler.length === 0 ? (
                  <div style={{ padding: '16px 0', color: 'var(--ink-soft)', fontSize: '12px', textAlign: 'center' }}>
                    {t('sizeAtanmisGorevYok')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {bildirimler.map(b => (
                      <div 
                        key={b.id} 
                        onClick={() => { setTab('gorevler'); setBildirimKutusuAcik(false); }}
                        style={{ 
                          padding: '10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', 
                          borderRadius: '6px', backgroundColor: 'var(--bg-soft)', textAlign: 'left'
                        }}
                      >
                        <div style={{ fontWeight: '600', fontSize: '12.5px', color: 'var(--ink)' }}>{b.baslik}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>{b.lokasyon || t('lokasyon')}</div>
                        <div style={{ fontSize: '10.5px', marginTop: '4px', fontWeight: 600, color: b.durum === 'Bekliyor' ? '#E8590C' : 'var(--accent-patron)' }}>
                          Durum: {b.durum}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="logout" onClick={cikisYapOturum}>{t('cikis')}</button>
        </div>
      </div>
      
      <div className="tabbar">
        <button className={tab === 'mesai' ? 'active-personel' : ''} onClick={() => setTab('mesai')}>{t('sekmeMesai')}</button>
        <button className={tab === 'saatler' ? 'active-personel' : ''} onClick={() => setTab('saatler')}>{t('sekmeSaatlerim')}</button>
        <button 
          className={tab === 'gorevler' ? 'active-personel' : ''} 
          onClick={() => setTab('gorevler')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {t('sekmeGorevlerim')}
          {aktifGorevSayisi > 0 && (
            <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>
              {aktifGorevSayisi}
            </span>
          )}
        </button>
        <button className={tab === 'arac' ? 'active-personel' : ''} onClick={() => setTab('arac')}>{t('sekmeArac')}</button>
        <button className={tab === 'ekipman' ? 'active-personel' : ''} onClick={() => setTab('ekipman')}>🧰 Ekipmanlarım</button>
        <button className={tab === 'projeler' ? 'active-personel' : ''} onClick={() => setTab('projeler')}>📐 Projeler & Planlar</button>
        <button className={tab === 'izin' ? 'active-personel' : ''} onClick={() => setTab('izin')}>İzin & Avans Taleplerim</button>
        <button className={tab === 'finans' ? 'active-personel' : ''} onClick={() => setTab('finans')}>Hakediş & Bakiye</button>
        {oturum.rol === 'formen' && (
          <button className={tab === 'veri' ? 'active-personel' : ''} onClick={() => setTab('veri')}>{t('sekmeSahaVerisi')}</button>
        )}
        {oturum.rol === 'formen' && (
          <button className={tab === 'defter' ? 'active-personel' : ''} onClick={() => setTab('defter')}>Günlük Faaliyet Raporu</button>
        )}
      </div>

      <div className="content">

        {tab === 'mesai' && (
          <MesaiTab
            oturum={oturum}
            saat={saat}
            tarihMetni={tarihMetni}
            lokasyonAyarlandi={setAktifLokasyon}
          />
        )}
        {tab === 'saatler' && <SaatlerimTab oturum={oturum} />}
        {tab === 'gorevler' && <GorevlerimTab oturum={oturum} onGorevDurumDegisti={bildirimleriYukle} />}
        {tab === 'arac' && <AracTab oturum={oturum} />}
        {tab === 'ekipman' && <EkipmanTab oturum={oturum} />}
        {tab === 'projeler' && <ProjelerModulu rol={oturum.rol} oturum={oturum} />}
        {tab === 'izin' && <PersonelIzinTab oturum={oturum} />}
        {tab === 'finans' && <PersonelFinansTab oturum={oturum} />}
        {tab === 'veri' && oturum.rol === 'formen' && <VeriTab oturum={oturum} aktifLokasyon={aktifLokasyon} />}
        {tab === 'defter' && oturum.rol === 'formen' && <SantiyeDefteriTab oturum={oturum} />}
      </div>
    </div>
  );
}

/* ---------------- MESAİ TAB ---------------- */
function MesaiTab({ oturum, saat, tarihMetni, lokasyonAyarlandi }) {
  const { t } = useLocale();
  const [acikKayit, setAcikKayit] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mesaj, setMesaj] = useState(null);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');
  const [ayarlar, setAyarlar] = useState({ konum_dogrulama_aktif: false, qr_dogrulama_aktif: false });

  const [konumDurum, setKonumDurum] = useState('bekliyor'); 
  const [konumMesaj, setKonumMesaj] = useState('');
  const [qrDurum, setQrDurum] = useState('bekliyor'); 
  const [qrMesaj, setQrMesaj] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('lokasyonlar').select('*'),
      supabase.from('sistem_ayarlari').select('*').eq('id', 1).maybeSingle()
    ]).then(([lokRes, ayarRes]) => {
      const lokData = lokRes.data || [];
      const ayarData = ayarRes.data || { konum_dogrulama_aktif: false, qr_dogrulama_aktif: false };
      
      setLokasyonlar(lokData);
      setAyarlar(ayarData);
      
      if (lokData.length > 0 && !ayarData.qr_dogrulama_aktif) {
        setSeciliLokasyon(lokData[0].ad);
      }
    });
  }, []);

  async function durumYukle() {
    setYukleniyor(true);
    const { data } = await supabase
      .from('giris_cikis')
      .select('*')
      .eq('personel_no', oturum.personel_no)
      .order('giris_saati', { ascending: false })
      .limit(1)
      .maybeSingle();

    let acikMi = !!(data && data.durum === 'Açık');
    if (acikMi && data) {
      const bugunStr = new Date().toISOString().slice(0, 10);
      const girisGunStr = new Date(data.giris_saati).toISOString().slice(0, 10);
      if (girisGunStr < bugunStr) {
        // Dünden veya önceki günlerden açık kalan mesai -> Otomatik 23:59 çıkış ve 8 saat normal çalışma ile kapat
        const otoCikis = new Date(girisGunStr + 'T23:59:59Z');
        await supabase.from('giris_cikis').update({
          cikis_saati: otoCikis.toISOString(),
          sure_saat: 8,
          durum: 'Kapalı'
        }).eq('id', data.id);
        acikMi = false;
        data.durum = 'Kapalı';
        data.sure_saat = 8;
        data.cikis_saati = otoCikis.toISOString();
      }
    }

    setAcikKayit(acikMi ? data : null);
    lokasyonAyarlandi(acikMi && data ? data.lokasyon : null);
    setYukleniyor(false);
    konumSifirla();
  }

  useEffect(() => { durumYukle(); }, []);

  function konumSifirla() {
    setKonumDurum('bekliyor'); setKonumMesaj('');
    setQrDurum('bekliyor'); setQrMesaj('');
  }
  // seciliLokasyon degisiminde qrDurum resetlenmez

  const hedefLokasyon = acikKayit
    ? lokasyonlar.find((l) => l.ad === acikKayit.lokasyon)
    : lokasyonlar.find((l) => l.ad === seciliLokasyon);

  async function konumDogrula() {
    setKonumDurum('kontrol'); setKonumMesaj('');
    if (!hedefLokasyon || hedefLokasyon.enlem == null || hedefLokasyon.boylam == null) {
      setKonumDurum('basarisiz');
      setKonumMesaj('Bu lokasyon için konum bilgisi tanımlanmamış.');
      return;
    }
    try {
      const { lat, lon } = await konumAl();
      const mesafe = mesafeMetre(lat, lon, hedefLokasyon.enlem, hedefLokasyon.boylam);
      const izinliMesafe = hedefLokasyon.yaricap_metre || 150;
      if (mesafe <= izinliMesafe) {
        setKonumDurum('basarili');
        setKonumMesaj('Konum doğrulandı (' + mesafe + ' m).');
      } else {
        setKonumDurum('basarisiz');
        setKonumMesaj('Sahada değilsiniz. Uzaklık: ' + mesafe + ' m');
      }
    } catch (err) {
      setKonumDurum('basarisiz');
      setKonumMesaj(err.message);
    }
  }

  function qrOkundu(kod) {
    if (!acikKayit) {
      // GİRİŞ İÇİN ŞANTİYE QR DOĞRULAMASI
      const bulunanLokasyon = lokasyonlar.find((l) => l.qr_kodu === kod || l.ad === kod);
      if (bulunanLokasyon) {
        setSeciliLokasyon(bulunanLokasyon.ad);
        setQrDurum('basarili');
        setQrMesaj('✅ Şantiye QR kodu doğrulandı: ' + bulunanLokasyon.ad);
      } else {
        setQrDurum('basarisiz');
        setQrMesaj('❌ Tanımsız veya geçersiz şantiye QR kodu.');
      }
    } else {
      // ÇIKIŞ İÇİN ŞANTİYE QR DOĞRULAMASI
      const eslesenLokasyon = lokasyonlar.find((l) => l.qr_kodu === kod);
      const mevcutLokasyonAdi = acikKayit.lokasyon;
      const mevcutLokasyonObj = lokasyonlar.find((l) => l.ad === mevcutLokasyonAdi);

      const gecerli = (mevcutLokasyonObj && kod === mevcutLokasyonObj.qr_kodu) || (eslesenLokasyon && eslesenLokasyon.ad === mevcutLokasyonAdi);

      if (gecerli) {
        setQrDurum('basarili');
        setQrMesaj('✅ Çıkış QR kodu doğrulandı: ' + mevcutLokasyonAdi);
      } else if (eslesenLokasyon) {
        setQrDurum('basarisiz');
        setQrMesaj(`❌ Bu QR kod "${eslesenLokasyon.ad}" şantiyesine ait. Lütfen çıkış yaptığınız "${mevcutLokasyonAdi}" şantiyesinin QR kodunu okutun.`);
      } else {
        setQrDurum('basarisiz');
        setQrMesaj('❌ Tanımsız veya geçersiz şantiye QR kodu.');
      }
    }
  }

  const isFormen = oturum.rol === 'formen';
  const dogrulamaGerekli = !isFormen && (ayarlar.konum_dogrulama_aktif || ayarlar.qr_dogrulama_aktif);
  const dogrulamaTamam = isFormen || (
    (!ayarlar.konum_dogrulama_aktif || konumDurum === 'basarili') &&
    (!ayarlar.qr_dogrulama_aktif || qrDurum === 'basarili')
  );

  async function girisYap() {
    setMesaj(null);
    if (!seciliLokasyon) { setMesaj({ tip: 'err', metin: 'Lütfen bugünkü lokasyonunuzu seçin.' }); return; }
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce QR / Konum doğrulamasını tamamlayın.' }); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from('giris_cikis').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      giris_saati: now,
      durum: 'Açık',
      lokasyon: seciliLokasyon,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Giriş kaydedildi.' });
    durumYukle();
  }

  async function cikisYap() {
    setMesaj(null);
    if (dogrulamaGerekli && !dogrulamaTamam) { setMesaj({ tip: 'err', metin: 'Önce çıkış QR / Konum doğrulamasını tamamlayın.' }); return; }
    
    const now = new Date();
    const girisSaati = new Date(acikKayit.giris_saati);
    const hamSure = (now - girisSaati) / 3600000;

    const sureSaat = Math.round(hamSure * 100) / 100;

    const { error } = await supabase
      .from('giris_cikis')
      .update({ cikis_saati: now.toISOString(), sure_saat: sureSaat, durum: 'Kapalı' })
      .eq('id', acikKayit.id);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    
    setMesaj({ 
      tip: 'ok', 
      metin: 'Çıkış kaydedildi. Süre: ' + sureFormatla(sureSaat) 
    });
    durumYukle();
  }

  const icerde = !!acikKayit;

  return (
    <>
      <div className="clock">{saat || '--:--:--'}</div>
      <div className="date-label">{tarihMetni}</div>
      <div className="card">
        <h2 className="section">{t('sekmeMesai')}</h2>

        {isFormen && (
          <div style={{ background: 'var(--accent-personel-soft)', border: '1px solid var(--accent-personel)', color: 'var(--accent-personel)', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            ⭐ <b>Başformen Yetkisi:</b> Tüm şantiyelerden sorumlu olduğunuz için QR okutma zorunluluğunuz bulunmamaktadır. Şantiyenizi seçerek doğrudan işlem yapabilirsiniz.
          </div>
        )}

        {icerde ? (
          <div className="loc-badge">
            <div>
              <div className="label">Bulunduğunuz Şantiye / Lokasyon</div>
              <div className="value">{acikKayit.lokasyon || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                Giriş: {new Date(acikKayit.giris_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ) : (!isFormen && ayarlar.qr_dogrulama_aktif) ? (
          <div className="loc-badge">
            <div>
              <div className="label">{seciliLokasyon ? t('lokasyon') : 'Giriş İçin Şantiye QR Kodunu Okutun'}</div>
              {seciliLokasyon && <div className="value">{seciliLokasyon}</div>}
            </div>
          </div>
        ) : (
          <>
            <label>{t('hangiLokasyondasiniz')}</label>
            <select value={seciliLokasyon} onChange={(e) => setSeciliLokasyon(e.target.value)}>
              {lokasyonlar.length === 0 && <option value="">Henüz lokasyon tanımlı değil</option>}
              {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
            </select>
          </>
        )}

        <div className="status-row">
          <span className={'dot ' + (icerde ? 'icerde' : 'disarda')}></span>
          <span>{yukleniyor ? t('yukleniyor') : (oturum.ad + ' ' + (icerde ? t('icerde') : t('disarda')))}</span>
        </div>

        {dogrulamaGerekli && !yukleniyor && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {ayarlar.konum_dogrulama_aktif && (
              <div style={{ marginBottom: 10 }}>
                {konumDurum !== 'basarili' && (
                  <button className="action btn-secondary" onClick={konumDogrula} disabled={konumDurum === 'kontrol'}>
                    {konumDurum === 'kontrol' ? '📍 ' + t('konumAliniyor') : '📍 ' + t('konumDogrula')}
                  </button>
                )}
                {konumDurum === 'basarili' && <div className="feedback ok">✅ {konumMesaj}</div>}
                {konumDurum === 'basarisiz' && <div className="feedback err">{konumMesaj}</div>}
              </div>
            )}
            {ayarlar.qr_dogrulama_aktif && (
              <div>
                {qrDurum !== 'basarili' && qrDurum !== 'tariyor' && (
                  <button className="action btn-secondary" onClick={() => setQrDurum('tariyor')}>
                    📷 {icerde ? 'Çıkış İçin QR Kod Okut' : 'Giriş İçin QR Kod Okut'}
                  </button>
                )}
                {qrDurum === 'tariyor' && (
                  <QrOkuyucu onOkundu={qrOkundu} onIptal={(hata) => { setQrDurum('bekliyor'); if (hata) setQrMesaj(hata); }} />
                )}
                {qrDurum === 'basarili' && <div className="feedback ok">{qrMesaj}</div>}
                {qrDurum === 'basarisiz' && <div className="feedback err">{qrMesaj}</div>}
              </div>
            )}
          </div>
        )}

        <button
          className={'action btn-punch' + (icerde ? ' cikis' : '')}
          onClick={icerde ? cikisYap : girisYap}
          disabled={yukleniyor || (!icerde && !lokasyonlar.length) || (dogrulamaGerekli && !dogrulamaTamam)}
        >
          {icerde ? t('cikisYap') : t('girisYapMesai')}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    </>
  );
}

/* ---------------- ÇALIŞMA SAATLERİM TAB ---------------- */
function SaatlerimTab({ oturum }) {
  const { t } = useLocale();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [bugun, setBugun] = useState(0);
  const [haftalik, setHaftalik] = useState(0);
  const [aylik, setAylik] = useState(0);
  const [gecmis, setGecmis] = useState([]);

  useEffect(() => {
    (async () => {
      setYukleniyor(true);
      const { data } = await supabase
        .from('giris_cikis')
        .select('*')
        .eq('personel_no', oturum.personel_no)
        .eq('durum', 'Kapalı')
        .order('giris_saati', { ascending: false });

      const kayitlar = data || [];
      const now = new Date();
      const bugunBaslangic = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const haftaBaslangic = new Date(now); haftaBaslangic.setDate(now.getDate() - 7);
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);

      let g = 0, h = 0, a = 0;
      kayitlar.forEach((k) => {
        const tarih = new Date(k.giris_saati);
        const sure = Number(k.sure_saat) || 0;
        if (tarih >= bugunBaslangic) g += sure;
        if (tarih >= haftaBaslangic) h += sure;
        if (tarih >= ayBaslangic) a += sure;
      });

      setBugun(Math.round(g * 100) / 100);
      setHaftalik(Math.round(h * 100) / 100);
      setAylik(Math.round(a * 100) / 100);
      setGecmis(kayitlar.slice(0, 15));
      setYukleniyor(false);
    })();
  }, [oturum.personel_no]);

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  return (
    <>
      <div className="grid cols-3">
        <div className="stat-card"><div className="label">Bugün</div><div className="value">{sureFormatla(bugun)}</div></div>
        <div className="stat-card"><div className="label">Bu hafta</div><div className="value">{sureFormatla(haftalik)}</div></div>
        <div className="stat-card"><div className="label">Bu ay</div><div className="value">{sureFormatla(aylik)}</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="section">{t('sonMesaiKayitlari')}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Süreler, mesai giriş ve çıkış saatleriniz üzerinden hesaplanmaktadır.</div>
        <table>
          <thead><tr><th>Tarih</th><th>Giriş</th><th>Çıkış</th><th>Süre</th></tr></thead>
          <tbody>
            {gecmis.map((k) => (
              <tr key={k.id}>
                <td>{new Date(k.giris_saati).toLocaleDateString('tr-TR')}</td>
                <td>{new Date(k.giris_saati).toLocaleTimeString('tr-TR')}</td>
                <td>{k.cikis_saati ? new Date(k.cikis_saati).toLocaleTimeString('tr-TR') : '—'}</td>
                <td>{k.sure_saat ? sureFormatla(k.sure_saat) : '—'}</td>
              </tr>
            ))}
            {gecmis.length === 0 && <tr><td colSpan={4}>Henüz tamamlanmış mesai kaydın yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- GÖREVLERİM TAB ---------------- */
function GorevlerimTab({ oturum, onGorevDurumDegisti }) {
  const { t } = useLocale();
  const [gorevler, setGorevler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [durumFiltre, setDurumFiltre] = useState('Tümü');
  const [fotoYukleniyor, setFotoYukleniyor] = useState(null);

  async function yukle() {
    setYukleniyor(true);
    const { data } = await supabase
      .from('gorevler')
      .select('*')
      .contains('atanan_personel_no', [oturum.personel_no])
      .order('olusturulma_tarihi', { ascending: false });
    setGorevler(data || []);
    setYukleniyor(false);
  }

  useEffect(() => { yukle(); }, [oturum.personel_no]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('gorev-bildirim-' + oturum.personel_no)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gorevler' }, (payload) => {
        const yeni = payload.new;
        if (Array.isArray(yeni.atanan_personel_no) && yeni.atanan_personel_no.includes(oturum.personel_no)) {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📋 Yeni Görev Atandı!', {
              body: yeni.baslik + (yeni.lokasyon ? ' — ' + yeni.lokasyon : ''),
              icon: '/favicon.ico',
            });
          }
          yukle();
          if (onGorevDurumDegisti) onGorevDurumDegisti();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(kanal); };
  }, [oturum.personel_no, onGorevDurumDegisti]);

  async function durumDegistir(gorev, yeniDurum) {
    await supabase.from('gorevler').update({
      durum: yeniDurum, tamamlanma_tarihi: yeniDurum === 'Tamamlandı' ? new Date().toISOString() : null,
    }).eq('id', gorev.id);
    yukle();
    if (onGorevDurumDegisti) onGorevDurumDegisti();
  }

  async function fotoSecildiVeTamamlandi(e, gorev) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya || !gorev) return;
    setFotoYukleniyor(gorev.id);
    const dosyaAdi = Date.now() + '-' + dosya.name.replace(/\s+/g, '-');
    const { error: yuklemeHatasi } = await supabase.storage.from('gorev-fotolari').upload(dosyaAdi, dosya);
    if (yuklemeHatasi) {
      alert('Fotoğraf yüklenemedi: ' + yuklemeHatasi.message);
      setFotoYukleniyor(null);
      return;
    }
    const { data: urlData } = supabase.storage.from('gorev-fotolari').getPublicUrl(dosyaAdi);
    await supabase.from('gorevler').update({
      durum: 'Tamamlandı', tamamlanma_tarihi: new Date().toISOString(), tamamlanma_foto_url: urlData.publicUrl,
    }).eq('id', gorev.id);
    setFotoYukleniyor(null);
    yukle();
    if (onGorevDurumDegisti) onGorevDurumDegisti();
  }

  if (yukleniyor) return <div className="loading-text">Yükleniyor...</div>;

  const gosterilenler = durumFiltre === 'Tümü' ? gorevler : gorevler.filter((g) => g.durum === durumFiltre);
  const oncelikRengi = { 'Düşük': '#5B6560', 'Normal': '#E8590C', 'Yüksek': '#A0592A', 'Acil': '#B23B0E' };

  return (
    <div className="card">
      <h2 className="section">{t('sekmeGorevlerim')}</h2>
      <label>Durum filtrele</label>
      <select value={durumFiltre} onChange={(e) => setDurumFiltre(e.target.value)}>
        <option>Tümü</option><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option>
      </select>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {gosterilenler.map((g) => (
          <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{g.baslik}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{g.lokasyon}</div>
            {g.aciklama && <div style={{ fontSize: 13, marginTop: 6 }}>{g.aciklama}</div>}
            <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: oncelikRengi[g.oncelik] || 'var(--ink-soft)' }}>{g.oncelik}</span>
              {g.son_tarih && <span style={{ color: 'var(--ink-soft)' }}>Son tarih: {new Date(g.son_tarih).toLocaleDateString('tr-TR')}</span>}
              <span className={'status-tag' + (g.durum === 'Tamamlandı' ? ' open' : '')}>{g.durum}</span>
            </div>
            {g.tamamlanma_foto_url && (
              <a href={g.tamamlanma_foto_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                <img src={g.tamamlanma_foto_url} alt="Tamamlanma" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6 }} />
              </a>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {g.durum === 'Bekliyor' && (
                <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}>Başladım</button>
              )}
              {g.durum !== 'Tamamlandı' && (
                <>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} id={'foto-input-' + g.id} onChange={(e) => fotoSecildiVeTamamlandi(e, g)} />
                  <button onClick={() => document.getElementById('foto-input-' + g.id)?.click()} className="action btn-punch" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }} disabled={fotoYukleniyor === g.id}>
                    {fotoYukleniyor === g.id ? 'Yükleniyor...' : '📷 Fotoğrafla Tamamla'}
                  </button>
                </>
              )}
              {g.durum === 'Tamamlandı' && (
                <button onClick={() => durumDegistir(g, 'Devam Ediyor')} className="action btn-secondary" style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}>Geri al</button>
              )}
            </div>
          </div>
        ))}
        {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Size atanmış görev yok.</div>}
      </div>
    </div>
  );
}

/* ---------------- SAHA VERİSİ TAB (USTABAŞI) ---------------- */
function VeriTab({ oturum, aktifLokasyon }) {
  const { t } = useLocale();
  const [kalemTurleri, setKalemTurleri] = useState([]);
  const [kalemTuru, setKalemTuru] = useState('');
  const [miktar, setMiktar] = useState('');
  const [birimFiyat, setBirimFiyat] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [fisNo, setFisNo] = useState('');
  const [mesaj, setMesaj] = useState(null);
  const [taraniyor, setTaraniyor] = useState(false);
  const dosyaInputRef = useRef(null);

  useEffect(() => {
    supabase.from('kalem_turleri').select('*').then(({ data }) => setKalemTurleri(data || []));
  }, []);

  const toplam = (Number(miktar) || 0) * (Number(birimFiyat) || 0);

  const kaydet = async (otomatikVeri) => {
    if (!aktifLokasyon) {
      setMesaj({ tip: 'err', metin: 'Önce "Mesai" sekmesinden giriş yapmalısınız.' });
      return;
    }

    const kt = otomatikVeri ? otomatikVeri.kalem_turu : kalemTuru;
    const mk = otomatikVeri ? otomatikVeri.miktar : miktar;
    const bf = otomatikVeri ? otomatikVeri.birim_fiyat : birimFiyat;
    const pb = 'PLN';
    const ak = otomatikVeri ? otomatikVeri.aciklama : aciklama;
    const tp = (Number(mk) || 0) * (Number(bf) || 0);

    setMesaj(null);
    if (!kt || !String(kt).trim() || !mk || !bf) {
      setMesaj({ tip: 'err', metin: 'Alanları kontrol edin.' });
      return;
    }

    if (!kalemTurleri.find((k) => k.ad === String(kt).trim())) {
      await supabase.from('kalem_turleri').insert({ ad: String(kt).trim() });
      setKalemTurleri((onceki) => [...onceki, { ad: String(kt).trim() }]);
    }

    const { error } = await supabase.from('saha_verileri').insert({
      personel_no: oturum.personel_no,
      ad: oturum.ad,
      lokasyon: aktifLokasyon,
      kalem_turu: String(kt).trim(),
      miktar: Number(mk),
      birim_fiyat: Number(bf),
      para_birimi: pb,
      toplam: tp,
      aciklama: ak || null,
      islem_turu: 'harcama',
      fis_no: fisNo.trim() || null,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }

    setMesaj({
      tip: 'ok',
      metin: (otomatikVeri ? '📷 Fişten okundu. ' : 'Kaydedildi. ') + 'Toplam: ' + formatPLN(tp),
    });
    setKalemTuru(''); setMiktar(''); setBirimFiyat(''); setAciklama(''); setFisNo('');
  };

  function kameraAc() { dosyaInputRef.current?.click(); }

  async function fisSecildi(e) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya || !aktifLokasyon) return;

    setMesaj(null); setTaraniyor(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const okuyucu = new FileReader();
        okuyucu.onload = () => resolve(okuyucu.result);
        okuyucu.onerror = () => reject(new Error('Görsel okunamadı.'));
        okuyucu.readAsDataURL(dosya);
      });

      const yanit = await fetch('/api/fis-oku', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: dosya.type || 'image/jpeg' }),
      });
      const sonuc = await yanit.json();

      if (!sonuc.basari || !sonuc.veri) {
        setMesaj({ tip: 'err', metin: 'Fiş tam okunamadı, bilgileri elle girin.' });
        return;
      }

      const { kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama } = sonuc.veri;

      setKalemTuru(kalem_turu || '');
      setMiktar(okunanMiktar ?? '');
      setBirimFiyat(birim_fiyat ?? '');
      setAciklama(okunanAciklama || '');

      if (kalem_turu && okunanMiktar && birim_fiyat) {
        await kaydet({ kalem_turu, miktar: okunanMiktar, birim_fiyat, aciklama: okunanAciklama });
      }
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Tarama başarısız: ' + err.message });
    } finally {
      setTaraniyor(false);
    }
  }

  return (
    <div className="card">
      <h2 className="section">{t('sahaVerisiEkle')}</h2>
      {aktifLokasyon ? <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Lokasyon: <b>{aktifLokasyon}</b></div> : <div className="feedback err">Önce giriş yapın.</div>}

      <input ref={dosyaInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={fisSecildi} />
      <button type="button" className="action btn-ai" style={{ marginTop: 10 }} onClick={kameraAc} disabled={taraniyor || !aktifLokasyon}>
        {taraniyor ? '📷 Fiş okunuyor...' : '📷 Fiş Tara (Kamera)'}
      </button>

      <label style={{ marginTop: 16 }}>Kalem türü (Şantiye Harcaması)</label>
      <div className="chip-row">
        {kalemTurleri.map((k) => <span key={k.ad} className={'chip' + (kalemTuru === k.ad ? ' sel' : '')} onClick={() => setKalemTuru(k.ad)}>{k.ad}</span>)}
      </div>
      <input style={{ marginTop: 8 }} placeholder="veya yeni kalem türü" value={kalemTuru} onChange={(e) => setKalemTuru(e.target.value)} />
      
      <label>Miktar</label>
      <input type="number" step="0.01" value={miktar} onChange={(e) => setMiktar(e.target.value)} placeholder="0" />
      
      <label>Birim fiyat (PLN)</label>
      <input type="number" step="0.01" value={birimFiyat} onChange={(e) => setBirimFiyat(e.target.value)} placeholder="0" />
      
      <div className="total">Toplam: {formatPLN(toplam)}</div>
      
      <label>Fiş / Belge No (opsiyonel)</label>
      <input value={fisNo} onChange={(e) => setFisNo(e.target.value)} placeholder="F-1042" />

      <label>Açıklama (opsiyonel)</label>
      <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="kısa not" />
      
      <button className="action btn-secondary" onClick={() => kaydet()} disabled={!aktifLokasyon}>Kaydet</button>
      {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
    </div>
  );
}

/* ---------------- ŞANTİYE DEFTERİ (Formen Günlük Faaliyet Raporu) ---------------- */
function parseRapor(r) {
  if (!r) return null;
  let parsedMeta = {};
  if (r.notlar && typeof r.notlar === 'string' && r.notlar.startsWith('{') && r.notlar.endsWith('}')) {
    try {
      parsedMeta = JSON.parse(r.notlar);
    } catch (e) {}
  }
  return {
    ...r,
    tarih: r.tarih || parsedMeta.tarih || (r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : ''),
    saat: r.saat || parsedMeta.saat || (r.created_at ? new Date(r.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''),
    hava_durumu: r.hava_durumu || parsedMeta.hava_durumu || 'Güneşli',
    sicaklik: r.sicaklik || parsedMeta.sicaklik || '-',
    patron_notu: r.patron_notu || parsedMeta.patron_notu || '',
    patron_yarin_notu: r.patron_yarin_notu || parsedMeta.patron_notu || '',
    patron_onay: r.patron_onay || parsedMeta.patron_onay || r.durum || 'Yeni',
    notlar: parsedMeta.notMetni !== undefined ? parsedMeta.notMetni : r.notlar,
    _rawMeta: parsedMeta,
  };
}

function SantiyeDefteriTab({ oturum }) {
  const { t } = useLocale();
  const [aktifSekme, setAktifSekme] = useState('yeni'); // 'yeni' | 'gecmis'
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [lokasyon, setLokasyon] = useState('');
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [saat, setSaat] = useState(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  
  // 1. Hava & Saha Koşulları
  const [havaDurumu, setHavaDurumu] = useState('Güneşli');
  const [sicaklik, setSicaklik] = useState('22°C');
  const [sahaDurumu, setSahaDurumu] = useState('Normal Çalışma');

  // 2. İş Gücü (Sadece Formen ve Usta)
  const [formenSayisi, setFormenSayisi] = useState('1');
  const [ustaSayisi, setUstaSayisi] = useState('0');
  const [qrPersoneller, setQrPersoneller] = useState([]);
  const [qrYukleniyor, setQrYukleniyor] = useState(false);

  // 3. Makine / Ekipman Durumu
  const [araclar, setAraclar] = useState([
    { cins: '', adet: '1', durum: 'Çalıştı', calismaSaati: '8', not: '' }
  ]);

  // 4. Günlük Kullanılan Malzemeler ve Satın Alımlar
  const [gelenMalzemeler, setGelenMalzemeler] = useState([
    { malzeme: '', miktar: '', tedarikciIrsaliye: '', durum: 'Satın Alındı' }
  ]);

  // 5. Yapılan İmalatlar & 6. Yarınki Plan
  const [bugunYapilan, setBugunYapilan] = useState('');
  const [yarinYapilacak, setYarinYapilacak] = useState('');

  // 7. Genel Notlar
  const [notlar, setNotlar] = useState('');

  // Durumlar
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [gecmisRaporlar, setGecmisRaporlar] = useState([]);
  const [seciliGecmisRapor, setSeciliGecmisRapor] = useState(null);

  // Canlı Toplam İş Gücü Hesabı (Formen + Usta)
  const genelToplamPersonel = (Number(formenSayisi) || 0) + (Number(ustaSayisi) || 0);

  function raporlariYukle() {
    supabase
      .from('santiye_defterleri')
      .select('*')
      .eq('formen_no', oturum.personel_no)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        const duzenlenmis = (data || []).map(parseRapor);
        setGecmisRaporlar(duzenlenmis);
      });
  }

  // Tarih veya Lokasyon değiştiğinde QR okutan personelleri otomatik getir
  const qrOkutanlariGetir = useCallback(async (hedefLokasyon, hedefTarih) => {
    if (!hedefLokasyon || !hedefTarih) return;
    setQrYukleniyor(true);
    try {
      const baslangic = `${hedefTarih}T00:00:00`;
      const bitis = `${hedefTarih}T23:59:59.999`;

      const [{ data: kayitlar }, { data: personelListesi }] = await Promise.all([
        supabase
          .from('giris_cikis')
          .select('*')
          .eq('lokasyon', hedefLokasyon)
          .gte('giris_saati', baslangic)
          .lte('giris_saati', bitis)
          .order('giris_saati', { ascending: true }),
        supabase
          .from('personel')
          .select('personel_no, ad, rol')
      ]);

      const rolMap = {};
      (personelListesi || []).forEach((p) => {
        rolMap[p.personel_no] = p.rol || 'personel';
      });

      // Tekil personelleri listele
      const tekilPersoneller = [];
      const gorulen = new Set();

      (kayitlar || []).forEach((k) => {
        if (!gorulen.has(k.personel_no)) {
          gorulen.add(k.personel_no);
          tekilPersoneller.push({
            personel_no: k.personel_no,
            ad: k.ad,
            rol: rolMap[k.personel_no] || 'personel',
            giris_saati: k.giris_saati,
            durum: k.durum
          });
        }
      });

      setQrPersoneller(tekilPersoneller);

      // Formen ve Usta/İşçi sayılarını otomatik hesapla
      let fSayisi = tekilPersoneller.filter((p) => p.rol === 'formen').length;
      let uSayisi = tekilPersoneller.filter((p) => p.rol !== 'formen' && p.rol !== 'patron').length;

      // Eğer formen kendisi dolduruyorsa ve QR henüz okutmamışsa dahi en az 1 formen olsun
      if (fSayisi === 0 && oturum?.rol === 'formen') {
        fSayisi = 1;
      }

      setFormenSayisi(String(fSayisi));
      setUstaSayisi(String(uSayisi));
    } catch (e) {
      console.warn('QR personelleri getirilirken hata:', e);
    } finally {
      setQrYukleniyor(false);
    }
  }, [oturum]);

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length > 0 && !lokasyon) {
        setLokasyon(data[0].ad);
      }
    });
    raporlariYukle();
  }, []);

  useEffect(() => {
    if (lokasyon && tarih) {
      qrOkutanlariGetir(lokasyon, tarih);
    }
  }, [lokasyon, tarih, qrOkutanlariGetir]);

  // Ekipman işlemleri
  function aracDegistir(i, alan, deger) {
    setAraclar((onceki) => onceki.map((a, idx) => (idx === i ? { ...a, [alan]: deger } : a)));
  }
  function aracEkle() {
    setAraclar((onceki) => [...onceki, { cins: '', adet: '1', durum: 'Çalıştı', calismaSaati: '8', not: '' }]);
  }
  function aracSil(i) {
    setAraclar((onceki) => onceki.filter((_, idx) => idx !== i));
  }

  // Malzeme işlemleri
  function malzemeDegistir(i, alan, deger) {
    setGelenMalzemeler((onceki) => onceki.map((m, idx) => (idx === i ? { ...m, [alan]: deger } : m)));
  }
  function malzemeEkle() {
    setGelenMalzemeler((onceki) => [...onceki, { malzeme: '', miktar: '', tedarikciIrsaliye: '', durum: 'Satın Alındı' }]);
  }
  function malzemeSil(i) {
    setGelenMalzemeler((onceki) => onceki.filter((_, idx) => idx !== i));
  }

  function formuTemizle() {
    setSaat(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    if (lokasyon && tarih) {
      qrOkutanlariGetir(lokasyon, tarih);
    } else {
      setFormenSayisi('1'); 
      setUstaSayisi('0');
    }
    setAraclar([{ cins: '', adet: '1', durum: 'Çalıştı', calismaSaati: '8', not: '' }]);
    setGelenMalzemeler([{ malzeme: '', miktar: '', tedarikciIrsaliye: '', durum: 'Satın Alındı' }]);
    setBugunYapilan(''); 
    setYarinYapilacak(''); 
    setNotlar('');
  }

  async function raporKaydet() {
    setMesaj(null);
    if (!lokasyon.trim()) { setMesaj({ tip: 'err', metin: 'Lütfen şantiye/lokasyon seçin.' }); return; }
    if (!bugunYapilan.trim()) { setMesaj({ tip: 'err', metin: 'Lütfen bugün yapılan iş ve imalatları girin.' }); return; }

    setKaydediliyor(true);
    
    // Temiz veriler
    const temizAraclar = araclar.filter((a) => a.cins.trim());
    const temizMalzemeler = gelenMalzemeler.filter((m) => m.malzeme.trim());

    // Tüm ekstra bilgileri güvenli JSON zarfı içinde paketliyoruz (her DB şemasıyla %100 uyumlu)
    const metaPaketi = {
      notMetni: notlar.trim() || null,
      tarih: tarih || new Date().toISOString().split('T')[0],
      saat: saat || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      hava_durumu: havaDurumu,
      sicaklik: sicaklik.trim(),
      saha_durumu: sahaDurumu,
      gelen_malzemeler: temizMalzemeler,
      patron_onay: 'Yeni',
      patron_notu: '',
      patron_yarin_notu: '',
    };

    const veri = {
      lokasyon: lokasyon.trim(),
      formen_no: oturum.personel_no,
      formen_adi: oturum.ad,
      saha_formen_sayisi: Number(formenSayisi) || 0,
      saha_usta_sayisi: Number(ustaSayisi) || 0,
      saha_isci_sayisi: 0,
      ofis_personel_sayisi: 0,
      arac_ekipman: temizAraclar,
      bugun_yapilan: bugunYapilan.trim(),
      yarin_yapilacak: yarinYapilacak.trim() || null,
      notlar: JSON.stringify(metaPaketi),
      durum: 'Yeni',
    };

    const { error } = await supabase.from('santiye_defterleri').insert(veri);
    
    setKaydediliyor(false);

    if (error) { 
      setMesaj({ tip: 'err', metin: 'Kayıt hatası: ' + error.message }); 
      return; 
    }
    
    setMesaj({ tip: 'ok', metin: 'Günlük faaliyet raporu kaydedildi ve patrona iletildi!' });
    formuTemizle();
    raporlariYukle();
    setTimeout(() => {
      setAktifSekme('gecmis');
      setMesaj(null);
    }, 1500);
  }

  const havaSecenekleri = [
    { label: '☀️ Güneşli', val: 'Güneşli' },
    { label: '⛅ Parçalı Bulutlu', val: 'Parçalı Bulutlu' },
    { label: '☁️ Bulutlu', val: 'Bulutlu' },
    { label: '🌧️ Yağmurlu', val: 'Yağmurlu' },
    { label: '❄️ Karlı', val: 'Karlı' },
    { label: '💨 Rüzgarlı', val: 'Rüzgarlı' },
    { label: '🧊 Don / Aşırı Soğuk', val: 'Don' },
  ];

  const sahaDurumuSecenekleri = [
    { label: 'Normal Çalışma', val: 'Normal Çalışma' },
    { label: 'Kısmi Duruş (Hava/Teknik)', val: 'Kısmi Duruş' },
    { label: 'Tam Duruş / Tatil', val: 'Tam Duruş' },
  ];

  return (
    <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Üst Sekmeler */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setAktifSekme('yeni'); setSeciliGecmisRapor(null); }}
          className={'action ' + (aktifSekme === 'yeni' ? 'btn-ai' : 'btn-secondary')}
          style={{ flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}
        >
          Yeni Günlük Rapor Doldur
        </button>
        <button
          type="button"
          onClick={() => setAktifSekme('gecmis')}
          className={'action ' + (aktifSekme === 'gecmis' ? 'btn-ai' : 'btn-secondary')}
          style={{ flex: 1, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}
        >
          Gönderdiğim Raporlar ({gecmisRaporlar.length})
        </button>
      </div>

      {aktifSekme === 'gecmis' ? (
        <div>
          <h2 className="section">Geçmiş Günlük Faaliyet Raporlarım</h2>
          {seciliGecmisRapor ? (
            <div style={{ background: 'var(--bg-soft)', borderRadius: 10, padding: 14, marginTop: 12 }}>
              <button 
                type="button" 
                className="action btn-secondary" 
                style={{ width: 'auto', marginBottom: 12, fontSize: 12 }} 
                onClick={() => setSeciliGecmisRapor(null)}
              >
                ← Rapor Listesine Dön
              </button>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 16, margin: 0, color: 'var(--ink)' }}>{seciliGecmisRapor.lokasyon}</h3>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    Tarih: <b>{seciliGecmisRapor.tarih || new Date(seciliGecmisRapor.created_at).toLocaleDateString('tr-TR')}</b> | Saat: <b>{seciliGecmisRapor.saat || new Date(seciliGecmisRapor.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</b>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={'status-tag ' + (seciliGecmisRapor.patron_onay === 'Onaylandı' ? 'open' : seciliGecmisRapor.patron_onay === 'Revize İstendi' ? 'closed' : '')}>
                    {seciliGecmisRapor.patron_onay || seciliGecmisRapor.durum}
                  </span>
                </div>
              </div>

              {/* PATRON GENEL GERİ BİLDİRİMİ */}
              {seciliGecmisRapor.patron_notu && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--warning-soft)', borderLeft: '3px solid var(--warning)', borderRadius: 8, fontSize: 13 }}>
                  <b style={{ color: 'var(--warning)', fontSize: 13 }}>Patron Genel Notu:</b>
                  <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ink)' }}>{seciliGecmisRapor.patron_notu}</div>
                </div>
              )}

              {/* PATRON YARINKİ İŞLER GERİ BİLDİRİMİ */}
              {seciliGecmisRapor.patron_yarin_notu && (
                <div style={{ marginTop: 10, padding: 12, background: 'var(--accent-patron-soft)', borderLeft: '3px solid var(--accent-patron)', borderRadius: 8, fontSize: 13 }}>
                  <b style={{ color: 'var(--accent-patron)', fontSize: 13 }}>Patronun Yarınki İşler Talimatı / Yorumu:</b>
                  <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ink)' }}>{seciliGecmisRapor.patron_yarin_notu}</div>
                </div>
              )}

              {/* Özet Bilgiler */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 14 }}>
                <div style={{ background: 'var(--card)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Hava & Saha Durumu</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{seciliGecmisRapor.hava_durumu || 'Güneşli'} · {seciliGecmisRapor.sicaklik || '-'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{seciliGecmisRapor.saha_durumu || 'Normal'}</div>
                </div>
                <div style={{ background: 'var(--card)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>İş Gücü Mevcudu</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                    {(seciliGecmisRapor.saha_formen_sayisi || 0) + (seciliGecmisRapor.saha_usta_sayisi || 0)} Kişi Sahada
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {seciliGecmisRapor.saha_formen_sayisi || 0} Formen, {seciliGecmisRapor.saha_usta_sayisi || 0} Usta
                  </div>
                </div>
              </div>

              {/* Ekipmanlar */}
              {seciliGecmisRapor.arac_ekipman && seciliGecmisRapor.arac_ekipman.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Makine & Ekipmanlar</div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {seciliGecmisRapor.arac_ekipman.map((a, idx) => (
                      <div key={idx} style={{ background: 'var(--card)', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                        <span><b>{a.cins}</b> ({a.adet || 1} Adet) - {a.calismaSaati ? a.calismaSaati + ' Saat' : ''}</span>
                        <span className={'status-tag ' + (a.durum === 'Çalıştı' ? 'open' : '')}>{a.durum}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Malzemeler ve Satın Alımlar */}
              {seciliGecmisRapor.gelen_malzemeler && seciliGecmisRapor.gelen_malzemeler.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Kullanılan Malzemeler & Satın Alımlar</div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {seciliGecmisRapor.gelen_malzemeler.map((m, idx) => (
                      <div key={idx} style={{ background: 'var(--card)', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                        <span><b>{m.malzeme}</b> — {m.miktar} <span style={{ color: 'var(--ink-soft)' }}>({m.tedarikciIrsaliye ? 'Alınan Yer: ' + m.tedarikciIrsaliye : ''})</span></span>
                        <span className="status-tag open">{m.durum || 'Satın Alındı'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Yapılan İşler */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Bugün Yapılan İmalat ve İşler</div>
                <div style={{ background: 'var(--card)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                  {seciliGecmisRapor.bugun_yapilan}
                </div>
              </div>

              {/* Yarınki Plan */}
              {seciliGecmisRapor.yarin_yapilacak && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Yarın Planlanan İşler & Satın Alımlar</div>
                  <div style={{ background: 'var(--card)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                    {seciliGecmisRapor.yarin_yapilacak}
                  </div>
                </div>
              )}

              {/* Genel Notlar */}
              {seciliGecmisRapor.notlar && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Genel Şantiye Notları</div>
                  <div style={{ background: 'var(--card)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                    {seciliGecmisRapor.notlar}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {gecmisRaporlar.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSeciliGecmisRapor(r)}
                  style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', cursor: 'pointer', background: 'var(--card)', transition: 'all 0.15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.lokasyon}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                        Tarih: {r.tarih || new Date(r.created_at).toLocaleDateString('tr-TR')} · Saat: {r.saat || new Date(r.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {r.hava_durumu || 'Güneşli'}
                      </div>
                    </div>
                    <span className={'status-tag ' + (r.patron_onay === 'Onaylandı' ? 'open' : r.patron_onay === 'Revize İstendi' ? 'closed' : '')}>
                      {r.patron_onay || r.durum}
                    </span>
                  </div>
                  {(r.patron_notu || r.patron_yarin_notu) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning)', fontWeight: 600 }}>
                      Patron Yorumu / Talimatı Var
                    </div>
                  )}
                </div>
              ))}
              {gecmisRaporlar.length === 0 && (
                <div style={{ color: 'var(--ink-soft)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Henüz gönderilmiş günlük faaliyet raporunuz bulunmuyor.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="section" style={{ margin: 0 }}>Şantiye Günlük Faaliyet Raporu</h2>
            <div style={{ fontSize: 12, background: 'var(--accent-personel-soft)', color: 'var(--accent-personel)', padding: '4px 8px', borderRadius: 6, fontWeight: 700 }}>
              Formen: {oturum.ad}
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16 }}>
            Şantiyede gün boyu gerçekleşen iş gücü, ekipman, malzeme/satın alım, imalat ve ilerleme bilgilerini doldurup patrona iletin.
          </div>

          {/* BÖLÜM 1: LOKASYON, TARİH, SAAT & HAVA KOŞULLARI */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 8 }}>
              1. Şantiye, Tarih, Saat & Hava Durumu
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, marginBottom: 4 }}>Rapor Tarihi</label>
                <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, marginBottom: 4 }}>Doldurma / Başlama Saati</label>
                <input type="text" placeholder="Örn: 17:30" value={saat} onChange={(e) => setSaat(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, marginBottom: 4 }}>Şantiye / Proje Seçimi</label>
                <select value={lokasyon} onChange={(e) => setLokasyon(e.target.value)}>
                  {lokasyonlar.map((l) => (
                    <option key={l.ad} value={l.ad}>{l.ad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, marginBottom: 4 }}>Sıcaklık (°C)</label>
                <input placeholder="Örn: 22°C veya 18-24°C" value={sicaklik} onChange={(e) => setSicaklik(e.target.value)} />
              </div>
            </div>

            <label style={{ fontSize: 11, marginBottom: 4 }}>Hava Koşulu</label>
            <div className="chip-row" style={{ marginBottom: 10 }}>
              {havaSecenekleri.map((h) => (
                <span 
                  key={h.val} 
                  className={'chip' + (havaDurumu === h.val ? ' sel' : '')} 
                  onClick={() => setHavaDurumu(h.val)}
                >
                  {h.label}
                </span>
              ))}
            </div>

            <label style={{ fontSize: 11, marginBottom: 4 }}>Saha Çalışma Durumu</label>
            <div className="chip-row">
              {sahaDurumuSecenekleri.map((s) => (
                <span 
                  key={s.val} 
                  className={'chip' + (sahaDurumu === s.val ? ' sel' : '')} 
                  onClick={() => setSahaDurumu(s.val)}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* BÖLÜM 2: İŞ GÜCÜ (QR OKUTANLARDAN OTOMATİK TESPİT + FORMEN VE USTA) */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)' }}>
                2. İş Gücü & Personel Mevcudu
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => qrOkutanlariGetir(lokasyon, tarih)}
                  className="action btn-secondary"
                  style={{ margin: 0, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
                  title="QR Girişlerini Yeniden Tara"
                >
                  {qrYukleniyor ? 'Taranıyor...' : '🔄 QR Girişlerini Tara'}
                </button>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)', background: 'var(--success-soft)', padding: '2px 8px', borderRadius: 6 }}>
                  Toplam Sahada: {genelToplamPersonel} Kişi
                </div>
              </div>
            </div>

            {/* QR Okutan Personellerin Otomatik Bilgilendirme Kutusu */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                  {qrYukleniyor ? '🔍 QR girişleri kontrol ediliyor...' : qrPersoneller.length > 0 ? `✅ ${tarih} Tarihinde Bu Şantiyeye QR Okutanlar (${qrPersoneller.length} Kişi):` : `ℹ️ ${tarih} Tarihinde bu şantiyede QR okutan kayıt bulunamadı.`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                  (Sayılar otomatik aktarılmıştır, dilerseniz değiştirebilirsiniz)
                </span>
              </div>

              {qrPersoneller.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {qrPersoneller.map((p, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        background: 'var(--bg-soft)', 
                        border: '1px solid var(--border)', 
                        borderRadius: 6, 
                        padding: '3px 8px', 
                        fontSize: 11.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <b style={{ color: 'var(--ink)' }}>{p.ad}</b>
                      <span style={{ color: p.rol === 'formen' ? 'var(--accent-patron)' : 'var(--ink-soft)', fontWeight: 600, fontSize: 10.5 }}>
                        ({p.rol === 'formen' ? 'Formen' : 'Usta/İşçi'})
                      </span>
                      <span style={{ color: 'var(--ink-soft)', fontSize: 10 }}>
                        · {new Date(p.giris_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>
                  Sahada QR okutmayan personel varsa aşağıdaki kutulardan Formen ve Usta sayısını manuel olarak girebilirsiniz.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Formen Sayısı</div>
                <input type="number" min="0" value={formenSayisi} onChange={(e) => setFormenSayisi(e.target.value)} placeholder="1" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>Usta / İşçi Sayısı</div>
                <input type="number" min="0" value={ustaSayisi} onChange={(e) => setUstaSayisi(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* BÖLÜM 3: MAKİNE & EKİPMAN DURUMU */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 8 }}>
              3. Makine & Ekipman Kullanımı
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {araclar.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input 
                    placeholder="Makine Cinsi (Örn: Kule Vinç, Beko Kepçe)" 
                    value={a.cins} 
                    onChange={(e) => aracDegistir(i, 'cins', e.target.value)} 
                    style={{ flex: 2, minWidth: 150 }} 
                  />
                  <input 
                    placeholder="Adet" 
                    type="number" 
                    value={a.adet} 
                    onChange={(e) => aracDegistir(i, 'adet', e.target.value)} 
                    style={{ width: 60 }} 
                  />
                  <select 
                    value={a.durum} 
                    onChange={(e) => aracDegistir(i, 'durum', e.target.value)}
                    style={{ flex: 1, minWidth: 100 }}
                  >
                    <option value="Çalıştı">Çalıştı</option>
                    <option value="Arızalı">Arızalı / Bakımda</option>
                    <option value="Boşta">Boşta Bekledi</option>
                  </select>
                  <input 
                    placeholder="Saat" 
                    value={a.calismaSaati} 
                    onChange={(e) => aracDegistir(i, 'calismaSaati', e.target.value)} 
                    style={{ width: 60 }} 
                  />
                  {araclar.length > 1 && (
                    <button
                      type="button"
                      onClick={() => aracSil(i)}
                      style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '0 10px', fontWeight: 700, cursor: 'pointer', height: 38 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="action btn-secondary" style={{ marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={aracEkle}>
              + Makine / Ekipman Ekle
            </button>
          </div>

          {/* BÖLÜM 4: GÜNLÜK KULLANILAN MALZEMELER VE SATIN ALIMLAR */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 8 }}>
              4. Günlük Kullanılan Malzemeler ve Satın Alımlar
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {gelenMalzemeler.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input 
                    placeholder="Malzeme Cinsi (Örn: Çimento, Alçı, Profil)" 
                    value={m.malzeme} 
                    onChange={(e) => malzemeDegistir(i, 'malzeme', e.target.value)} 
                    style={{ flex: 2, minWidth: 150 }} 
                  />
                  <input 
                    placeholder="Miktar (Örn: 5 Torba / 10 Adet)" 
                    value={m.miktar} 
                    onChange={(e) => malzemeDegistir(i, 'miktar', e.target.value)} 
                    style={{ flex: 1, minWidth: 100 }} 
                  />
                  <input 
                    placeholder="Nereden Alındığı (Örn: Castorama, OBI, Leroy Merlin)" 
                    value={m.tedarikciIrsaliye} 
                    onChange={(e) => malzemeDegistir(i, 'tedarikciIrsaliye', e.target.value)} 
                    style={{ flex: 2, minWidth: 160 }} 
                  />
                  <select 
                    value={m.durum} 
                    onChange={(e) => malzemeDegistir(i, 'durum', e.target.value)}
                    style={{ width: 120 }}
                  >
                    <option value="Satın Alındı">Satın Alındı</option>
                    <option value="Kullanıldı">Kullanıldı</option>
                    <option value="Depodan Geldi">Depodan Geldi</option>
                  </select>
                  {gelenMalzemeler.length > 1 && (
                    <button
                      type="button"
                      onClick={() => malzemeSil(i)}
                      style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '0 10px', fontWeight: 700, cursor: 'pointer', height: 38 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="action btn-secondary" style={{ marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={malzemeEkle}>
              + Malzeme / Satın Alım Ekle
            </button>
          </div>

          {/* BÖLÜM 5: YAPILAN İMALATLAR & YARINKİ PLAN */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 8 }}>
              5. Bugün Yapılan İmalatlar & Saha İlerlemesi
            </div>
            <textarea 
              rows={4} 
              value={bugunYapilan} 
              onChange={(e) => setBugunYapilan(e.target.value)} 
              placeholder={'Madde madde yapılan işleri yazın:\n- Zemin şap dökümü tamamlandı\n- Duvar alçıpan kaplaması yapıldı\n- Elektrik kablo çekimi devam ediyor'} 
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14, marginBottom: 10 }} 
            />

            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 6 }}>
              6. Yarın Planlanan İşler & Satın Alımlar
            </div>
            <textarea 
              rows={2} 
              value={yarinYapilacak} 
              onChange={(e) => setYarinYapilacak(e.target.value)} 
              placeholder="Örn: Leroy Merlin'den boya ve astar alınacak, 2. kat tavan montajına başlanacak..." 
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} 
            />
          </div>

          {/* BÖLÜM 7: GENEL ŞANTİYE NOTLARI */}
          <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, marginBottom: 14, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-patron)', marginBottom: 8 }}>
              7. Genel Şantiye Notları & Açıklamalar
            </div>
            <textarea 
              rows={3} 
              value={notlar} 
              onChange={(e) => setNotlar(e.target.value)} 
              placeholder="Şantiyeyle ilgili eklemek istediğiniz tüm genel notlar, hatırlatmalar veya karşılaşılan durumlar..." 
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13 }} 
            />
          </div>

          <button 
            className="action btn-ai" 
            style={{ width: '100%', padding: '14px', fontSize: 14, fontWeight: 700 }} 
            onClick={raporKaydet} 
            disabled={kaydediliyor}
          >
            {kaydediliyor ? 'Kaydediliyor...' : 'Günlük Faaliyet Raporunu Kaydet ve Patrona Gönder'}
          </button>

          {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginTop: 12 }}>{mesaj.metin}</div>}
        </div>
      )}
    </div>
  );
}



/* ---------------- PERSONEL FİNANS & HAKEDİŞ TAB (Bireysel Görüntüleme) ---------------- */
function PersonelFinansTab({ oturum }) {
  async function bordroPdfIndir() {
    if (!bilgi) return;
    const { data: ozlukKayit } = await supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK').eq('personel_no', oturum.personel_no).order('tarih', { ascending: false }).limit(1);
    let o = {};
    if (ozlukKayit && ozlukKayit.length) {
      try { o = JSON.parse(ozlukKayit[0].aciklama || '{}'); } catch (e) { o = {}; }
    }
    detayliBordroPdfOlustur({
      personelNo: oturum.personel_no,
      ad: oturum.ad,
      rol: oturum.rol,
      gunlukUcret: bilgi.saatlikUcret,
      calisilanSaat: bilgi.calisilanSaat,
      calisilanGun: bilgi.calisilanGun,
      fmSaat: bilgi.fmSaat,
      hakedisTutari: bilgi.hakedisTutari,
      toplamMasraf: bilgi.toplamMasraf,
      toplamPrim: bilgi.toplamPrim,
      toplamAvans: bilgi.toplamAvans,
      toplamKesinti: bilgi.toplamKesinti,
      odenmisMaas: bilgi.odenmisMaas,
      netOdenecek: bilgi.netKalan,
      yil,
      ay,
      ayAdi: ayAdlari[ay - 1],
      tcNo: o.tc_no,
      iban: o.iban,
      bankaAdi: o.banka_adi,
      iseGirisTarihi: o.ise_giris_tarihi,
      departman: o.departman,
      sgkNo: o.sgk_no,
      cinsiyet: o.cinsiyet,
      telefon: o.telefon,
      adres: o.adres,
    });
  }

  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [bilgi, setBilgi] = useState(null);

  const ayAdlari = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    const gunSayisi = new Date(yil, ay, 0).getDate();
    const ayBasi = new Date(yil, ay - 1, 1);
    const aySonu = new Date(yil, ay, 0, 23, 59, 59);
    const ayBasiStr = `${yil}-${String(ay).padStart(2, '0')}-01`;
    const aySonuStr = `${yil}-${String(ay).padStart(2, '0')}-${String(gunSayisi).padStart(2, '0')}`;
    const bugunStr = new Date().toISOString().slice(0, 10);

    const [{ data: pData }, { data: mesailer }, { data: manuelKayitlar }, { data: sahaManuelKayitlar }, { data: fmKayit }, { data: masraflar }, { data: izinler }] = await Promise.all([
      supabase.from('personel').select('*').eq('personel_no', oturum.personel_no).maybeSingle(),
      supabase.from('giris_cikis').select('giris_saati, sure_saat, durum').eq('personel_no', oturum.personel_no).gte('giris_saati', ayBasi.toISOString()).lte('giris_saati', aySonu.toISOString()),
      supabase.from('puantaj_manuel').select('*').eq('personel_no', oturum.personel_no).gte('tarih', ayBasiStr).lte('tarih', aySonuStr),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PUANTAJ_MANUEL').eq('personel_no', oturum.personel_no).gte('tarih', ayBasi.toISOString()).lte('tarih', aySonu.toISOString()),
      supabase.from('aylik_fazla_mesai').select('*').eq('personel_no', oturum.personel_no).eq('yil', yil).eq('ay', ay).maybeSingle(),
      supabase.from('saha_verileri').select('*').eq('personel_no', oturum.personel_no).gte('tarih', ayBasi.toISOString()).lte('tarih', aySonu.toISOString()).order('tarih', { ascending: false }),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'IZIN_TALEBI').eq('personel_no', oturum.personel_no),
    ]);

    const saatlikUcret = Number(pData?.gunluk_ucret) || Number(oturum.gunluk_ucret) || 0;

    const otomatikGunlukSaat = {};
    (mesailer || []).forEach((m) => {
      if (m.giris_saati) {
        const gunKey = new Date(m.giris_saati).toISOString().slice(0, 10);
        let sure = Number(m.sure_saat) || 0;
        if (m.durum === 'Açık') {
          sure = gunKey < bugunStr ? 8 : Math.min(8, Math.round(Math.max(0, (new Date() - new Date(m.giris_saati)) / 3600000) * 100) / 100);
        }
        otomatikGunlukSaat[gunKey] = (otomatikGunlukSaat[gunKey] || 0) + sure;
      }
    });

    const manuelMap = {};

    // 1. Onaylanan İzinleri Otomatik Puantaja Yansıt
    (izinler || []).forEach((row) => {
      let detay = {};
      try { detay = JSON.parse(row.aciklama || '{}'); } catch (e) {}
      const durum = row.fis_no || detay.durum;
      if (durum === 'Onaylandı' && detay.baslangic && detay.bitis) {
        const bDate = new Date(detay.baslangic + 'T00:00:00');
        const sDate = new Date(detay.bitis + 'T00:00:00');
        const kod = (detay.izin_turu || '').includes('Rapor') || (detay.izin_turu || '').includes('Sağlık') ? 'R' : 'I';

        for (let d = new Date(bDate); d <= sDate; d.setDate(d.getDate() + 1)) {
          const dStr = d.toISOString().slice(0, 10);
          if (dStr >= ayBasiStr && dStr <= aySonuStr) {
            manuelMap[dStr] = kod;
          }
        }
      }
    });

    // 2. Manuel Puantaj Girişleri
    (manuelKayitlar || []).forEach((m) => { manuelMap[m.tarih] = m.deger; });
    (sahaManuelKayitlar || []).forEach((sRow) => {
      const gunStr = new Date(sRow.tarih).toISOString().slice(0, 10);
      let deger = sRow.fis_no || String(sRow.miktar);
      if (sRow.aciklama) {
        try {
          const parsed = JSON.parse(sRow.aciklama);
          if (parsed.deger) deger = parsed.deger;
        } catch (e) {}
      }
      manuelMap[gunStr] = deger;
    });

    let calisilanSaat = 0;
    let calisilanGun = 0;

    for (let g = 1; g <= gunSayisi; g++) {
      const tarihStr = `${yil}-${String(ay).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      const manuelDeger = manuelMap[tarihStr];
      let gunlukSaat = 0;

      if (manuelDeger !== undefined && manuelDeger !== null && manuelDeger !== '') {
        if (manuelDeger === '1') gunlukSaat = 11;
        else if (manuelDeger === '0.5') gunlukSaat = 5.5;
        else if (!isNaN(Number(manuelDeger)) && Number(manuelDeger) > 0) gunlukSaat = Number(manuelDeger);
        else gunlukSaat = 0;
      } else {
        gunlukSaat = otomatikGunlukSaat[tarihStr] || 0;
      }

      if (gunlukSaat > 0) {
        calisilanSaat += gunlukSaat;
        calisilanGun += 1;
      }
    }

    calisilanSaat = Math.round(calisilanSaat * 100) / 100;
    const fmSaat = Number(fmKayit?.saat) || 0;
    const hakedisTutari = (calisilanSaat + fmSaat) * saatlikUcret; // Normal ücret (1.0x)

    const toplamMasraf = (masraflar || []).filter((m) => getIslemKategori(m) === 'harcama').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const toplamAvans = (masraflar || []).filter((m) => getIslemKategori(m) === 'avans').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const toplamPrim = (masraflar || []).filter((m) => getIslemKategori(m) === 'prim').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const toplamKesinti = (masraflar || []).filter((m) => getIslemKategori(m) === 'kesinti').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const odenmisMaas = (masraflar || []).filter((m) => getIslemKategori(m) === 'maas_odeme').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);

    const netKalan = hakedisTutari + toplamMasraf + toplamPrim - toplamAvans - toplamKesinti - odenmisMaas;

    setBilgi({
      saatlikUcret,
      calisilanSaat,
      calisilanGun,
      fmSaat,
      hakedisTutari,
      toplamMasraf,
      toplamAvans,
      toplamPrim,
      toplamKesinti,
      odenmisMaas,
      netKalan,
      masraflar: (masraflar || []).filter((m) => getIslemKategori(m) !== 'bilgi_kaydi'),
    });

    setYukleniyor(false);
  }, [oturum, yil, ay]);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="section" style={{ margin: 0 }}>{t('aylikHakedisDurumum')}</h2>
        <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '7px 14px', fontSize: 12 }} onClick={bordroPdfIndir} disabled={!bilgi}>{t('resmiBordroPdf')}</button>
      </div>
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <div>
          <label>Yıl</label>
          <input type="number" value={yil} onChange={(e) => setYil(Number(e.target.value))} />
        </div>
        <div>
          <label>Ay</label>
          <select value={ay} onChange={(e) => setAy(Number(e.target.value))}>
            {ayAdlari.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
          </select>
        </div>
      </div>

      {yukleniyor || !bilgi ? (
        <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Yükleniyor...</div>
      ) : (
        <>
          <div className="grid cols-4" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="stat-card">
              <div className="label">{t('buAykiSaatlikHakedis')}</div>
              <div className="value">{formatPLN(bilgi.hakedisTutari)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                <b style={{ color: 'var(--accent-personel)' }}>{sureFormatla(bilgi.calisilanSaat)}</b> ({formatPLN(bilgi.saatlikUcret)}/sa · {bilgi.calisilanGun} gün)
              </div>
            </div>
            <div className="stat-card">
              <div className="label">{t('santiyeMasraflarim')}</div>
              <div className="value" style={{ color: '#16a34a' }}>+{formatPLN(bilgi.toplamMasraf)}</div>
            </div>
            <div className="stat-card">
              <div className="label">{t('aldigimAvanslar')}</div>
              <div className="value" style={{ color: '#dc2626' }}>-{formatPLN(bilgi.toplamAvans)}</div>
            </div>
            <div className="stat-card" style={{ background: 'var(--accent-personel-soft)', borderColor: 'var(--accent-personel)' }}>
              <div className="label" style={{ color: 'var(--accent-personel)' }}>{t('netKalanMaasAlacagim')}</div>
              <div className="value" style={{ color: 'var(--accent-personel)' }}>{formatPLN(bilgi.netKalan)}</div>
            </div>
          </div>

          <h3 style={{ fontSize: 14, margin: '20px 0 8px 0' }}>{t('donemFinansalHareketleri')}</h3>
          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch', marginTop: 10 }}>
            <table style={{ width: '100%', minWidth: 550 }}>
              <thead>
                <tr><th>Tarih</th><th>İşlem Türü</th><th>Şantiye / Kasa</th><th>Tutar</th><th>Açıklama</th></tr>
              </thead>
              <tbody>
                {bilgi.masraflar.map((m) => {
                  const kat = getIslemKategori(m);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{new Date(m.tarih || m.created_at).toLocaleDateString('tr-TR')}</td>
                      <td>
                        <span className={`status-tag ${kat === 'prim' ? 'open' : ''}`}>
                          {kat === 'avans' ? 'Avans' : (kat === 'prim' ? 'Prim' : (kat === 'kesinti' ? 'Kesinti' : (kat === 'maas_odeme' ? 'Maaş' : 'Masraf')))}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{m.lokasyon}</td>
                      <td><b>{formatPLN(m.toplam)}</b></td>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 280 }}>{formatIslemAciklama(m)}</td>
                    </tr>
                  );
                })}
                {bilgi.masraflar.length === 0 && (
                  <tr><td colSpan={5} style={{ color: 'var(--ink-soft)', padding: 14 }}>Bu ay kayıtlı avans veya harcama hareketiniz bulunmuyor.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- PERSONEL İZİN & AVANS TALEP TAB ---------------- */
function PersonelIzinTab({ oturum }) {
  const { t } = useLocale();
  const [altSekme, setAltSekme] = useState('izin'); // 'izin' | 'avans'
  const [izinTalepler, setIzinTalepler] = useState([]);
  const [avansTalepler, setAvansTalepler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  // İzin Hakları - Varsayılan olarak 0 gündür (Patron tanımlamadıkça sıfırdır)
  const [toplamHak, setToplamHak] = useState(0);
  const [kullanilanHak, setKullanilanHak] = useState(0);

  // İzin Formu
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [izinTuru, setIzinTuru] = useState('Yıllık İzin');
  const [izinNeden, setIzinNeden] = useState('');

  // Avans Formu
  const [avansTutar, setAvansTutar] = useState('');
  const [avansNeden, setAvansNeden] = useState('');

  // Resmi tatil (Cumartesi ve Pazar) kontrolü
  const isHaftaSonu = (d) => {
    const day = d.getDay();
    return day === 0 || day === 6; // 0 = Pazar, 6 = Cumartesi
  };

  // Gün Sayısı Hesapla (Cumartesi ve Pazar resmi tatil günleri SAYILMAZ)
  const gunSayisiHesapla = () => {
    if (!baslangic || !bitis) return { isGunu: 0, haftaSonuSayisi: 0, toplamTakvim: 0 };
    const b = new Date(baslangic + 'T00:00:00');
    const s = new Date(bitis + 'T00:00:00');
    if (s < b) return { isGunu: 0, haftaSonuSayisi: 0, toplamTakvim: 0 };

    let isGunu = 0;
    let haftaSonuSayisi = 0;
    let cur = new Date(b);
    while (cur <= s) {
      if (isHaftaSonu(cur)) {
        haftaSonuSayisi++;
      } else {
        isGunu++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return { isGunu, haftaSonuSayisi, toplamTakvim: isGunu + haftaSonuSayisi };
  };

  const { isGunu: gunSayisi, haftaSonuSayisi } = gunSayisiHesapla();

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    // 1. Özlük kaydından yıllık izin hakkını al
    const [{ data: ozlukKayit }, { data: izinler }, { data: avanslar }] = await Promise.all([
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK').eq('personel_no', oturum.personel_no).order('tarih', { ascending: false }).limit(1),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'IZIN_TALEBI').eq('personel_no', oturum.personel_no).order('tarih', { ascending: false }),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'AVANS_TALEBI').eq('personel_no', oturum.personel_no).order('tarih', { ascending: false }),
    ]);

    let hak = 0;
    if (ozlukKayit && ozlukKayit.length) {
      try {
        const parsed = JSON.parse(ozlukKayit[0].aciklama || '{}');
        if (parsed.yillik_izin_hakki != null) hak = Number(parsed.yillik_izin_hakki) || 0;
      } catch (e) {}
    }
    setToplamHak(hak);

    // İzin listesi
    const izinList = (izinler || []).map((row) => {
      let detay = {};
      try { detay = JSON.parse(row.aciklama || '{}'); } catch (e) {}
      return {
        id: row.id,
        tarih: row.tarih || row.created_at,
        durum: row.fis_no || detay.durum || 'Bekliyor',
        gun_sayisi: Number(row.miktar) || detay.gun_sayisi || 0,
        baslangic: detay.baslangic,
        bitis: detay.bitis,
        izin_turu: detay.izin_turu || 'Yıllık İzin',
        neden: detay.neden || '',
        patron_notu: detay.patron_notu,
        onay_tarihi: detay.onay_tarihi,
      };
    });

    // Kullanılan yıllık izin toplamı (Onaylanan Yıllık İzinler)
    const kullanilan = izinList
      .filter((l) => l.durum === 'Onaylandı' && l.izin_turu === 'Yıllık İzin')
      .reduce((a, l) => a + l.gun_sayisi, 0);

    setKullanilanHak(kullanilan);
    setIzinTalepler(izinList);

    // Avans listesi
    const avansList = (avanslar || []).map((row) => {
      let detay = {};
      try { detay = JSON.parse(row.aciklama || '{}'); } catch (e) {}
      return {
        id: row.id,
        tarih: row.tarih || row.created_at,
        durum: row.fis_no || detay.durum || 'Bekliyor',
        tutar: Number(row.toplam) || Number(row.miktar) || detay.tutar || 0,
        neden: detay.neden || row.aciklama || '',
        patron_notu: detay.patron_notu,
        onay_tarihi: detay.onay_tarihi,
      };
    });
    setAvansTalepler(avansList);

    setYukleniyor(false);
  }, [oturum.personel_no]);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  // İZİN TALEP GÖNDER
  const izinTalepGonder = async (e) => {
    e.preventDefault();
    setMesaj(null);

    if (!baslangic || !bitis) {
      setMesaj({ tip: 'err', metin: 'Lütfen başlangıç ve bitiş tarihlerini seçin.' });
      return;
    }
    if (gunSayisi <= 0) {
      setMesaj({ tip: 'err', metin: 'Seçilen tarih aralığında izin sayılabilecek iş günü bulunmuyor (yalnızca hafta sonu).' });
      return;
    }
    if (izinTuru === 'Yıllık İzin' && gunSayisi > (toplamHak - kullanilanHak)) {
      setMesaj({ tip: 'err', metin: `Yetersiz izin hakkı! Kalan yıllık izniniz: ${toplamHak - kullanilanHak} iş günü, talep edilen: ${gunSayisi} iş günü.` });
      return;
    }

    setGonderiliyor(true);
    try {
      const detay = {
        baslangic,
        bitis,
        gun_sayisi: gunSayisi,
        hafta_sonu_haric: haftaSonuSayisi,
        izin_turu: izinTuru,
        neden: izinNeden.trim(),
        durum: 'Bekliyor',
        talep_tarihi: new Date().toISOString(),
      };

      const { error } = await supabase.from('saha_verileri').insert({
        personel_no: oturum.personel_no,
        ad: oturum.ad,
        lokasyon: oturum.lokasyon || 'Merkez',
        kalem_turu: 'IZIN_TALEBI',
        miktar: gunSayisi,
        birim_fiyat: 0,
        toplam: 0,
        islem_turu: 'harcama',
        fis_no: 'Bekliyor',
        aciklama: JSON.stringify(detay),
      });

      if (error) throw error;

      setMesaj({ tip: 'ok', metin: `✅ İzin talebiniz (${gunSayisi} iş günü) başarıyla oluşturuldu ve patron onayına gönderildi.` });
      setBaslangic(''); setBitis(''); setIzinNeden('');
      veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'İzin talebi gönderilemedi: ' + err.message });
    } finally {
      setGonderiliyor(false);
    }
  };

  // AVANS TALEP GÖNDER
  const avansTalepGonder = async (e) => {
    e.preventDefault();
    setMesaj(null);

    const sayiTutar = Number(avansTutar);
    if (!sayiTutar || sayiTutar <= 0) {
      setMesaj({ tip: 'err', metin: 'Lütfen geçerli bir avans tutarı giriniz.' });
      return;
    }

    setGonderiliyor(true);
    try {
      const detay = {
        tutar: sayiTutar,
        neden: avansNeden.trim(),
        durum: 'Bekliyor',
        talep_tarihi: new Date().toISOString(),
      };

      const { error } = await supabase.from('saha_verileri').insert({
        personel_no: oturum.personel_no,
        ad: oturum.ad,
        lokasyon: oturum.lokasyon || 'Merkez Kasa',
        kalem_turu: 'AVANS_TALEBI',
        miktar: 1,
        birim_fiyat: sayiTutar,
        toplam: sayiTutar,
        para_birimi: 'PLN',
        islem_turu: 'harcama',
        fis_no: 'Bekliyor',
        aciklama: JSON.stringify(detay),
      });

      if (error) throw error;

      setMesaj({ tip: 'ok', metin: `✅ ${formatPLN(sayiTutar)} tutarındaki avans talebiniz başarıyla patron onayına gönderildi.` });
      setAvansTutar(''); setAvansNeden('');
      veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Avans talebi gönderilemedi: ' + err.message });
    } finally {
      setGonderiliyor(false);
    }
  };

  const kalanHak = Math.max(0, toplamHak - kullanilanHak);

  return (
    <div>
      {/* ÜST GEÇİŞ SEÇİMİ (İZİN / AVANS) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setAltSekme('izin'); setMesaj(null); }}
          className={`action ${altSekme === 'izin' ? 'btn-punch' : 'btn-secondary'}`}
          style={{ width: 'auto', margin: 0, padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
        >
          🏖️ İzin Taleplerim
        </button>
        <button
          type="button"
          onClick={() => { setAltSekme('avans'); setMesaj(null); }}
          className={`action ${altSekme === 'avans' ? 'btn-punch' : 'btn-secondary'}`}
          style={{ width: 'auto', margin: 0, padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
        >
          💵 Avans Taleplerim
        </button>
      </div>

      {/* ---------------- 1. İZİN BÖLÜMÜ ---------------- */}
      {altSekme === 'izin' && (
        <>
          {/* İZİN HAKKI KARTLARI */}
          <div className="grid cols-3" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="label">Toplam Yıllık İzin Hakkı</div>
              <div className="value">{toplamHak} Gün</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Yıllık tanımlı süre</div>
            </div>
            <div className="stat-card">
              <div className="label">Kullanılan İzin</div>
              <div className="value" style={{ color: '#2563eb' }}>{kullanilanHak} Gün</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Onaylanan izinler</div>
            </div>
            <div className="stat-card" style={{ background: 'var(--accent-personel-soft)', borderColor: 'var(--accent-personel)' }}>
              <div className="label" style={{ color: 'var(--accent-personel)' }}>Kalan Yıllık İzin Hakkı</div>
              <div className="value" style={{ color: 'var(--accent-personel)' }}>{kalanHak} Gün</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Kullanılabilir bakiye</div>
            </div>
          </div>

          {/* YENİ İZİN TALEBİ FORMU */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 className="section">🏖️ Yeni İzin Talebi Oluştur</h2>
            <form onSubmit={izinTalepGonder}>
              <div className="grid cols-3" style={{ marginTop: 10 }}>
                <div>
                  <label>Başlangıç Tarihi *</label>
                  <input type="date" required value={baslangic} onChange={(e) => setBaslangic(e.target.value)} />
                </div>
                <div>
                  <label>Bitiş Tarihi (Dahil) *</label>
                  <input type="date" required value={bitis} onChange={(e) => setBitis(e.target.value)} />
                </div>
                <div>
                  <label>İzin Türü</label>
                  <select value={izinTuru} onChange={(e) => setIzinTuru(e.target.value)}>
                    <option value="Yıllık İzin">🏖️ Yıllık İzin (28 Gün Hakkından Düşer)</option>
                    <option value="Mazeret İzni">📌 Mazeret İzni</option>
                    <option value="Rapor / Sağlık İzni">🏥 Rapor / Sağlık İzni</option>
                    <option value="Ücretsiz İzin">⏳ Ücretsiz İzin</option>
                  </select>
                </div>
              </div>

              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <div>
                  <label>İzin Süresi (Resmi Tatil / Hafta Sonu Hariç)</label>
                  <div style={{ padding: '9px 12px', background: 'var(--bg-soft)', borderRadius: 8, fontWeight: 700, fontSize: 14, color: gunSayisi > 0 ? 'var(--accent-personel)' : 'var(--ink-soft)' }}>
                    {gunSayisi > 0 ? (
                      <span>
                        🎯 <b>{gunSayisi} İş Günü</b>
                        {haftaSonuSayisi > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--ink-soft)', marginLeft: 8 }}>
                            ({haftaSonuSayisi} gün Cmt/Paz tatili sayılmadı)
                          </span>
                        )}
                      </span>
                    ) : 'Tarih seçiniz'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                    ℹ️ Cumartesi ve Pazar günleri resmi tatil olduğu için yıllık izin sürenizden düşülmez.
                  </div>
                </div>
                <div>
                  <label>İzin Gerekçesi / Not (Opsiyonel)</label>
                  <input placeholder="örn. Aile ziyareti, seyahat, dinlenme vb." value={izinNeden} onChange={(e) => setIzinNeden(e.target.value)} />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button type="submit" className="action btn-punch" style={{ width: 'auto', padding: '10px 24px' }} disabled={gonderiliyor || gunSayisi <= 0}>
                  {gonderiliyor ? 'Gönderiliyor...' : '🏖️ İzin Talebini Patrona Gönder'}
                </button>
              </div>
              {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginTop: 10 }}>{mesaj.metin}</div>}
            </form>
          </div>

          {/* GEÇMİŞ İZİN TALEPLERİ */}
          <div className="card">
            <h2 className="section">📋 İzin Taleplerim ve Durumları</h2>
            {yukleniyor ? (
              <div style={{ color: 'var(--ink-soft)', padding: 14 }}>Yükleniyor...</div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Talep Tarihi</th>
                      <th>İzin Türü</th>
                      <th>Tarih Aralığı</th>
                      <th>Gün</th>
                      <th>Açıklama / Neden</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {izinTalepler.map((t) => (
                      <tr key={t.id}>
                        <td>{new Date(t.tarih).toLocaleDateString('tr-TR')}</td>
                        <td><b>{t.izin_turu}</b></td>
                        <td>{t.baslangic} ➔ {t.bitis}</td>
                        <td><b>{t.gun_sayisi} iş günü</b></td>
                        <td style={{ fontSize: 12 }}>{t.neden || '—'}</td>
                        <td>
                          <span className={`status-tag ${t.durum === 'Onaylandı' ? 'open' : (t.durum === 'Reddedildi' ? 'closed' : '')}`}>
                            {t.durum === 'Onaylandı' ? '✓ Onaylandı' : (t.durum === 'Reddedildi' ? '✕ Reddedildi' : '⏳ Bekliyor')}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {izinTalepler.length === 0 && (
                      <tr><td colSpan={6} style={{ color: 'var(--ink-soft)', padding: 14 }}>Henüz verilmiş bir izin talebiniz bulunmuyor.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------- 2. AVANS BÖLÜMÜ ---------------- */}
      {altSekme === 'avans' && (
        <>
          {/* AVANS TALEP FORMU */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 className="section">💵 Yeni Avans Talebi Oluştur</h2>
            <form onSubmit={avansTalepGonder}>
              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <div>
                  <label>Talep Edilen Avans Tutarı (PLN) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="örn. 500"
                    required
                    value={avansTutar}
                    onChange={(e) => setAvansTutar(e.target.value)}
                  />
                </div>
                <div>
                  <label>Avans Gerekçesi / Açıklama (Opsiyonel)</label>
                  <input
                    placeholder="örn. Kira ödemesi, seyahat, acil nakit ihtiyacı"
                    value={avansNeden}
                    onChange={(e) => setAvansNeden(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button type="submit" className="action btn-punch" style={{ width: 'auto', padding: '10px 24px' }} disabled={gonderiliyor || !avansTutar}>
                  {gonderiliyor ? 'Gönderiliyor...' : '💵 Avans Talebini Patrona Gönder'}
                </button>
              </div>
              {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginTop: 10 }}>{mesaj.metin}</div>}
            </form>
          </div>

          {/* GEÇMİŞ AVANS TALEPLERİ */}
          <div className="card">
            <h2 className="section">📋 Avans Taleplerim ve Durumları</h2>
            {yukleniyor ? (
              <div style={{ color: 'var(--ink-soft)', padding: 14 }}>Yükleniyor...</div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Talep Tarihi</th>
                      <th>İstenen Tutar</th>
                      <th>Gerekçe / Açıklama</th>
                      <th>Durum</th>
                      <th>Patron Notu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avansTalepler.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.tarih).toLocaleDateString('tr-TR')}</td>
                        <td><b>{formatPLN(a.tutar)}</b></td>
                        <td style={{ fontSize: 12 }}>{a.neden || '—'}</td>
                        <td>
                          <span className={`status-tag ${a.durum === 'Onaylandı' ? 'open' : (a.durum === 'Reddedildi' ? 'closed' : '')}`}>
                            {a.durum === 'Onaylandı' ? '✓ Onaylandı' : (a.durum === 'Reddedildi' ? '✕ Reddedildi' : '⏳ Bekliyor')}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{a.patron_notu || '—'}</td>
                      </tr>
                    ))}
                    {avansTalepler.length === 0 && (
                      <tr><td colSpan={5} style={{ color: 'var(--ink-soft)', padding: 14 }}>Henüz verilmiş bir avans talebiniz bulunmuyor.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getIslemKategori(row) {
  if (!row) return 'harcama';
  const islem = row.islem_turu;
  const kalem = (row.kalem_turu || '').toLowerCase();
  const fis = (row.fis_no || '');
  if (kalem === 'personel_ozluk' || kalem === 'puantaj_manuel' || kalem === 'izin_talebi') return 'bilgi_kaydi';
  if (kalem === 'avans_talebi') {
    if (fis === 'Onaylandı' || islem === 'avans') return 'avans';
    return 'bilgi_kaydi';
  }
  if (kalem.includes('prim') || kalem.includes('ikramiye')) return 'prim';
  if (kalem.includes('kesinti') || kalem.includes('ceza')) return 'kesinti';
  if (kalem.includes('maaş ödemesi') || kalem.includes('maas odemesi') || kalem.includes('maaş kapat') || kalem.includes('maas kapat') || islem === 'maas_odeme') return 'maas_odeme';
  if (islem === 'avans' || kalem.includes('avans')) return 'avans';
  return 'harcama';
}

function formatIslemAciklama(row) {
  if (!row) return '—';
  const kalem = (row.kalem_turu || '').toUpperCase();
  const aciklama = row.aciklama || '';

  if (typeof aciklama === 'string' && (aciklama.trim().startsWith('{') || aciklama.trim().startsWith('['))) {
    try {
      const parsed = JSON.parse(aciklama);
      if (kalem === 'AVANS_TALEBI') {
        const sebep = parsed.neden || parsed.aciklama || '';
        return sebep ? `Avans Talebi: ${sebep}` : 'Avans Talebi';
      }
      if (kalem === 'IZIN_TALEBI') {
        const sebep = parsed.neden || '';
        const tur = parsed.izin_turu || 'İzin';
        return sebep ? `${tur} Talebi: ${sebep}` : `${tur} Talebi`;
      }
      if (kalem === 'PUANTAJ_MANUEL') {
        return parsed.saat ? `${parsed.saat} Saat Çalışma` : (parsed.deger || 'Puantaj Kaydı');
      }
      if (kalem === 'PERSONEL_OZLUK') {
        return parsed.ozel_not || 'Özlük Bilgisi';
      }
      if (parsed.aciklama) return parsed.aciklama;
      if (parsed.neden) return parsed.neden;
      if (parsed.not) return parsed.not;
    } catch (e) {}
  }

  if (kalem === 'AVANS_TALEBI') {
    return aciklama ? `Avans Talebi: ${aciklama}` : 'Avans Talebi';
  }

  return aciklama || row.kalem_turu || row.fis_no || '—';
}




function trKarakter(str) {
  return String(str || '')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
}

function detayliBordroPdfOlustur({
  personelNo,
  ad,
  rol,
  gunlukUcret = 0,
  calisilanSaat = 0,
  calisilanGun = 0,
  fmSaat = 0,
  hakedisTutari = 0,
  toplamMasraf = 0,
  toplamPrim = 0,
  toplamAvans = 0,
  toplamKesinti = 0,
  odenmisMaas = 0,
  netOdenecek = 0,
  yil,
  ay,
  ayAdi,
  lokasyonAdi = 'Merkez & Polonya Şantiyeleri',
  tcNo,
  iban,
  bankaAdi,
  iseGirisTarihi,
  departman,
  sgkNo,
  cinsiyet,
  telefon,
  adres
}) {
  const doc = new jsPDF('p', 'mm', 'a4');

  function cizKutu(x, y, w, h, baslik) {
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.35);
    doc.rect(x, y, w, h);
    if (baslik) {
      doc.setFillColor(245, 245, 245);
      doc.rect(x, y, w, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text(trKarakter(baslik), x + w / 2, y + 4.2, { align: 'center' });
      doc.setDrawColor(40, 40, 40);
      doc.line(x, y + 6, x + w, y + 6);
    }
  }

  function cizMetinSatir(x, y, etiket, deger, w) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);
    doc.text(trKarakter(etiket), x + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 10, 10);
    doc.text(trKarakter(deger), x + w - 2, y, { align: 'right' });
  }

  const bugunStr = new Date().toLocaleDateString('tr-TR');
  const isimParcalari = (ad || '').trim().split(' ');
  const soyad = isimParcalari.length > 1 ? isimParcalari.pop() : '';
  const adKalan = isimParcalari.join(' ') || ad;
  const saatlikUcret = Number(gunlukUcret) || 0;
  const calisilanToplamSaat = Number(calisilanSaat) || (calisilanGun * 8);
  const fmTutari = fmSaat * (saatlikUcret * 1.5);
  const odemelerToplami = hakedisTutari + toplamMasraf + toplamPrim;
  const kesintilerToplami = toplamAvans + toplamKesinti + odenmisMaas;

  // SÜTUN 1: BAŞLIK, FİRMA UNVANI, PERSONEL BİLGİLERİ
  cizKutu(10, 10, 46, 26, 'MAAS BORDROSU');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('MAAS BORDROSU', 33, 20, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`Donem: ${trKarakter(ayAdi || String(ay))} ${yil}`, 33, 26, { align: 'center' });
  doc.text(`Tanzim: ${bugunStr}`, 33, 31, { align: 'center' });

  cizKutu(10, 38, 46, 24, 'FIRMA UNVANI');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('SAHA TAKIP INSAAT LTD.', 33, 48, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('Vergi / NIP: PL 5252849102', 33, 54, { align: 'center' });

  cizKutu(10, 64, 46, 185, 'PERSONEL BILGILERI');
  const bankaMetni = bankaAdi ? (bankaAdi + (iban ? ' - ' + iban.slice(-6) : '')) : (iban || '—');
  let py = 74;
  [
    ['Bordro No :', `BRD-${yil}${String(ay).padStart(2, '0')}-${personelNo}`],
    ['Bordro Tar :', bugunStr],
    ['Departman :', departman || 'Saha / Insaat'],
    ['Meslek Grubu :', rol || 'Personel'],
    ['Adi :', adKalan],
    ['Soyadi :', soyad || '—'],
    ['Personel No :', String(personelNo)],
    ['TC / Kimlik :', tcNo || `${personelNo}-TR`],
    ['Ise Giris Tar :', iseGirisTarihi || `01.01.${yil}`],
    ['Cinsiyeti :', cinsiyet || 'Erkek'],
    ['SGK / Sicil :', sgkNo || 'SGK-984120'],
    ['Banka & IBAN :', bankaMetni.length > 20 ? bankaMetni.slice(0, 20) + '..' : bankaMetni],
    ['Ucret Sekli :', 'Saatlik'],
    ['Saatlik Ucret :', `${formatPLN(saatlikUcret)} / sa`],
    ['Aylik Brut :', `${formatPLN(hakedisTutari)}`],
  ].forEach(([lbl, val]) => {
    cizMetinSatir(10, py, lbl, val, 46);
    py += 11;
  });

  // SÜTUN 2: FİRMA BİLGİLERİ VE NORMAL MESAİ
  cizKutu(58, 10, 46, 100, 'FIRMA BILGILERI');
  let fy = 20;
  [
    ['Merkez Adres :', 'Warszawa, Poland'],
    ['Sube / Santiye :', lokasyonAdi],
    ['Vergi No / NIP :', 'PL 5252849102'],
    ['Web Adresi :', 'www.sahatakip.com'],
    ['SGK / Isyeri No :', 'SGK-984120'],
    ['Ticaret Sicil No :', 'KRS: 000084912'],
  ].forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(trKarakter(lbl), 60, fy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(trKarakter(val), 60, fy + 4);
    fy += 14;
  });

  cizKutu(58, 112, 46, 137, 'NORMAL MESAI');
  doc.setFillColor(235, 235, 235);
  doc.rect(58, 118, 46, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text('ACIKLAMA', 60, 121.5);
  doc.text('SURE', 84, 121.5);
  doc.text('TUTAR', 102, 121.5, { align: 'right' });
  let my = 129;
  [
    ['Normal Mesai', `${calisilanToplamSaat} sa`, (calisilanToplamSaat * saatlikUcret).toFixed(2)],
    ['Hafta Sonu (P)', '—', '0.00'],
    ['Ucretli Izin', '0 sa', '0.00'],
    ['Raporlu (R)', '0 sa', '0.00'],
    ['Ucretsiz Izin', '0 sa', '0.00'],
    ['Diger Sure', '0 sa', '0.00'],
  ].forEach(([lbl, gun, tut]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text(trKarakter(lbl), 60, my);
    doc.text(trKarakter(gun), 84, my);
    doc.text(trKarakter(tut), 102, my, { align: 'right' });
    my += 10;
  });
  doc.line(58, 225, 104, 225);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('TOPLAM SURE :', 60, 232);
  doc.text(`${calisilanToplamSaat} Saat`, 102, 232, { align: 'right' });
  doc.text('TOPLAM TUTAR :', 60, 240);
  doc.text(`${formatPLN(calisilanToplamSaat * saatlikUcret)}`, 102, 240, { align: 'right' });

  // SÜTUN 3: FAZLA MESAİ, SGK/VERGİLER, EK KESİNTİ
  cizKutu(106, 10, 46, 45, 'FAZLA MESAI');
  doc.setFillColor(235, 235, 235);
  doc.rect(106, 16, 46, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text('ACIKLAMA', 108, 19.5);
  doc.text('SAAT', 130, 19.5);
  doc.text('TUTAR', 150, 19.5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('Fazla Mesai (1.5x)', 108, 27); doc.text(`${fmSaat} sa`, 130, 27); doc.text(fmTutari.toFixed(2), 150, 27, { align: 'right' });
  doc.text('Bayram / R.T.', 108, 34); doc.text('0 sa', 130, 34); doc.text('0.00', 150, 34, { align: 'right' });
  doc.line(106, 43, 152, 43);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('TOPLAM FM :', 108, 50); doc.text(`${formatPLN(fmTutari)}`, 150, 50, { align: 'right' });

  cizKutu(106, 57, 46, 90, 'SGK VE VERGILER');
  doc.setFillColor(235, 235, 235);
  doc.rect(106, 63, 46, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text('ACIKLAMA', 108, 66.5);
  doc.text('TUTAR', 150, 66.5, { align: 'right' });
  let sy = 74;
  [
    ['Dev. Vergi Matrahi :', `${(calisilanGun * gunlukUcret).toFixed(2)}`],
    ['Vergi Matrahi :', `${(calisilanGun * gunlukUcret).toFixed(2)}`],
    ['Sigorta Matrahi :', `${(calisilanGun * gunlukUcret).toFixed(2)}`],
    ['Gelir Vergisi :', '0.00'],
    ['Sigorta Kesintisi :', '0.00'],
    ['Damga Vergisi :', '0.00'],
  ].forEach(([lbl, val]) => {
    cizMetinSatir(106, sy, lbl, val, 46);
    sy += 8.5;
  });
  doc.line(106, 134, 152, 134);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('TOPLAM :', 108, 142); doc.text('0.00 PLN', 150, 142, { align: 'right' });

  cizKutu(106, 149, 46, 100, 'EK KESINTI');
  doc.setFillColor(235, 235, 235);
  doc.rect(106, 155, 46, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text('ACIKLAMA', 108, 158.5);
  doc.text('TUTAR', 150, 158.5, { align: 'right' });
  let ky = 167;
  [
    ['Alinan Avanslar :', `-${toplamAvans.toFixed(2)}`],
    ['Ceza / Kesinti :', `-${toplamKesinti.toFixed(2)}`],
    ['Onceki Odeme :', `-${odenmisMaas.toFixed(2)}`],
  ].forEach(([lbl, val]) => {
    cizMetinSatir(106, ky, lbl, val, 46);
    ky += 12;
  });
  doc.line(106, 230, 152, 230);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('TOPLAM KESINTI :', 108, 240); doc.text(`-${formatPLN(kesintilerToplami)}`, 150, 240, { align: 'right' });

  // SÜTUN 4: EK ÖDEMELER, HAKEDİŞ ÖZETİ, İMZA
  cizKutu(154, 10, 46, 110, 'EK ODEME');
  doc.setFillColor(235, 235, 235);
  doc.rect(154, 16, 46, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text('ACIKLAMA', 156, 19.5);
  doc.text('TUTAR', 198, 19.5, { align: 'right' });
  let ey = 27;
  [
    ['Santiye Masrafi :', `+${toplamMasraf.toFixed(2)}`],
    ['Prim / Ikramiye :', `+${toplamPrim.toFixed(2)}`],
    ['Yol / Diger :', '0.00'],
  ].forEach(([lbl, val]) => {
    cizMetinSatir(154, ey, lbl, val, 46);
    ey += 12;
  });
  doc.line(154, 106, 200, 106);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('TOPLAM :', 156, 114); doc.text(`+${formatPLN(toplamMasraf + toplamPrim)}`, 198, 114, { align: 'right' });

  cizKutu(154, 122, 46, 65, 'HAKEDIS VE ODEME');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('ODEMELER TOPLAMI', 156, 134);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(`${formatPLN(odemelerToplami)}`, 198, 140, { align: 'right' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text('KESINTILER TOPLAMI', 156, 149);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(`-${formatPLN(kesintilerToplami)}`, 198, 155, { align: 'right' });

  doc.line(154, 162, 200, 162);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('NET ODENEN TUTAR', 156, 171);
  doc.setFontSize(9.5); doc.setTextColor(22, 163, 74);
  doc.text(`${formatPLN(netOdenecek)}`, 198, 180, { align: 'right' });

  cizKutu(154, 189, 46, 60, 'IMZA');
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('Isveren Kase / Imza :', 156, 201);
  doc.text('.....................................', 156, 214);
  doc.text('Personel Imzasi :', 156, 226);
  doc.text('.....................................', 156, 239);

  doc.save(`bordro-${personelNo}-${yil}-${ay}.pdf`);
}
