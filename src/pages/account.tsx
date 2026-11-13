import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorText } from "@/lib/api";
import type { QrLogin } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

type Status = "loading" | "waiting" | "scanned" | "expired" | "ok" | "error";

export function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);

  const [qr, setQr] = useState<QrLogin | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const generate = useCallback(async () => {
    setStatus("loading");
    setError("");
    setMessage("正在生成登录二维码…");
    try {
      const data = await api.qrGenerate();
      setQr(data);
      setStatus("waiting");
      setMessage("请使用哔哩哔哩手机客户端扫码");
    } catch (err) {
      setStatus("error");
      setError(errorText(err));
      setMessage("二维码生成失败");
    }
  }, []);

  useEffect(() => {
    if (!user && !qr) generate();
  }, [user, qr, generate]);

  useEffect(() => {
    if (!qr) return;
    if (status !== "waiting" && status !== "scanned") return;

    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const result = await api.qrPoll(qr.key);
        if (!alive) return;

        if (result.status === "ok") {
          setStatus("ok");
          setMessage("登录成功");
          setQr(null);
          if (result.user) setUser(result.user);
          toast.success("登录成功", { description: result.user?.uname });
          return;
        }

        setStatus(result.status);
        setMessage(result.message);

        if (result.status === "expired") return;
        timer = window.setTimeout(tick, 2000);
      } catch (err) {
        if (!alive) return;
        setStatus("error");
        setError(errorText(err));
        setMessage("轮询登录状态失败");
      }
    };

    timer = window.setTimeout(tick, 1600);
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [qr, status, setUser]);

  const onLogout = async () => {
    try {
      await logout();
      toast("已退出登录");
      setQr(null);
      setStatus("loading");
    } catch (err) {
      toast.error("退出失败", { description: errorText(err) });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">账号</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          登录后可下载 1080P 及以上画质，Cookie 仅保存在本机。
        </p>
      </header>

      {user ? (
        <div className="mt-6 space-y-4">
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
              <Avatar size="lg" className="size-16 after:border-primary/20">
                <AvatarImage
                  src={user.face}
                  alt={user.uname}
                  referrerPolicy="no-referrer"
                />
                <AvatarFallback className="text-lg">
                  {user.uname.slice(0, 1) || "B"}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {user.uname}
                  </h2>
                  {user.vip ? (
                    <Badge className="gap-1 border-0 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Crown className="size-3" />
                      {user.vipLabel || "大会员"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      普通账号
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="size-3.5" /> UID {user.mid}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3.5" /> Lv{user.level}
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    <ShieldCheck className="size-3.5" /> 已登录
                  </span>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut />
                退出登录
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "1080P 高清",
                desc: "登录后即可获取 1080P DASH 流",
                active: true,
              },
              {
                title: "4K / 8K",
                desc: "大会员专属画质与 HDR",
                active: user.vip,
              },
              {
                title: "高码率音轨",
                desc: "132K / 192K 音轨与无损音频",
                active: user.vip,
              },
            ].map((item) => (
              <div
                key={item.title}
                className={cn(
                  "rounded-xl border border-border bg-card p-4",
                  !item.active && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">{item.title}</p>
                  {item.active ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : (
                    <Crown className="size-4 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col items-center p-6">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-3.5">
                {qr ? (
                  <QRCodeSVG
                    value={qr.url}
                    size={168}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0d1512"
                  />
                ) : (
                  <Skeleton className="size-[168px] rounded-lg" />
                )}

                {status === "expired" || status === "error" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/92 backdrop-blur-sm">
                    <AlertCircle className="size-5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      二维码已失效
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={generate}
                      className="mt-1 bg-white"
                    >
                      <RefreshCw />
                      刷新
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex min-h-[18px] items-center gap-1.5 text-[11px] text-muted-foreground">
                {status === "loading" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : status === "scanned" ? (
                  <CheckCircle2 className="size-3.5 text-primary" />
                ) : status === "waiting" ? (
                  <span className="size-1.5 animate-soft-pulse rounded-full bg-primary" />
                ) : null}
                <span
                  className={cn(
                    status === "scanned" && "text-primary",
                    status === "error" && "text-destructive",
                  )}
                >
                  {message}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={generate}>
                  <RefreshCw />
                  刷新二维码
                </Button>
              </div>

              {error ? (
                <Alert variant="destructive" className="mt-4 w-full">
                  <AlertCircle />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card className="gap-0 py-0">
              <CardContent className="space-y-4 p-6">
                <div className="inline-flex items-center gap-2 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
                  <Sparkles className="size-3.5" />
                  登录后可获得更多画质
                </div>
                <h2 className="text-lg font-semibold tracking-tight">
                  扫码登录哔哩哔哩
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  打开哔哩哔哩手机客户端，使用右上角「扫一扫」扫描左侧二维码，
                  确认后即可完成登录。二维码 3 分钟内有效。
                </p>

                <div className="space-y-2.5 border-t border-border/70 pt-4">
                  {[
                    { label: "普通账号", value: "1080P 高清 · 132K 音轨" },
                    { label: "大会员", value: "4K / 8K · HDR · 杜比 / 无损音频" },
                    { label: "隐私", value: "Cookie 仅保存于本机应用数据目录" },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-4 text-xs"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {row.label}
                      </span>
                      <span className="text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/70">
              请使用自己的账号登录，下载内容仅用于个人学习与备份。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
