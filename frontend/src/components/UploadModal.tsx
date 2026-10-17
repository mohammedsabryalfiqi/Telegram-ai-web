import React from "react";
import { CloudUpload, FileArchive, ShieldCheck } from "lucide-react";
import { api, ApiError, fmtBytes } from "../api";
import { useApp } from "../context";
import { useI18n } from "../i18n";
import { Button, Modal } from "../ui";

export default function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const { L, n, timeAgo } = useI18n();
  const { bot, reloadBots, toast } = useApp();
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<any>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setBusy(false);
    setError("");
    setResult(null);
  };
  const close = () => {
    if (busy) return;
    onClose();
    setTimeout(reset, 200);
  };

  const upload = async () => {
    if (!bot || !file) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.upload(`/api/bots/${bot.id}/snapshots/upload`, file);
      setResult(data.snapshot);
      await reloadBots();
      toast(L("تم استلام النسخة الاحتياطية بنجاح", "Snapshot stored successfully"), "success");
      onUploaded?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : L("فشل رفع النسخة", "Upload failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={L("رفع نسخة احتياطية", "Upload a backup")}
      subtitle={L("ارفع ملف ZIP الناتج من scripts/backup_data.py في مستودع البوت.", "Upload the ZIP produced by the bot's scripts/backup_data.py.")}
      size="md"
      footer={
        result ? (
          <Button onClick={close}>{L("تم", "Done")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={upload} disabled={!file} loading={busy} icon={CloudUpload}>
              {L("رفع النسخة", "Upload")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 py-8 text-emerald-600">
            <ShieldCheck size={34} />
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 text-[12.5px]">
            <Row label={L("رقم النسخة", "Snapshot")} value={`#${result.id}`} />
            <Row label={L("الحجم", "Size")} value={fmtBytes(result.size_bytes)} />
            <Row label={L("الحالة", "Status")} value={result.status === "ok" ? L("سليمة ومتحقق منها", "Verified") : result.status} />
            <Row label={L("التاريخ", "Created")} value={timeAgo(result.created_at)} />
            <Row
              label={L("عدد الرسائل", "Messages")}
              value={n(result.row_counts?.messages || 0)}
            />
            <Row label={L("قاعدة المعرفة", "KB items")} value={n(result.row_counts?.kb_items || 0)} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragging ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
              <FileArchive size={22} />
            </div>
            <p className="mt-1 text-sm font-bold text-slate-700">{file ? file.name : L("اسحب ملف ZIP هنا أو اضغط للاختيار", "Drop a ZIP here or click to choose")}</p>
            <p className="text-[11.5px] text-slate-400">
              {file ? fmtBytes(file.size) : L("حتى 2 GB — يُرفض أي ملف غير صالح", "Up to 2 GB — invalid archives are rejected")}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-[11.5px] leading-6 text-slate-500">
            {L(
              "يتم التحقق من سلامة قاعدة البيانات (PRAGMA integrity_check) واستخراج الإحصاءات فور وصول الملف.",
              "The database is integrity-checked and analysed as soon as the file arrives.",
            )}
          </div>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0 last:pb-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}
