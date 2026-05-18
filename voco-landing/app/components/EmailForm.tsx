"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "ok" | "error";

// Inline email signup form. On success we surface the internal-test
// download link immediately — the build is at public/downloads/ so it's
// served as a static asset alongside the page.
const INSTALLER_URL = "/downloads/VoCo_0.1.3_x64-setup.exe";

export default function EmailForm({
  variant = "default",
  buttonLabel = "申请内测",
}: {
  variant?: "default" | "compact";
  buttonLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      // Local-only persistence for now — no API endpoint yet.
      const key = "voco:beta-signups";
      const prev = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
      if (!prev.includes(value)) prev.push(value);
      localStorage.setItem(key, JSON.stringify(prev));
      // Tiny artificial delay so the success state doesn't flash instantly.
      await new Promise((r) => setTimeout(r, 350));
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div
        className={
          variant === "compact"
            ? "text-sm text-body"
            : "rounded-[16px] border border-hairline bg-canvas p-5 card-elev-2 w-full max-w-[520px]"
        }
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 mt-0.5 rounded-full bg-[#0070f3]/10 text-[#0070f3] grid place-items-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7l3.5 3.5L12 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-medium text-ink">
              已收到，谢谢。
            </div>
            <div className="text-[13px] text-body mt-1 leading-relaxed">
              内测版已经可以下载，点下面按钮装上就能用。装完按住右 Alt 说话试试看。
            </div>
            <a
              href={INSTALLER_URL}
              download
              className="mt-4 inline-flex h-11 px-5 items-center gap-2 rounded-full bg-ink text-white text-[14px] font-semibold hover:opacity-90 active:opacity-80 transition"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1v8m0 0L3.5 5.5M7 9l3.5-3.5M2 12h10"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              下载内测版（Windows · 约 20 MB）
            </a>
            <div className="mt-3 text-[12px] text-mute font-mono">
              v0.1.3 · NSIS 安装器 · Windows 10 / 11
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isError = status === "error";

  return (
    <form
      onSubmit={onSubmit}
      className={
        variant === "compact"
          ? "flex flex-col sm:flex-row gap-2 w-full max-w-[460px]"
          : "flex flex-col sm:flex-row gap-2 w-full max-w-[480px]"
      }
    >
      <div className="flex-1 relative">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          aria-invalid={isError}
          className={`w-full h-12 px-4 rounded-full border bg-canvas text-[15px] text-ink placeholder:text-mute outline-none transition focus:border-ink ${
            isError ? "border-[#ee0000]" : "border-hairline"
          }`}
        />
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="h-12 px-6 rounded-full bg-ink text-white text-[15px] font-semibold hover:opacity-90 active:opacity-80 transition disabled:opacity-60 whitespace-nowrap"
      >
        {status === "submitting" ? "提交中…" : buttonLabel}
      </button>
    </form>
  );
}
