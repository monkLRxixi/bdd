# BiliDown

一个基于 **Tauri 2 + React 19 + TypeScript** 的哔哩哔哩视频下载器 MVP。
粘贴链接 → 选择画质 → 下载并自动合并，桌面端即点即用。

> 仅用于个人学习与备份，请遵守《哔哩哔哩用户协议》与著作权法，不要下载无权限或付费内容。

## 功能

- **链接解析**：支持 BV 号、av 号、`b23.tv` 短链、完整视频链接
- **视频信息**：封面、标题、UP 主、播放量、简介、分 P 列表
- **画质选择**：读取 DASH 真实可用码流（不信任 `data.quality` 虚报），可切换 H.264 / H.265 / AV1
- **音轨选择**：192K / 132K / 64K，自动选择最高码率
- **两种下载模式**
  - `DASH 高清`：分别下载视频流与音频流，用 ffmpeg 无损合并为 MP4
  - `单文件 MP4`：`platform=html5&high_quality=1`，无需 ffmpeg（匿名最高 720P）
- **多 P 批量下载**：复选框列出全部分 P，支持全选（快捷键 A）与批量入队，自动建立 `标题/P01 xxx.mp4` 目录结构
- **任务管理**：实时进度 / 速度 / 剩余时间、排队状态、取消、打开文件所在位置、历史任务持久化
- **封面保存**：下载视频时顺带保存同名 JPG
- **扫码登录**：B 站二维码登录，登录态与 buvid 持久化到本机
- **设置**：桌面客户端风格的行式设置页，自动保存；下载目录 / 默认画质 / 音轨 / 编码 / 并发数 / 完成提示 / 深色模式 / ffmpeg 检测
- **界面**：浅色 / 深色主题、无边框窗口 + 自定义标题栏、快捷键友好的 64px 侧边栏

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19、TypeScript、React Router 7、Zustand 5 |
| UI | shadcn/ui（Base UI 版）、Tailwind CSS 4、Lucide 图标 |
| 网络 / 下载 | reqwest（rustls）、tokio、WBI 签名（md5） |
| 合并 | ffmpeg（`-c copy`，可选） |
| 包管理 | pnpm |

## 目录结构

```
src/
  components/
    ui/               # shadcn/ui 组件（通过 CLI 生成）
    title-bar.tsx     # 无边框窗口标题栏
    sidebar.tsx       # 左侧导航
    download-events.tsx # 下载事件 → Zustand / Toast
  pages/
    home.tsx          # 解析 + 下载配置
    downloads.tsx     # 任务列表与进度
    account.tsx       # 扫码登录
    settings.tsx      # 设置
  stores/             # zustand（任务 / 登录 / 设置 / 主题）
  lib/                # IPC API、类型、格式化工具
src-tauri/
  src/
    lib.rs            # Tauri 命令注册与 AppState
    bili.rs           # 设备指纹、WBI 签名、元数据、playurl、扫码登录
    download.rs       # 流下载、进度事件、ffmpeg 合并
    settings.rs       # 本地设置持久化
  tests/api.rs        # 真实 API / 下载集成测试（默认 ignore）
docs/API.md           # 实测 API 文档
templates/main-box.html # 初始界面参考稿
```

## 开发

环境要求：Node.js ≥ 20、pnpm、Rust stable、Windows 需 WebView2（Win11 自带）。
DASH 模式还需要 `ffmpeg` 在 PATH 中，或在设置页填写绝对路径。

```bash
pnpm install
pnpm tauri dev        # 启动桌面应用（Vite + Rust 热更新）
```

只跑前端（浏览器里无法调用 Tauri IPC，仅供样式调试）：

```bash
pnpm dev
```

## 构建

```bash
pnpm build            # 类型检查 + 前端打包
pnpm tauri build      # 生成安装包（src-tauri/target/release/bundle）
```

## 测试

```bash
cd src-tauri
cargo test                                   # 单元测试（无网络）
cargo test --test api -- --ignored --nocapture --test-threads=1
```

第二条命令会访问真实 B 站接口并下载一个约 20MB 的测试视频（含 ffmpeg 合并），
用于验证 WBI 签名、设备指纹、DASH/MP4 取流和下载链路。

## 实现要点

- **所有 B 站请求都在 Rust 侧完成**，绕开 WebView 的 CORS / Referer 限制；
  Cookie 与 buvid 写入应用数据目录，冷启动复用。
- **WBI 签名**：`nav` 获取 `img_key/sub_key`，固定混淆表生成 `mixin_key`，
  参数按字典序拼接后 MD5 得 `w_rid`，密钥缓存 12 小时，`-403` 时自动刷新重试一次。
- **画质判断**：以 `dash.video[].id` 的真实最大值计算可用画质，不用 `data.quality`。
- **CDN 防盗链**：所有流请求带 `Referer: https://www.bilibili.com`；
  主地址失败时依次尝试 `backupUrl`。
- **进度事件**：Rust 每 ~160ms 节流发送 `download:progress`，前端 Zustand 合并更新；
  批量任务通过 tokio Semaphore 限制并发，等待中的任务显示「排队中」。
- **设置自动保存**：设置页采用「标签 + 控件」行式布局，修改 500ms 后自动写入本机。
- **合并**：`ffmpeg -i video.m4s -i audio.m4s -c copy -movflags +faststart`，
  写入标题与原视频链接元数据；mp4 多分段时走 concat demuxer。

## MVP 范围与已知限制

- 仅支持 UGC 视频（BV/av）。番剧 / 影视（PGC）、课程暂未实现。
- 未登录时 DASH 实际最高 480P；登录后 1080P；4K/8K/HDR 需要大会员。
- `is_drm: true` 的番剧无法下载（不做解密）。
- 暂不下载弹幕与字幕；单任务为顺序下载，不做分片并发 / 断点续传（多任务可并发，上限见设置）。
- 短链解析依赖 `b23.tv` 跟随跳转，若被风控可能失败，可直接使用 BV 号。

## 合规

本项目仅为技术学习与个人备份场景提供参考实现，请勿用于商业分发、
绕过付费墙或批量抓取。所有内容版权归原作者及哔哩哔哩所有。
