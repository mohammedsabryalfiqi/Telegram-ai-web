import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Download,
  MessageCircle,
  MessagesSquare,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "../api";
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
  Tabs,
  cn,
} from "../ui";
import { ChartLegend, CustomersBarChart, MessageAreaChart, SimpleBarChart } from "../components/MessageChart";

const RANGES = [
  { id: "7", ar: "7 أيام", en: "7 days" },
  { id: "14", ar: "14 يومًا", en: "14 days" },
  { id: "30", ar: "30 يومًا", en: "30 days" },
  { id: "90", ar: "90 يومًا", en: "90 days" },
];

export default function AnalyticsPage() {
  const { L, n, timeAgo, date } = useI18n();
  const { bot, botId } = useApp();
  const navigate = useNavigate();
  const onError = usePageError();
  const [range, setRange] = React.useState("30");
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(
    async (silent = false) => {
      if (!botId) return;
      if (!silent) setLoading(true);
      try {
        const result = await api.get(`/api/bots/${botId}/analytics?days=${range}`);
        setData(result);
      } catch (error) {
        onError(error);
      } finally {
        setLoading(false);
      }
    },
    [botId, range, onError],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!bot) return <Spinner />;
  if (loading && !data) return <Spinner />;

  const totals = data?.totals || {};
  const trends = data?.trends || {};
  const series = data?.series || [];
  const persona = data?.persona || {};
  const maxPopular = Math.max(1, ...(data?.popular || []).map((item: any) => item.count));
  const unansweredRate = totals.messages ? Math.round(((totals.unanswered_open || 0) / Math.max(1, totals.messages)) * 1000) / 10 : 0;
  const aiShare = totals.messages ? Math.round(((totals.ai_replies || 0) / Math.max(1, totals.messages)) * 100) : 0;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `alfiqi-analytics-${bot.name}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("التحليلات", "Analytics")}
        subtitle={L("قراءة سريعة لأداء المساعد: حجم المحادثات، جودة التغطية، وأكثر ما يسأل عنه المستخدمون.", "A quick read on volume, coverage and what users ask about most.")}
        actions={
          <>
            <Tabs items={RANGES.map((item) => ({ id: item.id, label: L(item.ar, item.en) }))} value={range} onChange={setRange} />
            <Button variant="secondary" icon={Download} onClick={exportJson}>{L("تصدير", "Export")}</Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={L("إجمالي الرسائل", "Total messages")} value={n(totals.messages || 0)} icon={MessagesSquare} change={trends.incoming?.change_pct} hint={L("مقارنة بالأسبوع السابق", "vs previous week")} />
        <KpiCard label={L("رسائل واردة", "Incoming")} value={n(totals.incoming || 0)} icon={ArrowUpRight} tone="violet" change={trends.incoming?.change_pct} hint={L("من المستخدمين", "from users")} />
        <KpiCard label={L("ردود المساعد", "Assistant replies")} value={n(totals.ai_replies || 0)} icon={Sparkles} tone="green" change={trends.outgoing?.change_pct} hint={`${aiShare}% ${L("من الحركة", "of traffic")}`} />
        <KpiCard label={L("تغطية الأسئلة", "Question coverage")} value={`${100 - Math.min(100, unansweredRate)}%`} icon={MessageCircle} tone="amber" hint={`${n(totals.unanswered_open || 0)} ${L("سؤال مفتوح", "open questions")}`} change={trends.unanswered?.change_pct} invert />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("الرسائل على مدار الفترة", "Message volume")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("آخر", "Last")} {range} {L("يومًا", "days")}</p>
            </div>
            <ChartLegend
              series={[
                { label: L("واردة", "Incoming"), color: "#0c8df0" },
                { label: L("صادرة", "Outgoing"), color: "#10b981" },
              ]}
            />
          </div>
          <MessageAreaChart data={series} height={300} />
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardTitle title={L("جودة التغطية", "Coverage")} subtitle={L("نسبة الأسئلة التي لم تُجب", "Share of unanswered")} />
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eef2f7" strokeWidth="3.2" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="#0c8df0"
                    strokeWidth="3.2"
                    strokeDasharray={`${Math.max(2, 100 - unansweredRate)} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[17px] font-extrabold text-slate-900">{100 - Math.min(100, unansweredRate)}%</span>
              </div>
              <div className="space-y-2 text-[11.5px]">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-500" /> {n(totals.unanswered_answered || 0)} {L("تم الرد عليها", "answered")}</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> {n(totals.unanswered_open || 0)} {L("بانتظار الرد", "waiting")}</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-200" /> {n(totals.faq || 0)} {L("رد سريع", "quick answers")}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="mt-3 -ms-2" onClick={() => navigate("/app/unanswered")}>
              {L("مراجعة الأسئلة", "Review questions")} <ArrowUpRight size={13} />
            </Button>
          </Card>

          <Card>
            <CardTitle title={L("المستخدمون الجدد", "New users")} subtitle={L("نمو القاعدة", "List growth")} />
            <CustomersBarChart data={series} height={150} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>{L("إجمالي المستخدمين", "Total users")}</span>
              <span className="font-bold text-slate-700">{n(totals.leads || 0)}</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardTitle title={L("الأسئلة غير المجابة", "Unanswered over time")} subtitle={L("فرص لتحسين قاعدة المعرفة", "Chances to improve the knowledge base")} />
          <SimpleBarChart data={series} dataKey="unanswered" name={L("أسئلة غير مجابة", "Unanswered")} color="#f59e0b" height={220} />
        </Card>
        <Card>
          <CardTitle
            title={L("الأسئلة الأكثر تكرارًا", "Most asked")}
            subtitle={L("بناءً على الردود السريعة والرسائل", "Based on quick answers & messages")}
          />
          {data?.popular?.length ? (
            <div className="space-y-3">
              {data.popular.map((item: any, index: number) => (
                <div key={`${item.label}-${index}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[12px] font-semibold text-slate-600">{item.label}</p>
                    <Badge tone={item.source === "faq" ? "blue" : "amber"}>{n(item.count)}</Badge>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${Math.max(6, (item.count / maxPopular) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={TrendingUp} title={L("لا بيانات كافية بعد", "Not enough data yet")} />
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{L("تفاصيل الأرقام", "Numbers at a glance")}</h3>
              <p className="mt-0.5 text-xs text-slate-400">{L("محدثة من آخر نسخة احتياطية", "From the latest snapshot")} {data?.snapshot ? `#${data.snapshot.id}` : ""}</p>
            </div>
            <Badge tone="slate">{date(data?.generated_at, true)}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
            {[
              { ar: "المحادثات", en: "Dialogs", value: totals.dialogs },
              { ar: "المستخدمون", en: "Users", value: totals.leads },
              { ar: "الرسائل الواردة", en: "Incoming", value: totals.incoming },
              { ar: "الردود الصادرة", en: "Outgoing", value: totals.outgoing },
              { ar: "الردود الآلية", en: "AI replies", value: totals.ai_replies },
              { ar: "ردود المالك", en: "Owner replies", value: Math.max(0, (totals.outgoing || 0) - (totals.ai_replies || 0)) },
              { ar: "معلّق للموافقة", en: "Approvals", value: totals.approvals_pending },
              { ar: "محادثات موقوفة", en: "Paused chats", value: totals.paused_chats },
              { ar: "قواعد مفعّلة", en: "Active rules", value: `${totals.rules_active || 0} / ${totals.rules_total || 0}` },
            ].map((item) => (
              <div key={item.en} className="bg-white px-4 py-3.5">
                <p className="text-[10.5px] font-semibold text-slate-400">{L(item.ar, item.en)}</p>
                <p className="mt-1 text-[17px] font-extrabold text-slate-900">{typeof item.value === "number" ? n(item.value) : item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 text-[10.5px] text-slate-400">
            <Badge tone="blue">{persona.ai_provider || "AI"}</Badge>
            <span>{L("النموذج الشخصي", "Persona")}: {persona.business_name || "—"}</span>
            <span>·</span>
            <span>{L("آخر نسخة", "Latest snapshot")}: {timeAgo(data?.snapshot?.created_at)}</span>
          </div>
        </Card>

        <Card>
          <CardTitle title={L("أحدث المحادثات", "Recent dialogs")} subtitle={L("آخر الرسائل المسجلة", "Latest recorded messages")} />
          {data?.recent_chats?.length ? (
            <div className="space-y-1">
              {data.recent_chats.slice(0, 5).map((chat: any, index: number) => (
                <div key={`${chat.chat_id}-${index}`} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                    {(chat.name || `#${chat.chat_id}`).slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-bold text-slate-700">{chat.name || `#${chat.chat_id}`}</p>
                    <p className="truncate text-[10px] text-slate-400">{chat.last_message || "—"}</p>
                  </div>
                  <span className="flex-none text-[9.5px] text-slate-400">{timeAgo(chat.last_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Users} title={L("لا محادثات بعد", "No dialogs yet")} />
          )}
        </Card>
      </div>
    </>
  );
}
