use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use crate::AppState;
use crate::bili;
use crate::settings::Settings;

pub const CANCELED: &str = "__canceled__";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub id: String,
    pub bvid: String,
    pub cid: i64,
    pub title: String,
    pub part: String,
    pub page: u32,
    pub is_multi: bool,
    pub qn: u32,
    pub codec: String,
    /// dash | mp4
    pub mode: String,
    pub audio_id: Option<i64>,
    pub dir: String,
    pub save_cover: bool,
    pub cover: String,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    /// downloading | merging | done | error | canceled
    pub status: String,
    /// video | audio | mp4 | cover | merge
    pub phase: String,
    pub received: u64,
    pub total: u64,
    pub percent: f64,
    /// bytes per second
    pub speed: u64,
    pub message: String,
    pub file: Option<String>,
}

pub struct Reporter {
    app: Option<AppHandle>,
    id: String,
}

impl Reporter {
    fn new(app: AppHandle, id: String) -> Self {
        Self { app: Some(app), id }
    }

    fn emit(
        &self,
        status: &str,
        phase: &str,
        received: u64,
        total: u64,
        percent: f64,
        speed: u64,
        message: &str,
        file: Option<String>,
    ) {
        let Some(app) = &self.app else { return };
        let _ = app.emit(
            "download:progress",
            ProgressPayload {
                id: self.id.clone(),
                status: status.to_string(),
                phase: phase.to_string(),
                received,
                total,
                percent: percent.clamp(0.0, 100.0),
                speed,
                message: message.to_string(),
                file,
            },
        );
    }
}

pub fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if (c as u32) < 0x20 => ' ',
            c => c,
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut trimmed = cleaned.trim_matches(|c| c == '.' || c == ' ').to_string();
    if trimmed.chars().count() > 90 {
        trimmed = trimmed.chars().take(90).collect();
    }
    if trimmed.is_empty() {
        "video".to_string()
    } else {
        trimmed
    }
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".to_string());
    let ext = path
        .extension()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "mp4".to_string());
    for index in 1..1000 {
        let candidate = parent.join(format!("{stem} ({index}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    path
}

fn ffmpeg_bin(settings: &Settings) -> String {
    let path = settings.ffmpeg_path.trim();
    if path.is_empty() {
        "ffmpeg".to_string()
    } else {
        path.to_string()
    }
}

#[cfg(windows)]
fn hide_console(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut tokio::process::Command) {}

async fn download_stream(
    state: &AppState,
    urls: &[String],
    dest: &Path,
    cancel: &AtomicBool,
    rep: &Reporter,
    phase: &str,
    from: f64,
    to: f64,
) -> Result<u64, String> {
    if urls.is_empty() {
        return Err("下载地址为空".to_string());
    }

    let mut last_error = String::from("下载失败");
    for (index, url) in urls.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELED.to_string());
        }
        let attempt = async {
            let resp = state
                .http
                .get(url)
                .header("Referer", "https://www.bilibili.com")
                .header("Cookie", bili::cookie_header(state))
                .send()
                .await
                .map_err(|e| format!("连接失败: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("HTTP {}", resp.status()));
            }

            let total = resp.content_length().unwrap_or(0);
            let mut file = tokio::fs::File::create(dest)
                .await
                .map_err(|e| format!("无法创建文件: {e}"))?;
            let mut stream = resp.bytes_stream();
            let mut received: u64 = 0;
            let mut last_tick = Instant::now();
            let mut last_bytes: u64 = 0;

            while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    return Err(CANCELED.to_string());
                }
                let chunk = chunk.map_err(|e| format!("下载中断: {e}"))?;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("写入文件失败: {e}"))?;
                received += chunk.len() as u64;

                if last_tick.elapsed() >= Duration::from_millis(160) {
                    let seconds = last_tick.elapsed().as_secs_f64().max(0.001);
                    let speed = ((received - last_bytes) as f64 / seconds) as u64;
                    let percent = if total > 0 {
                        from + (to - from) * (received as f64 / total as f64)
                    } else {
                        from
                    };
                    rep.emit(
                        "downloading",
                        phase,
                        received,
                        total,
                        percent,
                        speed,
                        "",
                        None,
                    );
                    last_tick = Instant::now();
                    last_bytes = received;
                }
            }

            file.flush()
                .await
                .map_err(|e| format!("写入文件失败: {e}"))?;
            rep.emit(
                "downloading",
                phase,
                received,
                total.max(received),
                to,
                0,
                "",
                None,
            );
            Ok::<u64, String>(received)
        }
        .await;

        match attempt {
            Ok(bytes) => return Ok(bytes),
            Err(err) if err == CANCELED => return Err(err),
            Err(err) => {
                last_error = format!("{err}（第 {} 个地址）", index + 1);
                let _ = tokio::fs::remove_file(dest).await;
            }
        }
    }

    Err(last_error)
}

