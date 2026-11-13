export interface PageInfo {
  cid: number;
  page: number;
  part: string;
  duration: number;
  width: number;
  height: number;
}

export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  desc: string;
  duration: number;
  pubdate: number;
  ownerName: string;
  ownerFace: string;
  views: number;
  danmaku: number;
  likes: number;
  pages: PageInfo[];
  isMulti: boolean;
  chargeable: boolean;
}

export interface QualityOption {
  id: number;
  label: string;
  detail: string;
  codecs: string[];
  width: number;
  height: number;
  bandwidth: number;
  frameRate: string;
}

export interface AudioOption {
  id: number;
  label: string;
  codecs: string;
  bandwidth: number;
}

export interface Mp4Payload {
  quality: number;
  label: string;
  parts: number;
  size: number;
}

export interface StreamsPayload {
  loggedIn: boolean;
  duration: number;
  qualities: QualityOption[];
  audios: AudioOption[];
  mp4: Mp4Payload | null;
  isDrm: boolean;
  note: string | null;
}

export interface Target {
  bvid?: string | null;
  aid?: number | null;
}

export interface UserInfo {
  isLogin: boolean;
  mid: number;
  uname: string;
  face: string;
  vip: boolean;
  vipLabel: string;
  level: number;
}

export interface QrLogin {
  url: string;
  key: string;
}

export interface QrPollResult {
  status: "waiting" | "scanned" | "expired" | "ok";
  message: string;
  user?: UserInfo | null;
}

export interface Settings {
  downloadDir: string;
  qn: number;
  codec: string;
  audioId: number;
  saveCover: boolean;
  ffmpegPath: string;
  notifyOnComplete: boolean;
  concurrency: number;
}

export type DownloadMode = "dash" | "mp4";

export interface DownloadRequest {
  id: string;
  bvid: string;
  cid: number;
  title: string;
  part: string;
  page: number;
  isMulti: boolean;
  qn: number;
  codec: string;
  mode: DownloadMode;
  audioId: number | null;
  dir: string;
  saveCover: boolean;
  cover: string;
  sourceUrl: string;
}

export type TaskStatus =
  | "queued"
  | "downloading"
  | "merging"
  | "done"
  | "error"
  | "canceled";

export interface DownloadProgress {
  id: string;
  status: TaskStatus;
  phase: string;
  received: number;
  total: number;
  percent: number;
  speed: number;
  message: string;
  file?: string | null;
}

export interface FfmpegStatus {
  ok: boolean;
  version: string;
}
