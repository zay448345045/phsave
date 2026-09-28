"""
mitmproxy addon: 自动抓取 Phigros 的 LeanCloud 会话令牌 (X-LC-Session)。

用法（在仓库根目录）:
    tools/mitmdump.exe -s tools/capture_token.py

只要手机/模拟器经过本代理，并且请求发往 tapapis.cn，
就会把请求头里的 X-LC-Session 自动写进仓库根目录的 .env。
"""

import re
from pathlib import Path
from mitmproxy import http

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
_captured: set[str] = set()


def _store(token: str) -> None:
    if token in _captured:
        return
    _captured.add(token)

    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    if re.search(r"^PHIGROS_TOKEN=.*$", text, re.M):
        text = re.sub(r"^PHIGROS_TOKEN=.*$", f"PHIGROS_TOKEN={token}", text, flags=re.M)
    else:
        text = text.rstrip() + f"\nPHIGROS_TOKEN={token}\n"
    ENV_FILE.write_text(text, encoding="utf-8")

    print("\n" + "=" * 60)
    print("[+] 已抓到 X-LC-Session，并写入:", ENV_FILE)
    print("    " + token)
    print("=" * 60 + "\n")


def request(flow: http.HTTPFlow) -> None:
    host = flow.request.pretty_host
    if "tapapis.cn" not in host and "leancloud" not in host:
        return
    token = flow.request.headers.get("X-LC-Session")
    if token:
        _store(token)


def response(flow: http.HTTPFlow) -> None:
    host = flow.request.pretty_host
    if "tapapis.cn" not in host and "leancloud" not in host:
        return
    # LeanCloud 登录/注册的响应里带有 sessionToken
    try:
        text = flow.response.get_text(strict=False) or ""
    except Exception:
        text = ""
    m = re.search(r'"sessionToken"\s*:\s*"([^"]+)"', text)
    if m:
        _store(m.group(1))
        return
    tok = flow.response.headers.get("X-LC-Session")
    if tok:
        _store(tok)
