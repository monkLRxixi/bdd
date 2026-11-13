import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  DownloadCloud,
  FolderOpen,
  Loader2,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { api, errorText } from "@/lib/api";
import { formatBytes, formatSpeed, etaText } from "@/lib/format";
import { isActive, isFinished, useDownloadStore } from "@/stores/downloads";
import type { DownloadTask } from "@/stores/downloads";

function phaseLabel(task: DownloadTask): string {
  if (task.status === "queued") return "排队中";
  if (task.status === "merging") return task.message || "正在合并…";
  if (task.status === "done") return "已完成";
  if (task.status === "canceled") return "已取消";
  if (task.status === "error") return task.message || "下载失败";
  switch (task.phase) {
    case "prepare":
      return "正在获取播放地址…";
    case "video":
      return "下载视频流";
    case "audio":
      return "下载音频流";
    case "mp4":
      return "下载 MP4";
    case "cover":
      return "保存封面";
    case "merge":
      return "正在合并…";
    default:
      return task.message || "下载中";
  }
}

function StatusPill({ task }: { task: DownloadTask }) {
  const map: Record<string, string> = {
    downloading: "bg-accent text-accent-foreground",
    merging: "bg-accent text-accent-foreground",
    queued: "bg-muted text-muted-foreground",
    done: "bg-primary/10 text-primary",
    error: "bg-destructive/10 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        map[task.status] ?? map.queued,
      )}
    >
      {isActive(task.status) ? (
        <Loader2 className="size-3 animate-spin" />
      ) : task.status === "done" ? (
        <CheckCircle2 className="size-3" />
      ) : task.status === "error" ? (
        <XCircle className="size-3" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {task.status === "downloading"
        ? "下载中"
        : task.status === "merging"
          ? "合并中"
          : task.status === "queued"
            ? "排队中"
            : task.status === "done"
              ? "已完成"
              : task.status === "error"
                ? "失败"
                : "已取消"}
    </span>
  );
}

function TaskRow({ task }: { task: DownloadTask }) {
  const cancelTask = useDownloadStore((state) => state.markCanceled);
  const remove = useDownloadStore((state) => state.remove);
  const percent =
    task.status === "done" ? 100 : Math.max(0, Math.min(100, task.percent));

  const cancel = async () => {
    cancelTask(task.id);
    try {
      await api.cancelDownload(task.id);
    } catch (error) {
      toast.error("取消失败", { description: errorText(error) });
    }
  };

  const reveal = async () => {
    if (!task.file) {
      toast("文件路径尚未就绪");
      return;
    }
    try {
      await revealItemInDir(task.file);
    } catch (error) {
      toast.error("无法打开文件夹", { description: errorText(error) });
    }
  };

  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/90">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg",
            task.status === "error"
              ? "bg-destructive/10 text-destructive"
              : task.status === "done"
                ? "bg-primary/10 text-primary"
                : "bg-accent text-accent-foreground",
          )}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="size-4.5" />
          ) : task.status === "error" ? (
            <XCircle className="size-4.5" />
          ) : (
            <DownloadCloud className="size-4.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{task.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {task.isMulti ? `P${task.page} · ` : ""}
                {task.part || "视频"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
                {task.mode === "dash" ? task.quality : "MP4 单文件"}
              </Badge>
              <StatusPill task={task} />
              {isActive(task.status) ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="取消下载"
                  title="取消下载"
                  onClick={cancel}
                >
                  <X className="size-3.5" />
                </Button>
              ) : (
                <>
                  {task.status === "done" ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="打开所在文件夹"
                      title="打开所在文件夹"
                      onClick={reveal}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="移除任务"
                    title="移除任务"
                    onClick={() => remove(task.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <Progress
              value={percent}
              className={cn(
                "gap-0 [&_[data-slot=progress-track]]:h-1.5",
                task.status === "error" &&
                  "[&_[data-slot=progress-indicator]]:bg-destructive",
                task.status === "done" &&
                  "[&_[data-slot=progress-indicator]]:bg-primary",
              )}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
              <span className="truncate">{phaseLabel(task)}</span>
              <span className="shrink-0 tabular-nums">
                {isActive(task.status) ? (
                  <>
                    {task.received > 0
                      ? `${formatBytes(task.received)}${
                          task.total ? ` / ${formatBytes(task.total)}` : ""
                        }`
                      : ""}
                    {task.speed > 0 ? ` · ${formatSpeed(task.speed)}` : ""}
                    {task.total > 0 && task.received > 0
                      ? ` · ${percent.toFixed(0)}%`
                      : ""}
                    {etaText(task.received, task.total, task.speed)
                      ? ` · ${etaText(task.received, task.total, task.speed)}`
                      : ""}
                  </>
                ) : task.status === "done" ? (
                  "文件已保存到本地"
                ) : null}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DownloadsPage() {
  const tasks = useDownloadStore((state) => state.tasks);
  const clearFinished = useDownloadStore((state) => state.clearFinished);

  const list = useMemo(
    () =>
      Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt),
    [tasks],
  );

  const active = list.filter((task) => isActive(task.status));
  const finished = list.filter((task) => isFinished(task.status));

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">下载任务</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {active.length > 0
              ? `${active.length} 个任务进行中 · 已完成 ${finished.length} 个`
              : `共 ${finished.length} 个任务记录`}
          </p>
        </div>
        {finished.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            <RotateCcw />
            清除已完成
          </Button>
        ) : null}
      </header>

      {list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="grid size-16 place-items-center rounded-2xl border border-border bg-card text-muted-foreground/70">
            <DownloadCloud className="size-7" strokeWidth={1.6} />
          </div>
          <h2 className="mt-4 text-sm font-medium">还没有下载任务</h2>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            回到首页粘贴视频链接，解析后即可开始下载。
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            nativeButton={false}
            render={<Link to="/" />}
          >
            去解析视频
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {list.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
