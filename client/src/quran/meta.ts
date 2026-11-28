// স্বয়ংক্রিয়ভাবে তৈরি — prep-quran.mjs (হাতে সম্পাদনা করবেন না)

export const SURAHS: { n: number; bn: string; en: string; ayahs: number; type: string }[] = [
  {
    "n": 1,
    "bn": "আল-ফাতিহা",
    "en": "Al-Faatiha",
    "ayahs": 7,
    "type": "মক্কী"
  },
  {
    "n": 2,
    "bn": "আল-বাকারা",
    "en": "Al-Baqara",
    "ayahs": 286,
    "type": "মাদানী"
  },
  {
    "n": 3,
    "bn": "আলে-ইমরান",
    "en": "Aal-i-Imraan",
    "ayahs": 200,
    "type": "মাদানী"
  },
  {
    "n": 4,
    "bn": "আন-নিসা",
    "en": "An-Nisaa",
    "ayahs": 176,
    "type": "মাদানী"
  },
  {
    "n": 5,
    "bn": "আল-মায়িদা",
    "en": "Al-Maaida",
    "ayahs": 120,
    "type": "মাদানী"
  },
  {
    "n": 6,
    "bn": "আল-আনআম",
    "en": "Al-An'aam",
    "ayahs": 165,
    "type": "মক্কী"
  },
  {
    "n": 7,
    "bn": "আল-আরাফ",
    "en": "Al-A'raaf",
    "ayahs": 206,
    "type": "মক্কী"
  },
  {
    "n": 8,
    "bn": "আল-আনফাল",
    "en": "Al-Anfaal",
    "ayahs": 75,
    "type": "মাদানী"
  },
  {
    "n": 9,
    "bn": "আত-তাওবা",
    "en": "At-Tawba",
    "ayahs": 129,
    "type": "মাদানী"
  },
  {
    "n": 10,
    "bn": "ইউনুস",
    "en": "Yunus",
    "ayahs": 109,
    "type": "মক্কী"
  },
  {
    "n": 11,
    "bn": "হুদ",
    "en": "Hud",
    "ayahs": 123,
    "type": "মক্কী"
  },
  {
    "n": 12,
    "bn": "ইউসুফ",
    "en": "Yusuf",
    "ayahs": 111,
    "type": "মক্কী"
  },
  {
    "n": 13,
    "bn": "আর-রাদ",
    "en": "Ar-Ra'd",
    "ayahs": 43,
    "type": "মাদানী"
  },
  {
    "n": 14,
    "bn": "ইবরাহিম",
    "en": "Ibrahim",
    "ayahs": 52,
    "type": "মক্কী"
  },
  {
    "n": 15,
    "bn": "আল-হিজর",
    "en": "Al-Hijr",
    "ayahs": 99,
    "type": "মক্কী"
  },
  {
    "n": 16,
    "bn": "আন-নাহল",
    "en": "An-Nahl",
    "ayahs": 128,
    "type": "মক্কী"
  },
  {
    "n": 17,
    "bn": "আল-ইসরা",
    "en": "Al-Israa",
    "ayahs": 111,
    "type": "মক্কী"
  },
  {
    "n": 18,
    "bn": "আল-কাহফ",
    "en": "Al-Kahf",
    "ayahs": 110,
    "type": "মক্কী"
  },
  {
    "n": 19,
    "bn": "মারইয়াম",
    "en": "Maryam",
    "ayahs": 98,
    "type": "মক্কী"
  },
  {
    "n": 20,
    "bn": "ত্বহা",
    "en": "Taa-Haa",
    "ayahs": 135,
    "type": "মক্কী"
  },
  {
    "n": 21,
    "bn": "আল-আম্বিয়া",
    "en": "Al-Anbiyaa",
    "ayahs": 112,
    "type": "মক্কী"
  },
  {
    "n": 22,
    "bn": "আল-হাজ্জ",
    "en": "Al-Hajj",
    "ayahs": 78,
    "type": "মাদানী"
  },
  {
    "n": 23,
    "bn": "আল-মুমিনুন",
    "en": "Al-Muminoon",
    "ayahs": 118,
    "type": "মক্কী"
  },
  {
    "n": 24,
    "bn": "আন-নূর",
    "en": "An-Noor",
    "ayahs": 64,
    "type": "মাদানী"
  },
  {
    "n": 25,
    "bn": "আল-ফুরকান",
    "en": "Al-Furqaan",
    "ayahs": 77,
    "type": "মক্কী"
  },
  {
    "n": 26,
    "bn": "আশ-শুআরা",
    "en": "Ash-Shu'araa",
    "ayahs": 227,
    "type": "মক্কী"
  },
  {
    "n": 27,
    "bn": "আন-নামল",
    "en": "An-Naml",
    "ayahs": 93,
    "type": "মক্কী"
  },
  {
    "n": 28,
    "bn": "আল-কাসাস",
    "en": "Al-Qasas",
    "ayahs": 88,
    "type": "মক্কী"
  },
  {
    "n": 29,
    "bn": "আল-আনকাবুত",
    "en": "Al-Ankaboot",
    "ayahs": 69,
    "type": "মক্কী"
  },
  {
    "n": 30,
    "bn": "আর-রুম",
    "en": "Ar-Room",
    "ayahs": 60,
    "type": "মক্কী"
  },
  {
    "n": 31,
    "bn": "লুকমান",
    "en": "Luqman",
    "ayahs": 34,
    "type": "মক্কী"
  },
  {
    "n": 32,
    "bn": "আস-সাজদা",
    "en": "As-Sajda",
    "ayahs": 30,
    "type": "মক্কী"
  },
  {
    "n": 33,
    "bn": "আল-আহযাব",
    "en": "Al-Ahzaab",
    "ayahs": 73,
    "type": "মাদানী"
  },
  {
    "n": 34,
    "bn": "সাবা",
    "en": "Saba",
    "ayahs": 54,
    "type": "মক্কী"
  },
  {
    "n": 35,
    "bn": "ফাতির",
    "en": "Faatir",
    "ayahs": 45,
    "type": "মক্কী"
  },
  {
    "n": 36,
    "bn": "ইয়াসিন",
    "en": "Yaseen",
    "ayahs": 83,
    "type": "মক্কী"
  },
  {
    "n": 37,
    "bn": "আস-সাফফাত",
    "en": "As-Saaffaat",
    "ayahs": 182,
    "type": "মক্কী"
  },
  {
    "n": 38,
    "bn": "সোয়াদ",
    "en": "Saad",
    "ayahs": 88,
    "type": "মক্কী"
  },
  {
    "n": 39,
    "bn": "আয-যুমার",
    "en": "Az-Zumar",
    "ayahs": 75,
    "type": "মক্কী"
  },
  {
    "n": 40,
    "bn": "গাফির",
    "en": "Ghafir",
    "ayahs": 85,
    "type": "মক্কী"
  },
  {
    "n": 41,
    "bn": "ফুসসিলাত",
    "en": "Fussilat",
    "ayahs": 54,
    "type": "মক্কী"
  },
  {
    "n": 42,
    "bn": "আশ-শূরা",
    "en": "Ash-Shura",
    "ayahs": 53,
    "type": "মক্কী"
  },
  {
    "n": 43,
    "bn": "আয-যুখরুফ",
    "en": "Az-Zukhruf",
    "ayahs": 89,
    "type": "মক্কী"
  },
  {
    "n": 44,
    "bn": "আদ-দুখান",
    "en": "Ad-Dukhaan",
    "ayahs": 59,
    "type": "মক্কী"
  },
  {
    "n": 45,
    "bn": "আল-জাসিয়া",
    "en": "Al-Jaathiya",
    "ayahs": 37,
    "type": "মক্কী"
  },
  {
    "n": 46,
    "bn": "আল-আহকাফ",
    "en": "Al-Ahqaf",
    "ayahs": 35,
    "type": "মক্কী"
  },
  {
    "n": 47,
    "bn": "মুহাম্মাদ",
    "en": "Muhammad",
    "ayahs": 38,
    "type": "মাদানী"
  },
  {
    "n": 48,
    "bn": "আল-ফাতহ",
    "en": "Al-Fath",
    "ayahs": 29,
    "type": "মাদানী"
  },
  {
    "n": 49,
    "bn": "আল-হুজুরাত",
    "en": "Al-Hujuraat",
    "ayahs": 18,
    "type": "মাদানী"
  },
  {
    "n": 50,
    "bn": "ক্বাফ",
    "en": "Qaaf",
    "ayahs": 45,
    "type": "মক্কী"
  },
  {
    "n": 51,
    "bn": "আয-যারিয়াত",
    "en": "Adh-Dhaariyat",
    "ayahs": 60,
    "type": "মক্কী"
  },
  {
    "n": 52,
    "bn": "আত-তূর",
    "en": "At-Tur",
    "ayahs": 49,
    "type": "মক্কী"
  },
  {
    "n": 53,
    "bn": "আন-নাজম",
    "en": "An-Najm",
    "ayahs": 62,
    "type": "মক্কী"
  },
  {
    "n": 54,
    "bn": "আল-কামার",
    "en": "Al-Qamar",
    "ayahs": 55,
    "type": "মক্কী"
  },
  {
    "n": 55,
    "bn": "আর-রাহমান",
    "en": "Ar-Rahmaan",
    "ayahs": 78,
    "type": "মাদানী"
  },
  {
    "n": 56,
    "bn": "আল-ওয়াকিয়া",
    "en": "Al-Waaqia",
    "ayahs": 96,
    "type": "মক্কী"
  },
  {
    "n": 57,
    "bn": "আল-হাদিদ",
    "en": "Al-Hadid",
    "ayahs": 29,
    "type": "মাদানী"
  },
  {
    "n": 58,
    "bn": "আল-মুজাদালা",
    "en": "Al-Mujaadila",
    "ayahs": 22,
    "type": "মাদানী"
  },
  {
    "n": 59,
    "bn": "আল-হাশর",
    "en": "Al-Hashr",
    "ayahs": 24,
    "type": "মাদানী"
  },
  {
    "n": 60,
    "bn": "আল-মুমতাহিনা",
    "en": "Al-Mumtahana",
    "ayahs": 13,
    "type": "মাদানী"
  },
  {
    "n": 61,
    "bn": "আস-সাফ",
    "en": "As-Saff",
    "ayahs": 14,
    "type": "মাদানী"
  },
  {
    "n": 62,
    "bn": "আল-জুমুআ",
    "en": "Al-Jumu'a",
    "ayahs": 11,
    "type": "মাদানী"
  },
  {
    "n": 63,
    "bn": "আল-মুনাফিকুন",
    "en": "Al-Munaafiqoon",
    "ayahs": 11,
    "type": "মাদানী"
  },
  {
    "n": 64,
    "bn": "আত-তাগাবুন",
    "en": "At-Taghaabun",
    "ayahs": 18,
    "type": "মাদানী"
  },
  {
    "n": 65,
    "bn": "আত-তালাক",
    "en": "At-Talaaq",
    "ayahs": 12,
    "type": "মাদানী"
  },
  {
    "n": 66,
    "bn": "আত-তাহরিম",
    "en": "At-Tahrim",
    "ayahs": 12,
    "type": "মাদানী"
  },
  {
    "n": 67,
    "bn": "আল-মুলক",
    "en": "Al-Mulk",
    "ayahs": 30,
    "type": "মক্কী"
  },
  {
    "n": 68,
    "bn": "আল-কলম",
    "en": "Al-Qalam",
    "ayahs": 52,
    "type": "মক্কী"
  },
  {
    "n": 69,
    "bn": "আল-হাক্কা",
    "en": "Al-Haaqqa",
    "ayahs": 52,
    "type": "মক্কী"
  },
  {
    "n": 70,
    "bn": "আল-মাআরিজ",
    "en": "Al-Ma'aarij",
    "ayahs": 44,
    "type": "মক্কী"
  },
  {
    "n": 71,
    "bn": "নূহ",
    "en": "Nooh",
    "ayahs": 28,
    "type": "মক্কী"
  },
  {
    "n": 72,
    "bn": "আল-জিন",
    "en": "Al-Jinn",
    "ayahs": 28,
    "type": "মক্কী"
  },
  {
    "n": 73,
    "bn": "আল-মুজ্জাম্মিল",
    "en": "Al-Muzzammil",
    "ayahs": 20,
    "type": "মক্কী"
  },
  {
    "n": 74,
    "bn": "আল-মুদ্দাসসির",
    "en": "Al-Muddaththir",
    "ayahs": 56,
    "type": "মক্কী"
  },
  {
    "n": 75,
    "bn": "আল-কিয়ামা",
    "en": "Al-Qiyaama",
    "ayahs": 40,
    "type": "মক্কী"
  },
  {
    "n": 76,
    "bn": "আল-ইনসান",
    "en": "Al-Insaan",
    "ayahs": 31,
    "type": "মাদানী"
  },
  {
    "n": 77,
    "bn": "আল-মুরসালাত",
    "en": "Al-Mursalaat",
    "ayahs": 50,
    "type": "মক্কী"
  },
  {
    "n": 78,
    "bn": "আন-নাবা",
    "en": "An-Naba",
    "ayahs": 40,
    "type": "মক্কী"
  },
  {
    "n": 79,
    "bn": "আন-নাযিআত",
    "en": "An-Naazi'aat",
    "ayahs": 46,
    "type": "মক্কী"
  },
  {
    "n": 80,
    "bn": "আবাসা",
    "en": "Abasa",
    "ayahs": 42,
    "type": "মক্কী"
  },
  {
    "n": 81,
    "bn": "আত-তাকভির",
    "en": "At-Takwir",
    "ayahs": 29,
    "type": "মক্কী"
  },
  {
    "n": 82,
    "bn": "আল-ইনফিতার",
    "en": "Al-Infitaar",
    "ayahs": 19,
    "type": "মক্কী"
  },
  {
    "n": 83,
    "bn": "আল-মুতাফফিফিন",
    "en": "Al-Mutaffifin",
    "ayahs": 36,
    "type": "মক্কী"
  },
  {
    "n": 84,
    "bn": "আল-ইনশিকাক",
    "en": "Al-Inshiqaaq",
    "ayahs": 25,
    "type": "মক্কী"
  },
  {
    "n": 85,
    "bn": "আল-বুরুজ",
    "en": "Al-Burooj",
    "ayahs": 22,
    "type": "মক্কী"
  },
  {
    "n": 86,
    "bn": "আত-তারিক",
    "en": "At-Taariq",
    "ayahs": 17,
    "type": "মক্কী"
  },
  {
    "n": 87,
    "bn": "আল-আলা",
    "en": "Al-A'laa",
    "ayahs": 19,
    "type": "মক্কী"
  },
  {
    "n": 88,
    "bn": "আল-গাশিয়া",
    "en": "Al-Ghaashiya",
    "ayahs": 26,
    "type": "মক্কী"
  },
  {
    "n": 89,
    "bn": "আল-ফাজর",
    "en": "Al-Fajr",
    "ayahs": 30,
    "type": "মক্কী"
  },
  {
    "n": 90,
    "bn": "আল-বালাদ",
    "en": "Al-Balad",
    "ayahs": 20,
    "type": "মক্কী"
  },
  {
    "n": 91,
    "bn": "আশ-শামস",
    "en": "Ash-Shams",
    "ayahs": 15,
    "type": "মক্কী"
  },
  {
    "n": 92,
    "bn": "আল-লাইল",
    "en": "Al-Lail",
    "ayahs": 21,
    "type": "মক্কী"
  },
  {
    "n": 93,
    "bn": "আদ-দুহা",
    "en": "Ad-Dhuhaa",
    "ayahs": 11,
    "type": "মক্কী"
  },
  {
    "n": 94,
    "bn": "আশ-শারহ",
    "en": "Ash-Sharh",
    "ayahs": 8,
    "type": "মক্কী"
  },
  {
    "n": 95,
    "bn": "আত-তিন",
    "en": "At-Tin",
    "ayahs": 8,
    "type": "মক্কী"
  },
  {
    "n": 96,
    "bn": "আল-আলাক",
    "en": "Al-Alaq",
    "ayahs": 19,
    "type": "মক্কী"
  },
  {
    "n": 97,
    "bn": "আল-কদর",
    "en": "Al-Qadr",
    "ayahs": 5,
    "type": "মক্কী"
  },
  {
    "n": 98,
    "bn": "আল-বাইয়িনা",
    "en": "Al-Bayyina",
    "ayahs": 8,
    "type": "মাদানী"
  },
  {
    "n": 99,
    "bn": "আয-যালযালা",
    "en": "Az-Zalzala",
    "ayahs": 8,
    "type": "মাদানী"
  },
  {
    "n": 100,
    "bn": "আল-আদিয়াত",
    "en": "Al-Aadiyaat",
    "ayahs": 11,
    "type": "মক্কী"
  },
  {
    "n": 101,
    "bn": "আল-কারিয়া",
    "en": "Al-Qaari'a",
    "ayahs": 11,
    "type": "মক্কী"
  },
  {
    "n": 102,
    "bn": "আত-তাকাসুর",
    "en": "At-Takaathur",
    "ayahs": 8,
    "type": "মক্কী"
  },
  {
    "n": 103,
    "bn": "আল-আসর",
    "en": "Al-Asr",
    "ayahs": 3,
    "type": "মক্কী"
  },
  {
    "n": 104,
    "bn": "আল-হুমাযা",
    "en": "Al-Humaza",
    "ayahs": 9,
    "type": "মক্কী"
  },
  {
    "n": 105,
    "bn": "আল-ফিল",
    "en": "Al-Fil",
    "ayahs": 5,
    "type": "মক্কী"
  },
  {
    "n": 106,
    "bn": "কুরাইশ",
    "en": "Quraish",
    "ayahs": 4,
    "type": "মক্কী"
  },
  {
    "n": 107,
    "bn": "আল-মাউন",
    "en": "Al-Maa'un",
    "ayahs": 7,
    "type": "মক্কী"
  },
  {
    "n": 108,
    "bn": "আল-কাওসার",
    "en": "Al-Kawthar",
    "ayahs": 3,
    "type": "মক্কী"
  },
  {
    "n": 109,
    "bn": "আল-কাফিরুন",
    "en": "Al-Kaafiroon",
    "ayahs": 6,
    "type": "মক্কী"
  },
  {
    "n": 110,
    "bn": "আন-নাসর",
    "en": "An-Nasr",
    "ayahs": 3,
    "type": "মাদানী"
  },
  {
    "n": 111,
    "bn": "আল-মাসাদ",
    "en": "Al-Masad",
    "ayahs": 5,
    "type": "মক্কী"
  },
  {
    "n": 112,
    "bn": "আল-ইখলাস",
    "en": "Al-Ikhlaas",
    "ayahs": 4,
    "type": "মক্কী"
  },
  {
    "n": 113,
    "bn": "আল-ফালাক",
    "en": "Al-Falaq",
    "ayahs": 5,
    "type": "মক্কী"
  },
  {
    "n": 114,
    "bn": "আন-নাস",
    "en": "An-Naas",
    "ayahs": 6,
    "type": "মক্কী"
  }
];

