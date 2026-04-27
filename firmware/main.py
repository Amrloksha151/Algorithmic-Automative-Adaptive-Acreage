# ─────────────────────────────────────────────────────────────
#  main.py  —  GreenMind ESP32-S3 Firmware
#
#  Architecture:
#    Async tasks run concurrently on a single thread (uasyncio).
#    The ESP32-S3 dual-core is used by scheduling all tasks on
#    Core 0 via asyncio.gather — each task yields at await so
#    others can run without blocking.
#
#  Tasks:
#    wifi_connect()       boot — blocks until connected
#    mqtt_connect()       boot — connects to broker, sets LWT
#    sensor_loop()        reads DHT22 every 2 s (hardware limit)
#    fast_sensor_loop()   reads soil + LDR every 1 s
#    publish_loop()       publishes all readings every SENSOR_INTERVAL s
#    mqtt_loop()          polls for incoming MQTT commands every 100 ms
#    watchdog_loop()      reconnects WiFi/MQTT if connection drops
#
#  MQTT Topics:
#    Publish  → {PREFIX}/sensors           JSON sensor payload
#    Publish  → {PREFIX}/status            "online" / "offline" (LWT)
#    Publish  → {PREFIX}/actuators/state   actuator state snapshot
#    Subscribe→ {PREFIX}/commands          JSON command from server/AI
#
#  Command payload from server:
#    { "device": "cooling_fan",  "value": 80, "mode": "manual" }
#    { "device": "pump_5v",      "value": 1,  "mode": "manual" }
#    { "device": "pump_5v",      "value": 0,  "mode": "autonomous" }
#    { "device": "__all_off__",  "value": 1,  "mode": "safety" }
# ─────────────────────────────────────────────────────────────

import asyncio
import json
import time
import network
from umqtt.simple import MQTTClient

from config   import (WIFI_SSID, WIFI_PASSWORD,
                      MQTT_BROKER, MQTT_PORT, MQTT_CLIENT_ID,
                      MQTT_USER, MQTT_PASSWORD,
                      TOPIC_PREFIX, SENSOR_INTERVAL)
from sensors  import read_dht22, read_soil, read_ldr, read_all
from actuators import (init_actuators, set_actuator, get_state, all_off)

# ── Topic helpers ─────────────────────────────────────────────
T_SENSORS = f"{TOPIC_PREFIX}/sensors".encode()
T_STATUS  = f"{TOPIC_PREFIX}/status".encode()
T_ACT_ST  = f"{TOPIC_PREFIX}/actuators/state".encode()
T_CMD     = f"{TOPIC_PREFIX}/commands".encode()

# ── Shared state ──────────────────────────────────────────────
_sensor_cache = {
    "temperature": None,
    "humidity":    None,
    "soil":        None,
    "light":       None,
}
_mqtt_client  = None
_wifi         = None
_connected    = False   # True when both WiFi + MQTT are up


# ═════════════════════════════════════════════════════════════
#  WIFI
# ═════════════════════════════════════════════════════════════

def wifi_connect():
    """
    Blocking WiFi connection at boot.
    Retries indefinitely — device is useless without network.
    """
    global _wifi
    _wifi = network.WLAN(network.STA_IF)
    _wifi.active(True)

    if _wifi.isconnected():
        print(f"[NET] Already connected: {_wifi.ifconfig()[0]}")
        return

    print(f"[NET] Connecting to '{WIFI_SSID}' ", end="")
    _wifi.connect(WIFI_SSID, WIFI_PASSWORD)

    deadline = time.time() + 30   # 30 s timeout then retry
    while not _wifi.isconnected():
        if time.time() > deadline:
            print("\n[NET] Timeout — retrying")
            _wifi.connect(WIFI_SSID, WIFI_PASSWORD)
            deadline = time.time() + 30
        print(".", end="")
        time.sleep(0.5)

    ip = _wifi.ifconfig()[0]
    print(f"\n[NET] Connected  IP={ip}")


# ═════════════════════════════════════════════════════════════
#  MQTT
# ═════════════════════════════════════════════════════════════

