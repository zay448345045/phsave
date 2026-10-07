#!/usr/bin/env python3
"""
从 Phigros 客户端资源里提取「收藏品（CollectionDatabase）」的完整清单。

思路：
  1. APK 里 assets/bin/Data/data.unity3d 是一个 UnityFS 包，里面有
     名为 CollectionDatabase 的 ScriptableObject（List<CollectionItem> items）。
  2. il2cpp 构建把 MonoBehaviour 的 type tree 去掉了，所以需要用
     Il2CppDumper 生成的 DummyDll 让 UnityPy 反推出字段结构。
  3. 每个 CollectionItem 有 `key` 和 `subIndex`；存档里 gameKey 的值
     判定的是 `save[key] >= subIndex`，所以某个 key 的「满进度」
     就是它的最大 subIndex。

用法：
  # 先跑 Il2CppDumper（见 docs），得到 DummyDll/
  python tools/extract_collections.py \
      --apk base.apk \
      --dummydll il2cppdumper/DummyDll \
      --out tools/phi_collections.json

依赖：
  pip install UnityPy TypeTreeGeneratorAPI
"""
import argparse
import collections
import json
import os
import sys
import zipfile

UNITY_VERSION_DEFAULT = "2022.3.62f2"


def load_collection_database(apk_path=None, unity3d_path=None, dummydll=None,
                             unity_version=UNITY_VERSION_DEFAULT):
    import UnityPy
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

    tmp = None
    if unity3d_path is None:
        if apk_path is None:
            raise SystemExit("需要 --apk 或 --data-unity3d")
        tmp = "_data.unity3d"
        with zipfile.ZipFile(apk_path) as z:
            with z.open("assets/bin/Data/data.unity3d") as src, open(tmp, "wb") as dst:
                dst.write(src.read())
        unity3d_path = tmp

    gen = TypeTreeGenerator(unity_version)
    if dummydll:
        gen.load_local_dll_folder(dummydll)

    env = UnityPy.load(unity3d_path)
    if dummydll:
        env.typetree_generator = gen

    target = None
    for obj in env.objects:
        if obj.type.name in ("MonoBehaviour", "ScriptableObject"):
            try:
                d = obj.read(check_read=False)
                if getattr(d, "m_Name", None) == "CollectionDatabase":
                    target = obj
                    break
            except Exception:
                pass

    if target is None:
        raise SystemExit("没有在资源里找到 CollectionDatabase")

    d = target.read()
    if tmp and os.path.exists(tmp):
        os.remove(tmp)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", help="Phigros base.apk")
    ap.add_argument("--data-unity3d", help="已经解出来的 assets/bin/Data/data.unity3d")
    ap.add_argument("--dummydll", help="Il2CppDumper 生成的 DummyDll 目录")
    ap.add_argument("--unity-version", default=UNITY_VERSION_DEFAULT)
    ap.add_argument("--out", default="tools/phi_collections.json")
    ap.add_argument("--full-out", help="可选：输出完整 items JSON")
    args = ap.parse_args()

    d = load_collection_database(args.apk, args.data_unity3d, args.dummydll,
                                 args.unity_version)
    items = []
    for it in d.items:
        items.append({
            "key": it.key,
            "subIndex": int(it.subIndex),
            "getSong": int(getattr(it, "getSong", 0) or 0),
            "name": getattr(getattr(it, "name", None), "chinese", None),
        })

    by_key = collections.defaultdict(list)
    for it in items:
        by_key[it["key"]].append(it["subIndex"])
    compact = {k: max(v) for k, v in by_key.items()}

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(compact, f, ensure_ascii=False, indent=0)
    print(f"[+] {len(items)} 个收藏品、{len(compact)} 个 key -> {args.out}")

    if args.full_out:
        with open(args.full_out, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=1)
        print(f"[+] 完整清单 -> {args.full_out}")


if __name__ == "__main__":
    main()
