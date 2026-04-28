# diagnostic.py — upload and run via: mpremote connect COM3 run diagnostic.py
import network, socket, time
from umqtt.simple import MQTTClient

WIFI_SSID     = "AAAA"
WIFI_PASSWORD = "AAAA@19207"
BROKER        = "192.168.0.49"
PORT          = 1883

# ── Step 1: WiFi ──────────────────────────────────────────────
print("\n[1] Connecting WiFi...")
w = network.WLAN(network.STA_IF)
w.active(True)
w.connect(WIFI_SSID, WIFI_PASSWORD)
for _ in range(20):
    if w.isconnected(): break
    print(".", end="")
    time.sleep(0.5)

if not w.isconnected():
    print("\nFAIL: WiFi did not connect")
    raise SystemExit

esp_ip = w.ifconfig()[0]
gw     = w.ifconfig()[2]
print(f"\nOK: ESP32 IP={esp_ip}  GW={gw}")

# ── Step 2: TCP reachability ──────────────────────────────────
print(f"\n[2] TCP connect to {BROKER}:{PORT}...")
try:
    ai = socket.getaddrinfo(BROKER, PORT, 0, socket.SOCK_STREAM)
    addr = ai[0][-1]
    s = socket.socket()
    s.settimeout(5)
    s.connect(addr)
    s.close()
    print(f"OK: TCP socket opened and closed cleanly")
except Exception as e:
    print(f"FAIL: {e}")
    print("     → Broker not reachable. Check firewall / broker running / same subnet")
    raise SystemExit

# ── Step 3: Raw MQTT connect (no LWT, no QoS) ─────────────────
print(f"\n[3] Bare MQTT connect (no LWT)...")
try:
    c = MQTTClient("diag-test-001", BROKER, PORT, keepalive=30)
    c.connect()
    print("OK: MQTT connected")
    c.publish(b"diag/test", b"hello", retain=False, qos=0)
    print("OK: Publish succeeded")
    c.disconnect()
    print("OK: Disconnected cleanly")
except Exception as e:
    print(f"FAIL: {e}")
    print("     → Raw MQTT rejected. Likely: broker config / QoS issue / client ID clash")
    raise SystemExit

# ── Step 4: MQTT connect WITH LWT ────────────────────────────
print(f"\n[4] MQTT connect with LWT retain+qos=1...")
try:
    c = MQTTClient("diag-test-002", BROKER, PORT, keepalive=30)
    c.set_last_will(b"diag/status", b"offline", retain=True, qos=1)
    c.connect()
    print("OK: LWT accepted")
    c.disconnect()
except Exception as e:
    print(f"FAIL (LWT qos=1 rejected): {e}")
    print("     → Try qos=0 in set_last_will and publish calls")

# ── Step 5: MQTT connect with real client ID ──────────────────
print(f"\n[5] MQTT connect with production client ID...")
try:
    c = MQTTClient("greenmind-esp32s3", BROKER, PORT, keepalive=60)
    c.connect()
    print("OK: Production client ID accepted")
    c.disconnect()
except Exception as e:
    print(f"FAIL: {e}")
    print("     → Client ID may be in use by another active session")

print("\n── Diagnostic complete ──")