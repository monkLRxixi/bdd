import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
                : task.status === "queued"
                  ? "bg-muted text-muted-foreground"
                  : "bg-accent text-accent-foreground",
          )}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="size-4.5" />
          ) : task.status === "error" ? (
            <XCircle className="size-4.5" />
          ) : task.status === "queued" ? (
            <Clock className="size-4.5" />
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
                  aria-label={task.status === "queued" ? "取消排队" : "取消下载"}
                  title={task.status === "queued" ? "取消排队" : "取消下载"}
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

          {task.status === "downloading" ||
          task.status === "merging" ||
          task.status === "done" ? (
            <div className="mt-3">
              <Progress
                value={percent}
                className={cn(
                  "gap-0 [&_[data-slot=progress-track]]:h-1.5",
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
                  ) : (
                    "文件已保存到本地"
                  )}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">
              {task.status === "queued" ? "等待下载" : phaseLabel(task)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyTasks({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border/80 py-12 text-center">
      <div className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground/70">
        {icon}
      </div>
      <p className="mt-3 text-[13px] font-medium">{title}</p>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

type TabKey = "queued" | "active" | "done";

export function DownloadsPage() {
  const tasks = useDownloadStore((state) => state.tasks);
  const clearFinished = useDownloadStore((state) => state.clearFinished);

  const list = useMemo(
    () => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt),
    [tasks],
  );

  const queued = useMemo(
    () => list.filter((task) => task.status === "queued"),
    [list],
  );
  const active = useMemo(
    () =>
      list.filter(
        (task) => task.status === "downloading" || task.status === "merging",
      ),
    [list],
  );
  const downloaded = useMemo(
    () => list.filter((task) => isFinished(task.status)),
    [list],
  );

  const [tab, setTab] = useState<TabKey>(() => {
    const all = Object.values(useDownloadStore.getState().tasks);
    if (
      all.some(
        (task) => task.status === "downloading" || task.status === "merging",
      )
    ) {
      return "active";
    }
    if (all.some((task) => task.status === "queued")) return "queued";
    return "done";
  });

  // Once the queue drains completely, show the finished tasks.
  useEffect(() => {
    if (tab !== "active") return;
    if (active.length > 0 || queued.length > 0) return;
    if (downloaded.length > 0) setTab("done");
  }, [tab, active.length, queued.length, downloaded.length]);

  const tabs = [
    { key: "queued", label: "待下载", count: queued.length },
    { key: "active", label: "下载中", count: active.length },
    { key: "done", label: "已下载", count: downloaded.length },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">下载任务</h1>
        {tab === "done" && downloaded.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearFinished}>
            <RotateCcw />
            清空记录
          </Button>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabKey)}
        className="mt-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  item.count > 0
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40",
                )}
              >
                {item.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="queued" className="mt-4 space-y-2.5">
          {queued.length > 0 ? (
            queued.map((task) => <TaskRow key={task.id} task={task} />)
          ) : (
            <EmptyTasks
              icon={<Clock className="size-5" strokeWidth={1.7} />}
              title="没有待下载的任务"
              hint="超出并发数的任务会排在这里"
            />
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-4 space-y-2.5">
          {active.length > 0 ? (
            active.map((task) => <TaskRow key={task.id} task={task} />)
          ) : (
            <EmptyTasks
              icon={<DownloadCloud className="size-5" strokeWidth={1.7} />}
              title="没有正在下载的任务"
            />
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-4 space-y-2.5">
          {downloaded.length > 0 ? (
            downloaded.map((task) => <TaskRow key={task.id} task={task} />)
          ) : (
            <EmptyTasks
              icon={<CheckCircle2 className="size-5" strokeWidth={1.7} />}
              title="还没有下载记录"
              hint="完成的视频会保存在本地下载目录"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/" />}
                >
                  去解析视频
                </Button>
              }
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
