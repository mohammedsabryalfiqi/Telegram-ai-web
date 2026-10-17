import React from "react";
import { Layers3, Plus, Search, Trash2 } from "lucide-react";
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

export default function RulesPage() {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, toast } = useApp();
  const onError = usePageError();
  const [rules, setRules] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ topic: "", rule: "", priority: 100, enabled: true });

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/bots/${botId}/rules`);
      setRules(data.rules || []);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (rule: any) => {
    const next = !Number(rule.enabled);
    setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, enabled: next ? 1 : 0 } : item)));
    try {
      const result = await api.patch(`/api/bots/${botId}/rules/${rule.id}`, { enabled: next });
      setRules(result.rules || []);
      toast(next ? L("تم تفعيل القاعدة", "Rule enabled") : L("تم إيقاف القاعدة", "Rule disabled"), "success");
    } catch (error) {
      setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, enabled: next ? 0 : 1 } : item)));
      onError(error);
    }
  };

  const add = async () => {
    if (!form.topic.trim() || !form.rule.trim()) return;
    setBusy(true);
    try {
      const result = await api.post(`/api/bots/${botId}/rules`, form);
      setRules(result.rules || []);
      setAddOpen(false);
      setForm({ topic: "", rule: "", priority: 100, enabled: true });
      toast(L("تمت إضافة القاعدة", "Rule added"), "success");
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
      const result = await api.del(`/api/bots/${botId}/rules/${deleteId}`);
      setRules(result.rules || []);
      setDeleteId(null);
      toast(L("تم حذف القاعدة", "Rule deleted"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const active = rules.filter((rule) => Number(rule.enabled) === 1).length;
  const filtered = rules
    .filter((rule) => (filter === "all" ? true : filter === "active" ? Number(rule.enabled) === 1 : Number(rule.enabled) !== 1))
    .filter((rule) => !search.trim() || `${rule.topic} ${rule.rule}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("قواعد الموضوعات", "Topic Rules")}
        subtitle={L("قواعد مكتوبة بكلماتك تُضاف لكل رد — حدود الردود الشخصية وما لا يجب فعله.", "Your own rules injected into every reply — personal reply boundaries and guardrails.")}
        actions={<Button icon={Plus} onClick={() => setAddOpen(true)}>{L("إضافة قاعدة", "Add rule")}</Button>}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center justify-between p-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("مفعّلة", "Enabled")}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none text-slate-900">{n(active)}</p>
          </div>
          <Badge tone="green" dot>{L("تعمل الآن", "Live")}</Badge>
        </div>
        <div className="card flex items-center justify-between p-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("إجمالي القواعد", "Total rules")}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none text-slate-900">{n(rules.length)}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Layers3 size={18} /></div>
        </div>
        <div className="card flex items-center justify-between p-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-400">{L("أولوية", "Priority")}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none text-slate-900">{rules.length ? n(Math.min(...rules.map((rule) => Number(rule.priority || 100)))) : "—"}</p>
          </div>
          <Badge tone="blue">{L("أعلى أولوية", "Highest")}</Badge>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: "all", label: L("الكل", "All"), count: rules.length },
            { id: "active", label: L("مفعّلة", "Enabled"), count: active },
            { id: "disabled", label: L("متوقفة", "Disabled"), count: rules.length - active },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} className="w-60" placeholder={L("ابحث في القواعد…", "Search rules…")} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Layers3}
          title={L("لا قواعد مطابقة", "No matching rules")}
          description={L("أضف قاعدة قصيرة وواضحة، أو غيّر عامل التصفية.", "Add a short, clear rule or change the filter.")}
          action={<Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>{L("إضافة قاعدة", "Add rule")}</Button>}
        />
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((rule) => {
              const isOn = Number(rule.enabled) === 1;
              return (
                <div key={rule.id} className={cn("flex items-start gap-3 px-4 py-4 transition sm:px-5", isOn ? "bg-white" : "bg-slate-50/40")}>
                  <div className={cn("mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl", isOn ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400")}>
                    <Layers3 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-[13px] font-bold", isOn ? "text-slate-800" : "text-slate-500")}>{rule.topic}</p>
                      <Badge tone={rule.source === "dashboard" ? "violet" : "slate"}>
                        {rule.source === "dashboard" ? L("من اللوحة", "Dashboard") : L("من البوت", "Bot")}
                      </Badge>
                      <span className="text-[10px] text-slate-400">{L("أولوية", "Priority")} {rule.priority}</span>
                      {Number(rule.hits) > 0 ? <span className="text-[10px] text-slate-400">· {n(rule.hits)} {L("تطبيق", "hits")}</span> : null}
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-6 text-slate-500">{rule.rule}</p>
                    <p className="mt-1 text-[9.5px] text-slate-400">{timeAgo(rule.created_at)}</p>
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <Switch checked={isOn} onChange={() => void toggle(rule)} />
                    <button className="icon-btn text-slate-300 hover:text-rose-500" onClick={() => setDeleteId(rule.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-[11px] leading-6 text-brand-900">
        <Search size={14} className="mt-0.5 flex-none" />
        {L(
          "كل تعديل يُطبَّق فورًا على نسخة اللوحة، ويُزامَن مع قاعدة البوت الحقيقية عبر الوكيل (كل 6 ساعات افتراضيًا).",
          "Every edit applies to the dashboard copy instantly and syncs to the real bot database through the agent (every 6h by default).",
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={L("إضافة قاعدة موضوع", "Add a topic rule")}
        subtitle={L("اكتبها كتعليم واضح للمساعد.", "Write it as a clear instruction.")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={add} loading={busy}>{L("إضافة", "Add")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L("الموضوع", "Topic")}>
            <input className="input" value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} placeholder={L("الشحن والتوصيل", "Delivery")} />
          </Field>
          <Field label={L("القاعدة", "Rule")}>
            <textarea className="textarea" value={form.rule} onChange={(event) => setForm({ ...form, rule: event.target.value })} placeholder={L("التوصيل داخل دمياط 60 جنيهًا، ومجاني فوق 3000 جنيه.", "Delivery inside Damietta is EGP 60, free above EGP 3,000.")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={L("الأولوية", "Priority")} hint={L("الأقل = أولوية أعلى", "Lower = higher priority")}>
              <input type="number" min={1} max={999} className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) || 100 })} />
            </Field>
            <Field label={L("مفعّلة فورًا", "Enable now")}>
              <div className="flex h-[42px] items-center">
                <Switch checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
              </div>
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        loading={busy}
        title={L("حذف القاعدة؟", "Delete this rule?")}
        description={L("ستُزال من نسخة البوت بعد مزامنة الوكيل.", "It is removed from the bot after the agent syncs.")}
        confirmLabel={L("حذف", "Delete")}
      />
    </>
  );
}