async fn fetch_cover(state: &AppState, url: &str, dest: &Path) -> Result<(), String> {
    let resp = state
        .http
        .get(url)
        .header("Referer", "https://www.bilibili.com")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| format!("写入封面失败: {e}"))
}

async fn run_ffmpeg(settings: &Settings, args: &[String]) -> Result<(), String> {
    let bin = ffmpeg_bin(settings);
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.args(args);
    hide_console(&mut cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("无法启动 ffmpeg（{bin}）：{e}\n请在设置中填写正确的 ffmpeg 路径"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let brief: String = stderr.chars().take(400).collect();
        return Err(format!("ffmpeg 执行失败：{brief}"));
    }
    Ok(())
}

async fn merge_av(
    settings: &Settings,
    video: &Path,
    audio: &Path,
    out: &Path,
    title: &str,
    source: &str,
) -> Result<(), String> {
    let args = vec![
        "-y".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        video.to_string_lossy().to_string(),
        "-i".into(),
        audio.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-metadata".into(),
        format!("title={title}"),
        "-metadata".into(),
        format!("comment={source}"),
        out.to_string_lossy().to_string(),
    ];
    run_ffmpeg(settings, &args).await
}

async fn concat_parts(settings: &Settings, parts: &[PathBuf], out: &Path) -> Result<(), String> {
    let list_path = out.with_extension("concat.txt");
    let mut content = String::new();
    for part in parts {
        let escaped = part
            .to_string_lossy()
            .replace('\\', "/")
            .replace('\'', "'\\''");
        content.push_str(&format!("file '{escaped}'\n"));
    }
    tokio::fs::write(&list_path, content)
        .await
        .map_err(|e| format!("写入临时列表失败: {e}"))?;

    let args = vec![
        "-y".into(),
        "-loglevel".into(),
        "error".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_path.to_string_lossy().to_string(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        out.to_string_lossy().to_string(),
    ];
    let result = run_ffmpeg(settings, &args).await;
    let _ = tokio::fs::remove_file(&list_path).await;
    result
}

async fn run_inner(
    rep: &Reporter,
    state: &AppState,
    req: &DownloadRequest,
    cancel: &AtomicBool,
    temps: &mut Vec<PathBuf>,
) -> Result<PathBuf, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err(CANCELED.to_string());
    }
    let settings = state.settings.lock().unwrap().clone();

    let base_dir = if req.dir.trim().is_empty() {
        settings.download_dir.clone()
    } else {
        req.dir.clone()
    };
    let base = PathBuf::from(&base_dir);
    tokio::fs::create_dir_all(&base)
        .await
        .map_err(|e| format!("无法创建下载目录: {e}"))?;

    let folder = if req.is_multi {
        base.join(sanitize(&req.title))
    } else {
        base.clone()
    };
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|e| format!("无法创建目录: {e}"))?;

    let stem = if req.is_multi {
        format!("P{:02} {}", req.page, sanitize(&req.part))
    } else {
        sanitize(&req.title)
    };
    let out = unique_path(folder.join(format!("{stem}.mp4")));

    rep.emit(
        "downloading",
        "prepare",
        0,
        0,
        0.0,
        0,
        "正在获取播放地址…",
        None,
    );

    let source_url = if req.source_url.is_empty() {
        format!("https://www.bilibili.com/video/{}", req.bvid)
    } else {
        req.source_url.clone()
    };

    if req.mode == "mp4" {
        let mp4 = bili::fetch_mp4(state, &req.bvid, req.cid, req.qn).await?;
        let total_parts = mp4.parts.len();
        let mut downloaded_parts: Vec<PathBuf> = Vec::new();

        for (index, part) in mp4.parts.iter().enumerate() {
            let temp = folder.join(format!(".{stem}.part{index}.m4s"));
            temps.push(temp.clone());
            let from = 90.0 * (index as f64) / (total_parts as f64);
            let to = 90.0 * ((index + 1) as f64) / (total_parts as f64);
            download_stream(
                state,
                std::slice::from_ref(&part.url),
                &temp,
                cancel,
                rep,
                "mp4",
                from,
                to,
            )
            .await?;
            downloaded_parts.push(temp);
        }

        if downloaded_parts.len() == 1 {
            tokio::fs::rename(&downloaded_parts[0], &out)
                .await
                .map_err(|e| format!("保存文件失败: {e}"))?;
        } else {
            rep.emit("merging", "merge", 0, 0, 94.0, 0, "正在合并分段…", None);
            concat_parts(&settings, &downloaded_parts, &out).await?;
            for part in &downloaded_parts {
                let _ = tokio::fs::remove_file(part).await;
            }
        }
    } else {
        let dash = bili::fetch_dash(state, &req.bvid, req.cid, req.qn).await?;
        let (video, audio) = bili::pick_dash(&dash, req.qn, &req.codec, req.audio_id)?;

        let video_temp = folder.join(format!(".{stem}.video.m4s"));
        let audio_temp = folder.join(format!(".{stem}.audio.m4s"));
        temps.push(video_temp.clone());
        temps.push(audio_temp.clone());

        let mut video_urls = vec![video.base_url.clone()];
        video_urls.extend(video.backup_url.clone());
        let mut audio_urls = vec![audio.base_url.clone()];
        audio_urls.extend(audio.backup_url.clone());

        download_stream(
            state,
            &video_urls,
            &video_temp,
            cancel,
            rep,
            "video",
            0.0,
            66.0,
        )
        .await?;

        download_stream(
            state,
            &audio_urls,
            &audio_temp,
            cancel,
            rep,
            "audio",
            66.0,
            92.0,
        )
        .await?;

        rep.emit("merging", "merge", 0, 0, 94.0, 0, "正在合并音视频…", None);
        merge_av(
            &settings,
            &video_temp,
            &audio_temp,
            &out,
            &req.title,
            &source_url,
        )
        .await?;

        let _ = tokio::fs::remove_file(&video_temp).await;
        let _ = tokio::fs::remove_file(&audio_temp).await;
    }

    if req.save_cover && !req.cover.is_empty() {
        rep.emit("downloading", "cover", 0, 0, 96.0, 0, "正在保存封面…", None);
        let cover_path = folder.join(format!("{stem}.jpg"));
        if let Err(err) = fetch_cover(state, &req.cover, &cover_path).await {
            rep.emit(
                "downloading",
                "cover",
                0,
                0,
                97.0,
                0,
                &format!("封面保存失败：{err}"),
                None,
            );
        }
    }

    Ok(out)
}

