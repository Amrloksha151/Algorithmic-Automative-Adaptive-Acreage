# ─────────────────────────────────────────────────────────────
#  main.py  —  GreenMind ESP32-S3 Firmware
#
#  Why umqtt.simple + asyncio works the way it does
#  ─────────────────────────────────────────────────
#  umqtt.simple uses blocking BSD sockets internally.
#  check_msg() does a non-blocking recv (socket set to timeout=0)
#  so it returns immediately if nothing is waiting — safe to call
#  from an async loop.  publish() and connect() DO block briefly
#  (a few ms) while the TCP write completes.  For a greenhouse
#  sensor publishing every second this is perfectly acceptable.
#
#  The rule: never call time.sleep() inside the async loop.
#  Always use await asyncio.sleep() so other tasks get CPU time.
#
#  Tasks:
#    dht_loop()          reads DHT22 every 2 s
#    fast_sensor_loop()  reads soil + LDR every 1 s
#    publish_loop()      publishes readings every SENSOR_INTERVAL s
#    mqtt_loop()         polls incoming commands every 100 ms
#    watchdog_loop()     reconnects WiFi/MQTT if dropped, every 15 s
#
#  MQTT Topics:
#    Publish  → {PREFIX}/sensors           JSON sensor payload
#    Publish  → {PREFIX}/status            "online" / "offline" (LWT)
#    Publish  → {PREFIX}/actuators/state   actuator state snapshot
#    Subscribe→ {PREFIX}/commands          JSON command from server/AI
#
#  Command payload:
#    { "device": "cooling_fan", "value": 80 }   PWM 0-100
#    { "device": "pump_5v",     "value": 1  }   digital ON
#    { "device": "__all_off__", "value": 1  }   emergency stop
# ─────────────────────────────────────────────────────────────

import asyncio
import json
import time
import network
from umqtt.simple import MQTTClient

from config    import (WIFI_SSID, WIFI_PASSWORD,
                       MQTT_BROKER, MQTT_PORT, MQTT_CLIENT_ID,
                       MQTT_USER, MQTT_PASSWORD,
                       TOPIC_PREFIX, SENSOR_INTERVAL)
from sensors   import read_dht22, read_soil, read_ldr
from actuators import init_actuators, set_actuator, get_state, all_off

# ── Topics ────────────────────────────────────────────────────
T_SENSORS = (TOPIC_PREFIX + "/sensors").encode()
T_STATUS  = (TOPIC_PREFIX + "/status").encode()
T_ACT_ST  = (TOPIC_PREFIX + "/actuators/state").encode()
T_CMD     = (TOPIC_PREFIX + "/commands").encode()

# ── Shared mutable state ──────────────────────────────────────
_sensor_cache = {
    "temperature": None,
    "humidity":    None,
    "soil":        None,
    "light":       None,
}

_mqtt_client = None
_wifi        = None
_connected   = False


def _reset_mqtt_client(reason=None):
    """Close and forget the current MQTT client before reconnecting."""
    global _mqtt_client, _connected
    client = _mqtt_client
    _mqtt_client = None
    _connected = False

    if not client:
        return

    try:
        client.disconnect()
    except Exception as exc:
        if reason:
            print("[MQTT] Cleanup after", reason, "failed:", exc)
        else:
            print("[MQTT] Cleanup failed:", exc)


# ═════════════════════════════════════════════════════════════
#  WIFI  (blocking — runs before async loop starts)
# ═════════════════════════════════════════════════════════════

def wifi_connect():
    global _wifi
    _wifi = network.WLAN(network.STA_IF)
    _wifi.active(True)

    if _wifi.isconnected():
        print("[NET] Already connected:", _wifi.ifconfig()[0])
        return

    print("[NET] Connecting to", WIFI_SSID, end=" ")
    _wifi.connect(WIFI_SSID, WIFI_PASSWORD)
    deadline = time.time() + 30
    while not _wifi.isconnected():
        if time.time() > deadline:
            print("\n[NET] Timeout — retrying")
            _wifi.connect(WIFI_SSID, WIFI_PASSWORD)
            deadline = time.time() + 30
        print(".", end="")
        time.sleep(0.4)
    print("\n[NET] Connected IP=" + _wifi.ifconfig()[0])


# ═════════════════════════════════════════════════════════════
#  MQTT  (blocking connect, async poll)
# ═════════════════════════════════════════════════════════════

def _on_command(topic, msg):
    """Fires synchronously inside check_msg() when a message arrives."""
    try:
        payload = json.loads(msg.decode())
        device  = payload.get("device", "")
        value   = payload.get("value", 0)
        print("[CMD]", device, "=", value)

        if device == "__all_off__":
            all_off()
            _publish_actuator_state()
            return

        result = set_actuator(device, value)
        if result["ok"]:
            _publish_actuator_state()
        else:
            print("[CMD] Error:", result["error"])
    except Exception as exc:
        print("[CMD] Parse error:", exc, "raw:", msg)


def _publish_actuator_state():
    global _connected
    if not (_mqtt_client and _connected):
        return
    try:
        _mqtt_client.publish(T_ACT_ST, json.dumps(get_state()).encode(), retain=True)
    except Exception as exc:
        print("[MQTT] Actuator publish error:", exc)
        _reset_mqtt_client("actuator publish error")


