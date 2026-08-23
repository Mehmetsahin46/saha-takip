export function konumAl() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Cihazınızda veya tarayıcınızda konum servisi desteklenmiyor.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let errMetin = 'Konum bilgisi alınamadı.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errMetin = 'Konum izni reddedildi. Lütfen tarayıcı ayarlarından konum iznini açın.';
            break;
          case error.POSITION_UNAVAILABLE:
            errMetin = 'GPS veya konum sinyali alınamıyor.';
            break;
          case error.TIMEOUT:
            errMetin = 'Konum alma isteği zaman aşımına uğradı.';
            break;
        }
        reject(new Error(errMetin));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  });
}

// Haversine Formülü ile iki GPS koordinatı arasındaki mesafeyi metre cinsinden hesaplar
export function mesafeMetre(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;

  const R = 6371e3; // Dünya yarıçapı (metre)
  const phi1 = (Number(lat1) * Math.PI) / 180;
  const phi2 = (Number(lat2) * Math.PI) / 180;
  const deltaPhi = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const deltaLambda = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}
