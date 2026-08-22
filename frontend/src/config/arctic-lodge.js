export const config = {
  instans_id: 'arctic-lodge',
  namn: 'Arctic Lodge Katterjokk',
  omrade: 'Katterjokk, Riksgränsen, norra svenska Lappland',
  center: { lat: 68.356, lng: 18.823 },
  zoom: 12,
  sprak: ['sv', 'en', 'no'],

  // Arktisk säsong-logik — lång vinter, kort sommar
  sommar_manader: [6, 7, 8, 9],

  kontakt: {
    reception: 'info@arcticlodge.nu',
    telefon: '+46-XXX-XXX XX XX',
    bokning_url: 'https://arcticlodge.nu/boka',
  },

  // Tomt = samma origin som sidan. Sajten serveras av samma Worker som
  // API:t, så relativa vägar räcker och CORS blir aldrig inblandat.
  // Widgeten byggs med VITE_API_URL satt, eftersom den körs på
  // arcticlodge.nu och måste peka tillbaka hit.
  api_url: import.meta.env.VITE_API_URL ?? '',
  tiles_url: import.meta.env.VITE_TILES_URL ?? '',

  valkomsttext:
    'Hej! Jag är din lokalguide här i Riksgränsen. Fråga mig om ' +
    'vandringar, toppturer, mat, transport eller vad som helst i området.',
};

export function aktuellSasong(date = new Date()) {
  return config.sommar_manader.includes(date.getMonth() + 1) ? 'sommar' : 'vinter';
}

export default config;
