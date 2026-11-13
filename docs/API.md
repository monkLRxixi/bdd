# Bilibili 视频下载器 API 文档（实测版）

> 本文档所有接口均于本机实测通过，响应片段直接摘自真实返回（已截断）。
> 抓取/验证脚本见 `probe.mjs`、`probe2.mjs`、`probe3.mjs`，原始响应见 `out/`。
> 可运行 SDK：`src/bili.mjs`；下载示例：`src/download.mjs`。

---

## 0. 实测环境与结论速览

| 项目 | 结论 |
|---|---|
| 测试时间 | 2026-11（UTC+8） |
| 匿名单文件 MP4（html5 模式） | **720P（qn=64）** |
| 匿名 DASH | 实测 `dash.video` 里**只有 480P/360P**，虽然 `data.quality` 显示 64 |
| 登录后（普通账号） | 1080P（qn=80）；1080P+ / 4K / HDR / 8K 需大会员 |
| `data.quality` 可信度 | ⚠️ 会虚报，**必须按 `dash.video[].id` 判断真实可用画质** |
| 匿名获取播放地址 | `x/player/wbi/playurl` 不带签名也能返回，但**结论仍是 720P**；正式实现请签名 |
| 音视频分离 | `fnval` 含 `16`（DASH）时返回 `dash`，视频/音频为独立的 `.m4s`，需自行合并 |
| 单文件 MP4 | `platform=html5&high_quality=1` 可拿到 muxed MP4（≤720P），**无需 ffmpeg** |
| CDN 防盗链 | `*.mcdn.bilivideo.cn` 实测无 Referer 也 206；**`upos-*.bilivideo.com` 无 Referer 返回 403** → 一律带 `Referer: https://www.bilibili.com` |
| 风控 | 短时间高频请求 → `-352 风控校验失败`；继续打 → `-412 request was banned`（IP 级，实测已被临时封 `space/wbi/arc/search`） |
| PGC（番剧） | `pgc/player/web/playurl` 匿名可拿到 480P/360P；部分新番返回 `is_drm: true`（DRM 加密，普通下载器无法解密） |

---

## 1. 通用约定

### 1.1 必需请求头

```http
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
Referer: https://www.bilibili.com/
Origin:  https://www.bilibili.com        # 仅 POST / 需要 CORS 校验的接口
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
Cookie: buvid3=...; buvid4=...; SESSDATA=...; bili_jct=...; DedeUserID=...
```

- 所有 API 域名：`api.bilibili.com`（主）、`passport.bilibili.com`（登录）、`comment.bilibili.com`（旧弹幕）、`i0.hdslb.com`（图片）。
- **不带 User-Agent 会被直接拒绝**（返回 HTML 412 页面，不是 JSON）。
- 下载流媒体：必须带 `Referer`（见 5.1）。

### 1.2 设备指纹 buvid3 / buvid4（强烈建议首步获取）

缺少 `buvid3` 时，`space/*`、`search/*` 等接口极易触发 `-352`。

```http
GET https://api.bilibili.com/x/frontend/finger/spi
```

实测返回：

```json
{"code":0,"data":{
  "b_3":"32CBC01E-0A02-C119-9C23-A04DC6DC07B654610infoc",
  "b_4":"6000016A-7F87-5FA5-68EC-BC9F4F25540254610-026111315-cs2qOE..."
},"message":"ok"}
```

→ `b_3` 作为 `buvid3`，`b_4`（URL 编码）作为 `buvid4` 写入 Cookie；建议再补
`b_nut=<当前秒级时间戳>`、`buvid_fp`（可省略）。

### 1.3 风控与限速（下载器第一优先级）

| 现象 | 含义 | 处理 |
|---|---|---|
| `{"code":-352,"message":"风控校验失败","data":{"v_voucher":"voucher_xxx"}}` | WBI 接口风控 | 停止重试，换 Cookie/加 buvid，降 QPS |
| `{"code":-412,"message":"request was banned"}` 或 HTTP 412 HTML | IP 已被限流 | **至少停 5~30 分钟**，切勿重试 |
| `{"code":-799,"message":"请求过于频繁"}` | 单接口频控 | 指数退避 |

实测安全速率（单 IP、单 Cookie）：

