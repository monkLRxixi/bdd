use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use crate::AppState;

pub const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MIXIN_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

pub struct WbiKeys {
    pub img: String,
    pub sub: String,
    pub at: Instant,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub is_login: bool,
    pub mid: u64,
    pub uname: String,
    pub face: String,
    pub vip: bool,
    pub vip_label: String,
    pub level: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub cid: i64,
    pub page: u32,
    pub part: String,
    pub duration: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub bvid: String,
    pub aid: u64,
    pub title: String,
    pub cover: String,
    pub desc: String,
    pub duration: u32,
    pub pubdate: u64,
    pub owner_name: String,
    pub owner_face: String,
    pub views: u64,
    pub danmaku: u64,
    pub likes: u64,
    pub pages: Vec<PageInfo>,
    pub is_multi: bool,
    pub chargeable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub id: u32,
    pub label: String,
    pub detail: String,
    pub codecs: Vec<String>,
    pub width: u32,
    pub height: u32,
    pub bandwidth: u64,
    pub frame_rate: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOption {
    pub id: i64,
    pub label: String,
    pub codecs: String,
    pub bandwidth: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mp4Payload {
    pub quality: u32,
    pub label: String,
    pub parts: usize,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamsPayload {
    pub logged_in: bool,
    pub duration: u32,
    pub qualities: Vec<QualityOption>,
    pub audios: Vec<AudioOption>,
    pub mp4: Option<Mp4Payload>,
    pub is_drm: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrLogin {
    pub url: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrPollResult {
    /// waiting | scanned | expired | ok
    pub status: String,
    pub message: String,
    pub user: Option<UserInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub bvid: Option<String>,
    pub aid: Option<u64>,
}

/* ------------------------------------------------------------------ */
/* cookies                                                            */
/* ------------------------------------------------------------------ */

fn cookie_file(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("cookies.json")
}

pub fn load_cookies(data_dir: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(cookie_file(data_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_cookies(state: &AppState) {
    let jar = state.cookies.lock().unwrap().clone();
    if let Ok(raw) = serde_json::to_string_pretty(&jar) {
        let _ = std::fs::write(cookie_file(&state.data_dir), raw);
    }
}

pub fn cookie_header(state: &AppState) -> String {
    state
        .cookies
        .lock()
        .unwrap()
        .iter()
        .filter(|(k, _)| k.as_str() != "refresh_token")
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn update_cookies(state: &AppState, headers: &reqwest::header::HeaderMap) {
    let mut jar = state.cookies.lock().unwrap();
    for value in headers.get_all("set-cookie").iter() {
        let Ok(raw) = value.to_str() else { continue };
        let Some((pair, _)) = raw.split_once(';') else {
            continue;
        };
        let Some((key, val)) = pair.split_once('=') else {
            continue;
        };
        if !key.trim().is_empty() {
            jar.insert(key.trim().to_string(), val.trim().to_string());
        }
    }
}

/* ------------------------------------------------------------------ */
/* http helpers                                                       */
/* ------------------------------------------------------------------ */

pub async fn get_json(state: &AppState, url: &str) -> Result<Value, String> {
    let resp = state
        .http
        .get(url)
        .header("Cookie", cookie_header(state))
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;

    let status = resp.status();
    update_cookies(state, resp.headers());
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    if status.as_u16() == 412 {
        return Err("请求被 B 站风控拦截（412），请稍后再试".to_string());
    }
    if status.as_u16() == 403 {
        return Err("访问被拒绝（403），可能是风控或资源无权限".to_string());
    }
    serde_json::from_str::<Value>(&text)
        .map_err(|_| format!("响应解析失败（HTTP {status}），请稍后重试"))
}

fn check_code(v: &Value) -> Result<(), String> {
    let code = v["code"].as_i64().unwrap_or(0);
    if code == 0 {
        return Ok(());
    }
    let message = v["message"].as_str().unwrap_or("未知错误");
    let hint = match code {
        -101 => "（需要登录）",
        -403 => "（访问权限不足，可能需要登录或大会员）",
        -404 => "（资源不存在）",
        -352 => "（风控校验失败，请稍后再试）",
        -412 => "（IP 已被临时封禁，请等待一段时间）",
        -799 => "（请求过于频繁）",
        87007 | 87008 => "（充电专属视频，暂不支持）",
        62002 | 62004 => "（稿件不可见）",
        _ => "",
    };
    Err(format!("{message}{hint}（{code}）"))
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/* ------------------------------------------------------------------ */
/* device fingerprint                                                 */
/* ------------------------------------------------------------------ */

pub async fn ensure_fingerprint(state: &AppState) -> Result<(), String> {
    let has_buvid = state.cookies.lock().unwrap().contains_key("buvid3");
    if has_buvid {
        return Ok(());
    }
    let v = get_json(state, "https://api.bilibili.com/x/frontend/finger/spi").await?;
    let b3 = v["data"]["b_3"].as_str().unwrap_or_default();
    let b4 = v["data"]["b_4"].as_str().unwrap_or_default();
    if b3.is_empty() {
        return Ok(());
    }
    {
        let mut jar = state.cookies.lock().unwrap();
        jar.insert("buvid3".into(), b3.to_string());
        if !b4.is_empty() {
            jar.insert("buvid4".into(), b4.to_string());
        }
        jar.insert("b_nut".into(), now_secs().to_string());
    }
    save_cookies(state);
    Ok(())
}

/* ------------------------------------------------------------------ */
/* WBI signing                                                        */
/* ------------------------------------------------------------------ */

fn file_stem_from_url(url: &str) -> String {
    let name = url.rsplit('/').next().unwrap_or_default();
    name.split('.').next().unwrap_or_default().to_string()
}

fn mixin_key(img: &str, sub: &str) -> String {
    let joined = format!("{img}{sub}");
    let bytes = joined.as_bytes();
    MIXIN_TAB
        .iter()
        .filter_map(|&i| bytes.get(i).copied())
        .map(|b| b as char)
        .take(32)
        .collect()
}

pub fn enc_wbi(params: &[(&str, String)], img: &str, sub: &str) -> String {
    let mut list: Vec<(&str, String)> = params.to_vec();
    list.push(("wts", now_secs().to_string()));
    list.sort_by(|a, b| a.0.cmp(b.0));

    let query = list
        .iter()
        .map(|(k, v)| {
            let cleaned: String = v
                .chars()
                .filter(|c| !matches!(c, '!' | '\'' | '(' | ')' | '*'))
                .collect();
            format!(
                "{}={}",
                urlencoding::encode(k),
                urlencoding::encode(&cleaned)
            )
        })
        .collect::<Vec<_>>()
        .join("&");

    let w_rid = format!(
        "{:x}",
        md5::compute(format!("{}{}", query, mixin_key(img, sub)))
    );
    format!("{query}&w_rid={w_rid}")
}

pub async fn wbi_keys(state: &AppState) -> Result<(String, String), String> {
    {
        let guard = state.wbi.lock().unwrap();
        if let Some(keys) = guard.as_ref() {
            if keys.at.elapsed() < Duration::from_secs(12 * 3600) {
                return Ok((keys.img.clone(), keys.sub.clone()));
            }
        }
    }
    let v = get_json(state, "https://api.bilibili.com/x/web-interface/nav").await?;
    let img = file_stem_from_url(v["data"]["wbi_img"]["img_url"].as_str().unwrap_or_default());
    let sub = file_stem_from_url(v["data"]["wbi_img"]["sub_url"].as_str().unwrap_or_default());
    if img.is_empty() || sub.is_empty() {
        return Err("获取 WBI 签名密钥失败，请稍后重试".to_string());
    }
    *state.wbi.lock().unwrap() = Some(WbiKeys {
        img: img.clone(),
        sub: sub.clone(),
        at: Instant::now(),
    });
    Ok((img, sub))
}

async fn invalidate_wbi(state: &AppState) {
    *state.wbi.lock().unwrap() = None;
}

/* ------------------------------------------------------------------ */
/* target resolution                                                  */
/* ------------------------------------------------------------------ */

fn capture_bvid(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"(BV[0-9A-Za-z]{10})").ok()?;
    re.captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn capture_aid(text: &str) -> Option<u64> {
    let re = regex::Regex::new(r"(?:av|aid=|/av)(\d+)").ok()?;
    re.captures(text)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u64>().ok())
}

pub async fn resolve_target(state: &AppState, input: &str) -> Result<Target, String> {
    let input = input.trim();
    if input.is_empty() {
        return Err("请输入视频链接或 BV 号".to_string());
    }

    let mut text = input.to_string();
    if text.contains("b23.tv") || text.contains("bili2233.cn") {
        let url = if text.starts_with("http") {
            text.clone()
        } else {
            format!("https://{text}")
        };
        let resp = state
            .http
            .get(&url)
            .header("Cookie", cookie_header(state))
            .send()
            .await
            .map_err(|e| format!("短链解析失败: {e}"))?;
        text = resp.url().to_string();
    }

    if let Some(bvid) = capture_bvid(&text) {
        return Ok(Target {
            bvid: Some(bvid),
            aid: None,
        });
    }
    if let Some(aid) = capture_aid(&text) {
        return Ok(Target {
            bvid: None,
            aid: Some(aid),
        });
    }
    if text.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(aid) = text.parse::<u64>() {
            return Ok(Target {
                bvid: None,
                aid: Some(aid),
            });
        }
    }
    Err("无法识别的链接，请粘贴 B 站视频链接、BV 号或 av 号".to_string())
}

/* ------------------------------------------------------------------ */
/* video metadata                                                     */
/* ------------------------------------------------------------------ */

pub async fn fetch_video(
    state: &AppState,
    bvid: Option<&str>,
    aid: Option<u64>,
) -> Result<VideoInfo, String> {
    ensure_fingerprint(state).await.ok();
    let mut url = String::from("https://api.bilibili.com/x/web-interface/view?");
    if let Some(bvid) = bvid {
        url.push_str(&format!("bvid={}", urlencoding::encode(bvid)));
    } else if let Some(aid) = aid {
        url.push_str(&format!("aid={aid}"));
    } else {
        return Err("缺少视频 ID".to_string());
    }

    let v = get_json(state, &url).await?;
    check_code(&v)?;
    let data = &v["data"];

    let mut pages = Vec::new();
    if let Some(list) = data["pages"].as_array() {
        for p in list {
            pages.push(PageInfo {
                cid: p["cid"].as_i64().unwrap_or(0),
                page: p["page"].as_u64().unwrap_or(1) as u32,
                part: p["part"].as_str().unwrap_or("").to_string(),
                duration: p["duration"].as_u64().unwrap_or(0) as u32,
                width: p["dimension"]["width"].as_u64().unwrap_or(0) as u32,
                height: p["dimension"]["height"].as_u64().unwrap_or(0) as u32,
            });
        }
    }
    if pages.is_empty() {
        pages.push(PageInfo {
            cid: data["cid"].as_i64().unwrap_or(0),
            page: 1,
            part: data["title"].as_str().unwrap_or("").to_string(),
            duration: data["duration"].as_u64().unwrap_or(0) as u32,
            width: data["dimension"]["width"].as_u64().unwrap_or(0) as u32,
            height: data["dimension"]["height"].as_u64().unwrap_or(0) as u32,
        });
    }

    Ok(VideoInfo {
        bvid: data["bvid"].as_str().unwrap_or_default().to_string(),
        aid: data["aid"].as_u64().unwrap_or(0),
        title: data["title"].as_str().unwrap_or_default().to_string(),
        cover: data["pic"]
            .as_str()
            .unwrap_or_default()
            .replace("http://", "https://"),
        desc: data["desc"].as_str().unwrap_or_default().to_string(),
        duration: data["duration"].as_u64().unwrap_or(0) as u32,
        pubdate: data["pubdate"].as_u64().unwrap_or(0),
        owner_name: data["owner"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        owner_face: data["owner"]["face"]
            .as_str()
            .unwrap_or_default()
            .replace("http://", "https://"),
        views: data["stat"]["view"].as_u64().unwrap_or(0),
        danmaku: data["stat"]["danmaku"].as_u64().unwrap_or(0),
        likes: data["stat"]["like"].as_u64().unwrap_or(0),
        is_multi: pages.len() > 1,
        chargeable: data["rights"]["pay"].as_i64().unwrap_or(0) == 1
            || data["is_upower_exclusive"].as_bool().unwrap_or(false),
        pages,
    })
}

/* ------------------------------------------------------------------ */
/* DASH playurl                                                       */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone)]
pub struct DashVideo {
    pub id: u32,
    pub base_url: String,
    pub backup_url: Vec<String>,
    pub bandwidth: u64,
    pub codecs: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: String,
}

#[derive(Debug, Clone)]
pub struct DashAudio {
    pub id: i64,
    pub base_url: String,
    pub backup_url: Vec<String>,
    pub bandwidth: u64,
    pub codecs: String,
}

#[derive(Debug, Clone)]
pub struct DashData {
    pub duration: u32,
    pub videos: Vec<DashVideo>,
    pub audios: Vec<DashAudio>,
    pub is_drm: bool,
    pub quality_hints: HashMap<u32, String>,
}

fn parse_url_list(item: &Value) -> (String, Vec<String>) {
    let base = item["baseUrl"]
        .as_str()
        .or_else(|| item["base_url"].as_str())
        .unwrap_or_default()
        .replace("http://", "https://");
    let mut backup = Vec::new();
    if let Some(list) = item["backupUrl"]
        .as_array()
        .or_else(|| item["backup_url"].as_array())
    {
        for u in list {
            if let Some(s) = u.as_str() {
                backup.push(s.replace("http://", "https://"));
            }
        }
    }
    (base, backup)
}

fn parse_dash(data: &Value) -> DashData {
    let mut videos = Vec::new();
    let mut audios = Vec::new();
    let mut quality_hints = HashMap::new();

    if let Some(formats) = data["support_formats"].as_array() {
        for f in formats {
            let q = f["quality"].as_u64().unwrap_or(0) as u32;
            let desc = f["new_description"]
                .as_str()
                .or_else(|| f["display_desc"].as_str())
                .unwrap_or_default();
            if q > 0 && !desc.is_empty() {
                quality_hints.insert(q, desc.to_string());
            }
        }
    }

    if let Some(list) = data["dash"]["video"].as_array() {
        for item in list {
            let (base_url, backup_url) = parse_url_list(item);
            if base_url.is_empty() {
                continue;
            }
            videos.push(DashVideo {
                id: item["id"].as_u64().unwrap_or(0) as u32,
                base_url,
                backup_url,
                bandwidth: item["bandwidth"].as_u64().unwrap_or(0),
                codecs: item["codecs"].as_str().unwrap_or_default().to_string(),
                width: item["width"].as_u64().unwrap_or(0) as u32,
                height: item["height"].as_u64().unwrap_or(0) as u32,
                frame_rate: item["frameRate"]
                    .as_str()
                    .map(|s| s.to_string())
                    .or_else(|| item["frame_rate"].as_str().map(|s| s.to_string()))
                    .unwrap_or_default(),
            });
        }
    }

    if let Some(list) = data["dash"]["audio"].as_array() {
        for item in list {
            let (base_url, backup_url) = parse_url_list(item);
            if base_url.is_empty() {
                continue;
            }
            audios.push(DashAudio {
                id: item["id"].as_i64().unwrap_or(0),
                base_url,
                backup_url,
                bandwidth: item["bandwidth"].as_u64().unwrap_or(0),
                codecs: item["codecs"].as_str().unwrap_or_default().to_string(),
            });
        }
    }

    // Dolby / Hi-Res tracks are separate fields.
    for key in ["flac", "dolby"] {
        let node = &data["dash"][key];
        if node.is_null() {
            continue;
        }
        let candidates = if node["audio"].is_array() {
            node["audio"].as_array().cloned().unwrap_or_default()
        } else {
            vec![node.clone()]
        };
        for item in candidates {
            let (base_url, backup_url) = parse_url_list(&item);
            if base_url.is_empty() {
                continue;
            }
            audios.push(DashAudio {
                id: item["id"].as_i64().unwrap_or(0),
                base_url,
                backup_url,
                bandwidth: item["bandwidth"].as_u64().unwrap_or(0),
                codecs: item["codecs"].as_str().unwrap_or_default().to_string(),
            });
        }
    }

    DashData {
        duration: data["dash"]["duration"].as_u64().unwrap_or(0) as u32,
        videos,
        audios,
        is_drm: data["is_drm"].as_bool().unwrap_or(false),
        quality_hints,
    }
}

pub async fn fetch_dash(
    state: &AppState,
    bvid: &str,
    cid: i64,
    qn: u32,
) -> Result<DashData, String> {
    ensure_fingerprint(state).await.ok();

    for attempt in 0..2 {
        let (img, sub) = wbi_keys(state).await?;
        let query = enc_wbi(
            &[
                ("bvid", bvid.to_string()),
                ("cid", cid.to_string()),
                ("qn", qn.to_string()),
                ("fnval", "4048".to_string()),
                ("fnver", "0".to_string()),
                ("fourk", "1".to_string()),
            ],
            &img,
            &sub,
        );
        let url = format!("https://api.bilibili.com/x/player/wbi/playurl?{query}");
        let v = get_json(state, &url).await?;
        let code = v["code"].as_i64().unwrap_or(0);
        if code == -403 && attempt == 0 {
            invalidate_wbi(state).await;
            continue;
        }
        check_code(&v)?;

        let dash = parse_dash(&v["data"]);
        if dash.is_drm {
            return Err("该视频使用 DRM 加密，暂不支持下载".to_string());
        }
        if v["data"]["dash"].is_null() {
            return Err("该视频没有 DASH 流，请改用单文件 MP4 模式".to_string());
        }
        if dash.videos.is_empty() {
            return Err("没有获取到可用的视频流，可能需要登录或大会员".to_string());
        }
        return Ok(dash);
    }
    Err("获取播放地址失败，请稍后重试".to_string())
}

pub fn qn_label(qn: u32) -> String {
    match qn {
        127 => "8K 超高清".into(),
        126 => "杜比视界".into(),
        125 => "HDR 真彩".into(),
        120 => "4K 超清".into(),
        116 => "1080P 60帧".into(),
        112 => "1080P 高码率".into(),
        80 => "1080P 高清".into(),
        74 => "720P 60帧".into(),
        64 => "720P 高清".into(),
        32 => "480P 清晰".into(),
        16 => "360P 流畅".into(),
        6 => "240P 极速".into(),
        other => format!("{other}"),
    }
}

fn audio_label(id: i64) -> String {
    match id {
        30280 => "192K 高音质".into(),
        30232 => "132K 标准".into(),
        30216 => "64K 流畅".into(),
        30250 | 30251 => "杜比全景声".into(),
        30252 => "Hi-Res 无损".into(),
        other => format!("音轨 {other}"),
    }
}

pub fn build_streams(logged_in: bool, dash: &DashData, mp4: Option<Mp4Payload>) -> StreamsPayload {
    let mut grouped: HashMap<u32, Vec<&DashVideo>> = HashMap::new();
    for v in &dash.videos {
        grouped.entry(v.id).or_default().push(v);
    }

    let mut qualities: Vec<QualityOption> = grouped
        .into_iter()
        .map(|(id, items)| {
            let max = items.iter().max_by_key(|v| v.bandwidth).copied().unwrap();
            let mut codecs: Vec<String> = Vec::new();
            for item in &items {
                let name = item.codecs.split('.').next().unwrap_or("").to_string();
                if !name.is_empty() && !codecs.contains(&name) {
                    codecs.push(name);
                }
            }
            let label = dash
                .quality_hints
                .get(&id)
                .cloned()
                .unwrap_or_else(|| qn_label(id));
            let bandwidth = max.bandwidth;
            let fps = if max.frame_rate.is_empty() {
                String::new()
            } else {
                format!(" · {}fps", max.frame_rate)
            };
            QualityOption {
                id,
                label,
                detail: format!(
                    "{}×{}{} · {:.1} Mbps",
                    max.width,
                    max.height,
                    fps,
                    bandwidth as f64 / 1_000_000.0
                ),
                codecs,
                width: max.width,
                height: max.height,
                bandwidth,
                frame_rate: max.frame_rate.clone(),
            }
        })
        .collect();
    qualities.sort_by(|a, b| b.id.cmp(&a.id));

    let mut audios: Vec<AudioOption> = dash
        .audios
        .iter()
        .map(|a| AudioOption {
            id: a.id,
            label: audio_label(a.id),
            codecs: a.codecs.clone(),
            bandwidth: a.bandwidth,
        })
        .collect();
    audios.sort_by(|a, b| b.bandwidth.cmp(&a.bandwidth));
    let mut seen = std::collections::HashSet::new();
    audios.retain(|a| seen.insert(a.id));

    let max_real = qualities.first().map(|q| q.id).unwrap_or(0);
    let note = if max_real > 0 && max_real < 80 && !logged_in {
        Some("未登录时 DASH 画质最高 480P，可登录账号解锁 1080P".to_string())
    } else {
        None
    };

    StreamsPayload {
        logged_in,
        duration: dash.duration,
        qualities,
        audios,
        mp4,
        is_drm: dash.is_drm,
        note,
    }
}

/* ------------------------------------------------------------------ */
/* single-file MP4 (no merge)                                          */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone)]
pub struct Mp4Part {
    pub url: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct Mp4Data {
    pub quality: u32,
    pub parts: Vec<Mp4Part>,
}

pub async fn fetch_mp4(state: &AppState, bvid: &str, cid: i64, qn: u32) -> Result<Mp4Data, String> {
    ensure_fingerprint(state).await.ok();
    let url = format!(
        "https://api.bilibili.com/x/player/playurl?bvid={}&cid={}&qn={}&platform=html5&high_quality=1&fnval=1&fnver=0&fourk=1",
        urlencoding::encode(bvid),
        cid,
        qn
    );
    let v = get_json(state, &url).await?;
    check_code(&v)?;

    let mut parts = Vec::new();
    if let Some(list) = v["data"]["durl"].as_array() {
        for item in list {
            if let Some(u) = item["url"].as_str() {
                parts.push(Mp4Part {
                    url: u.replace("http://", "https://"),
                    size: item["size"].as_u64().unwrap_or(0),
                });
            }
        }
    }
    if parts.is_empty() {
        return Err("该视频没有单文件 MP4 流".to_string());
    }

    Ok(Mp4Data {
        quality: v["data"]["quality"].as_u64().unwrap_or(64) as u32,
        parts,
    })
}

pub fn pick_dash(
    dash: &DashData,
    qn: u32,
    codec: &str,
    audio_id: Option<i64>,
) -> Result<(DashVideo, DashAudio), String> {
    let target_qn = if dash.videos.iter().any(|v| v.id == qn) {
        qn
    } else {
        dash.videos.iter().map(|v| v.id).max().unwrap_or(0)
    };

    let same: Vec<&DashVideo> = dash.videos.iter().filter(|v| v.id == target_qn).collect();
    let video = same
        .iter()
        .find(|v| v.codecs.starts_with(codec))
        .or_else(|| same.iter().find(|v| v.codecs.starts_with("avc1")))
        .or_else(|| same.first())
        .map(|v| (*v).clone())
        .ok_or_else(|| "没有可用的视频流".to_string())?;

    let audio = audio_id
        .and_then(|id| dash.audios.iter().find(|a| a.id == id))
        .or_else(|| dash.audios.iter().max_by_key(|a| a.bandwidth))
        .cloned()
        .ok_or_else(|| "没有可用的音频流".to_string())?;

    Ok((video, audio))
}

/* ------------------------------------------------------------------ */
/* login / QR                                                         */
/* ------------------------------------------------------------------ */

pub async fn nav_user(state: &AppState) -> Result<UserInfo, String> {
    ensure_fingerprint(state).await.ok();
    let v = get_json(state, "https://api.bilibili.com/x/web-interface/nav").await?;

    // Refresh the WBI keys whenever nav succeeds, they arrive in the same payload.
    let img = file_stem_from_url(v["data"]["wbi_img"]["img_url"].as_str().unwrap_or_default());
    let sub = file_stem_from_url(v["data"]["wbi_img"]["sub_url"].as_str().unwrap_or_default());
    if !img.is_empty() && !sub.is_empty() {
        *state.wbi.lock().unwrap() = Some(WbiKeys {
            img,
            sub,
            at: Instant::now(),
        });
    }

    if v["code"].as_i64() != Some(0) || !v["data"]["isLogin"].as_bool().unwrap_or(false) {
        return Ok(UserInfo::default());
    }

    let data = &v["data"];
    Ok(UserInfo {
        is_login: true,
        mid: data["mid"].as_u64().unwrap_or(0),
        uname: data["uname"].as_str().unwrap_or_default().to_string(),
        face: data["face"].as_str().unwrap_or_default().to_string(),
        vip: data["vip"]["status"].as_i64().unwrap_or(0) == 1,
        vip_label: data["vip"]["label"]["text"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        level: data["level_info"]["current_level"].as_u64().unwrap_or(0) as u32,
    })
}

pub async fn qr_generate(state: &AppState) -> Result<QrLogin, String> {
    ensure_fingerprint(state).await.ok();
    let v = get_json(
        state,
        "https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header",
    )
    .await?;
    check_code(&v)?;
    let url = v["data"]["url"].as_str().unwrap_or_default().to_string();
    let key = v["data"]["qrcode_key"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    if url.is_empty() || key.is_empty() {
        return Err("生成登录二维码失败".to_string());
    }
    Ok(QrLogin { url, key })
}

pub async fn qr_poll(state: &AppState, key: &str) -> Result<QrPollResult, String> {
    let url = format!(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key={}&source=main-fe-header",
        urlencoding::encode(key)
    );
    let v = get_json(state, &url).await?;
    let inner = v["data"]["code"].as_i64().unwrap_or(-1);
    let status = match inner {
        0 => "ok",
        86101 => "waiting",
        86090 => "scanned",
        86038 => "expired",
        _ => "waiting",
    };

    if status != "ok" {
        let message = match status {
            "scanned" => "已扫码，请在手机上确认",
            "expired" => "二维码已失效，请刷新",
            _ => "等待扫码",
        };
        return Ok(QrPollResult {
            status: status.to_string(),
            message: message.to_string(),
            user: None,
        });
    }

    if let Some(login_url) = v["data"]["url"].as_str() {
        if let Ok(parsed) = reqwest::Url::parse(login_url) {
            let mut jar = state.cookies.lock().unwrap();
            for (k, val) in parsed.query_pairs() {
                let k = k.to_string();
                if matches!(
                    k.as_str(),
                    "SESSDATA" | "bili_jct" | "DedeUserID" | "DedeUserID__ckMd5" | "sid"
                ) {
                    jar.insert(k, val.to_string());
                }
            }
        }
    }
    if let Some(token) = v["data"]["refresh_token"].as_str() {
        state
            .cookies
            .lock()
            .unwrap()
            .insert("refresh_token".into(), token.to_string());
    }
    save_cookies(state);

    let user = nav_user(state).await?;
    Ok(QrPollResult {
        status: "ok".to_string(),
        message: "登录成功".to_string(),
        user: Some(user),
    })
}

pub fn logout(state: &AppState) {
    {
        let mut jar = state.cookies.lock().unwrap();
        for key in [
            "SESSDATA",
            "bili_jct",
            "DedeUserID",
            "DedeUserID__ckMd5",
            "sid",
            "refresh_token",
        ] {
            jar.remove(key);
        }
    }
    *state.user.lock().unwrap() = None;
    save_cookies(state);
}
