import { ViewTransition } from "react";
import { Sidebar } from "./_components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ViewTransition name="page-content">{children}</ViewTransition>
      </main>
    </div>
  );
}
