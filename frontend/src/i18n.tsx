import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Lang = "ar" | "en";

type I18n = {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  toggle: () => void;
  L: (ar: string, en: string) => string;
  n: (value: number | undefined | null) => string;
  timeAgo: (iso: string | null | undefined) => string;
  date: (iso: string | null | undefined, withTime?: boolean) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem("cp_lang");
    return stored === "en" ? "en" : "ar";
  });

  const setLang = (value: Lang) => {
    setLangState(value);
    localStorage.setItem("cp_lang", value);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
    const n = (input: number | undefined | null) =>
      new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { useGrouping: true }).format(Number(input || 0));
    const timeAgo = (iso?: string | null) => {
      if (!iso) return L("لا يوجد", "Never");
      const then = new Date(iso).getTime();
      if (Number.isNaN(then)) return "—";
      const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
      if (seconds < 60) return L("الآن", "Just now");
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return L(`منذ ${minutes} دقيقة`, `${minutes}m ago`);
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return L(`منذ ${hours} ساعة`, `${hours}h ago`);
      const days = Math.floor(hours / 24);
      if (days < 30) return L(`منذ ${days} يوم`, `${days}d ago`);
      return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB");
    };
    const date = (iso?: string | null, withTime = false) => {
      if (!iso) return "—";
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return "—";
      const options: Intl.DateTimeFormatOptions = {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      };
      return parsed.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", options);
    };
    return { lang, dir, setLang, toggle: () => setLang(lang === "ar" ? "en" : "ar"), L, n, timeAgo, date };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
