import React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Cloud,
  Cpu,
  Database,
  GraduationCap,
  HardDrive,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import { api, fmtBytes } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  KpiCard,
  PageHeader,
  Spinner,
  cn,
} from "../ui";
import { ChartLegend, MessageAreaChart } from "../components/MessageChart";
import UploadModal from "../components/UploadModal";
import CreateBotModal from "../components/CreateBotModal";

export default function OverviewPage() {
  const { L, n, timeAgo, date } = useI18n();
  const { bot, botId, reloadBots, toast } = useApp();
  const navigate = useNavigate();
  const onError = usePageError();
  const [data, setData] = React.useState<any>(null);
  const [settings, setSettings] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const load = React.useCallback(
    async (silent = false) => {
      if (!botId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [overview, appSettings] = await Promise.all([
          api.get(`/api/bots/${botId}/overview`),
          api.get("/api/settings").catch(() => null),
        ]);
        setData(overview);
        setSettings(appSettings);
      } catch (error) {
        if (!silent) onError(error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [botId, onError],
  );

  React.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);


  if (!botId || !bot) {
    return (
      <>
        <PageHeader
          eyebrow="Alfiqi Control"
          title={L("مرحبًا بك في لوحة المتابعة", "Welcome to your control room")}
          subtitle={L(
            "نسخة ثانية من بيانات بوتك، مع لوحة متابعة كاملة. ابدأ بإضافة البوت ثم شغّل الوكيل على Railway.",
            "A second copy of your bot data plus a full dashboard. Add the bot, then run the agent on Railway.",
          )}
        />
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Card className="relative overflow-hidden bg-gradient-to-br from-[#08243f] via-[#0b3357] to-[#0d4a7a] p-8 text-white">
            <div className="absolute -end-16 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-2xl" />
            <div className="relative">
              <span className="chip bg-white/10 text-sky-100">
                <Sparkles size={12} /> {L("بداية سريعة", "Quick start")}
              </span>
              <h2 className="mt-4 max-w-md text-[27px] font-extrabold leading-snug">{L("اربط بوتك الأول في دقيقتين", "Connect your first bot in two minutes")}</h2>
              <p className="mt-2 max-w-lg text-[12.5px] leading-7 text-sky-100/80">
                {L(
                  "لا نحتاج توكن البوت. الوكيل يقرأ قاعدة البيانات والملفات من الـ Volume ويرسلها مشفّرة إلى هنا.",
                  "No bot token needed. The agent reads the database and files from the volume and uploads them securely.",
                )}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { n: "1", ar: "أضف البوت واحصل على المفتاح", en: "Add bot & get the key" },
                  { n: "2", ar: "شغّل الوكيل على السيرفر", en: "Run the agent on the host" },
                  { n: "3", ar: "أول نسخة تظهر تلقائيًا", en: "First snapshot arrives" },
                ].map((step) => (
                  <div key={step.n} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-400/20 text-[11px] font-bold text-sky-200">{step.n}</span>
                    <p className="mt-2 text-[11.5px] leading-5 text-sky-50/90">{L(step.ar, step.en)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={() => setCreateOpen(true)} className="bg-white text-slate-900 hover:bg-sky-50" icon={Plus}>
                  {L("إضافة بوت", "Add bot")}
                </Button>
                <Button variant="ghost" className="text-sky-100 hover:bg-white/10 hover:text-white" onClick={() => navigate("/app/settings")}>
                  {L("إعدادات التخزين", "Storage settings")}
                </Button>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <ShieldCheck size={21} />
            </div>
            <h3 className="mt-4 text-[15px] font-extrabold text-slate-900">{L("لماذا نسخة ثانية؟", "Why a second copy?")}</h3>
            <p className="mt-2 text-[12px] leading-7 text-slate-500">
              {L(
                "Volume في Railway قد يُفقد عند إعادة إنشاء الخدمة. هذه اللوحة تحفظ نسخًا مستقلة على قرص السيرفر + S3/R2 اختياريًا، وتمنحك حزمة استعادة جاهزة.",
                "Railway volumes can be lost when a service is recreated. This console keeps independent snapshots on disk + optional S3/R2 and gives you a ready restore package.",
              )}
            </p>
            <div className="mt-4 space-y-2.5">
              {[
                { ar: "تحقق تلقائي من سلامة SQLite", en: "Automatic SQLite integrity checks" },
                { ar: "نسخ احتياطي كل 6 ساعات", en: "Snapshots every 6 hours" },
                { ar: "تنزيل حزمة الاستعادة مع دليل", en: "Restore bundle with a guide" },
              ].map((item) => (
                <div key={item.en} className="flex items-center gap-2 text-[11.5px] text-slate-600">
                  <CheckCircle2 size={14} className="text-emerald-500" /> {L(item.ar, item.en)}
                </div>
              ))}
            </div>
          </Card>
        </div>
        <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} />
      </>
    );
  }

  if (loading && !data) return <Spinner />;

  const totals = data?.totals || {};
  const persona = data?.persona || {};
  const backup = data?.backup_health || {};
  const backupSummary = data?.backup_summary || {};
  const s3 = settings?.storage?.s3_enabled;
  const series = data?.series || [];
  const trends = data?.trends || {};
  const lastAt = backup?.last_at || bot.last_backup_at;
  const interval = backup?.interval_hours || bot.backup_interval_hours || 6;
  const age = backup?.age_hours ?? (lastAt ? (Date.now() - new Date(lastAt).getTime()) / 3_600_000 : null);
  const health = backup?.status || bot.health;
  const progress = age != null ? Math.min(100, Math.max(4, (age / interval) * 100)) : 0;

  const maxPopular = Math.max(1, ...(data?.popular || []).map((item: any) => item.count));

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("مدير الذكاء الاصطناعي", "AI manager")}
        subtitle={
          persona.business_name
            ? `${persona.business_name}${persona.business_description ? " — " + persona.business_description : ""}`
            : L("متابعة المحادثات، جودة الردود، وحالة النسخ الاحتياطي في مكان واحد.", "Conversations, reply quality and backup health in one place.")
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => { setRefreshing(true); void load(true); }} loading={refreshing}>
              <span className="hidden sm:inline">{L("تحديث", "Refresh")}</span>
            </Button>
            <Button icon={UploadCloud} onClick={() => setUploadOpen(true)}>{L("رفع نسخة", "Upload")}</Button>
          </>
        }
      />

      {/* AI manager card */}
      <Card className="mb-5 overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-[16px] font-extrabold text-white shadow-[0_10px_24px_-12px_rgba(0,111,206,.9)]">
                {(persona.assistant_name || bot.name).slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-extrabold text-slate-900">{persona.assistant_name || bot.name}</h3>
                  <Badge tone="blue">{persona.ai_provider || "AI"}</Badge>
                  {bot.source_mode === "demo" ? <Badge tone="violet">{L("تجريبي", "Demo")}</Badge> : null}
                </div>
                <p className="mt-1 text-[12px] leading-6 text-slate-500">
                  {persona.business_description || L("مساعد لحساب الدكتور الشخصي؛ يوجّه طلبات الخطوط للمجموعة.", "A personal account assistant that refers font requests to the group.")}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="slate">{L("النبرة", "Tone")}: {persona.tone || "friendly"}</Badge>
                  <Badge tone="slate">{L("اللغة", "Language")}: {persona.reply_language === "auto" ? L("تلقائي", "Auto") : persona.reply_language || "ar"}</Badge>
                  <Badge tone={persona.auto_reply_enabled ? "green" : "amber"} dot>
                    {persona.auto_reply_enabled ? L("رد تلقائي", "Auto-reply") : persona.approval_mode_enabled ? L("وضع الموافقة", "Approval mode") : L("الرد متوقف", "Replies off")}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Play} onClick={() => navigate("/app/testing")}>{L("اختبار المساعد", "Test assistant")}</Button>
              <Button size="sm" variant="secondary" icon={GraduationCap} onClick={() => navigate("/app/training")}>{L("تدريب وتخصيص", "Train & customize")}</Button>
              <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => navigate("/app/analytics")}>{L("التحليلات", "Analytics")}</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 lg:border-s-0 lg:border-t-0">
            <MiniFact label={L("الردود هذا الشهر", "Replies this month")} value={n(totals.ai_this_month || 0)} icon={Sparkles} />
            <MiniFact label={L("المحادثات", "Dialogs")} value={n(totals.dialogs || 0)} icon={MessagesSquare} />
            <MiniFact label={L("قاعدة المعرفة", "Knowledge")} value={n(totals.kb_items || 0)} icon={Database} />
            <MiniFact label={L("الأسئلة الشائعة", "Quick answers")} value={n(totals.faq || 0)} icon={Zap} />
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={L("المحادثات", "Dialogs")} value={n(totals.dialogs || 0)} icon={MessagesSquare} hint={L("محادثة نشطة", "active chats")} change={trends.incoming?.change_pct} />
        <KpiCard label={L("المستخدمون", "Users")} value={n(totals.leads || 0)} icon={Users} tone="violet" hint={L("مستخدم في قاعدة البوت", "users")} change={trends.new_customers?.change_pct} />
        <KpiCard label={L("أسئلة بلا إجابة", "Unanswered")} value={n(totals.unanswered_open || 0)} icon={MessageCircle} tone="amber" hint={L("تحتاج مراجعة", "need review")} change={trends.unanswered?.change_pct} invert />
        <KpiCard label={L("ردود الذكاء الاصطناعي", "AI replies")} value={n(totals.ai_replies || 0)} icon={Sparkles} tone="green" hint={L("إجمالي الردود", "all-time replies")} change={trends.outgoing?.change_pct} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Card className="p-5">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("حركة الرسائل", "Message volume")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("آخر 30 يومًا — واردة وصادرة", "Last 30 days — incoming vs outgoing")}</p>
            </div>
            <ChartLegend
              series={[
                { label: L("واردة", "Incoming"), color: "#0c8df0" },
                { label: L("صادرة", "Outgoing"), color: "#10b981" },
              ]}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center sm:max-w-sm">
            <Mini number={n(totals.incoming || 0)} label={L("واردة", "In")} />
            <Mini number={n(totals.outgoing || 0)} label={L("صادرة", "Out")} />
            <Mini number={n(totals.messages || 0)} label={L("الإجمالي", "Total")} />
          </div>
          <MessageAreaChart data={series} />
        </Card>

        <Card className="flex flex-col p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("النسخ الاحتياطي", "Backup health")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("المصدر الثاني للاستعادة", "Your second restore source")}</p>
            </div>
            <Badge tone={health === "ok" ? "green" : health === "late" ? "amber" : "slate"} dot>
              {health === "ok" ? L("سليمة", "Healthy") : health === "late" ? L("متأخرة", "Late") : L("لا نسخ", "No backup")}
            </Badge>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <p className="text-[26px] font-extrabold leading-none text-slate-900">{backupSummary.snapshots ? n(backupSummary.snapshots) : "0"}</p>
            <p className="pb-0.5 text-[11.5px] text-slate-400">{L("نسخة محفوظة", "stored snapshots")}</p>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-400">
            {L("الحجم الإجمالي", "Total size")}: <span className="font-semibold text-slate-600">{fmtBytes(backupSummary.total_bytes || 0)}</span>
          </p>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{L("آخر نسخة", "Last snapshot")}</span>
              <span className="font-bold text-slate-700">{timeAgo(lastAt)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn("h-full rounded-full", health === "ok" ? "bg-emerald-500" : health === "late" ? "bg-amber-500" : "bg-slate-300")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>{L(`كل ${interval} ساعة`, `Every ${interval}h`)}</span>
              <span>{backup.next_due_at ? `${L("المفترض", "Due")}: ${date(backup.next_due_at, true)}` : ""}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone={s3 ? "green" : "slate"}><Cloud size={11} /> {s3 ? L("محلي + سحابي", "Local + cloud") : L("قرص السيرفر", "Server disk")}</Badge>
            {data?.snapshot ? <Badge tone="slate"><Database size={11} /> #{data.snapshot.id}</Badge> : null}
            {data?.snapshot?.sha256 ? <Badge tone="slate" className="max-w-[150px] truncate" >{data.snapshot.sha256.slice(0, 10)}…</Badge> : null}
          </div>

          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Button size="sm" icon={UploadCloud} onClick={() => setUploadOpen(true)}>{L("رفع نسخة", "Upload")}</Button>
            <Button size="sm" variant="secondary" icon={HardDrive} onClick={() => navigate("/app/backups")}>{L("إدارة النسخ", "Manage")}</Button>
            {health !== "ok" ? (
              <Button size="sm" variant="ghost" onClick={() => navigate("/app/settings")}>{L("ضبط الوكيل", "Set up agent")}</Button>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_1fr_1fr]">
        <Card>
          <CardTitle
            title={L("ردود المساعد هذا الشهر", "Assistant replies this month")}
            subtitle={L("عدد الردود المسجّلة في آخر نسخة من قاعدة البوت، وليس رصيدًا لدى مزوّد الذكاء الاصطناعي.", "Replies recorded in the latest bot snapshot, not your AI provider balance.")}
          />
          <p className="mt-3 text-[32px] font-extrabold text-slate-900">{n(totals.ai_this_month || 0)}</p>
          <p className="mt-3 text-[11px] text-slate-500">{L("يتحدث الرقم عند وصول نسخة جديدة من البوت.", "Updated when a new bot snapshot arrives.")}</p>
        </Card>

        <Card>
          <CardTitle
            title={L("أسئلة بلا إجابة", "Unanswered")}
            subtitle={L("أولوية للرد عليها", "Worth answering next")}
            action={
              <button className="text-[11px] font-bold text-brand-600 hover:text-brand-700" onClick={() => navigate("/app/unanswered")}>
                {L("الكل", "All")}
              </button>
            }
          />
          {data?.unanswered?.length ? (
            <div className="space-y-1">
              {data.unanswered.slice(0, 4).map((question: any) => (
                <button
                  key={question.id}
                  onClick={() => navigate("/app/unanswered")}
                  className="group flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-start transition hover:bg-slate-50"
                >
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <MessageCircle size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-700">{question.question}</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(question.created_at)}</span>
                  </span>
                  <ChevronLeft size={14} className="mt-1 text-slate-300 transition group-hover:text-slate-500" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Inbox} title={L("لا أسئلة معلّقة", "No open questions")} description={L("كل ما وصل تم الرد عليه.", "Everything has been answered.")} />
          )}
        </Card>

        <Card>
          <CardTitle
            title={L("الأسئلة الأكثر تكرارًا", "Popular questions")}
            subtitle={L("من الردود السريعة والرسائل", "From quick answers & messages")}
          />
          {data?.popular?.length ? (
            <div className="space-y-3">
              {data.popular.slice(0, 4).map((item: any, index: number) => (
                <div key={`${item.label}-${index}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[11.5px] font-semibold text-slate-600">{item.label}</p>
                    <span className="text-[10.5px] font-bold text-slate-400">{n(item.count)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(6, (item.count / maxPopular) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={MessageCircle} title={L("لا بيانات بعد", "Nothing yet")} />
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("أحدث المحادثات", "Recent dialogs")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("آخر الرسائل الواردة من المستخدمين", "Latest user messages")}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate("/app/analytics")}>{L("عرض التحليلات", "View analytics")}</Button>
          </div>
          {data?.recent_chats?.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-start">
                <thead className="table-head">
                  <tr>
                    <th className="px-5 py-2.5 text-start font-bold">{L("المرسل", "Sender")}</th>
                    <th className="px-3 py-2.5 text-start font-bold">{L("آخر رسالة", "Last message")}</th>
                    <th className="px-5 py-2.5 text-end font-bold">{L("الوقت", "Time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_chats.slice(0, 6).map((chat: any, index: number) => (
                    <tr key={`${chat.chat_id}-${index}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-brand-100 text-[10px] font-bold text-brand-700">
                            {(chat.name || `#${chat.chat_id}`).slice(0, 2)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-bold text-slate-700">{chat.name || `#${chat.chat_id}`}</p>
                            <p className="text-[10px] text-slate-400">{chat.username ? `@${chat.username}` : L("مرسل", "Sender")}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[280px] px-3 py-3">
                        <p className="truncate text-[11.5px] text-slate-500">{chat.last_message || "—"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-end text-[10.5px] text-slate-400">{timeAgo(chat.last_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5"><EmptyState compact icon={MessagesSquare} title={L("لا محادثات بعد", "No dialogs yet")} description={L("ستظهر هنا بعد أول نسخة من قاعدة بيانات البوت.", "They appear after the first snapshot.")} /></div>
          )}
        </Card>

        <Card>
          <CardTitle title={L("سجل النشاط", "Activity")} subtitle={L("آخر عمليات اللوحة والوكيل", "Dashboard & agent events")} />
          {data?.events?.length ? (
            <div className="space-y-0.5">
              {data.events.slice(0, 6).map((event: any) => (
                <div key={event.id} className="flex items-start gap-2.5 rounded-xl px-1 py-2">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 flex-none rounded-full", event.kind === "backup" ? "bg-emerald-500" : event.kind === "late" ? "bg-amber-500" : event.kind === "restore" ? "bg-brand-500" : "bg-slate-300")} />
                  <div className="min-w-0">
                    <p className="text-[11.5px] leading-5 text-slate-600">{event.message}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(event.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Clock} title={L("لا نشاط بعد", "No activity yet")} />
          )}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10.5px] text-slate-400">
            <AlertTriangle size={13} className="flex-none text-amber-500" />
            {L("إن توقف الوكيل، ستتحول حالة النسخ إلى «متأخرة».", "If the agent stops, backup health turns to “late”.")}
          </div>
        </Card>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => { void load(true); void reloadBots(); }} />
    </>
  );
}

function MiniFact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-400">
        <Icon size={12} /> {label}
      </div>
      <p className="mt-1.5 text-[20px] font-extrabold leading-none text-slate-900">{value}</p>
    </div>
  );
}

function Mini({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <p className="text-[15px] font-extrabold leading-none text-slate-800">{number}</p>
      <p className="mt-1 text-[9.5px] font-semibold text-slate-400">{label}</p>
    </div>
  );
}
