'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/lib/i18n';

const KM_BIRIM_MALIYET = 0.8;

function formatPLN(deger) {
  if (deger == null || isNaN(deger)) return '0.00 PLN';
  return Number(deger).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PLN';
}

export default function AracFiloTab() {
  const { t, sureFormatlaLocale } = useLocale();
  const [araclar, setAraclar] = useState([]);
  const [kayitlar, setKayitlar] = useState([]);
  const [seciliPlaka, setSeciliPlaka] = useState(null);
  const [baslangicTarih, setBaslangicTarih] = useState('');
  const [bitisTarih, setBitisTarih] = useState('');
  const [personelArama, setPersonelArama] = useState('');
  const [editInspectionPlaka, setEditInspectionPlaka] = useState(null);
  const [sonMuayeneVal, setSonMuayeneVal] = useState('');
  const [sonrakiMuayeneVal, setSonrakiMuayeneVal] = useState('');

  function araclariYukle() {
    supabase.from('araclar').select('*').then(({ data }) => setAraclar(data || []));
  }

  useEffect(() => {
    araclariYukle();
    supabase.from('arac_kullanim').select('*').order('tarih', { ascending: false }).then(({ data }) => setKayitlar(data || []));
  }, []);

  function muayeneDurumu(a) {
    if (!a.sonraki_muayene_tarihi) return null;
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const hedef = new Date(a.sonraki_muayene_tarihi);
    const gunKalan = Math.round((hedef - bugun) / 86400000);
    if (gunKalan < 0) return { seviye: 'gecti', gunKalan, metin: `${Math.abs(gunKalan)} ${t('gecenGun')}!` };
    if (gunKalan <= 15) return { seviye: 'yakin', gunKalan, metin: `${gunKalan} ${t('kalanGun')}` };
    if (gunKalan <= 30) return { seviye: 'uyari', gunKalan, metin: `${gunKalan} ${t('kalanGun')}` };
    return { seviye: 'normal', gunKalan, metin: `${gunKalan} ${t('kalanGun')}` };
  }

  async function muayeneKaydet(plaka) {
    if (!sonrakiMuayeneVal) { alert('Lütfen bir sonraki muayene tarihini girin.'); return; }
    await supabase.from('araclar').update({
      son_muayene_tarihi: sonMuayeneVal || null,
      sonraki_muayene_tarihi: sonrakiMuayeneVal,
    }).eq('plaka', plaka);
    setEditInspectionPlaka(null);
    setSonMuayeneVal(''); setSonrakiMuayeneVal('');
    araclariYukle();
  }

  let gosterilenKayitlar = seciliPlaka ? kayitlar.filter((k) => k.plaka === seciliPlaka) : kayitlar;
  if (baslangicTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) >= new Date(baslangicTarih));
  if (bitisTarih) gosterilenKayitlar = gosterilenKayitlar.filter((k) => new Date(k.tarih) <= new Date(bitisTarih + 'T23:59:59'));
  if (personelArama.trim()) gosterilenKayitlar = gosterilenKayitlar.filter((k) => (k.ad || '').toLocaleLowerCase('tr-TR').includes(personelArama.trim().toLocaleLowerCase('tr-TR')));

  const toplamKm = gosterilenKayitlar.reduce((a, k) => a + (Number(k.katedilen_km) || 0), 0);

  function sureMetni(baslangic, bitis) {
    if (!baslangic || !bitis) return '—';
    const dakika = Math.round((new Date(bitis) - new Date(baslangic)) / 60000);
    if (dakika < 60) return dakika + ' dk';
    return Math.floor(dakika / 60) + ' sa ' + (dakika % 60) + ' dk';
  }

  function kartaTiklandi(e, plaka) {
    e.stopPropagation();
    setSeciliPlaka((mevcut) => (mevcut === plaka ? null : plaka));
  }

  // Muayene Uyarıları Listesi
  const muayeneUyarilari = araclar
    .map((a) => ({ ...a, info: muayeneDurumu(a) }))
    .filter((a) => a.info && (a.info.seviye === 'gecti' || a.info.seviye === 'yakin' || a.info.seviye === 'uyari'));

  return (
    <div onClick={() => setSeciliPlaka(null)}>
      {/* ⚠️ MUAYENE VE PERİYODİK BAKIM ÜST UYARI ALANI */}
      {muayeneUyarilari.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex', flexDirection: 'column', gap: 6
        }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚠️ {t('muayeneUyarisi')} ({muayeneUyarilari.length})
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {muayeneUyarilari.map((a) => {
              const isGecti = a.info.seviye === 'gecti';
              return (
                <div key={a.plaka} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: isGecti ? '#ef4444' : '#f59e0b', color: '#fff'
                  }}>
                    {isGecti ? t('muayeneGecmis') : t('muayeneYaklasti')}
                  </span>
                  <b>{a.plaka}</b> ({[a.marka, a.model].filter(Boolean).join(' ')}) —{' '}
                  <span style={{ color: isGecti ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{a.info.metin}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section">{t('sekmeAracFilosu')}</h2>
        {seciliPlaka && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            <b style={{ color: 'var(--ink)' }}>{seciliPlaka}</b> filtreleniyor — seçimi kaldırmak için boş bir yere tıklayın.
          </div>
        )}
        <div className="grid cols-3" style={{ marginTop: 10 }}>
          {araclar.map((a) => {
            const secili = seciliPlaka === a.plaka;
            const info = muayeneDurumu(a);
            return (
              <div
                key={a.plaka}
                className="card"
                onClick={(e) => kartaTiklandi(e, a.plaka)}
                style={{
                  padding: 12, marginBottom: 0, cursor: 'pointer',
                  border: secili ? '2px solid var(--accent-patron)' : '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: '100%', height: 110, borderRadius: 8, background: 'rgba(127, 127, 127, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10,
                }}>
                  {a.resim_url
                    ? <img src={a.resim_url} alt={a.plaka} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32 }}>🚐</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{[a.marka, a.model].filter(Boolean).join(' ') || 'Marka/model girilmedi'}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{a.plaka}</div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={'status-tag' + (a.durum === 'Boşta' ? ' open' : '')}>{a.durum}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(a.son_km || 0).toLocaleString('tr-TR')} km</span>
                  {secili && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-patron)' }}>✓ Seçili</span>}
                </div>

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                  {info ? (
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: info.seviye === 'gecti' ? '#ef4444' : (info.seviye === 'yakin' ? '#f59e0b' : 'var(--ink-soft)'),
                    }}>
                      🔧 Muayene (Przegląd): {info.metin}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>🔧 {t('muayeneTarihiGirilmedi')}</div>
                  )}

                  {editInspectionPlaka === a.plaka ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <label style={{ margin: 0, fontSize: 11 }}>{t('sonMuayeneTarihi')}</label>
                      <input type="date" value={sonMuayeneVal} onChange={(e) => setSonMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <label style={{ margin: 0, fontSize: 11 }}>{t('sonrakiMuayeneTarihi')}</label>
                      <input type="date" value={sonrakiMuayeneVal} onChange={(e) => setSonrakiMuayeneVal(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => muayeneKaydet(a.plaka)}>{t('kaydet')}</button>
                        <button className="action btn-secondary" style={{ width: 'auto', padding: '6px 10px', fontSize: 11, margin: 0 }} onClick={() => setEditInspectionPlaka(null)}>{t('iptal')}</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="action btn-secondary"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: 11, marginTop: 6 }}
                      onClick={() => {
                        setEditInspectionPlaka(a.plaka);
                        setSonMuayeneVal(a.son_muayene_tarihi || '');
                        setSonrakiMuayeneVal(a.sonraki_muayene_tarihi || '');
                      }}
                    >
                      📝 {t('muayeneTarihiniGuncelle')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {araclar.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('henuzAracYok')}</div>}
        </div>
      </div>

      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="grid cols-2">
          <div className="stat-card"><div className="label">{t('toplamKatedilenKm')}</div><div className="value">{toplamKm.toLocaleString('tr-TR')} km</div></div>
          <div className="stat-card"><div className="label">{t('tahminiAracMaliyeti')}</div><div className="value">{formatPLN(toplamKm * KM_BIRIM_MALIYET)}</div></div>
        </div>
        <h2 className="section" style={{ marginTop: 18 }}>
          {seciliPlaka ? seciliPlaka + ' — kullanım geçmişi' : 'Araç kullanım geçmişi (tüm araçlar)'}
        </h2>
        <div className="grid cols-3" style={{ marginTop: 8 }}>
          <div>
            <label>{t('baslangicTarihi')}</label>
            <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} />
          </div>
          <div>
            <label>{t('bitisTarihi')}</label>
            <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} />
          </div>
          <div>
            <label>{t('personelFiltrele')}</label>
            <input placeholder={t('isimIleAra')} value={personelArama} onChange={(e) => setPersonelArama(e.target.value)} />
          </div>
        </div>
        <table>
          <thead><tr><th>Tarih</th><th>Personel</th><th>Plaka</th><th>Alış</th><th>Teslim</th><th>Kat edilen</th><th>Süre</th></tr></thead>
          <tbody>
            {gosterilenKayitlar.map((k) => (
              <tr key={k.id}>
                <td>{new Date(k.tarih).toLocaleDateString('tr-TR')}</td>
                <td>{k.ad}</td>
                <td><b>{k.plaka}</b></td>
                <td>{(k.alis_km || 0).toLocaleString('tr-TR')} km</td>
                <td>{k.teslim_km ? k.teslim_km.toLocaleString('tr-TR') + ' km' : <span className="status-tag">Kullanımda</span>}</td>
                <td><b>{k.katedilen_km ? k.katedilen_km.toLocaleString('tr-TR') + ' km' : '—'}</b></td>
                <td style={{ color: 'var(--ink-soft)' }}>{sureMetni(k.alis_saati || k.tarih, k.teslim_saati)}</td>
              </tr>
            ))}
            {gosterilenKayitlar.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 16 }}>Kullanım kaydı bulunamadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
