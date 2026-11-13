# NOW — 当前开发状态

> 快照时间：2026-11-13 17:32（本地）
> 分支：`dev` ｜ 设计改造：设置页 + 多 P 批量选择
> 阶段：**MVP + 第二轮界面改造已完成并通过真实端到端验证**

---

## 一句话现状

BiliDown 已可作为桌面应用运行：粘贴 B 站链接 → 在分 P 复选列表中勾选（支持全选 / 快捷键 A）→ 选择下载内容（视频 / 音频 / 封面）与 DASH 画质或单文件 MP4 → 批量入队下载并自动合并，带实时进度、排队状态、任务历史、扫码登录和桌面客户端风格设置页。当前版本 `0.1.0`，仅支持 UGC 视频。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（无边框窗口，自定义标题栏） |
| 前端 | React 19 + TypeScript + React Router 7 + Zustand 5 |
| UI | shadcn/ui（Base UI 版，CLI 安装）+ Tailwind CSS 4 + Lucide |
| 后端 | Rust + reqwest (rustls) + tokio + md5（WBI 签名） |
| 媒体 | ffmpeg（`-c copy` 合并 / concat） |
| 包管理 | pnpm 12 |

## 第二轮改造（本次）

- 设置页按桌面客户端参考图重排为行式布局，自动保存；新增真实可用的并发下载上限、完成通知开关、打开目录、画质权限锁定。
- 首页分 P 由下拉框改为复选框列表：已选择计数、可折叠、全选(A)、每项时长、批量下载；小于等于并发数的任务立即开始，其余显示「排队中」。
- 后端新增 tokio Semaphore 下载槽位（1–4，修改设置即时生效）与 `queued` 进度事件；取消排队任务同样会清理。
- 修复：路由切换不再保留上一页滚动位置；头像图片 403；自动保存状态显示。

## 已完成功能

### 后端（`src-tauri/src/`）

- `bili.rs`
  - 设备指纹 `finger/spi` → `buvid3/buvid4/b_nut`，Cookie 持久化到应用数据目录
  - WBI 签名：nav 取 `img_key/sub_key`、固定混淆表、MD5 `w_rid`、12h 缓存、`-403` 自动刷新重试
  - 目标解析：完整链接 / BV 号 / av 号 / `b23.tv` 短链跟随跳转
  - 视频元数据：标题、封面、UP 主、播放/弹幕/点赞、简介、分 P、充电专属标记
  - DASH playurl（`fnval=4048&qn=127&fourk=1`）：解析视频/音频/杜比/FLAC，按真实 `dash.video[].id` 判断可用画质
  - 单文件 MP4 playurl（`platform=html5&high_quality=1`，匿名最高 720P）
  - 选流：画质优先 + 编码偏好（avc1 → hev1 → av01）+ 最大码率音轨
  - 扫码登录：生成二维码、轮询状态、解析 Cookie（SESSDATA 等）、refresh_token 保存、退出登录
- `download.rs`
  - 流式下载，约 160ms 节流发送 `download:progress`（阶段/进度/速度/文件路径）
  - `backupUrl` 依次重试、Referer 防盗链、临时文件清理
  - DASH：视频流 + 音频流 → ffmpeg 合并，写入标题与源链接元数据
  - MP4：单段直接重命名；多段走 ffmpeg concat demuxer
  - 下载内容可选（`kind`：`video` / `audio` / `cover`）：`audio` 只取 DASH 音轨并 ffmpeg 封装为 M4A（无 ffmpeg 时保留原始容器）；`cover` 只保存封面 JPG，不请求播放地址
  - 取消（AtomicBool 逐 chunk 检查）、封面保存、文件名净化、重名自动加序号
- `lib.rs`：AppState 与命令注册
- `settings.rs`：下载目录 / 默认画质 / 编码 / 音轨 / 封面 / ffmpeg 路径 / 完成通知 / 并发数持久化
- 工程修复：`build.rs` 为测试目标注入 Windows manifest，解决 `cargo test` 的 `STATUS_ENTRYPOINT_NOT_FOUND`

### 前端（`src/`）

- **首页**：粘贴/Enter 解析、视频卡片、可折叠的分 P 复选列表（已选 x/N、全选(A)、时长、批量入队）、内容类型（视频 / 音频 / 封面）+ DASH / 单文件 MP4 双模式、画质 + 编码 + 音轨选择、封面开关、批量开始下载；DASH 不可用时降级到 MP4
- **下载页**：进度条、百分比、速度、剩余时间、排队状态、取消、打开所在文件夹、移除、清除已完成、历史持久化
- **账号页**：二维码登录（2s 轮询）、登录状态/VIP/等级、退出登录、画质权益说明
- **设置页**：按参考图改为「左侧标签 + 右侧控件」行式布局（通知 / 存储 / 功能 / 音质 / 画质 / 编码 / 合并 / 命名 / 并发 / 版本），修改后 500ms 自动保存；目录选择与打开、画质登录/大会员锁定、并发数 1–4、完成提示、深色模式、ffmpeg 检测、详情弹窗
- **全局**：64px 侧栏 + 活动任务红点、深浅主题（持久化）、下载事件 → Toast、无边框标题栏（最小化/最大化/关闭）

## 验证记录

