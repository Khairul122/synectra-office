const UNITS = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function words(n: number): string {
  if (n < 12) return UNITS[n]!;
  if (n < 20) return `${words(n - 10)} belas`;
  if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`;
  if (n < 200) return `seratus ${words(n - 100)}`;
  if (n < 1000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`;
  if (n < 2000) return `seribu ${words(n - 1000)}`;
  if (n < 1e6) return `${words(Math.floor(n / 1000))} ribu ${words(n % 1000)}`;
  if (n < 1e9) return `${words(Math.floor(n / 1e6))} juta ${words(n % 1e6)}`;
  if (n < 1e12) return `${words(Math.floor(n / 1e9))} miliar ${words(n % 1e9)}`;
  return `${words(Math.floor(n / 1e12))} triliun ${words(n % 1e12)}`;
}

/** Nominal rupiah bulat dalam kata, mis. 2500000 -> "dua juta lima ratus ribu rupiah". */
export function terbilang(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Nominal harus bilangan bulat non-negatif');
  if (amount === 0) return 'nol rupiah';
  return `${words(amount).replace(/\s+/g, ' ').trim()} rupiah`;
}