- 元数据类（view / pagelist / playurl）：**≤ 4 请求/秒**，建议 `300~500ms` 间隔；
- 列表类（search / space）：**≤ 1 请求/秒**，建议 `1~2s` 间隔；
- 并发下载：单视频 2~3 个分片并发足够，多任务间建议串行获取 playurl。
- 当 `-352` 出现时，B 站的 `v_voucher` 只能靠页面验证恢复，**自动重试只会加深封禁**。

---

## 2. 认证

### 2.1 WBI 签名（`wbi/*` 系列接口必需）

**步骤 1**：从 nav 接口拿两张“密钥图”文件名（每天 00:00 UTC+8 轮换）：

```http
GET https://api.bilibili.com/x/web-interface/nav
```

```json
{"code":-101,"message":"账号未登录","data":{"isLogin":false,
 "wbi_img":{"img_url":"https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
            "sub_url":"https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png"},
 "ip_region":"CN"}}
```

- `img_key = 7cd084941338484aae1ad9425b84077c`（取文件名去扩展名）
- `sub_key  = 4932caff0ff746eab6f01bf08b70ac45`
- 该接口**未登录也返回 wbi_img**（code 为 -101 属正常，不要当失败）。

**步骤 2**：用固定混淆表重排 `img_key + sub_key`，取前 32 位得 `mixin_key`。

```js
const MIXIN_KEY_ENC_TAB = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35, 27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
  37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4, 22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52,
];
const getMixinKey = (img, sub) =>
  MIXIN_KEY_ENC_TAB.map(i => (img + sub)[i]).join('').slice(0, 32);
```

**步骤 3**：参数加 `wts`（秒级时间戳）→ 按 key 字典序 → 过滤 `!'()*` → URL 编码 → 拼 `mixin_key` 后 MD5 得 `w_rid`。

```js
function encWbi(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey, subKey);
  const wts = Math.round(Date.now() / 1000);
  const p = { ...params, wts };
  const query = Object.keys(p).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))}`)
    .join('&');
  const w_rid = md5(query + mixinKey);   // node: crypto.createHash('md5')
  return `${query}&w_rid=${w_rid}`;
}
// 用法：https://api.bilibili.com/x/player/wbi/playurl?<encWbi({...})>
```

注意：`wts` 与服务器时间偏差 > 约 10 分钟会直接签名失败（`-403`）。

### 2.2 扫码登录（推荐给桌面下载器）

**生成二维码**

```http
GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header
```

```json
{"code":0,"data":{"url":"https://account.bilibili.com/h5/account-h5/auth/scan-web?navhide=1&callback=close&qrcode_key=fbc09e46635a0890072296efb4325641&from=",
 "qrcode_key":"fbc09e46635a0890072296efb4325641"}}
```

- `url` 内容直接生成二维码图片（前端 `qrcode` 库），或打开 `https://api.qrserver.com/v1/create-qr-code/?data=<encodeURIComponent(url)>` 预览。
- 有效期 180 秒。

**轮询状态**（建议 2s 一次，最多 90 次）

```http
GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=fbc09e...&source=main-fe-header
```

| `data.code`（注意在 data 里，不是顶层 code） | 含义 |
|---|---|
| `86101` | 未扫码 |
| `86090` | 已扫码，待确认 |
| `86038` | 二维码已失效，需重新生成 |
| `0` | 登录成功，`data.url` 带 Cookie 参数 |

成功响应形如：

```json
{"code":0,"data":{"url":"https://passport.biligame.com/crossDomain?DedeUserID=123456&DedeUserID__ckMd5=abc...&Expires=1799999999&SESSDATA=xxxx%2C1799999999%2Cyyyy*11&bili_jct=zzzz&gourl=https%3A%2F%2Fwww.bilibili.com",
 "refresh_token":"...","timestamp":1794400000000,"code":0,"message":""}}
```

解析 `data.url` 的 query 即得 `SESSDATA`、`bili_jct`、`DedeUserID`、`DedeUserID__ckMd5`、`sid`。
同时建议保存 `refresh_token`，用以下接口续期（Cookie 有效期约 180 天）：

```http
GET https://passport.bilibili.com/x/passport-login/web/cookie/refresh
    ?csrf=<bili_jct>&refresh_token=<refresh_token>&source=main-fe-header
```

### 2.3 登录态校验

```http
GET https://api.bilibili.com/x/web-interface/nav
```

登录成功时 `code=0`，`data.isLogin=true`，含 `mid`、`uname`、`vip.status`（`1` = 大会员）、`vip.type`、`vip.label.text`。

