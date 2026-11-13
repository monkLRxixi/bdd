import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  DownloadCloud,
  FolderOpen,
  LayoutGrid,
  LayoutList,
  Loader2,
  RotateCcw,
  Rows3,
  Trash2,
  Video,
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

/** How the expanded sub-list (分 P) is rendered. */
type DetailView = "full" | "compact" | "grid";

const DETAIL_VIEW_KEY = "bilidown-subp-view";

const detailViews: {
  value: DetailView;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "full", label: "完整", icon: <LayoutList className="size-3" /> },
  { value: "compact", label: "简洁", icon: <Rows3 className="size-3" /> },
  { value: "grid", label: "栅格", icon: <LayoutGrid className="size-3" /> },
];

function readDetailView(): DetailView {
  const stored = localStorage.getItem(DETAIL_VIEW_KEY);
  return stored === "compact" || stored === "grid" ? stored : "full";
}

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
      return task.kind === "audio" ? "下载音频" : "下载音频流";
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

function progressOf(task: DownloadTask) {
  return task.status === "done"
    ? 100
    : Math.max(0, Math.min(100, task.percent));
}

function hasProgress(task: DownloadTask) {
  return (
    task.status === "downloading" ||
    task.status === "merging" ||
    task.status === "done"
  );
}

function qualityLabel(task: DownloadTask) {
  if (task.kind === "cover") return "封面";
  if (task.kind === "audio") return task.quality;
  return task.mode === "dash" ? task.quality : "MP4 单文件";
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

/** Cancel / reveal / remove handlers shared by every task layout. */
function useTaskActions(tasks: DownloadTask[]) {
  const cancelTask = useDownloadStore((state) => state.markCanceled);
  const removeTask = useDownloadStore((state) => state.remove);

  const cancel = async () => {
    const targets = tasks.filter((task) => isActive(task.status));
    if (targets.length === 0) return;

    targets.forEach((task) => cancelTask(task.id));

    let failed = 0;
    await Promise.all(
      targets.map(async (task) => {
        try {
          await api.cancelDownload(task.id);
        } catch {
          failed += 1;
        }
      }),
    );

    if (failed > 0) {
      toast.error("部分任务取消失败", {
        description: `${failed} 个下载进程未能取消，请稍后重试`,
      });
    }
  };

  const reveal = async () => {
    const target = tasks.find((task) => task.file) ?? tasks[0];
    if (!target?.file) {
      toast("文件路径尚未就绪");
      return;
    }
    try {
      await revealItemInDir(target.file);
    } catch (error) {
      toast.error("无法打开文件夹", { description: errorText(error) });
    }
  };

  return {
    cancel,
    reveal,
    remove: () => tasks.forEach((task) => removeTask(task.id)),
  };
}

function stopPropagation(action: () => void) {
  return (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
  };
}

function TaskActions({ tasks }: { tasks: DownloadTask[] }) {
  const task = tasks[0];
  const { cancel, reveal, remove } = useTaskActions(tasks);

  if (!task) return null;

  return (
    <>
      {isActive(task.status) ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={task.status === "queued" ? "取消排队" : "取消下载"}
          title={task.status === "queued" ? "取消排队" : "取消下载"}
          onClick={stopPropagation(() => void cancel())}
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
              onClick={stopPropagation(() => void reveal())}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="移除任务"
            title="移除任务"
            onClick={stopPropagation(remove)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </>
  );
}

function TaskCover({
  task,
  className,
  iconClassName = "size-5",
}: {
  task: DownloadTask;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      <div className="absolute inset-0 grid place-items-center text-muted-foreground/50">
        <Video className={iconClassName} strokeWidth={1.6} />
      </div>

      {task.cover ? (
        <img
          src={task.cover}
          alt={task.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className={cn(
            "absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]",
            task.status === "canceled" && "opacity-50 grayscale",
          )}
        />
      ) : null}

      {isActive(task.status) ? (
        <span className="absolute inset-0 grid place-items-center bg-black/25 text-white backdrop-blur-[1px]">
          {task.status === "queued" ? (
            <Clock className={iconClassName} />
          ) : (
            <Loader2 className={cn(iconClassName, "animate-spin")} />
          )}
        </span>
      ) : task.status === "done" ? (
        <span className="absolute right-1.5 bottom-1.5 grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <CheckCircle2 className="size-2.5" strokeWidth={3} />
        </span>
      ) : task.status === "error" ? (
        <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
          <XCircle className={iconClassName} />
        </span>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  tasks,
  extra,
  onClick,
  variant = "full",
  merged = false,
}: {
  task: DownloadTask;
  tasks?: DownloadTask[];
  extra?: React.ReactNode;
  onClick?: () => void;
  variant?: "full" | "nested";
  merged?: boolean;
}) {
  const percent = progressOf(task);
  const nested = variant === "nested";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex bg-card transition-colors",
        nested ? "min-h-[84px]" : "min-h-[104px]",
        merged
          ? "rounded-none"
          : "rounded-xl border border-border overflow-hidden hover:border-border/90",
        onClick && "cursor-pointer",
      )}
    >
      <TaskCover
        task={task}
        className={nested ? "w-[112px] self-stretch" : "w-[150px] self-stretch"}
        iconClassName={nested ? "size-4" : "size-5"}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center",
          nested ? "p-3.5" : "p-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate font-medium",
                nested ? "text-[12.5px]" : "text-[13px]",
              )}
            >
              {task.title}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-muted-foreground",
                nested ? "text-[10.5px]" : "text-[11px]",
              )}
            >
              {task.isMulti ? `P${task.page} · ` : ""}
              {task.part || "视频"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {extra}
            <Badge
              variant="secondary"
              className="hidden text-[10px] sm:inline-flex"
            >
              {qualityLabel(task)}
            </Badge>
            <StatusPill task={task} />
            <TaskActions tasks={tasks ?? [task]} />
          </div>
        </div>

        {hasProgress(task) ? (
          <div className={nested ? "mt-2" : "mt-3"}>
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
  );
}

/**
 * Text-only sub-task row used by the 简洁 / 栅格 detail views.
 * Height is roughly half of the parent card.
 */
function DetailRow({ task }: { task: DownloadTask }) {
  const percent = progressOf(task);

  return (
    <div className="group flex h-[52px] items-center gap-3 rounded-lg border border-border/70 bg-card px-3 transition-colors hover:border-border">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-medium">
            {task.isMulti ? `P${task.page} · ` : ""}
            {task.part || "视频"}
          </span>
          <StatusPill task={task} />
        </div>

        {hasProgress(task) ? (
          <div className="mt-1.5 flex items-center gap-2.5">
            <Progress
              value={percent}
              className={cn(
                "min-w-0 flex-1 gap-0 [&_[data-slot=progress-track]]:h-1",
                task.status === "done" &&
                  "[&_[data-slot=progress-indicator]]:bg-primary",
              )}
            />
            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {isActive(task.status)
                ? `${percent.toFixed(0)}%${
                    task.speed > 0 ? ` · ${formatSpeed(task.speed)}` : ""
                  }`
                : "已保存"}
            </span>
          </div>
        ) : (
          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            {task.status === "queued" ? "等待下载" : phaseLabel(task)}
          </p>
        )}
      </div>

      <TaskActions tasks={[task]} />
    </div>
  );
}

/** Groups tasks that belong to the same video into one collapsible card. */
function groupTasks(list: DownloadTask[]) {
  const groups = new Map<string, DownloadTask[]>();
  for (const task of list) {
    const key = task.bvid || task.id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(task);
    else groups.set(key, [task]);
  }
  return [...groups.entries()].map(([key, tasks]) => ({
    key,
    tasks: tasks.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt),
  }));
}

function TaskGroup({
  tasks,
  detailView,
  onDetailViewChange,
}: {
  tasks: DownloadTask[];
  detailView: DetailView;
  onDetailViewChange: (view: DetailView) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 1) return <TaskRow task={tasks[0]} />;

  const [front, ...rest] = tasks;
  const label = tasks.every((task) => task.isMulti)
    ? `${tasks.length} 个分 P`
    : `${tasks.length} 个任务`;

  const toggle = () => setExpanded((value) => !value);

  const detail =
    detailView === "full" ? (
      <div className="space-y-2">
        {rest.map((task) => (
          <TaskRow key={task.id} task={task} variant="nested" />
        ))}
      </div>
    ) : detailView === "compact" ? (
      <div className="space-y-1.5">
        {rest.map((task) => (
          <DetailRow key={task.id} task={task} />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
        {rest.map((task) => (
          <DetailRow key={task.id} task={task} />
        ))}
      </div>
    );

  return (
    /* Parent row + expanded detail share one box. */
    <div className="overflow-hidden rounded-xl border border-border bg-card hover:border-border/90">
      <TaskRow
        task={front}
        tasks={tasks}
        merged
        onClick={toggle}
        extra={
          <Button
            variant="secondary"
            size="xs"
            className="h-5 gap-1 rounded-full px-2 text-[10px] font-medium"
            title={expanded ? "收起分 P 列表" : "展开分 P 列表"}
            aria-expanded={expanded}
            onClick={stopPropagation(toggle)}
          >
            {label}
            <ChevronDown
              className={cn(
                "size-3 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </Button>
        }
      />

      {expanded ? (
        <div className="border-t border-border bg-muted/40 px-2.5 pt-1.5 pb-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3 px-0.5">
            <span className="text-[10px] font-medium text-muted-foreground">
              共 {tasks.length} 个分 P
            </span>
            <div
              role="group"
              aria-label="分 P 展示方式"
              className="flex items-center gap-0.5"
            >
              {detailViews.map((option) => {
                const selected = detailView === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={`${option.label}展示`}
                    aria-pressed={selected}
                    onClick={stopPropagation(() =>
                      onDetailViewChange(option.value),
                    )}
                    className={cn(
                      "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors",
                      selected
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                    )}
                  >
                    {option.icon}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {detail}
        </div>
      ) : null}
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
  const [detailView, setDetailView] =
    useState<DetailView>(readDetailView);

  const updateDetailView = (next: DetailView) => {
    setDetailView(next);
    localStorage.setItem(DETAIL_VIEW_KEY, next);
  };

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

  const renderList = (items: DownloadTask[]) => (
    <div className="mt-4 space-y-2.5">
      {groupTasks(items).map((group) => (
        <TaskGroup
          key={group.key}
          tasks={group.tasks}
          detailView={detailView}
          onDetailViewChange={updateDetailView}
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <TabsContent value="queued">
          {queued.length > 0 ? (
            renderList(queued)
          ) : (
            <div className="mt-4">
              <EmptyTasks
                icon={<Clock className="size-5" strokeWidth={1.7} />}
                title="没有待下载的任务"
                hint="超出并发数的任务会排在这里"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="active">
          {active.length > 0 ? (
            renderList(active)
          ) : (
            <div className="mt-4">
              <EmptyTasks
                icon={<DownloadCloud className="size-5" strokeWidth={1.7} />}
                title="没有正在下载的任务"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="done">
          {downloaded.length > 0 ? (
            renderList(downloaded)
          ) : (
            <div className="mt-4">
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
