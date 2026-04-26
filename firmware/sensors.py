# ─────────────────────────────────────────────────────────────
#  sensors.py  —  Sensor initialisation and reading functions
#
#  Sensors:
#    GPIO 4  → LDR module  (ADC1_CH3)
#    GPIO 5  → Soil moisture capacitive module AO  (ADC1_CH4)
#    GPIO 7  → DHT22 temperature + humidity
#
#  All on ADC1 — safe to read while WiFi/MQTT is active.
# ─────────────────────────────────────────────────────────────

from machine import Pin, ADC
import dht as _dht
from config import SOIL_DRY_RAW, SOIL_WET_RAW

# ── Hardware objects ──────────────────────────────────────────
_dht22    = _dht.DHT22(Pin(7))

_soil_adc = ADC(Pin(5))
_soil_adc.atten(ADC.ATTN_11DB)     # 0 – 3.3 V full range
_soil_adc.width(ADC.WIDTH_12BIT)   # 0 – 4095 resolution

_ldr_adc  = ADC(Pin(4))
_ldr_adc.atten(ADC.ATTN_11DB)
_ldr_adc.width(ADC.WIDTH_12BIT)

# ── Last known good readings (returned on error) ──────────────
_last = {
    "temperature": None,
    "humidity":    None,
    "soil":        None,
    "light":       None,
}


# ─────────────────────────────────────────────────────────────
#  Individual readers
# ─────────────────────────────────────────────────────────────

def read_dht22() -> dict:
    """
    Read temperature (°C) and relative humidity (%).
    DHT22 needs at least 2 s between calls — enforced by the
    async loop in main.py (dht_loop sleeps 2 s).

    Returns:
        {
          "temperature": float | None,
          "humidity":    float | None,
          "dht_ok":      bool
        }
    """
    try:
        _dht22.measure()
        t = _dht22.temperature()
        h = _dht22.humidity()
        _last["temperature"] = t
        _last["humidity"]    = h
        return {"temperature": t, "humidity": h, "dht_ok": True}
    except OSError as e:
        # Common causes: missing pull-up, wiring issue, called too fast
        print(f"[SEN] DHT22 error: {e}")
        return {
            "temperature": _last["temperature"],
            "humidity":    _last["humidity"],
            "dht_ok":      False,
        }


def read_soil() -> dict:
    """
    Read soil moisture as a 0–100 % value.
    Calibrated using SOIL_DRY_RAW / SOIL_WET_RAW from config.py.

    Returns:
        {
          "soil":     float  (0.0 = bone dry, 100.0 = saturated)
          "soil_raw": int    raw ADC value for diagnostics
        }
    """
    raw = _soil_adc.read()
    pct = (SOIL_DRY_RAW - raw) / (SOIL_DRY_RAW - SOIL_WET_RAW) * 100
    pct = round(max(0.0, min(100.0, pct)), 1)
    _last["soil"] = pct
    return {"soil": pct, "soil_raw": raw}


def read_ldr() -> dict:
    """
    Read light intensity from LDR module AO pin.
    Returns a 0–100 % value (0 = dark, 100 = maximum light).
    The module's built-in voltage divider is already on-board —
    no external resistor needed.

    Returns:
        {
          "light":     float  (0.0 – 100.0 %)
          "light_raw": int    raw ADC value for diagnostics
        }
    """
    raw = _ldr_adc.read()
    pct = round(raw / 4095 * 100, 1)
    _last["light"] = pct
    return {"light": pct, "light_raw": raw}


# ─────────────────────────────────────────────────────────────
#  Combined reader — returns all sensors in one dict
# ─────────────────────────────────────────────────────────────

def read_all() -> dict:
    """
    Read DHT22 + soil + LDR and merge into a single flat dict.
    Safe to call any time — DHT22 errors return last known value.

    Returns:
        {
          "temperature": float | None,
          "humidity":    float | None,
          "soil":        float,
          "soil_raw":    int,
          "light":       float,
          "light_raw":   int,
          "dht_ok":      bool,
        }
    """
    result = {}
    result.update(read_dht22())
    result.update(read_soil())
    result.update(read_ldr())
    return result


def last_readings() -> dict:
    """Return the most recent valid readings without triggering new hardware reads."""
    return dict(_last)
