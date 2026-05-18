"use client";

import { useState } from "react";

type Item = { q: string; a: string };

const items: Item[] = [
  {
    q: "VoCo 跟系统自带的语音输入有什么区别？",
    a: "VoCo 用的是专门为中文调优的识别 + 一层会看场景的 AI 润色。它会自动去口水话（嗯、那个、对吧）、修标点、按你当前在哪个软件里调整输出风格——在代码编辑器里极简、在聊天软件里口语化、在邮件里书面化。不需要你手动改格式。",
  },
  {
    q: "中英文夹着说，能识别出来吗？",
    a: "可以。「打个 PR 给我」「fix 这个 auth bug」这种夹英文术语的句子都能正确转写——中文按中文出，英文术语按英文出，不会强行翻译成中文。",
  },
  {
    q: "可以加专有名词让识别更准吗？",
    a: "可以。设置里的词典页能加你常用的人名、公司名、产品名等。下次说话遇到读音接近的词，会优先按你写的版本输出，识别错的情况会大幅减少。",
  },
  {
    q: "我的语音数据会被保留吗？",
    a: "不会。录音文件识别完即丢，VoCo 不保存任何音频；历史记录只存在你的电脑上，不上传到任何服务器；如果你不放心默认 API，也可以填自己的 Key 走自己的额度。",
  },
  {
    q: "对硬件有什么要求？",
    a: "Windows 10 或 11，能联网，有麦克风就行。安装包约 20 MB，单 exe 双击即装，不留垃圾。日常使用基本无感占用。",
  },
  {
    q: "什么时候能用上？",
    a: "现在是内测期，主要是我自己在用 + 邀请几位朋友测。如果你也喜欢这个产品，留个邮箱预约——正式版上线时第一时间通知你。",
  },
];

export default function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="divide-y divide-hairline border-y border-hairline">
      {items.map((it, i) => {
        const open = openIdx === i;
        return (
          <div key={i}>
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between py-5 text-left group"
              aria-expanded={open}
            >
              <span className="text-[16px] sm:text-[17px] font-medium text-ink group-hover:opacity-80 transition">
                {it.q}
              </span>
              <span
                className={`ml-4 w-7 h-7 rounded-full border border-hairline grid place-items-center text-mute transition ${
                  open ? "rotate-45 border-ink text-ink" : ""
                }`}
                aria-hidden
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </button>
            {open && (
              <div className="pb-6 pr-10 text-[15px] leading-[1.75] text-body">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
