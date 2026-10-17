import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { useApp } from "../context";
import { useI18n } from "../i18n";
import { ApiError } from "../api";
import AuthLayout from "./AuthLayout";
import { Button } from "../ui";

export default function LoginPage() {
  const { L } = useI18n();
  const { login, toast } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      toast(L("أهلاً بيك 👋", "Welcome back 👋"), "success");
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : L("تعذر تسجيل الدخول", "Could not sign in"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-[27px] font-extrabold tracking-tight text-slate-900">{L("تسجيل الدخول", "Sign in")}</h2>
        <p className="mt-2 text-[13px] leading-7 text-slate-500">
          {L("ادخل لمتابعة البوت ونسخه الاحتياطية.", "Sign in to monitor your bot and its backups.")}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">{L("البريد الإلكتروني", "Email")}</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
            <input
              type="email"
              required
              autoComplete="email"
              className="input h-12 ps-10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <label className="label">{L("كلمة المرور", "Password")}</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute inset-y-0 start-3.5 my-auto text-slate-400" />
            <input
              type="password"
              required
              autoComplete="current-password"
              className="input h-12 ps-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
        </div>
        {error ? <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12px] font-semibold text-rose-600">{error}</p> : null}
        <Button type="submit" className="h-12 w-full" loading={busy} icon={ArrowLeft}>
          {L("دخول", "Sign in")}
        </Button>
      </form>

      <p className="mt-6 text-center text-[11px] leading-6 text-slate-400">
        {L("الوصول محصور بمالك البوت. كلمة المرور مشفّرة ولا تُخزَّن كنص.", "Owner-only access. Passwords are hashed, never stored in plain text.")}
      </p>
    </AuthLayout>
  );
}
