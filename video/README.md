# 宣传视频

[second-brain.mp4](second-brain.mp4) 是第二大脑的 65 秒宣传片：1920×1080、30 帧/秒，有字幕、配乐和音效。分镜见 [STORYBOARD.md](STORYBOARD.md)。

这个视频是用代码做的：每个镜头都是一个"时间 → 画面"的函数，在 Canvas 上画出手绘风格的画面；无头 Chromium 按时间点逐帧截图，FFmpeg 把截图和合成好的音轨拼成 MP4。不用任何图片、音频素材或 API Key。

## 预览

直接用浏览器打开 `video/index.html`，可以播放、拖动进度条、跳到某个镜头，按空格键暂停。渲染过一次之后，预览会带上声音。

## 渲染

需要 Node.js 20+ 和 FFmpeg（`brew install ffmpeg`）。在 kit 目录运行：

```bash
npm install && npx playwright install chromium
```

```bash
node video/render.mjs
```

输出 `video/second-brain.mp4`，大约需要一两分钟。还有两个常用选项：

```bash
node video/render.mjs --stills 3,16.5,37
```

导出这几个时间点（秒）的静帧到 `video/build/stills/`，改画面时用来快速检查。

```bash
node video/render.mjs --audio
```

只生成音轨 `video/build/soundtrack.wav`。

代码里没有读取当前时间的地方，随机数也都有固定种子，所以同一份代码每次渲染的结果完全一样。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 预览播放器；`render.mjs` 加上 `?render` 参数打开它来截图 |
| `render.mjs` | 逐帧截图 → FFmpeg 合成 MP4 |
| `src/engine.js` | 缓动、种子随机数、会"抖动"的手绘线条、文字 |
| `src/characters.js` | 小脑（吉祥物）、手机、电脑、文件夹、气泡和图标 |
| `src/scenes.js` | 8 个镜头，每个镜头登记自己的音效时间点 |
| `src/main.js` | 把镜头串成时间轴，处理转场，提供 `window.VIDEO` |
| `src/soundtrack.mjs` | 按时间点合成配乐和音效，输出 WAV |
| `assets/fonts/` | 霞鹜文楷的子集（只含视频用到的字），[OFL](assets/fonts/OFL.txt) 许可 |
| `tools/subset-fonts.py` | 改了文字之后重新生成字体子集 |

## 怎么改

- **改文字**：在 `src/scenes.js` 里改。如果用了新的汉字，要按 `tools/subset-fonts.py` 开头的说明重新生成字体，否则新字会显示成系统字体。
- **改时长**：每个镜头的 `dur` 是它的秒数，动作和音效的时间都是相对镜头开头的，改一个镜头不影响其他镜头。
- **改配乐**：`src/soundtrack.mjs` 开头是速度和和弦进行。
