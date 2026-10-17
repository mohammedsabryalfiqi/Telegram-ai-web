import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useApp } from "./context";
import { useI18n } from "./i18n";
import AppShell from "./layout/AppShell";
import LoginPage from "./pages/Login";
import SetupPage from "./pages/Setup";
import OverviewPage from "./pages/Overview";
import AnalyticsPage from "./pages/Analytics";
import TrainingPage from "./pages/Training";
import TestingPage from "./pages/Testing";
import KnowledgePage from "./pages/Knowledge";
import RulesPage from "./pages/Rules";
import UnansweredPage from "./pages/Unanswered";
import BackupsPage from "./pages/Backups";
import ResourcesPage from "./pages/Resources";
import ActionsPage from "./pages/Actions";
import CommandsPage from "./pages/Commands";
import SettingsPage from "./pages/Settings";
import { LogoMark } from "./layout/Brand";

function Splash() {
  const { L } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50">
      <LogoMark size={56} />
      <div className="text-center">
        <p className="text-sm font-bold text-slate-800">Alfiqi Control</p>
        <p className="mt-1 text-xs text-slate-400">{L("جارٍ تحميل مساحة العمل…", "Loading your workspace…")}</p>
      </div>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { booting, needsSetup, user } = useApp();
  if (booting) return <Splash />;
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { booting, needsSetup, user } = useApp();
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          booting ? <Splash /> : user ? <Navigate to="/app" replace /> : needsSetup ? <SetupPage /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={booting ? <Splash /> : user ? <Navigate to="/app" replace /> : needsSetup ? <Navigate to="/setup" replace /> : <LoginPage />}
      />
      <Route
        path="/app/*"
        element={
          <Protected>
            <AppShell>
              <Routes>
                <Route index element={<OverviewPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="training" element={<TrainingPage />} />
                <Route path="testing" element={<TestingPage />} />
                <Route path="knowledge" element={<KnowledgePage />} />
                <Route path="files" element={<KnowledgePage initialTab="files" />} />
                <Route path="text" element={<KnowledgePage initialTab="texts" />} />
                <Route path="rules" element={<RulesPage />} />
                <Route path="unanswered" element={<UnansweredPage />} />
                <Route path="backups" element={<BackupsPage />} />
                <Route path="resources" element={<ResourcesPage />} />
                <Route path="actions" element={<ActionsPage />} />
                <Route path="commands" element={<CommandsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to={user ? "/app" : needsSetup && !booting ? "/setup" : "/login"} replace />} />
    </Routes>
  );
}
