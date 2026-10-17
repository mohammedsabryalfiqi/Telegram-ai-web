import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import { useI18n } from "./i18n";

export type User = { id: number; name: string; email: string; created_at: string; last_login_at?: string };
export type Bot = {
  id: number;
  name: string;
  telegram_username: string;
  notes: string;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
  last_backup_at: string | null;
  backup_interval_hours: number;
  credits_total: number;
  credits_used: number;
  key_prefix: string;
  has_key: boolean;
  health: "ok" | "late" | "missing";
  age_hours: number | null;
  snapshot_count: number;
  storage_bytes: number;
  storage_human: string;
  latest_snapshot: { id: number; created_at: string; size_bytes: number; status: string } | null;
  stats: Record<string, number>;
  source_mode: string;
  ingest_url: string;
};

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

type AppContextValue = {
  booting: boolean;
  needsSetup: boolean;
  user: User | null;
  bots: Bot[];
  bot: Bot | null;
  botId: number | null;
  setBotId: (id: number) => void;
  reloadBots: () => Promise<Bot[]>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toast: (message: string, type?: Toast["type"]) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { L } = useI18n();
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [botId, setBotIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("cp_bot");
    return stored ? Number(stored) : null;
  });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const setBotId = useCallback((id: number) => {
    localStorage.setItem("cp_bot", String(id));
    setBotIdState(id);
  }, []);

  const reloadBots = useCallback(async () => {
    const data = await api.get<{ bots: Bot[] }>("/api/bots");
    setBots(data.bots);
    setBotIdState((current) => {
      if (current && data.bots.some((bot) => bot.id === current)) return current;
      const fallback = data.bots[0]?.id ?? null;
      if (fallback) localStorage.setItem("cp_bot", String(fallback));
      return fallback;
    });
    return data.bots;
  }, []);

  const boot = useCallback(async () => {
    setBooting(true);
    try {
      const data = await api.get<{ user: User }>("/api/bootstrap");
      setUser(data.user);
      setNeedsSetup(false);
      await reloadBots();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        try {
          const status = await api.get<{ needs_setup: boolean }>("/api/status");
          setNeedsSetup(Boolean(status.needs_setup));
        } catch {
          setNeedsSetup(false);
        }
      }
    } finally {
      setBooting(false);
    }
  }, [reloadBots]);

  useEffect(() => {
    void boot();
    const onExpired = () => {
      setUser(null);
      setBots([]);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [boot]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ user: User }>("/api/login", { email, password });
    setUser(data.user);
    await reloadBots();
  }, [reloadBots]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/logout");
    } finally {
      setUser(null);
      setBots([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>("/api/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  const bot = useMemo(() => bots.find((item) => item.id === botId) || bots[0] || null, [bots, botId]);

  useEffect(() => {
    if (bot && bot.id !== botId) setBotIdState(bot.id);
  }, [bot, botId]);

  const value: AppContextValue = {
    booting,
    needsSetup,
    user,
    bots,
    bot,
    botId: bot?.id ?? null,
    setBotId,
    reloadBots,
    refreshUser,
    setUser,
    login,
    logout,
    toast,
    toasts,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export function usePageError() {
  const { L } = useI18n();
  const { toast } = useApp();
  return useCallback(
    (error: unknown) => {
      const message =
        error instanceof ApiError ? error.detail : error instanceof Error ? error.message : L("حدث خطأ غير متوقع", "Something went wrong");
      toast(message, "error");
    },
    [toast, L],
  );
}