def mqtt_connect():
    """
    Blocking MQTT connect. Returns True on success, False on failure.
    Safe to call from both the boot sequence and the watchdog task.
    """
    global _mqtt_client, _connected
    _reset_mqtt_client("reconnect")
    try:
        client = MQTTClient(
            client_id = MQTT_CLIENT_ID,
            server    = MQTT_BROKER,
            port      = MQTT_PORT,
            user      = MQTT_USER     or None,
            password  = MQTT_PASSWORD or None,
            keepalive = 60,
        )
        # Set socket to non-blocking BEFORE connecting so check_msg()
        # returns immediately instead of hanging when no data is waiting.
        client.set_last_will(T_STATUS, b"offline", retain=True, qos=0)
        client.set_callback(_on_command)
        client.connect()
        # Make socket non-blocking for check_msg()
        client.sock.settimeout(0)
        client.subscribe(T_CMD)
        client.publish(T_STATUS, b"online", retain=True, qos=0)
        _mqtt_client = client
        _connected   = True
        print("[MQTT] Connected to", MQTT_BROKER, "port", MQTT_PORT)
        print("[MQTT] Sub:", T_CMD.decode())
        print("[MQTT] Pub:", T_SENSORS.decode())
        return True
    except Exception as exc:
        print("[MQTT] Connect failed:", exc)
        _reset_mqtt_client("connect failure")
        return False


# ═════════════════════════════════════════════════════════════
#  ASYNC TASKS
# ═════════════════════════════════════════════════════════════

async def dht_loop():
    """Read DHT22 every 2 s. First read after 2 s settle time."""
    await asyncio.sleep(2)
    while True:
        result = read_dht22()
        if result["dht_ok"]:
            _sensor_cache["temperature"] = result["temperature"]
            _sensor_cache["humidity"]    = result["humidity"]
        else:
            print("[SEN] DHT22 read failed — using last known value")
        await asyncio.sleep(2)


async def fast_sensor_loop():
    """Read soil + LDR every 1 s."""
    await asyncio.sleep(0.5)
    while True:
        try:
            _sensor_cache["soil"]  = read_soil()["soil"]
            _sensor_cache["light"] = read_ldr()["light"]
        except Exception as exc:
            print("[SEN] ADC error:", exc)
        await asyncio.sleep(1)


async def publish_loop():
    """Publish all sensor readings every SENSOR_INTERVAL seconds."""
    global _connected
    # Stagger slightly so mqtt_loop gets the first turn
    await asyncio.sleep(1.2)
    while True:
        if _mqtt_client and _connected:
            payload = json.dumps({
                "temperature": _sensor_cache["temperature"],
                "humidity":    _sensor_cache["humidity"],
                "soil":        _sensor_cache["soil"],
                "light":       _sensor_cache["light"],
                "actuators":   get_state(),
                "uptime_ms":   time.ticks_ms(),
            }).encode()
            try:
                _mqtt_client.publish(T_SENSORS, payload)
            except Exception as exc:
                print("[MQTT] Publish error:", exc)
                _reset_mqtt_client("publish error")
        await asyncio.sleep(SENSOR_INTERVAL)


async def mqtt_loop():
    """
    Poll for incoming commands every 100 ms.
    check_msg() is safe here because we called sock.settimeout(0)
    in mqtt_connect() — it returns immediately with no data waiting
    instead of blocking the event loop.
    """
    global _connected
    await asyncio.sleep(0.3)
    while True:
        if _mqtt_client and _connected:
            try:
                _mqtt_client.check_msg()
            except Exception as exc:
                print("[MQTT] check_msg error:", exc)
                _reset_mqtt_client("check_msg error")
        await asyncio.sleep(0.1)


async def watchdog_loop():
    """Reconnect WiFi and/or MQTT if either drops. Runs every 15 s."""
    global _connected
    while True:
        await asyncio.sleep(15)

        if not _wifi.isconnected():
            print("[WDG] WiFi lost — reconnecting")
            _connected = False
            wifi_connect()

        if not _connected and _wifi.isconnected():
            print("[WDG] MQTT lost — reconnecting")
            mqtt_connect()
        elif _connected:
            # Keepalive ping
            try:
                _mqtt_client.ping()
            except Exception as exc:
                print("[WDG] Ping failed:", exc)
                _reset_mqtt_client("ping failure")


# ═════════════════════════════════════════════════════════════
#  BOOT + ENTRY POINT
# ═════════════════════════════════════════════════════════════

async def main():
    print()
    print("=" * 48)
    print("  GreenMind Firmware  —  ESP32-S3")
    print("=" * 48)

    # 1. Actuators
    print("[BOOT] Initialising actuators...")
    try:
        init_actuators()
    except Exception as exc:
        print("[BOOT] Actuator init error (continuing):", exc)

    # 2. WiFi
    print("[BOOT] Connecting WiFi...")
    wifi_connect()

    # 3. MQTT  — retry up to 3 times before giving up at boot
    print("[BOOT] Connecting MQTT...")
    for attempt in range(1, 4):
        if mqtt_connect():
            break
        print("[BOOT] MQTT attempt", attempt, "failed — retrying in 3 s")
        if attempt < 3:
            time.sleep(3)
    if not _connected:
        print("[BOOT] MQTT unavailable — running sensor-only mode")

    print("[BOOT] Launching tasks...")
    print()

    await asyncio.gather(
        dht_loop(),
        fast_sensor_loop(),
        publish_loop(),
        mqtt_loop(),
        watchdog_loop(),
    )


try:
    asyncio.run(main())
except Exception as _e:
    import io as _io, traceback as _tb
    _buf = _io.StringIO()
    _tb.print_exception(type(_e), _e, _e.__traceback__, file=_buf)
    print("\n[FATAL]\n" + _buf.getvalue())
    print("Halted. Reset the board after fixing the error above.")
    while True:
        time.sleep(5)