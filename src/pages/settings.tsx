import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Save,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { api, errorText } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

const qualityItems = [
  { value: "127", label: "最高可用画质" },
  { value: "80", label: "1080P 高清" },
  { value: "64", label: "720P 高清" },
  { value: "32", label: "480P 清晰" },
  { value: "16", label: "360P 流畅" },
];

const codecItems = [
  { value: "avc1", label: "H.264 · 兼容性最好" },
  { value: "hev1", label: "H.265 · 体积更小" },
  { value: "av01", label: "AV1 · 最新编码" },
];

const audioItems = [
  { value: "30280", label: "192K 高音质" },
  { value: "30232", label: "132K 标准" },
  { value: "30216", label: "64K 流畅" },
];

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const loaded = useSettingsStore((state) => state.loaded);
  const saveSettings = useSettingsStore((state) => state.save);

  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
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

  const checkFfmpeg = async () => {
    setFfmpeg({ state: "checking", message: "正在检测 ffmpeg…" });
    try {
      const result = await api.checkFfmpeg(draft.ffmpegPath);
      setFfmpeg({ state: "ok", message: result.version || "ffmpeg 可用" });
    } catch (error) {
      setFfmpeg({ state: "error", message: errorText(error) });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(draft);
      toast.success("设置已保存");
    } catch (error) {
      toast.error("保存失败", { description: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          下载目录、默认画质与合并工具。设置会自动保存在本机。
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <Card className="gap-0 py-0">
          <CardContent className="space-y-4 p-6">
            <SectionHeader
              icon={<FolderOpen className="size-4" />}
              title="存储位置"
              description="下载完成的视频会保存在这个目录中，多 P 视频会自动建立同名文件夹。"
            />
            <div className="flex gap-2">
              <Input
                value={draft.downloadDir}
                onChange={(event) => update("downloadDir", event.target.value)}
                placeholder="选择一个下载目录…"
                className="h-9 flex-1 font-mono text-xs"
              />
              <Button variant="outline" onClick={pickDirectory} className="shrink-0">
                <FolderOpen />
                浏览
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardContent className="space-y-5 p-6">
            <SectionHeader
              icon={<SlidersHorizontal className="size-4" />}
              title="下载偏好"
              description="解析视频时默认选中这些选项，仍可在首页单独调整。"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认画质</Label>
                <Select
                  value={String(draft.qn)}
                  onValueChange={(value) => value != null && update("qn", Number(value))}
                  items={qualityItems}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="选择画质" />
                  </SelectTrigger>
                  <SelectContent>
                    {qualityItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认编码</Label>
                <Select
                  value={draft.codec}
                  onValueChange={(value) => update("codec", value ?? "avc1")}
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
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认音轨</Label>
                <Select
                  value={String(draft.audioId)}
                  onValueChange={(value) => value != null && update("audioId", Number(value))}
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
              </div>

              <div className="flex items-end">
                <label className="flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-muted/30 px-3 text-xs">
                  <span className="inline-flex items-center gap-2">
                    <Download className="size-3.5 text-muted-foreground" />
                    同时保存视频封面
                  </span>
                  <Switch
                    size="sm"
                    checked={draft.saveCover}
                    onCheckedChange={(checked) => update("saveCover", checked)}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardContent className="space-y-4 p-6">
            <SectionHeader
              icon={<Terminal className="size-4" />}
              title="视频合并工具"
              description="DASH 模式需要 ffmpeg 将音视频合并为 MP4。填写 ffmpeg 可执行文件路径，或保留 ffmpeg 使用系统 PATH。"
            />
            <div className="flex gap-2">
              <Input
                value={draft.ffmpegPath}
                onChange={(event) => update("ffmpegPath", event.target.value)}
                placeholder="ffmpeg 或 D:\\ffmpeg\\bin\\ffmpeg.exe"
                className="h-9 flex-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={checkFfmpeg}
                disabled={ffmpeg.state === "checking"}
                className="shrink-0"
              >
                {ffmpeg.state === "checking" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Terminal />
                )}
                检测
              </Button>
            </div>

            {ffmpeg.state === "ok" ? (
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                <span className="break-all">{ffmpeg.message}</span>
              </div>
            ) : ffmpeg.state === "error" ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription className="text-xs">
                  {ffmpeg.message}。你仍然可以使用「单文件 MP4」模式下载（最高
                  720P，无需合并）。
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-[11px] text-muted-foreground/80">
                提示：如果使用单文件 MP4 模式，可以不安装 ffmpeg。
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div
        className={cn(
          "sticky bottom-0 z-10 mt-6 flex items-center justify-between gap-3 border-t border-border/70 bg-background/85 py-3 backdrop-blur",
          "-mx-6 px-6 sm:-mx-10 sm:px-10",
        )}
      >
        <span className="text-[11px] text-muted-foreground">
          {loaded ? (dirty ? "有未保存的修改" : "所有设置已保存") : "正在加载设置…"}
        </span>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          保存设置
        </Button>
      </div>

      <footer className="mt-6 flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground/70">
        <HardDriveDownload className="size-3.5" />
        BiliDown MVP · 仅供个人学习与备份使用，请遵守哔哩哔哩用户协议与著作权法。
      </footer>
    </div>
  );
}