/// Tell the UI that a task is waiting for a free download slot.
pub fn notify_queued(app: &AppHandle, id: &str) {
    let reporter = Reporter {
        app: Some(app.clone()),
        id: id.to_string(),
    };
    reporter.emit(
        "queued",
        "queued",
        0,
        0,
        0.0,
        0,
        "排队中，等待下载槽位…",
        None,
    );
}

/// Download without emitting events. Used by tests and headless tooling.
pub async fn run_headless(
    state: Arc<AppState>,
    req: DownloadRequest,
    cancel: Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    let reporter = Reporter {
        app: None,
        id: req.id.clone(),
    };
    let mut temps = Vec::new();
    let result = run_inner(&reporter, &state, &req, &cancel, &mut temps).await;
    if result.is_err() {
        for temp in temps {
            let _ = tokio::fs::remove_file(temp).await;
        }
    }
    result
}

pub async fn run(
    app: AppHandle,
    state: Arc<AppState>,
    req: DownloadRequest,
    cancel: Arc<AtomicBool>,
) {
    let rep = Reporter::new(app, req.id.clone());
    let mut temps: Vec<PathBuf> = Vec::new();

    match run_inner(&rep, &state, &req, &cancel, &mut temps).await {
        Ok(path) => {
            rep.emit(
                "done",
                "done",
                0,
                0,
                100.0,
                0,
                "下载完成",
                Some(path.to_string_lossy().to_string()),
            );
        }
        Err(err) => {
            for temp in temps {
                let _ = tokio::fs::remove_file(temp).await;
            }
            if err == CANCELED || cancel.load(Ordering::Relaxed) {
                rep.emit("canceled", "done", 0, 0, 0.0, 0, "已取消", None);
            } else {
                rep.emit("error", "error", 0, 0, 0.0, 0, &err, None);
            }
        }
    }
}
