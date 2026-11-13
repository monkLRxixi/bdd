import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  FolderOpen,
  Info,
  Loader2,
  Lock,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api, errorText } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore, useUiStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

const qualityOptions = [
  { value: 16, label: "360P" },
  { value: 32, label: "480P" },
  { value: 64, label: "720P" },
  { value: 80, label: "1080P", need: "login" as const },
  { value: 112, label: "1080P 高码", need: "vip" as const },
  { value: 120, label: "4K", need: "vip" as const },
  { value: 127, label: "最高可用" },
];

const audioOptions = [
  { value: 30216, label: "64K" },
  { value: 30232, label: "132K" },
  { value: 30280, label: "192K" },
];

const codecOptions = [
  { value: "avc1", label: "AVC", note: "H.264 · 兼容性最好" },
  { value: "av01", label: "AV1", note: "体积更小 · 较新播放器" },
  { value: "hev1", label: "HEVC", note: "H.265 · 压缩效率高" },
];

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[92px_1fr] sm:gap-8">
      <div className="pt-1 text-[13px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CheckOption({
  checked,
  onCheckedChange,
  disabled,
  title,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      title={title}
      className={cn(
        "inline-flex items-center gap-2 text-[13px]",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value)}
      />
      <span>{children}</span>
    </label>
  );
}

function TextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="link"
      size="xs"
      onClick={onClick}
      className="h-auto shrink-0 px-0 text-primary"
    >
      {children}
    </Button>
  );
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);
  const saveSettings = useSettingsStore((state) => state.save);

  const user = useAuthStore((state) => state.user);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  const [draft, setDraft] = useState<Settings>(settings);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [ffmpeg, setFfmpeg] = useState<{
    state: "idle" | "checking" | "ok" | "error";
    message: string;
  }>({ state: "idle", message: "" });

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  );

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Auto-save, like the desktop client's settings page.
  useEffect(() => {
    if (!loaded) return;
    if (!dirty) {
      setSaveState((current) => (current === "pending" ? "idle" : current));
      return;
    }
    setSaveState("pending");
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveSettings(draft);
        setSaveState("saved");
        setSaveError("");
      } catch (error) {
        setSaveState("error");
        setSaveError(errorText(error));
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, loaded, saveSettings]);

  // Flush pending edits when leaving the page.
  const latest = useRef({ draft, dirty, loaded });
  latest.current = { draft, dirty, loaded };
  useEffect(
    () => () => {
      const current = latest.current;
      if (current.loaded && current.dirty) {
        useSettingsStore.getState().save(current.draft).catch(() => {});
      }
    },
    [],
  );

  const pickDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: draft.downloadDir || undefined,
      });
      if (typeof selected === "string") update("downloadDir", selected);
    } catch (error) {
      toast.error("无法选择目录", { description: errorText(error) });
    }
  };

  const openDirectory = async () => {
    if (!draft.downloadDir) {
      toast("请先选择下载目录");
      return;
    }
    try {
      await openPath(draft.downloadDir);
    } catch (error) {
      toast.error("无法打开目录", { description: errorText(error) });
    }
  };

  const checkFfmpeg = async () => {
    setFfmpeg({ state: "checking", message: "正在检测 ffmpeg…" });
    try {
      const result = await api.checkFfmpeg(draft.ffmpegPath);
      setFfmpeg({ state: "ok", message: result.version || "ffmpeg 可用" });
    } catch (error) {
      setFfmpeg({ state: "error", message: errorText(error) });
    }
  };

  const can1080 = !!user;
  const canVip = !!user?.vip;

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">设置</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            所有修改会自动保存，配置仅保存在本机。
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground",
            saveState === "error" && "text-destructive",
          )}
        >
          {saveState === "saving" || saveState === "pending" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : saveState === "error" ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5 text-primary" />
          )}
          {saveState === "pending"
            ? "待保存…"
            : saveState === "saving"
              ? "保存中…"
              : saveState === "saved"
                ? "已自动保存"
                : saveState === "error"
                  ? saveError || "保存失败"
                  : "自动保存已开启"}
        </span>
      </header>

      <div className="mt-9 space-y-6">
        <SettingRow label="通知">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckOption
              checked={draft.notifyOnComplete}
              onCheckedChange={(checked) =>
                update("notifyOnComplete", checked)
              }
            >
              下载完成提示
            </CheckOption>
          </div>
        </SettingRow>

        <SettingRow label="存储">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Input
              value={draft.downloadDir}
              onChange={(event) => update("downloadDir", event.target.value)}
              placeholder="选择下载目录…"
              className="h-8 w-full max-w-[420px] font-mono text-xs"
            />
            <TextButton onClick={pickDirectory}>更改</TextButton>
            <TextButton onClick={openDirectory}>打开目录</TextButton>
          </div>
        </SettingRow>

        <SettingRow label="功能">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckOption
              checked={draft.saveCover}
              onCheckedChange={(checked) => update("saveCover", checked)}
            >
              封面
            </CheckOption>
            <CheckOption
              checked={theme === "dark"}
              onCheckedChange={(checked) =>
                setTheme(checked ? "dark" : "light")
              }
            >
              深色模式
            </CheckOption>
          </div>
        </SettingRow>

        <SettingRow label="音质">
          <RadioGroup
            value={String(draft.audioId)}
            onValueChange={(value) => {
              if (value != null) update("audioId", Number(value));
            }}
            className="flex w-full flex-wrap gap-x-6 gap-y-2"
          >
            {audioOptions.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 text-[13px]"
              >
                <RadioGroupItem value={String(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </RadioGroup>
        </SettingRow>

        <SettingRow label="画质">
          <RadioGroup
            value={String(draft.qn)}
            onValueChange={(value) => {
              if (value != null) update("qn", Number(value));
            }}
            className="flex w-full flex-wrap gap-x-6 gap-y-2"
          >
            {qualityOptions.map((option) => {
              const locked =
                option.need === "login"
                  ? !can1080
                  : option.need === "vip"
                    ? !canVip
                    : false;
              return (
                <label
                  key={option.value}
                  title={
                    locked
                      ? option.need === "vip"
                        ? "需要大会员"
                        : "需要登录"
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-2 text-[13px]",
                    locked
                      ? "cursor-not-allowed text-muted-foreground/60"
                      : "cursor-pointer",
                  )}
                >
                  <RadioGroupItem
                    value={String(option.value)}
                    disabled={locked}
                  />
                  <span>{option.label}</span>
                  {locked ? <Lock className="size-3 opacity-70" /> : null}
                </label>
              );
            })}
          </RadioGroup>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            未登录时 DASH 实际最高 480P；登录后解锁 1080P，大会员解锁更高画质。
          </p>
        </SettingRow>

        <SettingRow label="编码">
          <RadioGroup
            value={draft.codec}
            onValueChange={(value) => {
              if (value != null) update("codec", value);
            }}
            className="flex w-full flex-wrap gap-x-6 gap-y-2"
          >
            {codecOptions.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 text-[13px]"
              >
                <RadioGroupItem value={option.value} />
                <span className="inline-flex items-center gap-1" title={option.note}>
                  {option.label}
                  <Info className="size-3 text-muted-foreground/70" />
                </span>
              </label>
            ))}
          </RadioGroup>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            AVC（H.264）兼容性最好；HEVC / AV1 体积更小。下载时会自动回退到可用编码。
          </p>
        </SettingRow>

        <SettingRow label="合并">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Input
              value={draft.ffmpegPath}
              onChange={(event) => update("ffmpegPath", event.target.value)}
              placeholder="ffmpeg 或 D:\\ffmpeg\\bin\\ffmpeg.exe"
              className="h-8 w-full max-w-[320px] font-mono text-xs"
            />
            <TextButton onClick={checkFfmpeg}>检测</TextButton>
            {ffmpeg.state === "checking" ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : ffmpeg.state === "ok" ? (
              <span className="max-w-[280px] truncate text-[11px] text-primary">
                {ffmpeg.message}
              </span>
            ) : ffmpeg.state === "error" ? (
              <span className="text-[11px] text-destructive">
                {ffmpeg.message}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/70">
                DASH 模式需要 ffmpeg，单文件 MP4 模式不需要
              </span>
            )}
          </div>
        </SettingRow>

        <SettingRow label="命名">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <code className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px]">
              %title%
            </code>
            <span className="text-[11px] text-muted-foreground">
              单 P：标题.mp4 · 多 P：标题/P01 分P标题.mp4
            </span>
          </div>
        </SettingRow>

        <SettingRow label="并发">
          <RadioGroup
            value={String(draft.concurrency)}
            onValueChange={(value) => {
              if (value != null) update("concurrency", Number(value));
            }}
            className="flex w-full flex-wrap gap-x-6 gap-y-2"
          >
            {[1, 2, 3, 4].map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-[13px]"
              >
                <RadioGroupItem value={String(value)} />
                <span>{value} 个</span>
              </label>
            ))}
          </RadioGroup>
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            同时下载的任务数量。任务较多时建议 2 个以内，避免触发站点限流。
          </p>
        </SettingRow>

        <SettingRow label="版本">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="font-mono">
              0.1.0
            </Badge>
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-primary"
                  />
                }
              >
                详情
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>BiliDown 0.1.0</DialogTitle>
                  <DialogDescription>
                    Tauri 2 + React 19 + shadcn/ui 构建的 B 站视频下载器。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-4">
                    <span>应用数据</span>
                    <span className="text-right font-mono break-all">
                      %APPDATA%\com.echoism.bilibili-down
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>下载目录</span>
                    <span className="text-right font-mono break-all">
                      {settings.downloadDir || "默认下载目录"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>登录状态</span>
                    <span>{user ? `已登录 · ${user.uname}` : "未登录"}</span>
                  </div>
                  <p className="border-t border-border/70 pt-3 leading-relaxed">
                    仅供个人学习与备份使用，请遵守哔哩哔哩用户协议与著作权法。
                    Cookie 仅保存在本机，不会上传。
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </SettingRow>
      </div>

      <footer className="mt-10 flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground/70">
        <FolderOpen className="size-3.5" />
        BiliDown MVP · 仅供个人学习与备份使用
      </footer>
    </div>
  );
}
