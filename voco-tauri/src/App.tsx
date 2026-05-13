import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SetupWizard } from "./SetupWizard";
import "./App.css";

type Page = "home" | "history" | "dictionary" | "settings";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "home", label: "概览", icon: "🏠" },
  { id: "history", label: "历史", icon: "🕘" },
  { id: "dictionary", label: "词典", icon: "📖" },
  { id: "settings", label: "设置", icon: "⚙️" },
];

interface VoCoResult {
  raw: string;
  text: string;
  mode: string;
}

interface Session {
  at: string;
  mode: string;
  raw: string;
  text: string;
  translate_target: string | null;
  duration_ms: number;
}

interface VoCoStats {
  total_sessions: number;
  total_chars: number;
  today_chars: number;
  translate_count: number;
}

interface VoCoConfig {
  recognize_engine: string;
  recognize_language: string;
  polish_model: string;
  translate_model: string;
  translate_target: string;
  trigger_polish: string;
  trigger_translate_modifier: string;
  trigger_mode: string;
  input_device: string;
  first_run_completed: boolean;
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const [version] = useState("0.1.0");
  const [engineStatus, setEngineStatus] = useState("加载中…");
  const [cfg, setCfg] = useState<VoCoConfig | null>(null);
  const [sessionHistory, setSessionHistory] = useState<VoCoResult[]>([]);
  const [stats, setStats] = useState<VoCoStats>({
    total_sessions: 0,
    total_chars: 0,
    today_chars: 0,
    translate_count: 0,
  });
  const [lastError, setLastError] = useState<string>("");
  const [wizardDone, setWizardDone] = useState(false);

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

