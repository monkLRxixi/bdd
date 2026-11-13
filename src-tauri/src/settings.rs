use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Where downloaded files are written.
    pub download_dir: String,
    /// Preferred quality (qn). 127 requests everything the account can access.
    pub qn: u32,
    /// Preferred video codec, matched by prefix.
    pub codec: String,
    /// Preferred audio stream id (30280 = 192K).
    pub audio_id: i64,
    /// Save the video cover next to the output file.
    pub save_cover: bool,
    /// ffmpeg executable. "ffmpeg" means: look it up on PATH.
    pub ffmpeg_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            download_dir: String::new(),
            qn: 127,
            codec: "avc1".to_string(),
            audio_id: 30280,
            save_cover: true,
            ffmpeg_path: "ffmpeg".to_string(),
        }
    }
}

pub fn load(data_dir: &Path) -> Settings {
    let path = data_dir.join("settings.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save(data_dir: &Path, settings: &Settings) -> Result<(), String> {
    let path = data_dir.join("settings.json");
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| format!("保存设置失败: {e}"))
}
