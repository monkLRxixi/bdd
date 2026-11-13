import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  Bug,
  Code2,
  Heart,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const VERSION = __APP_VERSION__;
const REPO = "https://github.com/monkLRxixi/bdd";

const links = [
  {
    label: "项目主页",
    value: "github.com/monkLRxixi/bdd",
    href: REPO,
    icon: <Code2 className="size-[15px]" />,
  },
  {
    label: "问题反馈",
    value: "提交 Issue 或建议",
    href: `${REPO}/issues`,
    icon: <Bug className="size-[15px]" />,
  },
  {
    label: "开源许可",
    value: "MIT License",
    href: `${REPO}/blob/main/LICENSE`,
    icon: <Scale className="size-[15px]" />,
  },
];

const stack = [
  { layer: "桌面壳", value: "Tauri 2" },
  { layer: "前端", value: "React 19 · TypeScript · React Router 7" },
  { layer: "状态", value: "Zustand 5" },
  { layer: "界面", value: "shadcn/ui · Tailwind CSS 4 · Lucide" },
  { layer: "后端", value: "Rust · reqwest (rustls) · tokio" },
  { layer: "媒体", value: "ffmpeg（DASH 合并）" },
];

const credits = [
  { name: "Tauri", href: "https://tauri.app/" },
  { name: "React", href: "https://react.dev/" },
  { name: "shadcn/ui", href: "https://ui.shadcn.com/" },
  { name: "Tailwind CSS", href: "https://tailwindcss.com/" },
  { name: "Lucide", href: "https://lucide.dev/" },
  { name: "ffmpeg", href: "https://ffmpeg.org/" },
];

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    // 浏览器预览（无 Tauri 运行时）时退回到新标签页
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </div>
  );
}

function LinkRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void openExternal(href)}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {value}
        </span>
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </button>
  );
}

export function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">关于</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          应用信息、技术栈与开源致谢。
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <img
              src="/bdd-icon.png"
              alt="BiliDown"
              className="size-16 shrink-0 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  BiliDown
                </h2>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  v{VERSION}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  MIT
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                简洁的桌面端哔哩哔哩视频下载器。粘贴链接即可解析视频与分 P，
                支持 DASH 音视频合并、单文件 MP4、批量下载与扫码登录。
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Cookie 与设置仅保存在本机
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3.5 text-primary" />
                  深浅主题 · 无边框窗口
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternal(REPO)}
            >
              <Code2 />
              查看源码
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="gap-0 py-0">
            <CardContent className="space-y-3 p-5">
              <SectionTitle icon={<Sparkles className="size-3.5" />}>
                技术栈
              </SectionTitle>
              <div className="space-y-2 border-t border-border/70 pt-3">
                {stack.map((item) => (
                  <div
                    key={item.layer}
                    className="flex items-start justify-between gap-4 text-xs"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {item.layer}
                    </span>
                    <span className="text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardContent className="space-y-3 p-5">
              <SectionTitle icon={<Code2 className="size-3.5" />}>
                链接
              </SectionTitle>
              <div className="-mx-2 space-y-0.5 border-t border-border/70 pt-2">
                {links.map((link) => (
                  <LinkRow key={link.label} {...link} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="gap-0 py-0">
          <CardContent className="space-y-3 p-5">
            <SectionTitle icon={<Heart className="size-3.5" />}>
              致谢
            </SectionTitle>
            <div className="flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
              {credits.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => void openExternal(item.href)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.name}
                  <ArrowUpRight className="size-3 opacity-60" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardContent className="flex gap-3 p-5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium">合规与隐私</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                本项目仅用于个人学习、技术研究与备份场景，请勿用于商业分发、
                批量抓取或绕过付费墙。所有视频版权归原作者及哔哩哔哩所有。
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                Cookie、设置与下载记录均存放在本机应用数据目录，
                不会上传到任何服务器；退出登录会清除会话。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-4 text-[11px] text-muted-foreground/70">
        <span>BiliDown {VERSION}</span>
        <span aria-hidden>·</span>
        <span>MIT License</span>
        <span aria-hidden>·</span>
        <span>仅供个人学习与备份使用</span>
      </footer>
    </div>
  );
}
