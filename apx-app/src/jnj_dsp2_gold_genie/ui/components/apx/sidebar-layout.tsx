import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/apx/mode-toggle";
import Logo from "@/components/apx/logo";

interface SidebarLayoutProps {
  children?: ReactNode;
}

function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-2">
            <Logo showIcon={false} />
          </div>
        </SidebarHeader>
        <SidebarContent>{children}</SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="flex h-dvh min-h-dvh flex-col overflow-hidden">
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-primary/20 bg-background/95 px-3 backdrop-blur-sm md:px-4">
          <SidebarTrigger className="-ml-1 cursor-pointer" />
          <div className="flex-1" />
          <ModeToggle />
        </header>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
          <div className="flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 p-3 md:p-4">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
export default SidebarLayout;
