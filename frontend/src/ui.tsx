import React from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useI18n } from "./i18n";

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "success";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  icon: Icon,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  loading?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-200 disabled:bg-brand-300",
    secondary:
      "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-200",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-200",
    dark: "bg-slate-900 text-white hover:bg-slate-800",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  const sizes = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-lg",
    md: "h-10 px-4 text-[13.5px] gap-2 rounded-xl",
    lg: "h-11 px-5 text-sm gap-2 rounded-xl",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn("card", padded && "p-5", className)}>{children}</div>;
}

export function CardTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue" | "violet";
  className?: string;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-brand-50 text-brand-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("chip", tones[tone], className)}>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-brand-500")} /> : null}
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</div> : null}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[13.5px] leading-7 text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <span className="label">{label}</span> : null}
      {children}
      {hint ? <p className="mt-1.5 text-[11.5px] leading-5 text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-on={checked ? "true" : "false"}
      className={cn("switch", disabled && "opacity-50")}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  const { L } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Loader2 size={26} className="animate-spin text-brand-500" />
      <span className="text-xs">{label || L("جارٍ التحميل…", "Loading…")}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center", compact ? "py-8" : "py-14")}>
      {Icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
          <Icon size={20} />
        </div>
      ) : null}
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-6 text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-float animate-fade-up sm:rounded-3xl", widths[size])}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p> : null}
          </div>
          <button className="icon-btn -me-1" onClick={onClose} aria-label="close">
            <X size={17} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  loading,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
}) {
  const { L } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{L("إلغاء", "Cancel")}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel || L("تأكيد", "Confirm")}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl", danger ? "bg-rose-50 text-rose-500" : "bg-brand-50 text-brand-600")}>
          <AlertTriangle size={18} />
        </div>
        <p className="pt-1 text-[13px] leading-7 text-slate-500">{description}</p>
      </div>
    </Modal>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ id: string; label: React.ReactNode; count?: number }>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition",
            value === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {item.label}
          {typeof item.count === "number" ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", value === item.id ? "bg-slate-100 text-slate-600" : "bg-slate-200/70 text-slate-500")}>
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { L } = useI18n();
  return (
    <div className={cn("relative", className)}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || L("بحث…", "Search…")}
        className="input h-9 w-full rounded-xl py-0 pe-3 ps-9 text-[12.5px]"
      />
      <svg className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { L } = useI18n();
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={copied ? Check : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const area = document.createElement("textarea");
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand("copy");
          area.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? L("تم النسخ", "Copied") : label || L("نسخ", "Copy")}
    </Button>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { L } = useI18n();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
      <span>{L("صفحة", "Page")} {page} {L("من", "of")} {pages}</span>
      <div className="flex items-center gap-1">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronRight size={16} /></button>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronLeft size={16} /></button>
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  change,
  invert = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  tone?: "blue" | "green" | "amber" | "violet";
  change?: number;
  invert?: boolean;
}) {
  const tones = {
    blue: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-slate-400">{label}</p>
          <p className="mt-2 text-[28px] font-extrabold leading-none tracking-tight text-slate-900">{value}</p>
        </div>
        {Icon ? <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}><Icon size={18} /></div> : null}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
        {typeof change === "number" ? (
          <span className={cn("font-bold", (change >= 0) !== invert ? "text-emerald-600" : "text-rose-500")}>
            {change >= 0 ? "+" : ""}
            {change}%
          </span>
        ) : null}
        {hint ? <span className="text-slate-400">{hint}</span> : null}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">{children}</p>;
}
