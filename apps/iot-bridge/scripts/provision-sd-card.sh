#!/usr/bin/env bash
# Patch a freshly-flashed Pi OS SD card in place: create user `duff`,
# stage SSH key, drop NOPASSWD sudo, configure WiFi, set hostname.
#
# Card must be auto-mounted at:
#   /media/thomas/bootfs   (sda1, FAT32)
#   /media/thomas/rootfs1  (sda2, ext4)
#
# Usage: WIFI_PSK=<passphrase> ./provision-sd-card.sh
set -euo pipefail

BOOTFS=/media/thomas/bootfs
ROOTFS=/media/thomas/rootfs1

USERNAME=duff
HOSTNAME=roam-2
WIFI_SSID=DUFF2GO
WIFI_PSK=${WIFI_PSK:?set WIFI_PSK to the Wi-Fi passphrase}
PUBKEY=/home/thomas/.ssh/id_ed25519.pub

if [[ $EUID -ne 0 ]]; then
  echo "Re-running under sudo..."
  exec sudo -E bash "$0" "$@"
fi

[[ -d $BOOTFS ]] || { echo "ERROR: $BOOTFS not mounted"; exit 1; }
[[ -d $ROOTFS ]] || { echo "ERROR: $ROOTFS not mounted"; exit 1; }
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

echo ">>> 2. userconf.txt (renames pi -> $USERNAME on first boot)"
HASH=$(openssl passwd -6 "$(head -c 32 /dev/urandom | base64)")
echo "$USERNAME:$HASH" > "$BOOTFS/userconf.txt"
chmod 0600 "$BOOTFS/userconf.txt"

echo ">>> 3. SSH authorized_keys at /home/pi/.ssh (renamed to /home/$USERNAME/.ssh on boot)"
SSH_DIR=$ROOTFS/home/pi/.ssh
mkdir -p "$SSH_DIR"
install -m 0600 -o 1000 -g 1000 "$PUBKEY" "$SSH_DIR/authorized_keys"
chown 1000:1000 "$SSH_DIR"
chmod 0700 "$SSH_DIR"

echo ">>> 4. NOPASSWD sudoers drop-in"
SUDO_FILE=$ROOTFS/etc/sudoers.d/010_${USERNAME}-nopasswd
echo "$USERNAME ALL=(ALL) NOPASSWD: ALL" > "$SUDO_FILE"
chmod 0440 "$SUDO_FILE"
chown 0:0 "$SUDO_FILE"

echo ">>> 5. Hostname -> $HOSTNAME"
echo "$HOSTNAME" > "$ROOTFS/etc/hostname"
sed -i "s|^127\.0\.1\.1[[:space:]]\+raspberrypi|127.0.1.1\t$HOSTNAME|" "$ROOTFS/etc/hosts"

echo ">>> 6. Removing stale /media/thomas/rootfs leftover"
rm -rf /media/thomas/rootfs/

echo ""
echo "=== Verify ==="
ls -la "$WIFI_FILE"
ls -la "$BOOTFS/userconf.txt"
ls -la "$SSH_DIR/"
ls -la "$SUDO_FILE"
echo "hostname: $(cat "$ROOTFS/etc/hostname")"
grep -E '127\.0\.1\.1' "$ROOTFS/etc/hosts"
echo ""
echo "Done. To flush + eject:"
echo "  sync && sudo umount $BOOTFS $ROOTFS && sudo eject /dev/sda"
