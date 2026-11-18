#!/bin/zsh
set -euo pipefail

# The SDK and AVD are installed separately; this launcher never downloads packages.
project_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_USER_HOME="$HOME/Library/Developer/FinHOT/android-user"
export ANDROID_AVD_HOME="$HOME/Library/Developer/FinHOT/avd"
avd_name="FinHOT_Phone_API36"
serial="emulator-5580"
adb="$ANDROID_HOME/platform-tools/adb"
emulator="$ANDROID_HOME/emulator/emulator"
apk="$project_dir/app/build/outputs/apk/debug/app-debug.apk"
log_dir="$HOME/Library/Logs/FinHOT"

[[ -x "$adb" && -x "$emulator" ]] || { print '请先安装 Android SDK 和模拟器。'; exit 1; }
[[ -f "$ANDROID_AVD_HOME/$avd_name.ini" ]] || { print '未找到 FinHOT Android 虚拟设备，请先按 README 创建。'; exit 1; }
[[ -f "$apk" ]] || { print '请先构建测试 APK，详见 README。'; exit 1; }
emulator_pid=""
"$adb" start-server
if "$adb" devices | awk '{print $1}' | /usr/bin/grep -qx "$serial"; then
  active_avd="$("$adb" -s "$serial" emu avd name | tr -d '\r' | head -1)"
  [[ "$active_avd" == "$avd_name" ]] || { print '5580 端口正在运行其他模拟器，请关闭它后再试。'; exit 1; }
else
  mkdir -p "$log_dir"
  nohup "$emulator" -avd "$avd_name" -port 5580 -memory 2048 -cores 2 \
    -no-snapshot -no-boot-anim > "$log_dir/emulator.log" 2>&1 < /dev/null &
  emulator_pid=$!
fi
print '正在启动 FinHOT 安卓模拟器，首次开机需要一点时间……'
booted=false
for attempt in {1..120}; do
  if [[ "$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then
    booted=true
    break
  fi
  sleep 2
done
[[ "$booted" == true ]] || { print "模拟器未完成启动，请查看 $log_dir/emulator.log"; exit 1; }
"$adb" -s "$serial" shell wm dismiss-keyguard
"$adb" -s "$serial" install -r "$apk"
"$adb" -s "$serial" shell am start -n website.finhub.finhot/.MainActivity
print 'FinHOT 已打开，可直接在模拟器里点击和滚动。关闭模拟器窗口即可退出。'

# Keep the launching terminal alive for the lifetime of the emulator.
if [[ -n "$emulator_pid" ]]; then
  wait "$emulator_pid"
fi
