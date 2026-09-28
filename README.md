# Phigrsaves

**Phigros 云存档修改工具箱** —— 抓取会话令牌、解析新版存档、无损校验、批量改档。

基于 [`phigros-save-manager`](https://github.com/lamadaemon/phigros-save-manager)，包含对新版存档格式（`gameKey v3` / `gameProgress v5` / `summary v7`）的支持与若干修复。

> ⚠️ **免责声明**：修改云存档违反游戏用户协议，存在封号风险。本项目仅供学习与在自己有权限的账号上使用。**操作前务必备份**（工具会自动备份）。

---

## 功能

- 🎯 **全曲全难度 AP**（补齐缺失难度，可选）
- 💰 **改货币**（base-1024 分段数字）
- 🔓 **解锁锁定单曲**（单曲精选集，用 data 购买的那些）
- 🖼 **解锁曲绘 / 头像 / 收集品（小故事）**
- 📦 **无损往返校验**：改档前验证「解析 → 重建」与原文件逐字节一致
- 📡 **抓包工具**：Android 15 装系统证书、SNI 中继、自动提取 `sessionToken`
- 🧯 每次上传前自动备份原始云存档到 `backups/`

---

## 快速开始

### 0. 环境

- Node.js ≥ 18
- 一个 Phigros 账号的 **Session Token**（见下一节）

### 1. 安装依赖 & 构建

```bash
npm install
npm run build
```

### 2. 配置 Token

复制 `.env.example` 为 `.env`，填入抓到的 token：

```ini
PHIGROS_TOKEN=你的X-LC-Session
# 可选：云端多档案时按名字选
# PHIGROS_PROFILE_NAME=
```

### 3. 改档

先看看当前云端存档（验证 token、选对档案）：

```bash
npx ts-node tools/edit.ts get
```

编辑 `tools/edit.ts` 里的 `applyEdits()`，取消/修改你要的项（默认已开启全曲 AP + 解锁单曲/曲绘/收集品），然后：

```bash
npx ts-node tools/edit.ts backup   # 手动备份（可选，apply 也会自动备份）
npx ts-node tools/edit.ts apply    # 自动备份 → 改档 → 上传 → 复核
```

改完后**进游戏「云存档 → 下载」**才能看到效果。

---

## 改档能力对照

`tools/edit.ts` 的 `applyEdits()` 默认包含：

| 项目 | 做法 |
|------|------|
| **全曲全难度 AP** | 已有记录设 `score=1000000 / accuracy=100`；缺失难度补记录并打开 `levelExsistanceFlag` 位 |
| **货币** | `save.gameProgress.money = [KB, MB, GB, TB, PB]`（base-1024，每段 `0..1023`） |
| **锁定单曲** | 往 `gameKey` 补条目（`slot1`），名单见 `tools/locked_singles.json` |
| **曲绘** | 给有 `slot1` 的歌曲补 `slot3` |
| **收集品（小故事）** | 给 `slot0/slot2` 条目补齐 `slot0` |
| **第九章「穹顶孤舟」** | 整条补 `gameKey`（`slot1+slot3`）+ 全 AP 记录 |

### `gameKey` 槽位语义（逆向推断）

| 槽位 | 含义 |
|------|------|
| `slot0` | 收集品 / 小故事「已解锁」 |
| `slot1` | 歌曲「已解锁」 |
| `slot2` | 收集品 / 小故事「获得数量」 |
| `slot3` | 曲绘「已解锁」 |
| `slot4` | 头像「已解锁」 |

> 没有官方文档，这套语义是从对照实验与批量尝试里反推出来的，不排除个别条目偏差。有备份可还原。

---

## 无损校验（强烈建议）

上传前可以先本地校验，避免改坏存档：

```bash
npx ts-node tools/roundtrip.ts <某个存档.zip>
# 逐文件解密对比，输出 ✅ 无损往返 / ❌ 有差异
```

原理：**解析 → 重新序列化必须逐字节一致**，否则说明解析器不支持该存档，别上传。

---

## 抓 Session Token

库不提供登录，需自行抓包。完整流程（含代码）见博客：
**<https://bad0rang3.github.io/posts/phigros-cloud-save-modding/>**

简述：

1. **Android 14/15 装系统 CA**：`tools/android_install_cert.sh`（把 mitmproxy 的 CA bind mount 到所有 mount namespace）。
2. **把游戏流量导入 mitmproxy**：`tools/sni_relay.py`（Windows 不支持 mitmproxy 透明模式，用 SNI 中继）+ `iptables DNAT`。
3. **提取 token**：`tools/capture_token.py` 从 `POST /1.1/users` 的**响应**里取 `sessionToken`，自动写入 `.env`。

```bash
# 启动 mitmproxy（含抓取插件）
mitmdump -s tools/capture_token.py -p 8080
# 再启动 SNI 中继（另一个终端）
python tools/sni_relay.py --listen 8081 --proxy 127.0.0.1:8080
```

> Unity 不走系统代理，所以必须用 DNAT 把直连导入中继；细节和 iptables 规则见博客。

---

## 目录结构

```
Phigrsaves/
├── src/                     # 存档解析/序列化库（含新版格式支持与修复）
├── index.ts                 # 库入口
├── cli.ts                   # 原版 CLI（re8 / allphi / backup / restore ...）
├── tools/
│   ├── edit.ts              # 主力改档脚本（get / backup / apply）
│   ├── roundtrip.ts         # 无损往返校验
│   ├── locked_singles.json  # 需要解锁的单曲名单
│   ├── capture_token.py     # mitmproxy 插件：抓 sessionToken
│   ├── sni_relay.py         # 裸 TLS → CONNECT → mitmproxy 中继
│   ├── android_install_cert.sh
│   └── capture.sh
└── .env.example
```

---

## 常见问题

- **上传后游戏「请检查网络连接」**：多半是存档里有游戏不接受的非法值（例如货币单段超过 1023）。用备份还原。
- **某首歌不显示 AP**：检查是否给它塞了谱面里不存在的难度（例如 3 难度歌补了 AT）。按真实难度数改回去。
- **`selectFirstProfile` 选到别人的档**：云端混着多账号存档，要按「当前登录用户 + 最近更新时间」选（`tools/edit.ts` 已处理）。

---

## 致谢 / 参考

- [phigros-save-manager](https://github.com/lamadaemon/phigros-save-manager)
- [PhigrosLibrary](https://github.com/7aGiven/PhigrosLibrary)（收藏品 / 头像 / 曲绘列表）
- [phi-plugin](https://github.com/Catrong/phi-plugin)（更新的曲库）
