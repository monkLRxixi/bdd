import { invoke } from "@tauri-apps/api/core";
import type {
  DownloadRequest,
  FfmpegStatus,
  QrLogin,
  QrPollResult,
  Settings,
  StreamsPayload,
  Target,
  UserInfo,
  VideoInfo,
} from "./types";

export const api = {
  resolveTarget: (input: string) =>
    invoke<Target>("resolve_target", { input }),

  videoInfo: (bvid?: string | null, aid?: number | null) =>
    invoke<VideoInfo>("get_video_info", {
      bvid: bvid ?? null,
      aid: aid ?? null,
    }),

  streams: (bvid: string, cid: number) =>
    invoke<StreamsPayload>("get_streams", { bvid, cid }),

  startDownload: (req: DownloadRequest) =>
    invoke<void>("start_download", { req }),

  cancelDownload: (id: string) =>
    invoke<boolean>("cancel_download", { id }),

  loginState: () => invoke<UserInfo>("login_state"),

  qrGenerate: () => invoke<QrLogin>("qr_generate"),

  qrPoll: (key: string) => invoke<QrPollResult>("qr_poll", { key }),

  logout: () => invoke<void>("logout"),

  getSettings: () => invoke<Settings>("get_settings"),

  saveSettings: (settings: Settings) =>
    invoke<void>("save_settings", { settings }),

  checkFfmpeg: (path: string) =>
    invoke<FfmpegStatus>("check_ffmpeg", { path }),
};

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请重试";
}
