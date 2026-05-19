// Translate feature block. Same shape as FeatureContext — a single input
// line above and three target-language outputs below — but the angle is
// different: same Chinese sentence, three real translations.
//
// Hard-coded translations because the page is static; the actual product
// chooses the target language from the user's settings.
const cases: { lang: string; flag: string; out: string }[] = [
  {
    lang: "English",
    flag: "EN",
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

export default function FeatureTranslate() {
  return (
    <section className="bg-canvas-soft border-y border-hairline">
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:py-32">
        <div className="max-w-[720px]">
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Translate
          </div>
          <h2 className="mt-4 text-[44px] sm:text-[60px] font-normal leading-[1.05] tracking-[-0.02em] text-ink">
            说中文，<br />
            直接出外语。
          </h2>
          <p className="mt-5 text-[17px] leading-[1.65] text-body max-w-[640px]">
            按住右 Alt + 右 Shift 说中文，翻译完直接粘贴。聊国际客户、回英文邮件都用得上。
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

          {cases.map((c) => (
            <div
              key={c.lang}
              className="rounded-[12px] bg-canvas border border-hairline p-5 card-elev-2 flex flex-col gap-3 transition hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-ink">{c.lang}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
                  {c.flag}
                </span>
              </div>
              <div className="text-[14px] leading-[1.65] text-ink">{c.out}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
