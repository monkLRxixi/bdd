//! Network-backed integration checks.
//!
//! These hit the real Bilibili API (and optionally download a real video), so
//! they are ignored by default. Run them explicitly:
//!
//! ```text
//! cargo test --test api -- --ignored --nocapture --test-threads=1
//! ```

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bilibili_down_lib::AppState;
use bilibili_down_lib::bili;
use bilibili_down_lib::download::{self, DownloadRequest};
use bilibili_down_lib::settings::Settings;

fn test_state(dir: &Path) -> Arc<AppState> {
    let http = reqwest::Client::builder()
        .user_agent(bili::UA)
        .timeout(Duration::from_secs(60))
        .build()
        .unwrap();
    Arc::new(AppState {
        http,
        cookies: Mutex::new(HashMap::new()),
        wbi: Mutex::new(None),
        settings: Mutex::new(Settings {
            download_dir: dir.to_string_lossy().to_string(),
            ..Settings::default()
        }),
        cancel: Mutex::new(HashMap::new()),
        download_sem: Mutex::new(Arc::new(tokio::sync::Semaphore::new(2))),
        user: Mutex::new(None),
        data_dir: dir.to_path_buf(),
    })
}

#[tokio::test]
#[ignore = "requires network access to bilibili.com"]
async fn resolves_video_and_streams() {
    let dir = std::env::temp_dir().join("bilidown-api-test");
    std::fs::create_dir_all(&dir).unwrap();
    let state = test_state(&dir);

    bili::ensure_fingerprint(&state).await.unwrap();
    assert!(state.cookies.lock().unwrap().contains_key("buvid3"));

    let target = bili::resolve_target(&state, "https://www.bilibili.com/video/BV1GJ411x7h7")
        .await
        .unwrap();
    assert_eq!(target.bvid.as_deref(), Some("BV1GJ411x7h7"));

    let video = bili::fetch_video(&state, target.bvid.as_deref(), None)
        .await
        .unwrap();
    assert!(!video.pages.is_empty());
    assert!(!video.title.is_empty());

    let cid = video.pages[0].cid;
    let dash = bili::fetch_dash(&state, &video.bvid, cid, 127)
        .await
        .unwrap();
    assert!(!dash.videos.is_empty());
    assert!(!dash.audios.is_empty());

    let (picked_video, picked_audio) = bili::pick_dash(&dash, 64, "avc1", Some(30280)).unwrap();
    assert!(picked_video.base_url.starts_with("https://"));
    assert!(picked_audio.bandwidth > 0);

    let mp4 = bili::fetch_mp4(&state, &video.bvid, cid, 80).await.unwrap();
    assert!(!mp4.parts.is_empty());
}

#[tokio::test]
#[ignore = "downloads a real video; run with --ignored"]
async fn downloads_dash_and_merges() {
    let dir = std::env::temp_dir().join("bilidown-dl-test");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let state = test_state(&dir);

    let video = bili::fetch_video(&state, Some("BV1GJ411x7h7"), None)
        .await
        .unwrap();
    let cid = video.pages[0].cid;

    let request = DownloadRequest {
        id: "test".into(),
        bvid: video.bvid.clone(),
        cid,
        title: "bilidown-test".into(),
        part: "p1".into(),
        page: 1,
        is_multi: false,
        qn: 32,
        codec: "avc1".into(),
        mode: "dash".into(),
        audio_id: Some(30280),
        dir: dir.to_string_lossy().to_string(),
        save_cover: false,
        cover: String::new(),
        source_url: String::new(),
    };

    let cancel = Arc::new(AtomicBool::new(false));
    let out = download::run_headless(state, request, cancel)
        .await
        .expect("download should succeed");

    let size = std::fs::metadata(&out).unwrap().len();
    println!("output: {} ({size} bytes)", out.display());
    assert!(out.exists());
    assert!(size > 500_000, "output should contain a real video");
    let _ = std::fs::remove_dir_all(&dir);
}
