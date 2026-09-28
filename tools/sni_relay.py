"""
SNI relay: 把"忽略系统代理"的 App 的直连流量导入 mitmproxy。

原理:
  App 直连 host:443 的 TLS ClientHello 被 iptables DNAT 到本脚本(8081)。
  本脚本从 ClientHello 里解析出 SNI 主机名, 用 HTTP CONNECT 连到
  mitmproxy(8080) 的常规代理模式, 再把原始字节双向转发。
  mitmproxy 用它的 CA 动态签发该域名证书, 而 App 信任该 CA(已装系统证书)。

用法: python sni_relay.py [--listen 8081] [--proxy 127.0.0.1:8080]
"""

import argparse
import select
import socket
import struct
import threading


def recv_exact(sock: socket.socket, n: int):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def parse_sni(payload: bytes):
    """从 ClientHello 的 handshake 负载里解析 SNI。"""
    try:
        p = 4 + 2 + 32                       # handshake type+len, version, random
        sid_len = payload[p]
        p += 1 + sid_len
        cs_len = struct.unpack(">H", payload[p:p + 2])[0]
        p += 2 + cs_len
        comp_len = payload[p]
        p += 1 + comp_len
        ext_len = struct.unpack(">H", payload[p:p + 2])[0]
        p += 2
        end = p + ext_len
        while p + 4 <= end:
            etype = struct.unpack(">H", payload[p:p + 2])[0]
            elen = struct.unpack(">H", payload[p + 2:p + 4])[0]
            p += 4
            if etype == 0:                   # server_name
                q = p + 2
                q += 1                       # name_type
                nlen = struct.unpack(">H", payload[q:q + 2])[0]
                q += 2
                return payload[q:q + nlen].decode("ascii", "ignore")
            p += elen
    except Exception:
        return None
    return None


def pipe(a: socket.socket, b: socket.socket):
    socks = [a, b]
    try:
        while True:
            r, _, _ = select.select(socks, [], [], 60)
            if not r:
                break
            for s in r:
                data = s.recv(65536)
                if not data:
                    return
                (b if s is a else a).sendall(data)
    except Exception:
        pass


def handle(client: socket.socket, proxy_host: str, proxy_port: int):
    upstream = None
    try:
        hdr = recv_exact(client, 5)
        if not hdr or hdr[0] != 0x16:
            return
        rec_len = struct.unpack(">H", hdr[3:5])[0]
        body = recv_exact(client, rec_len)
        if body is None:
            return
        sni = parse_sni(body)
        if not sni:
            print("[relay] 无法解析 SNI, 断开")
            return

        upstream = socket.create_connection((proxy_host, proxy_port), timeout=10)
        upstream.sendall(
            f"CONNECT {sni}:443 HTTP/1.1\r\nHost: {sni}:443\r\n\r\n".encode()
        )
        resp = b""
        while b"\r\n\r\n" not in resp:
            c = upstream.recv(1)
            if not c:
                break
            resp += c
        if b" 200 " not in resp.split(b"\r\n", 1)[0]:
            print(f"[relay] 代理拒绝 CONNECT {sni}: {resp[:80]!r}")
            return

        print(f"[relay] {sni} -> mitmproxy")
        upstream.sendall(hdr + body)         # 转发已读取的 ClientHello
        upstream.setblocking(True)
        pipe(client, upstream)
    except Exception as e:
        print(f"[relay] 错误: {e}")
    finally:
        for s in (client, upstream):
            try:
                if s:
                    s.close()
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, default=8081)
    ap.add_argument("--proxy", default="127.0.0.1:8080")
    args = ap.parse_args()
    phost, pport = args.proxy.rsplit(":", 1)

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", args.listen))
    srv.listen(128)
    print(f"[relay] 监听 0.0.0.0:{args.listen}, 转发到 mitmproxy {args.proxy}")
    while True:
        client, _ = srv.accept()
        threading.Thread(
            target=handle, args=(client, phost, int(pport)), daemon=True
        ).start()


if __name__ == "__main__":
    main()