---

## 3. 视频元数据

### 3.1 视频详情（最核心，含 cid 列表）

```http
GET https://api.bilibili.com/x/web-interface/view?bvid=BV1GJ411x7h7
GET https://api.bilibili.com/x/web-interface/view?aid=80433022
```

支持 `bvid` 或 `aid` 二选一。实测关键字段：

```json
{"code":0,"message":"OK","ttl":1,"data":{
  "bvid":"BV1GJ411x7h7","aid":80433022,"videos":1,"tid":193,"tname":"",
  "pic":"http://i1.hdslb.com/bfs/archive/5242750857121e05146d5d5b13a47a2a6dd36e98.jpg",
  "title":"【官方 MV】Never Gonna Give You Up - Rick Astley",
  "pubdate":1577835803,"ctime":1577835803,"desc":"-","state":0,"duration":213,
  "rights":{"download":1,"pay":0,"hd5":1,"ugc_pay":0,"is_360":0,"arc_pay":0},
  "owner":{"mid":486906719,"name":"索尼音乐中国","face":"https://i2.hdslb.com/..."},
  "stat":{"view":108452867,"danmaku":151946,"reply":241129,"favorite":1567022,
          "coin":1293931,"share":507197,"like":2977982},
  "cid":137649199,
  "dimension":{"width":1920,"height":1080,"rotate":0},
  "pages":[{"cid":137649199,"page":1,"part":"Never Gonna Give You Up - Rick Astley",
            "duration":213,"dimension":{"width":1920,"height":1080,"rotate":0}}],
  "subtitle":{"allow_submit":false,"list":[...]},
  "is_upower_exclusive":false,"is_chargeable_season":false
}}
```

下载器要点：

- `videos > 1` 表示多 P，遍历 `pages[]`，每项有自己的 `cid`；
- 每 P 需要**单独调 playurl**；
- `rights.pay=1` / `is_upower_exclusive=true` → 充电专属，无权限；
- `state != 0` → 稿件不可用（已删/审核中）；
- `stat` 直接内嵌，**`x/web-interface/archive/stat` 已下线（实测 404）**。

### 3.2 分 P 列表（拿 cid 的更轻方式）

```http
GET https://api.bilibili.com/x/player/pagelist?bvid=BV1GJ411x7h7&jsonp=jsonp
```

```json
{"code":0,"data":[{"cid":137649199,"page":1,"from":"vupload",
 "part":"Never Gonna Give You Up - Rick Astley","duration":213,
 "dimension":{"width":1920,"height":1080,"rotate":0},"ctime":1577835803}]}
```

### 3.3 详情增强版（含 UP 主其它稿件、标签、合集）

```http
GET https://api.bilibili.com/x/web-interface/wbi/view/detail?bvid=BV1GJ411x7h7
```

返回 `data.View`（同 3.1）、`data.Related`、`data.Tags`、`data.UgcSeason`（合集）等。

### 3.4 相关推荐 / 实时在线人数

```http
GET https://api.bilibili.com/x/web-interface/archive/related?bvid=BV1GJ411x7h7
GET https://api.bilibili.com/x/player/online/total?bvid=BV1GJ411x7h7&cid=137649199
```

在线人数实测：`{"code":0,"data":{"total":"55","count":"50",...}}`。

---

## 4. 播放地址（下载器的核心）

### 4.1 UGC 视频播放地址

