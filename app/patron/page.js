'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { konumAl } from '@/lib/geo';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { useLocale } from '@/lib/i18n';
import DilSecici from '@/components/DilSecici';
import ThemeToggle from '@/components/ThemeToggle';
import AracFiloTab from '@/components/patron/AracFiloTab';
import ProjelerModulu from '@/components/ProjelerModulu';
import DepoEkipmanTab from '@/components/patron/DepoEkipmanTab';

const KM_BIRIM_MALIYET = 5; // PLN / km, tahmini yakıt + aşınma

function formatPLN(deger) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(deger) || 0);
}

function excelIndir(veriler, dosyaAdi) {
  const ws = XLSX.utils.json_to_sheet(veriler);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  XLSX.writeFile(wb, dosyaAdi);
}

function teklifPdfIndir(teklif) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Teklif', 14, 18);
  doc.setFontSize(11);
  doc.text('Lokasyon: ' + teklif.lokasyon, 14, 28);
  doc.text('Tarih: ' + new Date(teklif.tarih).toLocaleString('tr-TR'), 14, 34);
  doc.text('Toplam Maliyet: ' + formatPLN(teklif.toplam_maliyet), 14, 40);
  const satirlar = doc.splitTextToSize(teklif.teklif_metni || '', 180);
  doc.text(satirlar, 14, 50);
  doc.save('teklif-' + (teklif.lokasyon || 'proje').replace(/\s+/g, '-') + '.pdf');
}

// Ondalık saat değerini (örn. 0.03) "1 dk" veya "1 sa 48 dk" gibi okunabilir metne çevirir.

function yasHesapla(dogumTarihiStr) {
  if (!dogumTarihiStr) return null;
  const d = new Date(dogumTarihiStr);
  if (isNaN(d.getTime())) return null;
  const bugun = new Date();
  let yas = bugun.getFullYear() - d.getFullYear();
  const m = bugun.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && bugun.getDate() < d.getDate())) {
    yas--;
  }
  return yas > 0 ? yas : null;
}
function sureFormatla(saatOndalik) {
  const toplamDakika = Math.round((Number(saatOndalik) || 0) * 60);
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (saat === 0) return dakika + ' dk';
  if (dakika === 0) return saat + ' sa';
  return saat + ' sa ' + dakika + ' dk';
}

export default function PatronPanel() {
  const router = useRouter();
  const { t } = useLocale();
  const [oturum, setOturum] = useState(null);
  const [tab, setTab] = useState('genel');
  const [yeniRaporSayisi, setYeniRaporSayisi] = useState(0);
  const [bildirimKutusuAcik, setBildirimKutusuAcik] = useState(false);
  const [yeniRaporlar, setYeniRaporlar] = useState([]);

  useEffect(() => {
    const kayit = localStorage.getItem('aktifOturum');
    if (!kayit) { router.push('/'); return; }
    try {
      const parsed = JSON.parse(kayit);
      if (parsed.rol !== 'patron') { router.push('/'); return; }
      setOturum(parsed);
    } catch (e) {
      router.push('/');
    }
  }, [router]);

  const defterBildirimYukle = useCallback(async () => {
    const { data } = await supabase.from('santiye_defterleri').select('*').eq('durum', 'Yeni').order('created_at', { ascending: false });
    setYeniRaporlar(data || []);
    setYeniRaporSayisi(data ? data.length : 0);
  }, []);

  useEffect(() => { defterBildirimYukle(); }, [defterBildirimYukle]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const kanal = supabase
      .channel('patron-santiye-defteri')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'santiye_defterleri' },
        (payload) => {
          defterBildirimYukle();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📋 Yeni Şantiye Defteri Raporu!', {
              body: (payload.new.formen_adi || 'Formen') + ' — ' + payload.new.lokasyon,
              icon: '/favicon.ico',
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(kanal); };
  }, [defterBildirimYukle]);

  function cikisYapOturum() {
    localStorage.removeItem('aktifOturum');
    router.push('/');
  }

  if (!oturum) return null;

  return (
    <div>
      <div className="app-header">
        <span className="brand">{t('appAdi')}</span>
        <span className="who">{t('yonetimPaneli')} — <b>{t('rolPatron')}</b></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <DilSecici />
          <ThemeToggle />
          <button
            onClick={() => setBildirimKutusuAcik(!bildirimKutusuAcik)}
            style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', fontSize: 15 }}
          >
            🔔
            {yeniRaporSayisi > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#D32F2F', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>
                {yeniRaporSayisi}
              </span>
            )}
          </button>
          {bildirimKutusuAcik && (
            <div style={{ position: 'absolute', top: '110%', right: 0, width: 300, maxHeight: 360, overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 50, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>{t('santiyeDefteriYeniRapor')}</b>
                <span style={{ cursor: 'pointer', color: 'var(--ink-soft)' }} onClick={() => setBildirimKutusuAcik(false)}>✕</span>
              </div>
              {yeniRaporlar.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('yeniRaporYok')}</div>
              ) : (
                yeniRaporlar.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => { setTab('defter'); setBildirimKutusuAcik(false); }}
                    style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}
                  >
                    <b>{r.formen_adi}</b> — {r.lokasyon}
                    <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{new Date(r.created_at).toLocaleString('tr-TR')}</div>
                  </div>
                ))
              )}
            </div>
          )}
          <button className="logout" onClick={cikisYapOturum}>{t('cikis')}</button>
        </div>
      </div>
      <div className="tabbar">
        <button className={tab === 'genel' ? 'active-patron' : ''} onClick={() => setTab('genel')}>📊 Genel Bakış</button>
        <button className={tab === 'araclar' ? 'active-patron' : ''} onClick={() => setTab('araclar')}>{t('sekmeAracFilosu')}</button>
        <button className={tab === 'depoEkipman' ? 'active-patron' : ''} onClick={() => setTab('depoEkipman')}>📦 {t('sekmeDepoEkipman') || 'Depo & Ekipman'}</button>
        <button className={tab === 'gorevler' ? 'active-patron' : ''} onClick={() => setTab('gorevler')}>{t('sekmeGorevler')}</button>
        <button className={tab === 'defter' ? 'active-patron' : ''} onClick={() => setTab('defter')}>
          📋 Günlük Faaliyet Raporu{yeniRaporSayisi > 0 ? ' (' + yeniRaporSayisi + ')' : ''}
        </button>
        <button className={tab === 'finans' ? 'active-patron' : ''} onClick={() => setTab('finans')}>💰 Finans</button>
        <button className={tab === 'personelDefteri' ? 'active-patron' : ''} onClick={() => setTab('personelDefteri')}>👷 Personel</button>
        <button className={tab === 'projeler' ? 'active-patron' : ''} onClick={() => setTab('projeler')}>{t('sekmeProjeler')}</button>
        <button className={tab === 'teklifler' ? 'active-patron' : ''} onClick={() => setTab('teklifler')}>📝 Lokasyon & AI Teklif</button>
        <button className={tab === 'ayarlar' ? 'active-patron' : ''} onClick={() => setTab('ayarlar')}>{t('sekmeAyarlar')}</button>
      </div>
      <div className="content">
        {tab === 'genel' && <GenelBakis onSekmeDegistir={setTab} />}
        {tab === 'araclar' && <AracFiloTab />}
        {tab === 'depoEkipman' && <DepoEkipmanTab />}
        {tab === 'gorevler' && <GorevlerTab />}
        {tab === 'defter' && <SantiyeDefteriTab onDurumDegisti={defterBildirimYukle} />}
        {tab === 'finans' && <FinansTab />}
        {tab === 'personelDefteri' && <PersonelYonetimiTab />}
        {tab === 'projeler' && <ProjelerModulu />}
        {tab === 'teklifler' && <Lokasyonlar />}
        {tab === 'ayarlar' && <Ayarlar />}
      </div>
    </div>
  );
}

