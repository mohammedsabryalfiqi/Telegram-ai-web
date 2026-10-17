import React from "react";
import {
  CheckCircle2,
  CircleSlash2,
  MessageCircle,
  MessageSquareReply,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  Tabs,
  cn,
} from "../ui";

export default function UnansweredPage() {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, toast, reloadBots } = useApp();
  const onError = usePageError();
  const [status, setStatus] = React.useState<"open" | "answered">("open");
  const [questions, setQuestions] = React.useState<any[]>([]);
  const [counts, setCounts] = React.useState<{ open: number; answered: number }>({ open: 0, answered: 0 });
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [active, setActive] = React.useState<any>(null);
  const [answer, setAnswer] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/bots/${botId}/unanswered?status=${status}`);
      setQuestions(data.questions || []);
      setCounts(data.counts || { open: 0, answered: 0 });
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, status, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submitAnswer = async () => {
    if (!active || !answer.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/bots/${botId}/unanswered/${active.id}/answer`, { answer: answer.trim() });
      setActive(null);
      setAnswer("");
      toast(L("تم تعليم الإجابة وحفظها كرد سريع", "Answer learned and saved as a quick reply"), "success");
      await load();
      await reloadBots();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const ignore = async (question: any) => {
    try {
      await api.post(`/api/bots/${botId}/unanswered/${question.id}/ignore`);
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      setCounts((current) => ({ ...current, open: Math.max(0, current.open - 1) }));
      toast(L("تم تجاهل السؤال", "Question ignored"), "success");
    } catch (error) {
      onError(error);
    }
  };

  if (!bot) return <Spinner />;

  const filtered = questions.filter((question) => !search.trim() || String(question.question).toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("أسئلة بلا إجابة", "Unanswered")}
        subtitle={L("بدل أن يخمّن المساعد، يسجّل السؤال هنا. إجابتك تُحفظ كرد سريع ويُزامنها الوكيل مع البوت؛ لا تُرسل رسالة مباشرة للمرسل.", "Instead of guessing, the assistant logs the question. Your answer is saved as a quick reply and synced to the bot; it is not sent to the sender immediately.")}
        actions={<Badge tone="amber">{n(counts.open)} {L("بانتظار الرد", "waiting")}</Badge>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><MessageCircle size={19} /></div>
          <div>
            <p className="text-[10.5px] font-semibold text-slate-400">{L("مفتوحة", "Open")}</p>
            <p className="text-[22px] font-extrabold leading-none text-slate-900">{n(counts.open)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={19} /></div>
          <div>
            <p className="text-[10.5px] font-semibold text-slate-400">{L("تمت الإجابة", "Answered")}</p>
            <p className="text-[22px] font-extrabold leading-none text-slate-900">{n(counts.answered)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Sparkles size={19} /></div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold text-slate-400">{L("التعلم التلقائي", "Auto learning")}</p>
            <p className="truncate text-[11.5px] font-semibold text-slate-600">{L("كل إجابة تصبح ردًا سريعًا", "Each answer becomes a quick reply")}</p>
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(value) => setStatus(value as typeof status)}
          items={[
            { id: "open", label: L("بانتظار الرد", "Open"), count: counts.open },
            { id: "answered", label: L("تمت الإجابة", "Answered"), count: counts.answered },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} className="w-60" placeholder={L("ابحث في الأسئلة…", "Search questions…")} />
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={status === "open" ? CheckCircle2 : MessageCircle}
          title={status === "open" ? L("لا أسئلة معلّقة 🎉", "Nothing waiting 🎉") : L("لا إجابات محفوظة بعد", "No answered questions yet")}
          description={status === "open" ? L("المساعد أجاب على كل ما وصله.", "The assistant covered everything.") : L("أجب على سؤال وسيظهر هنا.", "Answer a question and it will appear here.")}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((question) => (
            <Card key={question.id} className="group">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex items-start gap-3 sm:flex-1">
                  <div className={cn("mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl", status === "open" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                    {status === "open" ? <MessageCircle size={18} /> : <CheckCircle2 size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold leading-6 text-slate-800">{question.question}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <span className="inline-flex items-center gap-1"><UserRound size={11} /> {L("محادثة", "Chat")} #{question.customer_chat_id || "—"}</span>
                      <span>·</span>
                      <span>{timeAgo(question.created_at)}</span>
                      {status === "answered" && question.answered_at ? <><span>·</span><span>{L("أُجيب", "Answered")} {timeAgo(question.answered_at)}</span></> : null}
                    </div>
                    {status === "answered" && question.answer ? (
                      <div className="mt-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3.5 py-2.5 text-[11.5px] leading-6 text-emerald-900">
                        {question.answer}
                      </div>
                    ) : null}
                  </div>
                </div>
                {status === "open" ? (
                  <div className="flex flex-none items-center gap-2">
                    <Button
                      size="sm"
                      icon={MessageSquareReply}
                      onClick={() => {
                        setActive(question);
                        setAnswer("");
                      }}
                    >
                      {L("رد وتعلّم", "Answer & learn")}
                    </Button>
                    <button className="icon-btn text-slate-300 hover:text-slate-600" title={L("تجاهل", "Ignore")} onClick={() => void ignore(question)}>
                      <CircleSlash2 size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-[11px] leading-6 text-brand-900">
        <Sparkles size={14} className="mt-0.5 flex-none" />
        {L(
          "الإجابة تُخزَّن كسؤال شائع فورًا في نسخة اللوحة، وتُزامَن مع البوت عبر الوكيل — ستتاح الإجابة للردود التالية بعد المزامنة.",
          "The answer is stored as a quick reply in the dashboard copy and synced to the bot by the agent — the answer becomes available for future replies after sync.",
        )}
      </div>

      <Modal
        open={Boolean(active)}
        onClose={() => {
          setActive(null);
          setAnswer("");
        }}
        title={L("الإجابة على السؤال", "Answer the question")}
        subtitle={active?.question}
        footer={
          <>
            <Button variant="secondary" onClick={() => setActive(null)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={submitAnswer} loading={busy} disabled={!answer.trim()} icon={CheckCircle2}>{L("حفظ وتعلّم", "Save & learn")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-[11.5px] leading-6 text-slate-500">
            {L("اكتب إجابة يمكن للبوت استخدامها لاحقًا. الحفظ هنا لا يرسل رسالة للمستخدم.", "Write an answer the bot can reuse later. Saving it here does not message the user.")}
          </div>
          <Field label={L("الإجابة", "Answer")}>
            <textarea className="textarea min-h-[150px]" autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={L("إذا كان طلبك عن معرفة خط، يمكنك نشره في https://t.me/Alfiqifont", "For font identification requests, try https://t.me/Alfiqifont")} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
