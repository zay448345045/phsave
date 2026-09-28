#!/system/bin/sh
# 把 mitmproxy 的 CA 证书装成 Android 14/15 的系统证书。
#
# 前置:
#   adb root
#   adb push <mitmproxy-ca-cert.pem> /data/local/tmp/<hash>.0
#
# 用法:
#   sh /data/local/tmp/android_install_cert.sh <hash>
#
# 原理: 在 CA 目录上 bind-mount 一份"原始证书 + 我们的证书"的副本，
#       并对每个进程的 mount namespace 都做一次，这样 App(zygote 分支)才会看到。

HASH="${1:-c8750f0d}"
SRC="/data/local/tmp/$HASH.0"
CA_DIR="/data/local/tmp/mitm_ca"
APEX_DIR="/apex/com.android.conscrypt/cacerts"
SYS_DIR="/system/etc/security/cacerts"

if [ ! -f "$SRC" ]; then
    echo "找不到证书: $SRC"
    exit 1
fi

# 只构建一次；源码取自只读 rootfs 的 /system/etc/security/cacerts，
# 避免从已被 bind 覆盖的目录里取到我们自己。
if [ ! -f "$CA_DIR/$HASH.0" ]; then
    echo "构建 CA 目录: $CA_DIR"
    rm -rf "$CA_DIR"
    mkdir -p "$CA_DIR"
    cp "$SYS_DIR"/* "$CA_DIR"/
    cp "$SRC" "$CA_DIR/$HASH.0"
    chmod 644 "$CA_DIR"/*
    chcon u:object_r:system_file:s0 "$CA_DIR" "$CA_DIR"/* 2>/dev/null \
        || echo "警告: chcon 失败，App 可能读不到证书"
fi
echo "证书总数: $(ls "$CA_DIR" | wc -l)"

# 当前命名空间
mount -o bind "$CA_DIR" "$APEX_DIR"
mount -o bind "$CA_DIR" "$SYS_DIR"

# 逐个进程的 mount namespace
count=0
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
    [ -e "/proc/$pid/ns/mnt" ] || continue
    if nsenter -t "$pid" -m -- mount -o bind "$CA_DIR" "$APEX_DIR" 2>/dev/null; then
        count=$((count + 1))
    fi
    nsenter -t "$pid" -m -- mount -o bind "$CA_DIR" "$SYS_DIR" 2>/dev/null
done
echo "已处理命名空间数: $count"

echo "--- 校验(当前命名空间) ---"
[ -f "$APEX_DIR/$HASH.0" ] && echo "APEX OK" || echo "APEX 失败"
[ -f "$SYS_DIR/$HASH.0" ] && echo "SYS OK" || echo "SYS 失败"
