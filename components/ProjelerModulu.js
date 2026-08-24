'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';

const RENKLER = [
  { ad: 'Kırmızı', kod: '#ef4444' },
  { ad: 'Sarı', kod: '#eab308' },
  { ad: 'Mavi', kod: '#3b82f6' },
  { ad: 'Yeşil', kod: '#22c55e' },
  { ad: 'Turuncu', kod: '#f97316' },
  { ad: 'Beyaz', kod: '#ffffff' },
  { ad: 'Siyah', kod: '#0f172a' },
];

const KALINLIKLAR = [
  { ad: 'İnce', px: 2 },
  { ad: 'Normal', px: 4 },
  { ad: 'Kalın', px: 8 },
  { ad: 'Fosforlu (Geniş)', px: 18 },
];

function getProjeHedefKitle(baslik) {
  if (!baslik) return 'hepsi';
  const str = String(baslik).toLowerCase();
  if (str.includes('[hedef: formen]') || str.includes('[sadece formen]') || str.includes('[formen]')) return 'formen';
  if (str.includes('[hedef: personel]') || str.includes('[sadece personel]') || str.includes('[personel]')) return 'personel';
  return 'hepsi';
}

function formatProjeBaslik(baslik) {
  return String(baslik || '')
    .replace(/\[Hedef:\s*(Formen|Personel|Hepsi)\]/gi, '')
    .replace(/\[Sadece\s*(Formen|Personel)\]/gi, '')
    .trim();
}