    const unsubs: Array<() => void> = [];
    listen<VoCoResult>("voco:result", (e) => {
      setSessionHistory((h) => [e.payload, ...h].slice(0, 20));
      refreshStats();
    }).then((u) => unsubs.push(u));
    listen<{ message: string }>("voco:error", (e) => {
      setLastError(e.payload.message);
    }).then((u) => unsubs.push(u));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  // First-run wizard takes over the whole window until the user finishes it.
  if (cfg && !wizardDone) {
    return (
      <SetupWizard
        initialCfg={cfg as any}
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
    <div className="flex h-screen text-[14px]">
      <aside className="w-[220px] bg-white border-r border-black/[0.06] flex flex-col">
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black grid place-items-center text-white text-base font-bold">
            V
          </div>
          <div className="flex flex-col">
            <span className="font-semibold tracking-wide">VoCo</span>
            <span className="text-[11px] text-black/45">v{version}</span>
          </div>
        </div>
        <nav className="flex-1 px-2">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={
                "w-full text-left px-4 py-2.5 rounded-lg my-0.5 flex items-center gap-3 transition-colors " +
                (page === n.id
                  ? "bg-blue-50 text-blue-600"
                  : "hover:bg-black/5 text-black/75")
              }
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 text-[11px] text-black/45 border-t border-black/[0.06]">
          就绪 · {engineStatus}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {page === "home" && (
          <HomePage
            cfg={cfg}
            sessionHistory={sessionHistory}
            stats={stats}
            lastError={lastError}
            onDismissError={() => setLastError("")}
          />
        )}
        {page === "history" && (
          <HistoryPage onClearStats={refreshStats} />
        )}
        {page === "dictionary" && <DictionaryPage />}
        {page === "settings" && <SettingsPage cfg={cfg} setCfg={setCfg} />}
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
  sessionHistory,
  stats,
  lastError,
  onDismissError,
}: {
  cfg: VoCoConfig | null;
  sessionHistory: VoCoResult[];
  stats: VoCoStats;
  lastError: string;
  onDismissError: () => void;
}) {
  const sessionChars = sessionHistory.reduce((sum, r) => sum + r.text.length, 0);
  const targetLabel =
    TARGET_LANG_LABEL[cfg?.translate_target ?? "ko"] ?? cfg?.translate_target;
  return (
    <div className="p-10">
      <h1 className="text-[34px] font-semibold tracking-tight">
        说出来，写下来
      </h1>
      <p className="mt-3 text-black/55">
        按住 <Kbd>{prettyKey(cfg?.trigger_polish)}</Kbd> 说话 — VoCo 自动把你说的话写到光标位置。
      </p>
      <p className="mt-1 text-black/55">
        同时按 <Kbd>{prettyKey(cfg?.trigger_translate_modifier)}</Kbd> 翻译成{targetLabel}。
      </p>

      {lastError && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-start gap-3">
          <span className="flex-1">⚠️ {friendlyError(lastError)}</span>
          <button
            onClick={onDismissError}
            className="text-red-700/60 hover:text-red-700 text-lg leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-10 grid grid-cols-4 gap-4">
        <Metric label="本次字数" value={String(sessionChars)} />
        <Metric label="今日字数" value={String(stats.today_chars)} />
        <Metric label="累计字数" value={String(stats.total_chars)} />
        <Metric label="翻译次数" value={String(stats.translate_count)} />
      </div>

      <div className="mt-10 rounded-2xl border border-black/[0.06] bg-white p-6">
        <div className="text-sm font-medium">最近识别</div>
        <div className="mt-3 space-y-3">
          {sessionHistory.length === 0 && (
            <div className="text-black/45 text-sm">
              还没有记录 — 按住快捷键说点什么试试。
            </div>
          )}
          {sessionHistory.slice(0, 5).map((r, i) => (
            <ResultRow key={i} r={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryPage({ onClearStats }: { onClearStats: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">历史</h1>
        {sessions.length > 0 && (
          <button
            onClick={clearAll}
            className="text-sm text-black/55 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            清空记录
          </button>
        )}
      </div>
      <div className="mt-6 space-y-3">
        {loading && <div className="text-black/45 text-sm">加载中…</div>}
        {!loading && sessions.length === 0 && (
          <div className="text-black/55 text-sm">还没有记录。</div>
        )}
        {sessions.map((s, i) => (
          <SessionRow key={i} s={s} />
        ))}
      </div>
    </div>
  );
}

function DictionaryPage() {
  return (
    <div className="p-10">
      <h1 className="text-[28px] font-semibold tracking-tight">词典</h1>
      <p className="mt-3 text-black/55">
        添加专有名词，VoCo 会用它们提高识别准确度。
      </p>
      <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white p-6 text-black/45 text-sm">
        这个功能下个版本上线。
      </div>
    </div>
  );
}

function SettingsPage({
  cfg,
  setCfg,
}: {
  cfg: VoCoConfig | null;
  setCfg: (c: VoCoConfig) => void;
}) {
  const [mics, setMics] = useState<string[]>([]);
  useEffect(() => {
    invoke<string[]>("list_microphones").then(setMics).catch(() => {});
  }, []);

  if (!cfg) return <div className="p-10">加载中…</div>;

  function update<K extends keyof VoCoConfig>(key: K, value: VoCoConfig[K]) {
    if (!cfg) return;
    const next = { ...cfg, [key]: value };
    setCfg(next);
    invoke("save_config", { cfg: next }).catch(console.error);
  }

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-[28px] font-semibold tracking-tight">设置</h1>

      <Card title="麦克风">
        <Row label="使用的麦克风">
          <select
            value={cfg.input_device}
            onChange={(e) => update("input_device", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[280px]"
          >
            <option value="">系统默认</option>
            {mics.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Row>
      </Card>

      <Card title="快捷键 与 触发">
        <Row label="录音键（按住=润色）">
          <input
            value={cfg.trigger_polish}
            onChange={(e) => update("trigger_polish", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[220px]"
          />
        </Row>
        <Row label="翻译附加键">
          <input
            value={cfg.trigger_translate_modifier}
            onChange={(e) =>
              update("trigger_translate_modifier", e.target.value)
            }
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[220px]"
          />
        </Row>
        <Row label="翻译目标语言">
          <select
            value={cfg.translate_target}
            onChange={(e) => update("translate_target", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[220px]"
          >
            <option value="ko">韩语</option>
            <option value="en">英语</option>
            <option value="zh">中文</option>
            <option value="ja">日语</option>
          </select>
        </Row>
      </Card>

      <Card title="引擎">
        <Row label="识别引擎">
          <select
            value={cfg.recognize_engine}
            onChange={(e) => update("recognize_engine", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[220px]"
          >
            <option value="volcengine">火山引擎（推荐）</option>
            <option value="local">本地 SenseVoice</option>
          </select>
        </Row>
        <Row label="润色模型">
          <input
            value={cfg.polish_model}
            onChange={(e) => update("polish_model", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[280px]"
          />
        </Row>
        <Row label="翻译模型">
          <input
            value={cfg.translate_model}
            onChange={(e) => update("translate_model", e.target.value)}
            className="border border-black/15 rounded-lg px-3 py-2 min-w-[280px]"
          />
        </Row>
      </Card>
    </div>
  );
}

// ---------- Reusable bits ----------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
      <div className="text-[36px] font-semibold leading-none">{value}</div>
      <div className="mt-2 text-xs text-black/55">{label}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-2 py-0.5 rounded-md border border-black/[0.12] bg-white text-[12px] font-medium text-black/75 mx-0.5">
      {children}
    </kbd>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-black/[0.06] bg-white">
      <div className="px-6 pt-5 pb-2 text-[10px] uppercase tracking-[1px] text-black/45 font-semibold">
        {title}
      </div>
      <div className="px-6 pb-5">{children}</div>
    </div>
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
    <div className="flex items-center justify-between py-3 border-b border-black/[0.06] last:border-b-0">
      <div className="text-sm text-black/75">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({ r }: { r: VoCoResult }) {
  return (
    <div className="rounded-xl border border-black/[0.06] p-3">
      <div className="text-xs text-black/45 flex items-center gap-2 mb-1">
        <span
          className={
            "inline-block w-2 h-2 rounded-full " +
            (r.mode === "translate"
              ? "bg-blue-500"
              : r.mode === "polish"
                ? "bg-emerald-500"
                : "bg-gray-400")
          }
        />
        {r.mode === "translate" ? "翻译" : r.mode === "polish" ? "润色" : "原文"}
      </div>
      <div className="text-sm text-black/85">{r.text}</div>
      {r.raw !== r.text && (
        <div className="text-xs text-black/35 mt-1">原文: {r.raw}</div>
      )}
    </div>
  );
}

function SessionRow({ s }: { s: Session }) {
  const date = new Date(s.at);
  const ago = relativeTime(date);
  return (
    <div className="rounded-xl border border-black/[0.06] p-3">
      <div className="text-xs text-black/45 flex items-center gap-2 mb-1">
        <span
          className={
            "inline-block w-2 h-2 rounded-full " +
            (s.mode === "translate"
              ? "bg-blue-500"
              : s.mode === "polish"
                ? "bg-emerald-500"
                : "bg-gray-400")
          }
        />
        {s.mode === "translate" ? "翻译" : s.mode === "polish" ? "润色" : "原文"}
        <span className="ml-auto">{ago}</span>
      </div>
      <div className="text-sm text-black/85">{s.text}</div>
      {s.raw !== s.text && (
        <div className="text-xs text-black/35 mt-1">原文: {s.raw}</div>
      )}
    </div>
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
  return m[code] || code;
}

export default App;
