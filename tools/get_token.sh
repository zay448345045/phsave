#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 直接从模拟器/设备上读取 Phigros 的 LeanCloud sessionToken，写入仓库根目录 .env
#
# 原理：登录成功后，LeanCloud 会把当前 _User（包括明文 sessionToken）保存在
#   /sdcard/Android/data/com.PigeonGames.Phigros/files/.userdata
# 所以只要设备有 root / 能读这个文件，就完全不需要 mitmproxy 抓包。
#
# 用法:
#   tools/get_token.sh [serial] [adb]
# 环境变量:
#   ADB    adb 可执行文件路径（默认 adb）
#   ENV    输出文件（默认仓库根目录 .env）
# ---------------------------------------------------------------------------
set -euo pipefail

SERIAL="${1:-127.0.0.1:16384}"
ADB="${ADB:-adb}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV:-$ROOT/.env}"

export MSYS_NO_PATHCONV=1

REMOTE="/sdcard/Android/data/com.PigeonGames.Phigros/files/.userdata"

echo "[*] adb: $ADB   serial: $SERIAL"
RAW="$("$ADB" -s "$SERIAL" shell "cat $REMOTE")"

TOKEN="$(printf '%s' "$RAW" | python -c "
import sys, json
try:
    print(json.load(sys.stdin)['sessionToken'])
except Exception as e:
    sys.stderr.write('无法解析 .userdata: %s\n' % e)
    sys.exit(1)
")"

if [ -z "$TOKEN" ]; then
    echo "[!] 没拿到 sessionToken，检查设备是否已登录、以及 adb 是否有权限读该文件" >&2
    exit 1
fi

if [ -f "$ENV_FILE" ] && grep -q '^PHIGROS_TOKEN=' "$ENV_FILE"; then
    python - "$ENV_FILE" "$TOKEN" <<'PY'
import re, sys
path, token = sys.argv[1], sys.argv[2]
text = open(path, encoding='utf-8').read()
text = re.sub(r'^PHIGROS_TOKEN=.*$', 'PHIGROS_TOKEN=' + token, text, flags=re.M)
open(path, 'w', encoding='utf-8').write(text)
PY
else
    printf 'PHIGROS_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi

echo "[+] sessionToken = $TOKEN"
echo "[+] 已写入 $ENV_FILE"
