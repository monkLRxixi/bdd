import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

import type { DownloadProgress } from "@/lib/types";
import { useDownloadStore } from "@/stores/downloads";

/**
 * Bridges backend download events into the task store and toast notifications.
 */
export function DownloadEvents() {
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let disposed = false;

    listen<DownloadProgress>("download:progress", (event) => {
      const progress = event.payload;
      useDownloadStore.getState().applyProgress(progress);
      const task = useDownloadStore.getState().tasks[progress.id];

      if (progress.status === "done") {
        toast.success("下载完成", {
          description: task
            ? `${task.title}${task.isMulti ? ` · P${task.page}` : ""}`
            : undefined,
        });
      } else if (progress.status === "error") {
        toast.error("下载失败", { description: progress.message });
      } else if (progress.status === "canceled") {
        toast("已取消下载", {
          description: task?.title,
        });
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else dispose = unlisten;
    });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  return null;
}
