import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { lokasyon, toplamMaliyet, kalemler } = await request.json();

    if (!lokasyon) {
      return NextResponse.json({ basari: false, mesaj: 'Lokasyon bilgisi eksik.' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const kalemOzetleri = (kalemler || [])
          .map((k) => `- ${k.kalem_turu}: ${k.miktar} birim x ${k.birim_fiyat} PLN = ${k.toplam} PLN (${k.aciklama || 'açıklama yok'})`)
          .join('\n');

        const prompt = `Aşağıda belirtilen şantiye lokasyonu ve girilen maliyet kalemleri için müşteriye sunulacak resmi, profesyonel ve ikna edici bir inşaat/taşeron fiyat teklif mektubu hazırla.

Lokasyon: ${lokasyon}
Toplam Maliyet: ${toplamMaliyet} PLN
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
Konu: ${lokasyon} Projesi İmalat ve Uygulama Fiyat Teklifi

${lokasyon} adresindeki projeniz kapsamında tarafımızca incelenen keşif ve saha verileri doğrultusunda hazırlanan detaylı teklifimiz aşağıda bilginize sunulmuştur:

1. KAPSAM VE MALİYET DETAYLARI:
${(kalemler || []).map((k) => `• ${k.kalem_turu}: ${k.miktar} Adet/Birim — Toplam: ${Number(k.toplam || 0).toLocaleString('pl-PL')} PLN`).join('\n') || '• Saha genel imalat ve uygulama kalemleri'}

2. FİNANSAL ÖZET:
Keşif Toplam Maliyet Bedeli: ${Number(toplamMaliyet || 0).toLocaleString('pl-PL')} PLN
Teklif Bedeli (KDV Hariç): ${(Number(toplamMaliyet || 0) * 1.25).toLocaleString('pl-PL')} PLN

3. ŞARTLAR VE TAAHHÜT:
- Tüm imalatlar yürürlükteki yapı denetim ve iş güvenliği standartlarına uygun olarak gerçekleştirilecektir.
- Malzeme ve işçilik garantimiz 24 ay sürelidir.
- Teklifimiz 15 gün süreyle geçerlidir.

Saygılarımızla,
Saha Takip & İnşaat Yönetimi`;

    return NextResponse.json({ basari: true, teklifMetni: yedekMetin });
  } catch (error) {
    return NextResponse.json({ basari: false, mesaj: 'Teklif hazırlanamadı: ' + error.message }, { status: 500 });
  }
}
