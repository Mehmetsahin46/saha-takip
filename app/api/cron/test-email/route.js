import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { eposta } = await request.json();

    if (!eposta || !eposta.includes('@')) {
      return NextResponse.json({ basari: false, mesaj: 'Geçersiz e-posta adresi.' }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      try {
        const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: eposta,
            subject: '🏗️ Saha Takip — Test E-postası',
            html: `
              <h2>Saha Takip E-posta Bildirim Sistemi</h2>
              <p>Bu bir test e-postasıdır. E-posta raporlama altyapınız başarıyla çalışmaktadır.</p>
              <p>Tarih: ${new Date().toLocaleString('tr-TR')}</p>
            `,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          return NextResponse.json({ basari: true, mesaj: `Test e-postası ${eposta} adresine başarıyla iletildi.` });
        } else {
          return NextResponse.json({ basari: false, mesaj: data.message || 'E-posta sağlayıcı hatası.' });
        }
      } catch (err) {
        console.warn('Resend gönderim hatası:', err.message);
      }
    }

    // Demo / Başarılı simülasyon yanıtı
    return NextResponse.json({
      basari: true,
      mesaj: `[Test Modu] ${eposta} adresine test e-posta isteği başarıyla simüle edildi. (Canlı gönderim için RESEND_API_KEY tanımlayabilirsiniz).`,
    });
  } catch (error) {
    return NextResponse.json({ basari: false, mesaj: 'E-posta gönderilemedi: ' + error.message }, { status: 500 });
  }
}
