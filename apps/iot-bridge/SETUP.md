# iot-bridge — Pi 5 + Waveshare SIM7670G HAT Setup

End-to-end guide for getting one Raspberry Pi 5 with a Waveshare SIM7670G LTE Cat-1/GNSS HAT running the iot-bridge process. Follow top-to-bottom on a fresh SD card.

## What you need

- Raspberry Pi 5
- Official 5V/5A USB-C PD power supply (undersized PSUs cause silent peripheral failures — don't skip this)
- Waveshare SIM7670G LTE Cat-1/GNSS HAT
- Active GNSS puck antenna (ships with the HAT, magnetic base + ~3m cable)
- microSD card, 32GB+, class 10 or better
- Network the Pi can join (WiFi or Ethernet)
- Linux/macOS laptop with `ssh`, `rsync`, `pnpm` installed
- Optional: SIM card with active data plan + LTE antenna (only if you want cellular — not needed for GPS or WiFi-location modes)

## 1. Flash the SD card

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/).

1. Choose **Raspberry Pi OS Lite (64-bit)**.
2. Click the gear icon and set:
   - Hostname: `roam-1` (or whatever — match your fleet naming)
   - User: `thomas` (no password — we'll use SSH key + NOPASSWD sudo)
   - WiFi: your network SSID + password
   - Locale + timezone
   - SSH: enable with **public key auth only**, paste your `~/.ssh/id_ed25519.pub`
3. Write the card.

### One extra step before you eject — give your user passwordless sudo

Pi Imager creates a user with the password locked, which means `sudo` will reject every keystroke. Add a sudoers drop-in by mounting the rootfs partition on your laptop:

```bash
sudo mount -o ro /dev/sda2 /mnt/pi-root   # adjust device if not /dev/sda
sudo mount -o remount,rw /mnt/pi-root
echo 'thomas ALL=(ALL) NOPASSWD: ALL' | sudo tee /mnt/pi-root/etc/sudoers.d/010_thomas-nopasswd > /dev/null
sudo chmod 0440 /mnt/pi-root/etc/sudoers.d/010_thomas-nopasswd
sudo chown 0:0 /mnt/pi-root/etc/sudoers.d/010_thomas-nopasswd
sudo umount /mnt/pi-root
sudo eject /dev/sda
```

Substitute the username if you used something other than `thomas`.

## 2. Set the HAT DIP switches (with the Pi powered off)

The HAT has a 4-position DIP switch block. Out of the box it ships all OFF, which is wrong. Find the labels printed on the PCB next to each switch and set them as follows:

| # | Label | Position |
|---|-------|----------|
| 1 | TXD   | **ON**   |
| 2 | RXD   | **ON**   |
| 3 | PWR   | **ON**   |
| 4 | BOOT  | **OFF**  |

`BOOT=ON` puts the chip in firmware-burn mode and it ignores AT commands — leave it OFF for normal operation.

A retracted ballpoint pen tip flips the switches cleanly. Don't try fingernails — they're too small.

## 3. Mount the HAT and connect antennas

1. Pi is unplugged from power.
2. Press the HAT down onto the 40-pin GPIO header. It only fits one way; mind the alignment.
3. Screw the magnetic-mount **GNSS antenna** onto the SMA port labeled `GNSS`. Place the puck on a windowsill (sky view side) or outside — indoor on a desk gets you nothing.
4. Skip the LTE antenna unless you have a SIM. The other SMA is `LTE-MAIN`.

## 4. First boot + enable the GPIO UART

Plug power back in, wait ~30s for boot, then:

```bash
ssh thomas@roam-1.local
```

The Pi 5's GPIO UART (`/dev/ttyAMA0`) is **not enabled by default**, and the device that *is* present (`/dev/ttyAMA10`) is a different UART that goes nowhere on this board. Run this exactly once:

```bash
# Free the UART from Bluetooth and enable the RP1 GPIO UART
sudo tee -a /boot/firmware/config.txt > /dev/null <<'EOF'

# iot-bridge: free GPIO UART for SIM7670G HAT
dtoverlay=disable-bt
dtparam=uart0=on
EOF

# Stop the kernel from dumping boot logs onto the HAT's UART
sudo sed -i 's|console=serial0,115200 ||' /boot/firmware/cmdline.txt

# Disable the login getty that grabs ttyAMA10 by default
sudo systemctl mask serial-getty@ttyAMA10.service

sudo reboot
```

Wait ~30s, SSH back in, and verify:

```bash
ls /dev/ttyAMA0   # must exist
sudo stty -F /dev/ttyAMA0 115200 raw -echo
( timeout 3 sudo cat /dev/ttyAMA0 ) & sleep 0.4
printf 'AT\r\n' | sudo tee /dev/ttyAMA0 > /dev/null
wait
```

You should see `OK` come back. If you don't, re-check the DIP switches.

## 5. Install Node 22, pnpm, pm2

```bash
sudo apt-get update -y
sudo apt-get install -y build-essential python3 curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm pm2
```

Set pm2 to auto-start at boot:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u thomas --hp /home/thomas
```

## 6. Deploy the iot-bridge code

**On your laptop**, from the monorepo root:

```bash
pnpm --filter @roam/iot-bridge build

rsync -avz --delete \
  --exclude=node_modules --exclude=.turbo --exclude='*.tsbuildinfo' --exclude='.env.local' \
  apps/iot-bridge/ thomas@roam-1.local:/home/thomas/iot-bridge/
```

**On the Pi**, install the runtime deps:

```bash
ssh thomas@roam-1.local 'cd /home/thomas/iot-bridge && pnpm install --prod'
```

## 7. Configure environment

Create `/home/thomas/iot-bridge/.env.local` on the Pi:

```bash
ssh thomas@roam-1.local 'cat > /home/thomas/iot-bridge/.env.local' <<EOF
MQTT_URL=mqtt://<your-broker-host>:1883
VEHICLE_ID=hd4-002
LOCATION_SOURCE=gps
SERIAL_PORT=/dev/ttyAMA0
BAUD_RATE=115200

# Only used when LOCATION_SOURCE=wifi
GOOGLE_GEOLOCATION_API_KEY=
WIFI_INTERFACE=wlan0
WIFI_SCAN_INTERVAL_MS=15000
EOF
```

Pick `LOCATION_SOURCE` based on environment:

| Mode       | Use when                                    | Required vars                          |
|------------|---------------------------------------------|----------------------------------------|
| `gps`      | Outdoors / antenna near a window            | `SERIAL_PORT`, `BAUD_RATE`             |
| `wifi`     | Indoors with mapped WiFi APs nearby         | `GOOGLE_GEOLOCATION_API_KEY` (Google Cloud → enable Geolocation API → create key) |
| `simulate` | Demo/dev with no real hardware              | nothing extra — generates Miami random walk |

Set `VEHICLE_ID` to something unique per Pi.

## 8. Start it

```bash
ssh thomas@roam-1.local '
  cd /home/thomas/iot-bridge && \
  pm2 start ecosystem.config.cjs && \
  pm2 save'
```

## 9. Verify

```bash
ssh thomas@roam-1.local 'pm2 logs iot-bridge --lines 50 --nostream'
```

Expected log output by mode:

- **gps**: `SIM7670G init → ...` lines on startup, then once the puck has sky view + 4+ sats at SNR ≥25, `Published fix: <lat>,<lon>` lines start. **Cold start can take 5+ minutes.**
- **wifi**: `WiFi fix: lat=… lon=… accuracy=Xm (N APs)` every ~15s.
- **simulate**: `Published fix: 25.76…,-80.19… @ Xkm/h` every 2s.

If GPS shows no fixes after 10 minutes near a window, peek at the raw stream to see satellite SNRs:

```bash
ssh thomas@roam-1.local 'pm2 stop iot-bridge && timeout 5 sudo cat /dev/ttyAMA0 | grep -E "GSV|RMC"; pm2 restart iot-bridge'
```

You want `$GPGSV` lines showing 6+ satellites with SNR values ≥30. Anything less = move the antenna.

## Updating the code later

Same as deploy, just rerun:

```bash
pnpm --filter @roam/iot-bridge build
rsync -avz --delete \
  --exclude=node_modules --exclude=.turbo --exclude='*.tsbuildinfo' --exclude='.env.local' \
  apps/iot-bridge/ thomas@roam-1.local:/home/thomas/iot-bridge/
ssh thomas@roam-1.local 'cd /home/thomas/iot-bridge && pnpm install --prod && pm2 restart iot-bridge'
```

## Common gotchas

- **`/dev/ttyAMA10` exists by default — don't use it.** That's the SoC's internal PL011 (was Bluetooth's UART). The GPIO header UART is `/dev/ttyAMA0` and only appears after `dtparam=uart0=on`.
- **`AT` returns nothing.** 99% of the time: a DIP switch is in the wrong position. Power off, double-check the table in step 2, retry.
- **GPS shows status `V` forever.** Antenna placement, not patience. Move it to a window or outside.
- **`Bluetooth: hci_uart_bcm serial0-0` in dmesg.** Means `dtoverlay=disable-bt` didn't take. Check `/boot/firmware/config.txt` and reboot.
- **`pm2` not found at boot.** You skipped step 5's `pm2 startup` command. Run it and `pm2 save`.
- **Pi 5 throttles or USB drops out.** Underpowered. Use the 5V/5A official PSU.
