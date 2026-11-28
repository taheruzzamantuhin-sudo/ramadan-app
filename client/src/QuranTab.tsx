// আল-কুরআন ট্যাব — পারা ও সূরা অনুযায়ী তিলাওয়াত পাঠ, আয়াতভিত্তিক
// অডিও, বাংলা অর্থ ও উচ্চারণসহ। সূরার অডিও অ্যাপে বান্ডল করা (অফলাইন),
// পারার অডিও স্ট্রিমিং। ডেটা ও অডিও লজিক: ./quran.ts

import { useEffect, useMemo, useRef, useState } from "react";
import { KHATAM_PLAN } from "./content";
import {
  SURAHS,
  audioUrl,
  bundledAudioUrl,
  loadPara,
  loadSurah,
  type ParaAyah,
  type SurahMeta,
} from "./quran";

// ---------- helpers ----------

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function bn(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

function surahMeta(n: number): SurahMeta | undefined {
  return SURAHS.find((s) => s.n === n);
}

// ---------- view state ----------

type View =
  | { kind: "list" }
  | { kind: "surah"; n: number }
  | { kind: "para"; para: number };

interface Reading {
  ayahs: ParaAyah[];
  bismillah: string | null;
}

interface NowPlaying {
  index: number;
  ayah: ParaAyah;
}

const AUDIO_ERROR_TEXT = "অডিও চালু হয়নি — আবার চেষ্টা করুন";

export default function QuranTab({
  initialPara,
  onConsumeInitialPara,
  visible = true,
  onShowSelf,
}: {
  initialPara?: number | null;
  onConsumeInitialPara?: () => void;
  /** false while another app tab is active: the tab content hides but the
   *  audio element and the mini player stay alive, so a recitation in
   *  progress keeps playing across tabs and the reading position is kept. */
  visible?: boolean;
  /** Called when the user taps the mini player while this tab is hidden. */
  onShowSelf?: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [mode, setMode] = useState<"para" | "surah">("para");
  const [query, setQuery] = useState("");

  // ----- reading page data -----
  const [reading, setReading] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ----- one-ayah focus mode -----
  // When on, the reading page shows a single ayah in place of the list.
  // The shown ayah follows playback (playAt sets focusIdx, so when one
  // ayah's audio ends and the next starts, the card swaps to it), and the
  // user can also step manually with the prev/next buttons.
  const [focus, setFocus] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);

  // ----- audio player -----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [paused, setPaused] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const nowPlayingRef = useRef<NowPlaying | null>(null);
  const queueRef = useRef<ParaAyah[]>([]);
  const playTokenRef = useRef(0);
  const ayahRefs = useRef(new Map<number, HTMLElement>());

  const viewRef = useRef(view);
  viewRef.current = view;
  nowPlayingRef.current = nowPlaying;
  queueRef.current = reading?.ayahs ?? [];

  // ----- initial para deep-link (খতম প্ল্যান থেকে) -----
  const consumedRef = useRef(false);
  useEffect(() => {
    if (initialPara == null) {
      consumedRef.current = false;
      return;
    }
    if (consumedRef.current) return;
    consumedRef.current = true;
    if (initialPara >= 1 && initialPara <= 30) {
      setView({ kind: "para", para: initialPara });
    }
    onConsumeInitialPara?.();
  }, [initialPara, onConsumeInitialPara]);

  // ----- load reading data -----
  useEffect(() => {
    if (view.kind === "list") return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setReading(null);
    setFocusIdx(0);
    ayahRefs.current.clear();
    (async () => {
      try {
        if (view.kind === "surah") {
          const data = await loadSurah(view.n);
          if (cancelled) return;
          setReading({
            bismillah: data.bismillah,
            ayahs: data.ayahs.map((a) => ({ ...a, surah: view.n })),
          });
        } else {
          const ayahs = await loadPara(view.para);
          if (cancelled) return;
          setReading({ bismillah: null, ayahs });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  // ----- audio control -----

  function stopAudio() {
    playTokenRef.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setNowPlaying(null);
    setPaused(false);
  }

  async function playAt(index: number) {
    const ayah = queueRef.current[index];
    if (!ayah) return;
    const token = ++playTokenRef.current;
    setAudioError(null);
    setNowPlaying({ index, ayah });
    setFocusIdx(index);
    setPaused(false);
    const audio = audioRef.current;
    if (!audio) return;
    // সূরা অনুযায়ী শুনলে অ্যাপে বান্ডল করা লোকাল অডিও (অফলাইন);
    // পারা অনুযায়ী শুনলে আগের মতোই CDN থেকে স্ট্রিম।
    audio.src =
      viewRef.current.kind === "surah"
        ? bundledAudioUrl(ayah.g)
        : audioUrl(ayah.g);
    try {
      await audio.play();
    } catch {
      if (token === playTokenRef.current) setAudioError(AUDIO_ERROR_TEXT);
    }
  }

  function toggleAyah(index: number, ayah: ParaAyah) {
    if (nowPlaying && nowPlaying.ayah.g === ayah.g) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        setAudioError(null);
        void audio.play().catch(() => setAudioError(AUDIO_ERROR_TEXT));
      } else {
        audio.pause();
      }
      return;
    }
    void playAt(index);
  }

  function toggleMini() {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;
    if (audio.paused) {
      setAudioError(null);
      void audio.play().catch(() => setAudioError(AUDIO_ERROR_TEXT));
    } else {
      audio.pause();
    }
  }

  // ----- focus mode stepping -----
  function stepFocus(delta: number) {
    const ayahs = queueRef.current;
    if (ayahs.length === 0) return;
    const next = Math.min(ayahs.length - 1, Math.max(0, focusIdx + delta));
    if (next === focusIdx) return;
    // If a recitation session is active, stepping also moves the audio;
    // otherwise it just moves the ayah on screen.
    if (nowPlayingRef.current) void playAt(next);
    else setFocusIdx(next);
  }

  function toggleFocusPlay() {
    if (nowPlaying && nowPlaying.index === focusIdx) toggleMini();
    else void playAt(focusIdx);
  }

  function handleEnded() {
    const current = nowPlayingRef.current;
    if (!current) return;
    const next = current.index + 1;
    if (next < queueRef.current.length) {
      void playAt(next);
    } else {
      playTokenRef.current++;
      setNowPlaying(null);
      setPaused(false);
    }
  }

  function handleAudioError() {
    if (nowPlayingRef.current) setAudioError(AUDIO_ERROR_TEXT);
  }

  // চলমান আয়াতের কার্ড স্ক্রিনের মাঝখানে আনা
  useEffect(() => {
    if (!nowPlaying) return;
    ayahRefs.current
      .get(nowPlaying.ayah.g)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nowPlaying]);

  function goBack() {
    stopAudio();
    setAudioError(null);
    setView({ kind: "list" });
  }

  // ----- list filtering -----

  const filteredSurahs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(
      (s) =>
        s.bn.includes(query.trim()) ||
        s.en.toLowerCase().includes(q) ||
        String(s.n) === q ||
        bn(s.n) === query.trim(),
    );
  }, [query]);

  // ================= render =================

  const surahRow = (meta: SurahMeta) => (
    <div
      key={meta.n}
      className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:shadow"
    >
      <button
        type="button"
        onClick={() => setView({ kind: "surah", n: meta.n })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-base font-bold text-[#0b3d2e] shadow-sm">
          {bn(meta.n)}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-base font-bold text-[var(--text)]">
            সূরা {meta.bn}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--dim)]">
            {meta.en} • {bn(meta.ayahs)} আয়াত • {meta.type}
          </span>
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 text-lg text-[var(--gold)]">
          →
        </span>
      </button>
    </div>
  );

  // ----- reading page -----

  if (view.kind !== "list") {
    const isSurah = view.kind === "surah";
    const meta = isSurah ? surahMeta(view.n) : undefined;
    const plan = !isSurah
      ? KHATAM_PLAN.find((p) => p.para === view.para)
      : undefined;
    const title = isSurah
      ? `সূরা ${meta?.bn ?? ""}`
      : `পারা ${bn(view.para)}${plan ? `: ${plan.name}` : ""}`;
    const subtitle = isSurah
      ? `${meta?.en ?? ""} • ${bn(meta?.ayahs ?? 0)} আয়াত • ${meta?.type ?? ""}`
      : (plan?.range ?? "");
    const showParaNote = !isSurah && !loading && !loadError;
    const showSurahNote = isSurah && !loading && !loadError;

    let lastSurah = 0;
    return (
      <>
      <div
        aria-hidden={!visible}
        style={visible ? undefined : { display: "none" }}
        className={nowPlaying ? "pb-24" : ""}
      >
        <audio
          ref={audioRef}
          preload="none"
          onEnded={handleEnded}
          onError={handleAudioError}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          className="hidden"
        />

        {/* header */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--accent)] shadow-sm transition hover:bg-[var(--sage)]"
          >
            ← তালিকা
          </button>
          <button
            type="button"
            disabled={loading || !reading || reading.ayahs.length === 0}
            onClick={() => void playAt(0)}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[#0b3d2e] shadow-sm transition hover:brightness-105 disabled:opacity-50"
          >
            ▶ সব শুনুন
          </button>
          <button
            type="button"
            aria-pressed={focus}
            disabled={loading || !reading || reading.ayahs.length === 0}
            onClick={() => setFocus((f) => !f)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold shadow-sm transition disabled:opacity-50 ${
              focus
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--sage)]"
            }`}
          >
            {focus ? "☰ তালিকা" : "🔍 এক-আয়াত ফোকাস"}
          </button>
        </div>

        <div className="hero-band mb-5 rounded-2xl p-5 text-white shadow-md">
          <h2 className="font-display-bn text-2xl font-bold leading-snug">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}
        </div>

        {audioError && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {audioError}
          </p>
        )}

        {loading && (
          <div aria-live="polite">
            <p className="mb-3 text-center text-sm text-[var(--dim)]">লোড হচ্ছে…</p>
            <div className="animate-pulse space-y-3">
              {[0, 1, 2, 3].map((k) => (
                <div key={k} className="h-32 rounded-2xl bg-[var(--sage)]" />
              ))}
            </div>
          </div>
        )}

        {loadError && !loading && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-sm">
            <p className="mb-3 text-[var(--text)]">তথ্য লোড করা যায়নি।</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {reading && !loading && !focus && (
          <div className="space-y-3">
            {reading.bismillah && (
              <p
                dir="rtl"
                lang="ar"
                className="font-quran py-2 text-center text-[2rem] leading-loose text-[var(--accent)]"
              >
                {reading.bismillah}
              </p>
            )}
            {reading.ayahs.map((ayah, idx) => {
              const active = nowPlaying?.ayah.g === ayah.g;
              const divider =
                !isSurah && ayah.surah !== lastSurah
                  ? ((lastSurah = ayah.surah), surahMeta(ayah.surah))
                  : null;
              return (
                <div key={ayah.g} className="space-y-3">
                  {divider && (
                    <div className="pattern-band rounded-xl px-4 py-3 text-center shadow-sm">
                      <span className="font-display-bn text-base font-bold text-white">
                        সূরা {divider.bn}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/75">
                        {divider.en} • {bn(divider.ayahs)} আয়াত • {divider.type}
                      </span>
                    </div>
                  )}
                  <article
                    ref={(el) => {
                      if (el) ayahRefs.current.set(ayah.g, el);
                      else ayahRefs.current.delete(ayah.g);
                    }}
                    className={`rounded-2xl border bg-[var(--surface)] p-5 shadow-sm transition ${
                      active
                        ? "border-transparent ring-2 ring-[var(--gold)]"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-sm font-bold text-[#0b3d2e] shadow-sm">
                        {bn(ayah.i)}
                      </span>
                      {!isSurah && (
                        <span className="text-xs font-medium text-[var(--dim)]">
                          সূরা {surahMeta(ayah.surah)?.bn ?? bn(ayah.surah)}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={
                          active && !paused
                            ? `আয়াত ${bn(ayah.i)} থামান`
                            : `আয়াত ${bn(ayah.i)} শুনুন`
                        }
                        onClick={() => toggleAyah(idx, ayah)}
                        className={`ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base shadow-sm transition ${
                          active
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--sage)]"
                        }`}
                      >
                        {active && !paused ? "⏸" : "▶"}
                      </button>
                    </div>
                    <p
                      dir="rtl"
                      lang="ar"
                      className="font-quran text-right text-[1.7rem] leading-loose text-[var(--text)]"
                    >
                      {ayah.ar}
                    </p>
                    {ayah.pr && (
                      <p className="mt-3 text-sm leading-relaxed text-[var(--dim)]">
                        <span className="font-semibold text-[var(--accent)]">উচ্চারণ: </span>
                        {ayah.pr}
                      </p>
                    )}
                    <p className="mt-2 leading-relaxed text-[var(--text)]">{ayah.bn}</p>
                  </article>
                </div>
              );
            })}

            {showParaNote && (
              <p className="px-2 pt-2 text-center text-xs leading-relaxed text-[var(--dim)]">
                পারা অনুযায়ী শুনতে ইন্টারনেট লাগবে — সূরা অনুযায়ী শুনলে
                অ্যাপের ভেতরের অডিও থেকে ইন্টারনেট ছাড়াই চলবে।
              </p>
            )}
            {showSurahNote && (
              <p className="px-2 pt-2 text-center text-xs leading-relaxed text-[var(--dim)]">
                এই সূরার তিলাওয়াত অ্যাপের ভেতরেই আছে — ইন্টারনেট ছাড়াই
                শোনা যাবে।
              </p>
            )}
          </div>
        )}

        {/* ----- one-ayah focus card ----- */}
        {reading && !loading && focus && reading.ayahs.length > 0 && (() => {
          const idx = Math.min(focusIdx, reading.ayahs.length - 1);
          const ayah = reading.ayahs[idx];
          if (!ayah) return null;
          const isCurrent = nowPlaying?.ayah.g === ayah.g;
          return (
            <div>
              <article className="rounded-2xl border-2 border-[var(--gold)] bg-[var(--surface)] p-6 shadow-md">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-sm font-bold text-[#0b3d2e] shadow-sm">
                    {bn(ayah.i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text)]">
                      সূরা {surahMeta(ayah.surah)?.bn ?? bn(ayah.surah)} • আয়াত {bn(ayah.i)}
                    </span>
                    <span className="block text-xs text-[var(--dim)]">
                      {bn(idx + 1)} / {bn(reading.ayahs.length)}
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-[var(--sage)] px-2.5 py-1 text-xs font-bold text-[var(--accent)]">
                      {paused ? "⏸ থেমে আছে" : "▶ চলছে"}
                    </span>
                  )}
                </div>
                <p
                  dir="rtl"
                  lang="ar"
                  className="font-quran text-right text-[2.1rem] leading-loose text-[var(--text)]"
                >
                  {ayah.ar}
                </p>
                {ayah.pr && (
                  <p className="mt-4 leading-relaxed text-[var(--dim)]">
                    <span className="font-semibold text-[var(--accent)]">উচ্চারণ: </span>
                    {ayah.pr}
                  </p>
                )}
                <p className="mt-2 text-lg leading-relaxed text-[var(--text)]">{ayah.bn}</p>

                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    aria-label="আগের আয়াত"
                    disabled={idx <= 0}
                    onClick={() => stepFocus(-1)}
                    className="flex h-12 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--accent)] shadow-sm transition hover:bg-[var(--sage)] disabled:opacity-40"
                  >
                    ⏮ আগের
                  </button>
                  <button
                    type="button"
                    aria-label={isCurrent && !paused ? "থামান" : "এই আয়াত শুনুন"}
                    onClick={toggleFocusPlay}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-xl text-[#0b3d2e] shadow-md transition hover:brightness-105"
                  >
                    {isCurrent && !paused ? "⏸" : "▶"}
                  </button>
                  <button
                    type="button"
                    aria-label="পরের আয়াত"
                    disabled={idx >= reading.ayahs.length - 1}
                    onClick={() => stepFocus(1)}
                    className="flex h-12 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--accent)] shadow-sm transition hover:bg-[var(--sage)] disabled:opacity-40"
                  >
                    পরের ⏭
                  </button>
                </div>
                <p className="mt-4 text-center text-xs leading-relaxed text-[var(--dim)]">
                  শুনতে থাকলে এক আয়াত শেষ হলে পরের আয়াতটি নিজে থেকে এখানেই এসে চলতে থাকবে।
                </p>
              </article>
              {showParaNote && (
                <p className="px-2 pt-3 text-center text-xs leading-relaxed text-[var(--dim)]">
                  পারা অনুযায়ী শুনতে ইন্টারনেট লাগবে — সূরা অনুযায়ী শুনলে
                  অ্যাপের ভেতরের অডিও থেকে ইন্টারনেট ছাড়াই চলবে।
                </p>
              )}
              {showSurahNote && (
                <p className="px-2 pt-3 text-center text-xs leading-relaxed text-[var(--dim)]">
                  এই সূরার তিলাওয়াত অ্যাপের ভেতরেই আছে — ইন্টারনেট ছাড়াই
                  শোনা যাবে।
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* mini player — global: rendered outside the tab content above, so
          it stays visible and controllable on every app tab while a
          recitation is playing (hidden in focus mode, whose card carries
          its own controls) */}
      {nowPlaying && !(focus && visible) && (
          <div
            className="fixed inset-x-0 z-40"
            style={{ bottom: "calc(4.9rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mx-auto w-full max-w-2xl px-3">
              <div className="flex items-center gap-3 rounded-2xl bg-[#0b3d2e] px-4 py-3 text-white shadow-xl ring-1 ring-[var(--gold)]/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-sm font-bold text-[#0b3d2e]">
                  {bn(nowPlaying.ayah.i)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-semibold"
                  onClick={() => {
                    if (!visible) onShowSelf?.();
                  }}
                >
                  সূরা {surahMeta(nowPlaying.ayah.surah)?.bn ?? bn(nowPlaying.ayah.surah)}
                  {" • "}আয়াত {bn(nowPlaying.ayah.i)}
                  {audioError && (
                    <span className="block truncate text-xs font-normal text-red-200">
                      {audioError}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={paused ? "আবার চালান" : "থামান"}
                  onClick={toggleMini}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base transition hover:bg-white/20"
                >
                  {paused ? "▶" : "⏸"}
                </button>
                <button
                  type="button"
                  aria-label="অডিও বন্ধ করুন"
                  onClick={stopAudio}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base transition hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
      )}
      </>
    );
  }

  // ----- list page -----

  return (
    <div aria-hidden={!visible} style={visible ? undefined : { display: "none" }}>
      <audio
        ref={audioRef}
        preload="none"
        onEnded={handleEnded}
        onError={handleAudioError}
        className="hidden"
      />

      {/* header card */}
      <div className="hero-band mb-5 rounded-2xl p-5 text-white shadow-md">
        <h2 className="font-display-bn text-3xl font-bold leading-snug">আল-কুরআন</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/85">
          আরবি পাঠ, বাংলা অর্থ ও উচ্চারণসহ পুরো কুরআন — পারা বা সূরা ধরে পড়ুন ও শুনুন।
        </p>
        <p className="mt-2 rounded-xl bg-black/20 px-3 py-2 text-xs leading-relaxed text-white/80">
          উচ্চারণ সহায়ক মাত্র — মূল আরবি পাঠই প্রামাণ্য।
        </p>
      </div>

      {/* mode toggle */}
      <div
        role="tablist"
        aria-label="পড়ার ধরন"
        className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-[var(--sage)] p-1"
      >
        {(
          [
            { id: "para", label: "পারা অনুযায়ী" },
            { id: "surah", label: "সূরা অনুযায়ী" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={`rounded-full px-4 py-2.5 text-sm font-bold transition ${
              mode === t.id
                ? "bg-[var(--gold)] text-[#0b3d2e] shadow"
                : "text-[var(--dim)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "para" && (
        <div className="space-y-3">
          {KHATAM_PLAN.map((p) => (
            <button
              key={p.para}
              type="button"
              onClick={() => setView({ kind: "para", para: p.para })}
              className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:shadow"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-base font-bold text-[#0b3d2e] shadow-sm">
                {bn(p.para)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-[var(--text)]">
                  পারা {bn(p.para)}: {p.name}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-[var(--dim)]">
                  {p.range}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[var(--accent)]">
                পড়ুন/শুনুন →
              </span>
            </button>
          ))}
        </div>
      )}

      {mode === "surah" && (
        <div>
          <label className="sr-only" htmlFor="quran-surah-search">
            সূরা খুঁজুন
          </label>
          <input
            id="quran-surah-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="সূরার নাম লিখুন (বাংলা বা English)…"
            className="mb-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] shadow-sm outline-none transition placeholder:text-[var(--dim)] focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/40"
          />

          {filteredSurahs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
              <p className="text-base font-semibold text-[var(--text)]">
                কোনো সূরা পাওয়া যায়নি
              </p>
              <p className="mt-1 text-sm text-[var(--dim)]">
                অন্য নামে খুঁজে দেখুন — যেমন “ফাতিহা” বা “Fatiha”।
              </p>
            </div>
          ) : (
            <div className="space-y-3">{filteredSurahs.map(surahRow)}</div>
          )}

          <p className="px-2 pt-4 text-center text-xs leading-relaxed text-[var(--dim)]">
            সব সূরার তিলাওয়াত অ্যাপের ভেতরেই আছে — ডাউনলোড ছাড়াই
            ইন্টারনেট ছাড়া শোনা যাবে।
          </p>
        </div>
      )}
    </div>
  );
}