```http
GET https://api.bilibili.com/x/player/wbi/playurl?<WBI 签名后的参数>
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `bvid` / `aid` | 二选一 | 稿件 ID |
| `cid` | ✅ | 分 P ID（来自 `pages[].cid`） |
| `qn` | ✅ | 请求画质，见 4.3 |
| `fnval` | ✅ | 流格式位掩码，见 4.2。`0`=FLV/MP4 老格式，`16`=DASH，`4048`=全部 |
| `fnver` | | 固定 `0` |
| `fourk` | | `1` 允许 4K |
| `platform` | | `pc`（默认）；`html5` 见 4.5 |
| `high_quality` | | `1`，配合 `platform=html5` |

### 4.2 fnval 位掩码

| 位 | 值 | 含义 |
|---|---|---|
| 1 | 1 | MP4（durl 单文件） |
| 16 | 16 | **DASH（音视频分离）** |
| 64 | 64 | HDR |
| 128 | 128 | 4K |
| 256 | 256 | 杜比音频 |
| 512 | 512 | 杜比视界 |
| 1024 | 1024 | 8K |
| 2048 | 2048 | AV1 编码 |

组合：`16|64|128|256|512|1024|2048 = 4048`（全部），`1`（单文件 MP4），`4048` 是下载器首选。

### 4.3 qn 画质对照

| qn | 画质 | 权限 |
|---|---|---|
| 6 | 240P | 匿名 |
| 16 | 360P | 匿名 |
| 32 | 480P | 匿名 |
| 64 | 720P | 匿名（**匿名上限**） |
| 74 | 720P60 | 登录 |
| 80 | 1080P | 登录 |
| 112 | 1080P+ 高码率 | 大会员 |
| 116 | 1080P60 | 大会员 |
| 120 | 4K | 大会员 |
| 125 | HDR | 大会员 |
| 126 | 杜比视界 | 大会员 |
| 127 | 8K | 大会员 |

> 服务端不会报错，只会**静默降级**。但注意：`data.quality` / `accept_quality` 只是“套餐描述”，**不代表真的有对应码流**。
>
> 实测（匿名，qn=127&fnval=4048）：`quality: 64`、`accept_quality: [112,80,64,32,16]`，
> 而 `dash.video[].id` 只有 **32 和 16** —— 即匿名 DASH 实际最高 480P。
> **判断真实画质请用 `Math.max(...dash.video.map(v => v.id))`**，不要信 `data.quality`。

### 4.4 响应结构（DASH）

实测请求 `qn=127&fnval=4048&fourk=1`（匿名）返回：

> 注意：以下 `dash.video` 片段取自另一次实测（`qn=127`），其中只含 `id:32` 的流，与 `quality:64` 不一致，正说明上面的“虚报”问题。

```json
{"code":0,"message":"OK","ttl":1,"data":{
  "from":"local","result":"suee","quality":64,"format":"flv720","timelength":212393,
  "accept_format":"hdflv2,flv,flv720,flv480,mp4",
  "accept_description":["高清 1080P+","高清 1080P","高清 720P","清晰 480P","流畅 360P"],
  "accept_quality":[112,80,64,32,16],
  "video_codecid":7,"seek_param":"start","seek_type":"offset",
  "dash":{
    "duration":213,"minBufferTime":1.5,
    "video":[
      {"id":32,"baseUrl":"https://xy36x156x63x29xy.mcdn.bilivideo.cn:8082/v1/resource/upgcxcode/99/91/137649199/137649199_da2x1-1-100110.m4s?...",
       "backupUrl":["https://...","https://upos-sz-mirrorhwo1.bilivideo.com/..."],
       "bandwidth":601690,"codecs":"avc1.64001F","width":852,"height":480,
       "frameRate":"30","mimeType":"video/mp4","startWithSap":1,"sar":"1:1"}
    ],
    "audio":[
      {"id":30280,"baseUrl":"...","bandwidth":203786,"codecs":"mp4a.40.2","mimeType":"audio/mp4"},
      {"id":30232,"baseUrl":"...","bandwidth":102931,"codecs":"mp4a.40.2"},
      {"id":30216,"baseUrl":"...","bandwidth":43962,"codecs":"mp4a.40.5"}
    ],
    "dolby":{"type":0,"audio":null},
    "flac":null
  },
  "support_formats":[
    {"quality":112,"format":"hdflv2","new_description":"1080P 高码率","display_desc":"1080P",
     "superscript":"高码率","codecs":["av01.0.08M.08.0.110.01.01.01.0","avc1.640032","hev1.1.6.L150.90"],
     "can_watch_qn_reason":0,"limit_watch_reason":0}
  ],
  "high_format":null,
  "last_play_cid":0,
  "play_conf":{"is_new_description":true}
}}
```

要点：

- `dash.video[]` 同一 `id`（画质）会有 **多组编码**：`avc1.*`(H.264)、`hev1.*`(H.265)、`av01.*`(AV1)。选 `avc1` 兼容性最好，选 `av01`/`hev1` 体积更小。实测同一 480P 出现 852x480 的三种编码各一条。
- `dash.audio[]` 的 `id`：`30216`=64K、`30232`=132K、`30280`=192K，**取 bandwidth 最大**（或 30280）。
- `dash.flac` / `dash.dolby.audio` 为无损/杜比音轨，仅大会员且有资源时非 null。
- `durl` 模式（`fnval=1`）返回：`durl:[{order:1,length:213000,size:51973319,url:"...mp4"}]`，**单文件已含音频**，但画质上限 720P、且长视频会被切片成多个 `order`。
- 想拿**匿名 720P**：不要用 DASH（只给 480P），改用 4.5 的 `platform=html5&high_quality=1` 或 `fnval=1`。这是本机实测的稳定差异。

### 4.5 一行搞定的“免 ffmpeg”方案（≤720P）

```http
GET https://api.bilibili.com/x/player/playurl?bvid=BV1GJ411x7h7&cid=137649199&qn=80&platform=html5&high_quality=1
```

实测返回：

```json
{"code":0,"data":{"quality":64,"format":"mp4720",
 "accept_quality":[64,16],
 "durl":[{"order":1,"length":213000,"size":51973319,
          "url":"https://cn-hnzz-cm-01-01.bilivideo.com/upgcxcode/99/91/137649199/137649199_da2-1-192.mp4?e=...&uipk=5&..."}]}}
