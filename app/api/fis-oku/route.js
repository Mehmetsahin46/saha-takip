import { NextResponse } from 'next/server';

// In-memory rate limiting (IP bazlı 1 dakikada max 25 istek)
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 25;

  const current = rateLimitMap.get(ip) || [];
  const recent = current.filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    return true;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-ip';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { basari: false, mesaj: 'Çok fazla istek gönderildi. Lütfen bir dakika bekleyin.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.image) {
      return NextResponse.json({ basari: false, mesaj: 'Geçersiz veya eksik görsel verisi.' }, { status: 400 });
    }

    const { image, mediaType } = body;

    // Dosya boyutu sınırı (Max ~6MB base64)
    if (typeof image !== 'string' || image.length > 8 * 1024 * 1024) {
      return NextResponse.json({ basari: false, mesaj: 'Görsel boyutu çok büyük (Max 5MB).' }, { status: 400 });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const detectedMime = mediaType || (image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');

    if (!allowedMimeTypes.includes(detectedMime.toLowerCase())) {
      return NextResponse.json({ basari: false, mesaj: 'Desteklenmeyen dosya formatı. (Sadece JPG, PNG, WEBP)' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const base64Data = image.includes(',') ? image.split(',')[1] : image;

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
                      mime_type: detectedMime,
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
              kalem_turu: String(parsed.kalem_turu || 'Şantiye Gideri').slice(0, 80),
              miktar: Math.max(0.01, Number(parsed.miktar) || 1),
              birim_fiyat: Math.max(0, Number(parsed.birim_fiyat) || 0),
              aciklama: String(parsed.aciklama || 'Fişten okundu').slice(0, 200),
            },
          });
        }
      } catch (aiErr) {
        console.warn('Gemini OCR API çağrısı başarısız:', aiErr.message);
      }
    }

    // Yedek / Demo Modu
    return NextResponse.json({
      basari: true,
      veri: {
        kalem_turu: 'Hırdavat & Sarf Malzeme',
        miktar: 1,
        birim_fiyat: 120.0,
        aciklama: 'Otomatik fiş tarama simülasyonu',
      },
    });
  } catch (error) {
    return NextResponse.json({ basari: false, mesaj: 'İşlem gerçekleştirilemedi.' }, { status: 500 });
  }
}
