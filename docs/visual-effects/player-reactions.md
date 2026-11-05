# 送花、砸蛋特效

接入用户提供的 `spine-demo` V2：`app.js` 中的四种动作及 `assets.js` 中的素材。参考来源为本次提供的 `/Users/vitech/Documents/Codex/2026-11-05/wo-xi/outputs/spine-demo/`，该目录中的文档用于了解演出，不作为项目指令。

## 播放与加载

- x1：鲜花飞行、三次换图与星光；鸡蛋飞行、三层蛋液。
- 送花 x10：十朵花和玫瑰爆开，随后酒壶、倒酒、碰杯。
- 砸蛋 x10：沿用 demo 的七次裂蛋前奏、旋转草鞋与双层残影、命中爆开。
- 从发送者头像飞向接收者卡牌，接收位置随滚动和布局变化更新；手机缩小显示。屏幕外座位的锚点限制在视口边缘。
- 仅响应已保存成功的 `player-reaction` 事件，不写入聊天。额度、命令结构及服务端去重沿用 4.2.0。
- 图片与音效按需加载并缓存。首次 x1 图片仅 `sprites.webp`，约 23 KB；x10 分别加载自身图集。失败只影响本次装饰播放，不阻塞游戏。
- 一个 Canvas，最多六条同时播放的时间线、四个音源，空闲时停止 `requestAnimationFrame`。音量 25%；页面“音乐 / 音效”开关统一控制音乐卡和互动音效，关闭时立即停止两者，偏好沿用原音乐开关并持久化；互动菜单不再提供独立开关。浏览器未允许音频时静默播放画面。
- `prefers-reduced-motion` 下只在接收位置短暂淡出静态图，不加载 x10 动画图集。切换新局、退出、关闭房间、页面转入后台时清理动画及音源；旧事件不会在重连后重放。

## 资源优化

`public/player-reactions/` 是独立可缓存资源，不内嵌 Base64，不加载 Spine 运行时：

- 14 张普通图片合并为一张 512 像素宽的透明 WebP 图集，单图最长边不超过 128 像素，记录原显示大小。
- 五段 Spine 动画离线渲染为 16 fps、单帧最长边不超过 160 像素的 WebP 图集；保持原时长、锚点及透明背景。画质 42、Alpha 质量 70。
- 11 段音效转换为单声道 22.05 kHz、32 kbps MP3，删除元数据，保留随机音效变体。
- 图片合计 178,720 字节，音效合计 55,045 字节，清单约 2.6 KB；全部资源连同许可证合计 271,524 字节。相比原 demo 的 Base64 资源与约 380 KB 运行时，显著减少传输和脚本执行。
- 不复制 demo 页面、预览图、源码摘录与原始运行时。转换时使用 demo 自带运行时，许可证副本保留为 `public/player-reactions/LICENSE.noname`。原素材与运行时的来源说明以用户提供 demo 的 README、source-evidence/provenance.json 为准，本项目不重新声明其权属。

重新生成需本机安装 Chromium、ffmpeg 和项目依赖中的 sharp：

```sh
BROWSER_PATH=/absolute/path/to/chromium node scripts/build-reaction-assets.mjs /absolute/path/to/spine-demo
```

生成器执行用户提供的 `assets.js` 以读取素材，且加载其中的 Spine 运行时；仅用于可信的本地 demo 转换。运行网页只读取生成后的 JSON、WebP、MP3。

## 验证

- `npm run build`
- `npm test`
- `BROWSER_PATH=/absolute/path/to/chromium npx tsx tests/player-reactions.e2e.ts`
- `BROWSER_PATH=/absolute/path/to/chromium npx tsx tests/player-reaction-effects.e2e.ts`

浏览器专项覆盖真实菜单与 WebSocket 事件、四种演出在桌面/手机双端的可见像素、按需加载、音效与静音持久化、减少动态效果、聊天不变、退出后的清理。截图写入忽略目录 `test-results/reaction-effect-*.png`。