```

优点：一个 URL 直接是 **H.264 + AAC 的 MP4**，`curl` 存盘即用；缺点：只有 720P，且**没有多 P 音频轨选择**。

### 4.6 PGC（番剧 / 影视 / 课程）

**按 ep 或 season 取信息**

```http
GET https://api.bilibili.com/pgc/view/web/season?season_id=348189
GET https://api.bilibili.com/pgc/view/web/season?ep_id=7515405
```

实测 `data` 含（部分）：

```json
{"code":0,"message":"success","result":{
  "season_id":348189,"media_id":...,"title":"海绵宝宝 第十二季",
  "cover":"https://i0.hdslb.com/bfs/bangumi/image/....png",
  "total":18,"status":...,"payment":{...},"rights":{...},
  "episodes":[{"ep_id":7515405,"bvid":"BV1ED4g6AE2y","cid":...,
               "title":"1","long_title":"...","duration":...,"badge":"..."}],
  "seasons":[...],"up_info":{...}
}}
```

**取播放地址**

```http
GET https://api.bilibili.com/pgc/player/web/playurl?ep_id=7515405&qn=80&fnval=4048&fnver=0&fourk=1
```

- 返回结构与 4.4 类似，但外层是 `result`（不是 `data`），且 `code/quality` 在 `result` 里也有一份。
- 实测匿名：`quality=32`（480P），`is_drm: true` → **该剧集是 DRM 加密流，普通抓流方案无法使用**。判断依据就是 `result.is_drm === true`，遇到直接提示用户不可下载。
- 免费/限免番剧 `is_drm=false` 时可正常下载。
- 影视/课程还可以用 `pgc/player/web/playurl?avid=&cid=&qn=&fnval=` 组合请求，参数与 UGC 一致。

---

## 5. 流下载与合并

### 5.1 下载请求头（实测结论）

```bash
# ✅ 正常
curl -r 0-2047 "$URL" -H "User-Agent: <浏览器UA>" -H "Referer: https://www.bilibili.com"   # 206
# ❌ upos 域名无 Referer
curl -r 0-2047 "$URL" -H "User-Agent: <浏览器UA>"                                          # 403
```

- `mcdn.bilivideo.cn`（P2P/边缘节点）不强制校验 Referer；
- `upos-*.bilivideo.com`（源站）**强制校验** → 统一带 `Referer: https://www.bilibili.com`。
- 支持 `Range`（206），可断点续传 / 分片并发；`durl` 的分片是顺序拼接关系，需按 `order` 顺序下载后 `concat`。
- URL 带 `deadline` 参数（约 2 小时有效），**过期返回 403，需重新调 playurl**。

### 5.2 URL 容灾

1. `baseUrl` 失败 → 依次试 `backupUrl[]`；
2. 慢/失败时做 **host 替换**：把 `https://<任意主机>/upgcxcode/...` 换成 `https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/...`（或 `upos-sz-mirrorali.bilivideo.com`、`upos-hz-mirrorakam.akamaized.net`），**保留 path+query 不变**；
3. `http://` 一律升为 `https://`。

### 5.3 合并（DASH → MP4）

```bash
ffmpeg -y -loglevel warning \
  -i video.m4s -i audio.m4s \
  -c copy -movflags +faststart \
  -metadata title="标题" -metadata comment="原视频: https://www.bilibili.com/video/BVxxx" \
  out.mp4
```

