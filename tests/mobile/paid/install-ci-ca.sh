#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
certificate=${1:?CI certificate required}
cert_hash=$(openssl x509 -in "$certificate" -subject_hash_old -noout)
[[ $cert_hash =~ ^[a-f0-9]{8}$ ]] || exit 2
adb root
adb wait-for-device
adb push "$certificate" "/data/local/tmp/$cert_hash.0"
# All modifications are inside the disposable emulator. Keep the complete
# stock trust store and add just this run's root; no application TLS patches.
adb shell "set -e
mkdir -p /data/local/tmp/lyco-ci-stock-ca
cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/lyco-ci-stock-ca/
mount -t tmpfs tmpfs /system/etc/security/cacerts
cp /data/local/tmp/lyco-ci-stock-ca/* /system/etc/security/cacerts/
cp /data/local/tmp/$cert_hash.0 /system/etc/security/cacerts/
chown root:root /system/etc/security/cacerts/*
chmod 644 /system/etc/security/cacerts/*
chcon u:object_r:system_file:s0 /system/etc/security/cacerts/*
for pid in \$(pidof zygote zygote64); do
 nsenter --mount=/proc/\$pid/ns/mnt -- /bin/mount --bind /system/etc/security/cacerts /apex/com.android.conscrypt/cacerts
 nsenter --mount=/proc/\$pid/ns/mnt -- /bin/ls /apex/com.android.conscrypt/cacerts/$cert_hash.0
done"
echo "CI root added to emulator zygote trust store: $cert_hash"
