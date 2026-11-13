import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  ClipboardPaste,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatBytes, formatDuration } from "@/lib/format";
import type {
  DownloadKind,
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
      className="flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-xs transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10"
    >
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="BV 号或视频链接"
        disabled={busy}
        className="h-10 flex-1 border-0 bg-transparent px-2.5 text-[15px] shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
        autoFocus
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="清空"
          title="清空"
          onClick={() => onChange("")}
          disabled={busy}
          className="text-muted-foreground"
        >
          <X />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="粘贴"
        title="粘贴"
        onClick={paste}
        disabled={busy}
        className="text-muted-foreground"
      >
        <ClipboardPaste />
      </Button>
      <Button
        type="submit"
        disabled={!value.trim() || busy}
        className="h-10 rounded-lg px-4"
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

/* ------------------------------------------------------------------ */
/* page                                                               */
/* ------------------------------------------------------------------ */

export function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(
    () => new Set([0]),
  );
  const [previewIndex, setPreviewIndex] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [streams, setStreams] = useState<StreamsPayload | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState("");

  const [mode, setMode] = useState<DownloadMode>("dash");
  const [kind, setKind] = useState<DownloadKind>("video");
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
      setSelectedPages(new Set([0]));
      setPreviewIndex(0);
      setListOpen(true);
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
    const page = video.pages[previewIndex];
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
  }, [video, previewIndex]);

  const quality = useMemo(
    () => streams?.qualities.find((item) => item.id === qn),
    [streams, qn],
  );

  const selectedCount = selectedPages.size;
  const allSelected =
    !!video && video.pages.length > 0 && selectedCount === video.pages.length;

  const togglePage = (index: number) => {
    const next = new Set(selectedPages);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedPages(next);
    if (!next.has(previewIndex) && next.size > 0) {
      setPreviewIndex(Math.min(...next));
    }
  };

  const toggleAll = () => {
    if (!video) return;
    if (selectedCount === video.pages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(video.pages.map((_, index) => index)));
    }
  };

  // "A" selects/deselects every part, like the desktop client.
  useEffect(() => {
    if (!video?.isMulti) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "a") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (selectedPages.size === video.pages.length) {
        setSelectedPages(new Set());
      } else {
        setSelectedPages(new Set(video.pages.map((_, index) => index)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [video, selectedPages]);

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
    selectedCount > 0 &&
    !starting &&
    (kind === "cover"
      ? !!video.cover
      : kind === "audio"
        ? !streamsLoading && !!audioId
        : !streamsLoading &&
          (mode === "dash" ? !!quality && !!audioId : !!streams?.mp4));

  const startDownload = async () => {
    if (!video || !canDownload) return;
    const picked = video.pages.filter((_, index) => selectedPages.has(index));
    if (picked.length === 0) return;
    // A cover is per video, not per part: one task is enough.
    const pages = kind === "cover" ? picked.slice(0, 1) : picked;

    const qualityLabel =
      kind === "cover"
        ? "封面"
        : kind === "audio"
          ? "音频 M4A"
          : mode === "dash"
            ? (quality?.label ?? "高清")
            : (streams?.mp4?.label ?? "MP4");

    const requests: DownloadRequest[] = pages.map((page) => ({
      id: crypto.randomUUID(),
      bvid: video.bvid,
      cid: page.cid,
      title: video.title,
      part: page.part,
      page: page.page,
      isMulti: video.isMulti,
      qn: mode === "dash" ? qn : (streams?.mp4?.quality ?? 80),
      codec,
      mode,
      kind,
      audioId: mode === "dash" || kind === "audio" ? audioId : null,
      dir: settings.downloadDir,
      saveCover,
      cover: video.cover,
      sourceUrl: `https://www.bilibili.com/video/${video.bvid}${
        video.isMulti ? `?p=${page.page}` : ""
      }`,
    }));

    setStarting(true);
    // Register tasks before the backend can emit their first progress events.
    requests.forEach((request) => addTask(request, qualityLabel));

    let failures = 0;
    let firstError = "";
    for (const request of requests) {
      try {
        await api.startDownload(request);
      } catch (err) {
        failures += 1;
        if (!firstError) firstError = errorText(err);
        useDownloadStore.getState().remove(request.id);
      }
    }

    if (failures === requests.length) {
      toast.error("无法开始下载", { description: firstError });
    } else {
      if (failures > 0) {
        toast.error(`${failures} 个任务启动失败`, { description: firstError });
      } else if (kind === "cover") {
        toast.success("已开始保存封面", { description: video.title });
      } else {
        toast.success(
          requests.length > 1
            ? `已加入 ${requests.length} 个下载任务`
            : "已加入下载列表",
          {
            description: `${video.title}${
              requests.length > 1 ? ` · 共 ${requests.length} 个分 P` : ""
            }`,
          },
        );
      }
      navigate("/downloads");
    }
    setStarting(false);
  };

  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-full w-full max-w-[860px] flex-col px-6 sm:px-10",
        video ? "pt-8 pb-16" : "justify-center pb-20",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-64 w-80 rounded-full bg-primary/8 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-[640px]">
        <SearchBar
          value={input}
          onChange={setInput}
          onSubmit={() => parse()}
          busy={busy}
        />
      </div>

      {error ? (
        <Alert
          variant="destructive"
          className="animate-fade-up mx-auto mt-3 w-full max-w-[640px]"
        >
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {video ? (
        <section className="animate-fade-up relative mt-5 space-y-3">
          <Card className="gap-0 py-0">
            <div className="flex gap-4 p-4">
              <div className="relative aspect-video w-[180px] shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60 sm:w-[210px]">
                <img
                  src={video.cover}
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
                <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                  {formatDuration(video.duration)}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
                    {video.title}
                  </h2>
                  <button
                    type="button"
                    aria-label="在浏览器打开"
                    title="在浏览器打开"
                    onClick={() =>
                      openUrl(
                        `https://www.bilibili.com/video/${video.bvid}`,
                      ).catch(() => toast.error("无法打开浏览器"))
                    }
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <UserRound className="size-3.5 shrink-0" />
                    <span className="truncate">{video.ownerName}</span>
                  </span>
                  {video.isMulti ? (
                    <span>{video.pages.length} 个分P</span>
                  ) : null}
                  {video.chargeable ? (
                    <span className="text-destructive">充电专属</span>
                  ) : null}
                </div>

                <div className="mt-auto pt-2">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {video.bvid}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          {video.isMulti ? (
            <Card className="gap-0 py-0">
              <CardContent className="p-3.5 sm:p-4">
                <button
                  type="button"
                  onClick={() => setListOpen((open) => !open)}
                  className="flex items-center gap-2 text-[13px] font-medium"
                >
                  已选择
                  <span className="text-muted-foreground tabular-nums">
                    [ {selectedCount} / {video.pages.length} ]
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      !listOpen && "-rotate-90",
                    )}
                  />
                </button>

                {listOpen ? (
                  <>
                    <div className="mt-2.5 max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                      {video.pages.map((page, index) => {
                        const checked = selectedPages.has(index);
                        return (
                          <label
                            key={page.cid}
                            htmlFor={`part-${page.cid}`}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                              checked
                                ? "border-primary/30 bg-accent/60"
                                : "border-border bg-card hover:border-border/80 hover:bg-muted/40",
                            )}
                          >
                            <Checkbox
                              id={`part-${page.cid}`}
                              checked={checked}
                              onCheckedChange={() => togglePage(index)}
                            />
                            <span className="w-8 shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
                              P{page.page}
                            </span>
                            <span className="h-3.5 w-px shrink-0 bg-border" />
                            <span className="min-w-0 flex-1 truncate text-[13px]">
                              {page.part || "未命名分 P"}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                              {formatDuration(page.duration)}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 border-t border-border/70 pt-2.5">
                      <label className="flex w-fit cursor-pointer items-center gap-2 text-[12px]">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={!allSelected && selectedCount > 0}
                          onCheckedChange={toggleAll}
                        />
                        全选(A)
                      </label>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="gap-0 py-0">
            <CardContent className="space-y-3.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs
                    value={kind}
                    onValueChange={(value) => setKind(value as DownloadKind)}
                  >
                    <TabsList>
                      <TabsTrigger value="video">
                        <Film className="size-3.5" />
                        视频
                      </TabsTrigger>
                      <TabsTrigger value="audio">
                        <Music className="size-3.5" />
                        音频
                      </TabsTrigger>
                      <TabsTrigger value="cover">
                        <ImageIcon className="size-3.5" />
                        封面
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {kind === "video" ? (
                    <Tabs
                      value={mode}
                      onValueChange={(value) => setMode(value as DownloadMode)}
                    >
                      <TabsList>
                        <TabsTrigger value="dash">DASH</TabsTrigger>
                        <TabsTrigger value="mp4" disabled={!streams?.mp4}>
                          MP4
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : null}
                </div>
                {kind === "video" && streams?.note ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {streams.note}
                  </p>
                ) : null}
              </div>

              {streamsError && kind !== "cover" ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{streamsError}</AlertDescription>
                </Alert>
              ) : null}

              {kind === "cover" ? (
                <p className="text-[11px] text-muted-foreground">
                  仅保存该视频的封面图片（JPG），不下载视频或音频流。
                </p>
              ) : streamsLoading ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ) : streams ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {kind === "audio" ? (
                    <Field label="音轨" hint="保存为 M4A">
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
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : mode === "dash" ? (
                    <>
                      <Field label="画质">
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

                      <Field label="编码">
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
                              <SelectItem key={item.value} value={item.value}>
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
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </>
                  ) : (
                    <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-2.5 text-xs text-muted-foreground sm:col-span-3">
                      {streams.mp4
                        ? `${streams.mp4.label} · 约 ${formatBytes(streams.mp4.size)}`
                        : "无可用 MP4"}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                {kind === "cover" ? (
                  <span className="text-[11px] text-muted-foreground">
                    {video.isMulti
                      ? "多 P 视频共用一个封面，只保存一张 JPG"
                      : "封面为 JPG 图片，保存在下载目录根目录"}
                  </span>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={saveCover}
                      onCheckedChange={setSaveCover}
                      size="sm"
                    />
                    封面
                  </label>
                )}
                <Button
                  size="lg"
                  className="h-9 rounded-xl px-5"
                  disabled={!canDownload}
                  onClick={startDownload}
                >
                  {starting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {starting
                    ? "创建中"
                    : kind === "cover"
                      ? "下载封面"
                      : kind === "audio"
                        ? selectedCount > 1
                          ? `下载 ${selectedCount} 个音频`
                          : "下载音频"
                        : selectedCount > 1
                          ? `下载 ${selectedCount} 个分P`
                          : "下载"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
