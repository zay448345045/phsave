#!/usr/bin/env python3
"""
从 Phigros 的 Addressables 目录（assets/aa/catalog.json）里提取曲目与真实难度。

catalog.json 里 `m_KeyDataString` 是一段 base64 的字符串表，既包含 UTF-8
也包含 UTF-16LE 编码的资源地址，例如：

    Assets/Tracks/Glaciaxion.SunsetRay.0/Chart_EZ.json
    Assets/Tracks/Glaciaxion.SunsetRay.0/Chart_HD.json
    Assets/Tracks/Glaciaxion.SunsetRay.0/Chart_IN.json

出现的 Chart_XX 就代表这首歌有这个难度，可以据此决定给存档补哪几条记录。

注意：这里只覆盖 APK 内置的资源；更完整的曲库与真实难度以 phi-plugin 的
info.csv 为准（已放在 tools/phi_info.csv）。

用法：
  python tools/extract_tracks.py --apk base.apk --out tools/game_tracks.json
  python tools/extract_tracks.py --catalog catalog.json --out tools/game_tracks.json
"""
import argparse
import base64
import json
import re
import zipfile


def extract_key_data_string(catalog_path=None, apk_path=None):
    if catalog_path is None:
        with zipfile.ZipFile(apk_path) as z:
            with z.open("assets/aa/catalog.json") as f:
                catalog = json.loads(f.read().decode("utf-8"))
    else:
        catalog = json.load(open(catalog_path, encoding="utf-8"))
    return base64.b64decode(catalog["m_KeyDataString"])


def iter_strings(raw):
    """同时产出 UTF-8 与 UTF-16LE 的字符串。"""
    for m in re.finditer(rb"[\x20-\x7e\xc2-\xf4][\x20-\x7e\x80-\xbf]{3,}", raw):
        yield m.group(0).decode("utf-8", "ignore")

    needle = "Assets/Tracks/".encode("utf-16-le")
    start = 0
    while True:
        i = raw.find(needle, start)
        if i < 0:
            return
        start = i + 2
        j, chars = i, []
        while j + 1 < len(raw) and not (raw[j] == 0 and raw[j + 1] == 0):
            chars.append(chr(raw[j] | (raw[j + 1] << 8)))
            j += 2
        yield "".join(chars)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", help="Phigros base.apk")
    ap.add_argument("--catalog", help="已解出的 assets/aa/catalog.json")
    ap.add_argument("--out", default="tools/game_tracks.json")
    args = ap.parse_args()

    raw = extract_key_data_string(args.catalog, args.apk)

    tracks = {}
    pat = re.compile(r"Assets/Tracks/([^/]+)/(Chart_[A-Za-z]+)\.json")
    for s in iter_strings(raw):
        m = pat.search(s)
        if not m:
            continue
        sid, chart = m.group(1), m.group(2).replace("Chart_", "")
        tracks.setdefault(sid, set()).add(chart)

    out = {k: sorted(v) for k, v in sorted(tracks.items())}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"[+] {len(out)} 首曲目 -> {args.out}")


if __name__ == "__main__":
    main()
