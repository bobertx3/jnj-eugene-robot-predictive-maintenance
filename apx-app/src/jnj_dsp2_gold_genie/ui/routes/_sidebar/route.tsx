import SidebarLayout from "@/components/apx/sidebar-layout";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MapPinned,
  MessageCircle,
  ShieldAlert,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_sidebar")({
  component: () => <Layout />,
});

function Layout() {
  const location = useLocation();
  const dashboardsUrl =
    "https://fevm-bobertx3-aws-fevm.cloud.databricks.com/dashboardsv3/01f171bcffe71b7e9d3ab7e8eb58f6c5/published?o=7474645374628060";

  const mainNav = [
    {
      to: "/summary",
      label: "Overview",
      icon: BarChart3,
      match: (path: string) => path === "/summary",
    },
    {
      to: "/genie",
      label: "Ask Genie",
      icon: MessageCircle,
      match: (path: string) => path === "/genie",
    },
    {
      to: "/robot-site-map",
      label: "Robot Site Map",
      icon: MapPinned,
      match: (path: string) => path === "/robot-site-map",
    },
    {
      to: "/maintenance",
      label: "Maintenance",
      icon: ShieldAlert,
      match: (path: string) => path === "/maintenance",
    },
  ];

  return (
    <SidebarLayout>
      <SidebarGroup>
        <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Main Menu
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1 px-1">
            {mainNav.map((item) => {
              const isActive = item.match(location.pathname);
              return (
                <SidebarMenuItem key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Reports
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1 px-1">
            <SidebarMenuItem>
              <a
                href={dashboardsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutDashboard size={18} />
                <span className="flex-1">Dashboards</span>
                <ExternalLink size={12} className="opacity-40" />
              </a>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarLayout>
  );
}
