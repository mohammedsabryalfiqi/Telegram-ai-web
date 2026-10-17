import React from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { useApp, usePageError } from "../context";
import { useI18n } from "../i18n";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  Switch,
  Tabs,
  cn,
} from "../ui";

const KINDS = [
  { id: "site", ar: "موقع", en: "Website", icon: Globe2, tone: "bg-brand-50 text-brand-600" },
  { id: "telegram", ar: "تليجرام", en: "Telegram", icon: Send, tone: "bg-sky-50 text-sky-600" },
  { id: "link", ar: "رابط", en: "Link", icon: Link2, tone: "bg-violet-50 text-violet-600" },
  { id: "text", ar: "نص", en: "Text", icon: FileText, tone: "bg-amber-50 text-amber-600" },
];

export default function ResourcesPage() {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, toast } = useApp();
  const onError = usePageError();
  const [resources, setResources] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ kind: "site", title: "", url: "", notes: "" });

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/bots/${botId}/resources`);
      setResources(data.resources || []);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (resource: any) => {
    const next = !Number(resource.enabled);
    setResources((current) => current.map((item) => (item.id === resource.id ? { ...item, enabled: next ? 1 : 0 } : item)));
    try {
      const data = await api.patch(`/api/bots/${botId}/resources/${resource.id}`, { enabled: next });
      setResources(data.resources || []);
    } catch (error) {
      setResources((current) => current.map((item) => (item.id === resource.id ? { ...item, enabled: next ? 0 : 1 } : item)));
      onError(error);
    }
  };

  const add = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const data = await api.post(`/api/bots/${botId}/resources`, form);
      setResources(data.resources || []);
      setAddOpen(false);
      setForm({ kind: "site", title: "", url: "", notes: "" });
      toast(L("تمت إضافة المصدر", "Resource added"), "success");
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
      const data = await api.del(`/api/bots/${botId}/resources/${deleteId}`);
      setResources(data.resources || []);
      setDeleteId(null);
      toast(L("تم حذف المصدر", "Resource deleted"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const enabled = resources.filter((resource) => Number(resource.enabled) === 1).length;
  const filtered = resources
    .filter((resource) => (filter === "all" ? true : filter === "active" ? Number(resource.enabled) === 1 : Number(resource.enabled) !== 1))
    .filter((resource) => !search.trim() || `${resource.title} ${resource.url} ${resource.notes}`.toLowerCase().includes(search.toLowerCase()));
  const meta = (kind: string) => KINDS.find((item) => item.id === kind) || KINDS[2];

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("المصادر", "Resources")}
        subtitle={L("روابط ومواقع ومجموعات يمكن للمساعد مشاركتها بدلًا من اختراع الروابط.", "Links, sites and groups the assistant can share instead of inventing URLs.")}
        actions={<Button icon={Plus} onClick={() => setAddOpen(true)}>{L("إضافة مصدر", "Add resource")}</Button>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Link2 size={19} /></div>
          <div><p className="text-[10.5px] font-semibold text-slate-400">{L("الإجمالي", "Total")}</p><p className="text-[22px] font-extrabold leading-none text-slate-900">{n(resources.length)}</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><BookOpen size={19} /></div>
          <div><p className="text-[10.5px] font-semibold text-slate-400">{L("مفعّلة", "Enabled")}</p><p className="text-[22px] font-extrabold leading-none text-slate-900">{n(enabled)}</p></div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Globe2 size={19} /></div>
          <div><p className="text-[10.5px] font-semibold text-slate-400">{L("مواقع وروابط", "Sites & links")}</p><p className="text-[22px] font-extrabold leading-none text-slate-900">{n(resources.filter((resource) => resource.kind !== "text").length)}</p></div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: L("الكل", "All"), count: resources.length },
            { id: "active", label: L("مفعّلة", "Enabled"), count: enabled },
            { id: "disabled", label: L("متوقفة", "Disabled"), count: resources.length - enabled },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} className="w-60" placeholder={L("ابحث في المصادر…", "Search resources…")} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Link2}
          title={L("لا مصادر مطابقة", "No matching resources")}
          description={L("أضف موقعًا أو قناة أو رابطًا ليستخدمه المساعد في ردوده.", "Add a website, channel or link the assistant may use.")}
          action={<Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>{L("إضافة مصدر", "Add resource")}</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((resource) => {
            const info = meta(resource.kind);
            const isOn = Number(resource.enabled) === 1;
            return (
              <Card key={resource.id} className={cn("group flex flex-col", !isOn && "bg-slate-50/60")}>
                <div className="flex items-start gap-3">
                  <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl", info.tone)}>
                    <info.icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-slate-800">{resource.title}</p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Badge tone={isOn ? "green" : "slate"}>{L(info.ar, info.en)}</Badge>
                      <span>{timeAgo(resource.created_at)}</span>
                    </div>
                  </div>
                  <Switch checked={isOn} onChange={() => void toggle(resource)} />
                </div>

                {resource.url ? (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 flex items-center gap-1.5 truncate rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] text-brand-600 hover:underline"
                    dir="ltr"
                  >
                    <ExternalLink size={11} className="flex-none" /> <span className="truncate">{resource.url}</span>
                  </a>
                ) : null}

                <p className="mt-2.5 line-clamp-3 flex-1 text-[11px] leading-6 text-slate-500">
                  {resource.notes || L("لا ملاحظات إضافية.", "No extra notes.")}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="text-[10px] text-slate-400">
                    {Number(resource.chars) > 0 ? `${n(resource.chars)} ${L("حرفًا مفهرسًا", "indexed chars")}` : L("مرجع مباشر", "Direct reference")}
                  </span>
                  <button className="icon-btn text-slate-300 hover:text-rose-500" onClick={() => setDeleteId(resource.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إضافة مصدر", "Add a resource")}
        subtitle={L("سيُشارك المساعد الرابط كما هو، ولن يخترع روابط أخرى.", "The assistant will share this exact link and stop inventing URLs.")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={add} loading={busy}>{L("إضافة", "Add")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L("النوع", "Type")}>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((kind) => (
                <button
                  key={kind.id}
                  type="button"
                  onClick={() => setForm({ ...form, kind: kind.id })}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-[12px] font-semibold transition",
                    form.kind === kind.id ? "border-brand-300 bg-brand-50/60 text-brand-800" : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  <kind.icon size={15} /> {L(kind.ar, kind.en)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={L("العنوان", "Title")}>
            <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={L("الموقع الرسمي", "Official website")} />
          </Field>
          <Field label={L("الرابط", "URL")} hint={form.kind === "text" ? L("اختياري للنصوص", "Optional for text resources") : L("https://…", "https://…")}>
            <input className="input" dir="ltr" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com" />
          </Field>
          <Field label={L("ملاحظات", "Notes")} hint={L("اشرح متى يستخدمه المساعد", "Explain when the assistant should use it")}>
            <textarea className="textarea min-h-[90px]" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={L("الأسعار والكتالوج الرسمي", "Official prices and catalogue")} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        loading={busy}
        title={L("حذف المصدر؟", "Delete this resource?")}
        description={L("سيُزال من نسخة البوت بعد مزامنة الوكيل.", "It will be removed from the bot after the agent syncs.")}
        confirmLabel={L("حذف", "Delete")}
      />
    </>
  );
}
