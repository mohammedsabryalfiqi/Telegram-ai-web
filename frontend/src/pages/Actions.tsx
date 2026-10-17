import React from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  CloudUpload,
  Download,
  KeyRound,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Zap,
} from "lucide-react";
import { api, downloadUrl, fmtBytes } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  CopyButton,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
} from "../ui";
import UploadModal from "../components/UploadModal";
import ConnectPanel from "../components/ConnectPanel";

export default function ActionsPage() {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, reloadBots, toast } = useApp();
  const onError = usePageError();
  const [snapshots, setSnapshots] = React.useState<any[]>([]);
  const [system, setSystem] = React.useState<any>(null);
  const [changes, setChanges] = React.useState<any[]>([]);
  const [connect, setConnect] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [keyData, setKeyData] = React.useState<any>(null);
  const [busy, setBusy] = React.useState("");
  const [restore, setRestore] = React.useState<any>(null);

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const [snaps, sys, changeData, connectData] = await Promise.all([
        api.get(`/api/bots/${botId}/snapshots`),
        api.get("/api/system").catch(() => null),
        api.get(`/api/bots/${botId}/changes`).catch(() => ({ pending: [] })),
        api.get(`/api/bots/${botId}/connect`).catch(() => null),
      ]);
      setSnapshots(snaps.snapshots || []);
      setSystem(sys);
      setChanges(changeData.pending || []);
      setConnect(connectData);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const latest = snapshots[0];

  const verifyLatest = async () => {
    if (!latest) return;
    setBusy("verify");
    try {
      const result = await api.post(`/api/snapshots/${latest.id}/verify`);
      toast(result.ok ? L("النسخة سليمة ✔", "Snapshot verified ✔") : L("النسخة تالفة", "Snapshot is corrupt"), result.ok ? "success" : "error");
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setBusy("");
    }
  };

  const restoreLatest = async () => {
    if (!latest) return;
    setBusy("restore");
    try {
      const result = await api.post(`/api/snapshots/${latest.id}/restore`, { note: "quick action" });
      setRestore({ ...result, snapshot: latest });
    } catch (error) {
      onError(error);
    } finally {
      setBusy("");
    }
  };

  const rotate = async () => {
    setBusy("rotate");
    try {
      const result = await api.post(`/api/bots/${botId}/key`);
      setKeyData(result);
      setConnectOpen(false);
      toast(L("تم تدوير المفتاح", "Key rotated"), "success");
      await reloadBots();
    } catch (error) {
      onError(error);
    } finally {
      setBusy("");
    }
  };

  const ackChanges = async () => {
    if (!changes.length) return;
    setBusy("ack");
    try {
      await api.post(`/api/bots/${botId}/changes/ack`, { ids: changes.map((change) => change.id) });
      setChanges([]);
      toast(L("تم وسم التغييرات كمطبقة", "Changes marked as applied"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy("");
    }
  };

  const downloadSql = () => {
    const content = changes.map((change) => `-- #${change.id} ${change.description}\n${change.sql}\n`).join("\n");
    const blob = new Blob([content], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `alfiqi-changes-${new Date().toISOString().slice(0, 10)}.sql`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const actions = [
    {
      id: "upload",
      title: L("رفع نسخة الآن", "Upload a snapshot"),
      desc: L("ارفع ZIP يدويًا من جهازك — مفيد عند نقل السيرفر.", "Upload a ZIP manually — useful when migrating servers."),
      icon: CloudUpload,
      tone: "bg-brand-50 text-brand-600",
      label: L("اختيار ملف", "Choose file"),
      onClick: () => setUploadOpen(true),
      disabled: false,
    },
    {
      id: "verify",
      title: L("التحقق من آخر نسخة", "Verify the latest snapshot"),
      desc: L("فحص CRC للأرشيف وPRAGMA integrity_check لقاعدة SQLite.", "Archive CRC and SQLite PRAGMA integrity_check."),
      icon: ShieldCheck,
      tone: "bg-emerald-50 text-emerald-600",
      label: L("فحص", "Run check"),
      onClick: verifyLatest,
      disabled: !latest,
    },
    {
      id: "restore",
      title: L("تجهيز استعادة", "Prepare a restore"),
      desc: L("حزمة كاملة مع دليل عربي — جاهزة قبل حدوث أي مشكلة.", "A complete bundle with a guide — ready before trouble hits."),
      icon: ArchiveRestore,
      tone: "bg-amber-50 text-amber-600",
      label: L("استعادة", "Restore"),
      onClick: restoreLatest,
      disabled: !latest,
    },
    {
      id: "key",
      title: L("تدوير مفتاح الوكيل", "Rotate agent key"),
      desc: L("مفتاح جديد فورًا؛ المفتاح القديم يتوقف عن العمل.", "A new key immediately; the old one stops working."),
      icon: KeyRound,
      tone: "bg-violet-50 text-violet-600",
      label: L("تدوير", "Rotate"),
      onClick: rotate,
      disabled: false,
    },
    {
      id: "connect",
      title: L("ربط الوكيل بالسيرفر", "Connect the agent"),
      desc: L("انسخ أمر التشغيل وضعه داخل حاوية البوت.", "Copy the run command into the bot container."),
      icon: PlugZap,
      tone: "bg-sky-50 text-sky-600",
      label: L("عرض الأمر", "View command"),
      onClick: () => setConnectOpen(true),
      disabled: false,
    },
    {
      id: "download",
      title: L("تنزيل آخر أرشيف", "Download the latest archive"),
      desc: L("نسخة ZIP كاملة تصلح للاستعادة على أي سيرفر.", "A full ZIP you can restore on any host."),
      icon: Download,
      tone: "bg-slate-100 text-slate-600",
      label: L("تنزيل", "Download"),
      onClick: () => latest && downloadUrl(`/api/snapshots/${latest.id}/download`),
      disabled: !latest,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("إجراءات سريعة", "Quick actions")}
        subtitle={L("كل ما تحتاجه للنسخ والاستعادة والمزامنة في مكان واحد.", "Everything for backup, restore and sync in one place.")}
        actions={<Badge tone="green" dot>{L("النظام يعمل", "System healthy")}</Badge>}
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Card key={action.id} className="flex flex-col">
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${action.tone}`}>
                <action.icon size={20} />
              </div>
              <div>
                <p className="text-[13px] font-extrabold text-slate-900">{action.title}</p>
                <p className="mt-1 text-[11px] leading-6 text-slate-500">{action.desc}</p>
              </div>
            </div>
            <div className="mt-auto pt-4">
              <Button size="sm" variant="secondary" onClick={action.onClick} disabled={action.disabled} loading={busy === action.id}>
                {action.label}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("تغييرات معلّقة", "Pending changes")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("تُطبَّق تلقائيًا عبر الوكيل، أو نزّلها كملف SQL.", "Applied by the agent, or download them as SQL.")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {changes.length ? (
                <>
                  <Button size="sm" variant="secondary" icon={Download} onClick={downloadSql}>{L("تنزيل SQL", "Download SQL")}</Button>
                  <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={ackChanges} loading={busy === "ack"}>{L("وسم كمطبقة", "Mark applied")}</Button>
                </>
              ) : null}
            </div>
          </div>
          {changes.length ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {changes.map((change) => (
                <div key={change.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11.5px] font-semibold text-slate-700">{change.description}</p>
                      <p className="mt-0.5 text-[9.5px] text-slate-400">#{change.id} · {timeAgo(change.created_at)}</p>
                    </div>
                    <CopyButton text={change.sql} label="SQL" />
                  </div>
                  <pre dir="ltr" className="mt-2 max-h-24 overflow-auto rounded-lg bg-slate-50 p-2.5 text-[10px] leading-5 text-slate-500">{change.sql}</pre>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5"><EmptyState compact icon={CheckCircle2} title={L("لا تغييرات معلّقة", "No pending changes")} description={L("كل تعديلات اللوحة وصلت للبوت.", "All dashboard edits reached the bot.")} /></div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle title={L("حالة النظام", "System status")} action={<Server size={16} className="text-slate-400" />} />
            <div className="space-y-2 text-[11.5px]">
              <Row label={L("وقت التشغيل", "Server time")} value={system ? new Date(system.server_time).toLocaleTimeString() : "—"} />
              <Row label={L("النسخ المحلية", "Local backups")} value={system?.local_backups || "—"} />
              <Row label={L("مساحة البيانات", "Snapshots size")} value={system?.snapshot_human || "—"} />
              <Row label={L("مساحة حرة", "Disk free")} value={system?.disk_free || "—"} />
              <Row label={L("S3", "S3")} value={system?.s3_configured ? (system.s3_bucket || L("متصل", "On")) : L("غير مهيأ", "Not configured")} />
              <Row label={L("آخر نسخة", "Latest snapshot")} value={latest ? `${timeAgo(latest.created_at)} · ${fmtBytes(latest.size_bytes)}` : "—"} />
            </div>
          </Card>

          <Card>
            <CardTitle title={L("أمر الوكيل", "Agent command")} subtitle={L("ضعه في حاوية البوت", "Paste it in the bot container")} />
            <div className="rounded-xl bg-slate-950 p-3.5 pe-10">
              <code dir="ltr" className="block break-all text-[10px] leading-5 text-slate-200">{connect?.agent_command || `python backup_agent.py --site ${window.location.origin} --key bk_… --storage /app/storage`}</code>
            </div>
            <div className="mt-2 flex justify-end"><CopyButton text={connect?.agent_command || ""} /></div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[10.5px] leading-5 text-brand-900">
              <Zap size={13} className="mt-0.5 flex-none" />
              {L("يمكن تشغيله كخدمة دائمة أو Cron كل 6 ساعات.", "Run it as a daemon or a 6-hour cron job.")}
            </div>
          </Card>
        </div>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { void load(); void reloadBots(); }} />

      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={L("ربط الوكيل", "Connect the agent")}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setConnectOpen(false)}>{L("إغلاق", "Close")}</Button>}
      >
        <ConnectPanel
          command={connect?.agent_command || ""}
          ingestUrl={connect?.ingest_url || `${window.location.origin}/api/ingest`}
          onRotate={rotate}
          rotating={busy === "rotate"}
        />
      </Modal>

      <Modal
        open={Boolean(keyData)}
        onClose={() => setKeyData(null)}
        title={L("المفتاح الجديد", "New backup key")}
        subtitle={L("احفظه الآن — لن يُعرض مرة أخرى.", "Save it now — it will not be shown again.")}
        size="lg"
        footer={<Button onClick={() => setKeyData(null)}>{L("تم", "Done")}</Button>}
      >
        {keyData ? <ConnectPanel apiKey={keyData.api_key} command={keyData.agent_command} ingestUrl={keyData.ingest_url} /> : null}
      </Modal>

      <Modal
        open={Boolean(restore)}
        onClose={() => setRestore(null)}
        title={L("حزمة الاستعادة جاهزة", "Restore bundle ready")}
        subtitle={restore?.snapshot ? `#${restore.snapshot.id} · ${restore.filename}` : ""}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestore(null)}>{L("إغلاق", "Close")}</Button>
            {restore ? <Button icon={Download} onClick={() => downloadUrl(`/api/snapshots/${restore.snapshot.id}/restore-package`)}>{L("تنزيل الحزمة", "Download bundle")}</Button> : null}
          </>
        }
      >
        {restore ? <pre dir="ltr" className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-[10.5px] leading-6 text-slate-200">{restore.guide}</pre> : null}
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="max-w-[170px] truncate font-semibold text-slate-700" dir="auto">{value}</span>
    </div>
  );
}
