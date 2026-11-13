import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";

function WindowButton({
  children,
  onClick,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-9 w-11 items-center justify-center text-muted-foreground transition-colors",
        danger
          ? "hover:bg-red-500 hover:text-white"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    appWindow.isMaximized().then(setMaximized);
    appWindow
      .onResized(() => {
        appWindow.isMaximized().then(setMaximized);
      })
      .then((unlisten) => {
        dispose = unlisten;
      });
    return () => dispose?.();
  }, [appWindow]);

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 w-full shrink-0 items-center justify-between border-b border-border/70 bg-background/80 pl-4 select-none"
    >
      <div
        data-tauri-drag-region
        className="flex flex-1 items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase"
      >
        <span className="size-1.5 rounded-full bg-primary" />
        BiliDown
        <span className="hidden text-muted-foreground/50 sm:inline">
          · 视频下载器
        </span>
      </div>
      <div className="flex h-full items-center">
        <WindowButton label="最小化" onClick={() => appWindow.minimize()}>
          <Minus className="size-4" />
        </WindowButton>
        <WindowButton
          label={maximized ? "还原" : "最大化"}
          onClick={() => appWindow.toggleMaximize()}
        >
          {maximized ? (
            <Copy className="size-3.5" />
          ) : (
            <Square className="size-3.5" />
          )}
        </WindowButton>
        <WindowButton label="关闭" danger onClick={() => appWindow.close()}>
          <X className="size-4" />
        </WindowButton>
      </div>
    </header>
  );
}
