import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  Cloud,
  Database,
  Globe2,
  HardDrive,
  KeyRound,
  Loader2,
  Lock,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
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
  ConfirmDialog,
  CopyButton,
  Field,
  PageHeader,
  Spinner,
  Switch,
  Tabs,
  cn,
} from "../ui";
import ConnectPanel from "../components/ConnectPanel";

type Tab = "general" | "storage" | "ai" | "bot" | "account" | "connect";

export default function SettingsPage() {
  const { L, lang, toggle, n } = useI18n();
  const { bot, botId, reloadBots, refreshUser, user, toast } = useApp();
  const navigate = useNavigate();
  const onError = usePageError();
  const [tab, setTab] = React.useState<Tab>("general");
  const [settings, setSettings] = React.useState<any>(null);
  const [system, setSystem] = React.useState<any>(null);
  const [connect, setConnect] = React.useState<any>(null);
  const [aiConfig, setAiConfig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<any>(null);
  const [keyData, setKeyData] = React.useState<any>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [general, setGeneral] = React.useState({ retention_days: 30, keep_last_snapshots: 40 });
  const [storage, setStorage] = React.useState({
    s3_endpoint: "",
    s3_bucket: "",
    s3_region: "auto",
    s3_access_key: "",
    s3_secret_key: "",
    s3_prefix: "alfiqi-backups",
    s3_keep_local: true,
  });
  const [ai, setAi] = React.useState({ provider: "openai", model: "", base_url: "", api_key: "" });
  const [botForm, setBotForm] = React.useState({ name: "", telegram_username: "", backup_interval_hours: 6 });
  const [password, setPassword] = React.useState({ current_password: "", new_password: "", confirm: "" });

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const [appSettings, systemInfo, connectInfo, ai] = await Promise.all([
        api.get("/api/settings"),
        api.get("/api/system").catch(() => null),
        api.get(`/api/bots/${botId}/connect`).catch(() => null),
        api.get("/api/ai/config"),
      ]);
      setSettings(appSettings);
      setSystem(systemInfo);
      setConnect(connectInfo);
      setAiConfig(ai);
      setGeneral(appSettings.general || {});
      setStorage({
        s3_endpoint: appSettings.storage?.s3_endpoint || "",
        s3_bucket: appSettings.storage?.s3_bucket || "",
        s3_region: appSettings.storage?.s3_region || "auto",
        s3_access_key: "",
        s3_secret_key: "",
        s3_prefix: appSettings.storage?.s3_prefix || "alfiqi-backups",
        s3_keep_local: appSettings.storage?.s3_keep_local ?? true,
      });
      setAi({ provider: ai.provider, model: ai.model, base_url: ai.base_url, api_key: "" });
      const currentBot = connectInfo?.bot;
      if (currentBot) {
        setBotForm({
          name: currentBot.name,
          telegram_username: currentBot.telegram_username || "",
          backup_interval_hours: currentBot.backup_interval_hours,
        });
      }
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveGeneral = async () => {
    setSaving("general");
    try {
      const data = await api.put("/api/settings/general", general);
      setSettings({ ...settings, general: data.general });
      toast(L("تم حفظ إعدادات الاحتفاظ", "Retention settings saved"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const saveStorage = async () => {
    setSaving("storage");
    try {
      const data = await api.put("/api/settings/storage", storage);
      setSettings({ ...settings, storage: data.storage });
      setStorage((current) => ({ ...current, s3_secret_key: "" }));
      toast(L("تم حفظ إعدادات التخزين", "Storage settings saved"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const testStorage = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post("/api/settings/storage/test");
      setTestResult(result);
      toast(result.ok ? L("تم الاتصال بالحاوية", "Bucket reachable") : result.message, result.ok ? "success" : "error");
    } catch (error) {
      onError(error);
    } finally {
      setTesting(false);
    }
  };

  const saveAi = async () => {
    setSaving("ai");
    try {
      const data = await api.put("/api/ai/config", ai);
      setAiConfig(data.config);
      setAi((current) => ({ ...current, api_key: "" }));
      toast(L("تم حفظ إعدادات الذكاء الاصطناعي", "AI settings saved"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const saveBot = async () => {
    setSaving("bot");
    try {
      await api.patch(`/api/bots/${botId}`, botForm);
      await reloadBots();
      toast(L("تم حفظ بيانات البوت", "Bot profile saved"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const rotate = async () => {
    setSaving("key");
    try {
      const result = await api.post(`/api/bots/${botId}/key`);
      setKeyData(result);
      await reloadBots();
      toast(L("تم تدوير المفتاح", "Key rotated"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const changePassword = async () => {
    if (password.new_password !== password.confirm) {
      toast(L("كلمتا المرور غير متطابقتين", "Passwords do not match"), "error");
      return;
    }
    setSaving("password");
    try {
      await api.post("/api/me/password", { current_password: password.current_password, new_password: password.new_password });
      setPassword({ current_password: "", new_password: "", confirm: "" });
      toast(L("تم تغيير كلمة المرور", "Password changed"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setSaving("");
    }
  };

  const deleteBot = async () => {
    setBusy(true);
    try {
      await api.del(`/api/bots/${botId}`);
      setDeleteOpen(false);
      await reloadBots();
      toast(L("تم حذف مساحة العمل", "Workspace deleted"), "success");
      navigate("/app");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const presets = aiConfig?.presets || [];
  const activePreset = presets.find((preset: any) => preset.id === ai.provider);

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("الإعدادات", "Settings")}
        subtitle={L("التخزين السحابي، مزوّد الذكاء الاصطناعي، المزامنة، وحسابك.", "Object storage, AI provider, sync and your account.")}
        actions={<Button variant="secondary" icon={Globe2} onClick={toggle}>{lang === "ar" ? "English" : "العربية"}</Button>}
      />

      <div className="mb-5 overflow-x-auto">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          items={[
            { id: "general", label: L("عام", "General") },
            { id: "storage", label: L("التخزين", "Storage") },
            { id: "ai", label: L("الذكاء الاصطناعي", "AI") },
            { id: "bot", label: L("البوت", "Bot") },
            { id: "connect", label: L("الاتصال", "Connection") },
            { id: "account", label: L("الحساب", "Account") },
          ]}
        />
      </div>

      {tab === "general" ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle title={L("الاحتفاظ بالنسخ", "Backup retention")} subtitle={L("كم نسخة نحتفظ بها محليًا؟ S3 لا يتأثر بهذه السياسة.", "How many snapshots to keep locally? S3 is not affected.")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("الاحتفاظ بعدد النسخ", "Keep last snapshots")} hint={L("آخر 40 نسخة لكل بوت", "Last 40 per bot")}>
                <input type="number" min={1} max={1000} className="input" value={general.keep_last_snapshots} onChange={(event) => setGeneral({ ...general, keep_last_snapshots: Number(event.target.value) })} />
              </Field>
              <Field label={L("الاحتفاظ بالأيام", "Keep for days")} hint={L("0 = بلا حد زمني", "0 = no age limit")}>
                <input type="number" min={0} max={3650} className="input" value={general.retention_days} onChange={(event) => setGeneral({ ...general, retention_days: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-3 text-[11px] leading-6 text-amber-900">
              <ShieldCheck size={14} className="mt-0.5 flex-none" />
              {L("لا تُحذف النسخة الأحدث أبدًا. النسخ المرفوعة إلى S3 تبقى حتى لو حُذفت محليًا.", "The newest snapshot is never deleted. S3 copies survive local cleanup.")}
            </div>
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
              <Button onClick={saveGeneral} loading={saving === "general"} icon={Save}>{L("حفظ", "Save")}</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle title={L("النظام", "System")} action={<Server size={16} className="text-slate-400" />} />
              <div className="space-y-2 text-[11.5px]">
                <Row label={L("الإصدار", "Version")} value={system?.version || "1.0.0"} />
                <Row label={L("Python", "Python")} value={system?.python || "—"} />
                <Row label={L("البوتات", "Bots")} value={n(system?.bots || 0)} />
                <Row label={L("النسخ", "Snapshots")} value={`${n(system?.snapshots || 0)} · ${system?.snapshot_human || "0 B"}`} />
                <Row label={L("نسخ محلية", "Local backups")} value={system?.local_backups || "—"} />
                <Row label={L("مساحة حرة", "Disk free")} value={system?.disk_free || "—"} />
                <Row label={L("مجلد البيانات", "Data dir")} value={<span dir="ltr" className="text-[10px]">{system?.data_dir || "—"}</span>} />
              </div>
            </Card>
            <Card className="bg-brand-50/40">
              <div className="flex items-start gap-2.5">
                <Sparkles size={16} className="mt-0.5 flex-none text-brand-600" />
                <div>
                  <p className="text-[12px] font-bold text-slate-800">{L("نسخة مستقلة", "An independent copy")}</p>
                  <p className="mt-1 text-[11px] leading-6 text-slate-500">
                    {L(
                      "هذه اللوحة تعمل بشكل مستقل عن خدمة البوت. فقدان Volume لا يؤثر على النسخ المحفوظة هنا.",
                      "This console runs independently from the bot service. Losing the volume does not touch snapshots stored here.",
                    )}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "storage" ? (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardTitle
              title={L("تخزين S3 متوافق", "S3-compatible storage")}
              subtitle={L("Cloudflare R2 / Backblaze B2 / AWS S3 / MinIO — نسخة ثالثة خارج Railway.", "Cloudflare R2 / Backblaze B2 / AWS S3 / MinIO — a third copy outside Railway.")}
              action={<Badge tone={settings?.storage?.s3_enabled ? "green" : "amber"} dot>{settings?.storage?.s3_enabled ? L("متصل", "On") : L("غير مهيأ", "Off")}</Badge>}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("Endpoint", "Endpoint")} hint="https://<account>.r2.cloudflarestorage.com" className="sm:col-span-2">
                <input className="input" dir="ltr" value={storage.s3_endpoint} onChange={(event) => setStorage({ ...storage, s3_endpoint: event.target.value })} placeholder="https://…" />
              </Field>
              <Field label={L("اسم الحاوية", "Bucket")}>
                <input className="input" dir="ltr" value={storage.s3_bucket} onChange={(event) => setStorage({ ...storage, s3_bucket: event.target.value })} placeholder="alfiqi-backups" />
              </Field>
              <Field label={L("المنطقة", "Region")} hint="auto لـ R2">
                <input className="input" dir="ltr" value={storage.s3_region} onChange={(event) => setStorage({ ...storage, s3_region: event.target.value })} placeholder="auto" />
              </Field>
              <Field label={L("Access Key", "Access key")}>
                <input className="input" dir="ltr" value={storage.s3_access_key} onChange={(event) => setStorage({ ...storage, s3_access_key: event.target.value })} placeholder={settings?.storage?.s3_access_key_masked || "AKIA…"} />
              </Field>
              <Field label={L("Secret Key", "Secret key")} hint={settings?.storage?.secret_configured ? L("محفوظ ومشفّر — اتركه فارغًا للإبقاء", "Stored encrypted — leave blank to keep") : L("يُشفَّر قبل الحفظ", "Encrypted at rest")}>
                <input className="input" dir="ltr" type="password" value={storage.s3_secret_key} onChange={(event) => setStorage({ ...storage, s3_secret_key: event.target.value })} placeholder="••••••••" />
              </Field>
              <Field label={L("المجلد", "Prefix")}>
                <input className="input" dir="ltr" value={storage.s3_prefix} onChange={(event) => setStorage({ ...storage, s3_prefix: event.target.value })} placeholder="alfiqi-backups" />
              </Field>
              <Field label={L("الاحتفاظ بالنسخة المحلية", "Keep a local copy")} hint={L("موصى به — S3 احتياط إضافي", "Recommended — S3 is an extra copy")}>
                <div className="flex h-[42px] items-center">
                  <Switch checked={storage.s3_keep_local} onChange={(value) => setStorage({ ...storage, s3_keep_local: value })} />
                </div>
              </Field>
            </div>

            {testResult ? (
              <div className={cn("mt-3 flex items-start gap-2 rounded-xl px-3.5 py-3 text-[11px] leading-6", testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
                <CheckCircle2 size={14} className="mt-0.5 flex-none" />
                {testResult.message}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={testStorage} loading={testing} icon={Cloud}>{L("اختبار الاتصال", "Test connection")}</Button>
              <Button onClick={saveStorage} loading={saving === "storage"} icon={Save}>{L("حفظ الإعدادات", "Save settings")}</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle title={L("كيف يعمل التخزين؟", "How storage works")} />
              <div className="space-y-3">
                {[
                  { ar: "كل نسخة تُحفظ على قرص السيرفر.", en: "Every snapshot is stored on the server disk." },
                  { ar: "ثم تُرفع نسخة مطابقة إلى الحاوية السحابية.", en: "An identical copy is uploaded to the bucket." },
                  { ar: "يمكن تنزيل أي نسخة من السحابة بعد حذف الملف المحلي.", en: "Any snapshot can be fetched back from the cloud." },
                ].map((step, index) => (
                  <div key={step.en} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">{index + 1}</span>
                    <p className="text-[11px] leading-6 text-slate-500">{L(step.ar, step.en)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[10.5px] leading-5 text-slate-500">
                {L("Cloudflare R2 يمنح 10GB مجانًا شهريًا — كافية لآلاف النسخ الصغيرة.", "Cloudflare R2 includes 10 GB free monthly — plenty for thousands of small snapshots.")}
              </div>
            </Card>
            <Card>
              <CardTitle title={L("الاستخدام المحلي", "Local usage")} />
              <div className="flex items-end justify-between">
                <p className="text-[24px] font-extrabold leading-none text-slate-900">{settings?.storage?.local_usage_human || fmtBytes(system?.snapshot_bytes)}</p>
                <Badge tone="slate"><HardDrive size={11} /> {system?.disk_free ? `${system.disk_free} ${L("حرة", "free")}` : "—"}</Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, ((settings?.storage?.local_usage || 0) / Math.max(1, (system?.snapshot_bytes || 1) * 10)) * 100)}%` }} />
              </div>
              <p className="mt-2 text-[10.5px] text-slate-400">{L("المساحة المخصصة للنسخ على السيرفر", "Backup disk usage on this server")}</p>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "ai" ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle
              title={L("مزوّد الذكاء الاصطناعي", "AI provider")}
              subtitle={L("يُستخدم في شاشة الاختبار فقط — لا يغيّر مزوّد البوت نفسه.", "Used by the Testing screen only — it does not change the bot's own provider.")}
              action={<Badge tone={aiConfig?.has_key ? "green" : "amber"} dot>{aiConfig?.has_key ? L("مفتاح محفوظ", "Key saved") : L("بلا مفتاح", "No key")}</Badge>}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("المزوّد", "Provider")}>
                <select
                  className="input"
                  value={ai.provider}
                  onChange={(event) => {
                    const preset = presets.find((item: any) => item.id === event.target.value);
                    setAi({ ...ai, provider: event.target.value, model: preset?.model || ai.model, base_url: preset?.base_url || "" });
                  }}
                >
                  {presets.map((preset: any) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={L("النموذج", "Model")}>
                <input className="input" dir="ltr" value={ai.model} onChange={(event) => setAi({ ...ai, model: event.target.value })} placeholder={activePreset?.model || "gpt-4.1-mini"} />
              </Field>
              <Field label={L("Base URL", "Base URL")} className="sm:col-span-2" hint={L("يُملأ تلقائيًا حسب المزوّد — عدّله للبوابات المخصصة", "Auto-filled per provider — edit for custom gateways")}>
                <input className="input" dir="ltr" value={ai.base_url} onChange={(event) => setAi({ ...ai, base_url: event.target.value })} placeholder="https://api.openai.com/v1" />
              </Field>
              <Field
                label={L("مفتاح API", "API key")}
                className="sm:col-span-2"
                hint={
                  aiConfig?.has_key
                    ? `${L("المفتاح الحالي", "Current key")}: ${aiConfig.key_masked} — ${L("اتركه فارغًا للإبقاء", "leave blank to keep")}`
                    : L("يُشفَّر قبل الحفظ ولا يظهر مرة أخرى", "Encrypted before saving and never shown again")
                }
              >
                <input className="input" dir="ltr" type="password" value={ai.api_key} onChange={(event) => setAi({ ...ai, api_key: event.target.value })} placeholder="sk-…" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => navigate("/app/testing")} icon={Zap}>{L("اختبار الآن", "Test now")}</Button>
                {aiConfig?.has_key ? (
                  <Button
                    variant="ghost"
                    loading={saving === "clear"}
                    onClick={async () => {
                      setSaving("clear");
                      try {
                        const data = await api.put("/api/ai/config", { ...ai, api_key: "", clear_key: true });
                        setAiConfig(data.config);
                        toast(L("تم حذف المفتاح", "Key removed"), "success");
                      } catch (error) {
                        onError(error);
                      } finally {
                        setSaving("");
                      }
                    }}
                  >
                    {L("حذف المفتاح", "Remove key")}
                  </Button>
                ) : null}
              </div>
              <Button onClick={saveAi} loading={saving === "ai"} icon={Save}>{L("حفظ", "Save")}</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle title={L("نصيحة", "Tip")} />
              <p className="text-[11.5px] leading-7 text-slate-500">
                {L(
                  "يمكنك ترك المفتاح فارغًا واستخدام «المحاكاة المحلية» في شاشة الاختبار — تعمل بدون إنترنت أو رصيد، وتعتمد على الردود السريعة وقاعدة المعرفة.",
                  "You can leave the key empty and use “Local simulation” in Testing — it works without internet or credit, using quick answers and the knowledge base.",
                )}
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10.5px] leading-5 text-slate-500">
                <Lock size={13} className="mt-0.5 flex-none" />
                {L("جميع المفاتيح مشفّرة بمفتاح التطبيق (Fernet).", "All keys are encrypted with the app secret (Fernet).")}
              </div>
            </Card>
            <Card>
              <CardTitle title={L("مزوّد البوت الفعلي", "The bot's own provider")} />
              <p className="text-[11.5px] leading-6 text-slate-500">
                {L("من آخر نسخة احتياطية", "From the latest snapshot")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone="blue">{bot.stats?.ai_provider || L("غير معروف", "Unknown")}</Badge>
                <Badge tone="slate">{L("يُدار من داخل تليجرام", "Managed inside Telegram")}</Badge>
              </div>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate("/app/training")}>
                {L("فتح التدريب", "Open training")}
              </Button>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "bot" ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle title={L("بيانات البوت", "Bot profile")} subtitle={L("اسم العرض وجدول النسخ.", "Display name and backup schedule.")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("الاسم", "Name")}>
                <input className="input" value={botForm.name} onChange={(event) => setBotForm({ ...botForm, name: event.target.value })} />
              </Field>
              <Field label={L("يوزر تليجرام", "Telegram username")}>
                <input className="input" dir="ltr" value={botForm.telegram_username} onChange={(event) => setBotForm({ ...botForm, telegram_username: event.target.value })} placeholder="@bot" />
              </Field>
              <Field label={L("كل كم ساعة نسخة؟", "Backup interval")}>
                <input type="number" min={1} max={168} className="input" value={botForm.backup_interval_hours} onChange={(event) => setBotForm({ ...botForm, backup_interval_hours: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
              <Button onClick={saveBot} loading={saving === "bot"} icon={Save}>{L("حفظ", "Save")}</Button>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardTitle title={L("الوضع الحالي", "Current state")} />
              <div className="space-y-2 text-[11.5px]">
                <Row label={L("المصدر", "Source")} value={bot.source_mode === "demo" ? L("تجريبي", "Demo") : L("وكيل", "Agent")} />
                <Row label={L("النسخ", "Snapshots")} value={n(bot.snapshot_count)} />
                <Row label={L("الحجم", "Storage")} value={bot.storage_human} />
                <Row label={L("آخر نسخة", "Last backup")} value={bot.last_backup_at ? new Date(bot.last_backup_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB") : "—"} />
              </div>
            </Card>
            <Card className="border-rose-100 bg-rose-50/30">
              <CardTitle title={L("منطقة الخطر", "Danger zone")} subtitle={L("حذف مساحة العمل والنسخ المرتبطة بها.", "Delete this workspace and its snapshots.")} />
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setDeleteOpen(true)}>
                {L("حذف المساحة", "Delete workspace")}
              </Button>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "connect" ? (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardTitle title={L("ربط الوكيل", "Connect the agent")} subtitle={L("الوكيل هو مصدر النسخ والتزامن.", "The agent is the source of snapshots and sync.")} />
            <ConnectPanel
              command={connect?.agent_command || ""}
              ingestUrl={connect?.ingest_url || `${window.location.origin}/api/ingest`}
              onRotate={rotate}
              rotating={saving === "key"}
            />
          </Card>
          <div className="space-y-5">
            <Card>
              <CardTitle title={L("حالة المفتاح", "Key status")} />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><KeyRound size={17} /></div>
                <div>
                  <p className="text-[12px] font-bold text-slate-800">{bot.has_key ? L("مفتاح نشط", "Active key") : L("لا مفتاح", "No key")}</p>
                  <code dir="ltr" className="text-[10px] text-slate-400">{bot.key_prefix || "—"}</code>
                </div>
              </div>
              <Button size="sm" variant="secondary" className="mt-3" onClick={rotate} loading={saving === "key"} icon={KeyRound}>
                {L("تدوير المفتاح", "Rotate key")}
              </Button>
            </Card>
            <Card>
              <CardTitle title={L("خطوات التشغيل", "Run steps")} />
              <ol className="space-y-2 text-[11px] leading-6 text-slate-500">
                <li>1. {L("انسخ backup_agent.py إلى مجلد البوت.", "Copy backup_agent.py into the bot folder.")}</li>
                <li>2. {L("ضع أمر التشغيل في حاوية Railway.", "Paste the command into the Railway container.")}</li>
                <li>3. {L("أول نسخة تظهر خلال دقائق.", "The first snapshot appears in minutes.")}</li>
              </ol>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "account" ? (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardTitle title={L("حساب المالك", "Owner account")} subtitle={L("بيانات تسجيل الدخول للوحة التحكم.", "Dashboard sign-in details.")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L("الاسم", "Name")}>
                <input className="input" value={user?.name || ""} disabled />
              </Field>
              <Field label={L("البريد", "Email")}>
                <input className="input" dir="ltr" value={user?.email || ""} disabled />
              </Field>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-[13px] font-bold text-slate-800">{L("تغيير كلمة المرور", "Change password")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label={L("الحالية", "Current")}>
                  <input type="password" dir="ltr" className="input" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} />
                </Field>
                <Field label={L("الجديدة", "New")}>
                  <input type="password" dir="ltr" className="input" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} />
                </Field>
                <Field label={L("تأكيد", "Confirm")}>
                  <input type="password" dir="ltr" className="input" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} />
                </Field>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={changePassword} loading={saving === "password"} icon={Lock}>{L("تغيير", "Change")}</Button>
              </div>
            </div>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardTitle title={L("تفاصيل الحساب", "Account details")} />
              <div className="space-y-2 text-[11.5px]">
                <Row label={L("تاريخ الإنشاء", "Created")} value={user?.created_at ? new Date(user.created_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB") : "—"} />
                <Row label={L("آخر دخول", "Last login")} value={user?.last_login_at ? new Date(user.last_login_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB") : "—"} />
                <Row label={L("المصادقة", "Auth")} value={L("جلسة مشفّرة (JWT)", "Signed session (JWT)")} />
              </div>
            </Card>
            <Card>
              <CardTitle title={L("اللغة", "Language")} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11.5px] text-slate-500">{L("لغة واجهة لوحة التحكم", "Dashboard interface language")}</p>
                <Button size="sm" variant="secondary" onClick={toggle}>{lang === "ar" ? "English" : "العربية"}</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteBot}
        loading={busy}
        title={L("حذف مساحة العمل؟", "Delete this workspace?")}
        description={L(
          "سيتم حذف كل نسخ هذا البوت وملفات المعرفة المحلية. لا يمكن التراجع. تأكد من وجود نسخة على S3 أو جهازك أولًا.",
          "All snapshots and local knowledge files for this bot are deleted. This cannot be undone. Make sure you have a copy on S3 or your device first.",
        )}
        confirmLabel={L("حذف نهائي", "Delete permanently")}
      />

      {keyData ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={() => setKeyData(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-float sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{L("مفتاح النسخ الجديد", "Your new backup key")}</h2>
                <p className="mt-1 text-xs text-slate-400">{L("يُعرض مرة واحدة فقط.", "Shown only once.")}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setKeyData(null)}>{L("إغلاق", "Close")}</Button>
            </div>
            <ConnectPanel apiKey={keyData.api_key} command={keyData.agent_command} ingestUrl={keyData.ingest_url} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="max-w-[200px] truncate font-semibold text-slate-700" dir="auto">{value}</span>
    </div>
  );
}
