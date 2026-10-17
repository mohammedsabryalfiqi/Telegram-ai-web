import React from "react";
import { DatabaseZap, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import { LogoMark } from "../layout/Brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { L } = useI18n();
  const points = [
    { icon: DatabaseZap, ar: "نسخة احتياطية ثانية كل 6 ساعات خارج الـ Volume", en: "A second copy every 6h, outside the volume" },
    { icon: ShieldCheck, ar: "استعادة بضغطة واحدة مع تحقق من سلامة قاعدة البيانات", en: "One-click restore with SQLite integrity checks" },
    { icon: LineChart, ar: "متابعة المحادثات والأسئلة غير المجابة واستهلاك الذكاء الاصطناعي", en: "Track chats, unanswered questions and AI usage" },
  ];
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#08243f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-70" style={{
          backgroundImage:
            "radial-gradient(circle at 15% 10%, rgba(56,168,255,.35), transparent 40%), radial-gradient(circle at 85% 80%, rgba(0,111,206,.45), transparent 45%)",
        }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <LogoMark size={42} />
            <div>
              <p className="text-[16px] font-extrabold">Alfiqi Control</p>
              <p className="text-[11px] text-sky-200/80">{L("لوحة إدارة ونسخ احتياطي للبوت", "Bot operations & backup console")}</p>
            </div>
          </div>
          <h1 className="mt-16 max-w-md text-[34px] font-extrabold leading-[1.35]">
            {L("بوتك شغّال؟", "Your bot is running.")}
            <br />
            <span className="text-sky-300">{L("خلّي بياناته في أمان.", "Keep its data safe.")}</span>
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-8 text-sky-100/75">
            {L(
              "نسخة احتياطية مستقلة من قاعدة البيانات والملفات، مع لوحة متابعة بنفس أسلوب ChatPlace — حتى لو ضاع Volume السيرفر، الاستعادة جاهزة.",
              "An independent snapshot of your database and files, with a ChatPlace-style dashboard. Even if the server volume is lost, restore is ready.",
            )}
          </p>
          <div className="mt-10 space-y-3">
            {points.map((point) => (
              <div key={point.en} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-sky-400/15 text-sky-300">
                  <point.icon size={16} />
                </div>
                <p className="text-[12.5px] leading-6 text-sky-50/90">{L(point.ar, point.en)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[11px] text-sky-200/60">
          <Sparkles size={13} />
          {L("مصمّم لبوت دكتور الخطوط / Tg-bot-ai", "Built for Doctor of Fonts / Tg-bot-ai")}
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={38} />
            <div>
              <p className="text-[15px] font-extrabold text-slate-900">Alfiqi Control</p>
              <p className="text-[10.5px] text-slate-400">{L("لوحة إدارة البوت", "Bot operations")}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