export const PARAS: { para: number; startSurah: number; startAyah: number; endSurah: number; endAyah: number }[] = [
  {
    "para": 1,
    "startSurah": 1,
    "startAyah": 1,
    "endSurah": 2,
    "endAyah": 141
  },
  {
    "para": 2,
    "startSurah": 2,
    "startAyah": 142,
    "endSurah": 2,
    "endAyah": 252
  },
  {
    "para": 3,
    "startSurah": 2,
    "startAyah": 253,
    "endSurah": 3,
    "endAyah": 92
  },
  {
    "para": 4,
    "startSurah": 3,
    "startAyah": 93,
    "endSurah": 4,
    "endAyah": 23
  },
  {
    "para": 5,
    "startSurah": 4,
    "startAyah": 24,
    "endSurah": 4,
    "endAyah": 147
  },
  {
    "para": 6,
    "startSurah": 4,
    "startAyah": 148,
    "endSurah": 5,
    "endAyah": 81
  },
  {
    "para": 7,
    "startSurah": 5,
    "startAyah": 82,
    "endSurah": 6,
    "endAyah": 110
  },
  {
    "para": 8,
    "startSurah": 6,
    "startAyah": 111,
    "endSurah": 7,
    "endAyah": 87
  },
  {
    "para": 9,
    "startSurah": 7,
    "startAyah": 88,
    "endSurah": 8,
    "endAyah": 40
  },
  {
    "para": 10,
    "startSurah": 8,
    "startAyah": 41,
    "endSurah": 9,
    "endAyah": 92
  },
  {
    "para": 11,
    "startSurah": 9,
    "startAyah": 93,
    "endSurah": 11,
    "endAyah": 5
  },
  {
    "para": 12,
    "startSurah": 11,
    "startAyah": 6,
    "endSurah": 12,
    "endAyah": 52
  },
  {
    "para": 13,
    "startSurah": 12,
    "startAyah": 53,
    "endSurah": 14,
    "endAyah": 52
  },
  {
    "para": 14,
    "startSurah": 15,
    "startAyah": 1,
    "endSurah": 16,
    "endAyah": 128
  },
  {
    "para": 15,
    "startSurah": 17,
    "startAyah": 1,
    "endSurah": 18,
    "endAyah": 74
  },
  {
    "para": 16,
    "startSurah": 18,
    "startAyah": 75,
    "endSurah": 20,
    "endAyah": 135
  },
  {
    "para": 17,
    "startSurah": 21,
    "startAyah": 1,
    "endSurah": 22,
    "endAyah": 78
  },
  {
    "para": 18,
    "startSurah": 23,
    "startAyah": 1,
    "endSurah": 25,
    "endAyah": 20
  },
  {
    "para": 19,
    "startSurah": 25,
    "startAyah": 21,
    "endSurah": 27,
    "endAyah": 55
  },
  {
    "para": 20,
    "startSurah": 27,
    "startAyah": 56,
    "endSurah": 29,
    "endAyah": 45
  },
  {
    "para": 21,
    "startSurah": 29,
    "startAyah": 46,
    "endSurah": 33,
    "endAyah": 30
  },
  {
    "para": 22,
    "startSurah": 33,
    "startAyah": 31,
    "endSurah": 36,
    "endAyah": 27
  },
  {
    "para": 23,
    "startSurah": 36,
    "startAyah": 28,
    "endSurah": 39,
    "endAyah": 31
  },
  {
    "para": 24,
    "startSurah": 39,
    "startAyah": 32,
    "endSurah": 41,
    "endAyah": 46
  },
  {
    "para": 25,
    "startSurah": 41,
    "startAyah": 47,
    "endSurah": 45,
    "endAyah": 37
  },
  {
    "para": 26,
    "startSurah": 46,
    "startAyah": 1,
    "endSurah": 51,
    "endAyah": 30
  },
  {
    "para": 27,
    "startSurah": 51,
    "startAyah": 31,
    "endSurah": 57,
    "endAyah": 29
  },
  {
    "para": 28,
    "startSurah": 58,
    "startAyah": 1,
    "endSurah": 66,
    "endAyah": 12
  },
  {
    "para": 29,
    "startSurah": 67,
    "startAyah": 1,
    "endSurah": 77,
    "endAyah": 50
  },
  {
    "para": 30,
    "startSurah": 78,
    "startAyah": 1,
    "endSurah": 114,
    "endAyah": 6
  }
];
