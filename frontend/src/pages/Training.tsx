import React from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  GraduationCap,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import { PERSONAL_REPLY_PRESET } from "../personalReplyPreset";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Switch,
  Tabs,
  cn,
} from "../ui";

type Tab = "persona" | "behavior" | "faq" | "notes";

const BEHAVIOR: Array<{ key: string; ar: string; en: string; descAr: string; descEn: string }> = [
  { key: "auto_reply_enabled", ar: "الرد التلقائي", en: "Auto reply", descAr: "يرسل المساعد الردود بنفسه دون تدخل.", descEn: "The assistant sends replies on its own." },
  { key: "approval_mode_enabled", ar: "الموافقة قبل الإرسال", en: "Approval before sending", descAr: "تعرض الردود عليك أولًا للموافقة.", descEn: "Replies are proposed to you first." },
  { key: "kb_enabled", ar: "استخدام قاعدة المعرفة", en: "Use knowledge base", descAr: "بحث دلالي في الملفات والنصوص.", descEn: "Semantic search across files and notes." },
  { key: "strict_kb_mode", ar: "الرد من المعرفة فقط", en: "Strict knowledge mode", descAr: "لا يجيب إلا من المحتوى المعتمد.", descEn: "Answers only from approved content." },
  { key: "faq_enabled", ar: "الردود السريعة", en: "Quick answers", descAr: "مطابقة الكلمات المفتاحية وإرسال رد جاهز.", descEn: "Keyword matching with canned replies." },
  { key: "rules_enabled", ar: "قواعد الموضوعات", en: "Topic rules", descAr: "إضافة قواعدك إلى كل رد.", descEn: "Inject your rules into every reply." },
  { key: "resources_enabled", ar: "المصادر", en: "Resources", descAr: "روابط ومواقع يمكن للمساعد ذكرها.", descEn: "Links and sites the assistant may cite." },
  { key: "unanswered_enabled", ar: "تسجيل الأسئلة", en: "Log unanswered", descAr: "يحفظ ما لم يستطع الإجابة عنه.", descEn: "Save questions it could not answer." },
  { key: "direct_reply_enabled", ar: "الرد على خاص البوت نفسه", en: "Bot private chat", descAr: "يخص الرسائل الخاصة للبوت، وليس رسائل الحساب المرتبط عبر Telegram Business.", descEn: "Controls the bot’s own private chat, not the linked Telegram Business account." },
  { key: "disclose_ai", ar: "الإفصاح بأنه مساعد آلي", en: "Disclose AI", descAr: "يمكنه قول إنه مساعد آلي عند السؤال.", descEn: "May say it is an AI assistant when asked." },
];

const TONES = [
  { id: "friendly", ar: "ودود", en: "Friendly" },
  { id: "professional", ar: "احترافي", en: "Professional" },
  { id: "casual", ar: "بسيط وعامي", en: "Casual" },
  { id: "concise", ar: "مختصر جدًا", en: "Concise" },
  { id: "warm", ar: "دافئ ومطمئن", en: "Warm" },
];

const LANGUAGES = [
  { id: "auto", ar: "تلقائي (لغة المرسل)", en: "Auto (sender language)" },
  { id: "ar", ar: "العربية", en: "Arabic" },
  { id: "en", ar: "English", en: "English" },
  { id: "fr", ar: "Français", en: "French" },
  { id: "tr", ar: "Türkçe", en: "Turkish" },
  { id: "ur", ar: "اردو", en: "Urdu" },
  { id: "fa", ar: "فارسی", en: "Persian" },
];