- m4s 即 fMP4，`-c copy` 无损，秒级完成；
- 需要 H.265 时选 `hev1` 并加 `-tag:v hvc1` 提升苹果设备兼容性；
- 无 ffmpeg 时只能走 4.5 的单文件 MP4。

---

## 6. 字幕

**接口**（WBI，返回 cid 级播放器信息，含字幕列表）

```http
GET https://api.bilibili.com/x/player/wbi/v2?<WBI: bvid, cid>
```

```json
{"code":0,"data":{"aid":80433022,"bvid":"BV1GJ411x7h7","cid":137649199,
 "login_mid":0,"is_owner":false,
 "subtitle":{"allow_submit":false,"lan":"","lan_doc":"",
             "subtitles":[{"id":42553898841407491,"lan":"zh-CN","lan_doc":"中文（中国）",
                           "is_lock":true,"subtitle_url":"","type":0,
                           "author":{"mid":371800306,"name":"账号已注销"}}],
             "subtitle_position":null,"font_size_type":0}}}
```

- `subtitle_url` 为空 = 该字幕**被锁定，必须带登录 Cookie（SESSDATA）**才能取到真实地址；
- 非空时形如 `//i0.hdslb.com/bfs/subtitle/xxx.json`，请求需带 `Referer`，返回：

```json
{"body":[{"from":0.6,"to":2.1,"location":2,"content":"字幕文本"}],
 "font_size":0.4,"font_color":"#FFFFFF","background_alpha":0.5,"Stroke":"none"}
```

→ 转 SRT：

```js
const toSrt = b => b.map((l, i) =>
  `${i + 1}\n${ts(l.from)} --> ${ts(l.to)}\n${l.content}\n`).join('\n');
const ts = s => new Date(s * 1000).toISOString().substr(11, 12).replace('.', ',');
```

另外 `view` 接口的 `data.subtitle.list[]` 也能拿到 `id/lan/lan_doc`，但同样需要 Cookie 才能换真实 URL（经 `/x/player/v2` 或 `wbi/v2`）。

---

## 7. 弹幕

### 7.1 全量 XML（轻量，推荐用于 ≤ 6 分钟视频 / 旧接口）

```http
GET https://comment.bilibili.com/{cid}.xml
```

实测（`cid=137649199`）返回 `text/xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?><i>
<chatserver>chat.bilibili.com</chatserver><chatid>137649199</chatid>
<maxlimit>1000</maxlimit><state>0</state><real_name>0</real_name>
<d p="0.60100,4,25,15138834,1604742895,0,9e5adeaa,40685126698926083,10">我是一万个点赞，正在反复横跳</d>
<d p="9.41600,5,25,16755202,1611378869,0,14f71d3,44164288244350983,10">J O J O 飙 马 野 郎 提 前 观 看</d>
</i>
```

`p` 属性（9 段，逗号分隔）：

| # | 含义 | 示例 |
|---|---|---|
| 0 | 出现时间（秒，浮点） | `0.60100` |
| 1 | 模式：1/2/3 滚动，4 底部，5 顶部，6 逆向，7 高级，8 代码，9 BAS | `4` |
| 2 | 字号 | `25` |
| 3 | 颜色（十进制 RGB） | `15138834` = `#E7000D`... 需转 hex |
| 4 | 发送时间戳（秒） | `1604742895` |
| 5 | 弹幕池：0 普通 / 1 字幕 / 2 特殊 | `0` |
| 6 | 发送者 mid 的 CRC32 哈希 | `9e5adeaa` |
| 7 | 弹幕在池中 ID（rowID） | `40685126698926083` |
| 8 | 权重（0~10，越高越靠前） | `10` |

> 注意：该接口**返回条数上限 1000**（`<maxlimit>`），长视频会截断。完整弹幕用 7.2。

### 7.2 分段 Protobuf（完整弹幕）

```http
GET https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid={cid}&pid={aid}&segment_index=1
```

- `Content-Type: application/octet-stream`，实测 1 段约 160KB；
- **每段 6 分钟**，`segment_index` 从 1 开始，段数 = `ceil(duration / 360)`；
- 段数也可由 `GET https://api.bilibili.com/x/v2/dm/web/view?type=1&oid={cid}&pid={aid}`（返回 protobuf，含 `dm_seg.dm_sge` 时间轴）获得，或直接用 `view` 的 `duration` 算。
- 解码用 `DmSegMobileReply`，proto 定义见 `dm.proto`：

