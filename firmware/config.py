# ─────────────────────────────────────────────────────────────
#  config.py  —  GreenMind ESP32-S3 Firmware Configuration
#  Fill in your values here. Do NOT commit secrets to git.
# ─────────────────────────────────────────────────────────────

# ── WiFi ──────────────────────────────────────────────────────
WIFI_SSID     = "YOUR_SSID"
WIFI_PASSWORD = "YOUR_PASSWORD"

# ── MQTT broker ───────────────────────────────────────────────
MQTT_BROKER   = "broker.hivemq.com"   # or your local broker IP
MQTT_PORT     = 1883
MQTT_CLIENT_ID= "greenmind-esp32s3"

# Topic prefix — must match your React dashboard setting
TOPIC_PREFIX  = "greenhouse"

# Leave empty strings if your broker needs no auth
MQTT_USER     = ""
MQTT_PASSWORD = ""

# ── Sensor calibration ────────────────────────────────────────
# Run calibration routine once to find these values for your sensor
SOIL_DRY_RAW  = 3200   # raw ADC when sensor is in dry air
SOIL_WET_RAW  =  900   # raw ADC when sensor is submerged in water

# ── Publish interval (seconds) ────────────────────────────────
SENSOR_INTERVAL = 1    # publish sensor readings every N seconds