export default function TrainingPage() {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, toast } = useApp();
  const onError = usePageError();
  const [tab, setTab] = React.useState<Tab>("persona");
  const [loading, setLoading] = React.useState(true);
  const [values, setValues] = React.useState<Record<string, any>>({});
  const [faq, setFaq] = React.useState<any[]>([]);
  const [notes, setNotes] = React.useState<any[]>([]);
  const [pending, setPending] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  const [faqOpen, setFaqOpen] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [faqForm, setFaqForm] = React.useState({ keywords: "", question: "", answer: "" });
  const [noteForm, setNoteForm] = React.useState({ title: "", content: "" });
  const [deleteFaq, setDeleteFaq] = React.useState<number | null>(null);
  const [deleteNote, setDeleteNote] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [presetOpen, setPresetOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const [settings, faqData, notesData, changesData] = await Promise.all([
        api.get(`/api/bots/${botId}/settings`),
        api.get(`/api/bots/${botId}/faq`),
        api.get(`/api/bots/${botId}/notes`),
        api.get(`/api/bots/${botId}/changes`).catch(() => ({ pending: [] })),
      ]);
      setValues(settings.values || {});
      setFaq(faqData.entries || []);
      setNotes(notesData.notes || []);
      setPending((changesData.pending || []).length);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const savePersona = async () => {
    setSaving(true);
    try {
      const keys = ["assistant_name", "business_name", "business_description", "tone", "reply_language", "custom_instructions", "max_reply_chars"];
      const payload: Record<string, any> = {};
      keys.forEach((key) => {
        if (key in values) payload[key] = values[key];
      });
      await api.patch(`/api/bots/${botId}/settings`, { values: payload });
      toast(L("أُضيفت تعليمات المساعد إلى قائمة المزامنة", "Persona changes queued for sync"), "success");
      setPending((current) => current + Object.keys(payload).length);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const toggleBehavior = async (key: string, next: boolean) => {
    const previous = values[key];
    setValues((current) => ({ ...current, [key]: next }));
    try {
      await api.patch(`/api/bots/${botId}/settings`, { values: { [key]: next } });
      setPending((current) => current + 1);
      toast(L("تم تحديث الإعداد", "Setting updated"), "success");
    } catch (error) {
      setValues((current) => ({ ...current, [key]: previous }));
      onError(error);
    }
  };

  const addFaq = async () => {
    if (!faqForm.keywords.trim() || !faqForm.answer.trim()) return;
    setBusy(true);
    try {
      const result = await api.post(`/api/bots/${botId}/faq`, faqForm);
      setFaq(result.entries || []);
      setFaqOpen(false);
      setFaqForm({ keywords: "", question: "", answer: "" });
      setPending((current) => current + 1);
      toast(L("تمت إضافة الرد السريع", "Quick answer added"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const removeFaq = async () => {
    if (!deleteFaq) return;
    setBusy(true);
    try {
      const result = await api.del(`/api/bots/${botId}/faq/${deleteFaq}`);
      setFaq(result.entries || []);
      setDeleteFaq(null);
      setPending((current) => current + 1);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!noteForm.title.trim() || !noteForm.content.trim()) return;
    setBusy(true);
    try {
      const result = await api.post(`/api/bots/${botId}/notes`, noteForm);
      setNotes((current) => [result.note, ...current]);
      setNoteOpen(false);
      setNoteForm({ title: "", content: "" });
      setPending((current) => current + 1);
      toast(L("تمت إضافة المعرفة", "Knowledge added"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async () => {
    if (!deleteNote) return;
    setBusy(true);
    try {
      await api.del(`/api/bots/${botId}/notes/${deleteNote}`);
      setNotes((current) => current.filter((note) => note.id !== deleteNote));
      setDeleteNote(null);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const enabledCount = BEHAVIOR.filter((item) => Boolean(values[item.key])).length;

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("التدريب", "Training")}
        subtitle={L("اضبط شخصية المساعد، سلوكه، والردود السريعة التي يعتمد عليها.", "Shape the assistant's persona, behaviour and canned answers.")}
        actions={
          <>
            {pending > 0 ? <Badge tone="amber">{n(pending)} {L("تغيير في الانتظار", "pending changes")}</Badge> : null}
            <Button variant="secondary" icon={Sparkles} onClick={() => (window.location.href = "/app/testing")}>{L("اختبار الآن", "Test now")}</Button>
          </>
        }
      />

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11.5px] leading-6 text-amber-900">
        {L(
          "اللوحة تضبط ردود الرسائل الخاصة لحساب الدكتور عبر اتصال Telegram Business، أو الرسائل الخاصة للبوت نفسه. مجموعة دكتور الخطوط وجهة لطلبات الخطوط فقط؛ هذه الإعدادات لا تجعل البوت يرد داخل المجموعة.",
          "The panel configures private replies to the doctor's connected Telegram Business account or the bot's own private chat. The fonts group is a referral destination; these settings do not enable replies inside it.",
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          items={[
            { id: "persona", label: L("الشخصية", "Persona") },
            { id: "behavior", label: L("السلوك", "Behaviour") },
            { id: "faq", label: L("الردود السريعة", "Quick answers"), count: faq.length },
            { id: "notes", label: L("ملاحظات التدريب", "Training notes"), count: notes.length },
          ]}
        />
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className={cn("h-2 w-2 rounded-full", pending ? "bg-amber-400" : "bg-emerald-500")} />
          {pending ? L("التعديلات تُزامَن عبر الوكيل", "Edits sync through the agent") : L("كل التعديلات مزامنة", "Everything is in sync")}
        </div>
      </div>

      {tab === "persona" ? (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardTitle title={L("هوية المساعد", "Assistant identity")} subtitle={L("تُضاف هذه البيانات لتعليمات الرد في البوت بعد مزامنة الوكيل.", "Synced into the bot's reply instructions by the agent.")} />
            <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-[11.5px] leading-6 text-brand-900">
              <p>{L("قالب اختياري لردود حساب الدكتور الشخصية وتوجيه طلبات الخطوط للمجموعة. راجعه وعدّله قبل الحفظ؛ لن يُطبّق على البوت تلقائيًا.", "Optional personal-reply template for the doctor's account and font-request referrals. Review it before saving; it is not applied automatically.")}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPresetOpen(true)}>{L("تحميل قالب الرد الشخصي", "Load personal reply template")}</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("اسم المساعد", "Assistant name")}>
                <input className="input" value={values.assistant_name || ""} onChange={(event) => setValues({ ...values, assistant_name: event.target.value })} placeholder={L("مساعد ألفقي", "Alfiqi assistant")} />
              </Field>
              <Field label={L("صاحب الحساب", "Account holder")}>
                <input className="input" value={values.business_name || ""} onChange={(event) => setValues({ ...values, business_name: event.target.value })} placeholder={L("الدكتور محمد الفقي", "Dr Mohammed Alfiqi")} />
              </Field>
              <Field label={L("نبرة الرد", "Tone")}>
                <select className="input" value={values.tone || "friendly"} onChange={(event) => setValues({ ...values, tone: event.target.value })}>
                  {TONES.map((tone) => (
                    <option key={tone.id} value={tone.id}>{L(tone.ar, tone.en)}</option>
                  ))}
                </select>
              </Field>
              <Field label={L("لغة الرد", "Reply language")}>
                <select className="input" value={values.reply_language || "auto"} onChange={(event) => setValues({ ...values, reply_language: event.target.value })}>
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id}>{L(language.ar, language.en)}</option>
                  ))}
                </select>
              </Field>
              <Field className="sm:col-span-2" label={L("وصف الحساب الشخصي", "Personal account description")}>
                <textarea className="textarea min-h-[80px]" value={values.business_description || ""} onChange={(event) => setValues({ ...values, business_description: event.target.value })} placeholder={L("حساب الدكتور محمد الفقي الشخصي؛ طلبات الخطوط تُوجَّه إلى مجموعة دكتور الخطوط…", "Dr Mohammed Alfiqi's personal account; font requests go to the Doctor of Fonts group…")} />
              </Field>
              <Field className="sm:col-span-2" label={L("تعليمات المالك", "Owner instructions")} hint={L("أهم الإرشادات التي يجب أن يتبعها في كل محادثة.", "The rules it must follow in every conversation.")}>
                <textarea className="textarea min-h-[240px]" value={values.custom_instructions || ""} onChange={(event) => setValues({ ...values, custom_instructions: event.target.value })} placeholder={L("رد على الرسائل الشخصية بود، ووجّه طلبات معرفة الخطوط فقط إلى المجموعة…", "Reply warmly to personal messages; refer only clear font requests to the group…")} />
              </Field>
              <Field label={L("أقصى طول للرد", "Max reply length")} hint={L("عدد الأحرف", "Characters")}>
                <input type="number" className="input" value={values.max_reply_chars || 900} onChange={(event) => setValues({ ...values, max_reply_chars: Number(event.target.value) })} />
              </Field>
              <Field label={L("حد الرسائل/ساعة", "Messages/hour limit")}>
                <input type="number" className="input" value={values.max_messages_per_customer_per_hour || 20} onChange={(event) => setValues({ ...values, max_messages_per_customer_per_hour: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-[11px] leading-5 text-slate-400">{L("تُحفظ في قاعدة البوت وتُرسل عبر الوكيل.", "Saved to the bot database via the agent.")}</p>
              <Button onClick={savePersona} loading={saving} icon={CheckCircle2}>{L("حفظ التغييرات", "Save changes")}</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle title={L("معاينة الهوية", "Identity preview")} />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-[15px] font-extrabold text-white">
                  {(values.assistant_name || bot.name).slice(0, 2)}
                </div>
                <div>
                  <p className="text-[14px] font-extrabold text-slate-900">{values.assistant_name || L("مساعد بلا اسم", "Unnamed assistant")}</p>
                  <p className="text-[11.5px] text-slate-400">{values.business_name || L("لم يُحدَّد الاسم", "No name set")}</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[11.5px] leading-6 text-slate-500">
                {values.business_description || L("أضف وصفًا مختصرًا ليظهر هنا وفي بطاقة المساعد.", "Add a short description to preview it here and on the assistant card.")}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{L(TONES.find((tone) => tone.id === values.tone)?.ar || "ودود", TONES.find((tone) => tone.id === values.tone)?.en || "Friendly")}</Badge>
                <Badge tone="slate">{L(LANGUAGES.find((item) => item.id === (values.reply_language || "auto"))?.ar || "تلقائي", LANGUAGES.find((item) => item.id === (values.reply_language || "auto"))?.en || "Auto")}</Badge>
              </div>
            </Card>

            <Card>
              <CardTitle title={L("نصائح سريعة", "Quick tips")} />
              <ul className="space-y-2.5 text-[11.5px] leading-6 text-slate-500">
                {[
                  { ar: "اكتب التعليمات بصيغة أوامر واضحة وقصيرة.", en: "Write instructions as short, clear rules." },
                  { ar: "اترك شرط توجيه طلبات الخطوط في تعليمات المالك؛ لا تصنع ردًا سريعًا بكلمة «خط» وحدها.", en: "Keep conditional font referrals in owner instructions; never use a broad keyword like “font” as a quick-reply trigger." },
                  { ar: "راقب «أسئلة بلا إجابة» وأضف الردود بانتظام.", en: "Watch unanswered questions and add answers regularly." },
                ].map((tip) => (
                  <li key={tip.en} className="flex gap-2"><span className="mt-2 h-1 w-1 flex-none rounded-full bg-brand-400" />{L(tip.ar, tip.en)}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "behavior" ? (
        <Card>
          <CardTitle
            title={L("سلوك المساعد", "Assistant behaviour")}
            subtitle={L(`${enabledCount} من ${BEHAVIOR.length} خيارات مفعّلة`, `${enabledCount} of ${BEHAVIOR.length} options enabled`)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {BEHAVIOR.map((item) => (
              <div key={item.key} className={cn("flex items-start justify-between gap-3 rounded-xl border p-3.5 transition", values[item.key] ? "border-brand-100 bg-brand-50/30" : "border-slate-200")}>
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">{L(item.ar, item.en)}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">{L(item.descAr, item.descEn)}</p>
                </div>
                <Switch checked={Boolean(values[item.key])} onChange={(next) => void toggleBehavior(item.key, next)} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-3 text-[11px] leading-5 text-amber-800">
            <Wand2 size={15} className="mt-0.5 flex-none" />
            {L(
              "هذه المفاتيح تتحكم في ردود البوت الفعلية بعد مزامنة الوكيل — بدون الحاجة لإعادة نشر البوت.",
              "These switches control the real bot behaviour once the agent syncs — no redeploy needed.",
            )}
          </div>
        </Card>
      ) : null}

      {tab === "faq" ? (
        <Card>
          <CardTitle
            title={L("الردود السريعة", "Quick answers")}
            subtitle={L("قد يُرسل البوت الرد الجاهز مباشرة عند تطابق عبارة، حتى لو احتوت الرسالة على طلب آخر؛ لا تستخدم كلمات عامة مثل «خط».", "A matching phrase can send the canned answer even if the message asks something else; avoid broad keywords such as “font”.")}
            action={<Button size="sm" icon={Plus} onClick={() => setFaqOpen(true)}>{L("إضافة رد", "Add answer")}</Button>}
          />
          {faq.length === 0 ? (
            <EmptyState icon={MessageSquareText} title={L("لا ردود سريعة بعد", "No quick answers yet")} description={L("أضف أكثر الأسئلة تكرارًا بإجابة ثابتة.", "Add your most common questions with fixed answers.")} action={<Button size="sm" icon={Plus} onClick={() => setFaqOpen(true)}>{L("إضافة", "Add")}</Button>} />
          ) : (
            <div className="space-y-2.5">
              {faq.map((entry) => (
                <div key={entry.id} className="group flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-slate-300">
                  <div className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <MessageSquareText size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12.5px] font-bold text-slate-800">{entry.question || entry.keywords}</p>
                      {int(entry.enabled) === 0 ? <Badge tone="slate">{L("متوقف", "Disabled")}</Badge> : null}
                      <Badge tone="blue">{n(entry.hits || 0)} {L("استخدام", "uses")}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-slate-500">{entry.answer}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{L("الكلمات", "Keywords")}: {entry.keywords}</p>
                  </div>
                  <button className="icon-btn text-slate-300 hover:text-rose-500" onClick={() => setDeleteFaq(entry.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "notes" ? (
        <Card>
          <CardTitle
            title={L("ملاحظات التدريب", "Training notes")}
            subtitle={L("نصوص تُضاف لقاعدة المعرفة وتُستخدم في الاختبار والردود.", "Text added to the knowledge base and used by testing & replies.")}
            action={<Button size="sm" icon={Plus} onClick={() => setNoteOpen(true)}>{L("إضافة نص", "Add text")}</Button>}
          />
          {notes.length === 0 ? (
            <EmptyState icon={GraduationCap} title={L("لا ملاحظات بعد", "No notes yet")} description={L("أضف معلومات الخطوط، الأسئلة المتكررة، أو روابط المجموعة.", "Add font information, recurring questions, or group links.")} action={<Button size="sm" icon={Plus} onClick={() => setNoteOpen(true)}>{L("إضافة نص", "Add text")}</Button>} />
          ) : (
            <div className="space-y-2.5">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BookOpenCheck size={15} className="text-brand-500" />
                      <p className="text-[12.5px] font-bold text-slate-800">{note.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{timeAgo(note.created_at)}</span>
                      <button className="icon-btn text-slate-300 hover:text-rose-500" onClick={() => setDeleteNote(note.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-[11.5px] leading-6 text-slate-500">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Modal
        open={faqOpen}
        onClose={() => setFaqOpen(false)}
        title={L("إضافة رد سريع", "Add a quick answer")}
        subtitle={L("عند تطابق الكلمات المفتاحية يُرسل الرد كما هو.", "When keywords match, this answer is sent verbatim.")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFaqOpen(false)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={addFaq} loading={busy}>{L("إضافة", "Add")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L("الكلمات المفتاحية", "Keywords")} hint={L("افصل بينها بفاصلة — استخدم عبارة محددة؛ أي كلمة مطابقة قد تُرسل الرد الجاهز مباشرة", "Comma separated — Use a specific phrase; any matching keyword may send the canned reply immediately")}>
            <input className="input" value={faqForm.keywords} onChange={(event) => setFaqForm({ ...faqForm, keywords: event.target.value })} placeholder={L("فين رابط مجموعة دكتور الخطوط", "where is the Doctor of Fonts group link")} />
          </Field>
          <Field label={L("السؤال (اختياري)", "Question (optional)")}>
            <input className="input" value={faqForm.question} onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })} placeholder={L("فين رابط مجموعة دكتور الخطوط؟", "Where is the Doctor of Fonts group link?")} />
          </Field>
          <Field label={L("الرد", "Answer")}>
            <textarea className="textarea" value={faqForm.answer} onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })} placeholder={L("رابط المجموعة هو https://t.me/Alfiqifont", "The group link is https://t.me/Alfiqifont")} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={L("إضافة نص للتدريب", "Add training text")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteOpen(false)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={addNote} loading={busy}>{L("إضافة", "Add")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L("العنوان", "Title")}>
            <input className="input" value={noteForm.title} onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })} placeholder={L("سياسة الاستبدال", "Exchange policy")} />
          </Field>
          <Field label={L("المحتوى", "Content")}>
            <textarea className="textarea min-h-[180px]" value={noteForm.content} onChange={(event) => setNoteForm({ ...noteForm, content: event.target.value })} placeholder={L("اكتب المعلومات التي يجب أن يعرفها المساعد…", "Write what the assistant should know…")} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        onConfirm={() => {
          setValues((current) => ({ ...current, ...PERSONAL_REPLY_PRESET }));
          setPresetOpen(false);
        }}
        title={L("تحميل تعليمات حساب الدكتور؟", "Load the doctor's reply template?")}
        description={L("سيستبدل الاسم والوصف والنبرة واللغة والتعليمات المعروضة حاليًا في النموذج فقط، بما فيها أي تعديلات لم تحفظها. راجع النص ثم اضغط «حفظ التغييرات» لإرساله للبوت عبر الوكيل.", "This replaces the displayed name, description, tone, language and instructions, including unsaved edits. Review the text, then click Save changes to sync it to the bot through the agent.")}
        confirmLabel={L("تحميل للمراجعة", "Load for review")}
        danger={false}
      />
      <ConfirmDialog
        open={deleteFaq !== null}
        onClose={() => setDeleteFaq(null)}
        onConfirm={removeFaq}
        loading={busy}
        title={L("حذف الرد السريع؟", "Delete this quick answer?")}
        description={L("سيُحذف من نسخة البوت بعد مزامنة الوكيل.", "It will be removed from the bot after the agent syncs.")}
        confirmLabel={L("حذف", "Delete")}
      />
      <ConfirmDialog
        open={deleteNote !== null}
        onClose={() => setDeleteNote(null)}
        onConfirm={removeNote}
        loading={busy}
        title={L("حذف الملاحظة؟", "Delete this note?")}
        description={L("تُحذف من لوحة التحكم فقط.", "It is removed from the dashboard.")}
        confirmLabel={L("حذف", "Delete")}
      />
    </>
  );
}

const int = (value: any) => Number(value || 0);
