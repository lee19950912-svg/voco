"use client";

import { useState } from "react";

type Item = { q: string; a: string };

// Ordered by what a new visitor most likely worries about first —
// differentiation (vs system input), then mixed-language, then
// customisation, then privacy, then compatibility, then language coverage.
// First item is expanded by default so the section never looks empty.
const items: Item[] = [
  {
    q: "VoCo 跟系统自带的语音输入有什么区别？",
    a: "系统语音输入主要是「说什么出什么」。VoCo 会在识别后自动整理、润色、翻译，并根据当前软件调整输出风格——比如聊天更自然，邮件更正式，代码编辑器保留技术词。一句话：系统输入只是转写，VoCo 是「转写 + 整理 + 适配场景」。",
  },
  {
    q: "中英文夹着说，能识别出来吗？",
    a: "可以。「打个 PR 给我」「fix 这个 auth bug」这种夹英文术语的句子都能正确转写——中文按中文出，英文术语按英文出，不会强行翻译成中文。",
  },
  {
    q: "可以加专有名词让识别更准吗?",
    a: "可以。设置里的词典页能加你常用的人名、公司名、产品名等。下次说话遇到读音接近的词，会优先按你写的版本输出，识别错的情况会大幅减少。",
  },
  {
    q: "我的语音数据会被保留吗？",
    a: "不会。录音文件识别完即丢，VoCo 不保存任何音频；历史记录只存在你的电脑上，不上传到任何服务器。",
  },
  {
    q: "在哪些软件里能用？",
    a: "几乎所有能接受键盘输入的软件。聊天（微信 / Telegram / Discord / Slack）、文档（Word / Notion / Google Docs）、代码编辑器（Cursor / VS Code）、邮件（Outlook / Gmail）都已经过实测。VoCo 通过模拟剪贴板粘贴写入光标位置，不挑应用。",
  },
  {
    q: "支持哪些语言？",
    a: "中文最准，专门做了中文场景调优；同时支持英语、日语、韩语等十几种语言识别。翻译目标共 17 种，覆盖主流商务和一带一路市场。",
  },
];

export default function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="border-y border-[#E5E7EB]">
      {items.map((it, i) => {
        const open = openIdx === i;
        const isLast = i === items.length - 1;
        return (
          <div
            key={i}
            className={isLast ? "" : "border-b border-[#EFF1F4]"}
          >
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between py-5 px-2 -mx-2 rounded-lg text-left transition-colors hover:bg-[#F7F8FA]"
              aria-expanded={open}
            >
              <span className="text-[16px] sm:text-[17px] font-medium text-ink pr-4">
                {it.q}
              </span>
              <span
                className={`shrink-0 w-7 h-7 rounded-full grid place-items-center transition-all duration-300 ${
                  open
                    ? "rotate-45 border border-[#2563EB] text-[#2563EB] bg-[#2563EB]/[0.08]"
                    : "border border-[#E5E7EB] text-mute"
                }`}
                aria-hidden
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 1v10M1 6h10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>
            {/* grid-template-rows 0fr ↔ 1fr is the cleanest way to animate
                from "no height" to "natural content height" without picking
                an arbitrary max-height. The inner overflow-hidden clips
                during the transition. */}
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: open ? "1fr" : "0fr",
                opacity: open ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="pb-6 pr-12 text-[14.5px] leading-[1.75] text-body">
                  {it.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
