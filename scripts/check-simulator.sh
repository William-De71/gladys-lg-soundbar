#!/usr/bin/env bash
# Check the fake soundbar of the tests against python-temescal 0.5, the library
# of the Home Assistant integration: it must decrypt the answers of the fake,
# read the same values and change them. If it does, the framing and the cipher
# of src/temescal/protocol.js (tested against the fake) are those of the
# protocol. Needs python3 (a throw-away virtualenv is created, run isolated).
set -euo pipefail
cd "$(dirname "$0")/.."
# CHECK_WORKDIR: where the virtualenv goes (kept), else a temporary folder.
if [ -n "${CHECK_WORKDIR:-}" ]; then
  work="$CHECK_WORKDIR"
  mkdir -p "$work"
  trap 'kill "${fake_pid:-0}" 2>/dev/null || true' EXIT
else
  work="$(mktemp -d)"
  trap 'kill "${fake_pid:-0}" 2>/dev/null || true; rm -rf "$work"' EXIT
fi
[ -x "$work/venv/bin/python" ] || python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet 'temescal==0.5' 'pycryptodome'
port=19741
node scripts/fake-soundbar.mjs "$port" SP8YA > /dev/null &
fake_pid=$!
for _ in $(seq 1 50); do
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break
  sleep 0.1
done
cat > "$work/check.py" <<'PY'
import sys, time, threading
import temescal

seen = {}
event = threading.Event()

def callback(response):
    data = response.get("data") or {}
    seen.setdefault(response["msg"], {}).update(data)
    event.set()

def wait_for(check, what):
    deadline = time.time() + 5
    while time.time() < deadline:
        if check():
            return
        time.sleep(0.05)
    raise SystemExit("timeout waiting for " + what + ": " + repr(seen))

speaker = temescal.temescal("127.0.0.1", port=int(sys.argv[1]), callback=callback)
for get in (speaker.get_info, speaker.get_mac_info, speaker.get_product_info, speaker.get_func,
            speaker.get_eq, speaker.get_settings, speaker.get_play):
    get()
wait_for(lambda: len(seen) >= 7, "the seven answers")
assert seen["SPK_LIST_VIEW_INFO"]["i_vol"] == 7
assert seen["SPK_LIST_VIEW_INFO"]["i_vol_max"] == 40
assert seen["SPK_LIST_VIEW_INFO"]["s_user_name"] == "LG_Speaker_SP8YA"
assert seen["MAC_INFO_DEV"]["s_uuid"] == "3a1f9c2e-77b0-4c1d-9e8a-1b2c3d4e5f60"
assert seen["PRODUCT_INFO"]["s_model_name"] == "SP8YA"
assert seen["FUNC_VIEW_INFO"]["ai_func_list"] == [0, 1, 15, 6]
assert temescal.equalisers[seen["EQ_VIEW_INFO"]["i_curr_eq"]] == "Standard"
assert seen["SETTING_VIEW_INFO"]["i_woofer_level"] == 15

speaker.set_volume(12)
speaker.set_mute(True)
speaker.set_func(temescal.HDMI)
speaker.set_eq(temescal.CINEMA)
speaker.set_night_mode(True)
speaker.set_woofer_level(18)
wait_for(lambda: seen["SPK_LIST_VIEW_INFO"].get("i_vol") == 12 and seen["SPK_LIST_VIEW_INFO"].get("b_mute") is True
         and seen["FUNC_VIEW_INFO"].get("i_curr_func") == temescal.HDMI
         and seen["EQ_VIEW_INFO"].get("i_curr_eq") == temescal.CINEMA
         and seen["SETTING_VIEW_INFO"].get("b_night_time") is True
         and seen["SETTING_VIEW_INFO"].get("i_woofer_level") == 18, "the changes")
seen.clear()
speaker.get_info()
wait_for(lambda: "SPK_LIST_VIEW_INFO" in seen, "the read back")
assert seen["SPK_LIST_VIEW_INFO"]["i_vol"] == 12
print("python-temescal 0.5 reads and changes the fake soundbar: OK")
PY
(cd "$work" && venv/bin/python -I check.py "$port")
