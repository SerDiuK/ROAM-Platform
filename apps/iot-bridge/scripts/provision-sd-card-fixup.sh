#!/usr/bin/env bash
# Fixup: card already booted once and userconf-pi renamed pi -> duff.
# Apply the bits the original provision script missed: SSH key, NOPASSWD sudo,
# hostname, WiFi.
set -euo pipefail

BOOTFS=${BOOTFS:-/media/thomas/bootfs}
ROOTFS=${ROOTFS:-/media/thomas/rootfs}

USERNAME=duff
HOSTNAME=roam-2
WIFI_SSID=DUFF2GO
WIFI_PSK=7544440222
PUBKEY=/home/thomas/.ssh/id_ed25519.pub

if [[ $EUID -ne 0 ]]; then
  echo "Re-running under sudo..."
  exec sudo -E bash "$0" "$@"
fi

[[ -d $BOOTFS ]] || { echo "ERROR: $BOOTFS not mounted"; exit 1; }
[[ -d $ROOTFS ]] || { echo "ERROR: $ROOTFS not mounted"; exit 1; }
[[ -d $ROOTFS/home/$USERNAME ]] || { echo "ERROR: /home/$USERNAME not present on card"; exit 1; }
[[ -f $PUBKEY ]] || { echo "ERROR: $PUBKEY not found"; exit 1; }

echo ">>> 1. WiFi profile ($WIFI_SSID)"
UUID=$(uuidgen)
WIFI_FILE=$ROOTFS/etc/NetworkManager/system-connections/preconfigured.nmconnection
cat > "$WIFI_FILE" <<EOF
[connection]
id=preconfigured
uuid=$UUID
type=wifi
autoconnect=true

[wifi]
mode=infrastructure
ssid=$WIFI_SSID

[wifi-security]
key-mgmt=wpa-psk
psk=$WIFI_PSK

[ipv4]
method=auto

[ipv6]
method=auto
EOF
chmod 0600 "$WIFI_FILE"
chown 0:0 "$WIFI_FILE"

echo ">>> 2. SSH authorized_keys at /home/$USERNAME/.ssh"
SSH_DIR=$ROOTFS/home/$USERNAME/.ssh
mkdir -p "$SSH_DIR"
install -m 0600 -o 1000 -g 1000 "$PUBKEY" "$SSH_DIR/authorized_keys"
chown 1000:1000 "$SSH_DIR"
chmod 0700 "$SSH_DIR"

echo ">>> 3. NOPASSWD sudoers drop-in"
SUDO_FILE=$ROOTFS/etc/sudoers.d/010_${USERNAME}-nopasswd
echo "$USERNAME ALL=(ALL) NOPASSWD: ALL" > "$SUDO_FILE"
chmod 0440 "$SUDO_FILE"
chown 0:0 "$SUDO_FILE"

echo ">>> 4. Hostname -> $HOSTNAME"
echo "$HOSTNAME" > "$ROOTFS/etc/hostname"
sed -i "s|^127\.0\.1\.1[[:space:]]\+raspberrypi|127.0.1.1\t$HOSTNAME|" "$ROOTFS/etc/hosts"

echo ""
echo "=== Verify ==="
ls -la "$WIFI_FILE"
ls -la "$SSH_DIR/"
ls -la "$SUDO_FILE"
echo "hostname: $(cat "$ROOTFS/etc/hostname")"
grep -E '127\.0\.1\.1' "$ROOTFS/etc/hosts"
echo ""
echo "Done. To flush + eject:"
echo "  sync && udisksctl unmount -b /dev/sdb1 && udisksctl unmount -b /dev/sdb2 && sudo eject /dev/sdb"