/* ---------------- GENEL BAKIŞ (YÖNETİCİ KOKPİTİ) ---------------- */
function GenelBakis({ onSekmeDegistir }) {
  const { t } = useLocale();
  const [toplamMaliyet, setToplamMaliyet] = useState(0);
  const [icerdekilerListesi, setIcerdekilerListesi] = useState([]);
  const [toplamKm, setToplamKm] = useState(0);
  const [lokasyonOzet, setLokasyonOzet] = useState([]);
  const [saatGun, setSaatGun] = useState(0);
  const [saatHafta, setSaatHafta] = useState(0);
  const [saatAy, setSaatAy] = useState(0);
  const [personelSaatListesi, setPersonelSaatListesi] = useState([]);
  const [muayeneUyarilari, setMuayeneUyarilari] = useState([]);
  const [bekleyenIzinSayisi, setBekleyenIzinSayisi] = useState(0);
  const [bekleyenAvansSayisi, setBekleyenAvansSayisi] = useState(0);
  const [bekleyenGorevSayisi, setBekleyenGorevSayisi] = useState(0);
  const [tahminiMaasYuku, setTahminiMaasYuku] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    (async () => {
      setYukleniyor(true);
      const [
        { data: veriler },
        { data: acikMesailer },
        { data: araclar },
        { data: kapaliMesailer },
        { data: tumAraclar },
        { data: tumPersoneller },
        { data: izinler },
        { data: avanslar },
        { data: gorevler }
      ] = await Promise.all([
        supabase.from('saha_verileri').select('lokasyon, toplam, islem_turu, kalem_turu'),
        supabase.from('giris_cikis').select('*').eq('durum', 'Açık'),
        supabase.from('arac_kullanim').select('katedilen_km'),
        supabase.from('giris_cikis').select('*').eq('durum', 'Kapalı'),
        supabase.from('araclar').select('plaka, marka, model, sonraki_muayene_tarihi'),
        supabase.from('personel').select('personel_no, ad, rol, gunluk_ucret').neq('rol', 'patron'),
        supabase.from('saha_verileri').select('*').eq('kalem_turu', 'IZIN_TALEBI'),
        supabase.from('saha_verileri').select('*').eq('kalem_turu', 'AVANS_TALEBI'),
        supabase.from('gorevler').select('*').neq('durum', 'Tamamlandı'),
      ]);

      const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
      const uyarilar = (tumAraclar || [])
        .filter((a) => a.sonraki_muayene_tarihi)
        .map((a) => {
          const gunKalan = Math.round((new Date(a.sonraki_muayene_tarihi) - bugun) / 86400000);
          return { ...a, gunKalan };
        })
        .filter((a) => a.gunKalan <= 15)
        .sort((x, y) => x.gunKalan - y.gunKalan);
      setMuayeneUyarilari(uyarilar);

      // Masraflar
      const harcamalar = (veriler || []).filter(v => getIslemKategori(v) === 'harcama');
      const tm = harcamalar.reduce((a, v) => a + (Number(v.toplam) || 0), 0);
      setToplamMaliyet(tm);

      // Aktif Sahadakiler
      setIcerdekilerListesi(acikMesailer || []);

      // Kat edilen KM
      setToplamKm((araclar || []).reduce((a, v) => a + (Number(v.katedilen_km) || 0), 0));

      // Lokasyon Dağılımı
      const grup = {};
      harcamalar.forEach((v) => {
        const lok = v.lokasyon || 'Merkez';
        if (!grup[lok]) grup[lok] = { adet: 0, toplam: 0 };
        grup[lok].adet += 1;
        grup[lok].toplam += Number(v.toplam) || 0;
      });
      setLokasyonOzet(Object.entries(grup).map(([lokasyon, v]) => ({ lokasyon, ...v })));

      // Çalışma Süreleri
      const now = new Date();
      const bugunBaslangic = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const haftaBaslangic = new Date(now);
      haftaBaslangic.setDate(now.getDate() - 7);
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);

      let g = 0, h = 0, a = 0;
      const kisiAyMap = {}; // personel_no -> saat
      (kapaliMesailer || []).forEach((m) => {
        const tarih = new Date(m.giris_saati);
        const sure = Number(m.sure_saat) || 0;
        if (tarih >= bugunBaslangic) g += sure;
        if (tarih >= haftaBaslangic) h += sure;
        if (tarih >= ayBaslangic) {
          a += sure;
          kisiAyMap[m.personel_no] = (kisiAyMap[m.personel_no] || 0) + sure;
        }
      });
      setSaatGun(Math.round(g * 100) / 100);
      setSaatHafta(Math.round(h * 100) / 100);
      setSaatAy(Math.round(a * 100) / 100);

      // Personel Bazlı Saat ve Saatlik Maaş Hesabı
      let toplamSaatlikYuk = 0;
      const pSaatListesi = (tumPersoneller || []).map((p) => {
        const saat = Math.round((kisiAyMap[p.personel_no] || 0) * 100) / 100;
        const saatlikUcret = Number(p.gunluk_ucret) || 0;
        const toplamTutar = Math.round((saat * saatlikUcret) * 100) / 100;
        toplamSaatlikYuk += toplamTutar;
        return {
          personel_no: p.personel_no,
          ad: p.ad,
          rol: p.rol,
          saat,
          saatlikUcret,
          toplamTutar,
        };
      }).sort((x, y) => y.saat - x.saat);

      setPersonelSaatListesi(pSaatListesi);
      setTahminiMaasYuku(toplamSaatlikYuk);

      // Bekleyen İzin & Avans & Görev Sayısı
      const bIzin = (izinler || []).filter(i => (i.fis_no || '').toLowerCase() === 'bekliyor').length;
      const bAvans = (avanslar || []).filter(a => (a.fis_no || '').toLowerCase() === 'bekliyor').length;
      setBekleyenIzinSayisi(bIzin);
      setBekleyenAvansSayisi(bAvans);
      setBekleyenGorevSayisi((gorevler || []).length);

      setYukleniyor(false);
    })();
  }, []);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* 🚀 HIZLI YÖNETİCİ EYLEMLERİ & KISAYOLLAR */}
      <div className="card" style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>Şirket Yönetici Paneli & Canlı Saha Takibi</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Gerçek zamanlı giriş/çıkış, saatlik çalışma ve maliyet durumu</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="action btn-punch"
              style={{ width: 'auto', margin: 0, padding: '7px 14px', fontSize: 12 }}
              onClick={() => onSekmeDegistir && onSekmeDegistir('finans')}
            >
              🕒 Puantaj & Hakediş
            </button>
            <button
              className="action btn-secondary"
              style={{ width: 'auto', margin: 0, padding: '7px 14px', fontSize: 12 }}
              onClick={() => onSekmeDegistir && onSekmeDegistir('personelDefteri')}
            >
              👷 Personel Listesi
            </button>
          </div>
        </div>
      </div>

      {/* 🔔 GÜVENLİK & ONAY UYARI BİLDİRİMLERİ */}
      {(bekleyenIzinSayisi > 0 || bekleyenAvansSayisi > 0 || muayeneUyarilari.length > 0) && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(bekleyenIzinSayisi > 0 || bekleyenAvansSayisi > 0) && (
            <div style={{
              padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {bekleyenIzinSayisi > 0 && (
                  <span>🏖️ <b>{bekleyenIzinSayisi} adet bekleyen izin talebi</b></span>
                )}
                {bekleyenIzinSayisi > 0 && bekleyenAvansSayisi > 0 && <span>·</span>}
                {bekleyenAvansSayisi > 0 && (
                  <span>💵 <b>{bekleyenAvansSayisi} adet bekleyen avans talebi</b></span>
                )}
                <span>onayınızı bekliyor.</span>
              </div>
              <button
                onClick={() => onSekmeDegistir && onSekmeDegistir('personelDefteri')}
                style={{ border: 'none', background: '#ef4444', color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Talepleri İncele & Onayla ➔
              </button>
            </div>
          )}
          {muayeneUyarilari.map((a) => {
            const gecti = a.gunKalan < 0;
            return (
              <div
                key={a.plaka}
                style={{
                  padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: gecti ? 'rgba(220, 38, 38, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                  color: gecti ? '#ef4444' : '#f59e0b',
                  border: '1px solid ' + (gecti ? 'rgba(220, 38, 38, 0.3)' : 'rgba(245, 158, 11, 0.3)'),
                }}
              >
                🔧 {[a.marka, a.model].filter(Boolean).join(' ')} ({a.plaka}) — muayene süresi {gecti ? (Math.abs(a.gunKalan) + ' gün önce geçti!') : (a.gunKalan + ' gün sonra doluyor')}
              </div>
            );
          })}
        </div>
      )}

      {/* 📊 ANA METRİK VE KPI KARTLARI */}
      <div className="grid cols-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="stat-card" style={{ borderColor: icerdekilerListesi.length > 0 ? '#16a34a' : 'var(--border)' }}>
          <div className="label">🟢 Canlı Sahada Aktif</div>
          <div className="value" style={{ color: '#16a34a' }}>{icerdekilerListesi.length} Kişi</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Şu an mesaide olanlar</div>
        </div>
        <div className="stat-card">
          <div className="label">⏱️ Bugün Tamamlanan Süre</div>
          <div className="value">{sureFormatla(saatGun)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Bu hafta: {sureFormatla(saatHafta)}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--accent-patron-soft)', borderColor: 'var(--accent-patron)' }}>
          <div className="label" style={{ color: 'var(--accent-patron)' }}>📅 Bu Ay Toplam Çalışma</div>
          <div className="value" style={{ color: 'var(--accent-patron)' }}>{sureFormatla(saatAy)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Tüm personeller toplamı</div>
        </div>
        <div className="stat-card">
          <div className="label">💰 Bu Ayki Saatlik Maaş Yükü</div>
          <div className="value">{formatPLN(tahminiMaasYuku)}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Saatlik ücretler toplamı</div>
        </div>
      </div>

      {/* 🟢 CANLI SAHA DURUMU & PERSONEL ÇALIŞMA LİSTESİ */}
      <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* SOL: ŞU AN SAHADA OLANLAR */}
        <div className="card">
          <h2 className="section" style={{ margin: '0 0 10px 0' }}>📍 Sahada Çalışan Personeller ({icerdekilerListesi.length})</h2>
          {icerdekilerListesi.length === 0 ? (
            <div style={{ padding: '20px 0', color: 'var(--ink-soft)', fontSize: 13, textAlign: 'center' }}>
              Şu an aktif mesaiye başlamış personel bulunmuyor.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {icerdekilerListesi.map((p) => {
                const baslangic = new Date(p.giris_saati);
                const gecenDakika = Math.round((new Date() - baslangic) / 60000);
                const saat = Math.floor(gecenDakika / 60);
                const dk = gecenDakika % 60;
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', background: 'var(--bg-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <b>{p.ad}</b>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>📍 {p.lokasyon} · Giriş: {baslangic.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className="status-tag open" style={{ fontSize: 11 }}>
                        ⏱️ {saat > 0 ? `${saat} sa ${dk} dk` : `${dk} dk`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SAĞ: BU AY PERSONEL ÇALIŞMA SÜRELERİ & HAKEDİŞ DAĞILIMI */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="section" style={{ margin: 0 }}>⏱️ Personel Çalışma Süreleri (Bu Ay)</h2>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Giriş/Çıkış saatleri</span>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {personelSaatListesi.map((p) => (
              <div key={p.personel_no} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.ad}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginLeft: 6 }}>({p.saatlikUcret} PLN/sa)</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent-patron)' }}>{sureFormatla(p.saat)}</span>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{formatPLN(p.toplamTutar)}</div>
                  </div>
                </div>
              </div>
            ))}
            {personelSaatListesi.length === 0 && (
              <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 12 }}>Henüz personel mesai kaydı bulunmuyor.</div>
            )}
          </div>
        </div>
      </div>

      {/* 🧾 LOKASYON BAZLI HARCAMALAR */}
      {lokasyonOzet.length > 0 && (
        <div className="card">
          <h2 className="section">🏢 Lokasyon Bazlı Şantiye Harcamaları Dağılımı</h2>
          <table>
            <thead><tr><th>Lokasyon</th><th>Kalem</th><th>Toplam</th></tr></thead>
            <tbody>
              {lokasyonOzet.map((l) => (
                <tr key={l.lokasyon}><td>{l.lokasyon}</td><td>{l.adet}</td><td>{formatPLN(l.toplam)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- LOKASYONLAR + AI TEKLİF ---------------- */
function Lokasyonlar() {
  const { t } = useLocale();
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [secili, setSecili] = useState('');
  const [kalemler, setKalemler] = useState([]);
  const [teklifMetni, setTeklifMetni] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState('');

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSecili(data[0].ad);
    });
  }, []);

  useEffect(() => {
    if (!secili) return;
    setTeklifMetni('');
    supabase.from('saha_verileri').select('*').eq('lokasyon', secili).then(({ data }) => setKalemler(data || []));
  }, [secili]);

  const toplam = kalemler.reduce((a, k) => a + Number(k.toplam), 0);

  async function teklifOlustur() {
    setHata(''); setYukleniyor(true);
    try {
      const res = await fetch('/api/teklif', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lokasyon: secili, toplamMaliyet: toplam, kalemler }),
      });
      const data = await res.json();
      setYukleniyor(false);
      if (!data.basari) { setHata(data.mesaj); return; }
      setTeklifMetni(data.teklifMetni);
      await supabase.from('teklifler').insert({ lokasyon: secili, toplam_maliyet: toplam, teklif_metni: data.teklifMetni, durum: 'Onay Bekliyor' });
    } catch (err) {
      setYukleniyor(false);
      setHata('Teklif oluşturulurken bağlantı hatası: ' + err.message);
    }
  }

  return (
    <div className="card">
      <label>{t('lokasyonSec')}</label>
      <select value={secili} onChange={(e) => setSecili(e.target.value)}>
        {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
      </select>
      <div className="summary-total">{formatPLN(toplam)}</div>
      <div className="summary-sub">{kalemler.length} {t('kalemGirildi')}</div>
      <button
        className="action btn-secondary"
        style={{ marginTop: 10 }}
        disabled={!kalemler.length}
        onClick={() => excelIndir(
          kalemler.map((k) => ({ Kalem: k.kalem_turu, Personel: k.ad, Miktar: k.miktar, 'Birim Fiyat': k.birim_fiyat, Toplam: k.toplam, Açıklama: k.aciklama || '' })),
          secili.replace(/\s+/g, '-') + '-maliyet.xlsx'
        )}
      >
        📊 {t('excelAktar')}
      </button>
      <table>
        <thead><tr><th>Kalem</th><th>Miktar</th><th>Birim</th><th>Toplam</th></tr></thead>
        <tbody>
          {kalemler.map((k) => (
            <tr key={k.id}><td>{k.kalem_turu}</td><td>{k.miktar}</td><td>{formatPLN(k.birim_fiyat)}</td><td>{formatPLN(k.toplam)}</td></tr>
          ))}
        </tbody>
      </table>
      <button className="action btn-ai" onClick={teklifOlustur} disabled={yukleniyor || !kalemler.length}>
        {yukleniyor ? t('teklifHazirlaniyor') : t('aiTeklifOlustur')}
      </button>
      {hata && <div className="feedback err">{hata}</div>}
      {teklifMetni && <div className="quote-box">{teklifMetni}</div>}
    </div>
  );
}

/* ---------------- ARAÇLAR ---------------- */
function Araclar() {
  const { t } = useLocale();
  const [araclar, setAraclar] = useState([]);
  const [kayitlar, setKayitlar] = useState([]);
  const [seciliPlaka, setSeciliPlaka] = useState(null);
  const [baslangicTarih, setBaslangicTarih] = useState('');
  const [bitisTarih, setBitisTarih] = useState('');
  const [personelArama, setPersonelArama] = useState('');
  const [editInspectionPlaka, setEditInspectionPlaka] = useState(null);
  const [sonMuayeneVal, setSonMuayeneVal] = useState('');
  const [sonrakiMuayeneVal, setSonrakiMuayeneVal] = useState('');

  function araclariYukle() {
    supabase.from('araclar').select('*').then(({ data }) => setAraclar(data || []));
  }

  useEffect(() => {
    araclariYukle();
    supabase.from('arac_kullanim').select('*').order('tarih', { ascending: false }).then(({ data }) => setKayitlar(data || []));
  }, []);

  function muayeneDurumu(a) {
    if (!a.sonraki_muayene_tarihi) return null;
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const hedef = new Date(a.sonraki_muayene_tarihi);
    const gunKalan = Math.round((hedef - bugun) / 86400000);
    if (gunKalan < 0) return { seviye: 'gecti', gunKalan, metin: (Math.abs(gunKalan)) + ' gün önce süresi geçti!' };
    if (gunKalan <= 10) return { seviye: 'yakin', gunKalan, metin: gunKalan + ' gün kaldı' };
    return { seviye: 'normal', gunKalan, metin: gunKalan + ' gün kaldı' };
  }

  async function muayeneKaydet(plaka) {
    if (!sonrakiMuayeneVal) { alert('Lütfen bir sonraki muayene tarihini girin.'); return; }
    await supabase.from('araclar').update({
      son_muayene_tarihi: sonMuayeneVal || null,
      sonraki_muayene_tarihi: sonrakiMuayeneVal,
    }).eq('plaka', plaka);
    setEditInspectionPlaka(null);
    setSonMuayeneVal(''); setSonrakiMuayeneVal('');
    araclariYukle();
  }

  let gosterilenKayitlar = seciliPlaka ? kayitlar.filter((k) => k.plaka === seciliPlaka) : kayitlar;
  if (baslangicTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) >= new Date(baslangicTarih));
  if (bitisTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) <= new Date(bitisTarih + 'T23:59:59'));
  if (personelArama.trim()) gosterilenKayitlar = gosterilenKayitlar.filter((k) => (k.ad || '').toLocaleLowerCase('tr-TR').includes(personelArama.trim().toLocaleLowerCase('tr-TR')));

  const toplamKm = gosterilenKayitlar.reduce((a, k) => a + (Number(k.katedilen_km) || 0), 0);

  function sureMetni(baslangic, bitis) {
    if (!baslangic || !bitis) return '—';
    const dakika = Math.round((new Date(bitis) - new Date(baslangic)) / 60000);
    if (dakika < 60) return dakika + ' dk';
    return Math.floor(dakika / 60) + ' sa ' + (dakika % 60) + ' dk';
  }

  function kartaTiklandi(e, plaka) {
    e.stopPropagation();
    setSeciliPlaka((mevcut) => (mevcut === plaka ? null : plaka));
  }

  return (
    <div onClick={() => setSeciliPlaka(null)}>
      <div className="card">
        <h2 className="section">{t('sekmeAracFilosu')}</h2>
        {seciliPlaka && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            <b style={{ color: 'var(--ink)' }}>{seciliPlaka}</b> filtreleniyor — seçimi kaldırmak için boş bir yere tıklayın.
          </div>
        )}
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {araclar.map((a) => {
            const secili = seciliPlaka === a.plaka;
            return (
              <div
                key={a.plaka}
                className="card"
                onClick={(e) => kartaTiklandi(e, a.plaka)}
                style={{
                  padding: 12, marginBottom: 0, cursor: 'pointer',
                  border: secili ? '2px solid var(--accent-patron)' : '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: '100%', height: 110, borderRadius: 8, background: 'rgba(127, 127, 127, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
                }}>
                  {a.resim_url
                    ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{[a.marka, a.model].filter(Boolean).join(' ') || 'Marka/model girilmedi'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{a.plaka}</div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(a.son_km || 0).toLocaleString('tr-TR')} km</span>
                  {secili && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-patron)' }}>✓ Seçili</span>}
                </div>

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                  {muayeneDurumu(a) ? (
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: muayeneDurumu(a).seviye === 'gecti' ? '#ef4444' : (muayeneDurumu(a).seviye === 'yakin' ? '#f59e0b' : 'var(--ink-soft)'),
                    }}>
                      🔧 Muayene (Przegląd): {muayeneDurumu(a).metin}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>🔧 Muayene tarihi girilmedi</div>
                  )}

                  {editInspectionPlaka === a.plaka ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <label style={{ margin: 0, fontSize: 11 }}>{t('sonMuayeneTarihi')}</label>
                      <input type="date" value={sonMuayeneVal} onChange={(e) => setSonMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <label style={{ margin: 0, fontSize: 11 }}>{t('sonrakiMuayeneTarihi')}</label>
                      <input type="date" value={sonrakiMuayeneVal} onChange={(e) => setSonrakiMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => muayeneKaydet(a.plaka)}>{t('kaydet')}</button>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => setEditInspectionPlaka(null)}>{t('iptal')}</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="action btn-secondary"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 11, marginTop: 6 }}
                      onClick={() => {
                        setEditInspectionPlaka(a.plaka);
                        setSonMuayeneVal(a.son_muayene_tarihi || '');
                        setSonrakiMuayeneVal(a.sonraki_muayene_tarihi || '');
                      }}
                    >
                      📝 Muayene Tarihini Güncelle
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('henuzAracYok')}</div>}
        </div>
      </div>

      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="grid cols-2">
          <div className="stat-card"><div className="label">{t('toplamKatedilenKm')}</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
          <div className="stat-card"><div className="label">{t('tahminiAracMaliyeti')}</div><div className="value">{formatPLN(toplamKm * KM_BIRIM_MALIYET)}</div></div>
        </div>
        <h2 className="section" style={{ marginTop: 18 }}>
          {seciliPlaka ? seciliPlaka + ' — kullanım geçmişi' : 'Araç kullanım geçmişi (tüm araçlar)'}
        </h2>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div>
            <label>Başlangıç tarihi</label>
            <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} />
          </div>
          <div>
            <label>Bitiş tarihi</label>
            <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} />
          </div>
          <div>
            <label>Personel ara</label>
            <input placeholder="isim yazın" value={personelArama} onChange={(e) => setPersonelArama(e.target.value)} />
          </div>
        </div>
        <button
          className="action btn-secondary"
          disabled={!gosterilenKayitlar.length}
          onClick={() => excelIndir(
            gosterilenKayitlar.map((k) => ({
              Tarih: new Date(k.tarih).toLocaleDateString('tr-TR'), Personel: k.ad, Plaka: k.plaka,
              'Alış Saati': new Date(k.tarih).toLocaleTimeString('tr-TR'), 'Alış Km': k.alis_km,
              'Teslim Saati': k.teslim_saati ? new Date(k.teslim_saati).toLocaleTimeString('tr-TR') : '',
              'Teslim Km': k.teslim_km || '', 'Kat Edilen Km': k.katedilen_km || '', Durum: k.durum,
            })),
            'arac-kullanim-gecmisi.xlsx'
          )}
        >
          📊 {t('excelAktar')}
        </button>
        <table>
          <thead>
            <tr>
              <th>Tarih</th><th>Personel</th><th>Plaka</th>
              <th>Alış saati</th><th>Alış km</th>
              <th>Teslim saati</th><th>Teslim km</th>
              <th>Süre</th><th>Kat edilen</th><th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {gosterilenKayitlar.map((k) => (
              <tr key={k.id}>
                <td>{new Date(k.tarih).toLocaleDateString('tr-TR')}</td>
                <td>{k.ad}</td>
                <td>{k.plaka}</td>
                <td>{new Date(k.tarih).toLocaleTimeString('tr-TR')}</td>
                <td>{Number(k.alis_km).toLocaleString('tr-TR')}</td>
                <td>{k.teslim_saati ? new Date(k.teslim_saati).toLocaleTimeString('tr-TR') : '—'}</td>
                <td>{k.teslim_km ? Number(k.teslim_km).toLocaleString('tr-TR') : '—'}</td>
                <td>{sureMetni(k.tarih, k.teslim_saati)}</td>
                <td>{k.katedilen_km ? Number(k.katedilen_km).toLocaleString('tr-TR') + ' km' : '—'}</td>
                <td><span className={'status-tag' + (k.durum === 'Açık' ? ' open' : '')}>{k.durum}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- GÖREVLER ---------------- */
function GorevlerTab() {
  const { t } = useLocale();
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [gorevler, setGorevler] = useState([]);
  const [durumFiltre, setDurumFiltre] = useState('Tümü');

  const [yLokasyon, setYLokasyon] = useState('');
  const [yBaslik, setYBaslik] = useState('');
  const [yAciklama, setYAciklama] = useState('');
  const [yOncelik, setYOncelik] = useState('Normal');
  const [ySonTarih, setYSonTarih] = useState('');
  const [ySeciliPersonel, setYSeciliPersonel] = useState([]);
  const [mesaj, setMesaj] = useState(null);
  const [ekleniyor, setEkleniyor] = useState(false);

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: p } = await supabase.from('personel').select('*').neq('rol', 'patron');
    const { data: g } = await supabase.from('gorevler').select('*').order('olusturulma_tarihi', { ascending: false });
    setLokasyonlar(l || []);
    setPersoneller(p || []);
    setGorevler(g || []);
    if (l && l.length && !yLokasyon) setYLokasyon(l[0].ad);
  }

  useEffect(() => { hepsiniYukle(); }, []);

  function personelSecimiDegistir(no) {
    setYSeciliPersonel((mevcut) => (mevcut.includes(no) ? mevcut.filter((x) => x !== no) : [...mevcut, no]));
  }

  async function gorevOlustur() {
    setMesaj(null);
    if (!yBaslik.trim() || !yLokasyon) { setMesaj({ tip: 'err', metin: 'Başlık ve lokasyon gerekli.' }); return; }
    if (!ySeciliPersonel.length) { setMesaj({ tip: 'err', metin: 'En az bir personel seçin.' }); return; }
    setEkleniyor(true);
    const adlar = ySeciliPersonel.map((no) => personeller.find((p) => p.personel_no === no)?.ad || no);
    const { error } = await supabase.from('gorevler').insert({
      lokasyon: yLokasyon, baslik: yBaslik.trim(), aciklama: yAciklama.trim() || null,
      oncelik: yOncelik, son_tarih: ySonTarih || null,
      atanan_personel_no: ySeciliPersonel, atanan_adlar: adlar, durum: 'Bekliyor',
    });
    setEkleniyor(false);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Görev oluşturuldu.' });
    setYBaslik(''); setYAciklama(''); setYOncelik('Normal'); setYSonTarih(''); setYSeciliPersonel([]);
    hepsiniYukle();
  }

  async function durumDegistir(gorev, yeniDurum) {
    await supabase.from('gorevler').update({
      durum: yeniDurum,
      tamamlanma_tarihi: yeniDurum === 'Tamamlandı' ? new Date().toISOString() : null,
    }).eq('id', gorev.id);
    hepsiniYukle();
  }

  async function gorevSil(id) {
    if (!confirm('Bu görevi silmek istediğine emin misin?')) return;
    await supabase.from('gorevler').delete().eq('id', id);
    hepsiniYukle();
  }

  const gosterilenGorevler = durumFiltre === 'Tümü' ? gorevler : gorevler.filter((g) => g.durum === durumFiltre);
  const oncelikRengi = { 'Düşük': '#5B6560', 'Normal': '#2B4C5C', 'Yüksek': '#A0592A', 'Acil': '#B23B0E' };

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">{t('yeniGorevOlustur')}</h2>
        <label>Lokasyon</label>
        <select value={yLokasyon} onChange={(e) => setYLokasyon(e.target.value)}>
          {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
        </select>
        <label>Başlık</label>
        <input value={yBaslik} onChange={(e) => setYBaslik(e.target.value)} placeholder="örn. Zemin betonu dökümü" />
        <label>Açıklama</label>
        <input value={yAciklama} onChange={(e) => setYAciklama(e.target.value)} placeholder="detaylar (opsiyonel)" />
        <label>Öncelik</label>
        <select value={yOncelik} onChange={(e) => setYOncelik(e.target.value)}>
          <option>Düşük</option><option>Normal</option><option>Yüksek</option><option>Acil</option>
        </select>
        <label>Son tarih</label>
        <input type="date" value={ySonTarih} onChange={(e) => setYSonTarih(e.target.value)} />
        <label>Atanacak personel</label>
        <div className="tag-list">
          {personeller.map((p) => (
            <span
              key={p.personel_no}
              className={'chip' + (ySeciliPersonel.includes(p.personel_no) ? ' sel' : '')}
              onClick={() => personelSecimiDegistir(p.personel_no)}
            >
              {p.ad}
            </span>
          ))}
          {personeller.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Henüz personel yok.</span>}
        </div>
        <button className="action btn-ai" onClick={gorevOlustur} disabled={ekleniyor}>
          {ekleniyor ? 'Oluşturuluyor...' : 'Görevi Oluştur'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>

      <div className="card">
        <h2 className="section">{t('sekmeGorevler')}</h2>
        <label>Durum filtrele</label>
        <select value={durumFiltre} onChange={(e) => setDurumFiltre(e.target.value)}>
          <option>Tümü</option><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option>
        </select>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {gosterilenGorevler.map((g) => (
            <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.baslik}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{g.lokasyon} · {(g.atanan_adlar || []).join(', ')}</div>
                  {g.aciklama && <div style={{ fontSize: 13, marginTop: 6 }}>{g.aciklama}</div>}
                  <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: oncelikRengi[g.oncelik] || 'var(--ink-soft)' }}>{g.oncelik}</span>
                    {g.son_tarih && <span style={{ color: 'var(--ink-soft)' }}>Son tarih: {new Date(g.son_tarih).toLocaleDateString('tr-TR')}</span>}
                    <span className={'status-tag' + (g.durum === 'Tamamlandı' ? ' open' : '')}>{g.durum}</span>
                  </div>
                  {g.tamamlanma_foto_url && (
                    <div style={{ marginTop: 8 }}>
                      <a href={g.tamamlanma_foto_url} target="_blank" rel="noreferrer">
                        <img src={g.tamamlanma_foto_url} alt="Tamamlanma Kanıtı" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6 }} />
                      </a>
                    </div>
                  )}
                </div>
                <button onClick={() => gorevSil(g.id)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('sil')}</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {g.durum !== 'Bekliyor' && <button onClick={() => durumDegistir(g, 'Bekliyor')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Bekliyor yap</button>}
                {g.durum !== 'Devam Ediyor' && <button onClick={() => durumDegistir(g, 'Devam Ediyor')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Devam Ediyor yap</button>}
                {g.durum !== 'Tamamlandı' && <button onClick={() => durumDegistir(g, 'Tamamlandı')} style={{ fontSize: 11, border: '1px solid var(--border)', background: 'rgba(34, 197, 94, 0.16)', color: '#22c55e', borderRadius: 7, padding: '4px 8px', cursor: 'pointer' }}>Tamamlandı yap</button>}
              </div>
            </div>
          ))}
          {gosterilenGorevler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Gösterilecek görev yok.</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- ŞANTİYE DEFTERİ (patron görüntüleme + düzenleme) ---------------- */
function SantiyeDefteriTab({ onDurumDegisti }) {
  const { t } = useLocale();
  const [raporlar, setRaporlar] = useState([]);
  const [lokasyonFiltre, setLokasyonFiltre] = useState('Tümü');
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [acikRapor, setAcikRapor] = useState(null);
  const [duzenleme, setDuzenleme] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function raporlariYukle() {
    const { data: r } = await supabase.from('santiye_defterleri').select('*').order('created_at', { ascending: false });
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    setRaporlar(r || []);
    setLokasyonlar(l || []);
  }

  useEffect(() => { raporlariYukle(); }, []);

  async function raporAc(r) {
    setAcikRapor(r);
    setDuzenleme({
      lokasyon: r.lokasyon,
      saha_formen_sayisi: r.saha_formen_sayisi ?? 0,
      saha_usta_sayisi: r.saha_usta_sayisi ?? 0,
      saha_isci_sayisi: r.saha_isci_sayisi ?? 0,
      ofis_personel_sayisi: r.ofis_personel_sayisi ?? 0,
      arac_ekipman: r.arac_ekipman && r.arac_ekipman.length ? r.arac_ekipman : [{ cins: '', adet: '' }],
      bugun_yapilan: r.bugun_yapilan || '',
      yarin_yapilacak: r.yarin_yapilacak || '',
      notlar: r.notlar || '',
    });

    if (r.durum === 'Yeni') {
      await supabase.from('santiye_defterleri').update({ durum: 'Görüldü' }).eq('id', r.id);
      raporlariYukle();
      if (onDurumDegisti) onDurumDegisti();
    }
  }

  function aracSatiriDegistir(i, alan, deger) {
    setDuzenleme((onceki) => ({
      ...onceki,
      arac_ekipman: onceki.arac_ekipman.map((a, idx) => (idx === i ? { ...a, [alan]: deger } : a)),
    }));
  }
  function aracSatiriEkle() {
    setDuzenleme((onceki) => ({ ...onceki, arac_ekipman: [...onceki.arac_ekipman, { cins: '', adet: '' }] }));
  }
  function aracSatiriSil(i) {
    setDuzenleme((onceki) => ({ ...onceki, arac_ekipman: onceki.arac_ekipman.filter((_, idx) => idx !== i) }));
  }

  async function degisiklikleriKaydet() {
    setKaydediliyor(true);
    const temizAraclar = duzenleme.arac_ekipman.filter((a) => a.cins.trim());
    const { error } = await supabase.from('santiye_defterleri').update({
      lokasyon: duzenleme.lokasyon,
      saha_formen_sayisi: Number(duzenleme.saha_formen_sayisi) || 0,
      saha_usta_sayisi: Number(duzenleme.saha_usta_sayisi) || 0,
      saha_isci_sayisi: Number(duzenleme.saha_isci_sayisi) || 0,
      ofis_personel_sayisi: Number(duzenleme.ofis_personel_sayisi) || 0,
      arac_ekipman: temizAraclar,
      bugun_yapilan: duzenleme.bugun_yapilan,
      yarin_yapilacak: duzenleme.yarin_yapilacak || null,
      notlar: duzenleme.notlar || null,
    }).eq('id', acikRapor.id);
    setKaydediliyor(false);
    if (error) { alert(error.message); return; }
    setAcikRapor(null);
    setDuzenleme(null);
    raporlariYukle();
  }

  async function raporSil(id) {
    if (!confirm('Bu raporu silmek istediğinize emin misiniz?')) return;
    await supabase.from('santiye_defterleri').delete().eq('id', id);
    setAcikRapor(null);
    raporlariYukle();
  }

  const gosterilenler = lokasyonFiltre === 'Tümü' ? raporlar : raporlar.filter((r) => r.lokasyon === lokasyonFiltre);

  if (acikRapor && duzenleme) {
    return (
      <div className="card">
        <button className="action btn-secondary" style={{ width: 'auto', marginBottom: 12 }} onClick={() => { setAcikRapor(null); setDuzenleme(null); }}>← Listeye dön</button>
        <h2 className="section">📋 {acikRapor.formen_adi} — {new Date(acikRapor.created_at).toLocaleString('tr-TR')}</h2>

        <label>Lokasyon</label>
        <input value={duzenleme.lokasyon} onChange={(e) => setDuzenleme({ ...duzenleme, lokasyon: e.target.value })} />

        <label style={{ marginTop: 12 }}>Saha personel sayıları</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Formen</div>
            <input type="number" value={duzenleme.saha_formen_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_formen_sayisi: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Usta</div>
            <input type="number" value={duzenleme.saha_usta_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_usta_sayisi: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>Düz İşçi</div>
            <input type="number" value={duzenleme.saha_isci_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, saha_isci_sayisi: e.target.value })} />
          </div>
        </div>

        <label>Ofis / idari personel sayısı</label>
        <input type="number" value={duzenleme.ofis_personel_sayisi} onChange={(e) => setDuzenleme({ ...duzenleme, ofis_personel_sayisi: e.target.value })} />

        <label style={{ marginTop: 16 }}>Makina, Ekipman ve Araç Durumu</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {duzenleme.arac_ekipman.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input placeholder="Cinsi" value={a.cins} onChange={(e) => aracSatiriDegistir(i, 'cins', e.target.value)} style={{ flex: 2 }} />
              <input placeholder="Adet" type="number" value={a.adet} onChange={(e) => aracSatiriDegistir(i, 'adet', e.target.value)} style={{ flex: 1 }} />
              {duzenleme.arac_ekipman.length > 1 && (
                <button type="button" onClick={() => aracSatiriSil(i)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '0 12px', fontWeight: 700, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="action btn-secondary" style={{ marginTop: 8 }} onClick={aracSatiriEkle}>+ Satır Ekle</button>

        <label style={{ marginTop: 16 }}>Bugün Yapılan İşler</label>
        <textarea rows={4} value={duzenleme.bugun_yapilan} onChange={(e) => setDuzenleme({ ...duzenleme, bugun_yapilan: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <label style={{ marginTop: 12 }}>Yarın Yapılacak İşler</label>
        <textarea rows={3} value={duzenleme.yarin_yapilacak} onChange={(e) => setDuzenleme({ ...duzenleme, yarin_yapilacak: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <label style={{ marginTop: 12 }}>Notlar / Açıklamalar / Sıkıntılar</label>
        <textarea rows={3} value={duzenleme.notlar} onChange={(e) => setDuzenleme({ ...duzenleme, notlar: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14 }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="action btn-ai" onClick={degisiklikleriKaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
          <button
            onClick={() => raporSil(acikRapor.id)}
            style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 9, padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            Sil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="section">📋 Günlük Faaliyet Raporu — {t('rolFormen')}</h2>
      <label>Lokasyon filtrele</label>
      <select value={lokasyonFiltre} onChange={(e) => setLokasyonFiltre(e.target.value)}>
        <option>Tümü</option>
        {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
      </select>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {gosterilenler.map((r) => (
          <div
            key={r.id}
            onClick={() => raporAc(r)}
            style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.lokasyon}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                  {r.formen_adi} · {new Date(r.created_at).toLocaleString('tr-TR')}
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-soft)' }}>
                  {(r.bugun_yapilan || '').slice(0, 80)}{(r.bugun_yapilan || '').length > 80 ? '...' : ''}
                </div>
              </div>
              <span className={'status-tag' + (r.durum === 'Görüldü' ? ' open' : '')}>{r.durum}</span>
            </div>
          </div>
        ))}
        {gosterilenler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz rapor gönderilmedi.</div>}
      </div>
    </div>
  );
}

/* ---------------- PROJELER (mimar planları + hata işaretleme) ---------------- */
function ProjelerTab() {
  const { t } = useLocale();
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');
  const [projeler, setProjeler] = useState([]);
  const [seciliProje, setSeciliProje] = useState(null);
  const [notlar, setNotlar] = useState([]);
  const [yeniBaslik, setYeniBaslik] = useState('');
  const [yeniDosya, setYeniDosya] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [yeniPin, setYeniPin] = useState(null); // { x, y }
  const [pinMetni, setPinMetni] = useState('');
  const [acikPin, setAcikPin] = useState(null);
  const [pinEklemeModu, setPinEklemeModu] = useState(false);

  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) setSeciliLokasyon(data[0].ad);
    });
  }, []);

  async function projeleriYukle() {
    if (!seciliLokasyon) return;
    const { data } = await supabase.from('projeler').select('*').eq('lokasyon', seciliLokasyon).order('created_at', { ascending: false });
    setProjeler(data || []);
  }

  useEffect(() => { projeleriYukle(); setSeciliProje(null); }, [seciliLokasyon]);

  async function notlariYukle(projeId) {
    const { data } = await supabase.from('proje_notlari').select('*').eq('proje_id', projeId).order('created_at', { ascending: true });
    setNotlar(data || []);
  }

  async function projeSec(p) {
    setSeciliProje(p);
    setAcikPin(null);
    setYeniPin(null);
    await notlariYukle(p.id);
  }

  async function projeEkle() {
    setMesaj(null);
    if (!yeniBaslik.trim() || !yeniDosya) { setMesaj({ tip: 'err', metin: 'Başlık ve resim gerekli.' }); return; }
    setYukleniyor(true);
    const dosyaAdi = Date.now() + '-' + yeniDosya.name.replace(/\s+/g, '-');
    const { error: yuklemeHatasi } = await supabase.storage.from('proje-resimleri').upload(dosyaAdi, yeniDosya);
    if (yuklemeHatasi) { setMesaj({ tip: 'err', metin: yuklemeHatasi.message }); setYukleniyor(false); return; }
    const { data: urlData } = supabase.storage.from('proje-resimleri').getPublicUrl(dosyaAdi);
    const { error } = await supabase.from('projeler').insert({
      lokasyon: seciliLokasyon, baslik: yeniBaslik.trim(), resim_url: urlData.publicUrl,
    });
    setYukleniyor(false);
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setMesaj({ tip: 'ok', metin: 'Proje eklendi.' });
    setYeniBaslik(''); setYeniDosya(null);
    projeleriYukle();
  }

  function resmeTiklandi(e) {
    if (!seciliProje || !pinEklemeModu) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAcikPin(null);
    setYeniPin({ x, y });
    setPinMetni('');
  }

  async function pinKaydet() {
    if (!pinMetni.trim() || !yeniPin) return;
    const { error } = await supabase.from('proje_notlari').insert({
      proje_id: seciliProje.id, x: yeniPin.x, y: yeniPin.y, aciklama: pinMetni.trim(), durum: 'Açık', olusturan: 'Patron',
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setYeniPin(null); setPinMetni(''); setPinEklemeModu(false);
    notlariYukle(seciliProje.id);
  }

  async function pinSil(id) {
    await supabase.from('proje_notlari').delete().eq('id', id);
    setAcikPin(null);
    notlariYukle(seciliProje.id);
  }

  if (seciliProje) {
    return (
      <div className="card">
        <style>{`
          @keyframes pinNabiz { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); } 70% { box-shadow: 0 0 0 12px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }
          .proje-pin { position: absolute; width: 22px; height: 22px; border-radius: 50%; transform: translate(-50%, -50%); cursor: pointer; border: 2px solid white; }
          .proje-pin.acik { background: #dc2626; animation: pinNabiz 1.6s infinite; }
          .proje-pin.cozuldu { background: #16a34a; }
        `}</style>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setSeciliProje(null)}>← Projelere dön</button>
          <button
            className={'action' + (pinEklemeModu ? ' btn-punch cikis' : ' btn-ai')}
            style={{ width: 'auto' }}
            onClick={() => { setPinEklemeModu((m) => !m); setYeniPin(null); setAcikPin(null); }}
          >
            {pinEklemeModu ? '✕ Pin Eklemeyi İptal Et' : '📍 Pin Ekle'}
          </button>
        </div>
        <h2 className="section">{seciliProje.baslik}</h2>
        <div style={{ fontSize: 13, color: pinEklemeModu ? 'var(--ink)' : 'var(--ink-soft)', marginBottom: 10 }}>
          {pinEklemeModu ? 'Pin ekleme modu açık — hatayı işaretlemek için planın üzerine tıklayın.' : '"Pin Ekle" butonuna basıp planda işaretlemek istediğiniz noktaya tıklayın.'}
        </div>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={seciliProje.resim_url}
            alt={seciliProje.baslik}
            onClick={resmeTiklandi}
            style={{ maxWidth: '100%', display: 'block', cursor: pinEklemeModu ? 'crosshair' : 'default', borderRadius: 8 }}
          />
          {notlar.map((n) => (
            <div
              key={n.id}
              className={'proje-pin ' + (n.durum === 'Açık' ? 'acik' : 'cozuldu')}
              style={{ left: n.x + '%', top: n.y + '%' }}
              onClick={(e) => { e.stopPropagation(); setYeniPin(null); setAcikPin(n); }}
            />
          ))}
          {yeniPin && <div className="proje-pin acik" style={{ left: yeniPin.x + '%', top: yeniPin.y + '%' }} />}
        </div>

        {yeniPin && (
          <div style={{ marginTop: 14 }}>
            <label>Hata açıklaması</label>
            <input value={pinMetni} onChange={(e) => setPinMetni(e.target.value)} placeholder="örn. bu duvarın ölçüsü yanlış" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="action btn-ai" onClick={pinKaydet}>İşaretle</button>
              <button className="action btn-secondary" onClick={() => { setYeniPin(null); setPinEklemeModu(false); }}>{t('iptal')}</button>
            </div>
          </div>
        )}

        {acikPin && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <span className={'status-tag' + (acikPin.durum === 'Açık' ? ' open' : '')}>{acikPin.durum}</span>
            </div>
            <div style={{ marginBottom: 10 }}>{acikPin.aciklama}</div>
            {acikPin.cozen && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Düzelten: {acikPin.cozen}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="action btn-secondary" onClick={() => pinSil(acikPin.id)}>{t('sil')}</button>
              <button className="action btn-secondary" onClick={() => setAcikPin(null)}>Kapat</button>
            </div>
          </div>
        )}
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    );
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">{t('sekmeProjeler')}</h2>
        <label>Lokasyon</label>
        <select value={seciliLokasyon} onChange={(e) => setSeciliLokasyon(e.target.value)}>
          {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
        </select>
        {projeler.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 10 }}>Bu lokasyonda henüz proje yok.</div>
        )}
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {projeler.map((p) => (
            <div key={p.id} className="card" style={{ cursor: 'pointer', padding: 10 }} onClick={() => projeSec(p)}>
              <img src={p.resim_url} alt={p.baslik} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ marginTop: 6, fontWeight: 600 }}>{p.baslik}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 className="section">{t('sekmeProjeler')} — {t('ekle')}</h2>
        <label>Başlık</label>
        <input value={yeniBaslik} onChange={(e) => setYeniBaslik(e.target.value)} placeholder="örn. Zemin kat planı" />
        <label>Proje / plan resmi</label>
        <input type="file" accept="image/*" onChange={(e) => setYeniDosya(e.target.files?.[0] || null)} />
        <button className="action btn-ai" onClick={projeEkle} disabled={yukleniyor}>
          {yukleniyor ? 'Yükleniyor...' : 'Projeyi Ekle'}
        </button>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>
    </div>
  );
}

/* ---------------- AYARLAR ---------------- */
function Ayarlar() {
  const { t } = useLocale();
  const [yedekleniyor, setYedekleniyor] = useState(false);

  async function tumSistemiYedekle() {
    setYedekleniyor(true);
    try {
      const [
        { data: pList },
        { data: lList },
        { data: sList },
        { data: gList },
        { data: dList },
        { data: eList },
        { data: aList },
        { data: kList },
      ] = await Promise.all([
        supabase.from('personel').select('*'),
        supabase.from('lokasyonlar').select('*'),
        supabase.from('saha_verileri').select('*'),
        supabase.from('giris_cikis').select('*'),
        supabase.from('santiye_defterleri').select('*'),
        supabase.from('ekipmanlar').select('*'),
        supabase.from('araclar').select('*'),
        supabase.from('kalem_turleri').select('*'),
      ]);

      const yedekPaketi = {
        yedekTarihi: new Date().toISOString(),
        uygulama: 'Saha Takip 2.0 Pro',
        kayitSayilari: {
          personel: (pList || []).length,
          saha_verileri: (sList || []).length,
          mesai_hareketleri: (gList || []).length,
          santiye_defterleri: (dList || []).length,
          lokasyonlar: (lList || []).length,
          ekipmanlar: (eList || []).length,
          araclar: (aList || []).length,
        },
        veriler: {
          personel: pList || [],
          lokasyonlar: lList || [],
          saha_verileri: sList || [],
          giris_cikis: gList || [],
          santiye_defterleri: dList || [],
          ekipmanlar: eList || [],
          araclar: aList || [],
          kalem_turleri: kList || [],
        },
      };

      const blob = new Blob([JSON.stringify(yedekPaketi, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const tarihStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `saha-takip-tam-yedek-${tarihStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Yedekleme sırasında hata oluştu: ' + err.message);
    } finally {
      setYedekleniyor(false);
    }
  }
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [kalemTurleri, setKalemTurleri] = useState([]);
  const [araclar, setAraclar] = useState([]);
  const [yeniLokasyon, setYeniLokasyon] = useState('');
  const [yeniEnlem, setYeniEnlem] = useState('');
  const [yeniBoylam, setYeniBoylam] = useState('');
  const [yeniYaricap, setYeniYaricap] = useState('150');
  const [konumAliniyor, setKonumAliniyor] = useState(false);
  const [gorunenQr, setGorunenQr] = useState(null);
  const [ayarlar, setAyarlar] = useState({ konum_dogrulama_aktif: false, qr_dogrulama_aktif: false, gunluk_rapor_aktif: false, haftalik_rapor_aktif: false, aylik_rapor_aktif: false, rapor_eposta: '' });
  const [yeniKalem, setYeniKalem] = useState('');
  const [yeniPlaka, setYeniPlaka] = useState('');
  const [yeniPlakaKm, setYeniPlakaKm] = useState('');
  const [yeniMarka, setYeniMarka] = useState('');
  const [yeniModel, setYeniModel] = useState('');
  const [yeniResimDosya, setYeniResimDosya] = useState(null);
  const [yeniSonMuayene, setYeniSonMuayene] = useState('');
  const [yeniSonrakiMuayene, setYeniSonrakiMuayene] = useState('');
  const [ekleniyor, setEkleniyor] = useState(false);
  const [testGonderiliyor, setTestGonderiliyor] = useState(false);
  const [testMesaj, setTestMesaj] = useState(null);
  const [duzenlenenKalemId, setDuzenlenenKalemId] = useState(null);
  const [duzenlenenKalemAd, setDuzenlenenKalemAd] = useState('');

  async function hepsiniYukle() {
    const { data: l } = await supabase.from('lokasyonlar').select('*');
    const { data: k } = await supabase.from('kalem_turleri').select('*');
    const { data: a } = await supabase.from('araclar').select('*');
    const { data: s } = await supabase.from('sistem_ayarlari').select('*').eq('id', 1).maybeSingle();
    setLokasyonlar(l || []);
    setKalemTurleri(k || []);
    setAraclar(a || []);
    if (s) setAyarlar(s);
  }

  useEffect(() => { hepsiniYukle(); }, []);

  async function ayarGuncelle(alan, deger) {
    const yeniAyarlar = { ...ayarlar, [alan]: deger };
    setAyarlar(yeniAyarlar);
    await supabase.from('sistem_ayarlari').update({ [alan]: deger }).eq('id', 1);
  }

  async function testEpostasiGonder() {
    if (!ayarlar.rapor_eposta || !ayarlar.rapor_eposta.trim()) {
      setTestMesaj({ tip: 'err', metin: 'Lütfen geçerli bir e-posta adresi girin.' });
      return;
    }
    setTestGonderiliyor(true);
    setTestMesaj(null);
    try {
      const res = await fetch('/api/cron/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eposta: ayarlar.rapor_eposta.trim() }),
      });
      const data = await res.json();
      if (data.basari) {
        setTestMesaj({ tip: 'ok', metin: data.mesaj || 'Test e-postası başarıyla gönderildi!' });
      } else {
        setTestMesaj({ tip: 'err', metin: data.mesaj || 'Gönderim başarısız.' });
      }
    } catch (err) {
      setTestMesaj({ tip: 'err', metin: 'İstek hatası: ' + err.message });
    }
    setTestGonderiliyor(false);
  }

  async function suankiKonumuKullan() {
    setKonumAliniyor(true);
    try {
      const { lat, lon } = await konumAl();
      setYeniEnlem(String(lat));
      setYeniBoylam(String(lon));
    } catch (err) {
      alert(err.message);
    }
    setKonumAliniyor(false);
  }

  async function lokasyonEkle() {
    if (!yeniLokasyon.trim()) return;
    const qrKodu = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    await supabase.from('lokasyonlar').insert({
      ad: yeniLokasyon.trim(),
      enlem: yeniEnlem ? Number(yeniEnlem) : null,
      boylam: yeniBoylam ? Number(yeniBoylam) : null,
      yaricap_metre: Number(yeniYaricap) || 150,
      qr_kodu: qrKodu,
    });
    setYeniLokasyon(''); setYeniEnlem(''); setYeniBoylam(''); setYeniYaricap('150');
    hepsiniYukle();
  }

  async function lokasyonSil(ad) {
    if (!confirm(ad + ' lokasyonunu silmek istediğine emin misin?')) return;
    await supabase.from('lokasyonlar').delete().eq('ad', ad);
    hepsiniYukle();
  }

  async function qrGoster(lokasyon) {
    if (!lokasyon.qr_kodu) { alert('Bu lokasyon için QR kod tanımlı değil.'); return; }
    const dataUrl = await QRCode.toDataURL(lokasyon.qr_kodu, { width: 260 });
    setGorunenQr({ ad: lokasyon.ad, dataUrl });
  }

  async function kalemEkle() {
    if (!yeniKalem.trim()) return;
    await supabase.from('kalem_turleri').insert({ ad: yeniKalem.trim() });
    setYeniKalem('');
    hepsiniYukle();
  }
  async function kalemSil(id, ad) {
    if (!confirm(ad + ' kalem türünü silmek istediğine emin misin?')) return;
    await supabase.from('kalem_turleri').delete().eq('id', id);
    hepsiniYukle();
  }
  async function kalemGuncelle(id) {
    if (!duzenlenenKalemAd.trim()) return;
    await supabase.from('kalem_turleri').update({ ad: duzenlenenKalemAd.trim() }).eq('id', id);
    setDuzenlenenKalemId(null);
    setDuzenlenenKalemAd('');
    hepsiniYukle();
  }
  async function plakaEkle() {
    if (!yeniPlaka.trim()) return;
    setEkleniyor(true);

    let resimUrl = null;
    if (yeniResimDosya) {
      const dosyaAdi = Date.now() + '-' + yeniResimDosya.name.replace(/\s+/g, '-');
      const { error: yuklemeHatasi } = await supabase.storage.from('arac-resimleri').upload(dosyaAdi, yeniResimDosya);
      if (yuklemeHatasi) {
        alert('Resim yüklenemedi: ' + yuklemeHatasi.message);
        setEkleniyor(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('arac-resimleri').getPublicUrl(dosyaAdi);
      resimUrl = urlData.publicUrl;
    }

    await supabase.from('araclar').insert({
      plaka: yeniPlaka.trim(),
      durum: 'Boşta',
      son_km: Number(yeniPlakaKm) || 0,
      marka: yeniMarka.trim() || null,
      model: yeniModel.trim() || null,
      resim_url: resimUrl,
      son_muayene_tarihi: yeniSonMuayene || null,
      sonraki_muayene_tarihi: yeniSonrakiMuayene || null,
    });
    setYeniPlaka(''); setYeniPlakaKm(''); setYeniMarka(''); setYeniModel(''); setYeniResimDosya(null);
    setYeniSonMuayene(''); setYeniSonrakiMuayene('');
    setEkleniyor(false);
    hepsiniYukle();
  }
  async function plakaSil(plaka, durum) {
    if (durum === 'Kullanımda') {
      alert('Bu araç şu an kullanımda, önce personel tarafından teslim edilmesi gerekiyor.');
      return;
    }
    if (!confirm(plaka + ' plakalı aracı silmek istediğine emin misin?')) return;
    await supabase.from('araclar').delete().eq('plaka', plaka);
    hepsiniYukle();
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h2 className="section">{t('dogrulamaAyarlari')}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 12 }}>
          Açarsan, personel mesai giriş/çıkışında bu doğrulamaları geçmek zorunda kalır.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>📍 Konum doğrulaması</span>
          <button
            onClick={() => ayarGuncelle('konum_dogrulama_aktif', !ayarlar.konum_dogrulama_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.konum_dogrulama_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.konum_dogrulama_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.konum_dogrulama_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ fontSize: 14 }}>📷 QR kod doğrulaması</span>
          <button
            onClick={() => ayarGuncelle('qr_dogrulama_aktif', !ayarlar.qr_dogrulama_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.qr_dogrulama_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.qr_dogrulama_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.qr_dogrulama_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t('epostaRaporlari')}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 12 }}>
          Günlük ve aylık özet raporlarının gönderileceği e-posta adresini ve durumunu ayarlayın.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 'bold' }}>Rapor Gönderilecek E-posta</label>
          <input
            type="email"
            placeholder="ornek@firma.com"
            value={ayarlar.rapor_eposta || ''}
            onChange={(e) => setAyarlar({ ...ayarlar, rapor_eposta: e.target.value })}
            onBlur={(e) => ayarGuncelle('rapor_eposta', e.target.value.trim())}
            style={{ marginTop: 6 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={testEpostasiGonder}
              disabled={testGonderiliyor || !ayarlar.rapor_eposta}
              className="action btn-secondary"
              style={{
                width: 'auto', fontSize: 12, padding: '6px 12px', height: 'auto', cursor: 'pointer',
                background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--border)',
                opacity: (testGonderiliyor || !ayarlar.rapor_eposta) ? 0.5 : 1,
              }}
            >
              {testGonderiliyor ? 'Gönderiliyor...' : '⚡ Test E-postası Gönder'}
            </button>
          </div>
          {testMesaj && <div className={`feedback ${testMesaj.tip}`} style={{ marginTop: 8, fontSize: 12 }}>{testMesaj.metin}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>✉️ Günlük E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('gunluk_rapor_aktif', !ayarlar.gunluk_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.gunluk_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.gunluk_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.gunluk_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14 }}>📅 Haftalık E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('haftalik_rapor_aktif', !ayarlar.haftalik_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.haftalik_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.haftalik_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.haftalik_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <span style={{ fontSize: 14 }}>📅 Aylık E-posta Raporu</span>
          <button
            onClick={() => ayarGuncelle('aylik_rapor_aktif', !ayarlar.aylik_rapor_aktif)}
            style={{
              border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: ayarlar.aylik_rapor_aktif ? 'rgba(34, 197, 94, 0.16)' : 'rgba(127, 127, 127, 0.12)',
              color: ayarlar.aylik_rapor_aktif ? '#22c55e' : 'var(--ink-soft)',
            }}
          >
            {ayarlar.aylik_rapor_aktif ? 'Aktif' : 'Pasif'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t('sekmeLokasyonlar')}</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {lokasyonlar.map((l) => (
            <div key={l.ad} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13 }}>
                  <b>{l.ad}</b> {l.enlem != null ? ' · 📍 konum tanımlı' : ' · konum yok'} · yarıçap {l.yaricap_metre || 150} m
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => qrGoster(l)} style={{ border: 'none', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>QR</button>
                  <button onClick={() => lokasyonSil(l.ad)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{t('sil')}</button>
                </div>
              </div>
            </div>
          ))}
          {lokasyonlar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz lokasyon eklenmedi.</div>}
        </div>

        {gorunenQr && (
          <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{gorunenQr.ad}</div>
            <img src={gorunenQr.dataUrl} alt="QR kod" style={{ width: 180, height: 180, margin: '0 auto' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
              <a href={gorunenQr.dataUrl} download={gorunenQr.ad + '-qr.png'} className="action btn-secondary" style={{ width: 'auto', padding: '8px 14px', textDecoration: 'none' }}>İndir</a>
              <button className="action btn-secondary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => setGorunenQr(null)}>Kapat</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <input placeholder={t('yeniLokasyonAdi')} value={yeniLokasyon} onChange={(e) => setYeniLokasyon(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Enlem (opsiyonel)" value={yeniEnlem} onChange={(e) => setYeniEnlem(e.target.value)} />
            <input placeholder="Boylam (opsiyonel)" value={yeniBoylam} onChange={(e) => setYeniBoylam(e.target.value)} />
          </div>
          <button onClick={suankiKonumuKullan} disabled={konumAliniyor} style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 9, padding: '9px 0', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            {konumAliniyor ? 'Konum alınıyor...' : '📍 Şu Anki Konumu Kullan (sahadayken)'}
          </button>
          <input placeholder={t('izinVerilenYaricap')} type="number" value={yeniYaricap} onChange={(e) => setYeniYaricap(e.target.value)} />
          <button onClick={lokasyonEkle} style={{ border: 'none', background: 'var(--accent-patron)', color: '#fff', borderRadius: 9, padding: '10px 0', fontWeight: 700, cursor: 'pointer' }}>{t('lokasyonEkleButon')}</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">{t('kalemTurleri')}</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10, marginBottom: 12 }}>
          {kalemTurleri.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              {duzenlenenKalemId === k.id ? (
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <input
                    value={duzenlenenKalemAd}
                    onChange={(e) => setDuzenlenenKalemAd(e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, flex: 1 }}
                  />
                  <button
                    onClick={() => kalemGuncelle(k.id)}
                    style={{ border: 'none', background: 'rgba(34, 197, 94, 0.16)', color: '#22c55e', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Kaydet
                  </button>
                  <button
                    onClick={() => { setDuzenlenenKalemId(null); setDuzenlenenKalemAd(''); }}
                    style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{k.ad}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { setDuzenlenenKalemId(k.id); setDuzenlenenKalemAd(k.ad); }}
                      style={{ border: 'none', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {t('duzenle')}
                    </button>
                    <button
                      onClick={() => kalemSil(k.id, k.ad)}
                      style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sil
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {kalemTurleri.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('henuzKalemYok')}</div>}
        </div>
        <div className="add-row">
          <input placeholder={t('yeniKalemTuru')} value={yeniKalem} onChange={(e) => setYeniKalem(e.target.value)} />
          <button onClick={kalemEkle}>{t('ekle')}</button>
        </div>
      </div>
      <div className="card">
        <h2 className="section">{t('sekmeAracFilosu')}</h2>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {araclar.map((a) => (
            <div key={a.plaka} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px' }}>
              <div style={{ fontSize: 13 }}>
                <b>{a.plaka}</b> · {[a.marka, a.model].filter(Boolean).join(' ') || 'marka/model yok'} · {a.durum} · {(a.son_km || 0).toLocaleString('tr-TR')} km
              </div>
              <button
                onClick={() => plakaSil(a.plaka, a.durum)}
                style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Sil
              </button>
            </div>
          ))}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('henuzAracYok')}</div>}
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <input placeholder="Plaka (örn. 34 AB 123)" value={yeniPlaka} onChange={(e) => setYeniPlaka(e.target.value.toLocaleUpperCase('tr-TR'))} style={{ textTransform: 'uppercase' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Marka (örn. Ford)" value={yeniMarka} onChange={(e) => setYeniMarka(e.target.value)} />
            <input placeholder="Model (örn. Transit)" value={yeniModel} onChange={(e) => setYeniModel(e.target.value)} />
          </div>
          <input placeholder={t('baslangicKm')} type="number" value={yeniPlakaKm} onChange={(e) => setYeniPlakaKm(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>{t('sonMuayeneTarihi')} ({t('opsiyonel')})</label>
          <input type="date" value={yeniSonMuayene} onChange={(e) => setYeniSonMuayene(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>{t('sonrakiMuayeneTarihi')} ({t('opsiyonel')})</label>
          <input type="date" value={yeniSonrakiMuayene} onChange={(e) => setYeniSonrakiMuayene(e.target.value)} />
          <label style={{ margin: '2px 0 0' }}>Araç fotoğrafı (opsiyonel)</label>
          <input type="file" accept="image/*" onChange={(e) => setYeniResimDosya(e.target.files?.[0] || null)} />
          <button onClick={plakaEkle} disabled={ekleniyor} style={{ border: 'none', background: 'var(--accent-patron)', color: '#fff', borderRadius: 9, padding: '10px 0', fontWeight: 700, cursor: 'pointer' }}>
            {ekleniyor ? t('ekleniyor') : t('aracEkle')}
          </button>
        </div>
      </div>

      {/* 5. GÜVENLİK VE TAM SİSTEM YEDEKLEME */}
      <div className="card" style={{ borderColor: 'var(--accent-patron)' }}>
        <h2 className="section" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          💾 Güvenlik & Tam Veri Tabanı Yedekleme
        </h2>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 14 }}>
          Tüm personel özlük kayıtları, saatlik mesai puantajları, şantiye faaliyet defterleri, kasa hareketleri ve araç envanterini tek tıkla şifreli/güvenli JSON yedeği olarak bilgisayarınıza veya telefonunuza indirin.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={tumSistemiYedekle}
            disabled={yedekleniyor}
            className="action btn-punch"
            style={{ width: 'auto', margin: 0, padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {yedekleniyor ? '⏳ Yedek Paketi Hazırlanıyor...' : '📥 Tek Tıkla Tam Veritabanı Yedeğini İndir (.JSON)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   ORTAK YARDIMCI FONKSİYONLAR — Puantaj & Bordro PDF
   ================================================================== */
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

function ayGunSayisi(yil, ay) {
  return new Date(yil, ay, 0).getDate();
}

function tarihStrOlustur(yil, ay, gun) {
  return yil + '-' + String(ay).padStart(2, '0') + '-' + String(gun).padStart(2, '0');
}

// Ondalık saat değerini hücrelerde kompakt metne çevirir (örn. 0.06 -> '4 dk', 0.52 -> '31 dk', 8 -> '8', 9.5 -> '9.5')
function hucreSureFormatla(saatOndalik) {
  if (!saatOndalik || saatOndalik <= 0) return '·';
  const toplamDakika = Math.round(saatOndalik * 60);
  if (toplamDakika < 60) return `${toplamDakika} dk`;
  const saat = Math.floor(toplamDakika / 60);
  const dakika = toplamDakika % 60;
  if (dakika === 0) return `${saat}`;
  const ondalik = Math.round((dakika / 60) * 10) / 10;
  return `${saat + ondalik}`;
}

async function ayVerileriniGetir(yil, ay) {
  const gunSayisi = ayGunSayisi(yil, ay);
  const ayBasi = new Date(yil, ay - 1, 1);
  const aySonu = new Date(yil, ay, 0, 23, 59, 59);
  const ayBasiStr = tarihStrOlustur(yil, ay, 1);
  const aySonuStr = tarihStrOlustur(yil, ay, gunSayisi);

  const [{ data: mesailer }, { data: manuelKayitlar }, { data: sahaManuelKayitlar }] = await Promise.all([
    supabase.from('giris_cikis').select('personel_no, giris_saati, sure_saat, durum')
      .gte('giris_saati', ayBasi.toISOString()).lte('giris_saati', aySonu.toISOString()),
    supabase.from('puantaj_manuel').select('*').gte('tarih', ayBasiStr).lte('tarih', aySonuStr),
    supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PUANTAJ_MANUEL').gte('tarih', ayBasi.toISOString()).lte('tarih', aySonu.toISOString()),
  ]);

  const otomatikSaatMap = {};
  (mesailer || []).forEach((m) => {
    const gunStr = new Date(m.giris_saati).toISOString().slice(0, 10);
    const key = m.personel_no + '|' + gunStr;
    otomatikSaatMap[key] = (otomatikSaatMap[key] || 0) + (Number(m.sure_saat) || 0);
  });

  const manuelMap = {};
  (manuelKayitlar || []).forEach((m) => {
    manuelMap[m.personel_no + '|' + m.tarih] = m.deger;
  });
  (sahaManuelKayitlar || []).forEach((sRow) => {
    const gunStr = new Date(sRow.tarih).toISOString().slice(0, 10);
    let deger = sRow.fis_no || String(sRow.miktar);
    if (sRow.aciklama) {
      try {
        const parsed = JSON.parse(sRow.aciklama);
        if (parsed.deger) deger = parsed.deger;
      } catch (e) {}
    }
    manuelMap[sRow.personel_no + '|' + gunStr] = deger;
  });

  function gunBilgi(personel_no, gun) {
    const tarihStr = tarihStrOlustur(yil, ay, gun);
    const key = personel_no + '|' + tarihStr;
    const man = manuelMap[key];

    if (man !== undefined && man !== null && man !== '') {
      if (man === '1') return { kod: '1', saat: 8, etiket: '8', aciklama: '8 Saat (Tam Gün)', tip: 'tam_gun', manuel: true };
      if (man === '0.5') return { kod: '0.5', saat: 4, etiket: '4', aciklama: '4 Saat (Yarım Gün)', tip: 'yarim_gun', manuel: true };
      if (man === 'I') return { kod: 'I', saat: 0, etiket: 'İ', aciklama: 'İzinli (İ)', tip: 'izin', manuel: true };
      if (man === 'R') return { kod: 'R', saat: 0, etiket: 'R', aciklama: 'Raporlu (R)', tip: 'rapor', manuel: true };
      if (man === 'P') return { kod: 'P', saat: 0, etiket: 'P', aciklama: 'Pazar / Tatil', tip: 'tatil', manuel: true };
      const sayi = Number(man);
      if (!isNaN(sayi) && sayi >= 0) {
        return {
          kod: man,
          saat: sayi,
          etiket: hucreSureFormatla(sayi),
          aciklama: sureFormatla(sayi) + ' (Özel Çalışma Saati)',
          tip: 'ozel_saat',
          manuel: true,
        };
      }
      return { kod: man, saat: 0, etiket: man, aciklama: man, tip: 'manuel', manuel: true };
    }

    const oto = Math.round((otomatikSaatMap[key] || 0) * 100) / 100;
    if (oto > 0) {
      return {
        kod: String(oto),
        saat: oto,
        etiket: hucreSureFormatla(oto),
        aciklama: sureFormatla(oto) + ' (Giriş / Çıkış Saati)',
        tip: 'otomatik',
        manuel: false,
      };
    }

    const haftaGunu = new Date(yil, ay - 1, gun).getDay();
    if (haftaGunu === 0 || haftaGunu === 6) {
      return { kod: 'P', saat: 0, etiket: 'P', aciklama: 'Hafta Sonu Tatili', tip: 'tatil', manuel: false };
    }

    return { kod: '', saat: 0, etiket: '·', aciklama: 'Boş Gün', tip: 'bos', manuel: false };
  }

  function gunKodu(personel_no, gun) {
    return gunBilgi(personel_no, gun).etiket;
  }

  function toplamCalisilanSaat(personel_no) {
    let toplam = 0;
    for (let gun = 1; gun <= gunSayisi; gun++) {
      toplam += gunBilgi(personel_no, gun).saat;
    }
    return Math.round(toplam * 100) / 100;
  }

  function calisilanGunSayisi(personel_no) {
    let gun = 0;
    for (let g = 1; g <= gunSayisi; g++) {
      if (gunBilgi(personel_no, g).saat > 0) gun++;
    }
    return gun;
  }

  return { gunSayisi, gunBilgi, gunKodu, toplamCalisilanSaat, calisilanGunSayisi, manuelMap, otomatikSaatMap };
}

async function aralikCalismaGunleriGetir(baslangicStr, bitisStr) {
  const b = new Date(baslangicStr);
  const s = new Date(bitisStr + 'T23:59:59');

  const [{ data: mesailer }, { data: manuelKayitlar }, { data: sahaManuelKayitlar }] = await Promise.all([
    supabase.from('giris_cikis').select('personel_no, giris_saati, sure_saat, durum')
      .gte('giris_saati', b.toISOString()).lte('giris_saati', s.toISOString()),
    supabase.from('puantaj_manuel').select('*').gte('tarih', baslangicStr).lte('tarih', bitisStr),
    supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PUANTAJ_MANUEL').gte('tarih', b.toISOString()).lte('tarih', s.toISOString()),
  ]);

  const otomatikSaatMap = {};
  (mesailer || []).forEach((m) => {
    const gunStr = new Date(m.giris_saati).toISOString().slice(0, 10);
    const key = m.personel_no + '|' + gunStr;
    otomatikSaatMap[key] = (otomatikSaatMap[key] || 0) + (Number(m.sure_saat) || 0);
  });

  const manuelMap = {};
  (manuelKayitlar || []).forEach((m) => {
    manuelMap[m.personel_no + '|' + m.tarih] = m.deger;
  });
  (sahaManuelKayitlar || []).forEach((sRow) => {
    const gunStr = new Date(sRow.tarih).toISOString().slice(0, 10);
    let deger = sRow.fis_no || String(sRow.miktar);
    if (sRow.aciklama) {
      try {
        const parsed = JSON.parse(sRow.aciklama);
        if (parsed.deger) deger = parsed.deger;
      } catch (e) {}
    }
    manuelMap[sRow.personel_no + '|' + gunStr] = deger;
  });

  function gunBilgiTarih(personel_no, tarihStr) {
    const key = personel_no + '|' + tarihStr;
    const man = manuelMap[key];

    if (man !== undefined && man !== null && man !== '') {
      if (man === '1') return { saat: 8, kod: '1' };
      if (man === '0.5') return { saat: 4, kod: '0.5' };
      if (man === 'I' || man === 'R' || man === 'P') return { saat: 0, kod: man };
      const sayi = Number(man);
      if (!isNaN(sayi) && sayi >= 0) return { saat: sayi, kod: man };
      return { saat: 0, kod: man };
    }

    const oto = Math.round((otomatikSaatMap[key] || 0) * 100) / 100;
    if (oto > 0) return { saat: oto, kod: String(oto) };
    return { saat: 0, kod: '' };
  }

  function toplamCalisilanSaat(personel_no) {
    let toplam = 0;
    for (let d = new Date(b); d <= s; d.setDate(d.getDate() + 1)) {
      const tStr = d.toISOString().slice(0, 10);
      toplam += gunBilgiTarih(personel_no, tStr).saat;
    }
    return Math.round(toplam * 100) / 100;
  }

  function calisilanGunSayisi(personel_no) {
    let gun = 0;
    for (let d = new Date(b); d <= s; d.setDate(d.getDate() + 1)) {
      const tStr = d.toISOString().slice(0, 10);
      if (gunBilgiTarih(personel_no, tStr).saat > 0) gun++;
    }
    return gun;
  }

  return { toplamCalisilanSaat, calisilanGunSayisi };
}

const GUN_KODU_SIRASI = [null, '1', '0.5', 'P', 'R', 'I'];
const GUN_KODU_ETIKET = { '1': '8 sa', '0.5': '4 sa', P: 'P', R: 'R', I: 'İ', '': '·' };
const HAFTA_KISALTMA = ['Paz', 'Pzt', 'Sal', 'Çrş', 'Prş', 'Cum', 'Cmt'];

/* ==================================================================
   FİNANS — Puantaj + Aylık Hakediş + Çalışma Defteri + Avans & Prim + Cari Ekstre
   ================================================================== */
function FinansTab() {
  const [altSekme, setAltSekme] = useState('puantaj');

  return (
    <div>
      <div className="tabbar" style={{ marginBottom: 14 }}>
        <button className={altSekme === 'puantaj' ? 'active-patron' : ''} onClick={() => setAltSekme('puantaj')}>
          🕒 Puantaj Matrisi (Saatlik)
        </button>
        <button className={altSekme === 'hakedis' ? 'active-patron' : ''} onClick={() => setAltSekme('hakedis')}>
          💰 Aylık Hakediş & Maaş Kapatma
        </button>
        <button className={altSekme === 'avans' ? 'active-patron' : ''} onClick={() => setAltSekme('avans')}>
          💵 Avans & Prim Yönetimi
        </button>
        <button className={altSekme === 'ekstre' ? 'active-patron' : ''} onClick={() => setAltSekme('ekstre')}>
          📄 Personel Cari Ekstresi
        </button>
      </div>
      {altSekme === 'puantaj' && <PuantajTab />}
      {altSekme === 'hakedis' && <HakedisTab />}
      {altSekme === 'avans' && <AvansPrimTab />}
      {altSekme === 'ekstre' && <PersonelCariEkstreTab />}
    </div>
  );
}

function puantajDuzenlemeKontrol(yil, ay, gun, patronKilitsiz = false) {
  if (patronKilitsiz) {
    return { izin: true, neden: null, kilitli: false };
  }

  const suan = new Date();
  const bugunTarih = new Date(suan.getFullYear(), suan.getMonth(), suan.getDate());
  const hedefTarih = new Date(yil, ay - 1, gun);
  
  const gunFarki = Math.round((bugunTarih - hedefTarih) / (1000 * 60 * 60 * 24));

  if (gunFarki < 0) {
    return {
      izin: false,
      neden: '⛔ Gelecek tarihler için önceden puantaj girilemez.',
      kilitli: true,
      tip: 'gelecek'
    };
  }

  if (gunFarki === 0) {
    const saat = suan.getHours();
    if (saat < 17) {
      return {
        izin: false,
        neden: '⏳ Bugünün mesaisi henüz tamamlanmadığı için mesai bitiminden (saat 17:00) önce bugünün puantajı girilemez.',
        kilitli: true,
        tip: 'bugun_erken'
      };
    }
  }

  if (gunFarki > 3) {
    return {
      izin: false,
      neden: '🔒 Güvenlik kuralı gereği 3 günden eski tarihli puantaj kayıtları geriye dönük değiştirilemez.',
      kilitli: true,
      tip: 'gecmis_kilit'
    };
  }

  return { izin: true, neden: null, kilitli: false };
}

/* ---------------- PUANTAJ (Saatlik Aylık Matris & Seçim Kutusu) ---------------- */
function PuantajTab() {
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [personelListesi, setPersonelListesi] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gunSayisi, setGunSayisi] = useState(30);
  const [gunBilgiFn, setGunBilgiFn] = useState(null);
  const [toplamSaatFn, setToplamSaatFn] = useState(null);
  const [calisilanGunFn, setCalisilanGunFn] = useState(null);
  const [fazlaMesaiMap, setFazlaMesaiMap] = useState({});
  const [kaydedilenFazlaMesai, setKaydedilenFazlaMesai] = useState({});
  const [guncelleniyor, setGuncelleniyor] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [yoneticiKilitsiz, setYoneticiKilitsiz] = useState(false);

  // SEÇİM POPOVER MODAL STATE
  const [seciliHucre, setSeciliHucre] = useState(null);
  const [ozelSaatGirdi, setOzelSaatGirdi] = useState('');
  const [ozlukMap, setOzlukMap] = useState({});

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: personel }, { data: ozlukList }] = await Promise.all([
      supabase.from('personel').select('personel_no, ad, rol, gunluk_ucret').neq('rol', 'patron').order('ad'),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK'),
    ]);
    setPersonelListesi(personel || []);

    const oMap = {};
    (ozlukList || []).forEach((row) => {
      if (!oMap[row.personel_no]) {
        try { oMap[row.personel_no] = JSON.parse(row.aciklama || '{}'); } catch (e) { oMap[row.personel_no] = {}; }
      }
    });
    setOzlukMap(oMap);

    const { gunSayisi: gs, gunBilgi, toplamCalisilanSaat, calisilanGunSayisi } = await ayVerileriniGetir(yil, ay);
    setGunSayisi(gs);
    setGunBilgiFn(() => gunBilgi);
    setToplamSaatFn(() => toplamCalisilanSaat);
    setCalisilanGunFn(() => calisilanGunSayisi);

    const { data: fm } = await supabase.from('aylik_fazla_mesai').select('*').eq('yil', yil).eq('ay', ay);
    const fmMap = {};
    (fm || []).forEach((f) => { fmMap[f.personel_no] = String(f.saat); });
    setFazlaMesaiMap(fmMap);
    setKaydedilenFazlaMesai(fmMap);

    setYukleniyor(false);
  }, [yil, ay]);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  // Hücreye tıklandığında Seçim Kutusu Aç
  function hucreSec(p, gun) {
    const kontrol = puantajDuzenlemeKontrol(yil, ay, gun, yoneticiKilitsiz);
    if (!kontrol.izin) {
      setMesaj({ tip: 'err', metin: kontrol.neden });
      return;
    }

    setMesaj(null);
    const tarihStr = tarihStrOlustur(yil, ay, gun);
    const bilgi = gunBilgiFn ? gunBilgiFn(p.personel_no, gun) : { kod: '', saat: 0 };
    setOzelSaatGirdi(bilgi.saat > 0 ? String(bilgi.saat) : '');
    setSeciliHucre({
      personel_no: p.personel_no,
      ad: p.ad,
      gun,
      tarihStr,
      mevcutBilgi: bilgi,
    });
  }

  // Seçilen değeri veritabanına kaydet
  async function degerKaydet(deger) {
    if (!seciliHucre) return;
    if (typeof document !== 'undefined' && document.activeElement) {
      try { document.activeElement.blur(); } catch (e) {}
    }
    const { personel_no, gun, tarihStr, ad } = seciliHucre;
    setGuncelleniyor(personel_no + '|' + gun);
    setSeciliHucre(null);

    try {
      if (deger === null) {
        await Promise.all([
          supabase.from('puantaj_manuel').delete().eq('personel_no', personel_no).eq('tarih', tarihStr),
          supabase.from('saha_verileri').delete().eq('kalem_turu', 'PUANTAJ_MANUEL').eq('personel_no', personel_no).gte('tarih', tarihStr + 'T00:00:00').lte('tarih', tarihStr + 'T23:59:59'),
        ]);
      } else {
        const valStr = String(deger).trim();
        const sayi = Number(valStr);
        const miktar = !isNaN(sayi) ? sayi : (valStr === '1' ? 8 : (valStr === '0.5' ? 4 : 0));

        await supabase.from('saha_verileri').delete().eq('kalem_turu', 'PUANTAJ_MANUEL').eq('personel_no', personel_no).gte('tarih', tarihStr + 'T00:00:00').lte('tarih', tarihStr + 'T23:59:59');

        const { error: insErr } = await supabase.from('saha_verileri').insert({
          personel_no,
          ad: ad || personel_no,
          lokasyon: 'Merkez',
          tarih: tarihStr + 'T12:00:00Z',
          kalem_turu: 'PUANTAJ_MANUEL',
          miktar: miktar,
          birim_fiyat: 0,
          toplam: 0,
          islem_turu: 'harcama',
          fis_no: valStr,
          aciklama: JSON.stringify({ deger: valStr, saat: miktar, tip: isNaN(sayi) ? 'kod' : 'ozel_saat' }),
        });
        if (insErr) throw insErr;

        if (['1', '0.5', 'P', 'R', 'I'].includes(valStr)) {
          await supabase.from('puantaj_manuel').upsert(
            { personel_no, tarih: tarihStr, deger: valStr },
            { onConflict: 'personel_no,tarih' }
          );
        } else {
          await supabase.from('puantaj_manuel').delete().eq('personel_no', personel_no).eq('tarih', tarihStr);
        }
      }
      await veriyiYukle();
    } catch (err) {
      console.error('Puantaj kayıt hatası:', err);
      alert('Puantaj kaydedilirken hata oluştu: ' + (err.message || err));
    } finally {
      setGuncelleniyor(null);
    }
  }

  function fazlaMesaiDegistir(personel_no, deger) {
    setFazlaMesaiMap((onceki) => ({ ...onceki, [personel_no]: deger }));
  }

  async function fazlaMesaiKaydet(personel_no) {
    const saat = Number(fazlaMesaiMap[personel_no]);
    if (Number.isNaN(saat) || saat < 0) return;
    await supabase.from('aylik_fazla_mesai').upsert(
      { personel_no, yil, ay, saat },
      { onConflict: 'personel_no,yil,ay' }
    );
    setKaydedilenFazlaMesai((onceki) => ({ ...onceki, [personel_no]: String(saat) }));
    setMesaj({ tip: 'ok', metin: 'Fazla mesai saati kaydedildi.' });
  }

  function disaAktar() {
    if (!gunBilgiFn || !toplamSaatFn || !calisilanGunFn) return;
    const satirlar = personelListesi.map((p) => {
      const satir = { 'Personel': p.ad, 'Personel No': p.personel_no, 'Görevi': p.rol, 'Saatlik Ücret (PLN)': p.gunluk_ucret };
      for (let gun = 1; gun <= gunSayisi; gun++) {
        satir[String(gun)] = gunBilgiFn(p.personel_no, gun).etiket;
      }
      satir['Toplam Çalışılan Süre'] = sureFormatla(toplamSaatFn(p.personel_no));
      satir['Çalışılan Gün'] = calisilanGunFn(p.personel_no);
      satir['Fazla Mesai (Saat)'] = Number(kaydedilenFazlaMesai[p.personel_no]) || 0;
      return satir;
    });
    excelIndir(satirlar, 'saatlik-puantaj-' + yil + '-' + String(ay).padStart(2, '0') + '.xlsx');
  }

  const ayAdlari = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 className="section" style={{ margin: 0 }}>🕒 Aylık Saatlik Puantaj Matrisi</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
            Sistem personelin giriş-çıkış saatlerini anlık hesaplar. Düzenlemek istediğiniz güne <b>tıklayarak seçim kutusundan</b> saati veya durumu tek tıkla belirleyebilirsiniz.
          </div>
        </div>
        <button
          className="action btn-secondary"
          style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 11, background: yoneticiKilitsiz ? 'rgba(220, 38, 38, 0.15)' : 'transparent', color: yoneticiKilitsiz ? '#ef4444' : 'var(--ink)' }}
          onClick={() => setYoneticiKilitsiz(!yoneticiKilitsiz)}
          title="Patron / Yönetici Kilit Durumu"
        >
          {yoneticiKilitsiz ? '🔓 Yönetici Kilidi Açık (Serbest Düzenleme)' : '🔒 Güvenlik Kilidi Aktif (Kural Geçerli)'}
        </button>
      </div>

      <div className="grid cols-3" style={{ marginTop: 12 }}>
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
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="action btn-secondary" style={{ margin: 0 }} onClick={disaAktar} disabled={yukleniyor}>
            📊 Excel Aktar
          </button>
        </div>
      </div>

      {/* PUANTAJ AYLIK ÖZET İSTATİSTİK KARTLARI */}
      {toplamSaatFn && !yukleniyor && (
        <div className="grid cols-3" style={{ marginTop: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div className="stat-card">
            <div className="label">Aylık Toplam Çalışma Süresi</div>
            <div className="value" style={{ color: 'var(--accent-patron)' }}>
              {sureFormatla(personelListesi.reduce((acc, p) => acc + (toplamSaatFn(p.personel_no) || 0), 0))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Tüm ekibin net mesai süresi</div>
          </div>
          <div className="stat-card" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: '#f59e0b' }}>
            <div className="label" style={{ color: '#d97706' }}>⚡ Aylık Toplam Fazla Mesai (FM)</div>
            <div className="value" style={{ color: '#b45309' }}>
              {personelListesi.reduce((acc, p) => acc + (Number(kaydedilenFazlaMesai[p.personel_no]) || 0), 0)} saat
            </div>
            <div style={{ fontSize: 11, color: '#d97706' }}>1.5x katsayı ile hakedişe yansıyan süre</div>
          </div>
          <div className="stat-card">
            <div className="label">Aktif Personel Sayısı</div>
            <div className="value" style={{ color: '#16a34a' }}>
              {personelListesi.filter(p => !ozlukMap[p.personel_no]?.durum || ozlukMap[p.personel_no]?.durum === 'Aktif').length} kişi
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Puantajdaki toplam çalışan</div>
          </div>
        </div>
      )}

      {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginTop: 10 }}>{mesaj.metin}</div>}

      {yukleniyor || !gunBilgiFn ? (
        <div style={{ marginTop: 14, color: 'var(--ink-soft)' }}>Saatlik puantaj verileri yükleniyor...</div>
      ) : (
        <div className="table-scroll-container">
          <table style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th className="sticky-col-header" style={{ minWidth: 140, textAlign: 'left' }}>Personel</th>
                {Array.from({ length: gunSayisi }, (_, i) => i + 1).map((gun) => {
                  const kontrol = puantajDuzenlemeKontrol(yil, ay, gun, yoneticiKilitsiz);
                  return (
                    <th
                      key={gun}
                      style={{
                        padding: '3px 4px', textAlign: 'center', minWidth: 28,
                        background: kontrol.kilitli ? 'rgba(0,0,0,0.03)' : 'rgba(34,197,94,0.08)',
                      }}
                      title={kontrol.kilitli ? kontrol.neden : 'Düzenlenebilir Gün'}
                    >
                      <div>{gun}</div>
                      <div style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: 10 }}>{HAFTA_KISALTMA[new Date(yil, ay - 1, gun).getDay()]}</div>
                    </th>
                  );
                })}
                <th style={{ padding: '3px 8px', background: 'var(--accent-patron-soft)', color: 'var(--accent-patron)', fontWeight: 800 }}>Toplam Süre</th>
                <th style={{ padding: '3px 6px' }}>Çalışılan Gün</th>
                <th style={{ padding: '3px 8px', background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', fontWeight: 800 }}>⚡ Fazla Mesai (FM)</th>
              </tr>
            </thead>
            <tbody>
              {personelListesi.map((p) => {
                const toplamSaat = toplamSaatFn ? toplamSaatFn(p.personel_no) : 0;
                const calisilanGun = calisilanGunFn ? calisilanGunFn(p.personel_no) : 0;
                const o = ozlukMap[p.personel_no] || {};
                const ayrildiMi = o.durum === 'Ayrıldı' || !!o.isten_ayrilis_tarihi;
                const fmSaati = Number(kaydedilenFazlaMesai[p.personel_no]) || 0;

                return (
                  <tr key={p.personel_no}>
                    <td className="sticky-col-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="personel-name" title={p.ad}>{p.ad}</span>
                        {ayrildiMi && (
                          <span style={{ fontSize: 8, background: 'rgba(220, 38, 38, 0.15)', color: '#ef4444', padding: '1px 3px', borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                            A
                          </span>
                        )}
                      </div>
                      <div className="personel-sub">
                        {p.gunluk_ucret || 0} zł/sa
                      </div>
                    </td>
                    {Array.from({ length: gunSayisi }, (_, i) => i + 1).map((gun) => {
                      const bilgi = gunBilgiFn(p.personel_no, gun);
                      const meskul = guncelleniyor === p.personel_no + '|' + gun;
                      const kontrol = puantajDuzenlemeKontrol(yil, ay, gun, yoneticiKilitsiz);
                      const isCalisma = bilgi.saat > 0;
                      const isFazlaMesaiGun = bilgi.saat > 8;

                      return (
                        <td
                          key={gun}
                          onClick={() => hucreSec(p, gun)}
                          title={bilgi.aciklama || (kontrol.kilitli ? kontrol.neden : 'Saat / Durum seçmek için tıklayın')}
                          style={{
                            textAlign: 'center',
                            cursor: kontrol.kilitli ? 'not-allowed' : 'pointer',
                            padding: '4px 2px', borderRadius: 4,
                            background: isFazlaMesaiGun
                              ? 'rgba(245, 158, 11, 0.25)'
                              : isCalisma
                              ? 'rgba(34,197,94,0.18)'
                              : (bilgi.tip === 'izin' || bilgi.tip === 'rapor')
                              ? 'rgba(220,38,38,0.14)'
                              : bilgi.tip === 'tatil'
                              ? 'rgba(127,127,127,0.12)'
                              : 'transparent',
                            fontWeight: isCalisma ? 700 : 400,
                            color: isFazlaMesaiGun ? '#b45309' : isCalisma ? '#16a34a' : 'inherit',
                            opacity: meskul ? 0.4 : (kontrol.kilitli ? 0.75 : 1),
                            outline: isFazlaMesaiGun ? '1px solid #f59e0b' : !kontrol.kilitli ? '1px dashed rgba(34,197,94,0.45)' : 'none',
                          }}
                        >
                          {bilgi.etiket}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, color: 'var(--accent-patron)', background: 'var(--accent-patron-soft)', whiteSpace: 'nowrap' }}>
                      {sureFormatla(toplamSaat)}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{calisilanGun} gün</td>
                    <td style={{ textAlign: 'center', background: fmSaati > 0 ? 'rgba(245, 158, 11, 0.08)' : 'transparent' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="number" step="0.5" value={fazlaMesaiMap[p.personel_no] ?? ''}
                          onChange={(e) => fazlaMesaiDegistir(p.personel_no, e.target.value)}
                          placeholder="0"
                          style={{ width: 50, padding: '3px 4px', fontSize: 11, fontWeight: fmSaati > 0 ? 800 : 400, color: fmSaati > 0 ? '#b45309' : 'inherit', textAlign: 'center' }}
                        />
                        <button
                          className="action btn-secondary"
                          style={{ width: 'auto', margin: 0, padding: '3px 6px', fontSize: 10, background: '#f59e0b', color: '#fff', border: 'none' }}
                          onClick={() => fazlaMesaiKaydet(p.personel_no)}
                          title="Fazla Mesaiyi Kaydet"
                        >
                          ✓
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {personelListesi.length === 0 && (
                <tr><td colSpan={gunSayisi + 4} style={{ color: 'var(--ink-soft)', padding: 10 }}>Henüz kayıtlı personel bulunmuyor.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>🟢 <b>8 sa / 4 sa:</b> Normal Mesai</span>
            <span>🟠 <b style={{ color: '#b45309' }}>9.5 sa / 10 sa:</b> Günlük Fazla Mesai (&gt;8 sa)</span>
            <span>⚡ <b style={{ color: '#b45309' }}>FM Sütunu:</b> Aylık Hakedişe 1.5x Eklenen Fazla Mesai Saati</span>
            <span>🏖️ <b>İ:</b> İzinli</span>
            <span>🏥 <b>R:</b> Raporlu</span>
            <span>🔴 <b>P:</b> Pazar/Tatil</span>
          </div>
        </div>
      )}

      {/* 🎯 ETKİLEŞİMLİ PUANTAJ SEÇİM MODAL / POPOVER */}
      {seciliHucre && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
          onClick={() => setSeciliHucre(null)}
        >
          <div
            style={{
              background: 'var(--card)', borderRadius: 14, padding: '22px', maxWidth: 440, width: '100%',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)', border: '1px solid var(--border)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{seciliHucre.ad}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                  📅 {seciliHucre.gun} {ayAdlari[ay - 1]} {yil} ({HAFTA_KISALTMA[new Date(yil, ay - 1, seciliHucre.gun).getDay()]})
                </div>
              </div>
              <button onClick={() => setSeciliHucre(null)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>

            <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              ⚡ Tek Tıkla Durum & Saat Seçin:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => degerKaydet('1')}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🟢 Tam Gün (8 Saat)
              </button>
              <button
                type="button"
                onClick={() => degerKaydet('0.5')}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.15)', color: '#ca8a04', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🟡 Yarım Gün (4 Saat)
              </button>
              <button
                type="button"
                onClick={() => degerKaydet('I')}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.12)', color: '#2563eb', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🏖️ İzinli (İ)
              </button>
              <button
                type="button"
                onClick={() => degerKaydet('R')}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.12)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🏥 Raporlu (R)
              </button>
              <button
                type="button"
                onClick={() => degerKaydet('P')}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(127,127,127,0.12)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🔴 Pazar / Tatil (P)
              </button>
              <button
                type="button"
                onClick={() => degerKaydet(null)}
                style={{ padding: '12px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--ink-soft)', fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontSize: 12 }}
              >
                🔄 Otomatik Giriş/Çıkışa Dön
              </button>
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <label htmlFor="ozel_calisma_saati" style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                ⏱️ Özel Çalışma Saati Belirle:
              </label>

              {/* Hızlı Saat Butonları */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {['6', '7.5', '9', '9.5', '10', '11', '12'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => degerKaydet(s)}
                    style={{
                      padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'var(--bg-soft)', color: 'var(--ink)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    +{s} sa
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (ozelSaatGirdi !== '') degerKaydet(ozelSaatGirdi);
                }}
                autoComplete="off"
                data-lpignore="true"
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  id="ozel_calisma_saati"
                  name="ozel_calisma_saati"
                  placeholder="Manuel saat yazın (örn. 9.5)"
                  value={ozelSaatGirdi}
                  onChange={(e) => setOzelSaatGirdi(e.target.value.replace(',', '.'))}
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  spellCheck="false"
                  style={{ margin: 0 }}
                />
                <button
                  type="submit"
                  className="action btn-punch"
                  style={{ width: 'auto', margin: 0, padding: '8px 18px', fontSize: 13 }}
                >
                  Uygula
                </button>
              </form>
            </div>
          </div>
        </div>
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

/* ---------------- AYLIK PERSONEL HAKEDİŞİ & MAAŞ KAPATMA ---------------- */
function HakedisTab() {
  const now = new Date();
  const [yil, setYil] = useState(now.getFullYear());
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [satirlar, setSatirlar] = useState([]);
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);

  const ayAdlari = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const [ozlukMapState, setOzlukMapState] = useState({});

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    const ayBasi = new Date(yil, ay - 1, 1);
    const aySonu = new Date(yil, ay, 0, 23, 59, 59);

    const [{ data: personel }, { toplamCalisilanSaat, calisilanGunSayisi }, { data: fm }, { data: masraflar }, { data: ozlukList }] = await Promise.all([
      supabase.from('personel').select('personel_no, ad, rol, gunluk_ucret').neq('rol', 'patron').order('ad'),
      ayVerileriniGetir(yil, ay),
      supabase.from('aylik_fazla_mesai').select('*').eq('yil', yil).eq('ay', ay),
      supabase.from('saha_verileri').select('*').gte('tarih', ayBasi.toISOString()).lte('tarih', aySonu.toISOString()),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK').order('tarih', { ascending: false }),
    ]);

    const oMap = {};
    (ozlukList || []).forEach((row) => {
      if (!oMap[row.personel_no]) {
        try { oMap[row.personel_no] = JSON.parse(row.aciklama || '{}'); } catch (e) { oMap[row.personel_no] = {}; }
      }
    });
    setOzlukMapState(oMap);

    const fmMap = {};
    (fm || []).forEach((f) => { fmMap[f.personel_no] = Number(f.saat) || 0; });

    const hesaplanan = (personel || []).map((p) => {
      const saatlikUcret = Number(p.gunluk_ucret) || 0;
      const calisilanSaat = toplamCalisilanSaat(p.personel_no);
      const calisilanGun = calisilanGunSayisi(p.personel_no);
      const fmSaat = fmMap[p.personel_no] || 0;
      const hakedisTutari = (calisilanSaat * saatlikUcret) + (fmSaat * (saatlikUcret * 1.5));

      const kendiMasraflar = (masraflar || []).filter((m) => m.personel_no === p.personel_no);
      const toplamMasraf = kendiMasraflar.filter((m) => getIslemKategori(m) === 'harcama').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamAvans = kendiMasraflar.filter((m) => getIslemKategori(m) === 'avans').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamPrim = kendiMasraflar.filter((m) => getIslemKategori(m) === 'prim').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamKesinti = kendiMasraflar.filter((m) => getIslemKategori(m) === 'kesinti').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const odenmisMaas = kendiMasraflar.filter((m) => getIslemKategori(m) === 'maas_odeme').reduce((a, m) => a + (Number(m.toplam) || 0), 0);

      const netOdenecek = hakedisTutari + toplamMasraf + toplamPrim - toplamAvans - toplamKesinti - odenmisMaas;

      return {
        personel_no: p.personel_no, ad: p.ad, rol: p.rol, saatlikUcret,
        calisilanSaat, calisilanGun, fmSaat, hakedisTutari, toplamMasraf, toplamAvans, toplamPrim, toplamKesinti, odenmisMaas, netOdenecek,
      };
    });

    setSatirlar(hesaplanan);
    setYukleniyor(false);
  }, [yil, ay]);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  async function maasKapat(satir) {
    if (satir.netOdenecek <= 0) {
      alert('Bu personelin ödenecek bakiye tutarı bulunmuyor.');
      return;
    }
    const onay = confirm(`${satir.ad} adlı personele ${formatPLN(satir.netOdenecek)} tutarındaki maaş ödemesini yapmak ve dönemi kapatmak istediğinize emin misiniz?`);
    if (!onay) return;

    setIslemYapiliyor(true);
    const { error } = await supabase.from('saha_verileri').insert({
      personel_no: satir.personel_no,
      ad: satir.ad,
      lokasyon: 'Merkez Kasa',
      kalem_turu: `${yil} / ${ayAdlari[ay - 1]} Maaş Ödemesi`,
      miktar: 1,
      birim_fiyat: satir.netOdenecek,
      toplam: satir.netOdenecek,
      islem_turu: 'maas_odeme',
      aciklama: `${ayAdlari[ay - 1]} ${yil} dönemi net maaş ödemesi yapıldı ve hesap kapatıldı. (${satir.calisilanSaat} sa çalışma)`,
    });

    setIslemYapiliyor(false);
    if (error) {
      alert('Ödeme kaydedilemedi: ' + error.message);
      return;
    }
    alert('Maaş ödemesi kaydedildi!');
    veriyiYukle();
  }

  function bordroPdfIndir(s) {
    const o = ozlukMapState[s.personel_no] || {};
    detayliBordroPdfOlustur({
      personelNo: s.personel_no,
      ad: s.ad,
      rol: s.rol,
      gunlukUcret: s.saatlikUcret,
      calisilanSaat: s.calisilanSaat,
      calisilanGun: s.calisilanGun,
      fmSaat: s.fmSaat,
      hakedisTutari: s.hakedisTutari,
      toplamMasraf: s.toplamMasraf,
      toplamPrim: s.toplamPrim,
      toplamAvans: s.toplamAvans,
      toplamKesinti: s.toplamKesinti,
      odenmisMaas: s.odenmisMaas,
      netOdenecek: s.netOdenecek,
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

  function disaAktar() {
    excelIndir(
      satirlar.map((s) => ({
        Personel: s.ad, Görevi: s.rol, 'Saatlik Ücret (PLN)': s.saatlikUcret, 'Çalışılan Süre': sureFormatla(s.calisilanSaat), 'Çalışılan Gün': s.calisilanGun,
        'FM Saati': s.fmSaat, 'Hakediş Tutarı': s.hakedisTutari.toFixed(2), 'Toplam Masraf': s.toplamMasraf.toFixed(2),
        'Toplam Prim': s.toplamPrim.toFixed(2), 'Toplam Avans': s.toplamAvans.toFixed(2), 'Toplam Kesinti': s.toplamKesinti.toFixed(2),
        'Ödenen Maaş': s.odenmisMaas.toFixed(2), 'Kalan Net Ödenecek': s.netOdenecek.toFixed(2),
      })),
      'aylik-hakedis-' + yil + '-' + String(ay).padStart(2, '0') + '.xlsx'
    );
  }

  const genelHakedis = satirlar.reduce((a, s) => a + s.hakedisTutari, 0);
  const genelMasraf = satirlar.reduce((a, s) => a + s.toplamMasraf, 0);
  const genelPrim = satirlar.reduce((a, s) => a + s.toplamPrim, 0);
  const genelAvans = satirlar.reduce((a, s) => a + s.toplamAvans, 0);
  const genelKesinti = satirlar.reduce((a, s) => a + s.toplamKesinti, 0);
  const genelNet = satirlar.reduce((a, s) => a + s.netOdenecek, 0);

  return (
    <div className="card">
      <h2 className="section">💰 Aylık Hakediş ve Maaş Kapatma Tablosu</h2>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, marginBottom: 10 }}>
        Saatlik Hakediş = <b>(Toplam Çalışılan Saat × Saatlik Ücret)</b> + Fazla Mesai × (Saatlik Ücret × 1.5).
        <br />
        <b>Net Ödenecek</b> = (Brüt Saatlik Hakediş + Şantiye Harcaması + Prim) − (Avans + Maaş Kesintisi + Önceden Ödenen Maaş).
      </div>
      <div className="grid cols-2">
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

      <button className="action btn-secondary" onClick={disaAktar} disabled={yukleniyor || !satirlar.length}>📊 Excel Bordro İndir</button>

      <div className="grid cols-4" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div className="stat-card"><div className="label">Toplam Brüt Hakediş</div><div className="value">{formatPLN(genelHakedis)}</div></div>
        <div className="stat-card"><div className="label">Şantiye Masrafı (+)</div><div className="value" style={{ color: '#16a34a' }}>+{formatPLN(genelMasraf)}</div></div>
        <div className="stat-card"><div className="label">Toplam Prim (+)</div><div className="value" style={{ color: '#16a34a' }}>+{formatPLN(genelPrim)}</div></div>
        <div className="stat-card"><div className="label">Verilen Avanslar (-)</div><div className="value" style={{ color: '#dc2626' }}>-{formatPLN(genelAvans)}</div></div>
        <div className="stat-card"><div className="label">Maaş Kesintileri (-)</div><div className="value" style={{ color: '#dc2626' }}>-{formatPLN(genelKesinti)}</div></div>
        <div className="stat-card" style={{ background: 'var(--accent-patron-soft)', borderColor: 'var(--accent-patron)' }}>
          <div className="label" style={{ color: 'var(--accent-patron)' }}>Şirket Net Kalan Borcu</div>
          <div className="value" style={{ color: 'var(--accent-patron)' }}>{formatPLN(genelNet)}</div>
        </div>
      </div>

      {yukleniyor ? (
        <div style={{ marginTop: 14, color: 'var(--ink-soft)' }}>Yükleniyor...</div>
      ) : (
        <div className="table-scroll-container">
          <table>
            <thead>
              <tr>
                <th className="sticky-col-header" style={{ minWidth: 150 }}>Personel</th>
                <th>Görevi</th><th>Saatlik (PLN)</th><th>Çalışılan Süre</th><th>Çalışılan Gün</th><th>FM</th>
                <th>Brüt Hakediş</th><th>Masraf (+)</th><th>Prim (+)</th><th>Avans (-)</th><th>Kesinti (-)</th><th>Net Kalan Maaş</th>
                <th style={{ minWidth: 165 }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr key={s.personel_no}>
                  <td className="sticky-col-cell">
                    <span className="personel-name" title={s.ad}>{s.ad}</span>
                    <div className="personel-sub">{s.personel_no} · {s.rol}</div>
                  </td>
                  <td>{s.rol}</td>
                  <td>{formatPLN(s.saatlikUcret)}/sa</td>
                  <td><b style={{ color: 'var(--accent-patron)', fontSize: 13 }}>{sureFormatla(s.calisilanSaat)}</b></td>
                  <td><b>{s.calisilanGun}</b> gün</td>
                  <td>{s.fmSaat > 0 ? `${s.fmSaat} sa` : '—'}</td>
                  <td><b>{formatPLN(s.hakedisTutari)}</b></td>
                  <td style={{ color: '#16a34a' }}>{s.toplamMasraf > 0 ? `+${formatPLN(s.toplamMasraf)}` : '—'}</td>
                  <td style={{ color: '#16a34a', fontWeight: s.toplamPrim > 0 ? 700 : 400 }}>{s.toplamPrim > 0 ? `+${formatPLN(s.toplamPrim)}` : '—'}</td>
                  <td style={{ color: '#dc2626', fontWeight: s.toplamAvans > 0 ? 700 : 400 }}>{s.toplamAvans > 0 ? `-${formatPLN(s.toplamAvans)}` : '—'}</td>
                  <td style={{ color: '#dc2626' }}>{s.toplamKesinti > 0 ? `-${formatPLN(s.toplamKesinti)}` : '—'}</td>
                  <td style={{ fontWeight: 800, fontSize: 14, color: s.netOdenecek > 0 ? 'var(--ink)' : 'var(--ink-soft)' }}>
                    {formatPLN(s.netOdenecek)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 160 }}>
                      <button
                        type="button"
                        className="action btn-secondary"
                        style={{ width: '68px', height: '28px', margin: 0, padding: '0 6px', fontSize: '11.5px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => bordroPdfIndir(s)}
                        title="Bordro PDF İndir"
                      >
                        Bordro
                      </button>
                      {s.netOdenecek > 0 && (
                        <button
                          type="button"
                          className="action btn-punch"
                          style={{ width: '80px', height: '28px', margin: 0, padding: '0 6px', fontSize: '11.5px', fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          onClick={() => maasKapat(s)}
                          disabled={islemYapiliyor}
                        >
                          Maaş Öde
                        </button>
                      )}
                      {s.netOdenecek <= 0 && s.odenmisMaas > 0 && (
                        <span className="status-tag open" style={{ width: '80px', height: '28px', margin: 0, padding: '0 6px', fontSize: '11.5px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                          Ödendi
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {satirlar.length === 0 && (
                <tr><td colSpan={13} style={{ color: 'var(--ink-soft)', padding: 10 }}>Henüz kayıtlı personel bulunmuyor.</td></tr>
              )}
            </tbody>
            {satirlar.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--bg-soft)' }}>
                  <td colSpan={5}>GENEL TOPLAM</td>
                  <td>{formatPLN(genelHakedis)}</td>
                  <td style={{ color: '#16a34a' }}>+{formatPLN(genelMasraf)}</td>
                  <td style={{ color: '#16a34a' }}>+{formatPLN(genelPrim)}</td>
                  <td style={{ color: '#dc2626' }}>-{formatPLN(genelAvans)}</td>
                  <td style={{ color: '#dc2626' }}>-{formatPLN(genelKesinti)}</td>
                  <td style={{ color: 'var(--accent-patron)', fontSize: 15 }}>{formatPLN(genelNet)}</td>
                  <td>—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- AVANS & PRİM YÖNETİMİ ---------------- */
function AvansPrimTab() {
  const [personeller, setPersoneller] = useState([]);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [kayitlar, setKayitlar] = useState([]);
  const [seciliPersonelNo, setSeciliPersonelNo] = useState('');
  const [islemTuru, setIslemTuru] = useState('avans');
  const [tutar, setTutar] = useState('');
  const [lokasyon, setLokasyon] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [filtrePersonel, setFiltrePersonel] = useState('Tümü');
  const [mesaj, setMesaj] = useState(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: p }, { data: l }, { data: k }] = await Promise.all([
      supabase.from('personel').select('*').neq('rol', 'patron').order('ad'),
      supabase.from('lokasyonlar').select('*'),
      supabase.from('saha_verileri').select('*').order('tarih', { ascending: false }),
    ]);

    setPersoneller(p || []);
    setLokasyonlar(l || []);
    setKayitlar(k || []);

    if (p && p.length && !seciliPersonelNo) {
      setSeciliPersonelNo(p[0].personel_no);
    }
    if (l && l.length && !lokasyon) {
      setLokasyon(l[0].ad);
    }
    setYukleniyor(false);
  }, [seciliPersonelNo, lokasyon]);

  useEffect(() => { yukle(); }, [yukle]);

  async function avansKaydet(e) {
    e.preventDefault();
    setMesaj(null);
    const tutarSayi = Number(tutar);
    if (!tutarSayi || tutarSayi <= 0) {
      setMesaj({ tip: 'err', metin: 'Lütfen geçerli bir tutar girin.' });
      return;
    }
    const seciliP = personeller.find((p) => p.personel_no === seciliPersonelNo);
    if (!seciliP) {
      setMesaj({ tip: 'err', metin: 'Lütfen bir personel seçin.' });
      return;
    }

    setKaydediliyor(true);
    let dbIslemTuru = 'avans';
    let turEtiketi = 'Avans Ödemesi';

    if (islemTuru === 'avans') {
      dbIslemTuru = 'avans';
      turEtiketi = 'Avans Ödemesi';
    } else if (islemTuru === 'prim') {
      dbIslemTuru = 'harcama';
      turEtiketi = 'Prim / İkramiye';
    } else if (islemTuru === 'kesinti') {
      dbIslemTuru = 'avans';
      turEtiketi = 'Maaş Kesintisi';
    }

    const { error } = await supabase.from('saha_verileri').insert({
      personel_no: seciliP.personel_no,
      ad: seciliP.ad,
      lokasyon: lokasyon || 'Merkez Kasa',
      kalem_turu: turEtiketi,
      miktar: 1,
      birim_fiyat: tutarSayi,
      toplam: tutarSayi,
      islem_turu: dbIslemTuru,
      fis_no: belgeNo.trim() || null,
      aciklama: aciklama.trim() || null,
    });

    setKaydediliyor(false);
    if (error) {
      setMesaj({ tip: 'err', metin: 'Kayıt başarısız: ' + error.message });
      return;
    }
    setMesaj({ tip: 'ok', metin: `${seciliP.ad} için ${formatPLN(tutarSayi)} tutarında ${turEtiketi} kaydedildi.` });
    setTutar(''); setBelgeNo(''); setAciklama('');
    yukle();
  }

  async function kayitSil(id) {
    if (!confirm('Bu finansal kaydı silmek istediğinize emin misiniz?')) return;
    await supabase.from('saha_verileri').delete().eq('id', id);
    yukle();
  }

  const gosterilenler = (kayitlar || []).filter((k) => {
    const kat = getIslemKategori(k);
    if (kat === 'bilgi_kaydi' || kat === 'harcama') return false;
    return (filtrePersonel === 'Tümü' || k.personel_no === filtrePersonel);
  });

  const toplamAvansTutar = gosterilenler.filter((k) => getIslemKategori(k) === 'avans').reduce((a, k) => a + (Number(k.toplam) || 0), 0);
  const toplamPrimTutar = gosterilenler.filter((k) => getIslemKategori(k) === 'prim').reduce((a, k) => a + (Number(k.toplam) || 0), 0);

  return (
    <div className="grid cols-2">
      {/* YENİ AVANS / PRİM GİRİŞ FORMU */}
      <div className="card">
        <h2 className="section">💵 Yeni Avans / Prim / Kesinti Kaydı</h2>
        <form onSubmit={avansKaydet}>
          <label>Personel Seçiniz</label>
          <select value={seciliPersonelNo} onChange={(e) => setSeciliPersonelNo(e.target.value)}>
            {personeller.map((p) => (
              <option key={p.personel_no} value={p.personel_no}>{p.ad} ({p.rol})</option>
            ))}
          </select>

          <label style={{ marginTop: 12 }}>İşlem Türü</label>
          <div className="chip-row">
            <span className={'chip' + (islemTuru === 'avans' ? ' sel' : '')} onClick={() => setIslemTuru('avans')}>
              💵 Avans (-)
            </span>
            <span className={'chip' + (islemTuru === 'prim' ? ' sel' : '')} onClick={() => setIslemTuru('prim')}>
              🎁 Prim (+)
            </span>
            <span className={'chip' + (islemTuru === 'kesinti' ? ' sel' : '')} onClick={() => setIslemTuru('kesinti')}>
              ⚠️ Kesinti (-)
            </span>
          </div>

          <label style={{ marginTop: 12 }}>Tutar (PLN)</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            required
          />

          <label>Ödemenin Yapıldığı Şantiye / Kasa</label>
          <select value={lokasyon} onChange={(e) => setLokasyon(e.target.value)}>
            <option value="Merkez Kasa">Merkez Kasa</option>
            {lokasyonlar.map((l) => (
              <option key={l.id} value={l.ad}>{l.ad}</option>
            ))}
          </select>

          <label>Makbuz / Dekont No (opsiyonel)</label>
          <input
            placeholder="örn. DEK-8491"
            value={belgeNo}
            onChange={(e) => setBelgeNo(e.target.value)}
          />

          <label>Açıklama / Not</label>
          <input
            placeholder="örn. Elden nakit avans verildi"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
          />

          <button type="submit" className="action btn-punch" style={{ marginTop: 16 }} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor...' : '✓ Finansal İşlemi Kaydet'}
          </button>
        </form>
        {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
      </div>

      {/* GEÇMİŞ AVANS VE PRİM LİSTESİ */}
      <div className="card">
        <h2 className="section">📋 Kayıtlı Avans ve Prim Hareketleri</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ margin: 0, fontSize: 11 }}>Personele Göre Filtrele</label>
            <select value={filtrePersonel} onChange={(e) => setFiltrePersonel(e.target.value)} style={{ padding: '6px 8px', fontSize: 12 }}>
              <option value="Tümü">Tüm Personeller</option>
              {personeller.map((p) => (
                <option key={p.personel_no} value={p.personel_no}>{p.ad}</option>
              ))}
            </select>
          </div>
          <button
            className="action btn-secondary"
            style={{ width: 'auto', margin: 0, padding: '7px 12px', fontSize: 12 }}
            onClick={() => excelIndir(
              gosterilenler.map((k) => {
                const kat = getIslemKategori(k);
                return {
                  Tarih: new Date(k.tarih || k.created_at).toLocaleDateString('tr-TR'), Personel: k.ad, Tür: kat,
                  Tutar: k.toplam, Şantiye: k.lokasyon, 'Belge No': k.fis_no || '', Açıklama: formatIslemAciklama(k)
                };
              }),
              'avans-prim-hareketleri.xlsx'
            )}
            disabled={!gosterilenler.length}
          >
            📊 Excel
          </button>
        </div>

        <div className="grid cols-2" style={{ marginBottom: 12 }}>
          <div className="stat-card"><div className="label">Toplam Avans</div><div className="value" style={{ color: '#dc2626' }}>{formatPLN(toplamAvansTutar)}</div></div>
          <div className="stat-card"><div className="label">Toplam Prim</div><div className="value" style={{ color: '#16a34a' }}>{formatPLN(toplamPrimTutar)}</div></div>
        </div>

        {yukleniyor ? (
          <div style={{ color: 'var(--ink-soft)' }}>Yükleniyor...</div>
        ) : (
          <div className="table-scroll-container" style={{ maxHeight: 440, overflowY: 'auto' }}>
            <table style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th className="sticky-col-header" style={{ minWidth: 140 }}>Personel</th>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th>Tutar</th>
                  <th>Açıklama</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {gosterilenler.map((k) => {
                  const kat = getIslemKategori(k);
                  return (
                    <tr key={k.id}>
                      <td className="sticky-col-cell">
                        <span className="personel-name" title={k.ad}>{k.ad}</span>
                        <div className="personel-sub">{k.personel_no || ''}</div>
                      </td>
                      <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{new Date(k.tarih || k.created_at).toLocaleDateString('tr-TR')}</td>
                      <td>
                        <span className={`status-tag ${kat === 'prim' ? 'open' : ''}`}>
                          {kat === 'avans' ? 'Avans' : (kat === 'prim' ? 'Prim' : (kat === 'kesinti' ? 'Kesinti' : (kat === 'maas_odeme' ? 'Maaş' : 'Masraf')))}
                        </span>
                      </td>
                      <td><b>{formatPLN(k.toplam)}</b></td>
                      <td style={{ fontSize: 11.5, color: 'var(--ink-soft)', maxWidth: 260 }}>{formatIslemAciklama(k)}</td>
                      <td>
                        <button onClick={() => kayitSil(k.id)} style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Sil</button>
                      </td>
                    </tr>
                  );
                })}
                {gosterilenler.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--ink-soft)', padding: 14 }}>Kayıt bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- PERSONEL CARİ HESAP EKSTRESİ ---------------- */
function PersonelCariEkstreTab() {
  const now = new Date();
  const ayBasi = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const bugun = now.toISOString().slice(0, 10);

  const [personeller, setPersoneller] = useState([]);
  const [seciliPersonelNo, setSeciliPersonelNo] = useState('');
  const [baslangicTarih, setBaslangicTarih] = useState(ayBasi);
  const [bitisTarih, setBitisTarih] = useState(bugun);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ekstre, setEkstre] = useState(null);

  useEffect(() => {
    supabase.from('personel').select('*').neq('rol', 'patron').order('ad').then(({ data }) => {
      setPersoneller(data || []);
      if (data && data.length) setSeciliPersonelNo(data[0].personel_no);
    });
  }, []);

  const ekstreHesapla = useCallback(async () => {
    if (!seciliPersonelNo) return;
    setYukleniyor(true);

    const b = new Date(baslangicTarih);
    const s = new Date(bitisTarih + 'T23:59:59');

    const seciliP = personeller.find((p) => p.personel_no === seciliPersonelNo);
    const saatlikUcret = Number(seciliP?.gunluk_ucret) || 0;

    const [{ toplamCalisilanSaat, calisilanGunSayisi }, { data: tumMasraflar }, { data: fmKayitlari }] = await Promise.all([
      aralikCalismaGunleriGetir(baslangicTarih, bitisTarih),
      supabase.from('saha_verileri').select('*').eq('personel_no', seciliPersonelNo).gte('tarih', b.toISOString()).lte('tarih', s.toISOString()).order('tarih', { ascending: true }),
      supabase.from('aylik_fazla_mesai').select('*').eq('personel_no', seciliPersonelNo),
    ]);

    const calisilanSaat = toplamCalisilanSaat(seciliPersonelNo);
    const calisilanGun = calisilanGunSayisi(seciliPersonelNo);
    const ilgiliFm = (fmKayitlari || []).filter((f) => ayAralikIcinde(f.yil, f.ay, b, s));
    const fmSaat = ilgiliFm.reduce((acc, f) => acc + (Number(f.saat) || 0), 0);

    const hakedisTutari = (calisilanSaat * saatlikUcret) + (fmSaat * (saatlikUcret * 1.5));
    const harcamalar = (tumMasraflar || []).filter((m) => getIslemKategori(m) === 'harcama').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const avanslar = (tumMasraflar || []).filter((m) => getIslemKategori(m) === 'avans').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const primler = (tumMasraflar || []).filter((m) => getIslemKategori(m) === 'prim').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const kesintiler = (tumMasraflar || []).filter((m) => getIslemKategori(m) === 'kesinti').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);
    const odenmisler = (tumMasraflar || []).filter((m) => getIslemKategori(m) === 'maas_odeme').reduce((acc, m) => acc + (Number(m.toplam) || 0), 0);

    const netKalanBakiye = hakedisTutari + harcamalar + primler - avanslar - kesintiler - odenmisler;

    setEkstre({
      personel: seciliP,
      saatlikUcret,
      calisilanSaat,
      calisilanGun,
      fmSaat,
      hakedisTutari,
      harcamalar,
      avanslar,
      primler,
      kesintiler,
      odenmisler,
      netKalanBakiye,
      hareketler: (tumMasraflar || []).filter((m) => getIslemKategori(m) !== 'bilgi_kaydi'),
    });

    setYukleniyor(false);
  }, [seciliPersonelNo, baslangicTarih, bitisTarih, personeller]);

  useEffect(() => { ekstreHesapla(); }, [ekstreHesapla]);

  async function pdfEkstreIndir() {
    if (!ekstre) return;
    const { data: ozlukKayit } = await supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK').eq('personel_no', seciliPersonelNo).order('tarih', { ascending: false }).limit(1);
    let o = {};
    if (ozlukKayit && ozlukKayit.length) {
      try { o = JSON.parse(ozlukKayit[0].aciklama || '{}'); } catch (e) { o = {}; }
    }
    detayliBordroPdfOlustur({
      personelNo: seciliPersonelNo,
      ad: ekstre.personel?.ad,
      rol: ekstre.personel?.rol,
      gunlukUcret: ekstre.saatlikUcret,
      calisilanSaat: ekstre.calisilanSaat,
      calisilanGun: ekstre.calisilanGun,
      fmSaat: ekstre.fmSaat,
      hakedisTutari: ekstre.hakedisTutari,
      toplamMasraf: ekstre.harcamalar,
      toplamPrim: ekstre.primler,
      toplamAvans: ekstre.avanslar,
      toplamKesinti: ekstre.kesintiler,
      odenmisMaas: ekstre.odenmisler,
      netOdenecek: ekstre.netKalanBakiye,
      yil: new Date(bitisTarih).getFullYear(),
      ay: new Date(bitisTarih).getMonth() + 1,
      ayAdi: `${baslangicTarih} / ${bitisTarih}`,
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

  return (
    <div className="card">
      <h2 className="section">📄 Personel Bireysel Cari Hesap Ekstresi</h2>
      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <div>
          <label>Personel Seçiniz</label>
          <select value={seciliPersonelNo} onChange={(e) => setSeciliPersonelNo(e.target.value)}>
            {personeller.map((p) => (
              <option key={p.personel_no} value={p.personel_no}>{p.ad} ({p.rol})</option>
            ))}
          </select>
        </div>
        <div>
          <label>Başlangıç Tarihi</label>
          <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} />
        </div>
        <div>
          <label>Bitiş Tarihi</label>
          <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="action btn-secondary" style={{ width: 'auto' }} onClick={pdfEkstreIndir} disabled={!ekstre}>
          📄 PDF Ekstre İndir
        </button>
      </div>

      {ekstre && (
        <>
          <div className="grid cols-4" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="stat-card">
              <div className="label">Brüt Saatlik Hakediş (+)</div>
              <div className="value">{formatPLN(ekstre.hakedisTutari)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{sureFormatla(ekstre.calisilanSaat)} ({ekstre.calisilanGun} gün mesai)</div>
            </div>
            <div className="stat-card">
              <div className="label">Şantiye Masrafı (+)</div>
              <div className="value" style={{ color: '#16a34a' }}>+{formatPLN(ekstre.harcamalar)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Alınan Avans (-)</div>
              <div className="value" style={{ color: '#dc2626' }}>-{formatPLN(ekstre.avanslar)}</div>
            </div>
            <div className="stat-card" style={{ background: 'var(--accent-patron-soft)', borderColor: 'var(--accent-patron)' }}>
              <div className="label" style={{ color: 'var(--accent-patron)' }}>Kalan Net Bakiye</div>
              <div className="value" style={{ color: 'var(--accent-patron)' }}>{formatPLN(ekstre.netKalanBakiye)}</div>
            </div>
          </div>

          <h3 style={{ fontSize: 14, margin: '20px 0 8px 0' }}>Dönem İçi Harcama, Avans ve Ödeme Dökümü</h3>
          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch', marginTop: 10 }}>
            <table style={{ width: '100%', minWidth: 600 }}>
              <thead>
                <tr><th>Tarih</th><th>İşlem Türü</th><th>Şantiye / Kasa</th><th>Tutar</th><th>Fiş / Belge</th><th>Açıklama</th></tr>
              </thead>
              <tbody>
                {ekstre.hareketler.map((m) => {
                  const kat = getIslemKategori(m);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{new Date(m.tarih || m.created_at).toLocaleDateString('tr-TR')}</td>
                      <td>
                        <span className={`status-tag ${kat === 'prim' ? 'open' : ''}`}>
                          {kat === 'avans' ? 'Avans' : (kat === 'prim' ? 'Prim' : (kat === 'kesinti' ? 'Kesinti' : (kat === 'maas_odeme' ? 'Maaş Ödemesi' : 'Şantiye Masrafı')))}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{m.lokasyon}</td>
                      <td><b>{formatPLN(m.toplam)}</b></td>
                      <td style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{m.fis_no || '—'}</td>
                      <td style={{ fontSize: 11.5, color: 'var(--ink-soft)', maxWidth: 300 }}>{formatIslemAciklama(m)}</td>
                    </tr>
                  );
                })}
                {ekstre.hareketler.length === 0 && (
                  <tr><td colSpan={6} style={{ color: 'var(--ink-soft)', padding: 14 }}>Bu tarih aralığında masraf veya avans hareketi bulunamadı.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ==================================================================
   PERSONEL YÖNETİMİ & ÖZLÜK SİSTEMİ
   ================================================================== */
function PersonelYonetimiTab() {
  const [altSekme, setAltSekme] = useState('liste'); // 'liste' | 'yeni' | 'izinler'
  const [personeller, setPersoneller] = useState([]);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [ozlukMap, setOzlukMap] = useState({});
  const [izinTalepleri, setIzinTalepleri] = useState([]);
  const [avansTalepleri, setAvansTalepleri] = useState([]);
  const [talepTuru, setTalepTuru] = useState('izin'); // 'izin' | 'avans'
  const [kullanilanIzinMap, setKullanilanIzinMap] = useState({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [arama, setArama] = useState('');
  const [rolFiltre, setRolFiltre] = useState('Tümü');
  const [izinFiltre, setIzinFiltre] = useState('Tümü');
  const [avansFiltre, setAvansFiltre] = useState('Tümü');
  const [mesaj, setMesaj] = useState(null);
  const [duzenlenenId, setDuzenlenenId] = useState(null);
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);

  // Form State
  const [form, setForm] = useState({
    personel_no: '',
    sifre: '',
    ad: '',
    rol: 'personel',
    lokasyon: 'Merkez',
    gunluk_ucret: '',
    yillik_izin_hakki: '0',
    durum: 'Aktif', // 'Aktif' | 'Ayrıldı'
    isten_ayrilis_tarihi: '',
    ayrilma_nedeni: '',
    tc_no: '',
    dogum_tarihi: '',
    dogum_yeri: '',
    cinsiyet: 'Erkek',
    medeni_hal: 'Bekar',
    cocuk_sayisi: '0',
    telefon: '',
    email: '',
    adres: '',
    ise_giris_tarihi: new Date().toISOString().slice(0, 10),
    departman: 'Saha Montaj / İnşaat',
    sgk_no: '',
    banka_adi: '',
    iban: '',
    ozel_not: '',
  });

  const formGuncelle = (alan, deger) => {
    setForm((onceki) => ({ ...onceki, [alan]: deger }));
  };

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: pList }, { data: lList }, { data: ozlukList }, { data: izinList }, { data: avansList }] = await Promise.all([
      supabase.from('personel').select('*').neq('rol', 'patron').order('ad'),
      supabase.from('lokasyonlar').select('*'),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'PERSONEL_OZLUK').order('tarih', { ascending: false }),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'IZIN_TALEBI').order('tarih', { ascending: false }),
      supabase.from('saha_verileri').select('*').eq('kalem_turu', 'AVANS_TALEBI').order('tarih', { ascending: false }),
    ]);

    const oMap = {};
    (ozlukList || []).forEach((row) => {
      if (!oMap[row.personel_no]) {
        try {
          oMap[row.personel_no] = JSON.parse(row.aciklama || '{}');
          oMap[row.personel_no]._rowId = row.id;
        } catch (e) {
          oMap[row.personel_no] = {};
        }
      }
    });

    const islenmisIzinler = (izinList || []).map((row) => {
      let detay = {};
      try { detay = JSON.parse(row.aciklama || '{}'); } catch (e) {}
      return {
        id: row.id,
        personel_no: row.personel_no,
        ad: row.ad,
        lokasyon: row.lokasyon,
        tarih: row.tarih || row.created_at,
        durum: row.fis_no || detay.durum || 'Bekliyor',
        gun_sayisi: Number(row.miktar) || detay.gun_sayisi || 0,
        baslangic: detay.baslangic,
        bitis: detay.bitis,
        izin_turu: detay.izin_turu || 'Yıllık İzin',
        neden: detay.neden || '',
        patron_notu: detay.patron_notu || '',
        onay_tarihi: detay.onay_tarihi || '',
        hamDetay: detay,
      };
    });

    const islenmisAvanslar = (avansList || []).map((row) => {
      let detay = {};
      try { detay = JSON.parse(row.aciklama || '{}'); } catch (e) {}
      return {
        id: row.id,
        personel_no: row.personel_no,
        ad: row.ad,
        lokasyon: row.lokasyon,
        tarih: row.tarih || row.created_at,
        durum: row.fis_no || detay.durum || 'Bekliyor',
        tutar: Number(row.toplam) || Number(row.miktar) || detay.tutar || 0,
        neden: detay.neden || row.aciklama || '',
        patron_notu: detay.patron_notu || '',
        onay_tarihi: detay.onay_tarihi || '',
        hamDetay: detay,
      };
    });

    const kMap = {};
    islenmisIzinler.forEach((iz) => {
      if (iz.durum === 'Onaylandı' && iz.izin_turu === 'Yıllık İzin') {
        kMap[iz.personel_no] = (kMap[iz.personel_no] || 0) + iz.gun_sayisi;
      }
    });

    setPersoneller(pList || []);
    setLokasyonlar(lList || []);
    setOzlukMap(oMap);
    setIzinTalepleri(islenmisIzinler);
    setAvansTalepleri(islenmisAvanslar);
    setKullanilanIzinMap(kMap);
    setYukleniyor(false);
  }, []);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  const formuTemizle = () => {
    setDuzenlenenId(null);
    setForm({
      personel_no: '',
      sifre: '',
      ad: '',
      rol: 'personel',
      lokasyon: lokasyonlar.length ? lokasyonlar[0].ad : 'Merkez',
      gunluk_ucret: '',
      yillik_izin_hakki: '0',
      durum: 'Aktif',
      isten_ayrilis_tarihi: '',
      ayrilma_nedeni: '',
      tc_no: '',
      dogum_tarihi: '',
      dogum_yeri: '',
      cinsiyet: 'Erkek',
      medeni_hal: 'Bekar',
      cocuk_sayisi: '0',
      telefon: '',
      email: '',
      adres: '',
      ise_giris_tarihi: new Date().toISOString().slice(0, 10),
      departman: 'Saha Montaj / İnşaat',
      sgk_no: '',
      banka_adi: '',
      iban: '',
      ozel_not: '',
    });
  };

  const duzenleBaslat = (p) => {
    const o = ozlukMap[p.personel_no] || {};
    setDuzenlenenId(p.id);
    setForm({
      personel_no: p.personel_no,
      sifre: p.sifre || '',
      ad: p.ad,
      rol: p.rol || 'personel',
      lokasyon: p.lokasyon || (lokasyonlar.length ? lokasyonlar[0].ad : 'Merkez'),
      gunluk_ucret: String(p.gunluk_ucret || ''),
      yillik_izin_hakki: String(o.yillik_izin_hakki ?? '0'),
      durum: o.durum || (o.isten_ayrilis_tarihi ? 'Ayrıldı' : 'Aktif'),
      isten_ayrilis_tarihi: o.isten_ayrilis_tarihi || '',
      ayrilma_nedeni: o.ayrilma_nedeni || '',
      tc_no: o.tc_no || '',
      dogum_tarihi: o.dogum_tarihi || '',
      dogum_yeri: o.dogum_yeri || '',
      cinsiyet: o.cinsiyet || 'Erkek',
      medeni_hal: o.medeni_hal || 'Bekar',
      cocuk_sayisi: String(o.cocuk_sayisi || '0'),
      telefon: o.telefon || '',
      email: o.email || '',
      adres: o.adres || '',
      ise_giris_tarihi: o.ise_giris_tarihi || (p.created_at ? p.created_at.slice(0, 10) : ''),
      departman: o.departman || 'Saha Montaj / İnşaat',
      sgk_no: o.sgk_no || '',
      banka_adi: o.banka_adi || '',
      iban: o.iban || '',
      ozel_not: o.ozel_not || '',
    });
    setAltSekme('yeni');
    setMesaj(null);
  };

  const personelKaydet = async (e) => {
    e.preventDefault();
    setMesaj(null);

    if (!form.ad.trim() || !form.personel_no.trim() || !form.sifre.trim()) {
      setMesaj({ tip: 'err', metin: 'Lütfen Ad Soyad, Personel No ve Giriş Şifresi alanlarını doldurun.' });
      return;
    }

    setKaydediliyor(true);

    try {
      // 1. Personel Ana Kaydı
      const personelPayload = {
        personel_no: form.personel_no.trim(),
        sifre: form.sifre.trim(),
        ad: form.ad.trim(),
        rol: form.rol,
        lokasyon: form.lokasyon,
        gunluk_ucret: Number(form.gunluk_ucret) || 0,
      };

      if (duzenlenenId) {
        await supabase.from('personel').update(personelPayload).eq('id', duzenlenenId);
      } else {
        const { error: pErr } = await supabase.from('personel').insert(personelPayload);
        if (pErr) throw pErr;
      }

      // 2. Personel Özlük / Detay Kaydı
      const ozlukDetay = {
        yillik_izin_hakki: Number(form.yillik_izin_hakki) || 0,
        durum: form.durum || 'Aktif',
        isten_ayrilis_tarihi: form.durum === 'Ayrıldı' ? form.isten_ayrilis_tarihi : null,
        ayrilma_nedeni: form.durum === 'Ayrıldı' ? form.ayrilma_nedeni.trim() : null,
        tc_no: form.tc_no.trim(),
        dogum_tarihi: form.dogum_tarihi,
        dogum_yeri: form.dogum_yeri.trim(),
        cinsiyet: form.cinsiyet,
        medeni_hal: form.medeni_hal,
        cocuk_sayisi: form.cocuk_sayisi,
        telefon: form.telefon.trim(),
        email: form.email.trim(),
        adres: form.adres.trim(),
        ise_giris_tarihi: form.ise_giris_tarihi,
        departman: form.departman.trim(),
        sgk_no: form.sgk_no.trim(),
        banka_adi: form.banka_adi.trim(),
        iban: form.iban.trim(),
        ozel_not: form.ozel_not.trim(),
      };

      const mevcutOzluk = ozlukMap[form.personel_no.trim()];
      if (mevcutOzluk && mevcutOzluk._rowId) {
        await supabase.from('saha_verileri').update({
          ad: form.ad.trim(),
          lokasyon: form.lokasyon,
          aciklama: JSON.stringify(ozlukDetay),
        }).eq('id', mevcutOzluk._rowId);
      } else {
        await supabase.from('saha_verileri').insert({
          personel_no: form.personel_no.trim(),
          ad: form.ad.trim(),
          lokasyon: form.lokasyon,
          kalem_turu: 'PERSONEL_OZLUK',
          miktar: 1,
          birim_fiyat: 0,
          toplam: 0,
          islem_turu: 'harcama',
          aciklama: JSON.stringify(ozlukDetay),
        });
      }

      setMesaj({ tip: 'ok', metin: `${form.ad} adlı personelin bilgileri başarıyla kaydedildi.` });
      await veriyiYukle();
      if (!duzenlenenId) formuTemizle();
      setTimeout(() => setAltSekme('liste'), 1200);
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Kayıt sırasında hata oluştu: ' + err.message });
    } finally {
      setKaydediliyor(false);
    }
  };

  const personelSil = async (p) => {
    if (!confirm(`${p.ad} (${p.personel_no}) adlı personeli ve özlük kaydını silmek istediğinize emin misiniz?`)) return;
    await supabase.from('personel').delete().eq('id', p.id);
    await supabase.from('saha_verileri').delete().eq('personel_no', p.personel_no).eq('kalem_turu', 'PERSONEL_OZLUK');
    veriyiYukle();
  };

  // İZİN ONAYLAMA & OTOMATİK PUANTAJ İŞLEME (Cumartesi & Pazar Resmi Tatil Hariç)
  const izinOnayla = async (talep) => {
    const onay = confirm(`${talep.ad} adlı personelin ${talep.baslangic} — ${talep.bitis} (${talep.gun_sayisi} iş günü) tarihli ${talep.izin_turu} talebini onaylamak ve hafta içi iş günlerini puantajda otomatik olarak 'İzinli (İ)' olarak işlemek istiyor musunuz?`);
    if (!onay) return;

    setIslemYapiliyor(true);
    setMesaj(null);

    try {
      // 1. Tarih aralığındaki tüm günleri tara (Hafta sonu Cumartesi/Pazar tatil 'P', Hafta içi izinli 'I')
      let cur = new Date(talep.baslangic + 'T00:00:00');
      const end = new Date(talep.bitis + 'T00:00:00');
      let islenenIzinGunu = 0;

      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const tStr = `${y}-${m}-${d}`;
        const dayOfWeek = cur.getDay(); // 0 = Pazar, 6 = Cumartesi

        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          // Hafta içi iş günü: İzinli (İ)
          await supabase.from('puantaj_manuel').upsert(
            { personel_no: talep.personel_no, tarih: tStr, deger: 'I' },
            { onConflict: 'personel_no,tarih' }
          );
          islenenIzinGunu++;
        } else {
          // Cumartesi / Pazar: Resmi Tatil (P)
          await supabase.from('puantaj_manuel').upsert(
            { personel_no: talep.personel_no, tarih: tStr, deger: 'P' },
            { onConflict: 'personel_no,tarih' }
          );
        }
        cur.setDate(cur.getDate() + 1);
      }

      // 2. İzin talebini güncelle
      const yeniDetay = {
        ...talep.hamDetay,
        durum: 'Onaylandı',
        onay_tarihi: new Date().toISOString(),
      };

      await supabase.from('saha_verileri').update({
        fis_no: 'Onaylandı',
        aciklama: JSON.stringify(yeniDetay),
      }).eq('id', talep.id);

      setMesaj({ tip: 'ok', metin: `✓ ${talep.ad} için izin onaylandı! ${islenenIzinGunu} iş günü 'İzinli (İ)', hafta sonları ise tatil olarak puantaja işlendi.` });
      await veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'İzin onaylanırken hata oluştu: ' + err.message });
    } finally {
      setIslemYapiliyor(false);
    }
  };

  const izinReddet = async (talep) => {
    const sebep = prompt('Reddetme nedeni / açıklaması (opsiyonel):', '');
    if (sebep === null) return;

    setIslemYapiliyor(true);
    try {
      const yeniDetay = {
        ...talep.hamDetay,
        durum: 'Reddedildi',
        patron_notu: sebep.trim() || 'Yönetim tarafından onaylanmadı.',
        onay_tarihi: new Date().toISOString(),
      };

      await supabase.from('saha_verileri').update({
        fis_no: 'Reddedildi',
        aciklama: JSON.stringify(yeniDetay),
      }).eq('id', talep.id);

      setMesaj({ tip: 'ok', metin: `${talep.ad} adlı personelin izin talebi reddedildi.` });
      await veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'İşlem başarısız: ' + err.message });
    } finally {
      setIslemYapiliyor(false);
    }
  };

  // AVANS ONAYLAMA & HESABA İŞLEME
  const avansOnayla = async (talep) => {
    const onay = confirm(`${talep.ad} adlı personelin ${formatPLN(talep.tutar)} tutarındaki avans talebini onaylamak ve cari hesabına 'Avans' olarak işlemek istiyor musunuz?`);
    if (!onay) return;

    setIslemYapiliyor(true);
    setMesaj(null);
    try {
      const yeniDetay = {
        ...talep.hamDetay,
        durum: 'Onaylandı',
        onay_tarihi: new Date().toISOString(),
      };

      await supabase.from('saha_verileri').update({
        fis_no: 'Onaylandı',
        islem_turu: 'avans',
        aciklama: JSON.stringify(yeniDetay),
      }).eq('id', talep.id);

      setMesaj({ tip: 'ok', metin: `✓ ${talep.ad} için ${formatPLN(talep.tutar)} avans ödemesi onaylandı ve hesaplara işlendi.` });
      await veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Avans onaylanırken hata oluştu: ' + err.message });
    } finally {
      setIslemYapiliyor(false);
    }
  };

  const avansReddet = async (talep) => {
    const sebep = prompt('Reddetme nedeni / açıklaması (opsiyonel):', '');
    if (sebep === null) return;

    setIslemYapiliyor(true);
    try {
      const yeniDetay = {
        ...talep.hamDetay,
        durum: 'Reddedildi',
        patron_notu: sebep.trim() || 'Yönetim tarafından onaylanmadı.',
        onay_tarihi: new Date().toISOString(),
      };

      await supabase.from('saha_verileri').update({
        fis_no: 'Reddedildi',
        islem_turu: 'avans_red',
        aciklama: JSON.stringify(yeniDetay),
      }).eq('id', talep.id);

      setMesaj({ tip: 'ok', metin: `${talep.ad} adlı personelin avans talebi reddedildi.` });
      await veriyiYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'İşlem başarısız: ' + err.message });
    } finally {
      setIslemYapiliyor(false);
    }
  };

  const excelPersonelListesiIndir = () => {
    const satirlar = personeller.map((p) => {
      const o = ozlukMap[p.personel_no] || {};
      const hak = Number(o.yillik_izin_hakki) || 28;
      const kull = kullanilanIzinMap[p.personel_no] || 0;
      const kalan = Math.max(0, hak - kull);
      return {
        'Personel No': p.personel_no,
        'Adı Soyadı': p.ad,
        'Görevi / Rolü': p.rol,
        'Şantiye / Lokasyon': p.lokasyon || '—',
        'Günlük Ücret (PLN)': p.gunluk_ucret || 0,
        'Yıllık İzin Hakkı (Gün)': hak,
        'Kullanılan İzin (Gün)': kull,
        'Kalan İzin (Gün)': kalan,
        'T.C. / Pasaport No': o.tc_no || '—',
        'Telefon': o.telefon || '—',
        'E-posta': o.email || '—',
        'Banka Adı': o.banka_adi || '—',
        'IBAN Numarası': o.iban || '—',
        'İşe Giriş Tarihi': o.ise_giris_tarihi || '—',
        'SGK Sicil No': o.sgk_no || '—',
        'Departman': o.departman || '—',
        'Cinsiyet': o.cinsiyet || '—',
        'Medeni Durum': o.medeni_hal || '—',
        'Çocuk Sayısı': o.cocuk_sayisi || '0',
        'İkametgah Adresi': o.adres || '—',
      };
    });
    excelIndir(satirlar, 'personel-ozluk-ve-izin-listesi.xlsx');
  };

  // Filtrelenmiş Liste
  const filtrelenmisPersoneller = personeller.filter((p) => {
    const o = ozlukMap[p.personel_no] || {};
    const aramaMetni = `${p.ad} ${p.personel_no} ${p.rol} ${p.lokasyon || ''} ${o.tc_no || ''} ${o.telefon || ''} ${o.iban || ''}`.toLowerCase();
    const aramaUygun = !arama || aramaMetni.includes(arama.toLowerCase().trim());
    const rolUygun = rolFiltre === 'Tümü' || p.rol === rolFiltre;
    return aramaUygun && rolUygun;
  });

  const bekleyenIzinSayisi = izinTalepleri.filter((i) => i.durum === 'Bekliyor').length;
  const bekleyenAvansSayisi = avansTalepleri.filter((a) => a.durum === 'Bekliyor').length;
  const filtrelenmisIzinler = izinTalepleri.filter((i) => {
    if (izinFiltre === 'Tümü') return true;
    return i.durum === izinFiltre;
  });
  const filtrelenmisAvanslar = avansTalepleri.filter((a) => {
    if (avansFiltre === 'Tümü') return true;
    return a.durum === avansFiltre;
  });

  const toplamUcretYuku = personeller.reduce((a, p) => a + (Number(p.gunluk_ucret) || 0), 0);
  const formenSayisi = personeller.filter((p) => p.rol === 'formen').length;
  const ustaSayisi = personeller.filter((p) => p.rol === 'usta').length;
  const isciSayisi = personeller.filter((p) => p.rol === 'personel').length;

  return (
    <div>
      {/* ÜST İKİNCİL SEKMELER */}
      <div className="chip-row" style={{ marginBottom: 14 }}>
        <span
          className={'chip' + (altSekme === 'liste' ? ' sel' : '')}
          onClick={() => { setAltSekme('liste'); setMesaj(null); }}
        >
          👥 Personel Listesi & Kartlar ({personeller.length})
        </span>
        <span
          className={'chip' + (altSekme === 'yeni' ? ' sel' : '')}
          onClick={() => { formuTemizle(); setAltSekme('yeni'); setMesaj(null); }}
        >
          ➕ {duzenlenenId ? '✏️ Personel Düzenle' : 'Yeni Personel Ekle'}
        </span>
        <span
          className={'chip' + (altSekme === 'izinler' ? ' sel' : '')}
          style={{ position: 'relative' }}
          onClick={() => { setAltSekme('izinler'); setMesaj(null); }}
        >
          🏖️💵 İzin & Avans Talepleri
          {(bekleyenIzinSayisi + bekleyenAvansSayisi) > 0 && (
            <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {bekleyenIzinSayisi + bekleyenAvansSayisi} Bekliyor
            </span>
          )}
        </span>
      </div>

      {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginBottom: 12 }}>{mesaj.metin}</div>}

      {/* 1. SEKME: PERSONEL LİSTESİ & KARTLARI */}
      {altSekme === 'liste' && (
        <>
          {/* İSTATİSTİK KARTLARI */}
          <div className="grid cols-4" style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div className="stat-card">
              <div className="label">Toplam Personel</div>
              <div className="value">{personeller.length} kişi</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Aktif çalışanlar</div>
            </div>
            <div className="stat-card">
              <div className="label">Bekleyen İzin / Avans</div>
              <div className="value" style={{ color: (bekleyenIzinSayisi + bekleyenAvansSayisi) > 0 ? '#ef4444' : '#16a34a' }}>
                {bekleyenIzinSayisi + bekleyenAvansSayisi} talep
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                {bekleyenIzinSayisi} izin · {bekleyenAvansSayisi} avans
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Usta & İşçi</div>
              <div className="value" style={{ color: '#16a34a' }}>{ustaSayisi + isciSayisi} kişi</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{ustaSayisi} usta, {isciSayisi} personel</div>
            </div>
            <div className="stat-card" style={{ background: 'var(--accent-patron-soft)', borderColor: 'var(--accent-patron)' }}>
              <div className="label" style={{ color: 'var(--accent-patron)' }}>Günlük Maaş Maliyeti</div>
              <div className="value" style={{ color: 'var(--accent-patron)' }}>{formatPLN(toplamUcretYuku)}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Tüm ekip / gün</div>
            </div>
          </div>

          <div className="card">
            {/* ARAMA VE FİLTRE BAR */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 260 }}>
                <input
                  placeholder="🔍 İsim, TC No, Telefon, Personel No veya Şantiye ara..."
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  style={{ margin: 0, padding: '8px 12px', fontSize: 12 }}
                />
                <select
                  value={rolFiltre}
                  onChange={(e) => setRolFiltre(e.target.value)}
                  style={{ width: 'auto', margin: 0, padding: '8px 10px', fontSize: 12 }}
                >
                  <option value="Tümü">Tüm Görevler</option>
                  <option value="formen">Formen</option>
                  <option value="usta">Usta</option>
                  <option value="personel">Personel</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="action btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 12 }}
                  onClick={excelPersonelListesiIndir}
                  disabled={!personeller.length}
                >
                  📊 Tüm Özlük Listesini İndir (Excel)
                </button>
                <button
                  className="action btn-punch"
                  style={{ width: 'auto', margin: 0, padding: '8px 14px', fontSize: 12 }}
                  onClick={() => { formuTemizle(); setAltSekme('yeni'); }}
                >
                  ➕ Yeni Personel Ekle
                </button>
              </div>
            </div>

            {yukleniyor ? (
              <div style={{ color: 'var(--ink-soft)', padding: 14 }}>Personel kayıtları yükleniyor...</div>
            ) : (
              <div className="table-scroll-container">
                <table>
                  <thead>
                    <tr>
                      <th className="sticky-col-header">Personel / Sicil</th>
                      <th>Görevi & Şantiye</th>
                      <th>Saatlik Ücret</th>
                      <th>Yaş / D.Tarihi</th>
                      <th>Yıllık İzin (Kalan / Hak)</th>
                      <th>Kimlik / T.C. No</th>
                      <th>İletişim (Telefon / E-posta)</th>
                      <th>İşe Giriş</th>
                      <th style={{ minWidth: 90 }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrelenmisPersoneller.map((p) => {
                      const o = ozlukMap[p.personel_no] || {};
                      const toplamHak = Number(o.yillik_izin_hakki) || 0;
                      const kullanilan = kullanilanIzinMap[p.personel_no] || 0;
                      const kalan = Math.max(0, toplamHak - kullanilan);
                      return (
                        <tr key={p.id}>
                          <td className="sticky-col-cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="personel-name" title={p.ad}>{p.ad}</span>
                              {o.durum === 'Ayrıldı' && (
                                <span style={{ fontSize: 8, background: 'rgba(220, 38, 38, 0.15)', color: '#ef4444', padding: '1px 3px', borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                                  A
                                </span>
                              )}
                            </div>
                            <div className="personel-sub">No: {p.personel_no}</div>
                          </td>
                          <td>
                            <span className={`status-tag ${p.rol === 'formen' ? 'open' : ''}`}>
                              {p.rol === 'formen' ? '⭐ Formen' : (p.rol === 'usta' ? '🔧 Usta' : '👷 Personel')}
                            </span>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{p.lokasyon || 'Merkez'}</div>
                          </td>
                          <td><b>{formatPLN(p.gunluk_ucret)}/sa</b></td>
                          <td style={{ fontSize: 12 }}>
                            {yasHesapla(o.dogum_tarihi) ? <b>{yasHesapla(o.dogum_tarihi)} Yaş</b> : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                            {o.dogum_tarihi && (
                              <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                                {new Date(o.dogum_tarihi).toLocaleDateString('tr-TR')}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: kalan > 0 ? '#16a34a' : 'var(--ink-soft)', fontSize: 13 }}>
                              {kalan} / {toplamHak} Gün
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>({kullanilan} gün kullanıldı)</div>
                          </td>
                          <td style={{ fontSize: 11.5 }}>{o.tc_no || '—'}</td>
                          <td style={{ fontSize: 11.5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{o.telefon || '—'}</span>
                              {o.telefon && (
                                <a
                                  href={`https://wa.me/${o.telefon.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ textDecoration: 'none', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}
                                  title="WhatsApp ile İletişime Geç"
                                >
                                  💬 WA
                                </a>
                              )}
                            </div>
                            {o.email && <div style={{ color: 'var(--ink-soft)' }}>{o.email}</div>}
                          </td>
                          <td style={{ fontSize: 11.5 }}>
                            <div>{o.ise_giris_tarihi || '—'}</div>
                            {o.durum === 'Ayrıldı' && <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>Çıkış: {o.isten_ayrilis_tarihi || '—'}</div>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button
                                className="action btn-secondary"
                                style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }}
                                onClick={() => duzenleBaslat(p)}
                                title="Personeli ve Özlük Bilgilerini Düzenle"
                              >
                                ✏️ Düzenle
                              </button>
                              <button
                                style={{ border: 'none', background: 'rgba(220, 38, 38, 0.12)', color: '#ef4444', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                                onClick={() => personelSil(p)}
                                title="Personeli Sil"
                              >
                                Sil
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtrelenmisPersoneller.length === 0 && (
                      <tr><td colSpan={9} style={{ color: 'var(--ink-soft)', padding: 14 }}>Arama kriterlerine uygun personel bulunamadı.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 2. SEKME: YENİ PERSONEL EKLE & DÜZENLE FORMU */}
      {altSekme === 'yeni' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section" style={{ margin: 0 }}>
              {duzenlenenId ? `✏️ Personel Düzenle: ${form.ad}` : '➕ Yeni Personel & Özlük Kaydı'}
            </h2>
            <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }} onClick={() => setAltSekme('liste')}>
              ← Listeye Dön
            </button>
          </div>

          <form onSubmit={personelKaydet}>
            {/* GRUP 1: KİMLİK VE KİŞİSEL BİLGİLER */}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--accent-patron)', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginTop: 10 }}>
              1. Kimlik ve Kişisel Bilgiler
            </h3>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <div>
                <label>Adı Soyadı *</label>
                <input required placeholder="örn. Ahmet Yılmaz" value={form.ad} onChange={(e) => formGuncelle('ad', e.target.value)} />
              </div>
              <div>
                <label>T.C. Kimlik No / Pasaport No</label>
                <input placeholder="11 haneli T.C. veya pasaport" value={form.tc_no} onChange={(e) => formGuncelle('tc_no', e.target.value)} />
              </div>
              <div>
                <label>Doğum Tarihi {form.dogum_tarihi && yasHesapla(form.dogum_tarihi) ? `(${yasHesapla(form.dogum_tarihi)} Yaşında)` : ''}</label>
                <input type="date" value={form.dogum_tarihi} onChange={(e) => formGuncelle('dogum_tarihi', e.target.value)} />
              </div>
            </div>

            <div className="grid cols-4" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <label>Doğum Yeri</label>
                <input placeholder="örn. İstanbul, Ankara, Varşova" value={form.dogum_yeri} onChange={(e) => formGuncelle('dogum_yeri', e.target.value)} />
              </div>
              <div>
                <label>Cinsiyet</label>
                <select value={form.cinsiyet} onChange={(e) => formGuncelle('cinsiyet', e.target.value)}>
                  <option value="Erkek">Erkek</option>
                  <option value="Kadın">Kadın</option>
                </select>
              </div>
              <div>
                <label>Medeni Hal</label>
                <select value={form.medeni_hal} onChange={(e) => formGuncelle('medeni_hal', e.target.value)}>
                  <option value="Bekar">Bekar</option>
                  <option value="Evli">Evli</option>
                </select>
              </div>
              <div>
                <label>Çocuk Sayısı</label>
                <input type="number" min="0" value={form.cocuk_sayisi} onChange={(e) => formGuncelle('cocuk_sayisi', e.target.value)} />
              </div>
            </div>

            {/* GRUP 2: İLETİŞİM BİLGİLERİ */}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--accent-patron)', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginTop: 22 }}>
              2. İletişim Bilgileri
            </h3>
            <div className="grid cols-2" style={{ marginTop: 10 }}>
              <div>
                <label>Cep Telefonu Numarası</label>
                <input placeholder="+48 ... veya +90 ..." value={form.telefon} onChange={(e) => formGuncelle('telefon', e.target.value)} />
              </div>
              <div>
                <label>E-posta Adresi</label>
                <input type="email" placeholder="ornek@sirket.com" value={form.email} onChange={(e) => formGuncelle('email', e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>İkametgah / Ev Adresi</label>
              <input placeholder="Açık ev veya lojman adresi" value={form.adres} onChange={(e) => formGuncelle('adres', e.target.value)} />
            </div>

            {/* GRUP 3: ÇALIŞMA VE POZİSYON BİLGİLERİ */}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--accent-patron)', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginTop: 22 }}>
              3. Çalışma, Görev ve Pozisyon Bilgileri
            </h3>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <div>
                <label>Personel / Sicil No *</label>
                <input required placeholder="örn. P-101" value={form.personel_no} onChange={(e) => formGuncelle('personel_no', e.target.value)} disabled={!!duzenlenenId} />
              </div>
              <div>
                <label>Giriş Şifresi *</label>
                <input required placeholder="Sisteme giriş şifresi" value={form.sifre} onChange={(e) => formGuncelle('sifre', e.target.value)} />
              </div>
              <div>
                <label>Görevi / Rolü *</label>
                <select value={form.rol} onChange={(e) => formGuncelle('rol', e.target.value)}>
                  <option value="personel">👷 Personel (Saha Çalışanı)</option>
                  <option value="usta">🔧 Usta</option>
                  <option value="formen">⭐ Formen (Saha Şefi / Veri Giriş Yetkilisi)</option>
                </select>
              </div>
            </div>

            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <div>
                <label>Bağlı Olduğu Şantiye / Lokasyon</label>
                <select value={form.lokasyon} onChange={(e) => formGuncelle('lokasyon', e.target.value)}>
                  <option value="Merkez">Merkez Ofis</option>
                  {lokasyonlar.map((l) => (
                    <option key={l.id} value={l.ad}>{l.ad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Departman / Birim</label>
                <input placeholder="örn. Saha Montaj / İnşaat" value={form.departman} onChange={(e) => formGuncelle('departman', e.target.value)} />
              </div>
              <div>
                <label>İşe Giriş Tarihi</label>
                <input type="date" value={form.ise_giris_tarihi} onChange={(e) => formGuncelle('ise_giris_tarihi', e.target.value)} />
              </div>
            </div>

            {/* GRUP 4: FİNANSAL VE İZİN PARAMETRELERİ */}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--accent-patron)', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginTop: 22 }}>
              4. Finansal, Maaş ve Yıllık İzin Parametreleri
            </h3>
            <div className="grid cols-4" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <div>
                <label>Saatlik Brüt Ücret (PLN / Saat) *</label>
                <input type="number" step="0.01" placeholder="0.00" value={form.gunluk_ucret} onChange={(e) => formGuncelle('gunluk_ucret', e.target.value)} required />
              </div>
              <div>
                <label>Yıllık İzin Hakkı (Gün)</label>
                <input type="number" placeholder="0" value={form.yillik_izin_hakki} onChange={(e) => formGuncelle('yillik_izin_hakki', e.target.value)} required />
              </div>
              <div>
                <label>Banka Adı</label>
                <input placeholder="örn. Santander Bank, PKO Bank" value={form.banka_adi} onChange={(e) => formGuncelle('banka_adi', e.target.value)} />
              </div>
              <div>
                <label>IBAN Numarası</label>
                <input placeholder="PL61 1090 ..." value={form.iban} onChange={(e) => formGuncelle('iban', e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label>Özel Kesinti, Ek Ödeme veya Özlük Notu</label>
              <input placeholder="örn. Lojman, yemek yardımı, vs." value={form.ozel_not} onChange={(e) => formGuncelle('ozel_not', e.target.value)} />
            </div>

            {/* GRUP 5: ÇALIŞMA VE AYRILIŞ DURUMU */}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--accent-patron)', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginTop: 22 }}>
              5. Çalışma Durumu & Ayrılış Kaydı
            </h3>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <div>
                <label>Çalışma Durumu</label>
                <select value={form.durum} onChange={(e) => formGuncelle('durum', e.target.value)}>
                  <option value="Aktif">🟢 Aktif Çalışıyor</option>
                  <option value="Ayrıldı">🔴 İşten Ayrıldı / Çıkışı Verildi</option>
                </select>
              </div>
              {form.durum === 'Ayrıldı' && (
                <>
                  <div>
                    <label>İşten Ayrılış Tarihi</label>
                    <input type="date" value={form.isten_ayrilis_tarihi} onChange={(e) => formGuncelle('isten_ayrilis_tarihi', e.target.value)} />
                  </div>
                  <div>
                    <label>Ayrılma Nedeni</label>
                    <input placeholder="örn. Sözleşme bitti, istifa vb." value={form.ayrilma_nedeni} onChange={(e) => formGuncelle('ayrilma_nedeni', e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="submit" className="action btn-punch" style={{ width: 'auto', padding: '10px 24px' }} disabled={kaydediliyor}>
                {kaydediliyor ? 'Kaydediliyor...' : (duzenlenenId ? '💾 Değişiklikleri Kaydet' : '✓ Personeli Sisteme Kaydet')}
              </button>
              <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setAltSekme('liste')}>
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. SEKME: İZİN VE AVANS TALEPLERİ & PATRON ONAYI */}
      {altSekme === 'izinler' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => { setTalepTuru('izin'); setMesaj(null); }}
              className={`action ${talepTuru === 'izin' ? 'btn-punch' : 'btn-secondary'}`}
              style={{ width: 'auto', margin: 0, padding: '8px 18px', fontSize: 12, fontWeight: 700 }}
            >
              🏖️ İzin Talepleri {bekleyenIzinSayisi > 0 && `(${bekleyenIzinSayisi})`}
            </button>
            <button
              type="button"
              onClick={() => { setTalepTuru('avans'); setMesaj(null); }}
              className={`action ${talepTuru === 'avans' ? 'btn-punch' : 'btn-secondary'}`}
              style={{ width: 'auto', margin: 0, padding: '8px 18px', fontSize: 12, fontWeight: 700 }}
            >
              💵 Avans Talepleri {bekleyenAvansSayisi > 0 && `(${bekleyenAvansSayisi})`}
            </button>
          </div>

          {/* İZİN TALEPLERİ LİSTESİ */}
          {talepTuru === 'izin' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <h2 className="section" style={{ margin: 0 }}>🏖️ Personel İzin Talepleri ve Onay Yönetimi</h2>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Onaylanan izinler sistemde <b>otomatik olarak puantaj matrisine 'İzinli (İ)'</b> olarak işlenir ve yıllık izin bakiyesinden düşer.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={izinFiltre} onChange={(e) => setIzinFiltre(e.target.value)} style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }}>
                    <option value="Tümü">Tüm Talepler</option>
                    <option value="Bekliyor">⏳ Bekleyenler ({bekleyenIzinSayisi})</option>
                    <option value="Onaylandı">✓ Onaylananlar</option>
                    <option value="Reddedildi">✕ Reddedilenler</option>
                  </select>
                </div>
              </div>

              {yukleniyor ? (
                <div style={{ color: 'var(--ink-soft)', padding: 14 }}>İzin talepleri yükleniyor...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>İzin Türü</th>
                        <th>Tarih Aralığı</th>
                        <th>Süre</th>
                        <th>Açıklama / Gerekçe</th>
                        <th>Talep Tarihi</th>
                        <th>Durum</th>
                        <th>İşlem / Karar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrelenmisIzinler.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <b>{t.ad}</b>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t.personel_no} · {t.lokasyon || 'Merkez'}</div>
                          </td>
                          <td><b>{t.izin_turu}</b></td>
                          <td>{t.baslangic} ➔ {t.bitis}</td>
                          <td><span className="status-tag open">{t.gun_sayisi} iş günü</span></td>
                          <td style={{ fontSize: 12, maxWidth: 220 }}>{t.neden || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{new Date(t.tarih).toLocaleDateString('tr-TR')}</td>
                          <td>
                            <span className={`status-tag ${t.durum === 'Onaylandı' ? 'open' : (t.durum === 'Reddedildi' ? 'closed' : '')}`}>
                              {t.durum === 'Onaylandı' ? '✓ Onaylandı' : (t.durum === 'Reddedildi' ? '✕ Reddedildi' : '⏳ Bekliyor')}
                            </span>
                            {t.patron_notu && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>{t.patron_notu}</div>}
                          </td>
                          <td>
                            {t.durum === 'Bekliyor' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="action btn-punch"
                                  style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: 11, background: '#16a34a' }}
                                  onClick={() => izinOnayla(t)}
                                  disabled={islemYapiliyor}
                                  title="İzni Onayla ve Puantaja Otomatik İşle"
                                >
                                  ✓ Onayla
                                </button>
                                <button
                                  style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                  onClick={() => izinReddet(t)}
                                  disabled={islemYapiliyor}
                                  title="Talebi Reddet"
                                >
                                  ✕ Reddet
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>İşlem Tamamlandı</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filtrelenmisIzinler.length === 0 && (
                        <tr><td colSpan={8} style={{ color: 'var(--ink-soft)', padding: 14 }}>Filtreye uygun izin talebi bulunamadı.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* AVANS TALEPLERİ LİSTESİ */}
          {talepTuru === 'avans' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <h2 className="section" style={{ margin: 0 }}>💵 Personel Avans Talepleri ve Onay Yönetimi</h2>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Onaylanan avanslar <b>otomatik olarak personelin cari hesabına 'Avans'</b> olarak eklenir ve hakedişinden düşülür.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={avansFiltre} onChange={(e) => setAvansFiltre(e.target.value)} style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }}>
                    <option value="Tümü">Tüm Avanslar</option>
                    <option value="Bekliyor">⏳ Bekleyenler ({bekleyenAvansSayisi})</option>
                    <option value="Onaylandı">✓ Onaylananlar</option>
                    <option value="Reddedildi">✕ Reddedilenler</option>
                  </select>
                </div>
              </div>

              {yukleniyor ? (
                <div style={{ color: 'var(--ink-soft)', padding: 14 }}>Avans talepleri yükleniyor...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Personel</th>
                        <th>İstenen Tutar</th>
                        <th>Gerekçe / Açıklama</th>
                        <th>Talep Tarihi</th>
                        <th>Durum</th>
                        <th>Patron Notu</th>
                        <th>İşlem / Karar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrelenmisAvanslar.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <b>{a.ad}</b>
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{a.personel_no} · {a.lokasyon || 'Merkez'}</div>
                          </td>
                          <td><b style={{ color: 'var(--accent-patron)', fontSize: 14 }}>{formatPLN(a.tutar)}</b></td>
                          <td style={{ fontSize: 12, maxWidth: 240 }}>{a.neden || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{new Date(a.tarih).toLocaleDateString('tr-TR')}</td>
                          <td>
                            <span className={`status-tag ${a.durum === 'Onaylandı' ? 'open' : (a.durum === 'Reddedildi' ? 'closed' : '')}`}>
                              {a.durum === 'Onaylandı' ? '✓ Onaylandı' : (a.durum === 'Reddedildi' ? '✕ Reddedildi' : '⏳ Bekliyor')}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{a.patron_notu || '—'}</td>
                          <td>
                            {a.durum === 'Bekliyor' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="action btn-punch"
                                  style={{ width: 'auto', margin: 0, padding: '5px 10px', fontSize: 11, background: '#16a34a' }}
                                  onClick={() => avansOnayla(a)}
                                  disabled={islemYapiliyor}
                                  title="Avansı Onayla ve Cari Hesaba İşle"
                                >
                                  ✓ Onayla
                                </button>
                                <button
                                  style={{ border: 'none', background: 'rgba(220, 38, 38, 0.14)', color: '#ef4444', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                  onClick={() => avansReddet(a)}
                                  disabled={islemYapiliyor}
                                  title="Talebi Reddet"
                                >
                                  ✕ Reddet
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>İşlem Tamamlandı</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filtrelenmisAvanslar.length === 0 && (
                        <tr><td colSpan={7} style={{ color: 'var(--ink-soft)', padding: 14 }}>Filtreye uygun avans talebi bulunamadı.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   PERSONEL DEFTERİ — Tarih aralıklı Net Ödenecek özeti
   ================================================================== */
function PersonelDefteriTab() {
  const now = new Date();
  const ayBasi = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const aySonGun = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const aySonu = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(aySonGun).padStart(2, '0')}`;

  const [baslangicTarih, setBaslangicTarih] = useState(ayBasi);
  const [bitisTarih, setBitisTarih] = useState(aySonu);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ozetler, setOzetler] = useState([]);
  const [acikPersonel, setAcikPersonel] = useState(null);

  const veriyiYukle = useCallback(async () => {
    setYukleniyor(true);
    const b = new Date(baslangicTarih);
    const s = new Date(bitisTarih + 'T23:59:59');

    const [{ data: personel }, { toplamCalisilanSaat, calisilanGunSayisi }, { data: masraflar }, { data: fmKayitlari }] = await Promise.all([
      supabase.from('personel').select('personel_no, ad, rol, gunluk_ucret').neq('rol', 'patron').order('ad'),
      aralikCalismaGunleriGetir(baslangicTarih, bitisTarih),
      supabase.from('saha_verileri').select('*').gte('tarih', b.toISOString()).lte('tarih', s.toISOString()),
      supabase.from('aylik_fazla_mesai').select('*'),
    ]);

    const sonuc = (personel || []).map((p) => {
      const saatlikUcret = Number(p.gunluk_ucret) || 0;
      const calisilanSaat = toplamCalisilanSaat(p.personel_no);
      const calisilanGun = calisilanGunSayisi(p.personel_no);

      const kendiFm = (fmKayitlari || []).filter((f) => f.personel_no === p.personel_no && ayAralikIcinde(f.yil, f.ay, b, s));
      const fmSaat = kendiFm.reduce((a, f) => a + (Number(f.saat) || 0), 0);

      const hakedisTutari = (calisilanSaat * saatlikUcret) + (fmSaat * (saatlikUcret * 1.5));

      const kendiMasraflar = (masraflar || []).filter((m) => m.personel_no === p.personel_no);
      const toplamMasraf = kendiMasraflar.filter((m) => getIslemKategori(m) === 'harcama').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamAvans = kendiMasraflar.filter((m) => getIslemKategori(m) === 'avans').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamPrim = kendiMasraflar.filter((m) => getIslemKategori(m) === 'prim').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const toplamKesinti = kendiMasraflar.filter((m) => getIslemKategori(m) === 'kesinti').reduce((a, m) => a + (Number(m.toplam) || 0), 0);
      const odenmisMaas = kendiMasraflar.filter((m) => getIslemKategori(m) === 'maas_odeme').reduce((a, m) => a + (Number(m.toplam) || 0), 0);

      const netOdenecek = hakedisTutari + toplamMasraf + toplamPrim - toplamAvans - toplamKesinti - odenmisMaas;

      return {
        personel_no: p.personel_no, ad: p.ad, rol: p.rol, saatlikUcret,
        calisilanSaat, calisilanGun, fmSaat, hakedisTutari, toplamMasraf, toplamAvans, toplamPrim, toplamKesinti, odenmisMaas, netOdenecek,
        masrafKayitlari: kendiMasraflar.filter((m) => getIslemKategori(m) !== 'bilgi_kaydi'),
      };
    });

    setOzetler(sonuc.sort((a, c) => a.ad.localeCompare(c.ad, 'tr')));
    setYukleniyor(false);
  }, [baslangicTarih, bitisTarih]);

  useEffect(() => { veriyiYukle(); }, [veriyiYukle]);

  function disaAktar() {
    excelIndir(
      ozetler.map((o) => ({
        Personel: o.ad, 'Personel No': o.personel_no, 'Saatlik Ücret (PLN)': o.saatlikUcret, 'Çalışılan Süre': sureFormatla(o.calisilanSaat), 'Çalışılan Gün': o.calisilanGun, 'FM Saati': o.fmSaat,
        'Hakediş Tutarı': o.hakedisTutari.toFixed(2), 'Toplam Masraf': o.toplamMasraf.toFixed(2),
        'Toplam Prim': (o.toplamPrim || 0).toFixed(2), 'Toplam Avans': o.toplamAvans.toFixed(2),
        'Toplam Kesinti': (o.toplamKesinti || 0).toFixed(2), 'Net Ödenecek': o.netOdenecek.toFixed(2),
      })),
      'personel-defteri-' + baslangicTarih + '_' + bitisTarih + '.xlsx'
    );
  }

  const genelNet = ozetler.reduce((a, o) => a + o.netOdenecek, 0);

  return (
    <div className="card">
      <h2 className="section">📋 Personel Çalışma ve Hakediş Defteri</h2>
      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <div>
          <label>Başlangıç tarihi</label>
          <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} />
        </div>
        <div>
          <label>Bitiş tarihi</label>
          <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="action btn-secondary" style={{ margin: 0 }} onClick={disaAktar} disabled={!ozetler.length}>
            📊 Excel Aktar
          </button>
        </div>
      </div>

      <div className="stat-card" style={{ marginTop: 14 }}>
        <div className="label">Dönem Genel Net Ödenecek</div>
        <div className="value">{formatPLN(genelNet)}</div>
      </div>

      {yukleniyor ? (
        <div style={{ marginTop: 14, color: 'var(--ink-soft)' }}>Yükleniyor...</div>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {ozetler.map((o) => (
            <div key={o.personel_no} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}
                onClick={() => setAcikPersonel(acikPersonel === o.personel_no ? null : o.personel_no)}
              >
                <div>
                  <b>{o.ad}</b> <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>· {o.personel_no} ({o.rol}) — {o.saatlikUcret} PLN/sa</span>
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                  <span>⏱ <b style={{ color: 'var(--accent-patron)' }}>{sureFormatla(o.calisilanSaat)}</b> ({o.calisilanGun} gün){o.fmSaat ? ' + ' + o.fmSaat + ' sa FM' : ''}</span>
                  {o.toplamMasraf > 0 && <span style={{ color: '#16a34a' }}>+{formatPLN(o.toplamMasraf)} Masraf</span>}
                  {o.toplamPrim > 0 && <span style={{ color: '#16a34a' }}>+{formatPLN(o.toplamPrim)} Prim</span>}
                  {o.toplamAvans > 0 && <span style={{ color: '#dc2626' }}>-{formatPLN(o.toplamAvans)} Avans</span>}
                  {o.toplamKesinti > 0 && <span style={{ color: '#dc2626' }}>-{formatPLN(o.toplamKesinti)} Kesinti</span>}
                  <b>= {formatPLN(o.netOdenecek)}</b>
                  <span style={{ fontSize: 11 }}>{acikPersonel === o.personel_no ? '▲' : '▼'}</span>
                </div>
              </div>

              {acikPersonel === o.personel_no && (
                <div style={{ marginTop: 10 }}>
                  <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>Finansal Hareketler (Harcama, Avans, Prim, Kesinti)</h3>
                  {o.masrafKayitlari.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Kayıt yok.</div>
                  ) : (
                    <table>
                      <thead><tr><th>Tarih</th><th>Tür</th><th>Lokasyon</th><th>Kalem</th><th>Tutar</th><th>Fiş No</th><th>Açıklama</th></tr></thead>
                      <tbody>
                        {o.masrafKayitlari.map((m) => {
                          const kat = getIslemKategori(m);
                          return (
                            <tr key={m.id}>
                              <td>{new Date(m.tarih || m.created_at).toLocaleDateString('tr-TR')}</td>
                              <td>
                                <span className={`status-tag ${kat === 'prim' ? 'open' : ''}`}>
                                  {kat === 'avans' ? '💵 Avans' : (kat === 'prim' ? '🎁 Prim' : (kat === 'kesinti' ? '⚠️ Kesinti' : (kat === 'maas_odeme' ? '💰 Maaş' : '🧾 Masraf')))}
                                </span>
                              </td>
                              <td>{m.lokasyon}</td>
                              <td>{m.kalem_turu === 'AVANS_TALEBI' ? 'Avans Talebi' : (m.kalem_turu || '—')}</td>
                              <td><b>{formatPLN(m.toplam)}</b></td>
                              <td>{m.fis_no || '—'}</td>
                              <td style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 280 }}>{formatIslemAciklama(m)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
          {ozetler.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Henüz personel yok.</div>}
        </div>
      )}
    </div>
  );
}

function ayAralikIcinde(yil, ay, baslangic, bitis) {
  const ayBasi = new Date(yil, ay - 1, 1);
  const aySonu = new Date(yil, ay, 0, 23, 59, 59);
  return ayBasi <= bitis && aySonu >= baslangic;
}
