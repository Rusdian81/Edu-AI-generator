import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Brain, Settings, History, Star, LayoutTemplate, 
  FileDown, Save, Copy, Shuffle, Cpu, Sparkles, ChevronRight,
  Search, Filter, Trash2, Download, Play, CheckCircle2, AlertCircle, X,
  Menu, Share2, QrCode, ArrowLeft
} from 'lucide-react';
import { jsPDF } from 'jspdf';

// --- KONFIGURASI API ---
// PENTING: Aplikasi ini pakai model "Bring Your Own Key" (BYOK).
// Setiap pengguna memasukkan API key Gemini GRATIS miliknya sendiri di halaman Pengaturan
// (didapat gratis di https://aistudio.google.com/apikey). Ini supaya:
// 1) Kuota gratis tidak dibagi rame-rame oleh semua pembeli (kuota gratis itu per-key, bukan per-orang)
// 2) Key tidak perlu ditanam di kode yang bisa dicuri siapa saja
//
// Daftar model dicoba berurutan (fallback) supaya kalau satu model preview di-deprecate
// oleh Google, aplikasi otomatis coba model berikutnya alih-alih error total.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

const buildApiUrl = (modelName, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

// --- HELPER ENCODE/DECODE DATA SOAL UNTUK FITUR "BAGIKAN KE SISWA" ---
// Data soal di-encode langsung ke dalam URL (tanpa backend/server) supaya siswa
// tinggal buka link dan mengerjakan soal di HP/laptop mereka.
const encodeQuizData = (data) => {
  try {
    const trimmed = {
      judul: data.judul,
      mataPelajaran: data.mataPelajaran,
      jenjangPendidikan: data.jenjangPendidikan,
      materi: data.materi,
      daftarSoal: data.daftarSoal.map(s => ({
        tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi || null,
        jawaban: s.jawaban, pembahasan: s.pembahasan
      }))
    };
    const json = JSON.stringify(trimmed);
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) {
    console.error("Gagal encode data soal:", e);
    return null;
  }
};

const decodeQuizData = (encoded) => {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.daftarSoal)) return null;
    return parsed;
  } catch (e) {
    console.error("Gagal decode data soal:", e);
    return null;
  }
};

// --- CUSTOM HOOKS ---
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };
  return [storedValue, setValue];
}

