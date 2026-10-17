import React from "react";
import { CheckCircle2, Copy, Download, KeyRound, Server, TerminalSquare } from "lucide-react";
import { Button, Card, CopyButton } from "../ui";
import { useI18n } from "../i18n";

export default function ConnectPanel({
  apiKey,
  command,
  ingestUrl,
  onRotate,
  rotating,
}: {
  apiKey?: string;
  command: string;
  ingestUrl: string;
  onRotate?: () => void;
  rotating?: boolean;
}) {
  const { L } = useI18n();
  const [revealed, setRevealed] = React.useState(Boolean(apiKey));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
        <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white text-brand-600">
          <Server size={18} />
        </div>
        <div className="min-w-0 text-[12.5px] leading-6 text-slate-600">
          <p className="font-bold text-slate-800">{L("وكيل النسخ الاحتياطي (Backup Agent)", "Backup agent")}</p>
          <p className="mt-0.5">
            {L(
              "ضع الملف agent/backup_agent.py بجوار البوت على Railway أو أي سيرفر يرى الـ Volume، وشغّله ليرسل نسخة كل 6 ساعات ويستقبل تعديلات اللوحة.",
              "Place agent/backup_agent.py next to the bot on Railway (or any host that can read the volume). It uploads a snapshot every 6h and applies dashboard edits.",
            )}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">{L("أمر التشغيل", "Run command")}</span>
          <CopyButton text={command} />
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-3.5 pe-11 text-start">
          <code dir="ltr" className="block break-all text-[11.5px] leading-6 text-slate-200">
            {command}
          </code>
          <TerminalSquare size={15} className="absolute end-3 top-3.5 text-slate-500" />
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
          {L("الوكيل يستخدم Python القياسي فقط — لا يحتاج تثبيت أي مكتبات إضافية.", "The agent uses the Python standard library only — no extra packages.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card padded={false} className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <KeyRound size={12} /> {L("مفتاح النسخ", "Backup key")}
          </p>
          {apiKey ? (
            <>
              <code dir="ltr" className="mt-2 block break-all rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700">
                {revealed ? apiKey : "bk_…"}
              </code>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRevealed((value) => !value)}>
                  {revealed ? L("إخفاء", "Hide") : L("إظهار", "Reveal")}
                </Button>
                <CopyButton text={apiKey} label={L("نسخ المفتاح", "Copy key")} />
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-[11.5px] leading-6 text-slate-500">
                {L("لأسباب أمنية لا يُعرض المفتاح القديم. أنشئ مفتاحًا جديدًا إذا فقدته.", "Old keys are never shown again. Rotate if you lost it.")}
              </p>
              {onRotate ? (
                <Button size="sm" variant="secondary" className="mt-2" onClick={onRotate} loading={rotating}>
                  {L("تدوير المفتاح", "Rotate key")}
                </Button>
              ) : null}
            </>
          )}
        </Card>

        <Card padded={false} className="p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <Copy size={12} /> {L("عنوان الاستقبال", "Ingest URL")}
          </p>
          <code dir="ltr" className="mt-2 block break-all rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-700">
            {ingestUrl}
          </code>
          <p className="mt-2 text-[11.5px] leading-6 text-slate-500">
            {L("يقبل الأرشيف بصيغة ZIP المُنتجة من scripts/backup_data.py.", "Accepts the ZIP produced by scripts/backup_data.py.")}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/agent/script"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-[12.5px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Download size={14} /> {L("تنزيل ملف الوكيل", "Download agent script")}
        </a>
        <span className="text-[11px] text-slate-400">
          {L("ملف واحد — Python القياسي فقط.", "A single file — Python standard library only.")}
        </span>
      </div>

      {apiKey ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11.5px] leading-6 text-amber-800">
          <CheckCircle2 size={15} className="mt-0.5 flex-none" />
          <span>{L("احتفظ بالمفتاح الآن — لن يُعرض مرة أخرى. يمكنك دائمًا تدويره لاحقًا.", "Store this key now — it will not be shown again. You can rotate it later.")}</span>
        </div>
      ) : null}
    </div>
  );
}