```proto
message DmSegMobileReply { repeated DanmakuElem elems = 1; }
message DanmakuElem {
  int64  id        = 1;
  int32  progress  = 2;   // 出现时间，毫秒
  int32  mode      = 3;   // 1/2/3 滚动, 4 底部, 5 顶部, 6 逆向, 7 高级, 8 代码, 9 BAS
  int32  fontsize  = 4;
  uint32 color     = 5;   // 十进制 RGB
  string midHash   = 6;
  string content   = 7;
  int64  ctime     = 8;
  int32  weight    = 9;
  string action    = 10;  // 高级弹幕 JSON
  int32  pool      = 11;
  string idStr     = 12;
  int32  attr      = 13;
  ...
}
```

转 ASS/XML 时把 `progress / 1000` 作为秒。

---

## 8. 其它常用接口

| 功能 | 接口 | 备注 |
|---|---|---|
| 搜索 | `GET /x/web-interface/wbi/search/type?search_type=video&keyword=k&page=1&page_size=20` | **WBI 必需**；`numResults` 上限 1000 |
| 搜索建议 | `GET /x/web-interface/search/suggest?term=k` | |
| UP 主信息 | `GET /x/space/wbi/acc/info?<WBI: mid, platform=web, web_location=1550101>` | 实测带 buvid 可通 |
| UP 主投稿 | `GET /x/space/wbi/arc/search?<WBI: mid,pn,ps,order=pubdate>` | ⚠️ 实测已被 `-412` 封，**必须低速 + buvid + dm_img_* 参数** |
| UP 合集/系列 | `GET /x/polymer/web-space/seasons_series_list?<WBI: mid,page_num,page_size>` | 实测可用，含 `seasons_list[].archives[]` |
| 收藏夹列表 | `GET /x/v3/fav/folder/created/list-all?up_mid={mid}` | 匿名返回 `data:null`，需登录 |
| 收藏夹内容 | `GET /x/v3/fav/resource/list?media_id={id}&pn=1&ps=20&platform=web` | |
| 热门 | `GET /x/web-interface/popular?pn=1&ps=20` | |
| 排行榜 | `GET /x/web-interface/ranking/v2?rid=0&type=all` | `rid` 分区号 |
| 番剧时间表 | `GET /pgc/web/timeline?types=1&before=2&after=2` | 返回 `result[].episodes[].season_id` |
| AI 视频总结 | `GET /x/web-interface/view/conclusion/get?bvid=&cid=&up_mid=` | **WBI + 登录**，实测匿名 `-403 访问权限不足` |
| 视频快照/热评 | `GET /x/web-interface/view/detail`、`/x/v2/reply?type=1&oid={aid}` | |

`space/wbi/arc/search` 的风控参数（缺一不可，否则 `-352`）：

```js
{
  dm_img_list: '[]',
  dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ',          // 'WebGL 1.0 (OpenGL ES 2.0 Chromium)' 的 base64（去掉尾部 =）
  dm_cover_img_str: 'QU5HTEUgKE5WSURJQSw...',                              // GPU 信息 base64
  dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
}
```

---

## 9. 错误码

| code | message | 含义 / 处理 |
|---|---|---|
| `0` | OK / success | 成功 |
| `-101` | 账号未登录 | 需要 Cookie；nav 未登录也会返回此码但带 wbi_img |
| `-400` | 请求错误 | 参数缺失/非法（如缺 cid） |
| `-403` | 访问权限不足 | 无权限（充电专属/大会员/接口需登录） |
| `-404` | 啥都木有 / 不存在 | ID 错误或资源已删 |
| `-412` | request was banned | **IP 被封**，停 5~30 分钟 |
| `-352` | 风控校验失败 | WBI 校验/行为风控，换 Cookie + 降频 |
| `-799` | 请求过于频繁 | 退避重试 |
| `87007` | 充电专属视频 | 不可下载 |
| `87008` | 充电专属，仅预览 | 不可下载 |
| `-10403` | 地区限制 | 需要对应地区 IP |
| `62002` | 稿件不可见 | 私密/审核中 |
| `62004` | 稿件审核中 | |
| `-509` | 超出限制 | 批量接口配额 |

HTTP 层面：`412`（HTML 拦截页）、`403`（流防盗链/URL 过期）、`404`（路径下线）。

---

## 10. 下载器实现建议

