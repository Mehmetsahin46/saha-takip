'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function QrOkuyucu({ onOkundu, onIptal }) {
  const qrRegionId = 'qr-reader-region';
  const html5QrCodeRef = useRef(null);
  const [hata, setHata] = useState('');
  const [manuelKod, setManuelKod] = useState('');
  const [kameraBaslatildi, setKameraBaslatildi] = useState(false);

  useEffect(() => {
    let html5QrCode;

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode(qrRegionId);
        html5QrCodeRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                onOkundu(decodedText);
              }).catch(() => {
                onOkundu(decodedText);
              });
            }
          },
          () => {
            // Tarama esnasında her karede çağrılır, hata basmaya gerek yok
          }
        );
        setKameraBaslatildi(true);
      } catch (err) {
        console.warn('Kamera açılamadı:', err);
        setHata('Kamera erişimi sağlanamadı. Lütfen kamera iznini kontrol edin veya QR kodunu elle yazın.');
      }
    };

    startScanner();

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch((e) => console.error('QR durdurma hatası', e));
      }
    };
  }, [onOkundu]);

  const durdurVeKapat = () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      html5QrCodeRef.current.stop().then(() => {
        onIptal();
      }).catch(() => {
        onIptal();
      });
    } else {
      onIptal();
    }
  };

  const manuelGonder = (e) => {
    e.preventDefault();
    if (manuelKod.trim()) {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
      onOkundu(manuelKod.trim());
    }
  };

  return (
    <div style={{
      background: 'var(--card)',
      border: '2px dashed var(--border)',
      borderRadius: 12,
      padding: 16,
      marginTop: 10,
      textAlign: 'center'
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>📷 Şantiye QR Kodunu Okutun</div>
      <div
        id={qrRegionId}
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          borderRadius: 8,
          overflow: 'hidden',
          minHeight: 220,
          background: '#000'
        }}
      />

      {hata && (
        <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>
          {hata}
        </div>
      )}

      <form onSubmit={manuelGonder} style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'center' }}>
        <input
          type="text"
          placeholder="QR Kodu veya Kodu Girin"
          value={manuelKod}
          onChange={(e) => setManuelKod(e.target.value)}
          style={{ fontSize: 12, padding: '6px 10px', flex: 1, maxWidth: 220 }}
        />
        <button type="submit" className="action btn-secondary" style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 12 }}>
          Onayla
        </button>
      </form>

      <button
        type="button"
        onClick={durdurVeKapat}
        className="action btn-secondary"
        style={{ marginTop: 10, width: 'auto', padding: '6px 14px', fontSize: 12 }}
      >
        ✕ Taramayı İptal Et
      </button>
    </div>
  );
}
