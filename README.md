# Phigrsaves

**Phigros 云存档修改工具箱** —— 拿会话令牌、解析 / 无损校验 / 批量改档，并把游戏资源反编译出完整曲库与收藏品清单，实现「全解锁 + 全曲满分」。

基于 [`phigros-save-manager`](https://github.com/lamadaemon/phigros-save-manager)，包含对新版存档格式（`gameKey v3` / `gameProgress v6` / `summary v7`）的支持、反编译发现的字段语义，以及若干修复。

> ⚠️ **免责声明**：修改云存档违反游戏用户协议，存在封号风险。本项目仅供学习与在自己有权限的账号上使用。**操作前务必备份**（工具会自动备份）。

---

## 功能

- 🔑 **一键拿 Token**：直接从设备读 LeanCloud `sessionToken`，**不用抓包**
- 🎯 **全曲全难度 AP**（按游戏真实难度补记录）
- 💰 **改货币**（base-1024 分段数字）
- 🎨 **课题模式排名**（`rankLevel * 100 + rankNum`，可设「彩色 52」）
- 🔓 **全解锁**：单曲 / 曲绘 / 头像 / **收藏品**
- 📚 **完整清单来自游戏本体**：反编译 `CollectionDatabase` 得到 503 个收藏品；曲库用 phi-plugin `info.csv`
- 📦 **无损往返校验**：改档前验证「解析 → 重建」与原文件逐字节一致
- 🧯 每次上传前自动备份原始云存档到 `backups/`

---

## 快速开始

### 0. 环境

- Node.js ≥ 18
- Python 3.10+（用于辅助脚本；改档本身只需要 Node）
- 一个 Phigros 账号的 **sessionToken**

### 1. 安装依赖 & 构建

```bash
npm install
```

### 2. 拿 Token（推荐：直接从设备读）

Phigros 登录后会把当前 LeanCloud `_User`（**包含明文 `sessionToken`**）保存在：

```
/sdcard/Android/data/com.PigeonGames.Phigros/files/.userdata
```

所以设备只要 root / 能读该文件就行，**完全不用装证书、不用 mitmproxy**：

```bash
ADB="/d/Program Files/Netease/MuMu/nx_main/adb.exe"
"$ADB" connect 127.0.0.1:16384
ADB="$ADB" tools/get_token.sh 127.0.0.1:16384
```

脚本会把 `PHIGROS_TOKEN=...` 写进 `.env`。

<details>
<summary>备选：mitmproxy 抓包（旧方法）</summary>

需要装系统证书 + SNI 中继 + iptables DNAT，见 `tools/android_install_cert.sh`、`tools/sni_relay.py`、`tools/capture_token.py`。适用于无法读到 `.userdata` 的情况。
</details>

### 3. 改档

```bash
npx ts-node tools/inspect.ts <本地存档.save>   # 离线看存档
npx ts-node tools/apply_all.ts plan            # 预演（不上传），生成预览文件
npx ts-node tools/apply_all.ts apply           # 备份 → 改档 → 上传 → 复核
npx ts-node tools/verify.ts <存档.save>        # 校验全解锁 / 全 AP / 课题模式
```

`apply_all.ts` 顶部可配置目标课题模式排名（默认 `彩色 52`）。

改完后**进游戏「云存档 → 下载」**才能看到效果。

---

## 改档能力

`tools/apply_all.ts` 的 `applyEdits()`：

| 项目 | 做法 |
|------|------|
| **全曲全难度 AP** | 已有记录设 `score=1000000 / accuracy=100`；按 `phi_info.csv` 的真实难度补缺失记录 |
| **货币** | `gameProgress.money = [KB, MB, GB, TB, PB]`（base-1024，每段 `0..1023`） |
| **课题模式** | `challengeModeRank = rankLevel*100 + rankNum`，同步云 summary |
| **单曲解锁** | 往 `gameKey` 补 `slot1` |
| **曲绘** | 给有 `slot1` 的歌曲补 `slot3` |
| **头像** | 按 `phi_avatars.txt` 补 `slot4` |
| **收藏品** | 按 `phi_collections.json` 补齐 `slot0/slot2` 到真实进度 |
| **第九章** | 整条补 `gameKey`（`slot1+slot3`）+ 全 AP 记录 |

### `gameKey` 槽位语义（反编译确认）

| 槽位 | 含义 |
|------|------|
| `slot0` | 收藏品「已解锁」 |
| `slot1` | 歌曲「已解锁」（需 data 购买的单曲） |
| `slot2` | 收藏品「已获得进度」 |
| `slot3` | 曲绘「已解锁」 |
| `slot4` | 头像「已解锁」 |

一个条目用 `exist` 掩码声明自己有哪些槽位，例如单曲 `exist=0b01010`（slot1+slot3）。

### 收藏品：完整清单来自游戏本体

收藏品（游戏内「收藏品」）由 `CollectionDatabase`（`ScriptableObject`，在
`assets/bin/Data/data.unity3d`）定义，共 **503 项 / 320 个 key**。存档
`gameKey` 的收藏品判定是 `save[key] >= subIndex`，因此某个 key 的「满进度」
= 它所有 `subIndex` 的最大值。`tools/phi_collections.json` 就是
`key -> 最大 subIndex`。

从 APK 重新生成：

```bash
# 1) 反编译 il2cpp，得到 DummyDll（UnityPy 需要它还原 type tree）
#    https://github.com/Perfare/Il2CppDumper
dotnet Il2CppDumper.dll libil2cpp.so global-metadata.dat out/
# 2) 提取收藏品清单
python tools/extract_collections.py --apk base.apk \
  --dummydll out/DummyDll --out tools/phi_collections.json
```

曲目与真实难度另见 `tools/extract_tracks.py`（解析 Addressables `catalog.json`），
更完整的曲库以 phi-plugin 的 `info.csv` 为准（已放在 `tools/phi_info.csv`）。

---

## 存档格式速查

zip 内 5 个文件，每个都是 `[1 字节版本] + AES-256-CBC(明文)`（AES key/IV 写死在客户端，仅混淆）：

```
gameKey v3 | gameProgress v6 | gameRecord v1 | settings v1 | user v1
```

- **gameKey v3**：尾部 2 字节 = `sideStory4BeginReadKey` / `oldScoreClearedV390`
- **gameProgress v4**：`flagOfSongRecordKeyTakumi`
- **gameProgress v5**：第九章秘密挑战（生命档位 / 歌曲解锁位 / 密码文本）
- **gameProgress v6**（4.0.1）：第九章 Phase2 的 3 个字节
- **summary v7**：明文 base64，**不要加密**

二进制基本类型：`byte/short/int/float` 小端；`varshort` 首字节 bit7=1 则 `(b0&0x7f)+(b1<<7)`；`string` = `varshort` 长度 + UTF-8；`boolean` 按位打包。

---

## 无损校验（强烈建议）

```bash
npx ts-node tools/roundtrip.ts <某个存档.save>
# 逐文件解密对比，输出 ✅ 无损往返 / ❌ 有差异
```

原理：**解析 → 重新序列化必须逐字节一致**，否则说明解析器不支持该存档，别上传。

---

## 目录结构

```
Phigrsaves/
├── src/                        # 存档解析 / 序列化库（gameProgress v6）
├── index.ts / cli.ts           # 库入口 / 原版 CLI
├── tools/
│   ├── apply_all.ts            # 主力改档：全解锁 + 全 AP + 课题模式
│   ├── verify.ts               # 改档后的完整校验
│   ├── inspect.ts              # 离线查看存档字段
│   ├── diffrec.ts              # 两份存档的差异
│   ├── summary.ts             # 查看云端 summary
│   ├── roundtrip.ts            # 无损往返校验
│   ├── get_token.sh            # 从设备读 sessionToken
│   ├── extract_collections.py  # UnityPy 提取收藏品清单
│   ├── extract_tracks.py       # Addressables 提取曲目 / 难度
│   ├── edit.ts                 # 原版改档脚本
│   ├── phi_info.csv            # phi-plugin 曲库（327 首，含真实难度）
│   ├── phi_avatars.txt         # 头像清单
│   ├── phi_collections.json    # 收藏品 key -> 满进度
│   ├── locked_singles.json     # 需解锁的单曲名单
│   ├── capture_token.py        # mitmproxy 插件（备选）
│   ├── sni_relay.py            # 裸 TLS → CONNECT 中继（备选）
│   └── android_install_cert.sh # Android 14/15 装系统证书（备选）
└── .env.example
```

---

## 常见问题

- **上传后游戏「请检查网络连接」**：多半是存档里有游戏不接受的非法值（例如货币单段超过 1023）。用备份还原。
- **某首歌不显示 AP**：检查是否给它塞了谱面里不存在的难度（例如 3 难度歌补了 AT）。按 `phi_info.csv` 的真实难度改回去。
- **收藏品不是 100%**：对着 `phi_collections.json` 检查是否缺 key 或 `slot2` 小于满进度。
- **`selectFirstProfile` 选到别人的档**：云端混着多账号存档，要按「当前登录用户 + 最近更新时间」选（`tools/apply_all.ts` 已处理）。

---

## 致谢 / 参考

- [phigros-save-manager](https://github.com/lamadaemon/phigros-save-manager)
- [PhigrosLibrary](https://github.com/7aGiven/PhigrosLibrary)
- [phi-plugin](https://github.com/Catrong/phi-plugin)（更新的曲库 / 头像）
- [Il2CppDumper](https://github.com/Perfare/Il2CppDumper)、[UnityPy](https://github.com/K0lb3/UnityPy)
