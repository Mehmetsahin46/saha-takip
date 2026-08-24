'use client';

import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';
import QrOkuyucu from '@/components/QrOkuyucu';

export default function EkipmanTab({ oturum }) {
  const { t } = useLocale();
  const [zimmetliEkipmanlar, setZimmetliEkipmanlar] = useState([]);
  const [lokasyonlar, setLokasyonlar] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [depolar, setDepolar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // QR Tarama State
  const [qrTaramaAcik, setQrTaramaAcik] = useState(false);
  const [qrTaramaModu, setQrTaramaModu] = useState('ekipman'); // 'ekipman' | 'depo_iade'
  const [okunanEkipman, setOkunanEkipman] = useState(null);

  // İşlem Modal State'leri
  const [seciliSantiye, setSeciliSantiye] = useState('');
  const [transferModal, setTransferModal] = useState(null); // ekipman objesi
  const [yeniSantiye, setYeniSantiye] = useState('');
  const [devirModal, setDevirModal] = useState(null); // ekipman objesi
  const [devirPersonelNo, setDevirPersonelNo] = useState('');
  const [arizaModal, setArizaModal] = useState(null); // ekipman objesi
  const [arizaMetni, setArizaMetni] = useState('');
  const [arizaFotoDosya, setArizaFotoDosya] = useState(null);
  const [islemYukleniyor, setIslemYukleniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  // FORMEN: Depoya Yeni Ekipman Ekleme Modalı
  const [formenEkipmanModal, setFormenEkipmanModal] = useState(false);
  const [formenForm, setFormenForm] = useState({
    kod: '',
    ad: '',
    marka: '',
    model: '',
    seri_no: '',
    kategori: 'Kırıcı & Delici',
    hedef_konum_tipi: 'depo', // 'depo' | 'santiye'
    hedef_depo_id: '',
    hedef_santiye: '',
    aciklama: '',
  });
  const [formenResimDosya, setFormenResimDosya] = useState(null);
  const [uretilenQrModal, setUretilenQrModal] = useState(null); // { ad, kod, qrDataUrl }

  // Verileri Yükle
  const verileriYukle = useCallback(async () => {
    if (!oturum?.personel_no) return;
    setYukleniyor(true);
    try {
      const [zimmetRes, lokRes, perRes, depRes] = await Promise.all([
        supabase
          .from('ekipmanlar')
          .select('*')
          .eq('zimmetli_personel_no', oturum.personel_no)
          .order('son_hareket_tarihi', { ascending: false }),
        supabase.from('lokasyonlar').select('*').order('ad', { ascending: true }),
        supabase.from('personel').select('*').neq('personel_no', oturum.personel_no).order('ad', { ascending: true }),
        supabase.from('depolar').select('*').order('created_at', { ascending: true }),
      ]);

      setZimmetliEkipmanlar(zimmetRes.data || []);
      setLokasyonlar(lokRes.data || []);
      setPersoneller(perRes.data || []);
      setDepolar(depRes.data || []);

      if (lokRes.data && lokRes.data.length > 0) {
        setSeciliSantiye(oturum.lokasyon || lokRes.data[0].ad);
        setYeniSantiye(lokRes.data[0].ad);
      }
      if (perRes.data && perRes.data.length > 0) {
        setDevirPersonelNo(perRes.data[0].personel_no);
      }
      if (depRes.data && depRes.data.length > 0) {
        setFormenForm(prev => ({ ...prev, hedef_depo_id: depRes.data[0].id }));
      }
    } catch (err) {
      console.error('Veri yükleme hatası:', err);
    } finally {
      setYukleniyor(false);
    }
  }, [oturum]);

  useEffect(() => {
    verileriYukle();
  }, [verileriYukle]);

  // Yeni Kod Üret
  const yeniKodUret = () => {
    const rastgele = Math.floor(Math.random() * 9000) + 1000;
    return `EQ-${rastgele}`;
  };

  // QR Kod Okundu Callback
  const qrOkundu = async (decodedText) => {
    setQrTaramaAcik(false);
    setMesaj(null);
    const temizKod = decodedText.trim();

    if (qrTaramaModu === 'depo_iade') {
      await depoIadeOnayla(temizKod);
      return;
    }

    setIslemYukleniyor(true);
    try {
      const { data, error } = await supabase
        .from('ekipmanlar')
        .select('*')
        .or(`qr_kodu.eq.${temizKod},kod.eq.${temizKod},qr_kodu.eq.EQ:${temizKod}`)
        .maybeSingle();

      if (error || !data) {
        setMesaj({ tip: 'err', metin: `❌ Bu QR koda ait (${temizKod}) kayıtlı ekipman bulunamadı.` });
        return;
      }

      setOkunanEkipman(data);
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Ekipman sorgulanırken hata: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 1. EKİPMANI DEPOSUNDAN TESLİM AL
  const ekipmanTeslimAl = async () => {
    if (!okunanEkipman || !seciliSantiye) return;

    setIslemYukleniyor(true);
    setMesaj(null);
    try {
      const { data: guncellenen, error } = await supabase
        .from('ekipmanlar')
        .update({
          durum: 'Kullanımda',
          zimmetli_personel_no: oturum.personel_no,
          zimmetli_personel_ad: oturum.ad,
          mevcut_lokasyon: seciliSantiye,
          mevcut_depo_id: null,
          mevcut_depo_ad: null,
          son_hareket_tarihi: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', okunanEkipman.id)
        .eq('durum', 'Depoda')
        .select()
        .maybeSingle();

      if (error || !guncellenen) {
        setMesaj({
          tip: 'err',
          metin: '⚠️ Ekipman teslim alınamadı! Başka bir personel az önce teslim almış veya ekipman depoda değil.',
        });
        setOkunanEkipman(null);
        return;
      }

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: okunanEkipman.id,
        ekipman_kodu: okunanEkipman.kod,
        ekipman_adi: okunanEkipman.ad,
        islem_turu: 'Teslim Alma',
        eski_durum: 'Depoda',
        yeni_durum: 'Kullanımda',
        eski_lokasyon: okunanEkipman.mevcut_depo_ad || 'Ana Depo',
        yeni_lokasyon: seciliSantiye,
        yeni_personel_no: oturum.personel_no,
        yeni_personel_ad: oturum.ad,
        islem_yapan_rol: oturum.rol || 'personel',
        islem_yapan_ad: oturum.ad,
        aciklama: `${okunanEkipman.mevcut_depo_ad || 'Ana Depo'} → ${seciliSantiye} sahasına teslim alındı.`,
      });

      setMesaj({
        tip: 'ok',
        metin: `✅ ${okunanEkipman.ad} (${okunanEkipman.kod}) başarıyla üzerinize zimmetlendi ve ${seciliSantiye} şantiyesine atandı.`,
      });
      setOkunanEkipman(null);
      verileriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Teslim alma hatası: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 2. ANA DEPOYA İADE BAŞLAT
  const depoIadeBaslat = (ekipman) => {
    setOkunanEkipman(ekipman);
    setQrTaramaModu('depo_iade');
    setQrTaramaAcik(true);
  };

  // 2. ANA DEPOYA İADE DOĞRULAMA & TAMAMLAMA
  const depoIadeOnayla = async (depoQrKodu) => {
    if (!okunanEkipman) return;

    setIslemYukleniyor(true);
    try {
      const seciliDepo = depolar.find(
        (d) => d.qr_kodu === depoQrKodu || d.kod === depoQrKodu || `DEPOT:${d.kod}` === depoQrKodu || depoQrKodu.includes('DEPOT')
      );

      const depoAd = seciliDepo ? seciliDepo.ad : (depolar[0]?.ad || 'Ana Depo - Merkez');
      const depoId = seciliDepo ? seciliDepo.id : (depolar[0]?.id || null);

      const { error } = await supabase
        .from('ekipmanlar')
        .update({
          durum: 'Depoda',
          zimmetli_personel_no: null,
          zimmetli_personel_ad: null,
          mevcut_lokasyon: null,
          mevcut_depo_id: depoId,
          mevcut_depo_ad: depoAd,
          son_hareket_tarihi: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', okunanEkipman.id);

      if (error) throw error;

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: okunanEkipman.id,
        ekipman_kodu: okunanEkipman.kod,
        ekipman_adi: okunanEkipman.ad,
        islem_turu: 'İade',
        eski_durum: 'Kullanımda',
        yeni_durum: 'Depoda',
        eski_lokasyon: okunanEkipman.mevcut_lokasyon || 'Şantiye',
        yeni_lokasyon: depoAd,
        eski_personel_no: oturum.personel_no,
        eski_personel_ad: oturum.ad,
        yeni_personel_no: null,
        yeni_personel_ad: null,
        islem_yapan_rol: oturum.rol || 'personel',
        islem_yapan_ad: oturum.ad,
        aciklama: `${okunanEkipman.mevcut_lokasyon || 'Şantiye'} → ${depoAd} teslim edildi.`,
      });

      setMesaj({
        tip: 'ok',
        metin: `✅ ${okunanEkipman.ad} başarıyla ${depoAd} deposuna iade edildi ve zimmetinizden düşüldü.`,
      });
      setOkunanEkipman(null);
      setQrTaramaModu('ekipman');
      verileriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'İade işleminde hata: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 3. BAŞKA ŞANTİYEYE TAŞI
  const santiyeTransferEt = async () => {
    if (!transferModal || !yeniSantiye) return;

    setIslemYukleniyor(true);
    try {
      const eskiSantiye = transferModal.mevcut_lokasyon || 'Bilinmeyen Şantiye';

      const { error } = await supabase
        .from('ekipmanlar')
        .update({
          mevcut_lokasyon: yeniSantiye,
          son_hareket_tarihi: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transferModal.id);

      if (error) throw error;

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: transferModal.id,
        ekipman_kodu: transferModal.kod,
        ekipman_adi: transferModal.ad,
        islem_turu: 'Şantiye Transferi',
        eski_durum: 'Kullanımda',
        yeni_durum: 'Kullanımda',
        eski_lokasyon: eskiSantiye,
        yeni_lokasyon: yeniSantiye,
        eski_personel_no: oturum.personel_no,
        eski_personel_ad: oturum.ad,
        yeni_personel_no: oturum.personel_no,
        yeni_personel_ad: oturum.ad,
        islem_yapan_rol: oturum.rol || 'personel',
        islem_yapan_ad: oturum.ad,
        aciklama: `Ekipman ${eskiSantiye} → ${yeniSantiye} şantiyesine taşındı.`,
      });

      setMesaj({ tip: 'ok', metin: `✅ ${transferModal.ad} ekipmanı ${yeniSantiye} şantiyesine transfer edildi.` });
      setTransferModal(null);
      setOkunanEkipman(null);
      verileriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Transfer hatası: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 4. BAŞKA PERSONELE DEVRET
  const personeleDevret = async () => {
    if (!devirModal || !devirPersonelNo) return;

    setIslemYukleniyor(true);
    try {
      const hedefPersonel = personeller.find((p) => p.personel_no === devirPersonelNo);
      if (!hedefPersonel) throw new Error('Seçilen personel bulunamadı.');

      const { error } = await supabase
        .from('ekipmanlar')
        .update({
          zimmetli_personel_no: hedefPersonel.personel_no,
          zimmetli_personel_ad: hedefPersonel.ad,
          son_hareket_tarihi: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', devirModal.id);

      if (error) throw error;

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: devirModal.id,
        ekipman_kodu: devirModal.kod,
        ekipman_adi: devirModal.ad,
        islem_turu: 'Personel Devri',
        eski_durum: 'Kullanımda',
        yeni_durum: 'Kullanımda',
        eski_lokasyon: devirModal.mevcut_lokasyon,
        yeni_lokasyon: devirModal.mevcut_lokasyon,
        eski_personel_no: oturum.personel_no,
        eski_personel_ad: oturum.ad,
        yeni_personel_no: hedefPersonel.personel_no,
        yeni_personel_ad: hedefPersonel.ad,
        islem_yapan_rol: oturum.rol || 'personel',
        islem_yapan_ad: oturum.ad,
        aciklama: `${oturum.ad} → ${hedefPersonel.ad} devredildi. Şantiye: ${devirModal.mevcut_lokasyon || 'Belirtilmedi'}`,
      });

      setMesaj({ tip: 'ok', metin: `✅ ${devirModal.ad} başarıyla ${hedefPersonel.ad} çalışanına devredildi.` });
      setDevirModal(null);
      setOkunanEkipman(null);
      verileriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Devir hatası: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 5. ARIZA BİLDİR
  const arizaBildir = async (e) => {
    e.preventDefault();
    if (!arizaModal || !arizaMetni.trim()) return;

    setIslemYukleniyor(true);
    try {
      let fotoUrl = null;
      if (arizaFotoDosya) {
        const uzanti = arizaFotoDosya.name.split('.').pop();
        const dosyaAdi = `ariza-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${uzanti}`;
        const { error: upErr } = await supabase.storage.from('proje-resimleri').upload(dosyaAdi, arizaFotoDosya);
        if (!upErr) {
          const { data: uData } = supabase.storage.from('proje-resimleri').getPublicUrl(dosyaAdi);
          fotoUrl = uData?.publicUrl || null;
        }
      }

      const { error: arzErr } = await supabase.from('ekipman_arizalari').insert({
        ekipman_id: arizaModal.id,
        ekipman_kodu: arizaModal.kod,
        ekipman_adi: arizaModal.ad,
        bildiren_personel_no: oturum.personel_no,
        bildiren_personel_ad: oturum.ad,
        lokasyon: arizaModal.mevcut_lokasyon || 'Şantiye',
        ariza_aciklamasi: arizaMetni.trim(),
        fotograf_url: fotoUrl,
        durum: 'Açık',
      });

      if (arzErr) throw arzErr;

      await supabase
        .from('ekipmanlar')
        .update({
          durum: 'Arızalı',
          son_hareket_tarihi: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', arizaModal.id);

      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: arizaModal.id,
        ekipman_kodu: arizaModal.kod,
        ekipman_adi: arizaModal.ad,
        islem_turu: 'Arıza Bildirimi',
        eski_durum: 'Kullanımda',
        yeni_durum: 'Arızalı',
        eski_personel_no: oturum.personel_no,
        eski_personel_ad: oturum.ad,
        eski_lokasyon: arizaModal.mevcut_lokasyon,
        yeni_lokasyon: arizaModal.mevcut_lokasyon,
        islem_yapan_rol: oturum.rol || 'personel',
        islem_yapan_ad: oturum.ad,
        aciklama: `Arıza bildirildi: ${arizaMetni.trim()}`,
      });

      setMesaj({ tip: 'ok', metin: `⚠️ ${arizaModal.ad} için arıza bildirimi patrona ve yönetime iletildi.` });
      setArizaModal(null);
      setArizaMetni('');
      setArizaFotoDosya(null);
      setOkunanEkipman(null);
      verileriYukle();
    } catch (err) {
      setMesaj({ tip: 'err', metin: 'Arıza bildiriminde hata: ' + err.message });
    } finally {
      setIslemYukleniyor(false);
    }
  };

  // 6. FORMEN: DEPOYA YENİ EKİPMAN EKLEME FONKSİYONU
  const formenEkipmanKaydet = async (e) => {
    e.preventDefault();
    if (!formenForm.ad.trim()) {
      alert('Lütfen ekipman adını giriniz.');
      return;
    }

    setIslemYukleniyor(true);
    setMesaj(null);
    try {
      const kod = formenForm.kod.trim() || yeniKodUret();
      const qrKodu = `EQ:${kod}`;

      let fotoUrl = null;
      if (formenResimDosya) {
        const uzanti = formenResimDosya.name.split('.').pop();
        const dosyaAdi = `ekipman-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${uzanti}`;
        const { error: upErr } = await supabase.storage.from('proje-resimleri').upload(dosyaAdi, formenResimDosya);
        if (!upErr) {
          const { data: uData } = supabase.storage.from('proje-resimleri').getPublicUrl(dosyaAdi);
          fotoUrl = uData?.publicUrl || null;
        }
      }

      const seciliDepo = depolar.find((d) => d.id === formenForm.hedef_depo_id);
      const depoAd = seciliDepo ? seciliDepo.ad : (depolar[0]?.ad || 'Ana Depo');
      const depoId = seciliDepo ? seciliDepo.id : (depolar[0]?.id || null);

      const durumDegeri = formenForm.hedef_konum_tipi === 'santiye' ? 'Şantiyede' : 'Depoda';
      const lokasyonDegeri = formenForm.hedef_konum_tipi === 'santiye' ? (formenForm.hedef_santiye || oturum.lokasyon) : null;

      const { data: yeniEkip, error } = await supabase
        .from('ekipmanlar')
        .insert({
          kod,
          ad: formenForm.ad.trim(),
          marka: formenForm.marka.trim(),
          model: formenForm.model.trim(),
          seri_no: formenForm.seri_no.trim(),
          kategori: formenForm.kategori,
          qr_kodu: qrKodu,
          fotograf_url: fotoUrl,
          durum: durumDegeri,
          mevcut_depo_id: formenForm.hedef_konum_tipi === 'depo' ? depoId : null,
          mevcut_depo_ad: formenForm.hedef_konum_tipi === 'depo' ? depoAd : null,
          mevcut_lokasyon: lokasyonDegeri,
          aciklama: formenForm.aciklama.trim(),
          son_hareket_tarihi: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Hareket günlüğü
      await supabase.from('ekipman_hareketleri').insert({
        ekipman_id: yeniEkip.id,
        ekipman_kodu: yeniEkip.kod,
        ekipman_adi: yeniEkip.ad,
        islem_turu: 'Kayıt Oluşturma',
        eski_durum: null,
        yeni_durum: durumDegeri,
        eski_lokasyon: null,
        yeni_lokasyon: durumDegeri === 'Şantiyede' ? lokasyonDegeri : depoAd,
        islem_yapan_rol: 'formen',
        islem_yapan_ad: oturum.ad,
        aciklama: `Formen (${oturum.ad}) tarafından yeni alet/sayım kaydı yapıldı.`,
      });

      // Üretilen QR kodunu göster
      const qrDataUrl = await QRCode.toDataURL(qrKodu, { width: 280, margin: 2 });
      setUretilenQrModal({
        ad: yeniEkip.ad,
        kod: yeniEkip.kod,
        qrDataUrl,
      });

      setFormenEkipmanModal(false);
      setFormenForm({
        kod: '',
        ad: '',
        marka: '',
        model: '',
        seri_no: '',
        kategori: 'Kırıcı & Delici',
        hedef_konum_tipi: 'depo',
        hedef_depo_id: depolar[0]?.id || '',
        hedef_santiye: lokasyonlar[0]?.ad || '',
        aciklama: '',
      });
      setFormenResimDosya(null);
      verileriYukle();
    } catch (err) {
      alert('Ekipman eklenirken hata: ' + err.message);
    } finally {
      setIslemYukleniyor(false);
    }
  };

  const kullanimSuresiHesapla = (tarih) => {
    if (!tarih) return 'Yeni alındı';
    const gun = Math.floor((new Date() - new Date(tarih)) / (1000 * 60 * 60 * 24));
    if (gun === 0) return 'Bugün teslim alındı';
    return `${gun} gündür sizde`;
  };

  return (
    <div>
      {/* ÜST BİLDİRİM / MESAJ */}
      {mesaj && (
        <div className={`feedback ${mesaj.tip}`} style={{ marginBottom: 14 }}>
          {mesaj.metin}
        </div>
      )}

      {/* 📷 HIZLI QR İŞLEM KARTI & FORMEN EKLEME BUTONU */}
      <div className="card" style={{ textAlign: 'center', padding: 20, marginBottom: 16, background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(59,130,246,0.02))', border: '2px dashed var(--accent-personel)' }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>📷</div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
          Ekipman Teslim Al & QR Tara
        </h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', maxWidth: 460, margin: '0 auto 14px auto' }}>
          Ana depodan veya şantiyeden ekipman almak, başka şantiyeye taşımak ya da depoya iade etmek için aletin üzerindeki QR kodu okutun.
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="action btn-punch"
            style={{ width: 'auto', padding: '12px 24px', fontSize: 14, fontWeight: 800, background: 'var(--accent-personel)', display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}
            onClick={() => {
              setQrTaramaModu('ekipman');
              setQrTaramaAcik(true);
              setOkunanEkipman(null);
            }}
          >
            📷 Ekipman QR Kodunu Okut
          </button>

          {/* FORMEN YETKİSİ: DEPOYA YENİ EKİPMAN EKLEME */}
          {oturum.rol === 'formen' && (
            <button
              className="action btn-punch"
              style={{ width: 'auto', padding: '12px 24px', fontSize: 14, fontWeight: 800, background: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}
              onClick={() => {
                setFormenForm({
                  kod: yeniKodUret(),
                  ad: '',
                  marka: '',
                  model: '',
                  seri_no: '',
                  kategori: 'Kırıcı & Delici',
                  hedef_konum_tipi: 'depo',
                  hedef_depo_id: depolar[0]?.id || '',
                  hedef_santiye: oturum.lokasyon || (lokasyonlar[0]?.ad || ''),
                  aciklama: '',
                });
                setFormenEkipmanModal(true);
              }}
            >
              ➕ Depoya / Sahaya Yeni Alet Ekle
            </button>
          )}
        </div>
      </div>

      {/* QR KAMERA MODALI */}
      {qrTaramaAcik && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 18, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                {qrTaramaModu === 'depo_iade' ? '🏢 Ana Depo QR Kodunu Okutun' : '📷 Ekipman QR Kodunu Okutun'}
              </div>
              <button onClick={() => setQrTaramaAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>

            {qrTaramaModu === 'depo_iade' && (
              <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '8px 10px', borderRadius: 8, marginBottom: 10 }}>
                ⚠️ Ekipmanın gerçekten depoya getirildiğini doğrulamak için lütfen ana depodaki sabit QR kodunu kameraya gösterin.
              </div>
            )}

            <QrOkuyucu onOkundu={qrOkundu} onIptal={() => setQrTaramaAcik(false)} />
          </div>
        </div>
      )}

      {/* OKUNAN EKİPMAN AKSİYON EKRANI */}
      {okunanEkipman && (
        <div className="card" style={{ marginBottom: 16, border: '2px solid var(--accent-personel)', padding: 18, background: 'var(--card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 900, color: 'var(--accent-personel)', fontSize: 13 }}>{okunanEkipman.kod}</span>
              <h3 style={{ margin: '2px 0 0 0', fontSize: 17, fontWeight: 800 }}>{okunanEkipman.ad}</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                {okunanEkipman.marka} {okunanEkipman.model} · Kategori: {okunanEkipman.kategori || 'Genel'}
              </div>
            </div>
            <button onClick={() => setOkunanEkipman(null)} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>

          {/* DURUM 1: EKİPMAN DEPODA (TESLİM ALMA AKIŞI) */}
          {okunanEkipman.durum === 'Depoda' && (
            <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 14, marginBottom: 8 }}>
                ✓ Ekipman Depoda ve Kullanıma Müsait!
              </div>

              <label style={{ fontSize: 12, fontWeight: 700 }}>Bu ekipmanı hangi şantiyede kullanacaksınız? *</label>
              <select
                value={seciliSantiye}
                onChange={(e) => setSeciliSantiye(e.target.value)}
                style={{ marginBottom: 12, padding: '8px 10px', fontSize: 13 }}
              >
                {lokasyonlar.map((l) => (
                  <option key={l.ad} value={l.ad}>{l.ad}</option>
                ))}
              </select>

              <button
                className="action btn-punch"
                style={{ width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 800, background: '#16a34a' }}
                onClick={ekipmanTeslimAl}
                disabled={islemYukleniyor}
              >
                {islemYukleniyor ? 'Teslim Alınıyor...' : `📥 Ekipmanı Teslim Al (${seciliSantiye})`}
              </button>
            </div>
          )}

          {/* DURUM 2: ZATEN KENDİ ZİMMETİNDE */}
          {okunanEkipman.durum === 'Kullanımda' && okunanEkipman.zimmetli_personel_no === oturum.personel_no && (
            <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, color: '#2563eb', fontSize: 13, marginBottom: 8 }}>
                ℹ️ Bu ekipman şu anda sizin üzerinize zimmetli (📍 {okunanEkipman.mevcut_lokasyon || 'Şantiye'}). Ne yapmak istersiniz?
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                <button
                  className="action btn-punch"
                  style={{ background: '#16a34a', padding: '9px 6px', fontSize: 12, margin: 0 }}
                  onClick={() => depoIadeBaslat(okunanEkipman)}
                >
                  📦 Ana Depoya İade Et
                </button>
                <button
                  className="action btn-secondary"
                  style={{ padding: '9px 6px', fontSize: 12, margin: 0 }}
                  onClick={() => setTransferModal(okunanEkipman)}
                >
                  🚚 Başka Şantiyeye Taşı
                </button>
                <button
                  className="action btn-secondary"
                  style={{ padding: '9px 6px', fontSize: 12, margin: 0 }}
                  onClick={() => setDevirModal(okunanEkipman)}
                >
                  👥 Personele Devret
                </button>
                <button
                  className="action btn-secondary"
                  style={{ padding: '9px 6px', fontSize: 12, margin: 0, color: '#ef4444' }}
                  onClick={() => setArizaModal(okunanEkipman)}
                >
                  ⚠️ Arıza Bildir
                </button>
              </div>
            </div>
          )}

          {/* DURUM 3: BAŞKA BİR PERSONELDE */}
          {okunanEkipman.durum === 'Kullanımda' && okunanEkipman.zimmetli_personel_no !== oturum.personel_no && (
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 14, marginBottom: 4 }}>
                ⚠️ Ekipman Şu Anda Kullanımda!
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                Bu alet şu anda <b>{okunanEkipman.zimmetli_personel_ad || 'Başka bir personel'}</b> üzerinde zimmetlidir (Şantiye: <b>{okunanEkipman.mevcut_lokasyon || 'Bilinmiyor'}</b>).
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6 }}>
                Ekipmanı teslim alabilmeniz için mevcut personelin size devretmesi veya ana depoya iade etmesi gerekmektedir.
              </div>
            </div>
          )}

          {/* DURUM 4: ARIZALI VEYA BAKIMDA */}
          {(okunanEkipman.durum === 'Arızalı' || okunanEkipman.durum === 'Bakımda') && (
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 800, color: '#d97706', fontSize: 14, marginBottom: 4 }}>
                ⚠️ Ekipman {okunanEkipman.durum} Durumunda!
              </div>
              <div style={{ fontSize: 13 }}>
                Bu ekipman arıza veya bakım nedeniyle kullanıma kapatılmıştır. Lütfen depodan başka bir alternatif ekipman seçiniz.
              </div>
            </div>
          )}
        </div>
      )}

      {/* 📋 ZİMMETİMDEKİ EKİPMANLAR LİSTESİ */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section" style={{ margin: 0 }}>
            🧰 Üzerime Zimmetli Ekipmanlar ({zimmetliEkipmanlar.length})
          </h2>
          <button className="action btn-secondary" style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }} onClick={verileriYukle}>
            🔄 Yenile
          </button>
        </div>

        {zimmetliEkipmanlar.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-soft)' }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>📦</div>
            <b>Şu anda üzerinizde zimmetli bir alet veya ekipman bulunmuyor.</b>
            <div style={{ fontSize: 12, marginTop: 4 }}>Yukarıdaki "Ekipman QR Kodunu Okut" butonu ile depodan ekipman teslim alabilirsiniz.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
            {zimmetliEkipmanlar.map((e) => (
              <div
                key={e.id}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 14,
                  background: 'var(--card)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 900, color: 'var(--accent-personel)', fontSize: 13 }}>{e.kod}</span>
                    <span style={{ background: 'rgba(59,130,246,0.15)', color: '#2563eb', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      Kullanımda
                    </span>
                  </div>

                  <h3 style={{ margin: '4px 0 2px 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{e.ad}</h3>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                    {e.marka} {e.model}
                  </div>

                  <div style={{ background: 'var(--bg-soft)', padding: '8px 10px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span>📍 Şantiye:</span>
                      <b style={{ color: 'var(--ink)' }}>{e.mevcut_lokasyon || 'Şantiyede'}</b>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⏱️ Süre:</span>
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>{kullanimSuresiHesapla(e.son_hareket_tarihi)}</span>
                    </div>
                  </div>
                </div>

                {/* Hızlı İşlem Butonları */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <button
                    className="action btn-punch"
                    style={{ background: '#16a34a', padding: '7px 0', fontSize: 11, margin: 0 }}
                    onClick={() => depoIadeBaslat(e)}
                  >
                    📦 İade Et
                  </button>
                  <button
                    className="action btn-secondary"
                    style={{ padding: '7px 0', fontSize: 11, margin: 0 }}
                    onClick={() => setTransferModal(e)}
                  >
                    🚚 Şantiye Değiştir
                  </button>
                  <button
                    className="action btn-secondary"
                    style={{ padding: '7px 0', fontSize: 11, margin: 0 }}
                    onClick={() => setDevirModal(e)}
                  >
                    👥 Devret
                  </button>
                  <button
                    className="action btn-secondary"
                    style={{ padding: '7px 0', fontSize: 11, margin: 0, color: '#ef4444' }}
                    onClick={() => setArizaModal(e)}
                  >
                    ⚠️ Arıza Bildir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- MODALLAR ---------------- */}

      {/* FORMEN: YENİ EKİPMAN TANIMLAMA MODALI */}
      {formenEkipmanModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setFormenEkipmanModal(false)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 17, fontWeight: 800 }}>➕ Depoya / Sahaya Yeni Alet & Ekipman Ekle</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Formen olarak sahaya yeni gelen veya depoya giren ekipmanları sayım yaparak sisteme kaydedebilirsiniz.
            </div>

            <form onSubmit={formenEkipmanKaydet}>
              <div className="grid cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div>
                  <label>Ekipman Kodu *</label>
                  <input value={formenForm.kod} onChange={(e) => setFormenForm({ ...formenForm, kod: e.target.value })} required />
                </div>
                <div>
                  <label>Ekipman Adı *</label>
                  <input placeholder="Örn: Bosch Kırıcı Matkap" value={formenForm.ad} onChange={(e) => setFormenForm({ ...formenForm, ad: e.target.value })} required />
                </div>
              </div>

              <div className="grid cols-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label>Marka</label>
                  <input placeholder="Bosch, Hilti..." value={formenForm.marka} onChange={(e) => setFormenForm({ ...formenForm, marka: e.target.value })} />
                </div>
                <div>
                  <label>Model</label>
                  <input placeholder="GBH 2-28..." value={formenForm.model} onChange={(e) => setFormenForm({ ...formenForm, model: e.target.value })} />
                </div>
                <div>
                  <label>Seri No</label>
                  <input placeholder="SN-..." value={formenForm.seri_no} onChange={(e) => setFormenForm({ ...formenForm, seri_no: e.target.value })} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Kategori</label>
                <input placeholder="Kırıcı & Delici, Ölçüm Cihazı, Kaynak Makinesi vb." value={formenForm.kategori} onChange={(e) => setFormenForm({ ...formenForm, kategori: e.target.value })} />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Nereye Eklensin? *</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className={`action btn-secondary ${formenForm.hedef_konum_tipi === 'depo' ? 'aktif' : ''}`}
                    style={{ flex: 1, margin: 0, padding: '7px 0', fontWeight: formenForm.hedef_konum_tipi === 'depo' ? 800 : 500, borderColor: formenForm.hedef_konum_tipi === 'depo' ? '#16a34a' : 'var(--border)' }}
                    onClick={() => setFormenForm({ ...formenForm, hedef_konum_tipi: 'depo' })}
                  >
                    🏢 Ana Depoya
                  </button>
                  <button
                    type="button"
                    className={`action btn-secondary ${formenForm.hedef_konum_tipi === 'santiye' ? 'aktif' : ''}`}
                    style={{ flex: 1, margin: 0, padding: '7px 0', fontWeight: formenForm.hedef_konum_tipi === 'santiye' ? 800 : 500, borderColor: formenForm.hedef_konum_tipi === 'santiye' ? '#16a34a' : 'var(--border)' }}
                    onClick={() => setFormenForm({ ...formenForm, hedef_konum_tipi: 'santiye' })}
                  >
                    📍 Şantiyeye
                  </button>
                </div>

                {formenForm.hedef_konum_tipi === 'depo' ? (
                  <select value={formenForm.hedef_depo_id} onChange={(e) => setFormenForm({ ...formenForm, hedef_depo_id: e.target.value })}>
                    {depolar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
                  </select>
                ) : (
                  <select value={formenForm.hedef_santiye} onChange={(e) => setFormenForm({ ...formenForm, hedef_santiye: e.target.value })}>
                    {lokasyonlar.map((l) => <option key={l.ad} value={l.ad}>{l.ad}</option>)}
                  </select>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Fotoğraf (Opsiyonel)</label>
                <input type="file" accept="image/*" onChange={(e) => setFormenResimDosya(e.target.files?.[0] || null)} />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Açıklama / Durum Notu</label>
                <input placeholder="Örn: Sıfır kutusunda teslim alındı." value={formenForm.aciklama} onChange={(e) => setFormenForm({ ...formenForm, aciklama: e.target.value })} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="action btn-punch" style={{ flex: 1, background: '#16a34a' }} disabled={islemYukleniyor}>
                  {islemYukleniyor ? 'Kaydediliyor...' : '✓ Ekipmanı Sisteme Ekle'}
                </button>
                <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setFormenEkipmanModal(false)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ÜRETİLEN QR KOD GÖSTERİMİ */}
      {uretilenQrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setUretilenQrModal(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 22, maxWidth: 360, width: '100%', textAlign: 'center', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#16a34a' }}>✓ Ekipman Başarıyla Eklendi!</div>
            <h3 style={{ margin: '4px 0', fontSize: 16 }}>{uretilenQrModal.ad}</h3>
            <div style={{ fontWeight: 900, color: 'var(--accent-personel)', fontSize: 18, marginBottom: 12 }}>{uretilenQrModal.kod}</div>

            <div style={{ background: '#fff', padding: 12, borderRadius: 10, display: 'inline-block', border: '2px solid var(--border)', marginBottom: 14 }}>
              <img src={uretilenQrModal.qrDataUrl} alt="QR Kod" style={{ width: 220, height: 220, display: 'block' }} />
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>EQ:{uretilenQrModal.kod}</div>
            </div>

            <button className="action btn-punch" style={{ width: '100%' }} onClick={() => setUretilenQrModal(null)}>
              Tamam / Kapat
            </button>
          </div>
        </div>
      )}

      {/* 1. BAŞKA ŞANTİYEYE TAŞIMA MODALI */}
      {transferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setTransferModal(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 800 }}>🚚 Şantiye Transferi: {transferModal.ad}</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Mevcut Şantiye: <b>{transferModal.mevcut_lokasyon || 'Belirtilmedi'}</b>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700 }}>Taşınacak Yeni Şantiye *</label>
            <select value={yeniSantiye} onChange={(e) => setYeniSantiye(e.target.value)} style={{ marginBottom: 14, padding: '8px 10px' }}>
              {lokasyonlar.map((l) => (
                <option key={l.ad} value={l.ad}>{l.ad}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="action btn-punch" style={{ flex: 1 }} onClick={santiyeTransferEt} disabled={islemYukleniyor}>
                {islemYukleniyor ? 'Aktarılıyor...' : '✓ Transferi Kaydet'}
              </button>
              <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setTransferModal(null)}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. BAŞKA PERSONELE DEVRETME MODALI */}
      {devirModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDevirModal(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 800 }}>👥 Personele Devret: {devirModal.ad}</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Ekipman aynı şantiyede kalır, zimmeti seçilen çalışma arkadaşınıza aktarılır.
            </div>

            <label style={{ fontSize: 12, fontWeight: 700 }}>Devralacak Personel *</label>
            <select value={devirPersonelNo} onChange={(e) => setDevirPersonelNo(e.target.value)} style={{ marginBottom: 14, padding: '8px 10px' }}>
              {personeller.map((p) => (
                <option key={p.personel_no} value={p.personel_no}>{p.ad} ({p.rol})</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="action btn-punch" style={{ flex: 1 }} onClick={personeleDevret} disabled={islemYukleniyor}>
                {islemYukleniyor ? 'Devrediliyor...' : '✓ Ekipmanı Devret'}
              </button>
              <button className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setDevirModal(null)}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ARIZA BİLDİRME MODALI */}
      {arizaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setArizaModal(null)}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, maxWidth: 420, width: '100%', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 800, color: '#ef4444' }}>⚠️ Arıza Bildirimi: {arizaModal.ad}</h3>
            <form onSubmit={arizaBildir}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Arıza Açıklaması *</label>
              <textarea
                required
                rows={3}
                placeholder="Örn: Çalışırken motordan kıvılcım çıkıyor ve uç dönmüyor."
                value={arizaMetni}
                onChange={(e) => setArizaMetni(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--ink)', marginBottom: 10 }}
              />

              <label style={{ fontSize: 12, fontWeight: 700 }}>Fotoğraf Ekle (Opsiyonel)</label>
              <input type="file" accept="image/*" onChange={(e) => setArizaFotoDosya(e.target.files?.[0] || null)} style={{ marginBottom: 14 }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="action btn-punch" style={{ flex: 1, background: '#ef4444' }} disabled={islemYukleniyor}>
                  {islemYukleniyor ? 'Gönderiliyor...' : '⚠️ Arızayı Bildir'}
                </button>
                <button type="button" className="action btn-secondary" style={{ width: 'auto' }} onClick={() => setArizaModal(null)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
