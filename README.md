# YgoGuess · 游戏王多人猜卡

React / TypeScript / Vite 前端，Node.js / ws 服务端。本地使用文件缓存 + SQLite，生产支持 Redis + MySQL。首版单 Node 实例，同源提供网页、HTTP 和 WebSocket。

## 本地启动

需要 Node.js 24 或更高版本：

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

本机交付已有 .env，无需覆盖。打开 http://127.0.0.1:3131 。局域网其他设备访问 `http://本机局域网IP:3131`；需要处于同一网络并允许该端口入站。浏览器即可游玩，无需客户端安装。

正式运行：

```powershell
npm run build
npm start
```

HOST / PORT 可在 .env 修改，默认 0.0.0.0:3131。开发模式支持热更新，生产模式使用 dist/client 静态文件。Ctrl+C 停止服务。

## 游戏规则

- 输入昵称创建或加入六位房间码。2–8人；所有非房主玩家准备后，房主开始。
- 默认3局、每人每局3次猜测，建房分别可选1–20局、1–10次。
- 好友出题：给座位顺序的下家选卡，末位给首位；全部提交后开始。提交后锁定。
- 随机分配：从精选题库抽取，同局不重复。正式题库按需求保持空白，不使用测试卡代替。
- 只能看见其他参赛者的题目；自己的答案不下发给自己的浏览器。点击卡图可放大并阅读文字。
- 所有阶段均可聊天。轮到自己时，从搜索下拉选定卡牌再猜；无论对错，自动结束回合。主动或强制跳过不扣猜测机会。
- 回合不限时。猜对或机会用完后退出本局轮转，仍可聊天；所有人完成后结算。房主进入下一局，不需重新准备，每局轮换首位行动者。
- 猜对得分为 max(1, round(1000 / 本局个人经历的回合数))，失败0分；主动及强制跳过也计入回合数。多局累计，同分并列。
- 中途加入者先聊天、下局参赛，等待时不接收卡牌答案或图片。
- 刷新、短暂掉线、服务器重启后可恢复身份和局面，需保留浏览器Cookie。掉线不扣次数、不跳回合。检测到房主断开30秒后，转交最靠前的在线玩家；全员离线时保留状态。
- 主动退出/被移除后保留已得积分，未完成本局记0分。有效参赛者不足两人时提前结算。出题阶段参赛者离开会重排下家、清空出题；等待下局者离开不影响当前出题。
- 主动退出者本场不能重入同一房间；房主在结算后“再来一场”会移除历史退出成员并重置积分。

## 精选题库

`config/card-pool.json` 初始为 `[]`，后续填入正式**卡牌密码数字数组**即可。随机模式要求不同有效cid数量至少与参赛人数相同。每次开局重新加载，无需重启。

```powershell
npm run cards:validate
```

好友出题直接使用[百鸽API](https://ygocdb.com/api)，不受精选题库为空影响。搜索支持模糊输入、下拉选择、方向键/Enter、加载更多。服务器缓存卡牌响应，上游故障时可使用7天内的已有缓存，无缓存则提示重试。牌桌用half卡图，搜索用thumb，放大时加载原图；卡图故障仍可查看卡名与文字详情。

## 超级管理员

在 .env 配置 ADMIN_ENTRY_KEY，空值会关闭特殊入口。本机交付已生成随机密钥，仅保存在被Git忽略的 .env 中。

```powershell
npm run admin:url
```

运行后在自己的终端查看入口，或访问：

```text
http://127.0.0.1:3131/admin/entry?key=你的密钥
```

服务端校验后设置HttpOnly / SameSite Cookie并跳转到不含密钥的 /admin。管理员可以查看房间、强制跳过、移除成员、转移房主、解散房间；管理界面不显示任何答案。管理操作服务端鉴权并记录审计。

普通玩家仅使用昵称游客身份；清除Cookie后不能仅凭昵称取回原身份。管理员会话默认有效30天；轮换密钥影响新的入口访问。立即撤销已有会话时，停服后删除数据库中对应管理员会话记录再重启。

## MySQL / Redis 与 Docker

本机没有这两个服务也能使用SQLite版本。切换环境变量：

```dotenv
STORAGE=mysql
CACHE=redis
MYSQL_URL=mysql://ygoguess:password@127.0.0.1:3306/ygoguess
REDIS_URL=redis://127.0.0.1:6379
```

事先创建数据库，使用utf8mb4并授予用户建表权限；应用首次启动自动建表。URL密码中的特殊字符需URL编码。房间、结算和管理员审计在同一事务中提交，成功后广播；Redis只缓存可重建卡牌数据。

Docker Compose 包含应用、MySQL 8.4、Redis 7。在 .env 增加 MYSQL_PASSWORD、MYSQL_ROOT_PASSWORD（可用随机十六进制字符串）：

```powershell
docker compose up --build -d
```

应用暴露3131端口；MySQL和Redis仅内部访问。MySQL数据保存在mysql-data卷。HTTPS反向代理后设置 COOKIE_SECURE=1，代理支持 /ws 的Upgrade与长连接。只在确需其他网页来源时设置逗号分隔的 ALLOWED_ORIGINS。

只运行一个应用副本，不支持多实例分布式房间。SQLite和MySQL视为独立环境，不自动搬迁历史数据。SQLite位于data/ygoguess.sqlite，停服后备份或使用SQLite备份工具；不要只复制正在写入的数据库文件。

## 测试与验收

```powershell
npm test
npm run build
npm run test:e2e
npm run test:production
```

- npm test：规则、隐私、并发幂等、权限、HTTP/WS、SQLite恢复、缓存回退。
- test:e2e：真实百鸽和卡图，独立浏览器完成两局及第三人中途加入，含聊天、键盘选卡、刷新恢复、手机布局、管理员操作。Windows默认使用Edge；可设置BROWSER_PATH。其他系统可先执行 npx playwright install chromium。
- test:production：配置 MYSQL_TEST_URL / REDIS_TEST_URL 后才跑真实服务，否则显示SKIP；请使用独立测试数据库，仅清理测试生成的记录。
- 测试题目和比赛使用隔离临时数据库，不写入正式精选题库。截图和报告在test-results。本次实际结果见docs/VERIFICATION.md。

## 结构与接口

client：界面、WebSocket重连、卡牌搜索。server：规则、鉴权、卡牌代理、缓存和数据库适配。shared/types.ts：服务器状态、按玩家裁剪的公开状态及消息类型。components/ui保留Sites自带组件；config/card-pool.json是正式题库。

HTTP：GET /api/health、GET/POST /api/session、GET /api/cards/search?q=&start=、GET /admin/entry?key=。WebSocket端点/ws；命令携带id、type，猜测和跳过另带turnId，出题另带setupId。服务器发送snapshot、ack、error、admin-rooms。身份来自Cookie，不信任客户端传入的权限。

外部API请求在提交队列外执行，提交时重新验证游戏阶段。数据库失败不改变已广播状态，重复请求不重复扣次数/加分/跳回合。聊天纯文本，最多500字符，保留最近100条，无专门问答流程。
