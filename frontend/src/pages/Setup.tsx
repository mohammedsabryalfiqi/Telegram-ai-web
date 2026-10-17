import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Mail, User2 } from "lucide-react";
import { useApp } from "../context";
import { useI18n } from "../i18n";
import { ApiError } from "../api";
import AuthLayout from "./AuthLayout";
import { Button } from "../ui";

export default function SetupPage() {
  const { L } = useI18n();
  const { setUser, toast } = useApp();
  const navigate = useNavigate();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError(L("كلمة المرور 8 أحرف على الأقل", "Use at least 8 characters"));
      return;
    }
    if (password !== confirm) {
      setError(L("كلمتا المرور غير متطابقتين", "Passwords do not match"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(response.status, data?.detail || "Setup failed");
      setUser(data.user);
      toast(L("تم إنشاء حساب المالك", "Owner account created"), "success");
      setTimeout(() => {
        window.location.href = "/app";
      }, 150);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : L("تعذر إكمال الإعداد", "Setup could not be completed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-8">
        <span className="chip mb-3 bg-brand-50 text-brand-700">{L("الخطوة الأولى", "First run")}</span>
        <h2 className="text-[27px] font-extrabold tracking-tight text-slate-900">{L("أنشئ حساب المالك", "Create the owner account")}</h2>
        <p className="mt-2 text-[13px] leading-7 text-slate-500">
          {L("هذا الحساب يدير لوحة التحكم والنسخ الاحتياطية. لا علاقة له بحساب تليجرام.", "This account controls the dashboard and backups. It is not your Telegram login.")}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">{L("الاسم", "Name")}</label>
          <div className="relative">
            <User2 size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
            <input required className="input h-12 ps-10" value={name} onChange={(event) => setName(event.target.value)} placeholder={L("محمد صبري", "Mohammed")} />
          </div>
        </div>
        <div>
          <label className="label">{L("البريد الإلكتروني", "Email")}</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
            <input required type="email" dir="ltr" className="input h-12 ps-10" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{L("كلمة المرور", "Password")}</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
              <input required type="password" dir="ltr" className="input h-12 ps-10" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters" />
            </div>
          </div>
          <div>
            <label className="label">{L("تأكيد كلمة المرور", "Confirm")}</label>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
              <input required type="password" dir="ltr" className="input h-12 ps-10" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="••••••••" />
            </div>
          </div>
        </div>
        {error ? <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12px] font-semibold text-rose-600">{error}</p> : null}
        <Button type="submit" className="h-12 w-full" loading={busy} icon={ArrowLeft}>
          {L("إنشاء الحساب وبدء اللوحة", "Create account & open dashboard")}
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-[11.5px] leading-6 text-slate-500">
        <p className="font-bold text-slate-700">{L("مساحة تجريبية جاهزة", "A demo workspace is ready")}</p>
        <p className="mt-1">
          {L(
            "ستجد بوتًا تجريبيًا بثلاث نسخ احتياطية لتجربة كل الشاشات. اربط بوتك الحقيقي ثم احذف المساحة التجريبية.",
            "You will find a demo bot with three snapshots so every screen works. Connect your real bot, then delete the demo.",
          )}
        </p>
      </div>
    </AuthLayout>
  );
}
