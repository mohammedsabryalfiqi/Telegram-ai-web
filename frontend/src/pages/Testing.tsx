import React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Cpu,
  Eraser,
  KeyRound,
  Loader2,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import { Badge, Button, Card, CardTitle, PageHeader, Spinner, Tabs, cn } from "../ui";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode?: "live" | "simulation";
  source?: string;
  confidence?: number;
  error?: boolean;
  pending?: boolean;
};

const SUGGESTIONS = [
  { ar: "السلام عليكم", en: "Peace be upon you" },
  { ar: "عامل إيه يا دكتور؟", en: "How are you, doctor?" },
  { ar: "السلام عليكم، عايز أعرف اسم الخط اللي في صورة", en: "Hello, can you identify a font in a photo?" },
  { ar: "الخط في رسالتي مش واضح، أقصد الكتابة", en: "The line in my message is unclear; I mean the writing" },
];

export default function TestingPage() {
  const { L, n } = useI18n();
  const { bot, botId, toast } = useApp();
  const navigate = useNavigate();
  const onError = usePageError();
  const [mode, setMode] = React.useState<"live" | "simulation">("simulation");
  const [config, setConfig] = React.useState<any>(null);
  const [persona, setPersona] = React.useState<any>({});
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const welcome = React.useCallback(
    (name: string) => ({
      id: "welcome",
      role: "assistant" as const,
      text: L(
        `أهلاً 👋 أنا ${name}. جرّب أن تسألني كأنك تراسل حساب الدكتور — هذا اختبار تقريبي من آخر نسخة، وليس محادثة مع البوت نفسه.`,
        `Hi 👋 I'm ${name}. Ask me anything as if you were messaging the doctor’s account — this is an approximation from the latest snapshot, not a chat with the bot itself.`,
      ),
      mode: "simulation" as const,
    }),
    [L],
  );

  React.useEffect(() => {
    if (!botId) return;
    setLoading(true);
    Promise.all([
      api.get("/api/ai/config"),
      api.get(`/api/bots/${botId}/overview`),
      api.get(`/api/bots/${botId}/ai/messages`).catch(() => ({ messages: [] })),
    ])
      .then(([aiConfig, overview, history]) => {
        setConfig(aiConfig);
        setPersona(overview.persona || {});
        const name = overview.persona?.assistant_name || "المساعد";
        const saved = (history.messages || []).map((item: any) => ({
          id: `saved-${item.id}`,
          role: item.role,
          text: item.content,
          mode: "live" as const,
        }));
        setMessages(saved.length ? saved : [welcome(name)]);
        if (aiConfig?.has_key) setMode("live");
      })
      .catch(onError)
      .finally(() => setLoading(false));
  }, [botId, welcome, onError]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  const push = (message: ChatMessage) => setMessages((current) => [...current, message]);

  const send = async (forced?: string) => {
    const text = (forced ?? input).trim();
    if (!text || sending || !botId) return;
    setInput("");
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", text };
    const history = messages.filter((item) => !item.error && !item.pending && item.id !== "welcome").slice(-10).map((item) => ({ role: item.role, content: item.text }));
    push(userMessage);
    setSending(true);
    try {
      if (mode === "simulation") {
        const result = await api.post("/api/ai/simulate", { bot_id: botId, message: text });
        push({
          id: `a-${Date.now()}`,
          role: "assistant",
          text: result.text || L("لا توجد إجابة.", "No answer."),
          mode: "simulation",
          source: result.source,
          confidence: result.confidence,
        });
      } else {
        const result = await api.post("/api/ai/chat", { bot_id: botId, message: text, history });
        if (!result.ok) {
          push({
            id: `e-${Date.now()}`,
            role: "assistant",
            text:
              result.code === "no_key"
                ? L("لا يوجد مفتاح ذكاء اصطناعي محفوظ. أضفه من الإعدادات، أو استخدم المحاكاة المحلية.", "No AI key saved. Add one in Settings, or use local simulation.")
                : result.code === "network"
                  ? L("تعذر الوصول إلى مزوّد الذكاء الاصطناعي من السيرفر. جرّب المحاكاة المحلية.", "Could not reach the AI provider from the server. Try local simulation.")
                  : result.error || L("فشل الاتصال بالمزوّد.", "Provider call failed."),
            error: true,
          });
        } else {
          push({ id: `a-${Date.now()}`, role: "assistant", text: result.text, mode: "live", source: result.model });
        }
      }
    } catch (error) {
      push({
        id: `e-${Date.now()}`,
        role: "assistant",
        text: error instanceof ApiError ? error.detail : L("حدث خطأ أثناء الاختبار.", "The test could not complete."),
        error: true,
      });
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clear = async () => {
    if (!botId) return;
    try {
      await api.del(`/api/bots/${botId}/ai/messages`);
      setMessages([welcome(persona.assistant_name || "المساعد")]);
      toast(L("تم مسح سجل الاختبار", "Test history cleared"), "success");
    } catch (error) {
      onError(error);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const assistantName = persona.assistant_name || bot.name;
  const businessName = persona.business_name || L("الدكتور محمد الفقي", "Dr Mohammed Alfiqi");

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("الاختبار", "Testing")}
        subtitle={L("جرّب سيناريوهات الرسائل الشخصية وطلبات الخطوط. الاختبار تقريبي ولا يرسل رسائل تيليجرام.", "Try personal chats and font requests. This is an approximation and sends no Telegram messages.")}
        actions={
          <>
            <Tabs
              value={mode}
              onChange={(value) => setMode(value as typeof mode)}
              items={[
                { id: "simulation", label: L("محاكاة محلية", "Local simulation") },
                { id: "live", label: L("اختبار مزوّد الموقع", "Panel provider test") },
              ]}
            />
            <Button variant="secondary" icon={Eraser} onClick={clear}>{L("مسح", "Clear")}</Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Card padded={false} className="flex h-[640px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-[13px] font-extrabold text-white">
              {assistantName.slice(0, 2)}
              <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-extrabold text-slate-900">{assistantName}</p>
              <p className="truncate text-[10.5px] text-slate-400">{businessName} · {L("بيئة اختبار", "Test environment")}</p>
            </div>
            <Badge tone={mode === "live" ? "green" : "blue"} dot>
              {mode === "live" ? L("مباشر", "Live") : L("محاكاة", "Simulation")}
            </Badge>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 px-4 py-5 sm:px-5">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex gap-2.5", message.role === "user" ? "flex-row-reverse" : "")}>
                {message.role === "assistant" ? (
                  <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                    {message.error ? <AlertTriangle size={14} className="text-amber-500" /> : <Bot size={14} />}
                  </div>
                ) : null}
                <div className={cn("max-w-[82%]", message.role === "user" ? "items-end text-end" : "")}>
                  <div
                    className={cn(
                      "whitespace-pre-line rounded-2xl px-4 py-2.5 text-[12.5px] leading-7 shadow-sm",
                      message.role === "user"
                        ? "rounded-ee-md bg-brand-600 text-white"
                        : message.error
                          ? "rounded-es-md border border-amber-200 bg-amber-50 text-amber-800"
                          : "rounded-es-md border border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {message.text}
                  </div>
                  {message.role === "assistant" && !message.error ? (
                    <div className="mt-1 flex items-center gap-1.5 ps-1 text-[9.5px] text-slate-400">
                      <span>{message.mode === "live" ? L("اختبار المزوّد", "Panel provider test") : L("محاكاة محلية", "Simulation")}</span>
                      {message.source ? <span>· {message.source}</span> : null}
                      {typeof message.confidence === "number" ? <span>· {Math.round(message.confidence * 100)}%</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm"><Bot size={14} /></div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-es-md border border-slate-200 bg-white px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-300 [animation-delay:300ms]" />
                </div>
              </div>
            ) : null}
          </div>

          {mode === "live" && !config?.has_key ? (
            <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800">
              <KeyRound size={14} />
              {L("لا يوجد مفتاح محفوظ — أضفه من الإعدادات لتفعيل الوضع المباشر.", "No key saved — add one in Settings to enable live mode.")}
              <button onClick={() => navigate("/app/settings")} className="ms-auto font-bold underline underline-offset-2">{L("الإعدادات", "Settings")}</button>
            </div>
          ) : null}

          <div className="border-t border-slate-100 bg-white p-3.5">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 p-1.5 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={L("اكتب رسالة شخصية أو طلبًا عن خط…", "Write a personal message or a font request…")}
                className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[12.5px] leading-6 outline-none placeholder:text-slate-400"
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim() || sending}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-slate-200"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-slate-400">
              {mode === "live"
                ? L("يستخدم مفتاحك المحدد في الإعدادات — لا يُخزَّن في قاعدة البوت.", "Uses the key from Settings — it is not written into the bot database.")
                : L("المحاكاة تستخدم الردود السريعة وقاعدة المعرفة والقواعد فقط.", "Simulation uses only quick answers, knowledge base and rules.")}
            </p>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle title={L("أسئلة مقترحة", "Suggested questions")} subtitle={L("اضغط للتجربة الفورية", "Click to try instantly")} />
            <div className="space-y-2">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.en}
                  onClick={() => void send(L(item.ar, item.en))}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-start text-[11.5px] text-slate-600 transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <Sparkles size={13} className="flex-none text-brand-500" />
                  {L(item.ar, item.en)}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle title={L("إعداد الاتصال", "Connection")} subtitle={L("الوضع المباشر يحتاج مفتاحًا", "Live mode needs a key")} />
            <div className="space-y-2.5 text-[11.5px]">
              <Row icon={Cpu} label={L("المزوّد", "Provider")} value={config?.provider || "—"} />
              <Row icon={Sparkles} label={L("النموذج", "Model")} value={config?.model || "—"} />
              <Row icon={KeyRound} label={L("المفتاح", "Key")} value={config?.has_key ? config.key_masked : L("غير مضاف", "Not set")} />
              <Row icon={Zap} label={L("الوضع", "Mode")} value={mode === "live" ? L("مباشر", "Live") : L("محاكاة", "Simulation")} />
            </div>
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => navigate("/app/settings")}>
              {L("إعداد الذكاء الاصطناعي", "Configure AI")}
            </Button>
          </Card>

          <Card className="bg-brand-50/40">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white text-brand-600">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-800">{L("كيف يعمل الاختبار؟", "How testing works")}</p>
                <p className="mt-1 text-[11px] leading-6 text-slate-500">
                  {L(
                    "اختبار المزوّد يستخدم تعليمات الحساب من آخر نسخة ومفتاح الموقع، لكنه لا ينفّذ مسار رد البوت نفسه. المحاكاة تطابق كلمات قاعدة المعرفة والردود السريعة فقط؛ تحقّق من السلوك النهائي برسالة تجريبية في تيليجرام.",
                    "Provider testing uses the account instructions from the latest snapshot and the panel key, but does not run the bot reply pipeline. Local simulation only matches stored keywords; verify final behaviour in Telegram.",
                  )}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="inline-flex items-center gap-1.5 text-slate-400"><Icon size={13} /> {label}</span>
      <span className="max-w-[160px] truncate font-semibold text-slate-700" dir="auto">{value}</span>
    </div>
  );
}