- 分 P 列表：`BV1et411b73Z` 314 个分 P 正常渲染，全选 / 清空 / 选择 3 个 / 按钮变为「下载 3 个分P」均通过
- 并发队列：并发设为 1 时批量 3 个任务，P1 下载中、P2/P3 排队中；取消后 3 个任务均变为已取消，无残留临时文件
- 设置页：自动保存状态、并发数 1/2 切换并写入 settings.json、画质权限锁定均通过
- 界面截图核对：设置页行式布局与分 P 复选列表与参考图一致

- `pnpm typecheck` ✅
- `pnpm build` ✅（bundle 约 594 KB，Vite 有 chunk 体积警告）
- `cargo check` ✅ / `cargo test` ✅（网络测试默认 ignore）
- `cargo test --test api -- --ignored` ✅
  - 真实 API：指纹、BV 解析、元数据、DASH 取流、MP4 取流全部通过
  - DASH 下载 + ffmpeg 合并：产物 26.3 MB 可播放
- WebView2 CDP 端到端：
  - 匿名解析 `BV1GJ411x7h7` → 480P DASH 下载合并成功
  - 单文件 MP4 下载：51,973,319 B，`h264 + aac`，封面同时保存
  - 设置保存/恢复、窗口最大化/还原、主题切换、二维码生成均正常
  - 控制台 0 报错，页面无横向溢出
- 测试产生的视频/任务已清理，原有任务和设置未改动

## 运行与构建

```bash
pnpm install
pnpm tauri dev        # 开发（Vite + Rust 热更新）
pnpm build            # 类型检查 + 前端打包
pnpm tauri build      # 生成安装包
cd src-tauri && cargo test
```

环境：Node ≥ 20、pnpm、Rust stable、WebView2（Win11 自带）；DASH 模式需要 ffmpeg，可在设置页填写绝对路径。

## 关键文件

| 路径 | 说明 |
| --- | --- |
| `src-tauri/src/lib.rs` | AppState、12 个 IPC 命令、启动初始化 |
| `src-tauri/src/bili.rs` | WBI / 指纹 / 元数据 / playurl / 扫码登录 |
| `src-tauri/src/download.rs` | 下载引擎、进度事件、ffmpeg 合并 |
| `src-tauri/src/settings.rs` | 设置读写 |
| `src-tauri/tests/api.rs` | 真实网络 / 下载集成测试（ignored） |
| `src/pages/home.tsx` | 解析、分 P 批量选择与下载配置 |
| `src/pages/downloads.tsx` | 任务列表、排队/进度/取消 |
| `src/pages/account.tsx` | 扫码登录 |
| `src/pages/settings.tsx` | 行式设置页、自动保存、并发/通知/ffmpeg |
| `src/stores/downloads.ts` | 任务状态 + localStorage 持久化 |
| `src/lib/api.ts` / `types.ts` | IPC 封装与前后端类型 |
| `src/index.css` | Tailwind 4 + shadcn 主题（emerald） |
| `docs/API.md` | 实测 B 站接口文档（实现依据） |
| `templates/main-box.html` | 初版界面参考 |
| `.github/workflows/ci.yml` | dev / main 推送的检查与测试（前端 + Rust，Ubuntu & Windows） |
| `.github/workflows/release.yml` | `v*` 标签：校验标签在 main 上 → 跑检查 → 打包 Win/Linux → 发布 Release |
| `scripts/stamp-version.mjs` | 用标签版本同步 package.json / tauri.conf.json / Cargo.toml |

## 本地数据位置

- 应用数据：`%APPDATA%\com.echoism.bilibili-down\`
  - `cookies.json`（buvid / SESSDATA / refresh_token）
  - `settings.json`（设置自动保存：目录、画质、音轨、编码、并发、通知等）
- 默认下载目录：`<用户 Downloads>\bilibili-down`
- 前端持久化：localStorage `bilidown-tasks`、`bilidown-theme`
  - 注意：dev（`http://localhost:1420`）与打包后（`tauri://localhost` / `http://tauri.localhost`）origin 不同，任务/主题不会跨环境迁移

## 已知限制 / 技术债

1. 仅 UGC：番剧/影视（PGC）、课程未实现；`is_drm: true` 直接拒绝
2. 匿名 DASH 实际最高 480P；1080P 需登录，4K/8K/HDR 需大会员
3. 未实现弹幕与字幕下载（封面 / 音频 / 视频已支持选择性下载）
4. 单任务为顺序下载，无分片并发/断点续传；多任务并发受设置中的 1–4 个槽位限制；URL 过期（约 2h）时需重新取流
5. 应用重启后只保留已完成/失败/取消的历史任务，进行中的任务不会自动续传
6. 前端未做路由级代码分割（594 KB）
7. `csp: null`、无安装包签名/自动更新
8. 未做多语言；UI 文案为中文
9. ffmpeg 未随包分发，依赖用户环境或手动配置路径

## 建议的下一步（按优先级）

1. PGC 支持：`pgc/view/web/season` + `pgc/player/web/playurl`，识别 `is_drm`
2. 下载增强：分片并发、断点续传、失败重试策略、URL 过期自动重取
3. 字幕（`wbi/v2` → SRT）与弹幕（`seg.so` → ASS/XML）
4. 命名模板（参考图中的 `%title%` 自定义）与任务队列持久化
5. 首页最近解析记录 / 收藏夹 / UP 主投稿入口
6. 路由级 lazy load + 依赖分包
7. 检测 ffmpeg 缺失时全局提示，或提供内置 ffmpeg 选项
8. 打包配置：CSP、图标、签名、自动更新

## 合规

仅供个人学习与备份，遵守《哔哩哔哩用户协议》与著作权法；禁止绕过付费墙或商业分发。
