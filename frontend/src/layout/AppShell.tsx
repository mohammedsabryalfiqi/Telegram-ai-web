import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  Download,
  Globe2,
  GraduationCap,
  HardDriveDownload,
  Home,
  Layers3,
  LogOut,
  Menu,
  MessageCircle,
  PenLine,
  PlayCircle,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Upload,
  UserCircle2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { useI18n } from "../i18n";
import { Badge, Button, cn, SectionLabel } from "../ui";
import { Brand, LogoMark } from "./Brand";
import CreateBotModal from "../components/CreateBotModal";

type NavItem = {
  to: string;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  badge?: "unanswered" | "backup" | "changes";
};

const RAIL: NavItem[] = [
  { to: "/app", labelAr: "الرئيسية", labelEn: "Home", icon: Home },
  { to: "/app/analytics", labelAr: "التحليلات", labelEn: "Analytics", icon: BarChart3 },
  { to: "/app/training", labelAr: "التدريب", labelEn: "Training", icon: GraduationCap },
  { to: "/app/knowledge", labelAr: "المعرفة", labelEn: "Knowledge", icon: BookOpen },
  { to: "/app/backups", labelAr: "النسخ الاحتياطي", labelEn: "Backups", icon: HardDriveDownload },
  { to: "/app/settings", labelAr: "الإعدادات", labelEn: "Settings", icon: SettingsIcon },
];

const NAV: { ar: string; en: string; items: NavItem[] }[] = [
  {
    ar: "الأسئلة",
    en: "Questions",
    items: [
      { to: "/app/training", labelAr: "التدريب", labelEn: "Training", icon: GraduationCap },
      { to: "/app/analytics", labelAr: "التحليلات", labelEn: "Analytics", icon: BarChart3 },
      { to: "/app/testing", labelAr: "الاختبار", labelEn: "Testing", icon: PlayCircle },
      { to: "/app/knowledge", labelAr: "قاعدة المعرفة", labelEn: "Knowledge Base", icon: BookOpen },
      { to: "/app/rules", labelAr: "قواعد الموضوعات", labelEn: "Topic Rules", icon: Layers3 },
      { to: "/app/unanswered", labelAr: "أسئلة بلا إجابة", labelEn: "Unanswered", icon: MessageCircle, badge: "unanswered" },
    ],
  },
  {
    ar: "الإدارة",
    en: "Management",
    items: [
      { to: "/app/backups", labelAr: "النسخ الاحتياطي", labelEn: "Backups", icon: HardDriveDownload, badge: "backup" },
      { to: "/app/resources", labelAr: "المصادر", labelEn: "Resources", icon: Download },
      { to: "/app/actions", labelAr: "إجراءات سريعة", labelEn: "Actions", icon: Zap },
      { to: "/app/commands", labelAr: "أوامر البوت", labelEn: "Commands", icon: Workflow },
      { to: "/app/settings", labelAr: "الإعدادات", labelEn: "Settings", icon: SettingsIcon },
    ],
  },
  {
    ar: "إضافة معلومات",
    en: "Add Information",
    items: [
      { to: "/app/files", labelAr: "ملفات", labelEn: "Files", icon: Upload },
      { to: "/app/text", labelAr: "نص", labelEn: "Text", icon: PenLine },
    ],
  },
];

