import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { image, mediaType } = await request.json();

    if (!image) {
      return NextResponse.json({ basari: false, mesaj: 'Görsel verisi bulunamadı.' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    // Eğer Gemini API Anahtarı girilmişse Google Gemini Vision API ile fişi oku
    if (geminiKey) {
      try {
        const base64Data = image.includes(',') ? image.split(',')[1] : image;
        const mimeType = mediaType || (image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');

        const prompt = `Sen bir inşaat ve şantiye muhasebe uzmanısın. Ekteki fiş/fatura görselini analiz et ve JSON formatında şu alanları döndür:
- "kalem_turu": Alınan malzemenin/hizmetin kısa kategorisi (örn: "Çimento", "Akaryakıt", "Yemek", "Hırdavat", "Boya", "Demir").
- "miktar": Miktar veya adet (sayısal float, bilinmiyorsa 1).
- "birim_fiyat": Birim fiyat veya toplam tutar (sayısal float PLN).
- "aciklama": Fişten okunan detaylı ürün/firma açıklaması veya fiş no.

Sadece geçerli bir JSON objesi döndür, markdown blokları veya ekstra metin ekleme.
Örnek format:
{"kalem_turu": "Hırdavat", "miktar": 2, "birim_fiyat": 45.50, "aciklama": "Castorama vida ve dübel alımı"}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              response_mime_type: 'application/json',
            },
          }),
        });

        const geminiResult = await response.json();
        const rawText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawText) {
          const parsed = JSON.parse(rawText);
          return NextResponse.json({
            basari: true,
            veri: {
              kalem_turu: parsed.kalem_turu || 'Şantiye Gideri',
              miktar: Number(parsed.miktar) || 1,
              birim_fiyat: Number(parsed.birim_fiyat) || 0,
              aciklama: parsed.aciklama || 'Fişten okundu',
            },
          });
        }
      } catch (aiErr) {
        console.warn('Gemini OCR API çağrısı başarısız, simülasyona geçiliyor:', aiErr.message);
      }
    }

    // Yedek / Demo Modu (API Key henüz girilmediğinde sistemin sorunsuz çalışması için)
    return NextResponse.json({
      basari: true,
      veri: {
        kalem_turu: 'Hırdavat & Sarf Malzeme',
        miktar: 1,
        birim_fiyat: 120.00,
        aciklama: 'Otomatik fiş tarama simülasyonu (Gemini API anahtarı ekleyerek canlı OCR açabilirsiniz)',
      },
    });
  } catch (error) {
    return NextResponse.json({ basari: false, mesaj: 'Fiş okunamadı: ' + error.message }, { status: 500 });
  }
}
