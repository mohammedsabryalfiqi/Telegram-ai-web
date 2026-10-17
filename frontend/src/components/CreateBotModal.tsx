import React from "react";
import { Bot as BotIcon, Plus } from "lucide-react";
import { api, ApiError } from "../api";
import { useApp, type Bot } from "../context";
import { useI18n } from "../i18n";
import { Button, Field, Modal } from "../ui";
import ConnectPanel from "./ConnectPanel";

export default function CreateBotModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (bot: Bot) => void;
}) {
  const { L } = useI18n();
  const { reloadBots, setBotId, toast } = useApp();
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [interval, setIntervalHours] = React.useState(6);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ api_key: string; agent_command: string; ingest_url: string; bot: Bot } | null>(null);

  const reset = () => {
    setName("");
    setUsername("");
    setIntervalHours(6);
    setError("");
    setResult(null);
    setSaving(false);
  };

  const close = () => {
    onClose();
    setTimeout(reset, 200);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError(L("اكتب اسمًا للبوت أولًا", "Give the bot a name first"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await api.post("/api/bots", {
        name: name.trim(),
        telegram_username: username.trim(),
        backup_interval_hours: interval,
      });
      setResult(data);
      const bots = await reloadBots();
      const created = bots.find((item) => item.id === data.bot?.id);
      if (created) {
        setBotId(created.id);
        onCreated?.(created);
      }
      toast(L("تم إنشاء البوت ومفتاح النسخ", "Bot and backup key created"), "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : L("تعذر إنشاء البوت", "Could not create the bot"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? L("اربط البوت بالسيرفر", "Connect the bot") : L("إضافة بوت جديد", "Add a new bot")}
      subtitle={
        result
          ? L("خطوتان فقط: شغّل الوكيل، وستظهر أول نسخة تلقائيًا.", "Two steps: run the agent and the first snapshot appears automatically.")
          : L("ستحصل على مفتاح نسخ احتياطي وأمر جاهز للتشغيل.", "You will get a backup key and a ready-to-run command.")
      }
      size="lg"
      footer={
        result ? (
          <Button onClick={close}>{L("تم", "Done")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={submit} loading={saving} icon={Plus}>{L("إنشاء البوت", "Create bot")}</Button>
          </>
        )
      }
    >
      {result ? (
        <ConnectPanel apiKey={result.api_key} command={result.agent_command} ingestUrl={result.ingest_url} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <BotIcon size={18} />
            </div>
            <p className="pt-0.5 text-[12px] leading-6 text-slate-500">
              {L(
                "اسم البوت هنا للعرض فقط — اكتب نفس الاسم الذي تعرفه به. لا تحتاج توكن البوت، فالوكيل يقرأ الـ Volume مباشرة.",
                "The name is just a label. You do not need the bot token — the agent reads the volume directly.",
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L("اسم البوت", "Bot name")}>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="بوت الدكتور محمد الفقي" autoFocus />
            </Field>
            <Field label={L("يوزر تليجرام (اختياري)", "Telegram username (optional)")}>
              <input className="input" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@alfiqi_ai_bot" />
            </Field>
            <Field label={L("كل كم ساعة نسخة؟", "Backup every (hours)")} hint={L("ينصح بـ 6 ساعات أو أقل.", "6 hours or less is recommended.")}>
              <input className="input" type="number" min={1} max={168} value={interval} onChange={(event) => setIntervalHours(Number(event.target.value) || 6)} />
            </Field>
          </div>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
