import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bugunBaslangic = new Date();
    bugunBaslangic.setHours(0, 0, 0, 0);

    // Çıkış yapılmamış ve bugünden önceki günlerde açık kalmış tüm mesaileri bul
    const { data: acikMesailer, error } = await supabase
      .from('giris_cikis')
      .select('*')
      .eq('durum', 'Açık')
      .lt('giris_saati', bugunBaslangic.toISOString());

    if (error) throw error;

    let kapatilanAdet = 0;

    for (const m of (acikMesailer || [])) {
      const girisGunStr = new Date(m.giris_saati).toISOString().slice(0, 10);
      const otoCikis = new Date(girisGunStr + 'T23:59:59Z');

      await supabase.from('giris_cikis').update({
        cikis_saati: otoCikis.toISOString(),
        sure_saat: 8, // Normal günlük 8 saat çalışma süresi
        durum: 'Kapalı'
      }).eq('id', m.id);

      kapatilanAdet++;
    }

    return NextResponse.json({
      basari: true,
      mesaj: `Toplam ${kapatilanAdet} açık mesai 23:59 saati ve normal 8 saatlik mesai ile kapatıldı.`,
      kapatilanAdet
    });
  } catch (err) {
    return NextResponse.json({ basari: false, hata: err.message }, { status: 500 });
  }
}