export default function ProjelerModulu({ rol = 'patron', oturum = null }) {
  const { t } = useLocale();
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [seciliLokasyon, setSeciliLokasyon] = useState('');
  const [projeler, setProjeler] = useState([]);
  const [seciliProje, setSeciliProje] = useState(null);
  const [notlar, setNotlar] = useState([]);
  
  // Yükleme formu state
  const [yeniBaslik, setYeniBaslik] = useState('');
  const [yeniKategori, setYeniKategori] = useState(''); // Patron serbest yazar
  const [yeniRevizyonNo, setYeniRevizyonNo] = useState('Rev.0');
  const [hedefKitle, setHedefKitle] = useState('hepsi'); // 'hepsi' | 'formen' | 'personel'
  const [yeniDosya, setYeniDosya] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  // Pin & Çizim Modu State
  const [aktifMod, setAktifMod] = useState('incele'); // 'incele' | 'pin' | 'kalem' | 'vurgulayici' | 'ok' | 'dikdortgen' | 'metin'
  const [cizimRengi, setCizimRengi] = useState('#ef4444');
  const [cizimKalinligi, setCizimKalinligi] = useState(4);
  const [zoomSeviyesi, setZoomSeviyesi] = useState(1);
  const [yeniPin, setYeniPin] = useState(null);
  const [pinMetni, setPinMetni] = useState('');
  const [acikPin, setAcikPin] = useState(null);

  // Kaydet & Gönder Diyalog State
  const [kaydetGonderModalAcik, setKaydetGonderModalAcik] = useState(false);
  const [gonderiHedefKitle, setGonderiHedefKitle] = useState('hepsi');
  const [gonderiRevizyonNotu, setGonderiRevizyonNotu] = useState('');

  // Canvas & Çizim State
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [cizimYapiyor, setCizimYapiyor] = useState(false);
  const [cizimBaslangic, setCizimBaslangic] = useState({ x: 0, y: 0 });
  const [gecmisCizimler, setGecmisCizimler] = useState([]); // Geri alma (Undo) için
  const [metinKutusu, setMetinKutusu] = useState(null); // { x, y, metin }

  // Lokasyonları Yükle
  useEffect(() => {
    supabase.from('lokasyonlar').select('*').then(({ data }) => {
      setLokasyonlar(data || []);
      if (data && data.length) {
        if (oturum?.lokasyon && data.some(l => l.ad === oturum.lokasyon)) {
          setSeciliLokasyon(oturum.lokasyon);
        } else {
          setSeciliLokasyon(data[0].ad);
        }
      }
    });
  }, [oturum]);

  // Projeleri Yükle
  const projeleriYukle = useCallback(async () => {
    if (!seciliLokasyon) return;
    const { data, error } = await supabase
      .from('projeler')
      .select('*')
      .eq('lokasyon', seciliLokasyon)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('Projeler yüklenirken hata:', error);
      return;
    }

    // Personel / Formen rol filtrelemesi
    let filtrelenmis = data || [];
    if (rol === 'formen') {
      filtrelenmis = filtrelenmis.filter(p => {
        const hk = getProjeHedefKitle(p.baslik);
        return hk === 'hepsi' || hk === 'formen';
      });
    } else if (rol === 'personel') {
      filtrelenmis = filtrelenmis.filter(p => {
        const hk = getProjeHedefKitle(p.baslik);
        return hk === 'hepsi' || hk === 'personel';
      });
    }

    setProjeler(filtrelenmis);
  }, [seciliLokasyon, rol]);

  useEffect(() => {
    projeleriYukle();
    setSeciliProje(null);
  }, [seciliLokasyon, projeleriYukle]);

  // Pin / Notları Yükle
  const notlariYukle = async (projeId) => {
    const { data } = await supabase
      .from('proje_notlari')
      .select('*')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: true });
    setNotlar(data || []);
  };

  const projeSec = async (p) => {
    setSeciliProje(p);
    setAcikPin(null);
    setYeniPin(null);
    setAktifMod('incele');
    setZoomSeviyesi(1);
    setGecmisCizimler([]);
    setMetinKutusu(null);
    setKaydetGonderModalAcik(false);
    await notlariYukle(p.id);
  };

  // Yeni Proje (PDF veya Görsel) Ekle & Gönder
  const projeEkle = async (e) => {
    e.preventDefault();
    setMesaj(null);
    if (!yeniBaslik.trim() || !yeniDosya) {
      setMesaj({ tip: 'err', metin: 'Lütfen proje başlığı ve CAD/PDF/Plan dosyasını seçiniz.' });
      return;
    }

    setYukleniyor(true);
    try {
      const uzanti = yeniDosya.name.split('.').pop();
      const dosyaAdi = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${uzanti}`;
      
      const { error: yuklemeHatasi } = await supabase.storage
        .from('proje-resimleri')
        .upload(dosyaAdi, yeniDosya);

      if (yuklemeHatasi) throw yuklemeHatasi;

      const { data: urlData } = supabase.storage
        .from('proje-resimleri')
        .getPublicUrl(dosyaAdi);

      const kategoriMetni = yeniKategori.trim() ? ` [${yeniKategori.trim()}]` : '';
      const revizyonMetni = yeniRevizyonNo.trim() ? ` [${yeniRevizyonNo.trim()}]` : '';
      const hedefKitleMetni = hedefKitle === 'formen' ? ' [Hedef: Formen]' : (hedefKitle === 'personel' ? ' [Hedef: Personel]' : '');
      const tamBaslik = `${yeniBaslik.trim()}${kategoriMetni}${revizyonMetni}${hedefKitleMetni}`;

      const { error: insErr } = await supabase.from('projeler').insert({
        lokasyon: seciliLokasyon,
        baslik: tamBaslik,
        resim_url: urlData.publicUrl,
      });

      if (insErr) throw insErr;

      const kitleEtiketi = hedefKitle === 'formen' ? 'Sadece Formene' : (hedefKitle === 'personel' ? 'Sadece Sahadaki Personellere' : 'Tüm Şantiye Ekibine');
      setMesaj({ tip: 'ok', metin: `✅ Proje ve mimari plan başarıyla yüklendi ve ${kitleEtiketi} iletildi!` });
      setYeniBaslik('');
      setYeniKategori('');
      setYeniDosya(null);
      projeleriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Dosya yükleme hatası: ' + err.message });
    } finally {
      setYukleniyor(false);
    }
  };

  const isPdf = (url) => {
    return url && (url.toLowerCase().endsWith('.pdf') || url.includes('.pdf?'));
  };

  // Canvas Boyutlandırma & Görsel Çizimi
  const canvasGuncelle = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !seciliProje || isPdf(seciliProje.resim_url)) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = seciliProje.resim_url;
    img.onload = () => {
      canvas.width = img.naturalWidth || 1200;
      canvas.height = img.naturalHeight || 800;
      ctx.drawImage(img, 0, 0);
      
      // Geçmiş çizimleri tekrar çiz
      gecmisCizimler.forEach((c) => {
        cizimNesnesiniUygula(ctx, c);
      });
    };
  }, [seciliProje, gecmisCizimler]);

  useEffect(() => {
    if (seciliProje && !isPdf(seciliProje.resim_url)) {
      canvasGuncelle();
    }
  }, [seciliProje, canvasGuncelle]);

  function cizimNesnesiniUygula(ctx, item) {
    ctx.save();
    ctx.strokeStyle = item.renk;
    ctx.fillStyle = item.renk;
    ctx.lineWidth = item.kalinlik;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.tip === 'vurgulayici') {
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = item.kalinlik * 2.5;
    } else {
      ctx.globalAlpha = 1.0;
    }

    if (item.tip === 'kalem' || item.tip === 'vurgulayici') {
      ctx.beginPath();
      item.noktalar.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    } else if (item.tip === 'dikdortgen') {
      ctx.beginPath();
      ctx.rect(item.x, item.y, item.w, item.h);
      ctx.stroke();
    } else if (item.tip === 'ok') {
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      ctx.lineTo(item.x2, item.y2);
      ctx.stroke();
      const aci = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
      const okBoyu = Math.max(16, item.kalinlik * 3);
      ctx.beginPath();
      ctx.moveTo(item.x2, item.y2);
      ctx.lineTo(item.x2 - okBoyu * Math.cos(aci - Math.PI / 6), item.y2 - okBoyu * Math.sin(aci - Math.PI / 6));
      ctx.lineTo(item.x2 - okBoyu * Math.cos(aci + Math.PI / 6), item.y2 - okBoyu * Math.sin(aci + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (item.tip === 'metin') {
      ctx.font = `bold ${Math.max(16, item.kalinlik * 4)}px sans-serif`;
      const textWidth = ctx.measureText(item.metin).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(item.x - 4, item.y - 20, textWidth + 8, 26);
      ctx.fillStyle = item.renk;
      ctx.fillText(item.metin, item.x, item.y);
    }
    ctx.restore();
  }

  function koordinatAl(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function cizimBaslat(e) {
    if (['kalem', 'vurgulayici', 'ok', 'dikdortgen'].includes(aktifMod)) {
      e.preventDefault();
      const pos = koordinatAl(e);
      setCizimYapiyor(true);
      setCizimBaslangic(pos);

      if (aktifMod === 'kalem' || aktifMod === 'vurgulayici') {
        const yeniItem = {
          tip: aktifMod,
          renk: cizimRengi,
          kalinlik: cizimKalinligi,
          noktalar: [pos],
        };
        setGecmisCizimler((onceki) => [...onceki, yeniItem]);
      }
    } else if (aktifMod === 'metin') {
      const pos = koordinatAl(e);
      setMetinKutusu({ x: pos.x, y: pos.y, metin: '' });
    } else if (aktifMod === 'pin') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
      const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);
      const xPercent = ((clientX - rect.left) / rect.width) * 100;
      const yPercent = ((clientY - rect.top) / rect.height) * 100;
      setYeniPin({ x: xPercent, y: yPercent });
      setPinMetni('');
    }
  }

  function cizimSurdur(e) {
    if (!cizimYapiyor) return;
    e.preventDefault();
    const pos = koordinatAl(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (aktifMod === 'kalem' || aktifMod === 'vurgulayici') {
      setGecmisCizimler((onceki) => {
        const kopya = [...onceki];
        const son = kopya[kopya.length - 1];
        if (son && son.noktalar) {
          son.noktalar.push(pos);
        }
        return kopya;
      });
      ctx.save();
      ctx.strokeStyle = cizimRengi;
      ctx.lineWidth = aktifMod === 'vurgulayici' ? cizimKalinligi * 2.5 : cizimKalinligi;
      ctx.globalAlpha = aktifMod === 'vurgulayici' ? 0.4 : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cizimBaslangic.x, cizimBaslangic.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      setCizimBaslangic(pos);
    }
  }

  function cizimBitir(e) {
    if (!cizimYapiyor) return;
    const pos = koordinatAl(e);
    setCizimYapiyor(false);

    if (aktifMod === 'dikdortgen') {
      const w = pos.x - cizimBaslangic.x;
      const h = pos.y - cizimBaslangic.y;
      if (Math.abs(w) > 5 && Math.abs(h) > 5) {
        setGecmisCizimler((onceki) => [
          ...onceki,
          {
            tip: 'dikdortgen',
            renk: cizimRengi,
            kalinlik: cizimKalinligi,
            x: cizimBaslangic.x,
            y: cizimBaslangic.y,
            w,
            h,
          },
        ]);
        canvasGuncelle();
      }
    } else if (aktifMod === 'ok') {
      const dist = Math.hypot(pos.x - cizimBaslangic.x, pos.y - cizimBaslangic.y);
      if (dist > 10) {
        setGecmisCizimler((onceki) => [
          ...onceki,
          {
            tip: 'ok',
            renk: cizimRengi,
            kalinlik: cizimKalinligi,
            x1: cizimBaslangic.x,
            y1: cizimBaslangic.y,
            x2: pos.x,
            y2: pos.y,
          },
        ]);
        canvasGuncelle();
      }
    }
  }

  function metinEkle() {
    if (!metinKutusu || !metinKutusu.metin.trim()) {
      setMetinKutusu(null);
      return;
    }
    setGecmisCizimler((onceki) => [
      ...onceki,
      {
        tip: 'metin',
        renk: cizimRengi,
        kalinlik: cizimKalinligi,
        x: metinKutusu.x,
        y: metinKutusu.y,
        metin: metinKutusu.metin.trim(),
      },
    ]);
    setMetinKutusu(null);
    setTimeout(canvasGuncelle, 50);
  }

  function geriAl() {
    setGecmisCizimler((onceki) => onceki.slice(0, -1));
    setTimeout(canvasGuncelle, 50);
  }

  function cizimleriTemizle() {
    if (confirm('Tüm çizim ve işaretlemeleri temizlemek istiyor musunuz?')) {
      setGecmisCizimler([]);
      setTimeout(canvasGuncelle, 50);
    }
  }

  function isaretlenmisPlaniIndir() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Revize-${seciliProje.baslik.replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // 💾 İŞARETLENMİŞ PLANI KAYDET VE ŞANTİYEYE (FORMEN / İŞÇİLERE) GÖNDER
  async function planiKaydetVeGonder() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setYukleniyor(true);
    setMesaj(null);
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const dosyaAdi = `revize-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.jpg`;

      const { error: upErr } = await supabase.storage
        .from('proje-resimleri')
        .upload(dosyaAdi, blob);

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('proje-resimleri')
        .getPublicUrl(dosyaAdi);

      const kimden = oturum?.ad ? `${oturum.ad} (${rol.toUpperCase()})` : 'Saha';
      const notMetni = gonderiRevizyonNotu.trim() ? ` [${gonderiRevizyonNotu.trim()}]` : '';
      const hedefKitleMetni = gonderiHedefKitle === 'formen' ? ' [Hedef: Formen]' : (gonderiHedefKitle === 'personel' ? ' [Hedef: Personel]' : '');
      const temizMevcutBaslik = formatProjeBaslik(seciliProje.baslik);
      const yeniBaslikMetni = `${temizMevcutBaslik} [${kimden} Revizyonu]${notMetni}${hedefKitleMetni}`;

      const { error: insErr } = await supabase.from('projeler').insert({
        lokasyon: seciliLokasyon,
        baslik: yeniBaslikMetni,
        resim_url: urlData.publicUrl,
      });

      if (insErr) throw insErr;

      const hedefMetin = gonderiHedefKitle === 'formen' ? '⭐ Sadece Formene' : (gonderiHedefKitle === 'personel' ? '👷 Sadece Sahadaki Personellere' : '👥 Tüm Şantiye Ekibine');
      setMesaj({ tip: 'ok', metin: `✅ İşaretlenmiş revize plan kaydedildi ve ${hedefMetin} başarıyla iletildi!` });
      setKaydetGonderModalAcik(false);
      setGonderiRevizyonNotu('');
      projeleriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Revizyon kaydedilemedi: ' + err.message });
    } finally {
      setYukleniyor(false);
    }
  }

  // Pin Kaydet
  async function pinKaydet() {
    if (!pinMetni.trim() || !yeniPin) return;
    const kimden = oturum?.ad || (rol === 'patron' ? 'Patron' : 'Formen / Saha');
    const { error } = await supabase.from('proje_notlari').insert({
      proje_id: seciliProje.id,
      x: yeniPin.x,
      y: yeniPin.y,
      aciklama: pinMetni.trim(),
      durum: 'Açık',
      olusturan: kimden,
    });
    if (error) { setMesaj({ tip: 'err', metin: error.message }); return; }
    setYeniPin(null);
    setPinMetni('');
    setAktifMod('incele');
    notlariYukle(seciliProje.id);
  }

  async function pinDurumGuncelle(pinId, yeniDurum) {
    const kimden = oturum?.ad || (rol === 'patron' ? 'Patron' : 'Formen');
    await supabase.from('proje_notlari').update({
      durum: yeniDurum,
      cozen: yeniDurum === 'Çözüldü' ? kimden : null,
    }).eq('id', pinId);
    notlariYukle(seciliProje.id);
    setAcikPin(null);
  }

  async function pinSil(id) {
    if (!confirm('Bu not pinini silmek istediğinize emin misiniz?')) return;
    await supabase.from('proje_notlari').delete().eq('id', id);
    setAcikPin(null);
    notlariYukle(seciliProje.id);
  }

  async function projeSil(pId, baslik) {
    if (!confirm(`"${baslik}" adlı projeyi ve ilişkili tüm çizim notlarını silmek istediğinize emin misiniz?`)) return;
    await supabase.from('proje_notlari').delete().eq('proje_id', pId);
    await supabase.from('projeler').delete().eq('id', pId);
    setSeciliProje(null);
    projeleriYukle();
  }

  return (
    <div>
      <style>{`
        @keyframes pinNabiz { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); } 70% { box-shadow: 0 0 0 12px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
        .proje-pin { position: absolute; width: 24px; height: 24px; border-radius: 50%; transform: translate(-50%, -50%); cursor: pointer; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #fff; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .proje-pin.acik { background: #ef4444; animation: pinNabiz 1.8s infinite; }
        .proje-pin.cozuldu { background: #16a34a; }
        .arac-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.15s; }
        .arac-btn.aktif { background: var(--accent-patron); color: #fff; border-color: var(--accent-patron); }
      `}</style>

      {/* DETAY & ÇİZİM EKRANI */}
      {seciliProje ? (
        <div className="card" style={{ padding: 16 }}>
          {/* Üst Başlık & Kontrol Çubuğu */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '6px 14px' }} onClick={() => setSeciliProje(null)}>
                ← Projelere Dön
              </button>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{formatProjeBaslik(seciliProje.baslik)}</h2>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>📍 {seciliProje.lokasyon}</span>
                  <span>📅 {new Date(seciliProje.created_at).toLocaleDateString('tr-TR')}</span>
                  <span style={{ background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                    {getProjeHedefKitle(seciliProje.baslik) === 'formen' ? '⭐ Sadece Formen' : (getProjeHedefKitle(seciliProje.baslik) === 'personel' ? '👷 Sadece Personel' : '👥 Tüm Ekip')}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href={seciliProje.resim_url}
                target="_blank"
                rel="noreferrer"
                className="action btn-secondary"
                style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}
              >
                📥 Orijinal Dosyayı Aç / İndir
              </a>
              {!isPdf(seciliProje.resim_url) && (
                <>
                  <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }} onClick={isaretlenmisPlaniIndir}>
                    📸 İndir (PNG)
                  </button>
                  <button
                    className="action btn-punch"
                    style={{ width: 'auto', margin: 0, padding: '6px 16px', fontSize: 12, background: 'var(--accent-patron)' }}
                    onClick={() => setKaydetGonderModalAcik(true)}
                  >
                    💾 Kaydet & Şantiyeye Gönder
                  </button>
                </>
              )}
              {rol === 'patron' && (
                <button
                  className="action btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '6px 10px', fontSize: 12, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={() => projeSil(seciliProje.id, seciliProje.baslik)}
                >
                  Sil
                </button>
              )}
            </div>
          </div>

          {/* DÜZENLEME & ÇİZİM ARAÇ ÇUBUĞU (PDF Dışındaki Planlar İçin) */}
          {!isPdf(seciliProje.resim_url) && (
            <div style={{ background: 'var(--bg-soft)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {/* Araçlar */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-soft)', marginRight: 4 }}>ARAÇLAR:</span>
                <button className={`arac-btn ${aktifMod === 'incele' ? 'aktif' : ''}`} onClick={() => setAktifMod('incele')}>
                  🔍 İncele / Kaydır
                </button>
                <button className={`arac-btn ${aktifMod === 'kalem' ? 'aktif' : ''}`} onClick={() => setAktifMod('kalem')}>
                  ✏️ Kalem
                </button>
                <button className={`arac-btn ${aktifMod === 'vurgulayici' ? 'aktif' : ''}`} onClick={() => setAktifMod('vurgulayici')}>
                  🖍️ Fosforlu
                </button>
                <button className={`arac-btn ${aktifMod === 'ok' ? 'aktif' : ''}`} onClick={() => setAktifMod('ok')}>
                  ↗️ Revizyon Oku
                </button>
                <button className={`arac-btn ${aktifMod === 'dikdortgen' ? 'aktif' : ''}`} onClick={() => setAktifMod('dikdortgen')}>
                  🔲 Alan Kutusu
                </button>
                <button className={`arac-btn ${aktifMod === 'metin' ? 'aktif' : ''}`} onClick={() => setAktifMod('metin')}>
                  🔤 Not Yaz
                </button>
                <button className={`arac-btn ${aktifMod === 'pin' ? 'aktif' : ''}`} onClick={() => setAktifMod('pin')}>
                  📍 Hata Pini ({notlar.filter(n => n.durum === 'Açık').length} Açık)
                </button>
              </div>

              {/* Renk & Kalınlık & Zoom Seçici */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Renkler */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {RENKLER.map((r) => (
                    <div
                      key={r.kod}
                      onClick={() => setCizimRengi(r.kod)}
                      title={r.ad}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', background: r.kod,
                        border: cizimRengi === r.kod ? '2.5px solid var(--ink)' : '1px solid rgba(0,0,0,0.2)',
                        cursor: 'pointer', transform: cizimRengi === r.kod ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.1s'
                      }}
                    />
                  ))}
                </div>

                {/* Kalınlık */}
                <select
                  value={cizimKalinligi}
                  onChange={(e) => setCizimKalinligi(Number(e.target.value))}
                  style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }}
                >
                  {KALINLIKLAR.map((k) => <option key={k.px} value={k.px}>{k.ad}</option>)}
                </select>

                {/* Zoom */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }} onClick={() => setZoomSeviyesi(z => Math.max(0.5, z - 0.25))}>-</button>
                  <span style={{ fontSize: 11, fontWeight: 700, minWidth: 42, textAlign: 'center' }}>{Math.round(zoomSeviyesi * 100)}%</span>
                  <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }} onClick={() => setZoomSeviyesi(z => Math.min(3, z + 0.25))}>+</button>
                </div>

                {/* Geri Al & Temizle */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }} onClick={geriAl} disabled={gecmisCizimler.length === 0} title="Son Çizimi Geri Al">
                    ↩️
                  </button>
                  <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '4px 8px', fontSize: 11 }} onClick={cizimleriTemizle} disabled={gecmisCizimler.length === 0} title="Çizimleri Temizle">
                    🧹
                  </button>
                </div>
              </div>
            </div>
          )}

          {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginBottom: 10 }}>{mesaj.metin}</div>}

          {/* PLAN GÖRÜNTÜLEME VE ÇİZİM ALANI */}
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              overflow: 'auto',
              maxHeight: '75vh',
              background: '#1e293b',
              borderRadius: 10,
              padding: 10,
              textAlign: 'center',
              border: '2px solid var(--border)',
            }}
          >
            {isPdf(seciliProje.resim_url) ? (
              // PDF Görüntüleyici
              <div style={{ height: '70vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: 'var(--card)', padding: '10px 14px', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>📄 AutoCAD / Mimari PDF Planı</span>
                  <a href={seciliProje.resim_url} target="_blank" rel="noreferrer" className="action btn-punch" style={{ width: 'auto', margin: 0, padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
                    Tam Ekran PDF Aç ↗
                  </a>
                </div>
                <iframe
                  src={`${seciliProje.resim_url}#toolbar=1&navpanes=0`}
                  title={seciliProje.baslik}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }}
                />
              </div>
            ) : (
              // Görsel & Canvas Çizim Alanı
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  transform: `scale(${zoomSeviyesi})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  cursor: aktifMod === 'incele' ? 'default' : 'crosshair',
                  touchAction: aktifMod === 'incele' ? 'auto' : 'none',
                }}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={cizimBaslat}
                  onMouseMove={cizimSurdur}
                  onMouseUp={cizimBitir}
                  onTouchStart={cizimBaslat}
                  onTouchMove={cizimSurdur}
                  onTouchEnd={cizimBitir}
                  style={{ maxWidth: '100%', display: 'block', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                />

                {/* HATA / REVİZYON PİNLERİ */}
                {notlar.map((n, idx) => (
                  <div
                    key={n.id}
                    className={`proje-pin ${n.durum === 'Açık' ? 'acik' : 'cozuldu'}`}
                    style={{ left: `${n.x}%`, top: `${n.y}%` }}
                    onClick={(e) => { e.stopPropagation(); setAcikPin(n); setYeniPin(null); }}
                    title={`${n.olusturan}: ${n.aciklama}`}
                  >
                    {idx + 1}
                  </div>
                ))}

                {/* Yeni Eklenen Pin */}
                {yeniPin && (
                  <div className="proje-pin acik" style={{ left: `${yeniPin.x}%`, top: `${yeniPin.y}%` }}>
                    !
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 🎯 KAYDET & ŞANTİYEYE GÖNDER DİYALOG MODALI */}
          {kaydetGonderModalAcik && (
            <div
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
              }}
              onClick={() => setKaydetGonderModalAcik(false)}
            >
              <div
                style={{
                  background: 'var(--card)', borderRadius: 14, padding: '22px', maxWidth: 460, width: '100%',
                  boxShadow: '0 16px 36px rgba(0,0,0,0.3)', border: '1px solid var(--border)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
                    💾 Planı Kaydet & Şantiyeye Gönder
                  </div>
                  <button onClick={() => setKaydetGonderModalAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kime Gönderilsin? (Hedef Kitle) *</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <button
                      type="button"
                      className={`arac-btn ${gonderiHedefKitle === 'hepsi' ? 'aktif' : ''}`}
                      style={{ padding: '10px 12px' }}
                      onClick={() => setGonderiHedefKitle('hepsi')}
                    >
                      👥 Tüm Şantiye Ekibi (Formen & Personeller)
                    </button>
                    <button
                      type="button"
                      className={`arac-btn ${gonderiHedefKitle === 'formen' ? 'aktif' : ''}`}
                      style={{ padding: '10px 12px' }}
                      onClick={() => setGonderiHedefKitle('formen')}
                    >
                      ⭐ Sadece Formen (Saha Şefi)
                    </button>
                    <button
                      type="button"
                      className={`arac-btn ${gonderiHedefKitle === 'personel' ? 'aktif' : ''}`}
                      style={{ padding: '10px 12px' }}
                      onClick={() => setGonderiHedefKitle('personel')}
                    >
                      👷 Sadece Sahadaki Personeller (İşçiler)
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Revizyon Notu / Talimat (Opsiyonel)</label>
                  <input
                    placeholder="Örn: 2. Kat buat yerleri ve kapı ölçüleri düzeltildi."
                    value={gonderiRevizyonNotu}
                    onChange={(e) => setGonderiRevizyonNotu(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="action btn-punch"
                    style={{ flex: 1, padding: '11px 0', fontSize: 13, fontWeight: 700 }}
                    onClick={planiKaydetVeGonder}
                    disabled={yukleniyor}
                  >
                    {yukleniyor ? 'Kaydediliyor...' : '✓ Kaydet & Şantiyeye İlet'}
                  </button>
                  <button
                    className="action btn-secondary"
                    style={{ width: 'auto', padding: '11px 16px' }}
                    onClick={() => setKaydetGonderModalAcik(false)}
                  >
                    İptal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* METİN YAZMA KUTUSU DİYALOGU */}
          {metinKutusu && (
            <div style={{ marginTop: 12, background: 'var(--bg-soft)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>🔤 Plan Üzerine Not:</span>
              <input
                autoFocus
                placeholder="Örn: Buradaki kapı 90cm -> 100cm yapılacak"
                value={metinKutusu.metin}
                onChange={(e) => setMetinKutusu({ ...metinKutusu, metin: e.target.value })}
                style={{ flex: 1, margin: 0, padding: '7px 10px' }}
                onKeyDown={(e) => { if (e.key === 'Enter') metinEkle(); }}
              />
              <button className="action btn-punch" style={{ width: 'auto', margin: 0, padding: '7px 14px' }} onClick={metinEkle}>
                Ekle
              </button>
              <button className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '7px 10px' }} onClick={() => setMetinKutusu(null)}>
                İptal
              </button>
            </div>
          )}

          {/* YENİ PİN OLUŞTURMA KUTUSU */}
          {yeniPin && (
            <div style={{ marginTop: 12, background: 'var(--card)', border: '2px solid #ef4444', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#ef4444', marginBottom: 6 }}>
                📍 Plan Üzerinde Yeni Hata / Revizyon Notu İşaretleme
              </div>
              <input
                autoFocus
                placeholder="Örn: Bu duvarın aks ölçüsü projeyle uyuşmuyor, 20 cm kaydırılmalı."
                value={pinMetni}
                onChange={(e) => setPinMetni(e.target.value)}
                style={{ marginBottom: 8 }}
                onKeyDown={(e) => { if (e.key === 'Enter') pinKaydet(); }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="action btn-punch" style={{ width: 'auto', padding: '8px 18px' }} onClick={pinKaydet}>
                  Pini Kaydet
                </button>
                <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setYeniPin(null)}>
                  İptal
                </button>
              </div>
            </div>
          )}

          {/* TIKLANAN PİN DETAYI & ÇÖZÜLDÜ İŞARETLEME */}
          {acikPin && (
            <div style={{ marginTop: 14, background: 'var(--bg-soft)', border: '1px solid var(--border)', padding: 14, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-tag ${acikPin.durum === 'Açık' ? 'closed' : 'open'}`}>
                    {acikPin.durum === 'Açık' ? '🔴 Açık Hata / Revizyon' : '🟢 Çözüldü / Tamamlandı'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    Ekleyen: <b>{acikPin.olusturan || 'Saha Ekibi'}</b> ({new Date(acikPin.created_at).toLocaleString('tr-TR')})
                  </span>
                </div>
                <button onClick={() => setAcikPin(null)} style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 10, lineHeight: 1.5 }}>
                {acikPin.aciklama}
              </div>

              {acikPin.cozen && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
                  ✓ Çözen / Düzelten: <b>{acikPin.cozen}</b>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {acikPin.durum === 'Açık' ? (
                  <button className="action btn-punch" style={{ width: 'auto', background: '#16a34a', padding: '6px 14px', fontSize: 12 }} onClick={() => pinDurumGuncelle(acikPin.id, 'Çözüldü')}>
                    ✓ Sorunu Çözüldü Olarak İşaretle
                  </button>
                ) : (
                  <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => pinDurumGuncelle(acikPin.id, 'Açık')}>
                    Tekrar Aç
                  </button>
                )}
                <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12, color: '#ef4444' }} onClick={() => pinSil(acikPin.id)}>
                  Sil
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PROJE LİSTESİ VE YENİ PLAN YÜKLEME EKRANI */
        <div className="grid cols-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Sol Kolon: Proje Listesi */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
              <h2 className="section" style={{ margin: 0 }}>📐 Mimari Planlar & AutoCAD Çizimleri</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ margin: 0, fontSize: 12 }}>Şantiye:</label>
                <select value={seciliLokasyon} onChange={(e) => setSeciliLokasyon(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
                  {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
                </select>
              </div>
            </div>

            {projeler.length === 0 ? (
              <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--ink-soft)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                <b>Bu şantiyeye ait henüz bir proje veya plan yüklenmemiş.</b>
                <div style={{ fontSize: 12, marginTop: 4 }}>Sağ taraftaki panelden AutoCAD PDF veya mimari çizim görseli yükleyebilirsiniz.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {projeler.map((p) => {
                  const pdfMi = isPdf(p.resim_url);
                  return (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        cursor: 'pointer',
                        padding: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        background: 'var(--card)',
                      }}
                      onClick={() => projeSec(p)}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: 130,
                          borderRadius: 8,
                          background: 'rgba(127,127,127,0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          marginBottom: 8,
                        }}
                      >
                        {pdfMi ? (
                          <div style={{ textAlign: 'center', color: '#ef4444' }}>
                            <div style={{ fontSize: 36 }}>📑</div>
                            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>AutoCAD PDF</div>
                          </div>
                        ) : (
                          <img src={p.resim_url} alt={p.baslik} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', lineHeight: 1.3 }}>
                        {formatProjeBaslik(p.baslik)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: 'var(--ink-soft)' }}>
                        <span>📍 {p.lokasyon}</span>
                        <span style={{ background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                          {getProjeHedefKitle(p.baslik) === 'formen' ? '⭐ Formen' : (getProjeHedefKitle(p.baslik) === 'personel' ? '👷 Personel' : '👥 Tüm Ekip')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sağ Kolon: Yeni Plan / CAD PDF Yükleme Formu */}
          <div className="card">
            <h2 className="section">📤 Yeni Mimari Proje & Plan Yükle</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Mimar veya ofis tarafından AutoCAD üzerinden çizilen PDF paftalarını ve planları yükleyin.
            </div>

            <form onSubmit={projeEkle}>
              <label>Plan / Pafta Başlığı *</label>
              <input
                required
                placeholder="Örn: Zemin Kat Kalıp & Donatı Planı"
                value={yeniBaslik}
                onChange={(e) => setYeniBaslik(e.target.value)}
              />

              <div className="grid cols-2" style={{ marginTop: 10 }}>
                <div>
                  <label>Kategori / Proje Türü</label>
                  <input
                    placeholder="Örn: Mimari, Statik, Havalandırma vb."
                    value={yeniKategori}
                    onChange={(e) => setYeniKategori(e.target.value)}
                  />
                </div>
                <div>
                  <label>Revizyon No</label>
                  <input
                    placeholder="Rev.0, Rev.1 vb."
                    value={yeniRevizyonNo}
                    onChange={(e) => setYeniRevizyonNo(e.target.value)}
                  />
                </div>
              </div>

              {/* KİME GÖNDERİLECEK SEÇİMİ */}
              <div style={{ marginTop: 10 }}>
                <label>Kime Gönderilecek / Hedef Kitle *</label>
                <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    className={`arac-btn ${hedefKitle === 'hepsi' ? 'aktif' : ''}`}
                    style={{ padding: '8px 10px' }}
                    onClick={() => setHedefKitle('hepsi')}
                  >
                    👥 Tüm Şantiye Ekibi (Formen & Personel)
                  </button>
                  <button
                    type="button"
                    className={`arac-btn ${hedefKitle === 'formen' ? 'aktif' : ''}`}
                    style={{ padding: '8px 10px' }}
                    onClick={() => setHedefKitle('formen')}
                  >
                    ⭐ Sadece Formen (Saha Şefi)
                  </button>
                  <button
                    type="button"
                    className={`arac-btn ${hedefKitle === 'personel' ? 'aktif' : ''}`}
                    style={{ padding: '8px 10px' }}
                    onClick={() => setHedefKitle('personel')}
                  >
                    👷 Sadece Sahadaki Personeller (İşçiler)
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label>CAD PDF veya Çizim Dosyası (.pdf, .png, .jpg) *</label>
                <input
                  type="file"
                  required
                  accept=".pdf,image/*"
                  onChange={(e) => setYeniDosya(e.target.files?.[0] || null)}
                />
              </div>

              <button
                type="submit"
                className="action btn-punch"
                style={{ marginTop: 14 }}
                disabled={yukleniyor}
              >
                {yukleniyor ? 'Yükleniyor...' : '📤 Projeyi Sisteme Yükle & İlet'}
              </button>

              {mesaj && <div className={'feedback ' + mesaj.tip} style={{ marginTop: 10 }}>{mesaj.metin}</div>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
