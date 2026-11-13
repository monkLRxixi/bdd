import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  ClipboardPaste,
  Download,
  Film,
  HardDriveDownload,
  Layers,
  Link2,
  Loader2,
  Music2,
  Search,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorText } from "@/lib/api";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDuration,
} from "@/lib/format";
import type {
  DownloadMode,
  DownloadRequest,
  StreamsPayload,
  VideoInfo,
} from "@/lib/types";
import { useDownloadStore } from "@/stores/downloads";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* search                                                             */
/* ------------------------------------------------------------------ */

function SearchBar({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text.trim());
      else toast("剪贴板是空的");
    } catch {
      toast.error("无法读取剪贴板，请手动粘贴");
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex items-center gap-1.5 rounded-2xl border border-border bg-card p-2 shadow-xs transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 hover:shadow-md"
    >
      <Link2 className="ml-2 size-5 shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="粘贴 B 站链接、BV 号或 av 号…"
        disabled={busy}
        className="h-10 flex-1 border-0 bg-transparent px-1 text-[15px] shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
        autoFocus
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={paste}
        disabled={busy}
        className="hidden text-muted-foreground sm:inline-flex"
      >
        <ClipboardPaste />
        粘贴
      </Button>
      <Button
        type="submit"
        disabled={!value.trim() || busy}
        className="h-10 rounded-xl px-5"
      >
        {busy ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Search />
        )}
        {busy ? "解析中" : "解析"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {hint ? (
          <span className="text-[10px] text-muted-foreground/80">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

export function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [streams, setStreams] = useState<StreamsPayload | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState("");

  const [mode, setMode] = useState<DownloadMode>("dash");
  const [qn, setQn] = useState(0);
  const [codec, setCodec] = useState("avc1");
  const [audioId, setAudioId] = useState<number | null>(null);
  const [saveCover, setSaveCover] = useState(true);
  const [starting, setStarting] = useState(false);

  const settings = useSettingsStore((state) => state.settings);
  const addTask = useDownloadStore((state) => state.addTask);

  useEffect(() => {
    setSaveCover(settings.saveCover);
  }, [settings.saveCover]);

  const parse = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;
      setBusy(true);
      setError("");
      setVideo(null);
      setStreams(null);
      setPageIndex(0);
      try {
        const target = await api.resolveTarget(text);
        const info = await api.videoInfo(target.bvid, target.aid);
        setVideo(info);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, input],
  );

  // Fetch available streams whenever the selected part changes.
  useEffect(() => {
    if (!video) return;
    const page = video.pages[pageIndex];
    if (!page) return;

    let alive = true;
    setStreamsLoading(true);
    setStreams(null);
    setStreamsError("");

    api
      .streams(video.bvid, page.cid)
      .then((payload) => {
        if (!alive) return;
        setStreams(payload);
        const preferred = useSettingsStore.getState().settings;
        const preferredQuality =
          payload.qualities.find((item) => item.id === preferred.qn) ??
          payload.qualities[0];
        const nextQn = preferredQuality?.id ?? 0;
        setQn(nextQn);
        const codecs = preferredQuality?.codecs ?? [];
        setCodec(
          codecs.includes(preferred.codec)
            ? preferred.codec
            : (codecs[0] ?? "avc1"),
        );
        setAudioId(
          payload.audios.some((item) => item.id === preferred.audioId)
            ? preferred.audioId
            : (payload.audios[0]?.id ?? null),
        );
        setMode(payload.qualities.length > 0 ? "dash" : "mp4");
        if (payload.qualities.length === 0 && !payload.mp4) {
          setStreamsError("没有可用的视频流，可能需要登录或大会员权限");
        }
      })
      .catch((err) => {
        if (alive) setStreamsError(errorText(err));
      })
      .finally(() => {
        if (alive) setStreamsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [video, pageIndex]);

  const quality = useMemo(
    () => streams?.qualities.find((item) => item.id === qn),
    [streams, qn],
  );

  const pageItems = useMemo(
    () =>
      (video?.pages ?? []).map((page, index) => ({
        value: String(index),
        label: `P${page.page} · ${page.part || "未命名分 P"}`,
      })),
    [video],
  );

  const qualityItems = useMemo(
    () =>
      (streams?.qualities ?? []).map((item) => ({
        value: String(item.id),
        label: item.label,
      })),
    [streams],
  );

  const audioItems = useMemo(
    () =>
      (streams?.audios ?? []).map((item) => ({
        value: String(item.id),
        label: item.label,
      })),
    [streams],
  );

  const codecItems = useMemo(() => {
    const codecs = quality?.codecs ?? ["avc1"];
    return codecs.map((item) => ({
      value: item,
      label:
        item === "avc1"
          ? "H.264 · 兼容优先"
          : item === "hev1"
            ? "H.265 · 体积更小"
            : item === "av01"
              ? "AV1 · 最新编码"
              : item,
    }));
  }, [quality]);

  const canDownload =
    !!video &&
    !streamsLoading &&
    !starting &&
    (mode === "dash"
      ? !!quality && !!audioId
      : !!streams?.mp4);

  const startDownload = async () => {
    if (!video || !canDownload) return;
    const page = video.pages[pageIndex];
    if (!page) return;

    const id = crypto.randomUUID();
    const request: DownloadRequest = {
      id,
      bvid: video.bvid,
      cid: page.cid,
      title: video.title,
      part: page.part,
      page: page.page,
      isMulti: video.isMulti,
      qn: mode === "dash" ? qn : (streams?.mp4?.quality ?? 80),
      codec,
      mode,
      audioId: mode === "dash" ? audioId : null,
      dir: settings.downloadDir,
      saveCover,
      cover: video.cover,
      sourceUrl: `https://www.bilibili.com/video/${video.bvid}${
        video.isMulti ? `?p=${page.page}` : ""
      }`,
    };

    const qualityLabel =
      mode === "dash"
        ? (quality?.label ?? "高清")
        : (streams?.mp4?.label ?? "MP4");

    setStarting(true);
    // Register the task before the backend can emit its first progress event.
    addTask(request, qualityLabel);
    try {
      await api.startDownload(request);
      toast.success("已加入下载列表", {
        description: `${video.title}${video.isMulti ? ` · P${page.page}` : ""}`,
      });
      navigate("/downloads");
    } catch (err) {
      useDownloadStore.getState().remove(id);
      toast.error("无法开始下载", { description: errorText(err) });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-[1000px] flex-col px-6 pb-16 sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-0 h-72 w-[26rem] rounded-full bg-primary/10 blur-3xl"
      />

      <header className={cn("relative", video ? "pt-8 pb-5" : "pt-14 pb-8")}>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          <Sparkles className="size-3 text-primary" />
          Bilibili Downloader
        </div>
        <h1 className="mt-4 text-[30px] leading-[1.15] font-semibold tracking-tight text-balance">
          把喜欢的视频<span className="text-primary">留下来</span>
        </h1>
        <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          粘贴链接或 BV 号，选择画质即可开始下载。支持多 P 视频与 DASH
          音视频自动合并。
        </p>
      </header>

      <div className="relative space-y-4">
        <SearchBar value={input} onChange={setInput} onSubmit={() => parse()} busy={busy} />

        {error ? (
          <Alert variant="destructive" className="animate-fade-up">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!video ? (
          <div className="animate-fade-up">
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FeatureCard
                icon={<Wand2 className="size-4" />}
                title="自动合并"
                description="DASH 音视频下载后自动合并为 MP4，无需手动处理。"
              />
              <FeatureCard
                icon={<Layers className="size-4" />}
                title="多 P 支持"
                description="一次解析全部分 P，按需选择想保存的那一集。"
              />
              <FeatureCard
                icon={<BadgeCheck className="size-4" />}
                title="高清画质"
                description="登录后可下载 1080P，大会员支持 4K / 8K。"
              />
            </div>
            <p className="mt-6 text-center text-[11px] text-muted-foreground/80">
              支持 BV 号 · av 号 · b23.tv 短链 · bilibili.com 链接
            </p>
          </div>
        ) : null}

        {video ? (
          <section className="animate-fade-up space-y-4">
            {/* -------------------------- video card -------------------------- */}
            <Card className="gap-0 overflow-hidden py-0">
              <div className="flex flex-col gap-5 p-5 sm:flex-row">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/60 sm:w-[300px]">
                  <img
                    src={video.cover}
                    alt={video.title}
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                  <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-sm">
                    {formatDuration(video.duration)}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <h2 className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-tight">
                    {video.title}
                  </h2>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="size-3.5" />
                      {video.ownerName}
                    </span>
                    <span className="tabular-nums">
                      {formatCount(video.views)} 播放
                    </span>
                    <span className="tabular-nums">{formatDate(video.pubdate)}</span>
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {video.desc || "暂无简介"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {video.bvid}
                    </Badge>
                    {video.isMulti ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {video.pages.length} 个分 P
                      </Badge>
                    ) : null}
                    {video.chargeable ? (
                      <Badge variant="destructive" className="text-[10px]">
                        充电专属
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        openUrl(
                          `https://www.bilibili.com/video/${video.bvid}`,
                        ).catch(() => toast.error("无法打开浏览器"))
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Film className="size-3.5" /> 在浏览器打开
                    </button>
                  </div>
                </div>
              </div>
            </Card>

            {/* -------------------------- config card ------------------------- */}
            <Card className="gap-0 py-0">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">下载设置</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {streamsLoading
                        ? "正在获取可用画质…"
                        : streams
                          ? `共 ${streams.qualities.length} 档 DASH 画质可用`
                          : "等待播放地址"}
                    </p>
                  </div>
                  {streams?.note ? (
                    <p className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="size-3.5" />
                      {streams.note}
                    </p>
                  ) : null}
                </div>

                {streamsError ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription className="space-y-2">
                      <p>{streamsError}</p>
                      <p className="text-xs opacity-80">
                        可以尝试切换「单文件 MP4」模式，或先在账号页登录。
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {streamsLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ) : streams ? (
                  <>
                    <Tabs
                      value={mode}
                      onValueChange={(value) => setMode(value as DownloadMode)}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="dash">DASH 高清</TabsTrigger>
                        <TabsTrigger value="mp4" disabled={!streams.mp4}>
                          单文件 MP4
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {video.isMulti ? (
                        <Field label="分 P">
                          <Select
                            value={String(pageIndex)}
                            onValueChange={(value) => {
                              if (value != null) setPageIndex(Number(value));
                            }}
                            items={pageItems}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder="选择分 P" />
                            </SelectTrigger>
                            <SelectContent>
                              {pageItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : null}

                      {mode === "dash" ? (
                        <Field
                          label="画质"
                          hint={quality ? quality.detail : undefined}
                        >
                          <Select
                            value={String(qn)}
                            onValueChange={(value) => {
                              if (value == null) return;
                              const nextQn = Number(value);
                              setQn(nextQn);
                              const next = streams.qualities.find(
                                (item) => item.id === nextQn,
                              );
                              if (next && !next.codecs.includes(codec)) {
                                setCodec(next.codecs[0] ?? "avc1");
                              }
                            }}
                            items={qualityItems}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder="选择画质" />
                            </SelectTrigger>
                            <SelectContent>
                              {streams.qualities.map((item) => (
                                <SelectItem
                                  key={item.id}
                                  value={String(item.id)}
                                >
                                  <span className="flex w-full items-center justify-between gap-4">
                                    <span>{item.label}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {item.detail}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : (
                        <Field label="单文件信息">
                          <div className="flex h-9 items-center rounded-lg border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground">
                            {streams.mp4
                              ? `${streams.mp4.label} · 约 ${formatBytes(streams.mp4.size)}${
                                  streams.mp4.parts > 1
                                    ? ` · ${streams.mp4.parts} 段`
                                    : ""
                                }`
                              : "当前视频没有单文件 MP4 流"}
                          </div>
                        </Field>
                      )}

                      {mode === "dash" ? (
                        <>
                          <Field label="视频编码">
                            <Select
                              value={codec}
                              onValueChange={(value) => setCodec(value ?? "avc1")}
                              items={codecItems}
                            >
                              <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="选择编码" />
                              </SelectTrigger>
                              <SelectContent>
                                {codecItems.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field label="音轨">
                            <Select
                              value={audioId ? String(audioId) : ""}
                              onValueChange={(value) => {
                                if (value != null) setAudioId(Number(value));
                              }}
                              items={audioItems}
                            >
                              <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="选择音轨" />
                              </SelectTrigger>
                              <SelectContent>
                                {audioItems.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        </>
                      ) : (
                        <Field label="说明">
                          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground">
                            <Music2 className="size-3.5" />
                            已包含音轨，无需 ffmpeg 合并
                          </div>
                        </Field>
                      )}
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={saveCover}
                        onCheckedChange={setSaveCover}
                        size="sm"
                      />
                      同时保存封面
                    </label>
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <HardDriveDownload className="size-3.5 shrink-0" />
                      <span className="max-w-[320px] truncate">
                        {settings.downloadDir || "默认下载目录"}
                      </span>
                    </span>
                  </div>

                  <Button
                    size="lg"
                    className="h-10 shrink-0 rounded-xl px-6"
                    disabled={!canDownload}
                    onClick={startDownload}
                  >
                    {starting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {starting ? "正在创建任务…" : "开始下载"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}
