#!/usr/bin/env bash
# 启动抓包代理。参数会透传给 mitmdump。
# 例: tools/capture.sh -p 8080
set -e
VENV_PY="${MITM_VENV:-$HOME/.mitm-venv}/Scripts/mitmdump.exe"
if [ ! -x "$VENV_PY" ]; then
    echo "找不到 mitmdump: $VENV_PY"
    echo "请设置 MITM_VENV 或先创建虚拟环境并安装 mitmproxy。"
    exit 1
fi
exec "$VENV_PY" -s "$(dirname "$0")/capture_token.py" "$@"
