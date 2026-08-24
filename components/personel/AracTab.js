'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';

export default function AracTab({ oturum }) {
  const { t } = useLocale();
  const [acikKayit, setAcikKayit] = useState(null);
  const [bostaAraclar, setBostaAraclar] = useState([]);
  const [tumAraclar, setTumAraclar] = useState([]);
  const [gecmis, setGecmis] = useState([]);
  const [plaka, setPlaka] = useState('');
  const [alisKm, setAlisKm] = useState('');
  const [teslimKm, setTeslimKm] = useState('');
  const [mesaj, setMesaj] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  async function veriYukle() {
    setYukleniyor(true);
    const { data: acik } = await supabase.from('arac_kullanim').select('*').eq('personel_no', oturum.personel_no).eq('durum', 'Açık').maybeSingle();
    setAcikKayit(acik || null);

    if (!acik) {
      const { data: bosta } = await supabase.from('araclar').select('*').eq('durum', 'Boşta');
      setBostaAraclar(bosta || []);
      if (bosta && bosta.length) {
        setPlaka(bosta[0].plaka);
        setAlisKm(bosta[0].son_km != null ? String(bosta[0].son_km) : '');
      }
    }
    const { data: hepsi } = await supabase.from('araclar').select('*');
    setTumAraclar(hepsi || []);

    const { data: gecmisVeri } = await supabase.from('arac_kullanim').select('*').eq('personel_no', oturum.personel_no).eq('durum', 'Kapalı').order('tarih', { ascending: false }).limit(10);
    setGecmis(gecmisVeri || []);
    setYukleniyor(false);
  }

  useEffect(() => { veriYukle(); }, []);

  function plakaDegisti(yeniPlaka) {
    setPlaka(yeniPlaka);
    const arac = bostaAraclar.find((a) => a.plaka === yeniPlaka);
    setAlisKm(arac && arac.son_km != null ? String(arac.son_km) : '');
  }

  async function teslimAl() {
    setMesaj(null);
    if (!plaka || alisKm === '') { setMesaj({ tip: 'err', metin: 'Plaka ve alış kilometresi gerekli.' }); return; }
    const { error: e1 } = await supabase.from('arac_kullanim').insert({
      personel_no: oturum.personel_no, ad: oturum.ad, plaka, alis_km: Number(alisKm), durum: 'Açık',
    });
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Kullanımda' }).eq('plaka', plaka);
    setMesaj({ tip: 'ok', metin: plaka + ' teslim alındı.' });
    setAlisKm('');
    veriYukle();
  }

  async function teslimEt() {
    setMesaj(null);
    const tVal = Number(teslimKm);
    if (isNaN(tVal) || tVal <= 0) {
      setMesaj({ tip: 'err', metin: 'Lütfen geçerli bir teslim kilometresi girin.' });
      return;
    }
    if (tVal < acikKayit.alis_km) {
      setMesaj({ tip: 'err', metin: `${t('teslimKmHata')} (Alış KM: ${acikKayit.alis_km.toLocaleString('tr-TR')})` });
      return;
    }
    const katedilen = tVal - acikKayit.alis_km;
    const { error: e1 } = await supabase.from('arac_kullanim').update({
      teslim_km: tVal,
      katedilen_km: katedilen,
      durum: 'Kapalı',
      teslim_saati: new Date().toISOString()
    }).eq('id', acikKayit.id);
    
    if (e1) { setMesaj({ tip: 'err', metin: e1.message }); return; }
    await supabase.from('araclar').update({ durum: 'Boşta', son_km: tVal }).eq('plaka', acikKayit.plaka);
    setMesaj({ tip: 'ok', metin: 'Araç başarıyla teslim edildi. Kat edilen: ' + katedilen + ' km' });
    setTeslimKm('');
    veriYukle();
  }

  if (yukleniyor) return <div className="loading-text">{t('yukleniyor')}</div>;

  return (
    <>
      <div className="card">
        <h2 className="section">{t('aracFilosu')}</h2>
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {tumAraclar.map((a) => {
            const secilebilir = !acikKayit && a.durum === 'Boşta';
            const secili = secilebilir && plaka === a.plaka;
            return (
              <div key={a.plaka} onClick={secilebilir ? () => plakaDegisti(a.plaka) : undefined} style={{ padding: 12, cursor: secilebilir ? 'pointer' : 'default', opacity: secilebilir || acikKayit ? 1 : 0.55, border: secili ? '2px solid var(--accent-personel)' : '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ width: '100%', height: 90, borderRadius: 8, background: 'rgba(127, 127, 127, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 }}>
                  {a.resim_url ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 28 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{[a.marka, a.model].filter(Boolean).join(' ')}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{a.plaka}</div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{(a.son_km || 0).toLocaleString('tr-TR')} km</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {acikKayit ? (
        <div className="card">
          <h2 className="section">{t('aracTeslimEt')}</h2>
          <div className="loc-badge">
            <div><div className="label">Kullanımdaki araç</div><div className="value">{acikKayit.plaka}</div></div>
            <div><div className="label">Alış km</div><div className="value">{acikKayit.alis_km.toLocaleString('tr-TR')}</div></div>
          </div>
          <label style={{ marginTop: 12 }}>Teslim kilometresi</label>
          <input type="number" value={teslimKm} onChange={(e) => setTeslimKm(e.target.value)} placeholder={`Min ${acikKayit.alis_km}`} />
          <button className="action btn-punch cikis" onClick={teslimEt}>Aracı Teslim Et</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      ) : (
        <div className="card">
          <h2 className="section">{t('aracTeslimAl')}</h2>
          <label>Plaka seç</label>
          <select value={plaka} onChange={(e) => plakaDegisti(e.target.value)}>
            {bostaAraclar.length === 0 && <option value="">Boşta araç yok</option>}
            {bostaAraclar.map((a) => <option key={a.plaka} value={a.plaka}>{a.plaka}</option>)}
          </select>
          <label>Alış kilometresi</label>
          <input type="number" value={alisKm} readOnly disabled style={{ background: 'rgba(127, 127, 127, 0.12)' }} />
          <button className="action btn-punch" onClick={teslimAl} disabled={!bostaAraclar.length}>Aracı Teslim Al</button>
          {mesaj && <div className={'feedback ' + mesaj.tip}>{mesaj.metin}</div>}
        </div>
      )}
    </>
  );
}
