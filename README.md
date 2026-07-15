# EduAI Generator

Aplikasi generator soal evaluasi untuk guru, berbasis AI (Google Gemini). Setiap pengguna memasukkan API key Gemini gratis miliknya sendiri (BYOK) lewat halaman Pengaturan di aplikasi — tidak ada API key yang ditanam di kode.

## Menjalankan di lokal

Butuh [Node.js](https://nodejs.org/) versi 18 ke atas.

```bash
npm install
npm run dev
```

Buka `http://localhost:5173` di browser.

## Struktur Project

```
├── index.html          # entry HTML
├── src/
│   ├── main.jsx         # entry point React
│   ├── App.jsx           # seluruh logika & tampilan aplikasi
│   └── index.css        # Tailwind + custom scrollbar
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── package.json
```

## Upload ke GitHub

```bash
git init
git add .
git commit -m "Initial commit - EduAI Generator"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Ganti `USERNAME/NAMA-REPO` sesuai repo GitHub kamu.

## Deploy ke Vercel

**Cara paling gampang (lewat dashboard, tanpa CLI):**

1. Push project ini ke GitHub dulu (lihat langkah di atas).
2. Buka [vercel.com](https://vercel.com) → login pakai akun GitHub.
3. Klik **Add New → Project**, pilih repo GitHub yang tadi di-push.
4. Vercel otomatis mendeteksi ini project **Vite** — biarkan setting default:
   - Build Command: `npm run build` atau `vite build`
   - Output Directory: `dist`
5. Klik **Deploy**. Selesai dalam ~1 menit, dan setiap kali kamu push ke GitHub, Vercel otomatis re-deploy.

**Kalau mau lewat CLI:**

```bash
npm install -g vercel
vercel
```

Ikuti instruksi di terminal.

## Catatan Penting

- **API Key Gemini**: aplikasi ini pakai model BYOK (Bring Your Own Key) — setiap pengguna/pembeli memasukkan API key Gemini gratis mereka sendiri di halaman Pengaturan aplikasi (bukan di file `.env` atau kode). Ini supaya kuota gratis tidak dibagi rame-rame antar pembeli, dan key tidak perlu ditanam di source code yang bisa dicuri siapa saja.
- **Data pengguna** (riwayat, bank soal, template, pengaturan) tersimpan di `localStorage` browser masing-masing pengguna — belum ada database terpusat. Kalau ke depan mau ada akun pengguna & sinkronisasi antar device, itu butuh backend + database (bisa pakai Vercel Postgres, Supabase, atau Firebase).
- **Fitur "Bagikan ke Siswa"** meng-encode data soal langsung ke dalam link (tanpa server), jadi cocok untuk skala kelas biasa. Untuk skala besar (banyak soal + rekap nilai otomatis lintas siswa), fitur ini perlu diganti pakai backend beneran.
