import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import {
  Home,
  Clock,
  BookOpen,
  Settings as SettingsIcon,
  FileText,
  PenLine,
  BarChart3,
  Languages,
  Copy,
  Check,
  Trash2,
  Search,
  Mic,
  Power,
  Info,
  Keyboard,
  Plus,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { SetupWizard } from "./SetupWizard";
import type {
  VoCoConfig,
  VoCoResult,
  VoCoStats,
  Session,
  DictEntry,
} from "./types";
import "./App.css";

type Page = "home" | "history" | "dictionary" | "settings";

const NAV: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "概览", Icon: Home },
  { id: "history", label: "历史", Icon: Clock },
  { id: "dictionary", label: "词典", Icon: BookOpen },
  { id: "settings", label: "设置", Icon: SettingsIcon },
];

function App() {
  const [page, setPage] = useState<Page>("home");
  const [version, setVersion] = useState("");
  const [engineStatus, setEngineStatus] = useState("加载中…");
  const [cfg, setCfg] = useState<VoCoConfig | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [stats, setStats] = useState<VoCoStats>({
    total_sessions: 0,
    total_chars: 0,
    today_chars: 0,
    translate_count: 0,
  });
  const [lastError, setLastError] = useState<string>("");
  const [wizardDone, setWizardDone] = useState(false);
  // Autostart state lives at App level — loaded once at app start so the
  // Settings page never sees a null→resolved transition (which manifested
  // as the toggle flashing each time the user opened Settings).
  const [autostart, setAutostart] = useState<boolean | null>(null);

  // Auto-dismiss errors after 8 seconds — they're transient by nature and
  // a stuck red banner makes the app feel broken.
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => setLastError(""), 8000);
    return () => clearTimeout(t);
  }, [lastError]);

  function refreshStats() {
    invoke<VoCoStats>("get_stats").then(setStats).catch(() => {});
  }

  function refreshEngineStatus(c: VoCoConfig) {
    setEngineStatus(`已就绪 · ${c.recognize_language === "ko" ? "韩语识别" : "中文识别"}`);
  }

  useEffect(() => {
    invoke<VoCoConfig>("get_config")
      .then((c) => {
        setCfg(c);
        setWizardDone(c.first_run_completed);
        refreshEngineStatus(c);
      })
      .catch(() => setEngineStatus("后端未连接"));

    refreshStats();
    getVersion().then(setVersion).catch(() => {});
    isAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false));

    // StrictMode double-mounts effects in dev. `listen()` returns a Promise,
    // so the unsubscribe function isn't available synchronously — if we just
    // push it into an array and call them all on cleanup, the first cleanup
    // happens before the Promise resolves and we leak a subscription. Then
    // the second mount adds another, and every event fires twice (showed up
    // as 本次次数 +2 per recording). Fix: a `cancelled` flag that makes any
    // late-arriving unsub fire itself.
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const trackUnsub = (u: () => void) => {
      if (cancelled) u();
      else unsubs.push(u);
    };

    listen<VoCoResult>("voco:result", (_e) => {
      setSessionCount((c) => c + 1);
      refreshStats();
    }).then(trackUnsub);
    listen<{ message: string }>("voco:error", (e) => {
      setLastError(e.payload.message);
    }).then(trackUnsub);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  // First-run wizard takes over the whole window until the user finishes it.
  if (cfg && !wizardDone) {
    return (
      <SetupWizard
        initialCfg={cfg}
        onDone={() => {
          setWizardDone(true);
          invoke<VoCoConfig>("get_config")
            .then((c) => {
              setCfg(c);
              refreshEngineStatus(c);
            })
            .catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="flex h-screen text-[14px] bg-[#FAFBFC]">
      <aside className="w-[220px] bg-white border-r border-black/[0.05] flex flex-col">
        <div className="px-5 pt-6 pb-4 flex items-center gap-3">
          <img
            src="/voco-logo.png"
            alt="VoCo"
            className="w-11 h-11 rounded-[10px]"
            draggable={false}
          />
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-[15px] tracking-wide">VoCo</span>
            <span className="text-[11px] text-black/40 voco-mono">v{version}</span>
          </div>
        </div>
        <nav className="flex-1 px-3 mt-2">
          {NAV.map((n) => {
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className={
                  "relative w-full text-left px-3 py-2.5 rounded-lg my-0.5 flex items-center gap-3 transition-colors text-[14px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] " +
                  (active
                    ? "bg-[#EFF6FF] text-[#2563EB] font-medium"
                    : "hover:bg-black/[0.04] text-black/70")
                }
              >
                <span
                  aria-hidden
                  className={
                    "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[#2563EB] transition-all duration-300 ease-out " +
                    (active ? "h-5 opacity-100" : "h-0 opacity-0")
                  }
                />
                <n.Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[12px] text-black/45 border-t border-black/[0.05] flex items-center gap-2">
          <span className="relative inline-flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
            <span className="relative inline-block w-2 h-2 rounded-full bg-emerald-500" />
          </span>
          <span>{engineStatus}</span>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {page === "home" && (
          <HomePage
            cfg={cfg}
            sessionCount={sessionCount}
            stats={stats}
            lastError={lastError}
            onDismissError={() => setLastError("")}
          />
        )}
        {page === "history" && (
          <HistoryPage onClearStats={refreshStats} />
        )}
        {page === "dictionary" && <DictionaryPage />}
        {page === "settings" && (
          <SettingsPage
            cfg={cfg}
            setCfg={setCfg}
            version={version}
            autostart={autostart}
            setAutostart={setAutostart}
          />
        )}
      </main>
    </div>
  );
}

const TARGET_LANG_LABEL: Record<string, string> = {
  ko: "韩语",
  en: "英语",
  zh: "中文",
  ja: "日语",
};

function HomePage({
  cfg,
  sessionCount,
  stats,
  lastError,
  onDismissError,
}: {
  cfg: VoCoConfig | null;
  sessionCount: number;
  stats: VoCoStats;
  lastError: string;
  onDismissError: () => void;
}) {
  const targetLabel =
    TARGET_LANG_LABEL[cfg?.translate_target ?? "ko"] ?? cfg?.translate_target;
  return (
    <div className="p-6 max-w-[1200px] mx-auto h-full flex flex-col min-h-0">
      <section className="relative overflow-hidden rounded-[20px] border border-black/[0.05] bg-gradient-to-br from-[#EFF6FF] via-white to-[#EFF6FF] p-7 flex items-center gap-6 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-[30px] font-semibold tracking-tight leading-[1.15]">
            说出来，写下来
          </h1>
          <p className="mt-4 text-[13px] text-black/60 leading-relaxed">
            按住 <Keycap>{prettyKey(cfg?.trigger_polish)}</Keycap> 说话 — VoCo 自动把你说的话写到光标位置。
          </p>
          <p className="mt-2 text-[13px] text-black/60 leading-relaxed">
            同时按 <Keycap>{prettyKey(cfg?.trigger_translate_modifier)}</Keycap> 翻译成{targetLabel}。
          </p>
        </div>
        <HeroIllustration />
      </section>

      {lastError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-start gap-3 shrink-0">
          <span className="flex-1">⚠️ {friendlyError(lastError)}</span>
          <button
            onClick={onDismissError}
            className="text-red-700/60 hover:text-red-700 text-lg leading-none px-1"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0">
        <StatCard Icon={FileText} value={sessionCount} label="本次次数" />
        <StatCard Icon={PenLine} value={stats.today_chars} label="今日字数" />
        <StatCard Icon={BarChart3} value={stats.total_chars} label="累计字数" />
        <StatCard Icon={Languages} value={stats.translate_count} label="翻译次数" />
      </div>

      <HomeTipBanner />
    </div>
  );
}

function HomeTipBanner() {
  // Rotating tips at the bottom of the overview. Mostly there to surface
  // features users wouldn't discover from the home page alone (toggle mode,
  // auto-mute, encryption, etc.) — passive onboarding.
  const tips = [
    "想要「按一下开始 / 再按一下结束」？设置 → 触发方式 → 切换模式",
    "想录音时电脑别响？设置 → 语音 → 录音时自动静音其他声音",
    "想翻译成英语 / 中文 / 日语？设置 → 快捷键与触发 → 翻译目标语言",
    "想换录音快捷键？设置 → 快捷键与触发 → 录音键",
    "想让 VoCo 开机自启动？设置 → 启动 → 开机自动启动 VoCo",
    "想看说过的话？侧栏 → 历史",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % tips.length), 7000);
    return () => clearInterval(t);
  }, [tips.length]);
  return (
    <div className="mt-4 shrink-0 px-5 py-3 rounded-xl border border-black/[0.04] bg-gradient-to-r from-[#EFF6FF] via-white to-[#EFF6FF] text-[12px] text-black/55 text-center flex items-center justify-center gap-2">
      <span className="text-[#2563EB]">💡</span>
      <span>{tips[i]}</span>
    </div>
  );
}

function useCountUp(target: number, duration = 800): number {
  const [n, setN] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function StatCard({
  Icon,
  value,
  label,
}: {
  Icon: LucideIcon;
  value: number;
  label: string;
}) {
  const animated = useCountUp(value);
  return (
    <div className="voco-lift rounded-[18px] border border-black/[0.05] bg-white p-6 flex items-center gap-5 min-h-0">
      <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] flex items-center justify-center text-[#2563EB] shrink-0">
        <Icon size={28} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[40px] font-semibold leading-none voco-mono tabular-nums">
          {animated.toLocaleString("zh-CN")}
        </div>
        <div className="mt-2 text-[13px] text-black/50">{label}</div>
      </div>
    </div>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="voco-mono inline-flex items-center px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#2563EB] text-[12px] font-medium mx-0.5 border border-[#2563EB]/15">
      {children}
    </kbd>
  );
}

function HeroIllustration() {
  // Fixed-size, non-shrinking illustration. Sits in a flex row with the text
  // — that gives the text a real flex-1 column and avoids the overlap we'd
  // get with absolute positioning at narrow window widths.
  return (
    <div
      className="relative shrink-0 w-[320px] h-[200px] pointer-events-none select-none"
      aria-hidden="true"
    >
      <div className="absolute right-[40px] top-[20px] w-[160px] h-[160px] rounded-full bg-[#2563EB]/[0.08] blur-2xl" />
      <div className="absolute right-[20px] top-[60px] w-[120px] h-[120px] rounded-full bg-white/80 blur-xl" />

      <div className="voco-float-a absolute right-[60px] top-[20px] w-[140px] h-[140px] rounded-full bg-gradient-to-br from-white to-[#DBEAFE] shadow-[0_18px_40px_-12px_rgba(37,99,235,0.35)] flex items-center justify-center border border-white">
        <div className="w-[88px] h-[88px] rounded-full bg-gradient-to-br from-[#60A5FA] to-[#2563EB] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]">
          <Mic size={36} strokeWidth={2} className="text-white" />
        </div>
      </div>

      <div className="voco-float-b absolute left-[4px] top-[58px] w-[68px] h-[58px] rounded-2xl bg-gradient-to-br from-white to-[#BFDBFE] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.30)] flex items-center justify-center border border-white">
        <svg width="34" height="22" viewBox="0 0 34 22" fill="none">
          {[2, 7, 12, 17, 22, 27, 32].map((x, i) => {
            const heights = [6, 12, 18, 22, 16, 10, 6];
            return (
              <rect
                key={i}
                x={x - 1.5}
                y={(22 - heights[i]) / 2}
                width="3"
                height={heights[i]}
                rx="1.5"
                fill="#2563EB"
              />
            );
          })}
        </svg>
      </div>

      <div className="voco-float-c absolute right-[2px] top-[78px] w-[62px] h-[62px] rounded-2xl bg-gradient-to-br from-white to-[#BFDBFE] shadow-[0_10px_24px_-8px_rgba(37,99,235,0.30)] flex items-center justify-center border border-white">
        <span className="text-[#2563EB] font-semibold text-[22px] voco-mono">
          A
        </span>
      </div>

      <div className="voco-float-b absolute right-[30px] top-[10px] w-1.5 h-1.5 rounded-full bg-[#2563EB]/30" />
      <div className="voco-float-c absolute right-0 top-[50px] w-1 h-1 rounded-full bg-[#2563EB]/40" />
      <div className="voco-float-a absolute left-[78px] top-[20px] w-1 h-1 rounded-full bg-[#2563EB]/40" />
      <div className="voco-float-b absolute left-[58px] top-[170px] w-1.5 h-1.5 rounded-full bg-[#2563EB]/25" />
    </div>
  );
}

function HistoryPage({ onClearStats }: { onClearStats: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  function reload() {
    setLoading(true);
    invoke<{ sessions: Session[] }>("get_history")
      .then((h) => setSessions((h.sessions ?? []).slice().reverse()))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    const unsubs: Array<() => void> = [];
    listen("voco:result", () => reload()).then((u) => unsubs.push(u));
    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  function clearAll() {
    if (!confirm("确定清空所有历史记录吗？这一步不能撤回。")) return;
    invoke("clear_history")
      .then(() => {
        setSessions([]);
        onClearStats();
      })
      .catch(() => {});
  }

  const filtered = query.trim()
    ? sessions.filter(
        (s) =>
          s.text.toLowerCase().includes(query.toLowerCase()) ||
          s.raw.toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">历史</h1>
        {sessions.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[13px] text-black/55 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
          >
            <Trash2 size={14} strokeWidth={1.8} />
            清空记录
          </button>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="mt-5 relative">
          <Search
            size={16}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索历史…"
            className="w-full border border-black/[0.08] bg-white rounded-lg pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading && <div className="text-black/45 text-sm">加载中…</div>}
        {!loading && sessions.length === 0 && (
          <div className="text-black/55 text-sm">还没有记录。</div>
        )}
        {!loading && sessions.length > 0 && filtered.length === 0 && (
          <div className="text-black/55 text-sm">没找到匹配的记录。</div>
        )}
        {filtered.map((s) => (
          <SessionRow key={`${s.at}-${s.raw.slice(0, 16)}`} s={s} />
        ))}
      </div>
    </div>
  );
}

const DICT_SUGGESTIONS = [
  "钉钉",
  "字节跳动",
  "TikTok",
  "豆包",
  "拼多多",
  "OpenAI",
];

function DictionaryPage() {
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [newNote, setNewNote] = useState("");
  const [query, setQuery] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimer = useRef<number | null>(null);

  useEffect(() => {
    invoke<{ entries: DictEntry[] }>("get_dictionary")
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoaded(true));
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  function persist(next: DictEntry[]) {
    setEntries(next);
    invoke("save_dictionary", { dict: { entries: next } }).catch(console.error);
    setJustSaved(true);
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    justSavedTimer.current = window.setTimeout(() => setJustSaved(false), 1400);
  }

  function addEntry(term?: string, note?: string) {
    const t = (term ?? newTerm).trim();
    if (!t) return;
    if (entries.some((e) => e.term === t)) {
      setNewTerm("");
      setNewNote("");
      return;
    }
    persist([{ term: t, note: (note ?? newNote).trim() }, ...entries]);
    setNewTerm("");
    setNewNote("");
  }

  function removeEntry(idx: number) {
    persist(entries.filter((_, i) => i !== idx));
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          e.note.toLowerCase().includes(q),
      )
    : entries;
  const unseenSuggestions = DICT_SUGGESTIONS.filter(
    (s) => !entries.some((e) => e.term === s),
  );

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-[28px] font-semibold tracking-tight">词典</h1>
      <p className="mt-3 text-[14px] text-black/55 leading-relaxed">
        碰到常被识别错的词，加进这里。下次说话时 VoCo 会按你写的版本输出，不再认错。
      </p>
      <div
        className={
          "mt-3 inline-flex items-center gap-2 text-[12px] rounded-full px-3 py-1 transition-colors " +
          (justSaved
            ? "text-emerald-700 bg-emerald-50 border border-emerald-500/30"
            : "text-[#2563EB] bg-[#EFF6FF] border border-[#2563EB]/15")
        }
      >
        <Check size={12} strokeWidth={2.4} />
        {justSaved ? "已保存 — 下一次说话就用新词典" : "改完立即生效，下一次说话就用新词典"}
      </div>

      {/* Concrete before/after — answers "what does this page do" at a glance. */}
      <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="text-[11px] text-black/40 uppercase tracking-wider font-medium">
          举个例子
        </div>
        <div className="mt-4 flex items-stretch gap-4">
          <div className="flex-1 rounded-xl border border-black/[0.05] bg-black/[0.015] p-4">
            <div className="text-[11px] text-black/45 mb-1">没加词典时</div>
            <div className="text-[13px] text-black/85">
              你说：「用<span className="font-medium">飞书</span>发我消息」
            </div>
            <div className="text-[11px] text-black/45 mt-2 mb-1">VoCo 写出</div>
            <div className="text-[13px] text-red-600 font-medium">
              用飞数发我消息
            </div>
          </div>
          <div className="flex items-center text-black/30">→</div>
          <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-4">
            <div className="text-[11px] text-emerald-700/80 mb-1">
              加了「飞书」之后
            </div>
            <div className="text-[13px] text-black/85">
              你说：「用<span className="font-medium">飞书</span>发我消息」
            </div>
            <div className="text-[11px] text-emerald-700/80 mt-2 mb-1">VoCo 写出</div>
            <div className="text-[13px] text-emerald-700 font-medium">
              用飞书发我消息
            </div>
          </div>
        </div>
        <div className="mt-4 text-[12px] text-black/50 leading-relaxed">
          适合加：<span className="text-black/70">人名 · 公司名 · 产品名 · 缩写（CTO / SaaS）· 行业黑话 · 项目代号</span>
          <br />
          不用加：<span className="text-black/70">日常常用词（"你好"、"谢谢"这些 VoCo 本来就识别得准）</span>
        </div>
      </div>

      <Card title="添加词条" icon={<Plus size={16} strokeWidth={1.8} />}>
        <div className="flex gap-3">
          <input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
            placeholder="常被识别错的词，例如：飞书"
            className="flex-1 border border-black/[0.08] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
            placeholder="备注（自己看的，可空）"
            className="flex-1 border border-black/[0.08] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
          />
          <button
            onClick={() => addEntry()}
            disabled={!newTerm.trim()}
            className="bg-[#0A0A0B] text-white px-5 py-2 rounded-lg text-[13px] font-medium hover:bg-[#27272A] transition-colors disabled:opacity-40"
          >
            添加
          </button>
        </div>
      </Card>

      {loaded && entries.length === 0 && unseenSuggestions.length > 0 && (
        <Card title="点一下加进词典，立刻生效" icon={<Plus size={16} strokeWidth={1.8} />}>
          <div className="flex flex-wrap gap-2">
            {unseenSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => addEntry(s)}
                className="text-[12px] px-3 py-1.5 rounded-full border border-black/[0.08] bg-white hover:border-[#2563EB]/40 hover:text-[#2563EB] transition-colors flex items-center gap-1"
              >
                <Plus size={12} strokeWidth={2} />
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card
        title={`已收录 ${entries.length} 个`}
        icon={<BookOpen size={16} strokeWidth={1.8} />}
      >
        {entries.length > 0 && (
          <div className="relative mb-3">
            <Search
              size={14}
              strokeWidth={2}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索词条…"
              className="w-full border border-black/[0.08] bg-white rounded-lg pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-[#2563EB]/40 focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>
        )}
        <div className="space-y-1">
          {!loaded && (
            <div className="text-black/45 text-[13px] py-2">加载中…</div>
          )}
          {loaded && entries.length === 0 && (
            <div className="text-black/45 text-[13px] py-2">
              还没有词条 — 上面加一个，或点击上面的建议词试试。
            </div>
          )}
          {loaded && entries.length > 0 && filtered.length === 0 && (
            <div className="text-black/45 text-[13px] py-2">
              没找到含「{query}」的词条。
            </div>
          )}
          {filtered.map((e) => {
            // Look up the real index in the unfiltered array so delete still
            // works correctly when the list is being filtered.
            const realIdx = entries.findIndex(
              (x) => x.term === e.term && x.note === e.note,
            );
            return (
              <div
                key={`${e.term}-${realIdx}`}
                className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-black/[0.02] group"
              >
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-black/85">{e.term}</div>
                  {e.note && (
                    <div className="text-[11px] text-black/45 mt-0.5">{e.note}</div>
                  )}
                </div>
                <button
                  onClick={() => removeEntry(realIdx)}
                  className="text-[11px] text-black/40 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"
                >
                  <Trash2 size={12} strokeWidth={1.8} />
                  删除
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SettingsPage({
  cfg,
  setCfg,
  version,
  autostart,
  setAutostart,
}: {
  cfg: VoCoConfig | null;
  setCfg: (c: VoCoConfig) => void;
  version: string;
  autostart: boolean | null;
  setAutostart: (v: boolean | null) => void;
}) {
  const [mics, setMics] = useState<string[]>([]);
  // Korean IME on Windows hardcodes Right-Alt as the 한/영 toggle key and
  // will swallow our hotkey. If the user has Korean installed we surface a
  // soft banner with a one-click switch to F9 (which no IME steals).
  const [koreanIme, setKoreanIme] = useState(false);
  useEffect(() => {
    invoke<string[]>("list_microphones").then(setMics).catch(() => {});
    invoke<boolean>("has_korean_ime").then(setKoreanIme).catch(() => {});
  }, []);

  async function toggleAutostart(next: boolean) {
    setAutostart(next);
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
    } catch {
      // Revert on failure (e.g., Windows policy blocks the registry write).
      setAutostart(!next);
    }
  }

  if (!cfg) return <div className="p-10">加载中…</div>;

  function update<K extends keyof VoCoConfig>(key: K, value: VoCoConfig[K]) {
    if (!cfg) return;
    const next = { ...cfg, [key]: value };
    setCfg(next);
    invoke("save_config", { cfg: next }).catch(console.error);
  }

  // Switching translate engine needs to flip base_url + model + engine
  // atomically — otherwise three save_config calls race and the polling
  // thread reloads with mismatched fields. One write, all three fields.
  function setTranslateEngine(engine: string) {
    if (!cfg) return;
    const presets: Record<string, { base_url: string; model: string }> = {
      deepseek: { base_url: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      openai: { base_url: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
      relay: { base_url: "https://api.bltcy.ai/v1", model: "gpt-4.1-mini" },
    };
    const preset = presets[engine] ?? presets.deepseek;
    const next: VoCoConfig = {
      ...cfg,
      translate_engine: engine,
      translate_base_url: preset.base_url,
      translate_model: preset.model,
    };
    setCfg(next);
    invoke("save_config", { cfg: next }).catch(console.error);
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-[28px] font-semibold tracking-tight">设置</h1>

      <Card title="语音" icon={<Mic size={16} strokeWidth={1.8} />}>
        <Row label="使用的麦克风">
          <select
            value={cfg.input_device}
            onChange={(e) => update("input_device", e.target.value)}
            className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[280px]"
          >
            <option value="">系统默认</option>
            {/* If we've saved a device that isn't in the current `mics` list
                (either because mics is still loading or the device was
                unplugged), render it anyway so the <select> shows the right
                label instead of falling back to the first option. */}
            {cfg.input_device && !mics.includes(cfg.input_device) && (
              <option value={cfg.input_device}>{cfg.input_device}</option>
            )}
            {mics.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Row>
        <Row label="说话的语言">
          <select
            value={cfg.recognize_language}
            onChange={(e) => update("recognize_language", e.target.value)}
            className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[280px]"
          >
            <option value="zh">中文</option>
            <option value="ko">韩语</option>
          </select>
        </Row>
        <Row label="录音时自动静音其他声音">
          <Toggle
            checked={cfg.mute_others_while_recording}
            onChange={(v) => update("mute_others_while_recording", v)}
          />
        </Row>
        <p className="text-[11px] text-black/45 pt-1 pb-1">
          按住快捷键说话时暂时关闭电脑外放，松开后恢复。本来就静音 / 没声音时不动。
        </p>
      </Card>

      <Card title="启动" icon={<Power size={16} strokeWidth={1.8} />}>
        <Row label="开机自动启动 VoCo">
          <Toggle
            checked={!!autostart}
            disabled={autostart === null}
            onChange={toggleAutostart}
          />
        </Row>
      </Card>

      <Card title="关于" icon={<Info size={16} strokeWidth={1.8} />}>
        <Row label="版本">
          <span className="text-sm text-black/55 voco-mono">v{version || "—"}</span>
        </Row>
        <Row label="检查更新">
          <UpdateChecker />
        </Row>
      </Card>

      <Card title="快捷键与触发" icon={<Keyboard size={16} strokeWidth={1.8} />}>
        {koreanIme && cfg.trigger_polish === "alt_r" && (
          <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-400/40 bg-amber-50/80">
            <AlertTriangle
              size={18}
              strokeWidth={2}
              className="text-amber-600 shrink-0 mt-[2px]"
            />
            <div className="flex-1 text-[13px] leading-relaxed text-black/75">
              <div className="font-medium text-black/85 mb-0.5">
                检测到韩文输入法 — 右Alt 会被它截走
              </div>
              <div className="text-black/60">
                韩文 IME 把右Alt 当成「韩/英」切换键，VoCo 收不到。建议改成不冲突的 F9。
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => update("trigger_polish", "f9")}
                  className="bg-[#0A0A0B] text-white px-3 py-1.5 rounded-md text-[12px] font-medium hover:bg-[#27272A] transition-colors"
                >
                  一键切到 F9
                </button>
                <span className="text-[12px] text-black/40">
                  或下方手动选一个别的键
                </span>
              </div>
            </div>
          </div>
        )}
        <Row label="触发方式">
          <select
            value={cfg.trigger_mode}
            onChange={(e) => update("trigger_mode", e.target.value)}
            className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[260px]"
          >
            <option value="hold">按住说话（松开就出字）</option>
            <option value="toggle">按一下开始 / 再按一下结束</option>
          </select>
        </Row>
        <Row label="录音键">
          <KeyCapture
            value={cfg.trigger_polish}
            onChange={(v) => update("trigger_polish", v)}
          />
        </Row>
        <Row label="翻译附加键">
          <KeyCapture
            value={cfg.trigger_translate_modifier}
            onChange={(v) => update("trigger_translate_modifier", v)}
          />
        </Row>
        <p className="text-[11px] text-black/45 pt-3">
          改完立即生效，无需重启。
        </p>
        <Row label="翻译目标语言">
          <select
            value={cfg.translate_target}
            onChange={(e) => update("translate_target", e.target.value)}
            className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[220px]"
          >
            <option value="ko">韩语</option>
            <option value="en">英语</option>
            <option value="zh">中文</option>
            <option value="ja">日语</option>
          </select>
        </Row>
        <Row label="翻译引擎">
          <select
            value={cfg.translate_engine}
            onChange={(e) => setTranslateEngine(e.target.value)}
            className="border border-black/[0.08] rounded-lg px-3 py-2 min-w-[300px]"
          >
            <option value="deepseek">DeepSeek V4-Flash（推荐，国内直连快）</option>
            <option value="openai">OpenAI gpt-4.1-mini（韩语略优，延迟高）</option>
            <option value="relay">中转站（OpenAI 备用线路）</option>
          </select>
        </Row>
      </Card>

    </div>
  );
}

// ---------- Reusable bits ----------

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-[16px] border border-black/[0.05] bg-white p-6">
      <div className="flex items-center gap-2.5 text-[14px] font-medium text-black/85">
        {icon && <span className="text-black/55">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-black/[0.05] last:border-b-0">
      <div className="text-[13px] text-black/70">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function SessionRow({ s }: { s: Session }) {
  const date = new Date(s.at);
  const ago = relativeTime(date);
  return (
    <div className="rounded-xl border border-black/[0.05] p-3">
      <div className="text-xs text-black/45 flex items-center gap-2 mb-1">
        <span
          className={
            "inline-block w-2 h-2 rounded-full " +
            (s.mode === "translate"
              ? "bg-amber-500"
              : s.mode === "polish"
                ? "bg-emerald-500"
                : "bg-gray-400")
          }
        />
        {s.mode === "translate" ? "翻译" : s.mode === "polish" ? "润色" : "原文"}
        <CopyButton text={s.text} />
        <span className="ml-auto">{ago}</span>
      </div>
      <div className="text-sm text-black/85">{s.text}</div>
      {s.raw !== s.text && (
        <div className="text-xs text-black/35 mt-1">原文: {s.raw}</div>
      )}
    </div>
  );
}

function UpdateChecker() {
  const [state, setState] = useState<
    "idle" | "checking" | "uptodate" | "downloading" | "ready" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");

  async function check() {
    setState("checking");
    setMessage("");
    try {
      const update = await checkForUpdate();
      if (!update) {
        setState("uptodate");
        return;
      }
      setState("downloading");
      setMessage(`正在下载 v${update.version}…`);
      await update.downloadAndInstall();
      setState("ready");
    } catch (e) {
      setState("error");
      setMessage(String(e));
    }
  }

  if (state === "ready") {
    return (
      <button
        onClick={() => relaunch().catch(() => {})}
        className="text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700"
      >
        重启以应用更新
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={check}
        disabled={state === "checking" || state === "downloading"}
        className="text-sm border border-black/[0.08] px-4 py-1.5 rounded-lg hover:bg-black/5 disabled:opacity-40"
      >
        {state === "checking"
          ? "检查中…"
          : state === "downloading"
            ? "下载中…"
            : "检查更新"}
      </button>
      {state === "uptodate" && (
        <span className="text-xs text-black/55">已是最新版本</span>
      )}
      {state === "error" && (
        <span className="text-xs text-red-600">{friendlyError(message)}</span>
      )}
      {state === "downloading" && message && (
        <span className="text-xs text-black/55">{message}</span>
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  // Suppress CSS transitions on first paint so the toggle never animates from
  // a stale state to its real one when async-loaded values arrive. Only
  // animate user-driven changes (which happen after this flag flips true).
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    // Two RAFs: first lets the initial state paint, second flips the flag
    // after that paint commits — guarantees no transition on initial render.
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setAnimate(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={
        "relative inline-flex items-center w-11 h-6 rounded-full " +
        (animate ? "transition-colors " : "") +
        (checked ? "bg-[#2563EB]" : "bg-black/15") +
        (disabled ? " opacity-50 cursor-not-allowed" : " cursor-pointer")
      }
      role="switch"
      aria-checked={checked}
    >
      <span
        className={
          "absolute h-5 w-5 bg-white rounded-full shadow-sm " +
          (animate ? "transition-transform " : "") +
          (checked ? "translate-x-[22px]" : "translate-x-[2px]")
        }
      />
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may fail in odd contexts — fail quietly */
        }
      }}
      className="text-[11px] text-black/45 hover:text-black/75 px-2 py-0.5 rounded hover:bg-black/5 flex items-center gap-1"
    >
      {copied ? (
        <>
          <Check size={12} strokeWidth={2.2} className="text-emerald-600" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy size={12} strokeWidth={1.8} />
          <span>复制</span>
        </>
      )}
    </button>
  );
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

function friendlyError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("api_key") || s.includes("api key") || s.includes("unauthorized") || s.includes("401"))
    return "API 密钥未配置或失效，请检查设置。";
  if (s.includes("timeout") || s.includes("timed out")) return "网络超时，请检查网络后重试。";
  if (s.includes("network") || s.includes("dns") || s.includes("connection"))
    return "网络连接失败，请检查网络。";
  if (s.includes("microphone") || s.includes("input device") || s.includes("打开麦克风"))
    return "麦克风无法访问，请检查系统麦克风权限或设备连接。";
  if (s.includes("paste") || s.includes("clipboard")) return "粘贴失败，请确保光标在可输入位置。";
  if (s.includes("empty") || s.includes("no speech") || s.includes("没听清"))
    return "没听清楚，请再说一遍。";
  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}

function prettyKey(code: string | undefined): string {
  if (!code) return "?";
  const m: Record<string, string> = {
    alt_r: "右 Alt",
    alt_l: "左 Alt",
    ctrl_r: "右 Ctrl",
    ctrl_l: "左 Ctrl",
    shift_r: "右 Shift",
    shift_l: "左 Shift",
    caps_lock: "CapsLock",
  };
  if (m[code]) return m[code];
  if (/^f([1-9]|1[0-2])$/.test(code)) return code.toUpperCase();
  return code;
}

// Map browser KeyboardEvent.code → our backend config string. Only keys the
// Rust hotkey poller actually recognizes are returned; everything else maps
// to null (component rejects the input and asks again).
function codeFromKeyboardEvent(e: KeyboardEvent): string | null {
  switch (e.code) {
    case "AltRight":
      return "alt_r";
    case "AltLeft":
      return "alt_l";
    case "ControlRight":
      return "ctrl_r";
    case "ControlLeft":
      return "ctrl_l";
    case "ShiftRight":
      return "shift_r";
    case "ShiftLeft":
      return "shift_l";
    case "CapsLock":
      return "caps_lock";
    default:
      if (/^F([1-9]|1[0-2])$/.test(e.code)) return e.code.toLowerCase();
      return null;
  }
}

function KeyCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      if (e.code === "Escape") {
        setCapturing(false);
        return;
      }
      const mapped = codeFromKeyboardEvent(e);
      if (mapped) {
        onChange(mapped);
        setCapturing(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, onChange]);

  return (
    <button
      onClick={() => setCapturing(true)}
      className={
        "inline-flex items-center justify-center gap-2 min-w-[160px] px-3 py-2 rounded-lg text-sm font-medium transition-colors " +
        (capturing
          ? "bg-[#EFF6FF] border border-[#2563EB]/40 text-[#2563EB]"
          : "bg-white border border-black/[0.08] text-black/75 hover:bg-black/[0.04]")
      }
    >
      {capturing ? (
        <>
          <span className="voco-bars" aria-hidden>
            <span /><span /><span />
          </span>
          请按下任意键…（Esc 取消）
        </>
      ) : (
        prettyKey(value)
      )}
    </button>
  );
}

export default App;
