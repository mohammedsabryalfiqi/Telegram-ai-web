import React from "react";
import {
  BookOpen,
  FileText,
  FileType2,
  Layers,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Upload,
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
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  Tabs,
  cn,
} from "../ui";

type Tab = "files" | "texts" | "notes";

export default function KnowledgePage({ initialTab }: { initialTab?: Tab }) {
  const { L, n, timeAgo } = useI18n();
  const { bot, botId, toast } = useApp();
  const onError = usePageError();
  const [tab, setTab] = React.useState<Tab>(initialTab || "files");
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [textOpen, setTextOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", content: "" });
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [uploadInfo, setUploadInfo] = React.useState<any>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const opened = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!botId) return;
    setLoading(true);
    try {
      setData(await api.get(`/api/bots/${botId}/kb`));
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [botId, onError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (opened.current) return;
    if (!loading && initialTab === "texts") {
      setTextOpen(true);
      opened.current = true;
    }
    if (!loading && initialTab === "files") {
      setUploadOpen(true);
      opened.current = true;
    }
  }, [initialTab, loading]);

  const itemType = (item: any) => {
    const name = (item.filename || item.title || "").toLowerCase();
    if (name.endsWith(".pdf")) return { icon: FileType2, label: "PDF", tone: "bg-rose-50 text-rose-500" };
    if (name.endsWith(".docx")) return { icon: FileText, label: "DOCX", tone: "bg-blue-50 text-blue-500" };
    if (name.endsWith(".md")) return { icon: FileText, label: "MD", tone: "bg-violet-50 text-violet-500" };
    if (item.source_type === "text") return { icon: NotebookPen, label: L("نص", "Text"), tone: "bg-amber-50 text-amber-600" };
    return { icon: FileText, label: L("ملف", "File"), tone: "bg-slate-100 text-slate-500" };
  };

  const addText = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setBusy(true);
    try {
      const result = await api.post(`/api/bots/${botId}/kb/text`, form);
      setData({ ...data, items: result.items });
      setTextOpen(false);
      setForm({ title: "", content: "" });
      toast(L("تمت إضافة النص لقاعدة المعرفة", "Text added to the knowledge base"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api.upload(`/api/bots/${botId}/kb/file`, file);
      setData({ ...data, items: result.items });
      setUploadInfo(result);
      setFile(null);
      toast(L(`تم استخراج ${result.chars} حرفًا وإضافتها`, `${result.chars} characters extracted and added`), "success");
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
      const result = await api.del(`/api/bots/${botId}/kb/items/${deleteId}`);
      setData({ ...data, items: result.items });
      setDeleteId(null);
      toast(L("تم حذف العنصر", "Item deleted"), "success");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!bot) return <Spinner />;
  if (loading) return <Spinner />;

  const items: any[] = (data?.items || []).filter((item: any) => {
    if (tab === "files") return item.source_type !== "text";
    if (tab === "texts") return item.source_type === "text";
    return true;
  });
  const filtered = items.filter((item: any) => !search.trim() || `${item.title} ${item.preview}`.toLowerCase().includes(search.toLowerCase()));
  const notes: any[] = data?.notes || [];

  return (
    <>
      <PageHeader
        eyebrow={bot.name}
        title={L("قاعدة المعرفة", "Knowledge Base")}
        subtitle={L("كل ما يعرفه المساعد: ملفات، نصوص، وسياسات — تُستخدم في الردود والاختبار.", "Everything the assistant knows: files, text and policies used for replies and testing.")}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>{L("رفع ملف", "Upload file")}</Button>
            <Button icon={Plus} onClick={() => setTextOpen(true)}>{L("إضافة نص", "Add text")}</Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label={L("عناصر المعرفة", "Knowledge items")} value={n(data?.items?.length || 0)} icon={BookOpen} tone="bg-brand-50 text-brand-600" />
        <MiniStat label={L("أجزاء مفهرسة", "Indexed chunks")} value={n(data?.chunks || 0)} icon={Layers} tone="bg-violet-50 text-violet-600" />
        <MiniStat label={L("ملاحظات اللوحة", "Dashboard notes")} value={n(notes.length)} icon={NotebookPen} tone="bg-amber-50 text-amber-600" />
        <MiniStat label={L("حالة القاعدة", "KB status")} value={data?.kb_enabled ? L("مفعّلة", "Enabled") : L("متوقفة", "Off")} icon={Search} tone={data?.kb_enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"} />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          items={[
            { id: "files", label: L("الملفات", "Files"), count: (data?.items || []).filter((item: any) => item.source_type !== "text").length },
            { id: "texts", label: L("النصوص", "Texts"), count: (data?.items || []).filter((item: any) => item.source_type === "text").length },
            { id: "notes", label: L("ملاحظات اللوحة", "Dashboard notes"), count: notes.length },
          ]}
        />
        <div className="flex items-center gap-2">
          {data?.strict ? <Badge tone="amber">{L("وضع المعرفة الصارم", "Strict KB mode")}</Badge> : null}
          <SearchInput value={search} onChange={setSearch} className="w-56" placeholder={L("بحث في المعرفة…", "Search knowledge…")} />
        </div>
      </div>

      {tab !== "notes" ? (
        filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item: any) => {
              const meta = itemType(item);
              return (
                <Card key={item.id} className="group flex flex-col">
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl", meta.tone)}>
                      <meta.icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-slate-800">{item.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>{meta.label}</span> · <span>{n(item.chunks || item.chunk_count || 0)} {L("جزء", "chunks")}</span> · <span>{timeAgo(item.created_at)}</span>
                      </p>
                    </div>
                    <button className="icon-btn text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100" onClick={() => setDeleteId(item.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-3 line-clamp-4 flex-1 text-[11px] leading-6 text-slate-500">
                    {item.preview || L("لا معاينة متاحة لهذا العنصر.", "No preview available for this item.")}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                    <span>{item.filename || L("محتوى نصي", "Text content")}</span>
                    <Badge tone={item.source_type === "text" ? "amber" : "blue"}>{meta.label}</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={L("لا عناصر في هذا القسم", "Nothing here yet")}
            description={L("ارفع ملف PDF/DOCX/TXT أو أضف نصًا ليتعلمه المساعد.", "Upload a PDF/DOCX/TXT or add text for the assistant to learn.")}
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>{L("رفع ملف", "Upload")}</Button>
                <Button size="sm" icon={Plus} onClick={() => setTextOpen(true)}>{L("إضافة نص", "Add text")}</Button>
              </div>
            }
          />
        )
      ) : notes.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note: any) => (
            <Card key={note.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><NotebookPen size={16} /></div>
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-800">{note.title}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(note.created_at)}</p>
                  </div>
                </div>
                <Badge tone="amber">{L("نص", "Text")}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-line text-[11.5px] leading-6 text-slate-500">{note.content.slice(0, 280)}{note.content.length > 280 ? "…" : ""}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                <span>{L("من لوحة التحكم", "From the dashboard")}</span>
                <button
                  className="font-bold text-brand-600 hover:text-brand-700"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.del(`/api/bots/${botId}/notes/${note.id}`);
                      setData({ ...data, notes: notes.filter((item: any) => item.id !== note.id) });
                    } catch (error) {
                      onError(error);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {L("حذف", "Delete")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={NotebookPen} title={L("لا ملاحظات من اللوحة", "No dashboard notes")} description={L("أضف نصًا سريعًا من زر «إضافة نص».", "Add a quick note with “Add text”.")} />
      )}

      <Modal
        open={textOpen}
        onClose={() => setTextOpen(false)}
        title={L("إضافة نص لقاعدة المعرفة", "Add text to the knowledge base")}
        subtitle={L("سيُقسَّم النص إلى أجزاء ويُزامَن مع البوت.", "The text is chunked and synced to the bot.")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTextOpen(false)}>{L("إلغاء", "Cancel")}</Button>
            <Button onClick={addText} loading={busy}>{L("إضافة", "Add")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L("العنوان", "Title")}>
            <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={L("سياسة التوصيل", "Delivery policy")} />
          </Field>
          <Field label={L("المحتوى", "Content")} hint={L("حتى 200 ألف حرف", "Up to 200k characters")}>
            <textarea className="textarea min-h-[190px]" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder={L("اكتب المعلومات كاملة…", "Write the full information…")} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setUploadInfo(null);
        }}
        title={L("رفع ملف معرفة", "Upload a knowledge file")}
        subtitle={L("PDF · DOCX · TXT · MD · CSV — حتى 15 MB", "PDF · DOCX · TXT · MD · CSV — up to 15 MB")}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setUploadOpen(false); setUploadInfo(null); }}>{L("إغلاق", "Close")}</Button>
            <Button onClick={upload} disabled={!file} loading={busy} icon={Upload}>{L("رفع واستخراج", "Upload & extract")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
              dragging ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-slate-50/60 hover:border-brand-300",
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm"><FileText size={22} /></div>
            <p className="mt-1 text-sm font-bold text-slate-700">{file ? file.name : L("اسحب الملف هنا أو اضغط للاختيار", "Drop a file here or click to choose")}</p>
            <p className="text-[11px] text-slate-400">{file ? fmtBytes(file.size) : L("نستخرج النص تلقائيًا ثم نفهرسه", "Text is extracted and chunked automatically")}</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.md,.csv"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          {uploadInfo ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[11.5px] leading-6 text-emerald-800">
              {L(
                `تم استخراج ${uploadInfo.chars} حرفًا من «${uploadInfo.title}» وإضافتها كأجزاء معرفة.`,
                `Extracted ${uploadInfo.chars} characters from “${uploadInfo.title}” and added them as knowledge chunks.`,
              )}
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        loading={busy}
        title={L("حذف عنصر المعرفة؟", "Delete this knowledge item?")}
        description={L("سيُحذف العنصر وأجزاؤه من نسخة البوت بعد مزامنة الوكيل.", "The item and its chunks are removed from the bot after the agent syncs.")}
        confirmLabel={L("حذف", "Delete")}
      />
    </>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl", tone)}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-[16px] font-extrabold text-slate-900">{value}</p>
      </div>
    </Card>
  );
}
