import SidebarLayout from "@/components/apx/sidebar-layout";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { LayoutDashboard, MapPinned, MessageCircle, ShieldAlert, Table2 } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_sidebar")({
  component: () => <Layout />,
});

function Layout() {
  const location = useLocation();
  const dashboardsUrl =
    "https://fevm-stable-classic-zso77x-bx3.cloud.databricks.com/dashboardsv3/01f11eedfd371059bf337742a63b77bf/published?isDbOne=true&utm_source=databricks-one&o=7474651859788188";

  const navItems = [
    {
      to: "/summary",
      label: "Overview",
      icon: <Table2 size={16} />,
      match: (path: string) => path === "/summary",
    },
    {
      to: "/genie",
      label: "Ask Genie",
      icon: <MessageCircle size={16} />,
      match: (path: string) => path === "/genie",
    },
    {
      to: "/robot-site-map",
      label: "Robot Site Map",
      icon: <MapPinned size={16} />,
      match: (path: string) => path === "/robot-site-map",
    },
    {
      to: "/maintenance",
      label: "Maintenance Page",
      icon: <ShieldAlert size={16} />,
      match: (path: string) => path === "/maintenance",
    },
  ];

  return (
    <SidebarLayout>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    item.match(location.pathname)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem key="dashboards-external">
              <a
                href={dashboardsUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <LayoutDashboard size={16} />
                <span>Dashboards</span>
              </a>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarLayout>
  );
}
