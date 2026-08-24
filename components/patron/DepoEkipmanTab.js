'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';

function formatPLN(deger) {
  if (deger == null || isNaN(deger)) return '0.00 PLN';
  return Number(deger).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN';
}

function excelIndir(veriler, dosyaAdi) {
  const ws = XLSX.utils.json_to_sheet(veriler);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  XLSX.writeFile(wb, dosyaAdi);
}

export default function DepoEkipmanTab() {
  const { t } = useLocale();
  const [altSekme, setAltSekme] = useState('genel'); // 'genel' | 'ekipmanlar' | 'depolar' | 'hareketler' | 'bakim'
  
  // Ana veri state'leri
  const [ekipmanlar, setEkipmanlar] = useState([]);
  const [depolar, setDepolar] = useState([]);
  const [hareketler, setHareketler] = useState([]);
  const [arizalar, setArizalar] = useState([]);
  const [bakimlar, setBakimlar] = useState([]);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Filtreler & Arama
  const [aramaMetni, setAramaMetni] = useState('');
  const [filtreDurum, setFiltreDurum] = useState('Tümü');
  const [filtreKategori, setFiltreKategori] = useState('Tümü');
  const [filtreLokasyon, setFiltreLokasyon] = useState('Tümü');

  // Modal State'leri
  const [yeniEkipmanModal, setYeniEkipmanModal] = useState(false);
  const [yeniDepoModal, setYeniDepoModal] = useState(false);
  const [seciliEkipmanPasaport, setSeciliEkipmanPasaport] = useState(null);
  const [qrModalVeri, setQrModalVeri] = useState(null); // { baslik, kod, qrDataUrl }
  const [bakimEkleModal, setBakimEkleModal] = useState(null); // ekipman objesi
  const [arizaDetayModal, setArizaDetayModal] = useState(null);
  const [duzenlenenEkipman, setDuzenlenenEkipman] = useState(null);

  // Form State - Yeni Ekipman
  const [ekipmanForm, setEkipmanForm] = useState({
    kod: '',
    ad: '',
    marka: '',
    model: '',
    seri_no: '',
    kategori: 'Kırıcı & Delici',
    satin_alma_tarihi: new Date().toISOString().slice(0, 10),
    satin_alma_fiyati: '',
    aciklama: '',
    mevcut_depo_id: '',
    periyodik_bakim_gun: '180',
    son_bakim_tarihi: '',
    sonraki_bakim_tarihi: '',
  });
  const [ekipmanResimDosya, setEkipmanResimDosya] = useState(null);
  const [formYukleniyor, setFormYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  // Form State - Yeni Depo
  const [depoForm, setDepoForm] = useState({
    ad: '',
    kod: '',
    adres: '',
    yetkili_personel_no: '',
    aciklama: '',
  });

  // Form State - Yeni Bakım
  const [bakimForm, setBakimForm] = useState({
    bakim_turu: 'Periyodik Bakım',
    bakim_tarihi: new Date().toISOString().slice(0, 10),
    sonraki_bakim_tarihi: '',
    maliyet: '',
    servis_adi: '',
    fatura_fis_no: '',
    aciklama: '',
    yapilan_islemler: '',
  });

  // Tüm Verileri Yükle
  const verileriYukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [ekpRes, depRes, harRes, arzRes, bakRes, lokRes, perRes] = await Promise.all([
        supabase.from('ekipmanlar').select('*').order('created_at', { ascending: false }),
        supabase.from('depolar').select('*').order('created_at', { ascending: true }),
        supabase.from('ekipman_hareketleri').select('*').order('tarih', { ascending: false }).limit(200),
        supabase.from('ekipman_arizalari').select('*').order('tarih', { ascending: false }),
        supabase.from('ekipman_bakimlari').select('*').order('bakim_tarihi', { ascending: false }),
        supabase.from('lokasyonlar').select('*').order('ad', { ascending: true }),
        supabase.from('personel').select('*').neq('rol', 'patron').order('ad', { ascending: true }),
      ]);

      setEkipmanlar(ekpRes.data || []);
      setDepolar(depRes.data || []);
      setHareketler(harRes.data || []);
      setArizalar(arzRes.data || []);
      setBakimlar(bakRes.data || []);
      setLokasyonlar(lokRes.data || []);
      setPersoneller(perRes.data || []);
    } catch (err) {
      console.error('Veri yükleme hatası:', err);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    verileriYukle();
  }, [verileriYukle]);

  // Yeni Ekipman Kodu Üret (Örn: EQ-000042)
  const yeniKodUret = useCallback(() => {
    const mevcutSayi = ekipmanlar.length + 1;
    const rastgele = Math.floor(Math.random() * 900) + 100;
    return `EQ-${String(mevcutSayi).padStart(4, '0')}`;
  }, [ekipmanlar]);

  // QR Modal Aç
  const qrGoster = async (baslik, qrKoduMetni, sistemKodu) => {
    try {
      const dataUrl = await QRCode.toDataURL(qrKoduMetni, {
        width: 320,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrModalVeri({
        baslik,
        kod: sistemKodu || qrKoduMetni,
        qrKoduMetni,
        dataUrl,
      });
    } catch (err) {
      alert('QR kod üretilemedi: ' + err.message);
    }
  };

  // QR Etiketini Yazdır (Print Label)
  const qrYazdir = () => {
    if (!qrModalVeri) return;
    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Etiket - ${qrModalVeri.kod}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 20px; }
            .etiket { border: 2px solid #000; padding: 20px; border-radius: 12px; display: inline-block; max-width: 340px; margin: auto; }
            .baslik { font-size: 18px; font-weight: bold; margin-bottom: 6px; }
            .kod { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #1e40af; margin-bottom: 12px; }
            img { width: 220px; height: 220px; margin-bottom: 8px; }
            .alt-bilgi { font-size: 11px; color: #666; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="etiket">
            <div class="baslik">${qrModalVeri.baslik}</div>
            <div class="kod">${qrModalVeri.kod}</div>
            <img src="${qrModalVeri.dataUrl}" />
            <div class="alt-bilgi">Saha Takip Ekipman Takip Sistemi</div>
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Yeni Ekipman Kaydet
  const ekipmanKaydet = async (e) => {
    e.preventDefault();
    if (!ekipmanForm.ad.trim()) {
      alert('Lütfen ekipman adını giriniz.');
      return;
    }

    setFormYukleniyor(true);
    setMesaj(null);

    try {
      const kod = ekipmanForm.kod.trim() || yeniKodUret();
      const qrKodu = `EQ:${kod}`;

      let fotoUrl = null;
      if (ekipmanResimDosya) {
        const uzanti = ekipmanResimDosya.name.split('.').pop();
        const dosyaAdi = `ekipman-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${uzanti}`;
        const { error: upErr } = await supabase.storage.from('proje-resimleri').upload(dosyaAdi, ekipmanResimDosya);
        if (!upErr) {
          const { data: uData } = supabase.storage.from('proje-resimleri').getPublicUrl(dosyaAdi);
          fotoUrl = uData?.publicUrl || null;
        }
      }

      // Seçilen depo adı
      const seciliDepo = depolar.find((d) => d.id === ekipmanForm.mevcut_depo_id);
      const depoAd = seciliDepo ? seciliDepo.ad : (depolar[0]?.ad || 'Ana Depo - Merkez');
      const depoId = seciliDepo ? seciliDepo.id : (depolar[0]?.id || null);

      if (duzenlenenEkipman) {
        // Güncelleme
        const { error } = await supabase
          .from('ekipmanlar')
          .update({
            ad: ekipmanForm.ad.trim(),
            marka: ekipmanForm.marka.trim(),
            model: ekipmanForm.model.trim(),
            seri_no: ekipmanForm.seri_no.trim(),
            kategori: ekipmanForm.kategori,
            satin_alma_tarihi: ekipmanForm.satin_alma_tarihi || null,
            satin_alma_fiyati: Number(ekipmanForm.satin_alma_fiyati) || 0,
            aciklama: ekipmanForm.aciklama.trim(),
            periyodik_bakim_gun: Number(ekipmanForm.periyodik_bakim_gun) || 180,
            fotograf_url: fotoUrl || duzenlenenEkipman.fotograf_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', duzenlenenEkipman.id);

        if (error) throw error;
        setMesaj({ tip: 'ok', metin: '✅ Ekipman bilgileri başarıyla güncellendi.' });
      } else {
        // Yeni Kayıt
        const { data: yeniEkip, error } = await supabase
          .from('ekipmanlar')
          .insert({
            kod,
            ad: ekipmanForm.ad.trim(),
            marka: ekipmanForm.marka.trim(),
            model: ekipmanForm.model.trim(),
            seri_no: ekipmanForm.seri_no.trim(),
            kategori: ekipmanForm.kategori,
            qr_kodu: qrKodu,
            fotograf_url: fotoUrl,
            satin_alma_tarihi: ekipmanForm.satin_alma_tarihi || null,
            satin_alma_fiyati: Number(ekipmanForm.satin_alma_fiyati) || 0,
            para_birimi: 'PLN',
            aciklama: ekipmanForm.aciklama.trim(),
            durum: 'Depoda',
            mevcut_depo_id: depoId,
            mevcut_depo_ad: depoAd,
            mevcut_lokasyon: null,
            zimmetli_personel_no: null,
            zimmetli_personel_ad: null,
            son_hareket_tarihi: new Date().toISOString(),
            periyodik_bakim_gun: Number(ekipmanForm.periyodik_bakim_gun) || 180,
          })
          .select()
          .single();

        if (error) throw error;

        // İlk hareket kaydı
        await supabase.from('ekipman_hareketleri').insert({
          ekipman_id: yeniEkip.id,
          ekipman_kodu: yeniEkip.kod,
          ekipman_adi: yeniEkip.ad,
          islem_turu: 'Kayıt Oluşturma',
          eski_durum: null,
          yeni_durum: 'Depoda',
          eski_lokasyon: null,
          yeni_lokasyon: depoAd,
          islem_yapan_rol: 'patron',
          islem_yapan_ad: 'Patron',
          aciklama: 'Ekipman sisteme tanımlandı ve depoya eklendi.',
        });

        setMesaj({ tip: 'ok', metin: `✅ ${kod} kodlu yeni ekipman başarıyla sisteme kaydedildi!` });
      }

      setYeniEkipmanModal(false);
      setDuzenlenenEkipman(null);
      setEkipmanResimDosya(null);
      verileriYukle();
    } catch (err) {
      alert('Kayıt hatası: ' + err.message);
    } finally {
      setFormYukleniyor(false);
    }
  };

  // Yeni Depo Ekle
  const depoKaydet = async (e) => {
    e.preventDefault();
    if (!depoForm.ad.trim()) return;

    try {
      const kod = depoForm.kod.trim() || `DEPOT-${depolar.length + 1}`;
      const qrKodu = `DEPOT:${kod}`;

      const { error } = await supabase.from('depolar').insert({
        ad: depoForm.ad.trim(),
        kod,
        qr_kodu: qrKodu,
        adres: depoForm.adres.trim(),
        yetkili_personel_no: depoForm.yetkili_personel_no || null,
        aciklama: depoForm.aciklama.trim(),
      });

      if (error) throw error;

      setYeniDepoModal(false);
      setDepoForm({ ad: '', kod: '', adres: '', yetkili_personel_no: '', aciklama: '' });
      verileriYukle();
    } catch (err) {
      alert('Depo eklenemedi: ' + err.message);
    }
  };

  // Yeni Bakım Kaydı Ekle
  const bakimKaydet = async (e) => {
    e.preventDefault();
    if (!bakimEkleModal) return;

    try {
      const maliyetSayi = Number(bakimForm.maliyet) || 0;
      const { error } = await supabase.from('ekipman_bakimlari').insert({
        ekipman_id: bakimEkleModal.id,
        ekipman_kodu: bakimEkleModal.kod,
        ekipman_adi: bakimEkleModal.ad,
        bakim_turu: bakimForm.bakim_turu,
        bakim_tarihi: bakimForm.bakim_tarihi,
        sonraki_bakim_tarihi: bakimForm.sonraki_bakim_tarihi || null,
        maliyet: maliyetSayi,
        servis_adi: bakimForm.servis_adi.trim(),
        fatura_fis_no: bakimForm.fatura_fis_no.trim(),
        aciklama: bakimForm.aciklama.trim(),
        yapilan_islemler: bakimForm.yapilan_islemler.trim(),
        kaydeden: 'Patron',
      });

      if (error) throw error;

      // Ekipmanın son bakım ve sonraki bakım tarihini güncelle
      const yeniToplamMaliyet = (Number(bakimEkleModal.toplam_bakim_maliyeti) || 0) + maliyetSayi;
      await supabase
        .from('ekipmanlar')
        .update({
          son_bakim_tarihi: bakimForm.bakim_tarihi,
          sonraki_bakim_tarihi: bakimForm.sonraki_bakim_tarihi || null,
          toplam_bakim_maliyeti: yeniToplamMaliyet,
          durum: bakimEkleModal.durum === 'Bakımda' ? 'Depoda' : bakimEkleModal.durum,
        })
        .eq('id', bakimEkleModal.id);

      // Hareket kaydı
      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: bakimEkleModal.id,
        ekipman_kodu: bakimEkleModal.kod,
        ekipman_adi: bakimEkleModal.ad,
        islem_turu: 'Bakımdan Dönüş',
        eski_durum: 'Bakımda',
        yeni_durum: bakimEkleModal.durum === 'Bakımda' ? 'Depoda' : bakimEkleModal.durum,
        islem_yapan_rol: 'patron',
        islem_yapan_ad: 'Patron',
        aciklama: `Bakım tamamlandı (${formatPLN(maliyetSayi)}). Servis: ${bakimForm.servis_adi || 'Belirtilmedi'}`,
      });

      setBakimEkleModal(null);
      setBakimForm({
        bakim_turu: 'Periyodik Bakım',
        bakim_tarihi: new Date().toISOString().slice(0, 10),
        sonraki_bakim_tarihi: '',
        maliyet: '',
        servis_adi: '',
        fatura_fis_no: '',
        aciklama: '',
        yapilan_islemler: '',
      });
      verileriYukle();
    } catch (err) {
      alert('Bakım kaydı eklenemedi: ' + err.message);
    }
  };

  // Arıza Durumu Güncelle (Patron)
  const arizaDurumGuncelle = async (arizaId, yeniDurum, patronNotu) => {
    try {
      const guncelleme = { durum: yeniDurum };
      if (yeniDurum === 'Çözüldü') guncelleme.cozulme_tarihi = new Date().toISOString();
      if (patronNotu) guncelleme.patron_notu = patronNotu;

      await supabase.from('ekipman_arizalari').update(guncelleme).eq('id', arizaId);

      // Eğer çözüldüyse ekipmanın durumunu Depoda yap
      if (arizaDetayModal && yeniDurum === 'Çözüldü') {
        await supabase.from('ekipmanlar').update({ durum: 'Depoda' }).eq('id', arizaDetayModal.ekipman_id);
      }

      setArizaDetayModal(null);
      verileriYukle();
    } catch (err) {
      alert('Arıza durumu güncellenemedi: ' + err.message);
    }
  };

  // Ekipman Sil (Patron)
  const ekipmanSil = async (id, ad, kod) => {
    if (!confirm(`"${ad} (${kod})" adlı ekipmanı ve ilişkili tüm kayıtları silmek istediğinize emin misiniz?`)) return;
    try {
      await supabase.from('ekipman_hareketleri').delete().eq('ekipman_id', id);
      await supabase.from('ekipman_arizalari').delete().eq('ekipman_id', id);
      await supabase.from('ekipman_bakimlari').delete().eq('ekipman_id', id);
      await supabase.from('ekipmanlar').delete().eq('id', id);
      verileriYukle();
    } catch (err) {
      alert('Ekipman silinemedi: ' + err.message);
    }
  };

  // Manuel Durum Değiştirme (Patron)
  const durumDegistir = async (ekipman, yeniDurum) => {
    if (!confirm(`Ekipman durumunu "${yeniDurum}" olarak değiştirmek istediğinize emin misiniz?`)) return;
    try {
      const updateData = { durum: yeniDurum };
      if (yeniDurum === 'Depoda') {
        updateData.zimmetli_personel_no = null;
        updateData.zimmetli_personel_ad = null;
        updateData.mevcut_lokasyon = null;
        updateData.mevcut_depo_ad = depolar[0]?.ad || 'Ana Depo';
      }

      await supabase.from('ekipmanlar').update(updateData).eq('id', ekipman.id);

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: ekipman.id,
        ekipman_kodu: ekipman.kod,
        ekipman_adi: ekipman.ad,
        islem_turu: 'Durum Güncelleme',
        eski_durum: ekipman.durum,
        yeni_durum: yeniDurum,
        islem_yapan_rol: 'patron',
        islem_yapan_ad: 'Patron',
        aciklama: `Patron tarafından durum manuel olarak "${yeniDurum}" yapıldı.`,
      });

      verileriYukle();
    } catch (err) {
      alert('Durum güncellenemedi: ' + err.message);
    }
  };

  // ⚠️ BAKIM & MUAYENE UYARILARI (14 gün kalanlar)
  const bakimUyarilari = useMemo(() => {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);

    return ekipmanlar
      .filter((e) => e.sonraki_bakim_tarihi)
      .map((e) => {
        const hedef = new Date(e.sonraki_bakim_tarihi);
        const gunKalan = Math.round((hedef - bugun) / 86400000);
        return { ...e, gunKalan };
      })
      .filter((e) => e.gunKalan <= 15)
      .sort((a, b) => a.gunKalan - b.gunKalan);
  }, [ekipmanlar]);

  // Filtrelenmiş Ekipman Listesi
  const filtrelenmisEkipmanlar = useMemo(() => {
    return ekipmanlar.filter((e) => {
      const matchArama = !aramaMetni.trim() ||
        (e.ad || '').toLowerCase().includes(aramaMetni.toLowerCase()) ||
        (e.kod || '').toLowerCase().includes(aramaMetni.toLowerCase()) ||
        (e.marka || '').toLowerCase().includes(aramaMetni.toLowerCase()) ||
        (e.seri_no || '').toLowerCase().includes(aramaMetni.toLowerCase()) ||
        (e.zimmetli_personel_ad || '').toLowerCase().includes(aramaMetni.toLowerCase());

      const matchDurum = filtreDurum === 'Tümü' || e.durum === filtreDurum;
      const matchKategori = filtreKategori === 'Tümü' || e.kategori === filtreKategori;
      const matchLokasyon = filtreLokasyon === 'Tümü' || e.mevcut_lokasyon === filtreLokasyon || e.mevcut_depo_ad === filtreLokasyon;

      return matchArama && matchDurum && matchKategori && matchLokasyon;
    });
  }, [ekipmanlar, aramaMetni, filtreDurum, filtreKategori, filtreLokasyon]);

  // İstatistikler
  const istatistikler = useMemo(() => {
    return {
      toplam: ekipmanlar.length,
      depoda: ekipmanlar.filter((e) => e.durum === 'Depoda').length,
      kullanimda: ekipmanlar.filter((e) => e.durum === 'Kullanımda' || e.zimmetli_personel_no).length,
      santiyede: ekipmanlar.filter((e) => e.durum === 'Şantiyede' || (e.mevcut_lokasyon && !e.zimmetli_personel_no)).length,
      arizali: ekipmanlar.filter((e) => e.durum === 'Arızalı').length,
      bakimda: ekipmanlar.filter((e) => e.durum === 'Bakımda').length,
      toplamDeger: ekipmanlar.reduce((a, e) => a + (Number(e.satin_alma_fiyati) || 0), 0),
    };
  }, [ekipmanlar]);

  // Kategoriler Listesi
  const kategoriListesi = useMemo(() => {
    const set = new Set(ekipmanlar.map((e) => e.kategori).filter(Boolean));
    return ['Tümü', ...Array.from(set)];
  }, [ekipmanlar]);

  return (
    <div>
      <style>{`
        .ekp-tab-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .ekp-tab-btn.aktif { background: var(--accent-patron); color: #fff; border-color: var(--accent-patron); }
        .ekp-badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .ekp-badge.depoda { background: rgba(34, 197, 94, 0.15); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.3); }
        .ekp-badge.kullanimda { background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.3); }
        .ekp-badge.arizali { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .ekp-badge.bakimda { background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); }
      `}</style>

      {/* ⚠️ BAKIM / MUAYENE UYARI BİLDİRİM ŞERİDİ */}
      {bakimUyarilari.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex', flexDirection: 'column', gap: 6
        }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚠️ Yaklaşan Ekipman Bakım & Muayene Uyarıları ({bakimUyarilari.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
            {bakimUyarilari.map((e) => (
              <div key={e.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <span><b>{e.ad}</b> ({e.kod})</span>
                <span style={{
                  padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 11,
                  background: e.gunKalan < 0 ? '#ef4444' : (e.gunKalan <= 7 ? '#f97316' : '#eab308'),
                  color: '#fff'
                }}>
                  {e.gunKalan < 0 ? `${Math.abs(e.gunKalan)} gün gecikti!` : (e.gunKalan === 0 ? 'Bugün!' : `${e.gunKalan} gün kaldı`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ÜST TAB BAR */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={`ekp-tab-btn ${altSekme === 'genel' ? 'aktif' : ''}`} onClick={() => setAltSekme('genel')}>
            📊 Genel Bakış
          </button>
          <button className={`ekp-tab-btn ${altSekme === 'ekipmanlar' ? 'aktif' : ''}`} onClick={() => setAltSekme('ekipmanlar')}>
            🛠️ Ekipmanlar ({ekipmanlar.length})
          </button>
          <button className={`ekp-tab-btn ${altSekme === 'depolar' ? 'aktif' : ''}`} onClick={() => setAltSekme('depolar')}>
            🏢 Depolar ({depolar.length})
          </button>
          <button className={`ekp-tab-btn ${altSekme === 'hareketler' ? 'aktif' : ''}`} onClick={() => setAltSekme('hareketler')}>
            📋 Ekipman Hareketleri
          </button>
          <button className={`ekp-tab-btn ${altSekme === 'bakim' ? 'aktif' : ''}`} onClick={() => setAltSekme('bakim')}>
            🔧 Bakım & Arıza ({arizalar.filter(a => a.durum === 'Açık').length} Arıza)
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="action btn-punch"
            style={{ width: 'auto', margin: 0, padding: '7px 16px', fontSize: 13, background: 'var(--accent-patron)' }}
            onClick={() => {
              setDuzenlenenEkipman(null);
              setEkipmanForm({
                kod: yeniKodUret(),
                ad: '',
                marka: '',
                model: '',
                seri_no: '',
                kategori: 'Kırıcı & Delici',
                satin_alma_tarihi: new Date().toISOString().slice(0, 10),
                satin_alma_fiyati: '',
                aciklama: '',
                mevcut_depo_id: depolar[0]?.id || '',
                periyodik_bakim_gun: '180',
                son_bakim_tarihi: '',
                sonraki_bakim_tarihi: '',
              });
              setYeniEkipmanModal(true);
            }}
          >
            + Yeni Ekipman Tanımla
          </button>
        </div>
      </div>

      {/* ---------------- 1. GENEL BAKIŞ EKRANI ---------------- */}
      {altSekme === 'genel' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* İstatistik Sayaçları */}
          <div className="grid cols-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setFiltreDurum('Tümü'); setAltSekme('ekipmanlar'); }}>
              <div className="label">Toplam Ekipman</div>
              <div className="value">{istatistikler.toplam}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Demirbaş Değeri: {formatPLN(istatistikler.toplamDeger)}</div>
            </div>

            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setFiltreDurum('Depoda'); setAltSekme('ekipmanlar'); }}>
              <div className="label">Ana Depodakiler</div>
              <div className="value" style={{ color: '#16a34a' }}>{istatistikler.depoda}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Kullanıma Hazır</div>
            </div>

            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setFiltreDurum('Kullanımda'); setAltSekme('ekipmanlar'); }}>
              <div className="label">Personelde / Zimmetli</div>
              <div className="value" style={{ color: '#2563eb' }}>{istatistikler.kullanimda}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Sahada Aktif Çalışıyor</div>
            </div>

            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setFiltreDurum('Arızalı'); setAltSekme('ekipmanlar'); }}>
              <div className="label">Arızalı & Bakımda</div>
              <div className="value" style={{ color: istatistikler.arizali > 0 ? '#ef4444' : 'var(--ink)' }}>
                {istatistikler.arizali + istatistikler.bakimda}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{istatistikler.arizali} Arızalı, {istatistikler.bakimda} Bakımda</div>
            </div>
          </div>

          {/* Son Hareketler & Hızlı Görünüm */}
          <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {/* Sol: Son Ekipman Hareketleri */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>⚡ Son Ekipman Hareketleri</h3>
                <button className="action btn-secondary" style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }} onClick={() => setAltSekme('hareketler')}>
                  Tümünü Gör →
                </button>
              </div>

              {hareketler.length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Henüz bir hareket kaydı bulunmuyor.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                  {hareketler.slice(0, 8).map((h) => (
                    <div key={h.id} style={{ padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span style={{ color: 'var(--ink)' }}>{h.ekipman_adi} ({h.ekipman_kodu})</span>
                        <span style={{ color: 'var(--accent-patron)', fontSize: 11 }}>{h.islem_turu}</span>
                      </div>
                      <div style={{ color: 'var(--ink-soft)', fontSize: 11, marginTop: 2 }}>
                        {h.yeni_personel_ad ? `Teslim Alan: ${h.yeni_personel_ad}` : ''}
                        {h.yeni_lokasyon ? ` · Şantiye: ${h.yeni_lokasyon}` : ''}
                        {` · ${new Date(h.tarih).toLocaleString('tr-TR')}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sağ: Aktif Sahadaki Ekipmanlar ve Zimmetliler */}
            <div className="card">
              <h3 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 800 }}>📍 Şantiyelerde Çalışan Ekipmanlar</h3>
              {ekipmanlar.filter(e => e.durum === 'Kullanımda' || e.mevcut_lokasyon).length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Şu anda şantiyelerde aktif ekipman bulunmuyor. Tüm aletler depoda.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                  {ekipmanlar.filter(e => e.durum === 'Kullanımda' || e.mevcut_lokasyon).map((e) => (
                    <div key={e.id} style={{ padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{e.ad}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                          📍 {e.mevcut_lokasyon || 'Şantiyede'} · 👤 {e.zimmetli_personel_ad || 'Zimmetsiz'}
                        </div>
                      </div>
                      <button className="action btn-secondary" style={{ width: 'auto', padding: '4px 8px', fontSize: 11 }} onClick={() => setSeciliEkipmanPasaport(e)}>
                        Pasaport
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 2. EKİPMANLAR LİSTESİ & KARTLAR ---------------- */}
      {altSekme === 'ekipmanlar' && (
        <div className="card">
          {/* Filtre Barı */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14, background: 'var(--bg-soft)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <label style={{ fontSize: 11, margin: '0 0 4px 0' }}>🔍 Ekipman / Kod / Personel Ara</label>
              <input
                placeholder="Örn: Hilti, EQ-0042, Ahmet..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                style={{ margin: 0, padding: '7px 10px', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, margin: '0 0 4px 0' }}>Durum Filtresi</label>
              <select value={filtreDurum} onChange={(e) => setFiltreDurum(e.target.value)} style={{ margin: 0, padding: '7px 10px', fontSize: 13 }}>
                <option value="Tümü">Tüm Durumlar</option>
                <option value="Depoda">Depoda (Müsait)</option>
                <option value="Kullanımda">Kullanımda (Zimmetli)</option>
                <option value="Şantiyede">Şantiyede</option>
                <option value="Arızalı">Arızalı</option>
                <option value="Bakımda">Bakımda</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, margin: '0 0 4px 0' }}>Kategori</label>
              <select value={filtreKategori} onChange={(e) => setFiltreKategori(e.target.value)} style={{ margin: 0, padding: '7px 10px', fontSize: 13 }}>
                {kategoriListesi.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, margin: '0 0 4px 0' }}>Lokasyon / Şantiye</label>
              <select value={filtreLokasyon} onChange={(e) => setFiltreLokasyon(e.target.value)} style={{ margin: 0, padding: '7px 10px', fontSize: 13 }}>
                <option value="Tümü">Tüm Lokasyonlar</option>
                {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
                {depolar.map((d) => <option key={d.ad} value={d.ad}>🏢 {d.ad}</option>)}
              </select>
            </div>
          </div>

          {/* Ekipman Kartları Grid */}
          {filtrelenmisEkipmanlar.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🧰</div>
              <b>Aradığınız kriterlere uygun ekipman bulunamadı.</b>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {filtrelenmisEkipmanlar.map((e) => {
                const durumClass = e.durum === 'Depoda' ? 'depoda' : (e.durum === 'Kullanımda' ? 'kullanimda' : (e.durum === 'Arızalı' ? 'arizali' : 'bakimda'));

                return (
                  <div
                    key={e.id}
                    className="card"
                    style={{
                      padding: 14, border: '1px solid var(--border)', borderRadius: 10,
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      background: 'var(--card)', position: 'relative'
                    }}
                  >
                    <div>
                      {/* Üst Başlık & Kod & Rozet */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <div>
                          <span style={{ fontWeight: 900, color: 'var(--accent-patron)', fontSize: 13, letterSpacing: 0.5 }}>{e.kod}</span>
                          <h3 style={{ margin: '2px 0 0 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>{e.ad}</h3>
                        </div>
                        <span className={`ekp-badge ${durumClass}`}>
                          {e.durum}
                        </span>
                      </div>

                      {/* Marka / Model / Seri No */}
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                        {e.marka && <span><b>{e.marka}</b> </span>}
                        {e.model && <span>{e.model} </span>}
                        {e.kategori && <span style={{ background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: 4 }}>{e.kategori}</span>}
                      </div>

                      {/* Mevcut Durum / Lokasyon / Personel Bilgisi */}
                      <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span>📍 Konum:</span>
                          <b style={{ color: 'var(--ink)' }}>{e.mevcut_lokasyon || e.mevcut_depo_ad || 'Ana Depo'}</b>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>👤 Zimmetli:</span>
                          <b style={{ color: e.zimmetli_personel_ad ? '#2563eb' : 'var(--ink-soft)' }}>
                            {e.zimmetli_personel_ad || 'Yok (Depoda)'}
                          </b>
                        </div>
                      </div>
                    </div>

                    {/* Alt İşlem Butonları */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <button
                        className="action btn-secondary"
                        style={{ flex: 1, padding: '6px 8px', fontSize: 11, margin: 0 }}
                        onClick={() => qrGoster(e.ad, e.qr_kodu || `EQ:${e.kod}`, e.kod)}
                      >
                        📷 QR
                      </button>
                      <button
                        className="action btn-secondary"
                        style={{ flex: 1.2, padding: '6px 8px', fontSize: 11, margin: 0, fontWeight: 700 }}
                        onClick={() => setSeciliEkipmanPasaport(e)}
                      >
                        📋 Pasaport
                      </button>
                      <button
                        className="action btn-secondary"
                        style={{ padding: '6px 8px', fontSize: 11, margin: 0 }}
                        onClick={() => {
                          setDuzenlenenEkipman(e);
                          setEkipmanForm({
                            kod: e.kod,
                            ad: e.ad,
                            marka: e.marka || '',
                            model: e.model || '',
                            seri_no: e.seri_no || '',
                            kategori: e.kategori || 'Kırıcı & Delici',
                            satin_alma_tarihi: e.satin_alma_tarihi || '',
                            satin_alma_fiyati: String(e.satin_alma_fiyati || ''),
                            aciklama: e.aciklama || '',
                            mevcut_depo_id: e.mevcut_depo_id || '',
                            periyodik_bakim_gun: String(e.periyodik_bakim_gun || '180'),
                            son_bakim_tarihi: e.son_bakim_tarihi || '',
                            sonraki_bakim_tarihi: e.sonraki_bakim_tarihi || '',
                          });
                          setYeniEkipmanModal(true);
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="action btn-secondary"
                        style={{ padding: '6px 8px', fontSize: 11, margin: 0, color: '#ef4444' }}
                        onClick={() => ekipmanSil(e.id, e.ad, e.kod)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- 3. DEPOLAR EKRANI ---------------- */}
      {altSekme === 'depolar' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 className="section" style={{ margin: 0 }}>🏢 Şirket Depoları</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                Ekipmanların muhafaza edildiği ana depo ve şantiye ara depoları. İade işlemi için depo QR kodu okutulur.
              </div>
            </div>
            <button className="action btn-punch" style={{ width: 'auto', padding: '7px 14px', fontSize: 12 }} onClick={() => setYeniDepoModal(true)}>
              + Yeni Depo Ekle
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {depolar.map((d) => {
              const depodakiSayi = ekipmanlar.filter(e => e.mevcut_depo_id === d.id || (!e.mevcut_lokasyon && !e.zimmetli_personel_no)).length;

              return (
                <div key={d.id} className="card" style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: 'var(--accent-patron)', fontSize: 12 }}>{d.kod}</span>
                      <h3 style={{ margin: '2px 0 0 0', fontSize: 16, fontWeight: 800 }}>{d.ad}</h3>
                    </div>
                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {depodakiSayi} Ekipman
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
                    📍 {d.adres || 'Adres belirtilmemiş'}
                    {d.aciklama && <div style={{ marginTop: 4 }}>{d.aciklama}</div>}
                  </div>

                  <button
                    className="action btn-secondary"
                    style={{ width: '100%', margin: 0, padding: '7px 0', fontSize: 12, fontWeight: 700 }}
                    onClick={() => qrGoster(d.ad, d.qr_kodu || `DEPOT:${d.kod}`, d.kod)}
                  >
                    📷 Depo QR Kodunu Aç & Yazdır
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- 4. EKİPMAN HAREKETLERİ (AUDIT TRAIL) ---------------- */}
      {altSekme === 'hareketler' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 className="section" style={{ margin: 0 }}>📋 Ekipman Hareket Geçmişi (Audit Log)</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                Teslim alma, iade, şantiye transferi ve personel devirlerinin değiştirilemez geçmişi.
              </div>
            </div>

            <button
              className="action btn-secondary"
              style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
              onClick={() => excelIndir(
                hareketler.map((h) => ({
                  Tarih: new Date(h.tarih).toLocaleString('tr-TR'),
                  'Ekipman Kodu': h.ekipman_kodu,
                  'Ekipman Adı': h.ekipman_adi,
                  'İşlem Türü': h.islem_turu,
                  'Eski Durum': h.eski_durum || '—',
                  'Yeni Durum': h.yeni_durum || '—',
                  'Eski Personel': h.eski_personel_ad || '—',
                  'Yeni Personel / Zimmet': h.yeni_personel_ad || '—',
                  'Eski Lokasyon': h.eski_lokasyon || '—',
                  'Yeni Lokasyon': h.yeni_lokasyon || '—',
                  'İşlemi Yapan': h.islem_yapan_ad || '—',
                  Açıklama: h.aciklama || '—',
                })),
                'ekipman-hareketleri.xlsx'
              )}
              disabled={hareketler.length === 0}
            >
              📊 Excel Olarak İndir
            </button>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 520 }}>
            <table>
              <thead>
                <tr>
                  <th>Tarih & Saat</th>
                  <th>Ekipman</th>
                  <th>İşlem Türü</th>
                  <th>Zimmetli Personel</th>
                  <th>Konum / Şantiye</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {hareketler.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(h.tarih).toLocaleString('tr-TR')}</td>
                    <td>
                      <b style={{ color: 'var(--ink)' }}>{h.ekipman_adi}</b>
                      <div style={{ fontSize: 11, color: 'var(--accent-patron)' }}>{h.ekipman_kodu}</div>
                    </td>
                    <td>
                      <span className="status-tag open" style={{ fontSize: 11 }}>{h.islem_turu}</span>
                    </td>
                    <td>
                      {h.yeni_personel_ad ? (
                        <span>👤 <b>{h.yeni_personel_ad}</b></span>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)' }}>Depoda (Zimmetsiz)</span>
                      )}
                    </td>
                    <td>
                      <span>📍 {h.yeni_lokasyon || 'Ana Depo'}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--ink-soft)', maxWidth: 220 }}>
                      {h.aciklama || '—'}
                    </td>
                  </tr>
                ))}
                {hareketler.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>Henüz bir hareket kaydı bulunmuyor.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- 5. BAKIM & ARIZA YÖNETİMİ ---------------- */}
      {altSekme === 'bakim' && (
        <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {/* Sol: Arıza Bildirimleri */}
          <div className="card">
            <h2 className="section" style={{ margin: '0 0 10px 0' }}>⚠️ Sahadan Gelen Arıza Bildirimleri</h2>
            {arizalar.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', padding: '20px 0', textAlign: 'center' }}>Açık arıza bildirimi bulunmuyor.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {arizalar.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                      background: a.durum === 'Açık' ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-soft)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <b style={{ color: 'var(--ink)', fontSize: 14 }}>{a.ekipman_adi} ({a.ekipman_kodu})</b>
                      <span className={`status-tag ${a.durum === 'Açık' ? 'closed' : 'open'}`}>{a.durum}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
                      Bildiren: <b>{a.bildiren_personel_ad || 'Personel'}</b> · 📍 {a.lokasyon || 'Şantiye'} · 📅 {new Date(a.tarih).toLocaleString('tr-TR')}
                    </div>
                    <div style={{ fontSize: 13, background: 'var(--card)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }}>
                      "{a.ariza_aciklamasi}"
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {a.durum === 'Açık' && (
                        <>
                          <button
                            className="action btn-punch"
                            style={{ flex: 1, padding: '5px 0', fontSize: 11, background: '#16a34a' }}
                            onClick={() => arizaDurumGuncelle(a.id, 'Çözüldü', 'Tamir edildi ve testten geçti.')}
                          >
                            ✓ Çözüldü / Tamir Edildi
                          </button>
                          <button
                            className="action btn-secondary"
                            style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }}
                            onClick={() => arizaDurumGuncelle(a.id, 'Tamirde', 'Yetkili servise gönderildi.')}
                          >
                            Servise Gönder
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sağ: Periyodik Bakım Kayıtları */}
          <div className="card">
            <h2 className="section" style={{ margin: '0 0 10px 0' }}>🔧 Yapılan Bakım ve Servis Geçmişi</h2>
            {bakimlar.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', padding: '20px 0', textAlign: 'center' }}>Kayıtlı bakım geçmişi bulunmuyor.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                {bakimlar.map((b) => (
                  <div key={b.id} style={{ padding: 10, background: 'var(--bg-soft)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                      <span>{b.ekipman_adi} ({b.ekipman_kodu})</span>
                      <span style={{ color: '#16a34a' }}>{formatPLN(b.maliyet)}</span>
                    </div>
                    <div style={{ color: 'var(--ink-soft)', fontSize: 11, marginTop: 2 }}>
                      {b.bakim_turu} · Servis: <b>{b.servis_adi || 'Belirtilmedi'}</b> · 📅 {new Date(b.bakim_tarihi).toLocaleDateString('tr-TR')}
                    </div>
                    {b.yapilan_islemler && <div style={{ marginTop: 4, fontSize: 11 }}>{b.yapilan_islemler}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- MODALLAR ---------------- */}

      {/* 1. YENİ / DÜZENLE EKİPMAN MODALI */}
      {yeniEkipmanModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setYeniEkipmanModal(false)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 800 }}>
              {duzenlenenEkipman ? '✏️ Ekipman Bilgilerini Düzenle' : '🧰 Yeni Ekipman Tanımla'}
            </h3>

            <form onSubmit={ekipmanKaydet}>
              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div>
                  <label>Ekipman Kodu *</label>
                  <input value={ekipmanForm.kod} onChange={(e) => setEkipmanForm({ ...ekipmanForm, kod: e.target.value })} required />
                </div>
                <div>
                  <label>Ekipman Adı *</label>
                  <input placeholder="Örn: Hilti TE 30 Kırıcı Delici" value={ekipmanForm.ad} onChange={(e) => setEkipmanForm({ ...ekipmanForm, ad: e.target.value })} required />
                </div>
              </div>

              <div className="grid cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Marka</label>
                  <input placeholder="Hilti, Bosch vb." value={ekipmanForm.marka} onChange={(e) => setEkipmanForm({ ...ekipmanForm, marka: e.target.value })} />
                </div>
                <div>
                  <label>Model</label>
                  <input placeholder="TE 30-AVR vb." value={ekipmanForm.model} onChange={(e) => setEkipmanForm({ ...ekipmanForm, model: e.target.value })} />
                </div>
                <div>
                  <label>Seri Numarası</label>
                  <input placeholder="SN-12345" value={ekipmanForm.seri_no} onChange={(e) => setEkipmanForm({ ...ekipmanForm, seri_no: e.target.value })} />
                </div>
              </div>

              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Kategori</label>
                  <input placeholder="Kırıcı & Delici, Ölçüm vb." value={ekipmanForm.kategori} onChange={(e) => setEkipmanForm({ ...ekipmanForm, kategori: e.target.value })} />
                </div>
                <div>
                  <label>Satın Alma Fiyatı (PLN)</label>
                  <input type="number" placeholder="3800" value={ekipmanForm.satin_alma_fiyati} onChange={(e) => setEkipmanForm({ ...ekipmanForm, satin_alma_fiyati: e.target.value })} />
                </div>
              </div>

              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Satın Alma Tarihi</label>
                  <input type="date" value={ekipmanForm.satin_alma_tarihi} onChange={(e) => setEkipmanForm({ ...ekipmanForm, satin_alma_tarihi: e.target.value })} />
                </div>
                <div>
                  <label>Bulunduğu Depo</label>
                  <select value={ekipmanForm.mevcut_depo_id} onChange={(e) => setEkipmanForm({ ...ekipmanForm, mevcut_depo_id: e.target.value })}>
                    {depolar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Fotoğraf</label>
                <input type="file" accept="image/*" onChange={(e) => setEkipmanResimDosya(e.target.files?.[0] || null)} />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Açıklama / Özel Notlar</label>
                <input placeholder="Örn: 2 adet yedek uç ve taşıma çantası ile teslim alındı." value={ekipmanForm.aciklama} onChange={(e) => setEkipmanForm({ ...ekipmanForm, aciklama: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action btn-punch" style={{ flex: 1 }} disabled={formYukleniyor}>
                  {formYukleniyor ? 'Kaydediliyor...' : (duzenlenenEkipman ? 'Güncelle' : 'Ekipmanı Sisteme Ekle')}
                </button>
                <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setYeniEkipmanModal(false)}>
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. YENİ DEPO MODALI */}
      {yeniDepoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setYeniDepoModal(false)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 420, width: '100%', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 800 }}>🏢 Yeni Depo Tanımla</h3>
            <form onSubmit={depoKaydet}>
              <label>Depo Adı *</label>
              <input placeholder="Örn: Łódź Bölge Deposu" value={depoForm.ad} onChange={(e) => setDepoForm({ ...depoForm, ad: e.target.value })} required />

              <label style={{ marginTop: 10 }}>Depo Kodu</label>
              <input placeholder="Örn: DEPOT-02" value={depoForm.kod} onChange={(e) => setDepoForm({ ...depoForm, kod: e.target.value })} />

              <label style={{ marginTop: 10 }}>Adres / Konum</label>
              <input placeholder="Şantiye adresi veya depo konumu" value={depoForm.adres} onChange={(e) => setDepoForm({ ...depoForm, adres: e.target.value })} />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action btn-punch" style={{ flex: 1 }}>Kaydet</button>
                <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setYeniDepoModal(false)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. QR KOD GÖRÜNTÜLE & YAZDIR MODALI */}
      {qrModalVeri && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setQrModalVeri(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, maxWidth: 360, width: '100%', textAlign: 'center', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{qrModalVeri.baslik}</div>
            <div style={{ fontWeight: 900, fontSize: 20, color: 'var(--accent-patron)', margin: '4px 0 14px 0' }}>{qrModalVeri.kod}</div>

            <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', border: '2px solid var(--border)', marginBottom: 14 }}>
              <img src={qrModalVeri.dataUrl} alt="QR Kod" style={{ width: 220, height: 220, display: 'block' }} />
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>{qrModalVeri.qrKoduMetni}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="action btn-punch" style={{ flex: 1 }} onClick={qrYazdir}>
                🖨️ Etiketi Yazdır
              </button>
              <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setQrModalVeri(null)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. EKİPMAN PASAPORTU (DETAY MODALI) */}
      {seciliEkipmanPasaport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSeciliEkipmanPasaport(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            {/* Başlık */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 900, color: 'var(--accent-patron)', fontSize: 14 }}>{seciliEkipmanPasaport.kod}</span>
                <h2 style={{ margin: '2px 0 0 0', fontSize: 18, fontWeight: 800 }}>{seciliEkipmanPasaport.ad} Pasaportu</h2>
              </div>
              <button onClick={() => setSeciliEkipmanPasaport(null)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Bilgi Kartları Grid */}
            <div className="grid cols-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Mevcut Durum:</span>
                <div style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{seciliEkipmanPasaport.durum}</div>
              </div>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Mevcut Konum:</span>
                <div style={{ fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{seciliEkipmanPasaport.mevcut_lokasyon || seciliEkipmanPasaport.mevcut_depo_ad || 'Ana Depo'}</div>
              </div>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Zimmetli Personel:</span>
                <div style={{ fontWeight: 800, color: '#2563eb', marginTop: 2 }}>{seciliEkipmanPasaport.zimmetli_personel_ad || 'Yok (Depoda)'}</div>
              </div>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Satın Alma Fiyatı:</span>
                <div style={{ fontWeight: 800, marginTop: 2 }}>{formatPLN(seciliEkipmanPasaport.satin_alma_fiyati)}</div>
              </div>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Toplam Bakım Maliyeti:</span>
                <div style={{ fontWeight: 800, color: '#16a34a', marginTop: 2 }}>{formatPLN(seciliEkipmanPasaport.toplam_bakim_maliyeti)}</div>
              </div>
              <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-soft)' }}>Sonraki Bakım:</span>
                <div style={{ fontWeight: 800, marginTop: 2 }}>{seciliEkipmanPasaport.sonraki_bakim_tarihi || 'Belirtilmedi'}</div>
              </div>
            </div>

            {/* Hızlı İşlemler Butonları */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                className="action btn-punch"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 12, margin: 0 }}
                onClick={() => {
                  setBakimEkleModal(seciliEkipmanPasaport);
                  setSeciliEkipmanPasaport(null);
                }}
              >
                + Bakım / Servis Kaydı Ekle
              </button>
              {seciliEkipmanPasaport.durum !== 'Depoda' && (
                <button
                  className="action btn-secondary"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12, margin: 0 }}
                  onClick={() => {
                    durumDegistir(seciliEkipmanPasaport, 'Depoda');
                    setSeciliEkipmanPasaport(null);
                  }}
                >
                  Depoya Manuel İade Al
                </button>
              )}
              <button
                className="action btn-secondary"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 12, margin: 0 }}
                onClick={() => qrGoster(seciliEkipmanPasaport.ad, seciliEkipmanPasaport.qr_kodu || `EQ:${seciliEkipmanPasaport.kod}`, seciliEkipmanPasaport.kod)}
              >
                📷 QR Göster
              </button>
            </div>

            {/* Kronolojik Hareket Geçmişi (Audit Log) */}
            <h3 style={{ margin: '14px 0 8px 0', fontSize: 14, fontWeight: 800 }}>📜 Ekipman Kullanım & Hareket Geçmişi</h3>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--bg-soft)' }}>
              {hareketler.filter(h => h.ekipman_id === seciliEkipmanPasaport.id).length === 0 ? (
                <div style={{ color: 'var(--ink-soft)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Henüz kayıtlı hareket bulunmuyor.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {hareketler.filter(h => h.ekipman_id === seciliEkipmanPasaport.id).map((h) => (
                    <div key={h.id} style={{ background: 'var(--card)', padding: '8px 10px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                        <span style={{ color: 'var(--accent-patron)' }}>{h.islem_turu}</span>
                        <span style={{ color: 'var(--ink-soft)' }}>{new Date(h.tarih).toLocaleString('tr-TR')}</span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {h.yeni_personel_ad ? `Zimmet: ${h.yeni_personel_ad}` : ''}
                        {h.yeni_lokasyon ? ` · Şantiye: ${h.yeni_lokasyon}` : ''}
                        {h.aciklama ? ` (${h.aciklama})` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. BAKIM KAYDI EKLEME MODALI */}
      {bakimEkleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setBakimEkleModal(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 460, width: '100%', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 800 }}>🔧 Bakım / Servis Kaydı: {bakimEkleModal.ad}</h3>
            <form onSubmit={bakimKaydet}>
              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label>Bakım Türü</label>
                  <select value={bakimForm.bakim_turu} onChange={(e) => setBakimForm({ ...bakimForm, bakim_turu: e.target.value })}>
                    <option value="Periyodik Bakım">Periyodik Bakım</option>
                    <option value="Arıza Onarımı">Arıza Onarımı</option>
                    <option value="Kalibrasyon">Kalibrasyon</option>
                    <option value="Parça Değişimi">Parça Değişimi</option>
                  </select>
                </div>
                <div>
                  <label>Bakım Tarihi</label>
                  <input type="date" value={bakimForm.bakim_tarihi} onChange={(e) => setBakimForm({ ...bakimForm, bakim_tarihi: e.target.value })} required />
                </div>
              </div>

              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Maliyet (PLN)</label>
                  <input type="number" placeholder="480" value={bakimForm.maliyet} onChange={(e) => setBakimForm({ ...bakimForm, maliyet: e.target.value })} />
                </div>
                <div>
                  <label>Sonraki Bakım Tarihi</label>
                  <input type="date" value={bakimForm.sonraki_bakim_tarihi} onChange={(e) => setBakimForm({ ...bakimForm, sonraki_bakim_tarihi: e.target.value })} />
                </div>
              </div>

              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Servis / Firma Adı</label>
                  <input placeholder="XYZ Serwis vb." value={bakimForm.servis_adi} onChange={(e) => setBakimForm({ ...bakimForm, servis_adi: e.target.value })} />
                </div>
                <div>
                  <label>Fatura / Fiş No</label>
                  <input placeholder="FAT-2026/089" value={bakimForm.fatura_fis_no} onChange={(e) => setBakimForm({ ...bakimForm, fatura_fis_no: e.target.value })} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Yapılan İşlemler</label>
                <input placeholder="Motor kömürleri değişti, yağlama yapıldı." value={bakimForm.yapilan_islemler} onChange={(e) => setBakimForm({ ...bakimForm, yapilan_islemler: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action btn-punch" style={{ flex: 1 }}>Bakımı Kaydet</button>
                <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setBakimEkleModal(null)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
