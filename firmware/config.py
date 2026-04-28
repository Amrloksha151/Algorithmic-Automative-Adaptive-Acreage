# ─────────────────────────────────────────────────────────────
#  config.py  —  GreenMind ESP32-S3 Firmware Configuration
#  Fill in your values here. Do NOT commit secrets to git.
# ─────────────────────────────────────────────────────────────

# ── WiFi ──────────────────────────────────────────────────────
WIFI_SSID     = "AAAA"
WIFI_PASSWORD = "AAAA@19207"

# ── MQTT broker ───────────────────────────────────────────────
MQTT_BROKER   = "broker.hivemq.com"   # or your local broker IP
MQTT_PORT     = 1883
MQTT_CLIENT_ID= "greenmind-esp32s3"

# Topic prefix — must match your React dashboard setting
TOPIC_PREFIX  = "greenhouse-19207"

# Leave empty strings if your broker needs no auth
MQTT_USER     = ""
MQTT_PASSWORD = ""

# ── Sensor calibration ────────────────────────────────────────
# Run calibration routine once to find these values for your sensor
SOIL_DRY_RAW  = 4095   # raw ADC when sensor is in dry air
SOIL_WET_RAW  =  1300   # raw ADC when sensor is submerged in water

# LDR (AO module) -> lux conversion constants.
# Model: lux = LDR_LUX_K * (R_ldr ** -LDR_LUX_GAMMA)
# Divider assumption: fixed resistor to 3.3 V, LDR to GND, AO at midpoint.
# One-point calibration:
#   1) Put sensor under known illuminance (lux_ref) and read raw ADC.
#   2) Compute Vout and R_ldr with the same equation in sensors.py.
#   3) Update LDR_LUX_K = lux_ref * (R_ldr ** LDR_LUX_GAMMA)
LDR_FIXED_RESISTOR_OHM = 10000.0
LDR_LUX_K              = 280.0
LDR_LUX_GAMMA          = 0.77
LDR_MIN_LUX            = 0.0
LDR_MAX_LUX            = 50000.0
LDR_ADC_DARK_CLAMP     = 4085    # >= this raw ADC is treated as near-dark
LDR_ADC_BRIGHT_CLAMP   = 10      # <= this raw ADC is treated as near-bright saturation

# ── Publish interval (seconds) ────────────────────────────────
SENSOR_INTERVAL = 1    # publish sensor readings every N seconds
