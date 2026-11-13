import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { DownloadEvents } from "@/components/download-events";
import { Sidebar } from "@/components/sidebar";
import { TitleBar } from "@/components/title-bar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountPage } from "@/pages/account";
import { DownloadsPage } from "@/pages/downloads";
import { HomePage } from "@/pages/home";
import { SettingsPage } from "@/pages/settings";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  useEffect(() => {
    useAuthStore.getState().refresh();
    useSettingsStore.getState().load();
  }, []);

  return (
    <TooltipProvider delay={350}>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TitleBar />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <DownloadEvents />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
