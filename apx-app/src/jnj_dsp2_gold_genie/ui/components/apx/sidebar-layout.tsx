import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/apx/mode-toggle";
import Logo from "@/components/apx/logo";
import { ArchitectureButton } from "@/components/apx/architecture-modal";
import { Separator } from "@/components/ui/separator";

interface SidebarLayoutProps {
  children?: ReactNode;
}

function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar className="border-r-0">
        <SidebarHeader className="px-4 py-5">
          <Logo showIcon={false} />
        </SidebarHeader>
        <Separator className="mx-4 w-auto opacity-50" />
        <SidebarContent className="px-2 py-3">{children}</SidebarContent>
        <SidebarFooter className="px-4 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>System Online</span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-muted/30">
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1 cursor-pointer" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1" />
          <ArchitectureButton />
          <ModeToggle />
        </header>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
          <div className="flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-5 p-4 md:p-6">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
export default SidebarLayout;