def _on_command(topic, msg):
    """
    MQTT callback — fires when a message arrives on T_CMD.
    Parses JSON command and calls set_actuator().

    Expected payload:
        { "device": "<name>", "value": <int>, "mode": "manual|autonomous", "reason": "..." }
    """
    try:
        payload = json.loads(msg.decode())
        device  = payload.get("device", "")
        value   = payload.get("value",  0)
        mode    = payload.get("mode", "manual")
        reason  = payload.get("reason", "")

        print(f"[CMD] mode={mode} device={device} value={value} reason={reason}")

        # Special command: emergency stop everything
        if device == "__all_off__":
            all_off()
            _publish_actuator_state()
            return

        result = set_actuator(device, value)

        if result["ok"]:
            _publish_actuator_state()
        else:
            print(f"[CMD] Error: {result['error']}")

    except Exception as e:
        print(f"[CMD] Parse error: {e}  raw={msg}")


def mqtt_connect():
    """
    Connect to the MQTT broker, set Last Will Testament,
    and subscribe to the commands topic.
    """
    global _mqtt_client, _connected

    client = MQTTClient(
        client_id = MQTT_CLIENT_ID,
        server    = MQTT_BROKER,
        port      = MQTT_PORT,
        user      = MQTT_USER     or None,
        password  = MQTT_PASSWORD or None,
        keepalive = 60,
    )

    # Last Will — published automatically by broker if we disconnect
    client.set_last_will(
        topic   = T_STATUS,
        msg     = b"offline",
        retain  = True,
        qos     = 1,
    )

    client.set_callback(_on_command)
    client.connect()
    client.subscribe(T_CMD)

    # Announce online
    client.publish(T_STATUS, b"online", retain=True, qos=1)

    _mqtt_client = client
    _connected   = True
    print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
    print(f"[MQTT] Subscribed  → {T_CMD.decode()}")
    print(f"[MQTT] Publishing  → {T_SENSORS.decode()}")


def _publish_actuator_state():
    """Publish current actuator state snapshot."""
    if _mqtt_client and _connected:
        try:
            _mqtt_client.publish(
                T_ACT_ST,
                json.dumps(get_state()).encode(),
                retain=True,
            )
        except Exception as e:
            print(f"[MQTT] Actuator state publish error: {e}")


# ═════════════════════════════════════════════════════════════
#  ASYNC TASKS
# ═════════════════════════════════════════════════════════════

async def dht_loop():
    """
    Read DHT22 every 2 s.
    DHT22 hardware limitation: minimum 2 s between measurements.
    Updates _sensor_cache in place.
    """
    while True:
        result = read_dht22()
        if result["dht_ok"]:
            _sensor_cache["temperature"] = result["temperature"]
            _sensor_cache["humidity"]    = result["humidity"]
        await asyncio.sleep(2)


async def fast_sensor_loop():
    """
    Read soil moisture and LDR every 1 s.
    These are ADC reads — fast, no timing constraints.
    """
    while True:
        soil = read_soil()
        ldr  = read_ldr()
        _sensor_cache["soil"]  = soil["soil"]
        _sensor_cache["light"] = ldr["light"]
        await asyncio.sleep(1)


async def publish_loop():
    """
    Publish all sensor readings to MQTT every SENSOR_INTERVAL seconds.
    Also includes actuator state so the dashboard always has full context.
    """
    while True:
        if _mqtt_client and _connected:
            payload = {
                # Sensor readings
                "temperature": _sensor_cache["temperature"],
                "humidity":    _sensor_cache["humidity"],
                "soil":        _sensor_cache["soil"],
                "light":       _sensor_cache["light"],
                # Actuator state (snapshot)
                "actuators":   get_state(),
                # Timestamp (ms since boot — useful for ordering)
                "uptime_ms":   time.ticks_ms(),
            }
            try:
                _mqtt_client.publish(T_SENSORS, json.dumps(payload).encode())
            except Exception as e:
                print(f"[MQTT] Publish error: {e}")

        await asyncio.sleep(SENSOR_INTERVAL)


async def mqtt_loop():
    """
    Poll for incoming MQTT messages every 100 ms.
    check_msg() is non-blocking — fires _on_command if a message
    is waiting, otherwise returns immediately.
    """
    while True:
        if _mqtt_client and _connected:
            try:
                _mqtt_client.check_msg()
            except Exception as e:
                print(f"[MQTT] check_msg error: {e}")
                # Will be reconnected by watchdog_loop
        await asyncio.sleep(0.1)