### 10.1 推荐流程

```
1. GET finger/spi        → buvid3 / buvid4 写入 Cookie（一次性，本地持久化）
2. GET nav               → wbi img/sub key；若已登录同时确认 vip 状态
3. 解析输入              → BV 号 / av 号 / 短链 b23.tv / 番剧 ep、ss
4. GET view (或 pgc season)  → title, pages[].cid, duration, 权限标志
5. 逐个 cid：GET player/wbi/playurl (fnval=4048, qn=127)
6. 选流：video 按 qn 降序 + codec 优先级 [avc1, hev1, av01]；audio 取最大 bandwidth (30280)
7. 下载：Referer + UA + Range 分片，2~3 并发；失败切 backupUrl → 换 host
8. ffmpeg -c copy 合并，写入元数据与封面
9. 可选：字幕（wbi/v2）、弹幕（seg.so / xml）、封面
```

### 10.2 选流伪代码

```js
function pick(dash, { preferCodec = ['avc1', 'hev1', 'av01'] } = {}) {
  // 最高画质：只认 dash.video 里真实存在的 id，不能信 playurl.data.quality
  const maxQn = Math.max(...dash.video.map(v => v.id));
  const sameQn = dash.video.filter(v => v.id === maxQn);
  const video = preferCodec
    .map(c => sameQn.find(v => v.codecs.startsWith(c)))
    .find(Boolean) || sameQn[0];
  const audio = [...dash.audio].sort((a, b) => b.bandwidth - a.bandwidth)[0];
  return { video, audio };
}
```

### 10.3 工程注意事项

1. **Cookie 与 buvid 一定要持久化**，每次冷启动都重新 `finger/spi` 反而更像机器人。
2. **签名 key 缓存 12 小时**（每天 0 点 UTC+8 换），遇到 `-403` 时强制刷新一次再重试。
3. **不要在批量任务里并发调 playurl**：B 站会按接口维度限流，串行 + 300ms 间隔最稳。
4. **下载流是 CDN 侧限速**，与 API 频控无关，可以 3~5 并发分片；但同一 IP 大量并发仍可能 403，需退避。
5. **URL 有效期 ~2 小时**：长任务要注意重新取流（`deadline` 参数）。
6. `is_drm: true` 的番剧直接判定为不支持，不要尝试解密（违反服务条款且技术不可行）。
7. 多 P 视频文件命名建议：`{title}/P{page} {part}.mp4`。
8. 合规：仅用于个人学习/备份，遵守《bilibili 用户协议》与著作权法；分片下载请勿绕过付费墙。

---

## 附录 A：实测样本一览（`out/` 目录）

| 文件 | 接口 | 结果 |
|---|---|---|
| `view.txt` | `/x/web-interface/view` | ✅ 完整元数据 + pages |
| `playurl_wbi_dash.txt` | `/x/player/wbi/playurl` (fnval=4048) | ✅ 720P DASH，3 编码 × 2 分辨率 |
| `playurl_durl.txt` | 同上 fnval=1 | ✅ `durl` 单文件 mp4720 |
| `wbi_v2.txt`→`subtitle_list.txt` | `/x/player/wbi/v2` | ✅ 字幕列表（匿名 `subtitles:[]`） |
| `pgc_season_348189.txt` | `/pgc/view/web/season` | ✅ 18 集，含 ep_id/bvid |
| `pgc_playurl_anon.txt` | `/pgc/player/web/playurl` | ✅ 480P，`is_drm:true` |
| `danmaku_xml.txt` | `comment.bilibili.com/{cid}.xml` | ✅ 1000 条上限 |
| `danmaku_seg.txt` | `/x/v2/dm/web/seg.so` | ✅ protobuf 163,832 B |
| `search_type.txt` / `search_wbi_buvid.txt` | `/x/web-interface/wbi/search/type` | ✅ |
| `space_series.txt` | `/x/polymer/web-space/seasons_series_list` | ✅ |
| `space_arc_search_v2.txt` | `/x/space/wbi/arc/search` | ❌ `-412`（IP 被封，需低速） |
| `view_conclusion.txt` | `/x/web-interface/view/conclusion/get` | ❌ `-403`（需登录） |
| `qrcode_gen.txt` | `/x/passport-login/web/qrcode/generate` | ✅ |
| `nav.txt` | `/x/web-interface/nav` | ⚠️ `-101` 未登录（wbi 正常） |
