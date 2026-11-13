import { Link, useLocation } from "react-router-dom";
import {
  Download,
  Search,
  Settings as SettingsIcon,
  Sun,
  Moon,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useActiveTaskCount } from "@/stores/downloads";
import { useUiStore } from "@/stores/settings";

function RailLink({
  to,
  label,
  icon,
  badge,
  avatar,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: boolean;
  avatar?: { src: string; name: string } | null;
}) {
  const { pathname } = useLocation();
  const active = pathname === to;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={to}
            aria-label={label}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active &&
                "bg-sidebar-accent text-sidebar-primary ring-1 ring-inset ring-primary/20",
            )}
          >
            {avatar ? (
              <Avatar size="sm" className="size-6">
                <AvatarImage
                  src={avatar.src}
                  alt={avatar.name}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="text-[10px]">
                  {avatar.name.slice(0, 1) || "B"}
                </AvatarFallback>
              </Avatar>
            ) : (
              icon
            )}
            {badge ? (
              <span className="absolute top-1.5 right-1.5 flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full border border-sidebar bg-red-500" />
              </span>
            ) : null}
          </Link>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {children}
          </button>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const activeCount = useActiveTaskCount();
  const user = useAuthStore((state) => state.user);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  return (
    <aside className="flex w-[68px] shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-4">
      <Link
        to="/"
        aria-label="BiliDown"
        className="mb-4 block size-10 overflow-hidden rounded-[10px] shadow-sm ring-1 ring-black/5 transition-transform duration-200 hover:scale-[1.04] active:scale-95 dark:ring-white/10"
      >
        <img
          src="/bdd-icon.png"
          alt="BiliDown"
          className="size-full object-cover"
        />
      </Link>

      <nav className="flex w-full flex-col items-center gap-1.5 px-2">
        <RailLink
          to="/"
          label="解析视频"
          icon={<Search className="size-[21px]" strokeWidth={1.9} />}
        />
        <RailLink
          to="/downloads"
          label="下载任务"
          badge={activeCount > 0}
          icon={<Download className="size-[21px]" strokeWidth={1.9} />}
        />
        <RailLink
          to="/account"
          label="账号"
          avatar={user ? { src: user.face, name: user.uname } : null}
          icon={<UserRound className="size-[21px]" strokeWidth={1.9} />}
        />
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-1.5 px-2">
        <RailButton
          label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
          onClick={toggleTheme}
        >
          {theme === "light" ? (
            <Moon className="size-[19px]" strokeWidth={1.9} />
          ) : (
            <Sun className="size-[19px]" strokeWidth={1.9} />
          )}
        </RailButton>
        <RailLink
          to="/settings"
          label="设置"
          icon={<SettingsIcon className="size-[19px]" strokeWidth={1.9} />}
        />
      </div>
    </aside>
  );
}
