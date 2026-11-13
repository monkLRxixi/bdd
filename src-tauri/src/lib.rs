pub mod bili;
pub mod download;
pub mod settings;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use bili::{Mp4Payload, QrLogin, QrPollResult, StreamsPayload, Target, UserInfo, VideoInfo};
use download::DownloadRequest;
use settings::Settings;

pub struct AppState {
    pub http: reqwest::Client,
    pub cookies: Mutex<HashMap<String, String>>,
    pub wbi: Mutex<Option<bili::WbiKeys>>,
    pub settings: Mutex<Settings>,
    pub cancel: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub user: Mutex<Option<UserInfo>>,
    pub data_dir: PathBuf,
}

impl AppState {
    fn set_user(&self, user: UserInfo) {
        *self.user.lock().unwrap() = Some(user);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FfmpegStatus {
    ok: bool,
    version: String,
}

/* ------------------------------------------------------------------ */
/* commands                                                           */
/* ------------------------------------------------------------------ */

#[tauri::command]
async fn resolve_target(state: State<'_, Arc<AppState>>, input: String) -> Result<Target, String> {
    let state = state.inner().clone();
    bili::resolve_target(&state, &input).await
}

#[tauri::command]
async fn get_video_info(
    state: State<'_, Arc<AppState>>,
    bvid: Option<String>,
    aid: Option<u64>,
) -> Result<VideoInfo, String> {
    let state = state.inner().clone();
    bili::fetch_video(&state, bvid.as_deref(), aid).await
}

#[tauri::command]
async fn get_streams(
    state: State<'_, Arc<AppState>>,
    bvid: String,
    cid: i64,
) -> Result<StreamsPayload, String> {
    let state = state.inner().clone();
    let logged_in = state.cookies.lock().unwrap().contains_key("SESSDATA");
    let dash = bili::fetch_dash(&state, &bvid, cid, 127).await;

    let mp4: Option<Mp4Payload> = bili::fetch_mp4(&state, &bvid, cid, 80)
        .await
        .ok()
        .map(|data| Mp4Payload {
            quality: data.quality,
            label: bili::qn_label(data.quality),
            parts: data.parts.len(),
            size: data.parts.iter().map(|p| p.size).sum(),
        });

    match dash {
        Ok(dash) => Ok(bili::build_streams(logged_in, &dash, mp4)),
        // DASH may be unavailable for the account or the video. If a muxed MP4
        // stream exists, surface it so the UI can still offer a download.
        Err(err) => match mp4 {
            Some(mp4) => Ok(StreamsPayload {
                logged_in,
                duration: 0,
                qualities: Vec::new(),
                audios: Vec::new(),
                mp4: Some(mp4),
                is_drm: false,
                note: Some(format!("DASH 不可用：{err}")),
            }),
            None => Err(err),
        },
    }
}

#[tauri::command]
async fn start_download(app: AppHandle, req: DownloadRequest) -> Result<(), String> {
    let state = app.state::<Arc<AppState>>().inner().clone();
    let id = req.id.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .cancel
        .lock()
        .unwrap()
        .insert(id.clone(), cancel.clone());

    tauri::async_runtime::spawn(async move {
        download::run(app, state.clone(), req, cancel).await;
        state.cancel.lock().unwrap().remove(&id);
    });
    Ok(())
}

#[tauri::command]
fn cancel_download(state: State<'_, Arc<AppState>>, id: String) -> bool {
    if let Some(flag) = state.cancel.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}

#[tauri::command]
async fn login_state(state: State<'_, Arc<AppState>>) -> Result<UserInfo, String> {
    let state = state.inner().clone();
    let user = bili::nav_user(&state).await?;
    state.set_user(user.clone());
    Ok(user)
}

#[tauri::command]
async fn qr_generate(state: State<'_, Arc<AppState>>) -> Result<QrLogin, String> {
    let state = state.inner().clone();
    bili::qr_generate(&state).await
}

#[tauri::command]
async fn qr_poll(state: State<'_, Arc<AppState>>, key: String) -> Result<QrPollResult, String> {
    let state = state.inner().clone();
    let result = bili::qr_poll(&state, &key).await?;
    if let Some(user) = &result.user {
        state.set_user(user.clone());
    }
    Ok(result)
}

#[tauri::command]
async fn logout(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let state = state.inner().clone();
    bili::logout(&state);
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, Arc<AppState>>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(state: State<'_, Arc<AppState>>, settings: Settings) -> Result<(), String> {
    let state = state.inner().clone();
    {
        let mut guard = state.settings.lock().unwrap();
        *guard = settings.clone();
    }
    settings::save(&state.data_dir, &settings)
}

#[tauri::command]
async fn check_ffmpeg(path: String) -> Result<FfmpegStatus, String> {
    let bin = if path.trim().is_empty() {
        "ffmpeg".to_string()
    } else {
        path.trim().to_string()
    };
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.as_std_mut().creation_flags(0x0800_0000);
    }

    match cmd.output().await {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let first = text.lines().next().unwrap_or("ffmpeg").to_string();
            Ok(FfmpegStatus {
                ok: true,
                version: first,
            })
        }
        Ok(_) => Err("ffmpeg 存在但无法正常运行".to_string()),
        Err(_) => Err("未找到 ffmpeg，请填写可执行文件完整路径".to_string()),
    }
}

/* ------------------------------------------------------------------ */
/* startup                                                            */
/* ------------------------------------------------------------------ */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let cookies = bili::load_cookies(&data_dir);
            let mut loaded = settings::load(&data_dir);
            if loaded.download_dir.trim().is_empty() {
                loaded.download_dir = app
                    .path()
                    .download_dir()
                    .map(|p| p.join("bilibili-down"))
                    .unwrap_or_else(|_| data_dir.join("downloads"))
                    .to_string_lossy()
                    .to_string();
            }

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::ACCEPT,
                "application/json, text/plain, */*".parse().unwrap(),
            );
            headers.insert(
                reqwest::header::ACCEPT_LANGUAGE,
                "zh-CN,zh;q=0.9".parse().unwrap(),
            );
            headers.insert(
                reqwest::header::REFERER,
                "https://www.bilibili.com/".parse().unwrap(),
            );
            headers.insert(
                reqwest::header::ORIGIN,
                "https://www.bilibili.com".parse().unwrap(),
            );

            let http = reqwest::Client::builder()
                .user_agent(bili::UA)
                .default_headers(headers)
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(15))
                .build()?;

            let state = Arc::new(AppState {
                http,
                cookies: Mutex::new(cookies),
                wbi: Mutex::new(None),
                settings: Mutex::new(loaded),
                cancel: Mutex::new(HashMap::new()),
                user: Mutex::new(None),
                data_dir,
            });
            app.manage(state.clone());

            // Warm up the device fingerprint and the login state in the background.
            tauri::async_runtime::spawn(async move {
                let logged_in = state.cookies.lock().unwrap().contains_key("SESSDATA");
                if logged_in {
                    if let Ok(user) = bili::nav_user(&state).await {
                        state.set_user(user);
                    }
                } else {
                    let _ = bili::ensure_fingerprint(&state).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resolve_target,
            get_video_info,
            get_streams,
            start_download,
            cancel_download,
            login_state,
            qr_generate,
            qr_poll,
            logout,
            get_settings,
            save_settings,
            check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
