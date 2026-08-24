import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.lokasyon) {
      return NextResponse.json({ basari: false, mesaj: 'Lokasyon bilgisi zorunludur.' }, { status: 400 });
    }

    const { lokasyon, toplamMaliyet, kalemler } = body;
    const sanitizedLokasyon = String(lokasyon).slice(0, 120).trim();
    const sanitizedMaliyet = Math.max(0, Number(toplamMaliyet) || 0);
    const sanitizedKalemler = Array.isArray(kalemler) ? kalemler.slice(0, 60) : [];

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const kalemOzetleri = sanitizedKalemler
          .map((k) => `- ${String(k.kalem_turu || '').slice(0, 50)}: ${Number(k.miktar) || 1} birim x ${Number(k.birim_fiyat) || 0} PLN = ${Number(k.toplam) || 0} PLN`)
          .join('\n');

        const prompt = `Aşağıda belirtilen şantiye lokasyonu ve girilen maliyet kalemleri için müşteriye sunulacak resmi, profesyonel ve ikna edici bir inşaat/taşeron fiyat teklif mektubu hazırla.

Lokasyon: ${sanitizedLokasyon}
Toplam Maliyet: ${sanitizedMaliyet} PLN
Kalemler:
${kalemOzetleri || 'Detay girilmedi.'}

Teklif metninde şunlar yer alsın:
1. Sayın Yetkili hitabı ve proje kapsamının özeti.
2. Kalemlerin işçilik, malzeme ve lojistik olarak profesyonel dökümü.
3. Garanti, iş teslim süresi ve kalite taahhütleri.
4. Toplam teklif bedeli (kâr marjı eklenmiş şekilde tahmini veya maliyet bazlı).
5. Şirket imza ve onay alanı.`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 },
          }),
        });

        const geminiResult = await response.json();
        const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          return NextResponse.json({ basari: true, teklifMetni: text });
        }
      } catch (aiErr) {
        console.warn('Gemini teklif API hatası:', aiErr.message);
      }
    }

    // Yedek Profesyonel Teklif Şablonu
    const bugun = new Date().toLocaleDateString('tr-TR');
    const yedekMetin = `SAYIN İŞVEREN / PROJE YÖNETİMİ

Tarih: ${bugun}
Konu: ${sanitizedLokasyon} Projesi İmalat ve Uygulama Fiyat Teklifi

${sanitizedLokasyon} adresindeki projeniz kapsamında tarafımızca incelenen keşif ve saha verileri doğrultusunda hazırlanan detaylı teklifimiz aşağıda bilginize sunulmuştur:

1. KAPSAM VE MALİYET DETAYLARI:
${sanitizedKalemler.map((k) => `• ${k.kalem_turu}: ${k.miktar} Adet/Birim — Toplam: ${Number(k.toplam || 0).toLocaleString('pl-PL')} PLN`).join('\n') || '• Saha genel imalat ve uygulama kalemleri'}

2. FİNANSAL ÖZET:
Keşif Toplam Maliyet Bedeli: ${sanitizedMaliyet.toLocaleString('pl-PL')} PLN
Teklif Bedeli (KDV Hariç): ${(sanitizedMaliyet * 1.25).toLocaleString('pl-PL')} PLN

3. ŞARTLAR VE TAAHHÜT:
- Tüm imalatlar yürürlükteki yapı denetim ve iş güvenliği standartlarına uygun olarak gerçekleştirilecektir.
- Malzeme ve işçilik garantimiz 24 ay sürelidir.
- Teklifimiz 15 gün süreyle geçerlidir.

Saygılarımızla,
Saha Takip & İnşaat Yönetimi`;

    return NextResponse.json({ basari: true, teklifMetni: yedekMetin });
  } catch (error) {
    return NextResponse.json({ basari: false, mesaj: 'Teklif hazırlanamadı.' }, { status: 500 });
  }
}
