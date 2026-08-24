-- ==============================================================================
-- SAHA TAKİP SİSTEMİ - DEPO & EKİPMAN YÖNETİMİ VERİTABANI ŞEMASI
-- ==============================================================================

-- 1. DEPOLAR TABLOSU
CREATE TABLE IF NOT EXISTS public.depolar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad TEXT NOT NULL,
    kod TEXT UNIQUE NOT NULL,
    qr_kodu TEXT UNIQUE NOT NULL,
    adres TEXT,
    yetkili_personel_no TEXT,
    aciklama TEXT,
    aktif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EKİPMANLAR TABLOSU
CREATE TABLE IF NOT EXISTS public.ekipmanlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kod TEXT UNIQUE NOT NULL,
    ad TEXT NOT NULL,
    marka TEXT,
    model TEXT,
    seri_no TEXT,
    kategori TEXT,
    qr_kodu TEXT UNIQUE NOT NULL,
    fotograf_url TEXT,
    satin_alma_tarihi DATE,
    satin_alma_fiyati NUMERIC DEFAULT 0,
    para_birimi TEXT DEFAULT 'PLN',
    aciklama TEXT,
    durum TEXT NOT NULL DEFAULT 'Depoda' CHECK (durum IN ('Depoda', 'Kullanımda', 'Şantiyede', 'Bakımda', 'Arızalı', 'Kayıp', 'Hurda')),
    mevcut_depo_id UUID REFERENCES public.depolar(id) ON DELETE SET NULL,
    mevcut_depo_ad TEXT,
    mevcut_lokasyon TEXT,
    zimmetli_personel_no TEXT,
    zimmetli_personel_ad TEXT,
    son_hareket_tarihi TIMESTAMPTZ,
    son_bakim_tarihi DATE,
    sonraki_bakim_tarihi DATE,
    periyodik_bakim_gun INT DEFAULT 180,
    toplam_bakim_maliyeti NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. EKİPMAN HAREKETLERİ (AUDIT TRAIL - DEĞİŞTİRİLEMEZ GEÇMİŞ)
CREATE TABLE IF NOT EXISTS public.ekipman_hareketleri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekipman_id UUID REFERENCES public.ekipmanlar(id) ON DELETE CASCADE,
    ekipman_kodu TEXT,
    ekipman_adi TEXT,
    islem_turu TEXT NOT NULL,
    eski_durum TEXT,
    yeni_durum TEXT,
    eski_personel_no TEXT,
    eski_personel_ad TEXT,
    yeni_personel_no TEXT,
    yeni_personel_ad TEXT,
    eski_lokasyon TEXT,
    yeni_lokasyon TEXT,
    islem_yapan_rol TEXT,
    islem_yapan_ad TEXT,
    tarih TIMESTAMPTZ DEFAULT NOW(),
    aciklama TEXT,
    fotograf_url TEXT,
    meta_veriler JSONB
);

-- 4. EKİPMAN ARIZALARI TABLOSU
CREATE TABLE IF NOT EXISTS public.ekipman_arizalari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekipman_id UUID REFERENCES public.ekipmanlar(id) ON DELETE CASCADE,
    ekipman_kodu TEXT,
    ekipman_adi TEXT,
    bildiren_personel_no TEXT,
    bildiren_personel_ad TEXT,
    lokasyon TEXT,
    ariza_aciklamasi TEXT NOT NULL,
    fotograf_url TEXT,
    oncelik TEXT DEFAULT 'Normal' CHECK (oncelik IN ('Düşük', 'Normal', 'Acil')),
    durum TEXT DEFAULT 'Açık' CHECK (durum IN ('Açık', 'İnceleniyor', 'Tamirde', 'Çözüldü', 'Hurdaya Ayrıldı')),
    patron_notu TEXT,
    cozum_aciklamasi TEXT,
    tarih TIMESTAMPTZ DEFAULT NOW(),
    cozulme_tarihi TIMESTAMPTZ
);

-- 5. EKİPMAN BAKIMLARI TABLOSU
CREATE TABLE IF NOT EXISTS public.ekipman_bakimlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ekipman_id UUID REFERENCES public.ekipmanlar(id) ON DELETE CASCADE,
    ekipman_kodu TEXT,
    ekipman_adi TEXT,
    bakim_turu TEXT DEFAULT 'Periyodik Bakım',
    bakim_tarihi DATE NOT NULL,
    sonraki_bakim_tarihi DATE,
    maliyet NUMERIC DEFAULT 0,
    para_birimi TEXT DEFAULT 'PLN',
    servis_adi TEXT,
    fatura_fis_no TEXT,
    aciklama TEXT,
    yapilan_islemler TEXT,
    kaydeden TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- İNDEKSLER (Performans ve Hızlı Arama İçin)
CREATE INDEX IF NOT EXISTS idx_ekipmanlar_kod ON public.ekipmanlar(kod);
CREATE INDEX IF NOT EXISTS idx_ekipmanlar_qr ON public.ekipmanlar(qr_kodu);
CREATE INDEX IF NOT EXISTS idx_ekipmanlar_durum ON public.ekipmanlar(durum);
CREATE INDEX IF NOT EXISTS idx_ekipmanlar_personel ON public.ekipmanlar(zimmetli_personel_no);
CREATE INDEX IF NOT EXISTS idx_ekipmanlar_lokasyon ON public.ekipmanlar(mevcut_lokasyon);
CREATE INDEX IF NOT EXISTS idx_hareketler_ekipman ON public.ekipman_hareketleri(ekipman_id);
CREATE INDEX IF NOT EXISTS idx_hareketler_tarih ON public.ekipman_hareketleri(tarih DESC);

-- VARSAYILAN ANA DEPO TANIMI (Eğer Yoksa Ekle)
INSERT INTO public.depolar (ad, kod, qr_kodu, adres, aciklama)
VALUES ('Ana Depo - Merkez', 'DEPOT-01', 'DEPOT:ANA-DEPO', 'Merkez Şantiye Deposu', 'Tüm makine ve el aletlerinin ana merkezi deposu')
ON CONFLICT (kod) DO NOTHING;

-- RLS (ROW LEVEL SECURITY) POLİTİKALARI (İsteğe Bağlı & Güvenlik İçin)
ALTER TABLE public.depolar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekipmanlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekipman_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekipman_arizalari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekipman_bakimlari ENABLE ROW LEVEL SECURITY;

-- Anonim / Authenticated tam okuma/yazma politikaları
CREATE POLICY "Anon Full Access Depolar" ON public.depolar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access Ekipmanlar" ON public.ekipmanlar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access Ekipman Hareketleri" ON public.ekipman_hareketleri FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access Ekipman Arizalari" ON public.ekipman_arizalari FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access Ekipman Bakimlari" ON public.ekipman_bakimlari FOR ALL USING (true) WITH CHECK (true);
