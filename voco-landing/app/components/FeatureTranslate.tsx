// Translate feature block. Same shape as FeatureContext — a single input
// line above and three target-language outputs below — but the angle is
// different: same Chinese sentence, three real translations. Below the
// three highlight cards is a chip strip listing every supported target —
// country codes in monospace instead of flags, per brand decision.
//
// Hard-coded translations because the page is static; the actual product
// chooses the target language from the user's settings.
import Reveal from "./Reveal";

const cases: { lang: string; flag: string; out: string }[] = [
  {
    lang: "English",
    flag: "US",
    out: "Are you free at 3 PM tomorrow? I'd like to chat about product feedback.",
  },
  {
    lang: "日本語",
    flag: "JP",
    out: "明日の午後 3 時、お時間ありますか？製品のフィードバックについて少しお話ししたいです。",
  },
  {
    lang: "한국어",
    flag: "KR",
    out: "내일 오후 3시에 시간 괜찮으세요? 제품 피드백에 대해 잠깐 이야기하고 싶어요.",
  },
];

// Country-style 2-letter codes mapped to user-facing language names. Order
// mirrors the in-app dropdown (TRANSLATION_TARGETS in voco-tauri/src/types.ts).
// Keep these two lists in sync when adding a target.
const ALL_TARGETS: { code: string; name: string }[] = [
  { code: "US", name: "英语" },
  { code: "JP", name: "日语" },
  { code: "KR", name: "韩语" },
  { code: "CN", name: "中文" },
  { code: "FR", name: "法语" },
  { code: "DE", name: "德语" },
  { code: "ES", name: "西班牙语" },
  { code: "RU", name: "俄语" },
  { code: "PT", name: "葡萄牙语" },
  { code: "IT", name: "意大利语" },
  { code: "TH", name: "泰语" },
  { code: "VN", name: "越南语" },
  { code: "SA", name: "阿拉伯语" },
  { code: "IN", name: "印地语" },
  { code: "TR", name: "土耳其语" },
  { code: "ID", name: "印尼语" },
  { code: "MY", name: "马来语" },
];

export default function FeatureTranslate() {
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <h2 className="text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            说中文<br />
            直接出外语
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px]">
            按住右 Alt + 右 Ctrl 说中文，翻译完直接粘贴。
          </p>
        </div>

        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3 rounded-[12px] bg-canvas border border-hairline px-5 py-4 card-elev-2">
            <div className="flex items-center justify-between mb-1">
              <div className="font-mono text-[11px] uppercase tracking-wider text-mute">
                你说的中文
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-mute">
                ZH
              </div>
            </div>
            <div className="text-[15px] text-ink italic">
              "明天下午三点有空吗？想跟你聊一下产品反馈。"
            </div>
          </div>

          {cases.map((c, idx) => (
            <Reveal key={c.lang} delay={idx * 140}>
              <div className="rounded-[12px] bg-canvas border border-hairline p-5 card-elev-2 flex flex-col gap-3 h-full transition hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-medium text-ink">
                    {c.lang}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                    {c.flag}
                  </span>
                </div>
                <div className="text-[14px] leading-[1.65] text-ink">{c.out}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-14">
          <div className="font-mono text-[11px] tracking-wider text-mute uppercase mb-4">
            {ALL_TARGETS.length} 种目标语言
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_TARGETS.map((t) => (
              <span
                key={t.code}
                className="inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full border border-hairline bg-canvas text-[13px] text-ink whitespace-nowrap card-elev-2"
                title={t.name}
              >
                <span className="font-mono text-[10px] tracking-wider text-mute uppercase">
                  {t.code}
                </span>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
