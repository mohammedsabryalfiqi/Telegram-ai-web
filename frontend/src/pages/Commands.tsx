import React from "react";
import { Bot, Copy, KeyRound, TerminalSquare, Wrench } from "lucide-react";
import { useApp } from "../context";
import { useI18n } from "../i18n";
import { Badge, Card, CardTitle, CopyButton, PageHeader, SearchInput, Spinner, cn } from "../ui";

const GROUPS = [
  {
    ar: "البداية والإعداد",
    en: "Setup & basics",
    icon: TerminalSquare,
    commands: [
      { cmd: "/start", ar: "بدء البوت أو إدخال كود المالك.", en: "Start the bot or claim ownership." },
      { cmd: "/setup", ar: "قائمة إعداد أولية مع خطوات مباشرة.", en: "Guided first-run checklist." },
      { cmd: "/ai", ar: "اختيار مزوّد الذكاء الاصطناعي والمفتاح والنموذج.", en: "Pick provider, key and model." },
      { cmd: "/freeai", ar: "قائمة المزوّدين المجانيين وحدود كل واحد.", en: "Free providers with their real limits." },
      { cmd: "/settings", ar: "كل الإعدادات القابلة للتغيير من تليجرام.", en: "All runtime settings." },
      { cmd: "/language", ar: "تغيير لغة واجهة البوت (ar|en).", en: "Switch the bot UI language (ar|en)." },
      { cmd: "/mode", ar: "التبديل بين auto و draft و off.", en: "Switch between auto, draft and off." },
      { cmd: "/direct on|off", ar: "الرد على الرسائل المباشرة للبوت.", en: "Answer direct messages to the bot." },
    ],
  },
  {
    ar: "المعرفة والردود",
    en: "Knowledge & replies",
    icon: Bot,
    commands: [
      { cmd: "/kb", ar: "إضافة ملفات أو نصوص لقاعدة المعرفة.", en: "Add files or text to the knowledge base." },
      { cmd: "/faq", ar: "إضافة ردود سريعة بكلمات مفتاحية.", en: "Canned keyword answers." },
      { cmd: "/rules", ar: "تحويل تعليماتك إلى قواعد موضوعات قابلة للمراجعة.", en: "Turn instructions into reviewable topic rules." },
      { cmd: "/resources", ar: "مواقع وقنوات ومجموعات يستخدمها المساعد.", en: "Sites, channels and groups the assistant may use." },
      { cmd: "/unanswered", ar: "الأسئلة التي لم يستطع الإجابة عنها.", en: "Questions it could not answer." },
      { cmd: "/instructions", ar: "تعليمات حرة تُضاف لكل رد.", en: "Free-form instructions added to every reply." },
    ],
  },
  {
    ar: "الإدارة والمتابعة",
    en: "Operations",
    icon: Wrench,
    commands: [
      { cmd: "/chats", ar: "أحدث المحادثات مع أزرار فتح وإيقاف.", en: "Recent chats with open/pause buttons." },
      { cmd: "/chat <id>", ar: "عرض محادثة محددة كاملة.", en: "Inspect a specific chat." },
      { cmd: "/reply <id> <text>", ar: "إرسال رد يدوي لمستخدم.", en: "Send a manual reply to a user." },
      { cmd: "/takeover", ar: "إيقاف البوت مؤقتًا في محادثة.", en: "Pause the bot in a chat." },
      { cmd: "/stats", ar: "إحصاءات سريعة عن الرسائل والردود.", en: "Quick message and reply stats." },
      { cmd: "/health", ar: "فحص المزوّد وقاعدة البيانات والاتصال.", en: "Provider, database and connection check." },
      { cmd: "/export", ar: "نسخة JSON احتياطية بدون مفاتيح.", en: "JSON backup without secrets." },
      { cmd: "/gate", ar: "بوابات الاشتراك والرسائل المدفوعة بالنجوم.", en: "Subscription gates and Stars payments." },
    ],
  },
];

export default function CommandsPage() {
  const { L, n } = useI18n();
  const { bot } = useApp();
  const [search, setSearch] = React.useState("");

  if (!bot) return <Spinner />;

  const all = GROUPS.flatMap((group) => group.commands);
  const filtered = (commands: typeof all) =>
    commands.filter((command) => !search.trim() || `${command.cmd} ${command.ar} ${command.en}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("أوامر البوت", "Bot commands")}
        subtitle={L("كل ما يمكنك فعله من داخل تليجرام مباشرة — بدون فتح السيرفر.", "Everything you can do from inside Telegram — no server access required.")}
        actions={<SearchInput value={search} onChange={setSearch} className="w-64" placeholder={L("ابحث في الأوامر…", "Search commands…")} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone="blue">{n(all.length)} {L("أمرًا", "commands")}</Badge>
        <Badge tone="slate">{L("VERSION 2.0", "VERSION 2.0")}</Badge>
        <span className="text-[11px] text-slate-400">{L("كل الأوامر تعمل داخل البوت وتظهر للمالك فقط.", "All commands are owner-only inside the bot.")}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {GROUPS.map((group) => {
          const commands = filtered(group.commands);
          return (
            <Card key={group.en} padded={false} className="overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
                  <group.icon size={15} />
                </div>
                <p className="text-[13px] font-extrabold text-slate-800">{L(group.ar, group.en)}</p>
                <span className="ms-auto text-[10px] text-slate-400">{n(commands.length)}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {commands.length ? commands.map((command) => (
                  <div key={command.cmd} className="group flex items-start gap-2 px-4 py-3 transition hover:bg-slate-50/60">
                    <div className="min-w-0 flex-1">
                      <code dir="ltr" className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-700">{command.cmd}</code>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{L(command.ar, command.en)}</p>
                    </div>
                    <div className="opacity-0 transition group-hover:opacity-100">
                      <CopyButton text={command.cmd} label="" />
                    </div>
                  </div>
                )) : (
                  <p className="px-4 py-6 text-center text-[11px] text-slate-400">{L("لا نتائج", "No matches")}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><KeyRound size={17} /></div>
            <div>
              <p className="text-[12.5px] font-bold text-slate-800">{L("نصيحة: أوامر المالك محمية", "Owner commands are protected")}</p>
              <p className="mt-1 max-w-2xl text-[11px] leading-6 text-slate-500">
                {L(
                  "البوت يرد فقط على المالك أو الأدمن المعتمد. استخدم /language ar|en لتغيير لغة الواجهة، و/help لعرض الأوامر في أي وقت.",
                  "The bot answers only the owner or approved admins. Use /language ar|en to switch the UI and /help to list commands anytime.",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[10.5px] text-slate-500">
            <Copy size={13} className="text-slate-400" /> {L("اضغط على الأيقونة لنسخ الأمر", "Hover a command to copy it")}
          </div>
        </div>
      </Card>
    </>
  );
}
