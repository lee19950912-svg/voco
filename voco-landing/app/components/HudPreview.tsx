// Pure-CSS "pill HUD" preview used as the hero visual.
// Mirrors the actual VoCo HUD: dark pill, 5 white bars that animate to
// imply a live waveform. No JS — just keyframes.
export default function HudPreview() {
  const delays = ["0.0s", "0.15s", "0.3s", "0.45s", "0.6s"];
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-[11px] uppercase tracking-[0.18em] text-mute font-mono">
        听写中
      </div>
      <div className="flex items-center justify-center gap-[6px] h-[44px] w-[120px] rounded-full bg-ink shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)]">
        {delays.map((d, i) => (
          <span
            key={i}
            className="voco-bar inline-block w-[4px] h-[22px] rounded-full bg-white"
            style={{ animationDelay: d }}
          />
        ))}
      </div>
      <div className="text-[13px] text-body max-w-[260px] text-center leading-relaxed">
        右 Alt 按下时浮窗在屏幕底部浮现，松开后字直接出现在光标位置。
      </div>
    </div>
  );
}