const TITLES: Record<string, [string, string]> = {
  "/app": ["نظرة عامة", "Overview"],
  "/app/analytics": ["التحليلات", "Analytics"],
  "/app/training": ["التدريب", "Training"],
  "/app/testing": ["الاختبار", "Testing"],
  "/app/knowledge": ["قاعدة المعرفة", "Knowledge Base"],
  "/app/files": ["إضافة ملفات", "Add files"],
  "/app/text": ["إضافة نص", "Add text"],
  "/app/rules": ["قواعد الموضوعات", "Topic Rules"],
  "/app/unanswered": ["أسئلة بلا إجابة", "Unanswered"],
  "/app/backups": ["النسخ الاحتياطي", "Backups"],
  "/app/resources": ["المصادر", "Resources"],
  "/app/actions": ["إجراءات سريعة", "Actions"],
  "/app/commands": ["أوامر البوت", "Commands"],
  "/app/settings": ["الإعدادات", "Settings"],
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { L, lang, toggle } = useI18n();
  const { bot, bots, user, logout, setBotId, reloadBots, toast, toasts, dismissToast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [botMenu, setBotMenu] = React.useState(false);
  const [userMenu, setUserMenu] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [events, setEvents] = React.useState<any[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
    setBotMenu(false);
    setUserMenu(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const title = TITLES[location.pathname] || TITLES["/app"];
  const unanswered = Number(bot?.stats?.unanswered_open || 0);

  const openNotifications = async () => {
    setNotifOpen((value) => !value);
    try {
      const data = await api.get<{ events: any[] }>("/api/events?limit=20");
      setEvents(data.events);
    } catch {
      setEvents([]);
    }
  };

  const toggleStatus = async () => {
    if (!bot) return;
    setStopping(true);
    try {
      await api.patch(`/api/bots/${bot.id}`, { status: bot.status === "active" ? "paused" : "active" });
      await reloadBots();
      toast(bot.status === "active" ? L("تم إيقاف المراقبة مؤقتًا", "Monitoring paused") : L("المراقبة تعمل الآن", "Monitoring resumed"), "success");
    } catch {
      toast(L("تعذر تغيير الحالة", "Could not update status"), "error");
    } finally {
      setStopping(false);
    }
  };

  const navBadge = (item: NavItem) => {
    if (item.badge === "unanswered" && unanswered > 0) {
      return <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{unanswered}</span>;
    }
    if (item.badge === "backup" && bot && bot.health !== "ok") {
      return <span className={cn("ms-auto h-2 w-2 rounded-full", bot.health === "late" ? "bg-amber-400" : "bg-slate-300")} />;
    }
    return null;
  };

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-5">
        <Brand />
        <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <div className="mx-3 mt-1 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-400/30 text-[13px] font-extrabold text-brand-800">
            {bot?.name?.slice(0, 2) || "AI"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-extrabold text-slate-900">{bot?.name || L("مساحة جديدة", "New workspace")}</p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold">
              <span className={cn("h-1.5 w-1.5 rounded-full", bot?.status === "active" ? "bg-emerald-500" : "bg-slate-300")} />
              <span className={bot?.status === "active" ? "text-emerald-600" : "text-slate-400"}>
                {bot?.status === "active" ? L("نشط", "Active") : L("متوقف", "Paused")}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={toggleStatus}
          disabled={!bot || stopping}
          className="mt-3 h-9 w-full rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
        >
          {bot?.status === "active" ? L("إيقاف", "Stop") : L("تشغيل", "Start")}
        </button>
      </div>

      <nav className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
        {NAV.map((group) => (
          <div key={group.en}>
            <SectionLabel>{L(group.ar, group.en)}</SectionLabel>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn("nav-item", isActive && "nav-item-active")}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={18} className={cn("flex-none", isActive ? "text-slate-800" : "text-slate-400")} />
                      <span className="truncate">{L(item.labelAr, item.labelEn)}</span>
                      {navBadge(item)}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-slate-100 px-4 py-4 text-[11px] leading-5 text-slate-500">
        {L("البيانات من آخر نسخة للبوت، وليست إحصاءات مباشرة.", "Data comes from the latest bot snapshot, not a live feed.")}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Icon rail (desktop) */}
      <aside className="hidden w-[68px] flex-none flex-col items-center border-e border-slate-200/70 bg-[#eef3f9] py-4 lg:flex">
        <button onClick={() => navigate("/app")} className="mb-5 flex h-10 w-10 items-center justify-center" title="Alfiqi Control">
          <LogoMark size={36} />
        </button>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          {RAIL.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={L(item.labelAr, item.labelEn)}
              className={({ isActive }) => cn("rail-btn", isActive && "rail-btn-active")}
            >
              <item.icon size={20} />
              {item.badge === "unanswered" && unanswered > 0 ? (
                <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
              ) : null}
            </NavLink>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => navigate("/app/commands")} className="rail-btn" title={L("مساعدة", "Help")}>
            <Sparkles size={19} />
          </button>
          <button
            onClick={() => navigate("/app/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-300 text-[12px] font-extrabold text-brand-950"
            title={user?.name}
          >
            {(user?.name || "A").slice(0, 1).toUpperCase()}
          </button>
        </div>
      </aside>

      {/* Navigation panel (desktop) */}
      <aside className="hidden w-[276px] flex-none border-e border-slate-200/70 bg-white lg:flex">{SidebarBody}</aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-[290px] bg-white shadow-float animate-fade-up">{SidebarBody}</div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[66px] flex-none items-center gap-2 border-b border-slate-200/70 bg-white/90 px-3 backdrop-blur sm:px-5">
          <button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={19} />
          </button>
          <div className="hidden min-w-0 items-center gap-2 text-[12.5px] sm:flex">
            <span className="font-semibold text-slate-400">{L("AI manager", "AI manager")}</span>
            <span className="text-slate-300">/</span>
            <span className="truncate font-bold text-slate-700">{L(title[0], title[1])}</span>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setBotMenu((value) => !value)}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-start transition hover:border-slate-300"
              >
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-brand-50 text-[10.5px] font-extrabold text-brand-700">
                  {bot?.name?.slice(0, 2) || "AI"}
                </span>
                <span className="hidden max-w-[150px] sm:block">
                  <span className="block truncate text-[12px] font-bold leading-tight text-slate-800">{bot?.name || L("لا يوجد بوت", "No bot")}</span>
                  <span className="block truncate text-[10px] leading-tight text-slate-400">
                    {bot?.telegram_username ? `@${bot.telegram_username}` : L("مساحة عمل", "Workspace")}
                  </span>
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {botMenu ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setBotMenu(false)} />
                  <div className="absolute end-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-float">
                    <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{L("مساحات العمل", "Workspaces")}</p>
                    {bots.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setBotId(item.id);
                          setBotMenu(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition hover:bg-slate-50",
                          item.id === bot?.id && "bg-brand-50/60",
                        )}
                      >
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100 text-[10px] font-extrabold text-slate-600">
                          {item.name.slice(0, 2)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-slate-800">{item.name}</span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <span className={cn("h-1.5 w-1.5 rounded-full", item.health === "ok" ? "bg-emerald-500" : item.health === "late" ? "bg-amber-400" : "bg-slate-300")} />
                            {item.health === "ok" ? L("النسخ محدّثة", "Backups healthy") : item.health === "late" ? L("النسخ متأخرة", "Backups late") : L("لا نسخ بعد", "No backups")}
                          </span>
                        </span>
                        {item.id === bot?.id ? <span className="h-2 w-2 rounded-full bg-brand-500" /> : null}
                      </button>
                    ))}
                    <div className="mt-1 border-t border-slate-100 pt-1">
                      <button
                        onClick={() => {
                          setBotMenu(false);
                          setCreateOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-bold text-brand-600 hover:bg-brand-50"
                      >
                        <Plus size={15} /> {L("إضافة بوت", "Add bot")}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <button onClick={toggle} className="icon-btn hidden sm:inline-flex" title={L("تغيير اللغة", "Switch language")}>
              <span className="text-[11px] font-extrabold">{lang === "ar" ? "EN" : "ع"}</span>
            </button>

            <div className="relative">
              <button className="icon-btn" onClick={openNotifications} title={L("التنبيهات", "Notifications")}>
                <Bell size={18} />
                <span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
              </button>
              {notifOpen ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                  <div className="absolute end-0 z-40 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-float">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <p className="text-[12.5px] font-bold text-slate-800">{L("سجل النشاط", "Activity")}</p>
                      <Badge tone="blue">{events.length}</Badge>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {events.length === 0 ? (
                        <p className="px-3 py-6 text-center text-[11.5px] text-slate-400">{L("لا يوجد نشاط بعد", "No activity yet")}</p>
                      ) : (
                        events.map((event) => (
                          <div key={event.id} className="rounded-xl px-3 py-2 hover:bg-slate-50">
                            <p className="text-[11.5px] leading-5 text-slate-700">{event.message}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{new Date(event.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB")}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="relative">
              <button
                onClick={() => setUserMenu((value) => !value)}
                className="ms-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand-300 text-[12px] font-extrabold text-brand-950 ring-2 ring-white"
              >
                {(user?.name || "A").slice(0, 1).toUpperCase()}
              </button>
              {userMenu ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenu(false)} />
                  <div className="absolute end-0 z-40 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-float">
                    <div className="border-b border-slate-100 px-2.5 pb-2.5 pt-1">
                      <p className="truncate text-[12.5px] font-bold text-slate-800">{user?.name}</p>
                      <p className="truncate text-[10.5px] text-slate-400">{user?.email}</p>
                    </div>
                    <button onClick={() => navigate("/app/settings")} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
                      <SettingsIcon size={15} /> {L("الإعدادات والحساب", "Settings & account")}
                    </button>
                    <button onClick={() => navigate("/app/commands")} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
                      <Globe2 size={15} /> {L("أوامر البوت", "Bot commands")}
                    </button>
                    <button
                      onClick={async () => {
                        await logout();
                        navigate("/login");
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <LogOut size={15} /> {L("تسجيل الخروج", "Sign out")}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7">{children}</div>
          <footer className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 px-6 pb-6 pt-2 text-[10.5px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <LogoMark size={16} /> Alfiqi Control — {L("نسخة احتياطية ثانية مستقلة", "an independent second backup")}
            </span>
            <span>{L("البيانات مشفّرة، والنسخ محفوظة على السيرفر + التخزين السحابي اختياريًا", "Encrypted secrets, snapshots kept on disk + optional object storage")}</span>
          </footer>
        </div>
      </main>

      <CreateBotModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] font-semibold shadow-float animate-fade-up",
              item.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : item.type === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <span className="mt-0.5 h-1.5 w-1.5 flex-none rounded-full bg-current opacity-70" />
            <span className="flex-1 leading-5">{item.message}</span>
            <button onClick={() => dismissToast(item.id)} className="opacity-50 hover:opacity-100">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
