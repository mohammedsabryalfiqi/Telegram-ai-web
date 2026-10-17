import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../ui";
import { useI18n } from "../i18n";

export function LogoMark({ size = 38, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex flex-none items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-br from-sky-400 to-brand-700 text-white shadow-[0_8px_20px_-8px_rgba(0,111,206,0.8)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Sparkles size={size * 0.46} strokeWidth={2.4} className="opacity-95" />
      <span className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-white/20" />
      <span className="absolute -bottom-3 -left-2 h-7 w-7 rounded-full bg-white/10" />
    </div>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { L } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={compact ? 34 : 38} />
      {!compact ? (
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold leading-tight tracking-tight text-slate-900">Alfiqi Control</p>
          <p className="truncate text-[10.5px] font-semibold tracking-wide text-slate-400">
            {L("لوحة إدارة البوت", "Bot operations")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