// --- KOMPONEN UI DASAR ---
const GlassCard = ({ children, className = "" }) => (
  <div className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ${className}`}>
    {children}
  </div>
);

const NeonButton = ({ children, onClick, variant = 'primary', className = "", disabled = false, icon: Icon }) => {
  const baseStyle = "relative overflow-hidden px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:scale-[1.02]",
    secondary: "bg-white/10 text-cyan-50 border border-cyan-500/30 hover:bg-white/20 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]",
    danger: "bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/40 hover:shadow-[0_0_15px_rgba(244,63,94,0.4)]",
    ghost: "text-slate-300 hover:text-cyan-400 hover:bg-white/5"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300 ease-out" />
      <span className="relative z-10 flex items-center gap-2">
        {Icon && <Icon size={18} />}
        {children}
      </span>
    </button>
  );
};

const InputField = ({ label, type = "text", value, onChange, placeholder, options, multiline = false }) => {
  const baseClasses = "w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all duration-300";
  
  return (
    <div className="mb-4 w-full">
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      {options ? (
        <div className="relative">
          <select value={value} onChange={onChange} className={`${baseClasses} appearance-none cursor-pointer`}>
            <option value="" disabled>Pilih {label}</option>
            {options.map(opt => <option key={opt} value={opt} className="bg-slate-900">{opt}</option>)}
          </select>
          <ChevronRight className="absolute right-4 top-3.5 text-slate-400 pointer-events-none rotate-90" size={18} />
        </div>
      ) : multiline ? (
        <textarea value={value} onChange={onChange} placeholder={placeholder} className={`${baseClasses} min-h-[100px] resize-y`} />
      ) : (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={baseClasses} />
      )}
    </div>
  );
};

// --- KOMPONEN TOAST NOTIFICATION (pengganti alert() bawaan browser) ---
const ToastContainer = ({ toasts, onDismiss }) => (
  <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 w-[90%] max-w-sm">
    {toasts.map(toast => {
      const styleMap = {
        success: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
        error: { icon: AlertCircle, color: 'text-rose-400', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
        info: { icon: Sparkles, color: 'text-cyan-400', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
      };
      const s = styleMap[toast.type] || styleMap.info;
      const Icon = s.icon;
      return (
        <div key={toast.id} className={`animate-fade-in-up flex items-start gap-3 p-4 rounded-xl backdrop-blur-xl border ${s.border} ${s.bg} bg-slate-900/90 shadow-lg`}>
          <Icon size={20} className={`${s.color} shrink-0 mt-0.5`} />
          <p className="text-sm text-slate-200 flex-1">{toast.message}</p>
          <button onClick={() => onDismiss(toast.id)} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>
      );
    })}
  </div>
);

// --- KOMPONEN LOADING FUTURISTIK ---
const LoadingScreen = ({ statusTexts }) => {
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % statusTexts.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [statusTexts]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center space-y-8 p-12 rounded-3xl bg-slate-900/50 border border-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.1)] relative overflow-hidden">
        
        {/* Partikel Latar */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
           <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
           <div className="absolute top-3/4 right-1/4 w-3 h-3 bg-purple-500 rounded-full animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }} />
           <div className="absolute bottom-1/4 left-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        </div>

        {/* Ikon 3D Animasi */}
        <div className="relative flex items-center justify-center w-32 h-32">
          {/* Lingkaran Luar */}
          <div className="absolute inset-0 border-t-2 border-r-2 border-cyan-400 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
          {/* Lingkaran Dalam */}
          <div className="absolute inset-2 border-b-2 border-l-2 border-purple-500 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          {/* Efek Glow Inti */}
          <div className="absolute inset-4 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
          {/* Ikon Brain */}
          <Brain size={48} className="text-cyan-300 relative z-10 animate-pulse drop-shadow-[0_0_15px_rgba(103,232,249,0.8)]" />
        </div>

        {/* Teks Animasi */}
        <div className="h-8 flex items-center justify-center">
          <p className="text-cyan-200 text-lg font-medium tracking-wide animate-fade-in-up transition-all duration-500" key={textIndex}>
            {statusTexts[textIndex]}
          </p>
        </div>

        {/* Progress Bar Futuristik */}
        <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 w-[200%] animate-progress-glow" />
        </div>
      </div>
    </div>
  );
};


// --- KOMPONEN MODE SISWA (mengerjakan soal via link, tanpa perlu install apapun) ---
const StudentQuizView = ({ encoded }) => {
  const [quizData] = useState(() => decodeQuizData(encoded));
  const [jawabanSiswa, setJawabanSiswa] = useState({});
  const [namaSiswa, setNamaSiswa] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!quizData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-center p-6">
        <div className="max-w-sm">
          <AlertCircle size={40} className="text-rose-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Link Tidak Valid</h1>
          <p className="text-slate-400 text-sm">Link soal ini rusak atau tidak lengkap. Minta link baru ke gurumu.</p>
        </div>
      </div>
    );
  }

  const pgQuestions = quizData.daftarSoal.filter(s => s.opsi && s.opsi.length > 0);
  const totalPG = pgQuestions.length;
  const benarPG = quizData.daftarSoal.reduce((acc, soal, idx) => {
    if (soal.opsi && soal.opsi.length > 0 && jawabanSiswa[idx] === soal.jawaban) return acc + 1;
    return acc;
  }, 0);
  const skor = totalPG > 0 ? Math.round((benarPG / totalPG) * 100) : null;

  const handlePilih = (idx, opt) => setJawabanSiswa(prev => ({ ...prev, [idx]: opt }));
  const handleIsian = (idx, val) => setJawabanSiswa(prev => ({ ...prev, [idx]: val }));

  const allPGAnswered = pgQuestions.length === 0 || quizData.daftarSoal.every((s, idx) => !(s.opsi && s.opsi.length > 0) || jawabanSiswa[idx]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a0f1c] to-slate-950 text-slate-200 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-cyan-400 text-sm font-medium"><Sparkles size={16}/> Mode Kerjakan Soal</div>
          <h1 className="text-2xl font-bold text-white">{quizData.judul}</h1>
          <p className="text-slate-400 text-sm">{quizData.mataPelajaran} • {quizData.jenjangPendidikan} • {quizData.materi}</p>
        </div>

        {!submitted && (
          <GlassCard className="p-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">Nama Kamu</label>
            <input
              value={namaSiswa}
              onChange={e => setNamaSiswa(e.target.value)}
              placeholder="Tulis nama lengkap"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </GlassCard>
        )}

        {submitted && skor !== null && (
          <GlassCard className="p-6 text-center border-cyan-500/40">
            <p className="text-slate-400 text-sm mb-1">Skor Pilihan Ganda</p>
            <p className="text-5xl font-bold text-cyan-400">{skor}</p>
            <p className="text-slate-500 text-sm mt-1">{benarPG} dari {totalPG} soal benar</p>
          </GlassCard>
        )}

        <div className="space-y-5">
          {quizData.daftarSoal.map((soal, idx) => {
            const isPG = soal.opsi && soal.opsi.length > 0;
            const isBenar = submitted && isPG && jawabanSiswa[idx] === soal.jawaban;
            const isSalah = submitted && isPG && jawabanSiswa[idx] && jawabanSiswa[idx] !== soal.jawaban;
            return (
              <GlassCard key={idx} className={`p-5 ${isBenar ? 'border-emerald-500/50' : isSalah ? 'border-rose-500/50' : ''}`}>
                <p className="text-slate-200 mb-4"><span className="font-bold text-cyan-400">{idx + 1}.</span> {soal.pertanyaan}</p>
                {isPG ? (
                  <div className="space-y-2">
                    {soal.opsi.map((opt, oIdx) => {
                      const label = String.fromCharCode(65 + oIdx);
                      const dipilih = jawabanSiswa[idx] === opt;
                      return (
                        <button
                          key={oIdx}
                          disabled={submitted}
                          onClick={() => handlePilih(idx, opt)}
                          className={`w-full text-left flex gap-3 p-3 rounded-lg border transition-colors ${
                            dipilih ? 'bg-cyan-500/15 border-cyan-500' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/70'
                          } ${submitted && opt === soal.jawaban ? 'border-emerald-500 bg-emerald-500/10' : ''}`}
                        >
                          <span className="font-medium text-slate-400">{label}.</span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    disabled={submitted}
                    value={jawabanSiswa[idx] || ''}
                    onChange={e => handleIsian(idx, e.target.value)}
                    placeholder="Tulis jawabanmu di sini..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 min-h-[80px] focus:outline-none focus:border-cyan-500"
                  />
                )}
                {submitted && isPG && (
                  <p className="text-xs text-slate-400 mt-3 bg-slate-900/50 p-2 rounded border border-slate-800">
                    <span className="text-purple-400 font-medium">Pembahasan:</span> {soal.pembahasan}
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>

        {!submitted ? (
          <NeonButton
            variant="primary"
            className="w-full"
            disabled={!namaSiswa.trim() || !allPGAnswered}
            onClick={() => setSubmitted(true)}
          >
            Kumpulkan Jawaban
          </NeonButton>
        ) : (
          <p className="text-center text-sm text-slate-500">
            Jawaban {namaSiswa} sudah dikumpulkan. Soal essay/isian dinilai manual oleh gurumu.
          </p>
        )}
      </div>
    </div>
  );
};

// --- APLIKASI UTAMA ---
export default function App() {
  // Deteksi mode siswa: kalau URL punya #siswa=..., tampilkan halaman kerjakan soal saja
  const [studentModeData] = useState(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    if (hash.startsWith('#siswa=')) return hash.replace('#siswa=', '');
    return null;
  });

  if (studentModeData) {
    return <StudentQuizView encoded={studentModeData} />;
  }

  const [activePage, setActivePage] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Data States
  const [riwayat, setRiwayat] = useLocalStorage('eduai_riwayat', []);
  const [bankSoal, setBankSoal] = useLocalStorage('eduai_bank', []);
  const [favorit, setFavorit] = useLocalStorage('eduai_favorit', []);
  const [templates, setTemplates] = useLocalStorage('eduai_templates', []);
  const [pengaturan, setPengaturan] = useLocalStorage('eduai_pengaturan', {
    apiKey: '',
    bahasa: 'Bahasa Indonesia',
    tema: 'Futuristic Dark',
    ukuranKertas: 'A4',
    margin: 'Standar',
    namaSekolah: '',
    alamatSekolah: '',
    logoSekolah: '', // base64 image
    namaGuru: '',
    nipGuru: '',
    namaKepsek: '',
    nipKepsek: ''
  });

  const [loadingState, setLoadingState] = useState({ isLoading: false, texts: [] });
  const [currentResult, setCurrentResult] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [shareModal, setShareModal] = useState({ open: false, link: '' });

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Form State
  const [formData, setFormData] = useState({
    jenjang: '',
    mapel: '',
    materi: '',
    jenisEvaluasi: '',
    kesulitan: '',
    jumlahSoal: '10',
    tipeSoal: '',
    instruksi: ''
  });

  const jenjangOptions = ['SD', 'SMP', 'SMA', 'SMK'];
  const jenisEvaluasiOptions = ['Tugas Harian', 'Latihan', 'Kuis', 'Ulangan Harian', 'UTS', 'Evaluasi Akhir Materi'];
  const kesulitanOptions = ['Mudah', 'Sedang', 'Sulit', 'Campuran'];
  const jumlahSoalOptions = ['5', '10', '15', '20', '25', '30', '40', '50'];
  const tipeSoalOptions = ['Pilihan Ganda', 'Benar Salah', 'Menjodohkan', 'Isian Singkat', 'Essay', 'Campuran'];
  
  // Opsi Mata Pelajaran per Jenjang
  const mapelSD = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'PKn', 'Seni Budaya'];
  const mapelSMP = ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA Terpadu', 'IPS Terpadu', 'Pendidikan Pancasila', 'PJOK'];
  const mapelSMA = ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'Fisika', 'Kimia', 'Biologi', 'Sejarah', 'Geografi', 'Ekonomi', 'Sosiologi'];
  const mapelSMK = [
    'Teknik Komputer dan Jaringan (TKJ)', 
    'Rekayasa Perangkat Lunak (RPL)', 
    'Desain Komunikasi Visual (DKV)', 
    'Akuntansi dan Keuangan Lembaga', 
    'Teknik Kendaraan Ringan (Otomotif)', 
    'Pariwisata & Perhotelan', 
    'Bisnis Digital / Pemasaran',
    'Matematika Terapan',
    'Bahasa Inggris Terapan'
  ];

  const getMapelOptions = () => {
    switch (formData.jenjang) {
      case 'SD': return mapelSD;
      case 'SMP': return mapelSMP;
      case 'SMA': return mapelSMA;
      case 'SMK': return mapelSMK;
      default: return [];
    }
  };

  // --- LOGIKA WORKFLOW ---
  const handleGenerate = async () => {
    if (!formData.jenjang || !formData.mapel || !formData.materi || !formData.jenisEvaluasi || !formData.tipeSoal) {
      showToast("Mohon lengkapi semua form wajib (Jenjang, Mapel, Materi, Jenis, Tipe Soal).", "error");
      return;
    }

    if (!pengaturan.apiKey || pengaturan.apiKey.trim() === '') {
      showToast("Kamu belum memasukkan API Key Gemini. Buka halaman Pengaturan dulu ya.", "error");
      setActivePage('pengaturan');
      return;
    }

    setLoadingState({
      isLoading: true,
      texts: [
        "Menganalisis mata pelajaran dan materi...",
        "Menyesuaikan tingkat kelas dan kurikulum...",
        "Merancang struktur evaluasi...",
        "AI sedang menyusun variasi pertanyaan...",
        "Membuat opsi jawaban pengecoh yang relevan...",
        "Menyusun kunci jawaban dan pembahasan detail...",
        "Hampir selesai, memformat hasil evaluasi..."
      ]
    });

    const prompt = `Anda adalah seorang Asisten AI Guru Ahli Pembuat Soal Pendidikan Indonesia.
    Tugas: Buat paket soal evaluasi.
    
    Detail:
    - Jenjang: ${formData.jenjang}
    - Mata Pelajaran / Kejuruan: ${formData.mapel}
    - Materi Pembelajaran: ${formData.materi}
    - Jenis Evaluasi: ${formData.jenisEvaluasi}
    - Tingkat Kesulitan: ${formData.kesulitan}
    - Jumlah Soal: ${formData.jumlahSoal}
    - Tipe Soal: ${formData.tipeSoal}
    - Instruksi Khusus: ${formData.instruksi || "Tidak ada"}
    
    Kriteria Pembuatan:
    - Jika jenjang SMK, pastikan soal-soal SANGAT RELEVAN dengan keahlian kejuruan (vocational skills), praktik industri, atau studi kasus dunia kerja yang berkaitan dengan jurusan yang dipilih.
    - Soal TIDAK MONOTON, gunakan variasi studi kasus atau cerita jika memungkinkan.
    - Sesuai dengan kurikulum umum Indonesia untuk jenjang tersebut.
    - Bahasa mudah dipahami siswa namun tetap baku.
    - Untuk pilihan ganda, buat 4 opsi (A, B, C, D) untuk SD/SMP, dan 5 opsi (A, B, C, D, E) untuk SMA/SMK.
    - SELAIN daftar soal, buat juga KISI-KISI SOAL untuk setiap nomor: Kompetensi Dasar/Capaian Pembelajaran terkait, Indikator Soal, dan Level Kognitif (gunakan salah satu dari: C1-Mengingat, C2-Memahami, C3-Mengaplikasikan, C4-Menganalisis, C5-Mengevaluasi, C6-Mencipta). Usahakan levelnya bervariasi, tidak semua C1/C2.
    
    Output HARUS DALAM FORMAT JSON murni tanpa markdown \`\`\`json.
    Struktur JSON:
    {
      "judul": "Judul Evaluasi (misal: Ulangan Harian Jaringan Dasar)",
      "mataPelajaran": "${formData.mapel}",
      "jenjangPendidikan": "${formData.jenjang}",
      "materi": "${formData.materi}",
      "daftarSoal": [
        {
          "tipe": "Pilihan Ganda / Essay / dll",
          "pertanyaan": "Teks pertanyaan",
          "opsi": ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"], // Hanya jika tipe Pilihan Ganda
          "jawaban": "Jawaban yang benar",
          "pembahasan": "Penjelasan detail mengapa jawaban tersebut benar"
        }
      ],
      "kisiKisi": [
        {
          "nomor": 1,
          "kompetensi": "Kompetensi Dasar / Capaian Pembelajaran singkat",
          "indikator": "Indikator soal singkat",
          "levelKognitif": "C1-Mengingat / C2-Memahami / dst"
        }
      ]
    }`;

    // Helper: memanggil satu model tertentu
    const callModel = async (modelName) => {
      const response = await fetch(buildApiUrl(modelName, pengaturan.apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const status = response.status;
        const err = new Error(errBody?.error?.message || `HTTP ${status}`);
        err.status = status;
        throw err;
      }
      return response.json();
    };

    // Helper: parse & validasi struktur JSON hasil AI, biar tidak crash kalau formatnya berantakan
    const parseAndValidate = (textResponse) => {
      let cleanJson = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson); // bisa throw kalau JSON rusak
      if (!parsed || !Array.isArray(parsed.daftarSoal) || parsed.daftarSoal.length === 0) {
        throw new Error("Struktur soal dari AI tidak lengkap");
      }
      return parsed;
    };

    let lastError = null;
    let success = false;

    // Coba tiap model di MODEL_CANDIDATES; kalau satu model tidak tersedia/deprecated, lanjut ke berikutnya
    for (const modelName of MODEL_CANDIDATES) {
      // Untuk tiap model, kasih 1x kesempatan retry kalau JSON-nya rusak (bukan error API)
      for (let attempt = 0; attempt < 2 && !success; attempt++) {
        try {
          const data = await callModel(modelName);
          const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textResponse) throw new Error("Respons AI kosong");

          const parsedResult = parseAndValidate(textResponse);

          const resultObject = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            instruksiTambahan: formData.instruksi,
            ...parsedResult
          };

          setCurrentResult(resultObject);
          setRiwayat([resultObject, ...riwayat]);
          setActivePage('preview');
          showToast("Soal berhasil dibuat!", "success");
          success = true;
        } catch (error) {
          lastError = error;
          console.error(`Gagal generate (model: ${modelName}, percobaan: ${attempt + 1}):`, error);

          // Kalau errornya soal API key salah/invalid, tidak usah retry, langsung stop
          if (error.status === 400 || error.status === 403) {
            showToast("API Key tidak valid atau tidak punya akses. Cek kembali di Pengaturan.", "error");
            setLoadingState({ isLoading: false, texts: [] });
            return;
          }
          // Kalau model tidak ditemukan (404), langsung lanjut ke model berikutnya (skip retry attempt ke-2)
          if (error.status === 404) break;
          // Kalau kena rate limit, kasih tau user secara spesifik
          if (error.status === 429) {
            showToast("Kuota API kamu sedang penuh (rate limit). Tunggu sebentar lalu coba lagi.", "error");
            setLoadingState({ isLoading: false, texts: [] });
            return;
          }
          // Selain itu (JSON rusak, dll), lanjut ke attempt berikutnya / model berikutnya
        }
      }
      if (success) break;
    }

    if (!success) {
      showToast("Gagal membuat soal setelah beberapa percobaan. Coba lagi beberapa saat lagi.", "error");
      console.error("Semua percobaan gagal. Error terakhir:", lastError);
    }

    setLoadingState({ isLoading: false, texts: [] });
  };

  // --- FUNGSI DOWNLOAD PURE VECTOR PDF (Anti-Gagal, Anti-Putih) ---
  const downloadPDF = () => {
    if (!currentResult) return;
    setIsDownloading(true);

    const processDownload = () => {
      try {
        // jsPDF sekarang diimpor langsung sebagai npm package (lihat import di atas),
        // jadi tidak perlu lagi memuat lewat CDN <script> saat runtime.

        // Pakai ukuran kertas & margin dari Pengaturan (sebelumnya hardcoded, sekarang beneran fungsional)
        const kertasMap = { 'A4': 'a4', 'Letter': 'letter', 'Legal': 'legal' };
        const marginMap = { 'Sempit': 12, 'Standar': 20, 'Lebar': 28 };
        const kertasFormat = kertasMap[pengaturan.ukuranKertas] || 'a4';
        const margin = marginMap[pengaturan.margin] ?? 20;

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: kertasFormat
        });

        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.getHeight();
        const pageWidth = pageSize.getWidth();
        const contentWidth = pageWidth - (margin * 2); // 170mm
        let y = 25;

        // Helper fungsi penanganan page break otomatis
        const checkPageBreak = (neededHeight) => {
          if (y + neededHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
        };

        // --- HELPER: KOP SURAT SEKOLAH (dipakai di beberapa halaman) ---
        const detectImageFormat = (dataUrl) => {
          if (!dataUrl) return 'PNG';
          const match = dataUrl.match(/^data:image\/(\w+);/);
          if (!match) return 'PNG';
          const ext = match[1].toUpperCase();
          return ext === 'JPG' ? 'JPEG' : ext;
        };

        const drawKopSurat = () => {
          const hasSekolah = pengaturan.namaSekolah || pengaturan.logoSekolah;
          if (!hasSekolah) return;

          const logoSize = 18;
          const startY = y;

          if (pengaturan.logoSekolah) {
            try {
              doc.addImage(pengaturan.logoSekolah, detectImageFormat(pengaturan.logoSekolah), margin, y, logoSize, logoSize);
            } catch (imgErr) {
              console.error("Gagal render logo di PDF:", imgErr);
            }
          }

          const textX = pengaturan.logoSekolah ? margin + logoSize + 6 : margin;
          let ty = startY + 5;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.text(pengaturan.namaSekolah || '', textX, ty);
          ty += 6;
          if (pengaturan.alamatSekolah) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(pengaturan.alamatSekolah, textX, ty);
            ty += 5;
          }

          y = Math.max(startY + logoSize, ty) + 4;
          doc.setLineWidth(0.7);
          doc.setDrawColor(0, 0, 0);
          doc.line(margin, y, pageWidth - margin, y);
          y += 10;
        };

        // --- HALAMAN DEPAN (COVER) ---
        drawKopSurat();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        const titleLines = doc.splitTextToSize(currentResult.judul.toUpperCase(), contentWidth);
        titleLines.forEach(line => {
          doc.text(line, pageWidth / 2, y, { align: 'center' });
          y += 9;
        });

        y += 10;
        doc.setLineWidth(1);
        doc.setDrawColor(0, 0, 0);
        doc.line(margin, y, pageWidth - margin, y);
        y += 18;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(13);

        const metadata = [
          { label: 'Mata Pelajaran', value: currentResult.mataPelajaran },
          { label: 'Jenjang Pendidikan', value: currentResult.jenjangPendidikan },
          { label: 'Materi Pembelajaran', value: currentResult.materi },
          { label: 'Jumlah Soal', value: `${currentResult.daftarSoal.length} Butir Soal` }
        ];

        metadata.forEach(item => {
          doc.setFont('helvetica', 'bold');
          doc.text(`${item.label}:`, margin, y);
          doc.setFont('helvetica', 'normal');
          doc.text(item.value, margin + 55, y);
          y += 9;
        });

        y += 40;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.text('Dokumen Evaluasi Pembelajaran Resmi', pageWidth / 2, y, { align: 'center' });
        y += 5;
        doc.text('Diproses & Dihasilkan secara otomatis oleh EduAI Generator', pageWidth / 2, y, { align: 'center' });

        // --- HALAMAN DAFTAR SOAL ---
        doc.addPage();
        y = margin;
        drawKopSurat();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('DAFTAR SOAL EVALUASI', pageWidth / 2, y, { align: 'center' });
        y += 12;

        // Kolom identitas siswa (wajib ada di lembar soal resmi)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const halfWidth = contentWidth / 2;
        doc.text('Nama Siswa : ____________________________', margin, y);
        doc.text('Kelas / No. Absen : ______________________', margin + halfWidth, y);
        y += 8;
        doc.text('Tanggal : _______________________________', margin, y);
        doc.text('Nilai : __________________________________', margin + halfWidth, y);
        y += 6;
        doc.setLineWidth(0.4);
        doc.setDrawColor(150, 150, 150);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        currentResult.daftarSoal.forEach((soal, index) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);

          const numPrefix = `${index + 1}. `;
          const questionLines = doc.splitTextToSize(soal.pertanyaan, contentWidth - 10);
          
          // Estimasi ruang yang dibutuhkan
          const optionsCount = soal.opsi ? soal.opsi.length : 0;
          const estimatedHeight = (questionLines.length * 6) + (optionsCount * 6) + 12;
          checkPageBreak(estimatedHeight);

          // Gambar nomor soal & pertanyaan
          doc.text(numPrefix, margin, y);
          doc.setFont('helvetica', 'normal');
          questionLines.forEach((line, lIdx) => {
            doc.text(line, margin + 7, y + (lIdx * 5.5));
          });

          y += questionLines.length * 5.5;

          // Gambar opsi jika ada
          if (soal.opsi && soal.opsi.length > 0) {
            soal.opsi.forEach((opt, oIdx) => {
              const label = `${String.fromCharCode(65 + oIdx)}. `;
              const optLines = doc.splitTextToSize(opt, contentWidth - 15);
              
              checkPageBreak(optLines.length * 5.5);
              doc.setFont('helvetica', 'bold');
              doc.text(label, margin + 10, y);
              doc.setFont('helvetica', 'normal');

              optLines.forEach((line, olIdx) => {
                doc.text(line, margin + 16, y + (olIdx * 5.5));
              });

              y += optLines.length * 5.5;
            });
          } else if (soal.tipe === "Isian Singkat" || soal.tipe === "Essay") {
            y += 4;
            checkPageBreak(12);
            doc.setLineWidth(0.2);
            doc.setDrawColor(180, 180, 180);
            doc.line(margin + 7, y, pageWidth - margin, y);
            y += 6;
          }

          y += 6; // Spasi antar nomor soal
        });

        // --- KOLOM TANDA TANGAN (jika identitas guru/kepsek diisi) ---
        if (pengaturan.namaGuru || pengaturan.namaKepsek) {
          const ttdHeight = 38;
          checkPageBreak(ttdHeight);
          y += 8;
          const colWidth = contentWidth / 2;
          const leftX = margin;
          const rightX = margin + colWidth;
          const tanggalTtd = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.text('Mengetahui,', leftX, y);
          doc.text(tanggalTtd, rightX, y);
          y += 6;
          doc.text('Kepala Sekolah', leftX, y);
          doc.text('Guru Mata Pelajaran', rightX, y);
          y += 22; // ruang buat tanda tangan basah
          doc.setFont('helvetica', 'bold');
          doc.text(pengaturan.namaKepsek || '(...........................)', leftX, y);
          doc.text(pengaturan.namaGuru || '(...........................)', rightX, y);
          y += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          if (pengaturan.nipKepsek) doc.text(`NIP. ${pengaturan.nipKepsek}`, leftX, y);
          if (pengaturan.nipGuru) doc.text(`NIP. ${pengaturan.nipGuru}`, rightX, y);
        }

        // --- HALAMAN KUNCI JAWABAN & PEMBAHASAN ---
        doc.addPage();
        y = margin;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('KUNCI JAWABAN & PEMBAHASAN', pageWidth / 2, y, { align: 'center' });
        y += 12;

        currentResult.daftarSoal.forEach((soal, index) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);

          const ansTitle = `Soal ${index + 1}:`;
          const ansVal = `Kunci Jawaban: ${soal.jawaban}`;
          const pembLines = doc.splitTextToSize(`Pembahasan: ${soal.pembahasan}`, contentWidth - 10);
          
          const estimatedAnsHeight = 6 + 6 + (pembLines.length * 5.5) + 10;
          checkPageBreak(estimatedAnsHeight);

          doc.text(ansTitle, margin, y);
          y += 5.5;

          doc.setFont('helvetica', 'normal');
          doc.text(ansVal, margin + 5, y);
          y += 5.5;

          pembLines.forEach((line, pIdx) => {
            doc.text(line, margin + 5, y + (pIdx * 5));
          });

          y += (pembLines.length * 5) + 6;
        });

        // Catatan Guru tambahan jika ada
        if (currentResult.instruksiTambahan) {
          const notesLines = doc.splitTextToSize(currentResult.instruksiTambahan, contentWidth - 10);
          const blockHeight = (notesLines.length * 5) + 14;
          checkPageBreak(blockHeight + 10);
          
          y += 4;
          doc.setLineWidth(0.4);
          doc.rect(margin, y, contentWidth, blockHeight);
          doc.setFont('helvetica', 'bold');
          doc.text('Catatan Tambahan Guru:', margin + 5, y + 6);
          doc.setFont('helvetica', 'italic');
          notesLines.forEach((line, nIdx) => {
             doc.text(line, margin + 5, y + 11 + (nIdx * 5));
          });
        }

        // --- HALAMAN KISI-KISI SOAL ---
        if (currentResult.kisiKisi && currentResult.kisiKisi.length > 0) {
          doc.addPage();
          y = margin;
          drawKopSurat();

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.text('KISI-KISI SOAL', pageWidth / 2, y, { align: 'center' });
          y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(`${currentResult.mataPelajaran} - ${currentResult.materi}`, pageWidth / 2, y, { align: 'center' });
          y += 10;

          // Header tabel
          const colX = { no: margin, kompetensi: margin + 14, indikator: margin + 14 + contentWidth * 0.32, level: margin + 14 + contentWidth * 0.32 + contentWidth * 0.38 };
          const colW = { kompetensi: contentWidth * 0.32, indikator: contentWidth * 0.38, level: contentWidth * 0.16 };

          const drawTableHeader = () => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setFillColor(230, 230, 230);
            doc.rect(margin, y, contentWidth, 8, 'F');
            doc.text('No', colX.no + 2, y + 5.5);
            doc.text('Kompetensi Dasar / CP', colX.kompetensi, y + 5.5);
            doc.text('Indikator Soal', colX.indikator, y + 5.5);
            doc.text('Level', colX.level, y + 5.5);
            y += 8;
          };

          drawTableHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);

          currentResult.kisiKisi.forEach((k, idx) => {
            const kompLines = doc.splitTextToSize(k.kompetensi || '-', colW.kompetensi - 3);
            const indLines = doc.splitTextToSize(k.indikator || '-', colW.indikator - 3);
            const rowLines = Math.max(kompLines.length, indLines.length, 1);
            const rowHeight = rowLines * 4.5 + 3;

            if (y + rowHeight > pageHeight - margin) {
              doc.addPage();
              y = margin;
              drawTableHeader();
            }

            doc.text(String(k.nomor ?? idx + 1), colX.no + 2, y + 4.5);
            kompLines.forEach((line, i) => doc.text(line, colX.kompetensi, y + 4.5 + i * 4.5));
            indLines.forEach((line, i) => doc.text(line, colX.indikator, y + 4.5 + i * 4.5));
            doc.text(k.levelKognitif || '-', colX.level, y + 4.5);

            y += rowHeight;
            doc.setDrawColor(220, 220, 220);
            doc.line(margin, y, pageWidth - margin, y);
          });
        }

        // Eksekusi download langsung ke local system
        doc.save(`${currentResult.judul || 'Evaluasi'}.pdf`);
        setIsDownloading(false);
      } catch (err) {
        console.error("PDF generation failed:", err);
        showToast("Gagal merender file PDF. Silakan coba lagi.", "error");
        setIsDownloading(false);
      }
    };

    processDownload();
  };

  const handleSaveToBank = (item) => {
    if (!bankSoal.find(b => b.id === item.id)) {
      setBankSoal([item, ...bankSoal]);
      showToast("Berhasil disimpan ke Bank Soal!", "success");
    }
  };

  const handleSaveTemplate = () => {
    if (!formData.jenjang || !formData.mapel || !formData.materi) {
      showToast("Lengkapi minimal Jenjang, Mapel, dan Materi dulu sebelum simpan template.", "error");
      return;
    }
    const newTemplate = {
      id: Date.now().toString(),
      nama: `${formData.mapel} - ${formData.materi}`.slice(0, 60),
      ...formData
    };
    setTemplates([newTemplate, ...templates]);
    showToast("Template berhasil disimpan!", "success");
  };

  const handleLoadTemplate = (template) => {
    setFormData({
      jenjang: template.jenjang, mapel: template.mapel, materi: template.materi,
      jenisEvaluasi: template.jenisEvaluasi, kesulitan: template.kesulitan,
      jumlahSoal: template.jumlahSoal, tipeSoal: template.tipeSoal, instruksi: template.instruksi
    });
    showToast(`Template "${template.nama}" dimuat.`, "info");
  };

  const handleDeleteTemplate = (id) => {
    setTemplates(templates.filter(t => t.id !== id));
    showToast("Template dihapus.", "info");
  };

  // Bank ide contoh materi per jenjang, dipakai tombol "Acak Ide" biar beneran random
  const ideaBank = {
    SD: [
      { materi: 'Perkalian dan Pembagian Dasar', instruksi: 'Gunakan soal cerita sehari-hari yang dekat dengan anak SD.' },
      { materi: 'Siklus Air', instruksi: 'Sertakan gambar/diagram sederhana dalam deskripsi soal.' },
      { materi: 'Peristiwa Sumpah Pemuda', instruksi: 'Fokus pada nilai persatuan dan tokoh penting.' },
    ],
    SMP: [
      { materi: 'Persamaan Linear Satu Variabel', instruksi: 'Buat variasi soal cerita dan soal hitung langsung.' },
      { materi: 'Sistem Pencernaan Manusia', instruksi: 'Sertakan studi kasus gangguan pencernaan sehari-hari.' },
      { materi: 'Teks Recount (Bahasa Inggris)', instruksi: 'Gunakan kosakata sehari-hari level menengah.' },
    ],
    SMA: [
      { materi: 'Hukum Newton', instruksi: 'Sertakan soal hitung dan soal konsep aplikasi nyata.' },
      { materi: 'Reaksi Redoks', instruksi: 'Fokus pada penentuan bilangan oksidasi dan contoh reaksi harian.' },
      { materi: 'Teks Explanation', instruksi: 'Gunakan topik fenomena alam sebagai bahan soal.' },
    ],
    SMK: [
      { materi: 'Jaringan Dasar / IP Address', instruksi: 'Fokus pada perhitungan subnet mask dan studi kasus pembagian IP perusahaan.' },
      { materi: 'Prinsip Dasar Akuntansi', instruksi: 'Buat studi kasus pencatatan transaksi UMKM.' },
      { materi: 'K3 di Bengkel Otomotif', instruksi: 'Sertakan studi kasus penanganan insiden kerja ringan.' },
    ],
  };

  const handleAcakIde = () => {
    const pool = ideaBank[formData.jenjang] || [...ideaBank.SD, ...ideaBank.SMP, ...ideaBank.SMA, ...ideaBank.SMK];
    const idea = pool[Math.floor(Math.random() * pool.length)];
    setFormData({ ...formData, materi: idea.materi, instruksi: idea.instruksi });
    showToast("Ide baru dimuat, silakan sesuaikan lagi kalau perlu.", "info");
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showToast("Ukuran logo maksimal 1MB ya, biar PDF tidak terlalu berat.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPengaturan({ ...pengaturan, logoSekolah: reader.result });
      showToast("Logo sekolah berhasil diunggah.", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleBagikan = (item) => {
    const encoded = encodeQuizData(item);
    if (!encoded) {
      showToast("Gagal membuat link berbagi untuk soal ini.", "error");
      return;
    }
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const link = `${baseUrl}#siswa=${encoded}`;
    if (link.length > 7000) {
      showToast("Jumlah soal terlalu banyak untuk dibagikan via link. Coba kurangi jumlah soal.", "error");
      return;
    }
    setShareModal({ open: true, link });
  };

  const handleToggleFavorit = (item) => {
    const isFav = favorit.find(f => f.id === item.id);
    if (isFav) {
      setFavorit(favorit.filter(f => f.id !== item.id));
    } else {
      setFavorit([item, ...favorit]);
    }
  };

  // --- RENDER HALAMAN ---
  const renderDashboard = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
          Selamat Datang, Guru Penggerak!
        </h1>
        <p className="text-slate-400 mt-2">Buat evaluasi pembelajaran cerdas dalam hitungan detik.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-6 border-cyan-500/30">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-cyan-500/20 rounded-xl text-cyan-400"><Brain size={32} /></div>
            <div>
              <h3 className="text-2xl font-bold text-white">{riwayat.length}</h3>
              <p className="text-sm text-cyan-200/70">Total Soal Dibuat</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-6 border-purple-500/30">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-purple-500/20 rounded-xl text-purple-400"><BookOpen size={32} /></div>
            <div>
              <h3 className="text-2xl font-bold text-white">{bankSoal.length}</h3>
              <p className="text-sm text-purple-200/70">Tersimpan di Bank</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-6 border-amber-500/30">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-amber-500/20 rounded-xl text-amber-400"><Star size={32} /></div>
            <div>
              <h3 className="text-2xl font-bold text-white">{favorit.length}</h3>
              <p className="text-sm text-amber-200/70">Paket Favorit</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="p-8 flex flex-col items-center justify-center text-center space-y-4 hover:border-cyan-400/50 transition-colors cursor-pointer" onClick={() => setActivePage('generator')}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.5)]">
            <Sparkles size={36} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Buat Soal Baru</h2>
          <p className="text-slate-400 text-sm max-w-xs">Gunakan AI untuk membuat paket soal yang bervariasi sesuai kurikulum secara otomatis.</p>
        </GlassCard>
        
        <div className="space-y-6">
          <GlassCard className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2"><History size={18}/> Riwayat Terakhir</h3>
              <button onClick={() => setActivePage('riwayat')} className="text-xs text-cyan-400 hover:underline">Lihat Semua</button>
            </div>
            {riwayat.slice(0, 3).length > 0 ? (
              <div className="space-y-3">
                {riwayat.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:bg-slate-800" onClick={() => { setCurrentResult(item); setActivePage('preview'); }}>
                    <div>
                      <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">{item.judul}</p>
                      <p className="text-xs text-slate-500">{item.jenjangPendidikan} - {item.mataPelajaran}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-500" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic text-center py-4">Belum ada riwayat.</p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );

  const renderGenerator = () => (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Cpu className="text-cyan-400" /> Generator Soal AI
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Sesuaikan parameter untuk menghasilkan soal yang presisi.</p>
        </div>
        <NeonButton variant="ghost" onClick={handleAcakIde}>
          <Shuffle size={16} /> Acak Ide
        </NeonButton>
      </div>

      <GlassCard className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <InputField label="Jenjang Pendidikan" options={jenjangOptions} value={formData.jenjang} onChange={e => setFormData({...formData, jenjang: e.target.value, mapel: ''})} />
          <InputField label="Mata Pelajaran / Kejuruan" options={getMapelOptions()} value={formData.mapel} onChange={e => setFormData({...formData, mapel: e.target.value})} />
          
          <div className="md:col-span-2">
            <InputField label="Materi Pembelajaran Spesifik" placeholder="Contoh: Peristiwa Rengasdengklok, Teori IP Address, Akuntansi Biaya, dll..." value={formData.materi} onChange={e => setFormData({...formData, materi: e.target.value})} />
          </div>

          <InputField label="Jenis Evaluasi" options={jenisEvaluasiOptions} value={formData.jenisEvaluasi} onChange={e => setFormData({...formData, jenisEvaluasi: e.target.value})} />
          <InputField label="Tingkat Kesulitan" options={kesulitanOptions} value={formData.kesulitan} onChange={e => setFormData({...formData, kesulitan: e.target.value})} />
          
          <InputField label="Jumlah Soal" options={jumlahSoalOptions} value={formData.jumlahSoal} onChange={e => setFormData({...formData, jumlahSoal: e.target.value})} />
          <InputField label="Tipe Soal" options={tipeSoalOptions} value={formData.tipeSoal} onChange={e => setFormData({...formData, tipeSoal: e.target.value})} />
          
          <div className="md:col-span-2">
            <InputField label="Instruksi Tambahan (Opsional)" multiline placeholder="Tambahkan konteks spesifik. Misal: 'Gunakan bahasa sehari-hari industri', 'Buatkan soal studi kasus troublehsooting mesin', dll..." value={formData.instruksi} onChange={e => setFormData({...formData, instruksi: e.target.value})} />
          </div>
        </div>

        <div className="mt-8 flex flex-col md:flex-row gap-4 items-center justify-end border-t border-slate-700/50 pt-6">
          <NeonButton variant="secondary" icon={Save} onClick={handleSaveTemplate}>
            Simpan Template
          </NeonButton>
          <NeonButton variant="primary" icon={Sparkles} onClick={handleGenerate} className="w-full md:w-auto">
            Buat Soal Sekarang
          </NeonButton>
        </div>
      </GlassCard>

      {templates.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><LayoutTemplate size={18} /> Template Tersimpan</h3>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg pl-3 pr-1 py-1.5">
                <button onClick={() => handleLoadTemplate(t)} className="text-sm text-slate-200 hover:text-cyan-400">
                  {t.nama}
                </button>
                <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-500 hover:text-rose-400 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );

  const renderPreview = () => {
    if (!currentResult) return <div className="text-center mt-20 text-slate-400">Pilih soal dari riwayat atau generate baru.</div>;
    
    const isFav = favorit.some(f => f.id === currentResult.id);

    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 bg-slate-950/80 backdrop-blur-md p-4 rounded-2xl z-20 border border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-white">{currentResult.judul}</h1>
            <p className="text-cyan-400 text-sm">{currentResult.jenjangPendidikan} • {currentResult.mataPelajaran} • {currentResult.daftarSoal.length} Soal</p>
          </div>
          <div className="flex flex-wrap gap-3">
             <NeonButton variant="ghost" onClick={() => handleToggleFavorit(currentResult)} className={isFav ? "text-amber-400" : ""}>
               <Star size={18} className={isFav ? "fill-amber-400" : ""} />
             </NeonButton>
             <NeonButton variant="secondary" icon={Save} onClick={() => handleSaveToBank(currentResult)}>Ke Bank Soal</NeonButton>
             <NeonButton variant="secondary" icon={Share2} onClick={() => handleBagikan(currentResult)}>Bagikan</NeonButton>
             
             {/* Tombol Download Dinamis */}
             <NeonButton variant="primary" icon={Download} onClick={downloadPDF} disabled={isDownloading}>
               {isDownloading ? "Memproses PDF..." : "Download PDF"}
             </NeonButton>
          </div>
        </div>

        {/* PREVIEW CONTAINER */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-8">
               <h2 className="text-xl font-semibold text-white mb-6 border-b border-slate-700 pb-2">Lembar Soal</h2>
               <div className="space-y-8">
                 {currentResult.daftarSoal.map((soal, idx) => (
                   <div key={idx} className="group">
                     <div className="flex gap-4 text-slate-200">
                       <span className="font-bold text-cyan-400 mt-0.5">{idx + 1}.</span>
                       <div className="flex-1">
                         <p className="text-lg leading-relaxed mb-4">{soal.pertanyaan}</p>
                         {soal.opsi && soal.opsi.length > 0 && (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                             {soal.opsi.map((opt, i) => (
                               <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/80 transition-colors">
                                 <span className="font-medium text-slate-400">{String.fromCharCode(65+i)}.</span>
                                 <span>{opt}</span>
                               </div>
                             ))}
                           </div>
                         )}
                         {(soal.tipe === 'Essay' || soal.tipe === 'Isian Singkat') && (
                           <div className="mt-4 mb-2 w-full border-b border-dashed border-slate-600 h-8"></div>
                         )}
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
            </GlassCard>
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6 bg-slate-900/80 border-purple-500/30 sticky top-28">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-purple-400"/> Kunci Jawaban
              </h2>
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {currentResult.daftarSoal.map((soal, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">Soal {idx + 1}</p>
                    <p className="text-sm font-medium text-emerald-400 mb-2">{soal.jawaban}</p>
                    <div className="text-xs text-slate-300 bg-slate-900/50 p-2 rounded border border-slate-800">
                      <span className="text-purple-400 font-medium">Pembahasan:</span> {soal.pembahasan}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>

        {/* KISI-KISI SOAL */}
        {currentResult.kisiKisi && currentResult.kisiKisi.length > 0 && (
          <GlassCard className="p-6 overflow-x-auto">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <LayoutTemplate className="text-cyan-400" /> Kisi-Kisi Soal
            </h2>
            <table className="w-full text-sm text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="py-2 pr-4">No</th>
                  <th className="py-2 pr-4">Kompetensi Dasar / CP</th>
                  <th className="py-2 pr-4">Indikator Soal</th>
                  <th className="py-2 pr-4">Level Kognitif</th>
                </tr>
              </thead>
              <tbody>
                {currentResult.kisiKisi.map((k, idx) => (
                  <tr key={idx} className="border-b border-slate-800/70 text-slate-300">
                    <td className="py-2 pr-4">{k.nomor ?? idx + 1}</td>
                    <td className="py-2 pr-4">{k.kompetensi}</td>
                    <td className="py-2 pr-4">{k.indikator}</td>
                    <td className="py-2 pr-4 text-cyan-400">{k.levelKognitif}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </div>
    );
  };

  const renderSimpleList = (title, data, icon, emptyMsg) => (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
        {icon} {title}
      </h1>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          {icon}
          <p className="mt-4">{emptyMsg}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map(item => (
            <GlassCard key={item.id} className="p-6 hover:border-cyan-500/50 transition-all group cursor-pointer" onClick={() => { setCurrentResult(item); setActivePage('preview'); }}>
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-slate-800 rounded-lg text-cyan-400">
                  <BookOpen size={20} />
                </div>
                <div className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString('id-ID')}</div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1 line-clamp-2">{item.judul}</h3>
              <p className="text-sm text-slate-400 mb-4">{item.jenjangPendidikan} • {item.mataPelajaran}</p>
              
              <div className="flex justify-between items-center border-t border-slate-800 pt-4 mt-auto">
                <span className="text-xs text-slate-500">{item.daftarSoal?.length || 0} Soal</span>
                <button className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  Buka <ChevronRight size={16} />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );

  // --- KOMPONEN SIDEBAR ---
  const SidebarItem = ({ id, icon: Icon, label }) => {
    const isActive = activePage === id;
    return (
      <button
        onClick={() => { setActivePage(id); setIsMobileMenuOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
          isActive 
            ? 'bg-gradient-to-r from-cyan-500/20 to-transparent text-cyan-400 border-l-2 border-cyan-400' 
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`}
      >
        <Icon size={20} className={isActive ? 'animate-pulse' : ''} />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* GLOBAL STYLES FOR PRINT & ANIMATIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #020617; color: white; }
        h1, h2, h3, h4, h5, .font-display { font-family: 'Space Grotesk', sans-serif; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(6, 182, 212, 0.5); border-radius: 10px; }
        
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes progress-glow { 0% { transform: translateX(-100%); } 100% { transform: translateX(50%); } }
        
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
        .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
        .animate-progress-glow { animation: progress-glow 2s linear infinite; }
      `}} />

      <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-[#0a0f1c] to-slate-950 text-slate-200">
        
        {/* MOBILE OVERLAY */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
        )}

        {/* SIDEBAR */}
        <div className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900/80 backdrop-blur-xl border-r border-white/5 transform transition-transform duration-300 ease-in-out flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                <Brain className="text-white" size={24} />
              </div>
              <span className="text-xl font-bold font-display tracking-tight text-white">Edu<span className="text-cyan-400">AI</span></span>
            </div>
            <button className="md:hidden text-slate-400" onClick={() => setIsMobileMenuOpen(false)}><X size={24}/></button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar">
            <SidebarItem id="dashboard" icon={LayoutTemplate} label="Dashboard" />
            <SidebarItem id="generator" icon={Cpu} label="Generator AI" />
            
            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Koleksi</p>
            </div>
            <SidebarItem id="bank" icon={BookOpen} label="Bank Soal" />
            <SidebarItem id="riwayat" icon={History} label="Riwayat" />
            <SidebarItem id="favorit" icon={Star} label="Favorit" />
            
            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Lainnya</p>
            </div>
            <SidebarItem id="pengaturan" icon={Settings} label="Pengaturan" />
          </div>

          <div className="p-4 border-t border-white/5 text-center text-xs text-slate-600">
             EduAI v1.0 • Khusus Guru
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          
          {/* MOBILE HEADER */}
          <div className="md:hidden flex items-center justify-between p-4 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 z-30">
            <div className="flex items-center gap-2">
              <Brain className="text-cyan-400" size={20} />
              <span className="font-bold text-white">EduAI</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-300 p-1">
              <Menu size={24} />
            </button>
          </div>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative z-10">
            {activePage === 'dashboard' && renderDashboard()}
            {activePage === 'generator' && renderGenerator()}
            {activePage === 'preview' && renderPreview()}
            {activePage === 'bank' && renderSimpleList("Bank Soal", bankSoal, <BookOpen className="text-purple-400" size={28}/>, "Bank soal masih kosong. Simpan soal dari preview ke sini.")}
            {activePage === 'riwayat' && renderSimpleList("Riwayat Pembuatan", riwayat, <History className="text-cyan-400" size={28}/>, "Belum ada riwayat pembuatan soal.")}
            {activePage === 'favorit' && renderSimpleList("Soal Favorit", favorit, <Star className="text-amber-400" size={28}/>, "Belum ada soal favorit ditandai.")}
            {activePage === 'pengaturan' && (
              <div className="animate-fade-in max-2xl space-y-6">
                <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Settings className="text-slate-400"/> Pengaturan</h1>

                <GlassCard className="p-6 space-y-4 border-purple-500/30">
                  <h3 className="text-lg font-medium text-white mb-1 border-b border-slate-800 pb-2">Identitas Sekolah (Kop Surat)</h3>
                  <p className="text-sm text-slate-400">Data ini otomatis muncul sebagai kop surat resmi di setiap PDF soal yang kamu unduh.</p>

                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                      {pengaturan.logoSekolah ? (
                        <img src={pengaturan.logoSekolah} alt="Logo Sekolah" className="w-full h-full object-contain" />
                      ) : (
                        <BookOpen className="text-slate-600" size={28} />
                      )}
                    </div>
                    <div>
                      <label className="inline-block cursor-pointer text-sm px-4 py-2 rounded-lg bg-white/10 border border-slate-700 text-slate-200 hover:bg-white/20 transition-colors">
                        Unggah Logo Sekolah
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      <p className="text-xs text-slate-500 mt-1">PNG/JPG, maks 1MB</p>
                    </div>
                  </div>

                  <InputField label="Nama Sekolah" placeholder="Contoh: SMK Negeri 1 Cikarang" value={pengaturan.namaSekolah} onChange={e => setPengaturan({ ...pengaturan, namaSekolah: e.target.value })} />
                  <InputField label="Alamat Sekolah" placeholder="Contoh: Jl. Pendidikan No. 1, Cikarang" value={pengaturan.alamatSekolah} onChange={e => setPengaturan({ ...pengaturan, alamatSekolah: e.target.value })} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    <InputField label="Nama Guru" placeholder="Nama lengkap kamu" value={pengaturan.namaGuru} onChange={e => setPengaturan({ ...pengaturan, namaGuru: e.target.value })} />
                    <InputField label="NIP Guru (opsional)" placeholder="NIP kamu" value={pengaturan.nipGuru} onChange={e => setPengaturan({ ...pengaturan, nipGuru: e.target.value })} />
                    <InputField label="Nama Kepala Sekolah" placeholder="Untuk kolom 'Mengetahui'" value={pengaturan.namaKepsek} onChange={e => setPengaturan({ ...pengaturan, namaKepsek: e.target.value })} />
                    <InputField label="NIP Kepala Sekolah (opsional)" placeholder="NIP kepala sekolah" value={pengaturan.nipKepsek} onChange={e => setPengaturan({ ...pengaturan, nipKepsek: e.target.value })} />
                  </div>
                </GlassCard>

                <GlassCard className="p-6 space-y-4 border-cyan-500/30">
                  <h3 className="text-lg font-medium text-white mb-1 border-b border-slate-800 pb-2">Koneksi API Gemini (Wajib)</h3>
                  <p className="text-sm text-slate-400">
                    Aplikasi ini butuh API Key Gemini milikmu sendiri (gratis) supaya kuota generate soal tidak berebut dengan pengguna lain.
                    Dapatkan gratis di{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">
                      aistudio.google.com/apikey
                    </a>, lalu tempel di sini.
                  </p>
                  <InputField
                    label="API Key Gemini"
                    type="password"
                    placeholder="Tempel API Key kamu di sini..."
                    value={pengaturan.apiKey}
                    onChange={e => setPengaturan({ ...pengaturan, apiKey: e.target.value })}
                  />
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {pengaturan.apiKey ? (
                      <><CheckCircle2 size={14} className="text-emerald-400" /> API Key sudah terpasang.</>
                    ) : (
                      <><AlertCircle size={14} className="text-amber-400" /> Belum ada API Key, fitur generate soal belum bisa dipakai.</>
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Preferensi Aplikasi</h3>
                    <InputField
                      label="Bahasa Antarmuka"
                      options={['Bahasa Indonesia', 'English']}
                      value={pengaturan.bahasa}
                      onChange={e => setPengaturan({ ...pengaturan, bahasa: e.target.value })}
                    />
                    <InputField
                      label="Tema Tampilan"
                      options={['Futuristic Dark', 'Light Mode', 'High Contrast']}
                      value={pengaturan.tema}
                      onChange={e => setPengaturan({ ...pengaturan, tema: e.target.value })}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Format Ekspor PDF</h3>
                    <InputField
                      label="Ukuran Kertas"
                      options={['A4', 'Letter', 'Legal']}
                      value={pengaturan.ukuranKertas}
                      onChange={e => setPengaturan({ ...pengaturan, ukuranKertas: e.target.value })}
                    />
                    <InputField
                      label="Margin"
                      options={['Standar', 'Sempit', 'Lebar']}
                      value={pengaturan.margin}
                      onChange={e => setPengaturan({ ...pengaturan, margin: e.target.value })}
                    />
                  </div>
                  <NeonButton variant="primary" onClick={() => showToast('Pengaturan berhasil disimpan!', 'success')}>Simpan Pengaturan</NeonButton>
                </GlassCard>
              </div>
            )}
          </main>

          {/* BACKGROUND GLOW EFFECTS */}
          <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
          <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
        </div>

      </div>

      {/* OVERLAYS & HIDDEN ELEMENTS */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {loadingState.isLoading && <LoadingScreen statusTexts={loadingState.texts} />}

      {/* MODAL BAGIKAN SOAL KE SISWA */}
      {shareModal.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4" onClick={() => setShareModal({ open: false, link: '' })}>
          <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><QrCode size={20} className="text-cyan-400" /> Bagikan ke Siswa</h3>
              <button onClick={() => setShareModal({ open: false, link: '' })} className="text-slate-500 hover:text-slate-300"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-400">Siswa tinggal scan QR atau buka link ini di HP/laptop mereka untuk langsung mengerjakan soal (hasil pilihan ganda dinilai otomatis).</p>

            <div className="flex justify-center bg-white p-3 rounded-xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareModal.link)}`}
                alt="QR Code soal"
                width={200}
                height={200}
              />
            </div>

            <div className="flex gap-2">
              <input readOnly value={shareModal.link} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 truncate" />
              <NeonButton
                variant="secondary"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(shareModal.link);
                  showToast("Link disalin ke clipboard!", "success");
                }}
              >
                Salin
              </NeonButton>
            </div>
          </div>
        </div>
      )}
      
      {/* OVERLAY KHUSUS UNTUK DOWNLOAD PDF */}
      {isDownloading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
           <div className="text-center space-y-4 animate-fade-in-up">
              <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-cyan-400 font-medium text-xl">Menyiapkan Dokumen PDF...</p>
              <p className="text-slate-400 text-sm">Sedang memproses dokumen vektor berkualitas tinggi, mohon tunggu sebentar.</p>
           </div>
        </div>
      )}
    </>
  );
}