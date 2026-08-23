# 🏗️ Saha Takip — Şantiye & Personel Yönetim Sistemi

Bu proje, inşaat şantiyeleri ve saha operasyonlarının uçtan uca yönetilmesi amacıyla geliştirilmiş modern bir **Next.js (App Router)** ve **Supabase** uygulamasıdır.

---

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarlayın
`.env.example` dosyasını `.env.local` olarak kopyalayın ve Supabase bilgilerinizi girin:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# İsteğe Bağlı AI ve E-posta Entegrasyonları
GEMINI_API_KEY=your-gemini-api-key
RESEND_API_KEY=your-resend-key
```

### 3. Veritabanını Kurun (Supabase)
Proje kök dizinindeki `supabase_schema.sql` dosyasının içeriğini kopyalayıp Supabase panelinizdeki **SQL Editor** kısmına yapıştırarak çalıştırın. Bu işlem:
- Tüm tabloları (`personel`, `lokasyonlar`, `giris_cikis`, `saha_verileri`, `araclar`, `gorevler`, `santiye_defterleri`, `projeler`, `puantaj_manuel`, `aylik_fazla_mesai` vb.)
- Başlangıç demo kullanıcılarını ve şantiyelerini
- Real-time yayın aboneliklerini otomatik olarak oluşturur.

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin.

---

## 👥 Demo Giriş Bilgileri

Giriş ekranında hızlı giriş butonları veya aşağıdaki numaralar ile oturum açabilirsiniz (Varsayılan şifre: `1234`):

| Rol | Personel No | Şifre | Açıklama |
| :--- | :--- | :--- | :--- |
| **👔 Patron** | `1000` | `1234` | Tam yetkili yönetim, finans, puantaj matrisi, hakedişler, teklifler, araç filosu ve ayarlar. |
| **👷 Formen** | `1001` | `1234` | Şantiye girişi, günlük faaliyet raporu doldurma, fiş okuma ve harcama/avans girişi. |
| **🔨 Usta / İşçi**| `1002`, `1003` | `1234` | Mesai giriş-çıkış (GPS/QR), saat takibi, araç teslim alma/bırakma, görev tamamlama. |

---

## 🌟 Temel Özellikler

- **🕒 Akıllı Mesai & Puantaj Matrisi:**
  - GPS yarıçap doğrulama ve QR kod okutma zorunluluğu (açılıp kapatılabilir).
  - Excel şablonu standardında `1` (Tam), `0.5` (Yarım), `P` (Pazar), `R` (Rapor), `İ` (İzin) kodlarıyla interaktif aylık puantaj.
  - Otomatik aylık hakediş ve hesap kapatma tablosu (Mesai + Fazla Mesai + Şantiye Harcaması - Avans).

- **📷 AI Fiş & Fatura Tarama:**
  - Formenler telefon kamerasıyla şantiye fişinin fotoğrafını çeker; yapay zeka malzeme türü, miktar, birim fiyat ve toplam tutarı otomatik ayrıştırır.

- **🚐 Araç Filosu & Muayene (Przegląd) Takibi:**
  - Araç teslim alma ve teslim etme kilometre kayıtları.
  - Muayene tarihine 10 gün kala veya süresi geçtiğinde otomatik görsel uyarı rozetleri.

- **📋 Şantiye Defteri (Günlük Faaliyet Raporu):**
  - Formenlerin işçi sayıları, makina/ekipman listesi, bugün yapılan ve yarın yapılacak işleri patrona anlık bildirimle göndermesi.

- **📍 Mimari Planlar & İnteraktif Hata Pinleri:**
  - Kat planı / proje görselleri üzerinde tıklayarak sorunlu noktaya kırmızı pin bırakma ve durum takibi.

- **📝 AI Destekli Teklif Üretici:**
  - Şantiyede harcanan malzeme ve işçilik verilerinden tek tuşla profesyonel PDF teklif mektubu üretimi.

- **🌐 Çoklu Dil & Tema:**
  - Türkçe 🇹🇷, Lehçe 🇵🇱, İngilizce 🇬🇧 arayüz desteği.
  - Karanlık (Dark) ve Aydınlık (Light) tema geçişi.
