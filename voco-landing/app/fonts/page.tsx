// Font-candidate preview page. Renders the same hero block four times,
// each in a different font family, so the same content can be compared
// one-to-one before committing the whole landing page to a font.
//
// Pick one and tell me the number — I'll swap the global font.

const candidates: {
  id: string;
  num: string;
  name: string;
  family: string;
  blurb: string;
  font: string;
  note: string;
}[] = [
  {
    id: "current",
    num: "01",
    name: "Geist + 系统中文",
    family: "Geist · PingFang SC · Microsoft YaHei",
    blurb:
      "现状方案。Geist 是 Vercel 自家字体，几何工程师感强。中文走系统字体 fallback（Mac 用苹方、Windows 用微软雅黑），不额外加载。",
    font: "font-cand-current",
    note: "✓ 已激活 / 加载最快 / 跨系统观感略有差异",
  },
  {
    id: "inter-noto",
    num: "02",
    name: "Inter + 思源黑体",
    family: "Inter · Noto Sans SC",
    blurb:
      "Inter 是 Linear、GitHub、Vercel 等都用过的「国际感」字体；中文配思源黑体（Noto Sans SC，谷歌+Adobe 联合开发，开源最佳）。统一感强，所有用户看到的字体完全一致。",
    font: "font-cand-inter-noto",
    note: "+ 加载约 200 KB / 跨平台一致",
  },
  {
    id: "harmony",
    num: "03",
    name: "HarmonyOS Sans SC",
    family: "HarmonyOS Sans SC（华为出品）",
    blurb:
      "华为为 HarmonyOS 设计的免费商用字体，专为屏幕显示优化。字形偏圆润、亲和力高，「国产科技感」明显——比思源黑体更现代一点。",
    font: "font-cand-harmony",
    note: "+ 加载约 250 KB / 中国科技品牌感",
  },
  {
    id: "alibaba",
    num: "04",
    name: "阿里巴巴普惠体 3",
    family: "AlibabaPuHuiTi 3 · 65 Medium",
    blurb:
      "阿里巴巴免费商用字体（最新 3.0 版本）。字形挺拔、字重充足，企业级和商业落地页常用。比 HarmonyOS Sans 更硬朗一点，更有商业感。",
    font: "font-cand-alibaba",
    note: "+ 加载约 280 KB / 商业品牌感",
  },
];

export default function FontsPage() {
  return (
    <main className="min-h-screen">
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
            Fonts
          </div>
          <h1 className="mt-4 text-[40px] sm:text-[52px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            挑一个字体方案。
          </h1>
          <p className="mt-5 text-[16px] leading-[1.7] text-body max-w-[640px]">
            下面 4 个方案用了完全一样的内容，只换字体。看哪个你最顺眼，告诉我编号（01 / 02 / 03 / 04）我就把整个落地页切到那个字体。
          </p>
          <p className="mt-3 text-[13px] text-mute">
            提示：03 / 04 是外部 CDN 字体，首次加载可能慢 1-2 秒，刷新一次就会缓存好。
          </p>
        </div>
      </section>

      {candidates.map((c) => (
        <FontCard key={c.id} c={c} />
      ))}

      <div className="mx-auto max-w-[1200px] px-6 py-16 text-center">
        <a
          href="/"
          className="inline-flex h-11 px-6 items-center text-[14px] font-medium text-white bg-ink rounded-full hover:opacity-90 transition"
        >
          回到主页
        </a>
      </div>
    </main>
  );
}

function FontCard({ c }: { c: (typeof candidates)[number] }) {
  return (
    <section className={`border-b border-hairline ${c.font}`}>
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        {/* Meta row */}
        <div className="flex items-baseline justify-between mb-12 font-cand-current">
          <div>
            <div className="font-mono text-[12px] tracking-wider text-mute uppercase">
              方案 {c.num}
            </div>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-ink">
              {c.name}
            </h2>
            <div className="mt-1 text-[12px] font-mono text-mute">{c.family}</div>
          </div>
          <div className="text-[12px] font-mono text-mute text-right max-w-[360px]">
            {c.note}
          </div>
        </div>

        {/* Same content rendered in this font */}
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 h-7 rounded-full bg-canvas-soft border border-hairline text-[12px] font-mono text-body">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0070f3]" />
              内测中 · Windows 10 / 11
            </div>
            <h3 className="mt-7 text-[44px] sm:text-[56px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
              说出来，<br />写下去。
            </h3>
            <p className="mt-6 max-w-[520px] text-[17px] leading-[1.6] text-body">
              按住右 Alt 说话，松开后文字直接出现在光标位置。
              聊天、写代码、回邮件，任意软件都能用。
              <span className="text-ink font-medium">
                为中文母语者重新设计的语音输入。
              </span>
            </p>
            <div className="mt-7 flex gap-3">
              <button className="h-12 px-6 rounded-full bg-ink text-white text-[15px] font-medium">
                申请内测
              </button>
              <button className="h-12 px-6 rounded-full bg-canvas border border-hairline text-ink text-[15px] font-medium">
                了解更多
              </button>
            </div>
          </div>

          <div className="rounded-[16px] bg-canvas border border-hairline p-6 card-elev-3">
            <div className="font-mono text-[11px] tracking-wider text-mute mb-3 font-cand-current">
              {c.blurb}
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono text-mute uppercase tracking-wider mb-1 font-cand-current">
                  说
                </div>
                <div className="text-[14px] leading-relaxed text-body italic">
                  嗯那个、帮我把这个 PR 改成 draft 状态吧 啊不对 changed back 就行
                </div>
              </div>
              <div className="border-t border-hairline" />
              <div>
                <div className="text-[10px] font-mono text-ink uppercase tracking-wider mb-1 font-cand-current">
                  出
                </div>
                <div className="text-[15px] leading-relaxed text-ink font-medium">
                  帮我把这个 PR 改成 draft 状态。改回 changed back 就行。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
