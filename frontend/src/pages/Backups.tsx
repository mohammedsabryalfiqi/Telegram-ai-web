import React from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Cloud,
  Copy,
  DatabaseBackup,
  Download,
  FileArchive,
  HardDrive,
  KeyRound,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { api, downloadUrl, fmtBytes } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
  cn,
} from "../ui";
import UploadModal from "../components/UploadModal";
import ConnectPanel from "../components/ConnectPanel";

export default function BackupsPage() {
  const { L, n, timeAgo, date } = useI18n();
  const { bot, botId, reloadBots, toast, user } = useApp();
  const onError = usePageError();
  const [snapshots, setSnapshots] = React.useState<any[]>([]);
  const [settings, setSettings] = React.useState<any>(null);
  const [system, setSystem] = React.useState<any>(null);
  const [changes, setChanges] = React.useState<any[]>([]);
  const [restores, setRestores] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [pendingVerify, setPendingVerify] = React.useState<number | null>(null);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [restoreData, setRestoreData] = React.useState<any>(null);
  const [newKey, setNewKey] = React.useState<any>(null);
  const [rotating, setRotating] = React.useState(false);

  const load = React.useCallback(
    async (silent = false) => {
      if (!botId) return;
      if (!silent) setLoading(true);
      try {
        const [snaps, appSettings, systemInfo, changeData, restoreData] = await Promise.all([
          api.get(`/api/bots/${botId}/snapshots`),
          api.get("/api/settings"),
          api.get("/api/system").catch(() => null),
          api.get(`/api/bots/${botId}/changes`).catch(() => ({ pending: [] })),
          api.get(`/api/bots/${botId}/restores`).catch(() => ({ restores: [] })),
        ]);
        setSnapshots(snaps.snapshots || []);
        setSettings(appSettings);
        setSystem(systemInfo);
        setChanges(changeData.pending || []);
        setRestores(restoreData.restores || []);
      } catch (error) {
        onError(error);
      } finally {
        setLoading(false);
      }
    },
    [botId, onError],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const verify = async (snapshot: any) => {
    setPendingVerify(snapshot.id);
    try {
      const result = await api.post(`/api/snapshots/${snapshot.id}/verify`);
      toast(result.ok ? L("النسخة سليمة ✔", "Snapshot verified ✔") : L("فشل التحقق من السلامة", "Integrity check failed"), result.ok ? "success" : "error");
      await load(true);
    } catch (error) {
      onError(error);
    } finally {
      setPendingVerify(null);
    }
  };

  const openRestore = async (snapshot: any) => {
    setBusy(true);
    try {
      const result = await api.post(`/api/snapshots/${snapshot.id}/restore`, { note: "restore from dashboard" });
      setRestoreData({ ...result, snapshot });
      await load(true);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      await api.del(`/api/snapshots/${deleteId}`);
      setDeleteId(null);
      toast(L("تم حذف النسخة", "Snapshot deleted"), "success");
      await load(true);
      await reloadBots();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const result = await api.post(`/api/bots/${botId}/key`);
      setNewKey(result);
      setConnectOpen(false);
      toast(L("تم تدوير المفتاح — انسخ الجديد الآن", "Key rotated — copy the new one now"), "success");
      await reloadBots();
    } catch (error) {
      onError(error);
    } finally {
      setRotating(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const latest = snapshots[0];
  const storage = settings?.storage || {};
  const localOnly = !storage.s3_enabled;
  const lastBackupAt = bot.last_backup_at || latest?.created_at;
  const nextDue = lastBackupAt ? new Date(new Date(lastBackupAt).getTime() + bot.backup_interval_hours * 3_600_000) : null;
  const restoreCommand = `python backup_agent.py --restore ${latest?.filename || "<snapshot>.zip"} --storage /app/storage`;

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("النسخ الاحتياطي والاستعادة", "Backups & restore")}
        subtitle={L("مصدر ثانٍ مستقل لبيانات البوت — قاعدة SQLite، الملفات، ومخزن المتجهات.", "An independent second source for bot data — SQLite database, uploads and vector store.")}
        actions={
          <>
            <Button variant="secondary" icon={RotateCw} onClick={() => setConnectOpen(true)}>{L("ربط الوكيل", "Connect agent")}</Button>
            <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>{L("رفع نسخة", "Upload snapshot")}</Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("آخر نسخة", "Latest snapshot")}</p>
            <p className="mt-1 text-[24px] font-extrabold leading-none text-slate-900">{latest ? `#${latest.id}` : "—"}</p>
            <p className="mt-1.5 text-[10.5px] text-slate-400">{latest ? `${timeAgo(latest.created_at)} · ${fmtBytes(latest.size_bytes)}` : L("لم تصل نسخ بعد", "No snapshots yet")}</p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", latest ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
            <DatabaseBackup size={18} />
          </div>
        </Card>
        <Card className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("التخزين", "Storage")}</p>
            <p className="mt-1 text-[24px] font-extrabold leading-none text-slate-900">{storage.local_usage_human || "—"}</p>
            <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-slate-400">
              {storage.s3_enabled ? <Cloud size={11} /> : <HardDrive size={11} />}
              {storage.s3_enabled ? `${L("محلي +", "Local +")} ${storage.s3_bucket}` : L("قرص السيرفر فقط", "Server disk only")}
            </p>
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", storage.s3_enabled ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
            {storage.s3_enabled ? <Cloud size={18} /> : <Server size={18} />}
          </div>
        </Card>
        <Card className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("الجدول", "Schedule")}</p>
            <p className="mt-1 text-[24px] font-extrabold leading-none text-slate-900">{L(`كل ${bot.backup_interval_hours} س`, `Every ${bot.backup_interval_hours}h`)}</p>
            <p className="mt-1.5 text-[10.5px] text-slate-400">{nextDue ? `${L("التالي", "Next")}: ${date(nextDue.toISOString(), true)}` : L("بانتظار الوكيل", "Waiting for agent")}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><RefreshCw size={18} /></div>
        </Card>
        <Card className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("التغييرات المعلّقة", "Pending changes")}</p>
            <p className="mt-1 text-[24px] font-extrabold leading-none text-slate-900">{n(changes.length)}</p>
            <p className="mt-1.5 text-[10.5px] text-slate-400">{changes.length ? L("ستُزامَن في الدورة القادمة", "Synced on the next cycle") : L("كل شيء مزامَن", "Everything is in sync")}</p>
          </div>
          <Badge tone={changes.length ? "amber" : "green"} dot>{changes.length ? L("قيد الانتظار", "Queued") : L("متزامن", "Synced")}</Badge>
        </Card>
      </div>

      <Card className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck size={20} /></div>
            <div>
              <p className="text-[13px] font-extrabold text-slate-900">{L("جاهز للاستعادة في أي وقت", "Ready to restore anytime")}</p>
              <p className="mt-1 max-w-xl text-[11.5px] leading-6 text-slate-500">
                {L(
                  "حزمة الاستعادة تحتوي الأرشيف + دليلًا عربيًا خطوة بخطوة. تعمل حتى لو كانت الخدمة أو الـ Volume قد فُقد بالكامل.",
                  "The restore bundle contains the archive plus a bilingual step-by-step guide. It works even if the service or its volume is gone.",
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {latest ? (
              <>
                <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadUrl(`/api/snapshots/${latest.id}/download`)}>{L("تنزيل الأرشيف", "Download archive")}</Button>
                <Button size="sm" icon={ArchiveRestore} onClick={() => void openRestore(latest)}>{L("استعادة الآن", "Restore now")}</Button>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("سجل النسخ", "Snapshot history")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{n(snapshots.length)} {L("نسخة محفوظة", "stored snapshots")} · {storage.local_usage_human || "0 B"}</p>
            </div>
            <div className="flex items-center gap-2">
              {localOnly ? <Badge tone="amber">{L("بدون S3", "No S3")}</Badge> : <Badge tone="green">{L("S3 متصل", "S3 enabled")}</Badge>}
            </div>
          </div>
          {snapshots.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-start">
                <thead className="table-head">
                  <tr>
                    <th className="px-5 py-2.5 text-start font-bold">{L("النسخة", "Version")}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{L("التاريخ", "Created")}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{L("الحجم", "Size")}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{L("المصدر", "Source")}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{L("الحالة", "Status")}</th>
                    <th className="px-5 py-2.5 text-end font-bold">{L("إجراءات", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileArchive size={13} /></span>
                          <div>
                            <p className="text-[12px] font-bold text-slate-800">#{snapshot.id}</p>
                            <p className="max-w-[150px] truncate text-[9.5px] text-slate-400" dir="ltr">{snapshot.filename}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{date(snapshot.created_at, true)}</td>
                      <td className="px-3 py-3 text-[11px] font-semibold text-slate-600">{fmtBytes(snapshot.size_bytes)}</td>
                      <td className="px-3 py-3">
                        <Badge tone={snapshot.source === "agent" ? "blue" : snapshot.source === "demo" ? "violet" : "slate"}>{snapshot.source}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge snapshot={snapshot} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button className="icon-btn" title={L("تنزيل", "Download")} onClick={() => downloadUrl(`/api/snapshots/${snapshot.id}/download`)}>
                            <Download size={14} />
                          </button>
                          <button className="icon-btn" title={L("حزمة الاستعادة", "Restore bundle")} onClick={() => downloadUrl(`/api/snapshots/${snapshot.id}/restore-package`)}>
                            <ArchiveRestore size={14} />
                          </button>
                          <button className="icon-btn" title={L("تحقق من السلامة", "Verify integrity")} onClick={() => void verify(snapshot)} disabled={pendingVerify === snapshot.id}>
                            <ShieldCheck size={14} className={pendingVerify === snapshot.id ? "animate-pulse text-brand-500" : ""} />
                          </button>
                          <button className="icon-btn" title={L("استعادة", "Restore")} onClick={() => void openRestore(snapshot)}>
                            <RefreshCw size={14} />
                          </button>
                          <button className="icon-btn text-slate-300 hover:text-rose-500" title={L("حذف", "Delete")} onClick={() => setDeleteId(snapshot.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={DatabaseBackup}
                title={L("لا نسخ احتياطية بعد", "No snapshots yet")}
                description={L("شغّل الوكيل على Railway أو ارفع ملف ZIP يدويًا.", "Run the agent on Railway or upload a ZIP manually.")}
                action={<Button size="sm" onClick={() => setUploadOpen(true)} icon={UploadCloud}>{L("رفع نسخة", "Upload")}</Button>}
              />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle
              title={L("حزمة الاستعادة", "Restore bundle")}
              subtitle={L("استعادة كاملة لقاعدة البيانات والملفات", "Full database & file restore")}
              action={<Badge tone="blue">{L("جاهزة", "Ready")}</Badge>}
            />
            <div className="rounded-xl bg-slate-950 p-3.5 pe-10 text-start">
              <code dir="ltr" className="block break-all text-[10.5px] leading-5 text-slate-200">{restoreCommand}</code>
              <CopyButton text={restoreCommand} />
            </div>
            <div className="mt-3 space-y-2 text-[11px] leading-6 text-slate-500">
              <p>{L("١. أوقف خدمة البوت مؤقتًا من Railway.", "1. Pause the bot service on Railway.") }</p>
              <p>{L("٢. نزّل الأرشيف وفكّه داخل /app/storage.", "2. Download and extract inside /app/storage.") }</p>
              <p>{L("٣. شغّل البوت وتأكد من PRAGMA integrity_check.", "3. Start the bot and run PRAGMA integrity_check.") }</p>
            </div>
            {latest ? (
              <Button size="sm" variant="secondary" className="mt-3 w-full" icon={Download} onClick={() => downloadUrl(`/api/snapshots/${latest.id}/restore-package`)}>
                {L("تنزيل الحزمة الكاملة", "Download full bundle")}
              </Button>
            ) : null}
          </Card>

          <Card>
            <CardTitle
              title={L("التخزين السحابي", "Object storage")}
              subtitle={storage.s3_enabled ? L("نسخة ثالثة خارج السيرفر", "A third copy off the server") : L("غير مهيأ بعد", "Not configured yet")}
              action={<Badge tone={storage.s3_enabled ? "green" : "amber"} dot>{storage.s3_enabled ? L("متصل", "On") : L("محلي", "Local")}</Badge>}
            />
            <div className="space-y-2 text-[11.5px]">
              <div className="flex items-center justify-between border-b border-slate-100 py-2">
                <span className="text-slate-400">{L("المزوّد", "Provider")}</span>
                <span className="font-semibold text-slate-700">S3 / R2 / B2</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 py-2">
                <span className="text-slate-400">{L("الحاوية", "Bucket")}</span>
                <span className="max-w-[140px] truncate font-semibold text-slate-700" dir="ltr">{storage.s3_bucket || "—"}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">{L("آخر فحص", "Local usage")}</span>
                <span className="font-semibold text-slate-700">{system?.local_backups || storage.local_usage_human}</span>
              </div>
            </div>
            <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => (window.location.href = "/app/settings")}>
              {L("إعداد التخزين", "Configure storage")}
            </Button>
          </Card>
        </div>
      </div>

      {changes.length ? (
        <Card className="mb-5">
          <CardTitle
            title={L("تغييرات في انتظار المزامنة", "Changes waiting to sync")}
            subtitle={L("سيطبّقها الوكيل على قاعدة البوت في الدورة القادمة.", "The agent applies them to the bot database on its next cycle.")}
            action={<Badge tone="amber">{n(changes.length)}</Badge>}
          />
          <div className="space-y-2">
            {changes.slice(0, 5).map((change: any) => (
              <div key={change.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold text-slate-700">{change.description}</p>
                  <p className="mt-0.5 text-[9.5px] text-slate-400">{timeAgo(change.created_at)}</p>
                </div>
                <CopyButton text={change.sql} label={L("SQL", "SQL")} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {restores.length ? (
        <Card>
          <CardTitle title={L("سجل الاستعادة", "Restore history")} subtitle={L("آخر عمليات تجهيز الاستعادة", "Recent restore preparations")} />
          <div className="space-y-2">
            {restores.slice(0, 4).map((restore: any) => (
              <div key={restore.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px]">
                <span className="inline-flex items-center gap-2 text-slate-600"><ArchiveRestore size={13} className="text-brand-500" /> {L("نسخة", "Snapshot")} #{restore.snapshot_id}</span>
                <span className="text-slate-400">{timeAgo(restore.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { void load(true); void reloadBots(); }} />

      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={L("ربط وكيل النسخ", "Connect the backup agent")}
        subtitle={L("الوكيل يرسل النسخ ويستقبل تعديلات اللوحة.", "The agent uploads snapshots and pulls dashboard edits.")}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setConnectOpen(false)}>{L("إغلاق", "Close")}</Button>}
      >
        <ConnectPanel
          command={`python backup_agent.py --site ${window.location.origin} --key ${bot.key_prefix || "bk_…"}… --storage /app/storage --interval ${bot.backup_interval_hours * 3600} --pull-changes 60`}
          ingestUrl={`${window.location.origin}/api/ingest`}
          onRotate={rotate}
          rotating={rotating}
        />
      </Modal>

      <Modal
        open={Boolean(newKey)}
        onClose={() => setNewKey(null)}
        title={L("مفتاح النسخ الجديد", "Your new backup key")}
        subtitle={L("يُعرض مرة واحدة فقط.", "Shown only once.")}
        size="lg"
        footer={<Button onClick={() => setNewKey(null)}>{L("تم", "Done")}</Button>}
      >
        {newKey ? <ConnectPanel apiKey={newKey.api_key} command={newKey.agent_command} ingestUrl={newKey.ingest_url} /> : null}
      </Modal>

      <Modal
        open={Boolean(restoreData)}
        onClose={() => setRestoreData(null)}
        title={L("استعادة من نسخة احتياطية", "Restore from a snapshot")}
        subtitle={L("تم تجهيز الحزمة. اتبع الخطوات بهدوء.", "The bundle is ready. Follow the steps carefully.")}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreData(null)}>{L("إغلاق", "Close")}</Button>
            {restoreData ? (
              <>
                <Button variant="secondary" icon={Download} onClick={() => downloadUrl(`/api/snapshots/${restoreData.snapshot.id}/download`)}>{L("تنزيل الأرشيف", "Download archive")}</Button>
                <Button icon={ArchiveRestore} onClick={() => downloadUrl(`/api/snapshots/${restoreData.snapshot.id}/restore-package`)}>{L("تنزيل الحزمة", "Download bundle")}</Button>
              </>
            ) : null}
          </>
        }
      >
        {restoreData ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11.5px] leading-6 text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 flex-none" />
              {L(
                "أوقف خدمة البوت قبل الاستعادة حتى لا تُكتب بيانات جديدة فوق الملف المستعاد.",
                "Pause the bot before restoring so it cannot write new data over the restored file.",
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label={L("النسخة", "Snapshot")} value={`#${restoreData.snapshot.id}`} />
              <Fact label={L("الحجم", "Size")} value={fmtBytes(restoreData.size_bytes)} />
              <Fact label={L("الملف", "File")} value={restoreData.filename} mono />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">{L("دليل الاستعادة", "Restore guide")}</span>
                <CopyButton text={restoreData.guide} />
              </div>
              <pre dir="ltr" className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-[10.5px] leading-6 text-slate-200">{restoreData.guide}</pre>
            </div>
            <div>
              <span className="label">{L("عبر الوكيل", "With the agent")}</span>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
                <code dir="ltr" className="min-w-0 flex-1 break-all text-[10.5px] text-slate-600">
                  python backup_agent.py --restore {restoreData.filename} --storage /app/storage
                </code>
                <CopyButton text={`python backup_agent.py --restore ${restoreData.filename} --storage /app/storage`} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        loading={busy}
        title={L("حذف النسخة؟", "Delete this snapshot?")}
        description={L("سيُحذف الملف من السيرفر ومن S3. لا يمكن التراجع.", "The file is removed from the server and S3. This cannot be undone.")}
        confirmLabel={L("حذف", "Delete")}
      />
    </>
  );
}

function StatusBadge({ snapshot }: { snapshot: any }) {
  const { L } = useI18n();
  if (snapshot.status === "corrupt" || snapshot.status === "error") {
    return <Badge tone="red" dot>{L("تالفة", "Corrupt")}</Badge>;
  }
  if (snapshot.status === "remote") {
    return <Badge tone="blue" dot>{L("سحابي", "Remote")}</Badge>;
  }
  if (!snapshot.verified_at) {
    return <Badge tone="amber" dot>{L("بانتظار التحقق", "Unverified")}</Badge>;
  }
  return <Badge tone="green" dot>{L("سليمة", "Verified")}</Badge>;
}

function Fact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("mt-1 truncate text-[11.5px] font-bold text-slate-700", mono && "font-mono")} dir={mono ? "ltr" : undefined}>{value}</p>
    </div>
  );
}