async def watchdog_loop():
    """
    Check WiFi + MQTT health every 10 s.
    Reconnects automatically if either drops — essential for a
    device that must run unattended in a greenhouse.
    """
    global _connected
    while True:
        await asyncio.sleep(10)

        # WiFi check
        if not _wifi.isconnected():
            print("[WDG] WiFi lost — reconnecting")
            _connected = False
            wifi_connect()

        # MQTT check — ping the broker
        if _connected:
            try:
                _mqtt_client.ping()
            except Exception as e:
                print(f"[WDG] MQTT lost ({e}) — reconnecting")
                _connected = False
                try:
                    mqtt_connect()
                except Exception as me:
                    print(f"[WDG] MQTT reconnect failed: {me}")


async def serial_loop():
    """
    Optional local UART debug interface.
    Accepts commands typed in Thonny / mpremote / PuTTY.

    Commands:
        status            print all sensor + actuator state
        set <name> <val>  control an actuator  e.g. "set cooling_fan 80"
        off               all_off() emergency stop
        calibrate         print raw soil ADC for calibration
    """
    from machine import UART, Pin as _Pin
    uart = UART(1, baudrate=115200, tx=_Pin(43), rx=_Pin(44))
    uart.write(b"\r\n[GreenMind] Serial ready. Type 'status' for info.\r\n>> ")
    buf = b""

    while True:
        if uart.any():
            ch = uart.read(1)
            if ch in (b"\r", b"\n"):
                cmd = buf.decode().strip()
                buf = b""
                uart.write(b"\r\n")

                if cmd == "status":
                    out = {
                        "sensors":   dict(_sensor_cache),
                        "actuators": get_state(),
                        "wifi":      _wifi.ifconfig()[0] if _wifi.isconnected() else "offline",
                        "mqtt":      "connected" if _connected else "disconnected",
                    }
                    uart.write(json.dumps(out).encode() + b"\r\n")

                elif cmd.startswith("set "):
                    parts = cmd.split()
                    if len(parts) == 3:
                        r = set_actuator(parts[1], parts[2])
                        uart.write(json.dumps(r).encode() + b"\r\n")
                    else:
                        uart.write(b"Usage: set <name> <value>\r\n")

                elif cmd == "off":
                    all_off()
                    uart.write(b"All actuators OFF\r\n")

                elif cmd == "calibrate":
                    from machine import ADC, Pin as _Pin2
                    adc = ADC(_Pin2(5))
                    adc.atten(ADC.ATTN_11DB)
                    uart.write(f"Soil raw ADC = {adc.read()}\r\n".encode())

                elif cmd:
                    uart.write(f"Unknown: {cmd}\r\n".encode())

                uart.write(b">> ")
            elif ch == b"\x08":   # backspace
                buf = buf[:-1]
            else:
                buf += ch
                uart.write(ch)   # echo

        await asyncio.sleep(0.05)


# ═════════════════════════════════════════════════════════════
#  BOOT SEQUENCE + MAIN
# ═════════════════════════════════════════════════════════════

async def main():
    print("\n" + "="*48)
    print("  GreenMind Firmware  —  ESP32-S3")
    print("="*48)

    # 1. Initialise all actuator pins (safe OFF state)
    print("[BOOT] Initialising actuators...")
    init_actuators()

    # 2. Connect WiFi (blocking — device needs network)
    print("[BOOT] Connecting to WiFi...")
    wifi_connect()

    # 3. Connect MQTT broker
    print("[BOOT] Connecting to MQTT broker...")
    mqtt_connect()

    # 4. Warm up sensors — take one reading before entering loops
    print("[BOOT] Warming up sensors...")
    time.sleep(2)   # DHT22 needs 1–2 s after power-on before first read
    result = read_all()
    _sensor_cache.update({
        "temperature": result.get("temperature"),
        "humidity":    result.get("humidity"),
        "soil":        result.get("soil"),
        "light":       result.get("light"),
    })
    print(f"[BOOT] Initial readings: {_sensor_cache}")

    print("[BOOT] Starting async tasks...\n")

    # 5. Run all tasks concurrently
    await asyncio.gather(
        dht_loop(),           # DHT22 every 2 s
        fast_sensor_loop(),   # Soil + LDR every 1 s
        publish_loop(),       # Publish to MQTT every SENSOR_INTERVAL s
        mqtt_loop(),          # Poll MQTT commands every 100 ms
        watchdog_loop(),      # Health check + reconnect every 10 s
        serial_loop(),        # Local debug UART interface
    )


# Entry point
asyncio.run(main())
