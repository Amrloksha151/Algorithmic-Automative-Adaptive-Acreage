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
from config import (
    SOIL_DRY_RAW,
    SOIL_WET_RAW,
    LDR_FIXED_RESISTOR_OHM,
    LDR_LUX_K,
    LDR_LUX_GAMMA,
    LDR_MIN_LUX,
    LDR_MAX_LUX,
    LDR_ADC_DARK_CLAMP,
    LDR_ADC_BRIGHT_CLAMP,
)

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
    Estimate PAR from the LDR module AO pin.

    The ADC reading is still converted to an illuminance estimate first, but the
    returned values are expressed as photosynthetic metrics:
    - light_instant: estimated PPFD in umol/m^2/s
    - light: estimated daily light integral in mol/m^2/day
    - light_area_mol: daily PAR for the planted area in mol/day

    This is an approximation because lux-to-PAR depends on spectrum. The
    coefficient below is tuned for mixed daylight and white LED light.
    The module's built-in voltage divider is already on-board —
    no external resistor needed.

    Returns:
        {
          "light":          float  estimated DLI in mol/m^2/day
          "light_instant":   float  estimated PPFD in umol/m^2/s
          "light_lux":      float  intermediate illuminance estimate in lux
          "light_area_mol":  float  estimated daily PAR for 0.25 m^2 in mol/day
          "light_raw":      int    raw ADC value for diagnostics
        }
    """
    import time

    if not hasattr(read_ldr, "_state"):
        read_ldr._state = {
            "last_ms": None,
            "window_start_ms": None,
            "dli_mol_m2": 0.0,
        }

    state = read_ldr._state

    raw = _ldr_adc.read()
    adc = max(0, min(4095, raw))

    if adc <= LDR_ADC_BRIGHT_CLAMP:
        lux = LDR_MAX_LUX
    elif adc >= LDR_ADC_DARK_CLAMP:
        lux = LDR_MIN_LUX
    else:
        v_out = adc * 3.3 / 4095.0
        # Divider model: fixed resistor to 3.3 V, LDR to GND.
        r_ldr = LDR_FIXED_RESISTOR_OHM * v_out / (3.3 - v_out)
        lux = LDR_LUX_K * (r_ldr ** (-LDR_LUX_GAMMA))
        lux = max(LDR_MIN_LUX, min(LDR_MAX_LUX, lux))

    lux = round(lux, 1)

    # Approximate lux-to-PPFD conversion for mixed daylight + white LED.
    # Typical broad-spectrum white light is about 55-60 lux per umol/m^2/s.
    # Use a conservative midpoint and keep it local so it can be tuned later.
    ppfd = lux / 58.0 if lux > 0 else 0.0

    now_ms = time.ticks_ms()
    last_ms = state["last_ms"]
    window_start_ms = state["window_start_ms"]

    if window_start_ms is None:
        state["window_start_ms"] = now_ms
        window_start_ms = now_ms

    elapsed_ms = time.ticks_diff(now_ms, window_start_ms)
    if elapsed_ms < 0:
        elapsed_ms = 0

    if elapsed_ms >= 86400000:
        state["dli_mol_m2"] = 0.0
        state["window_start_ms"] = now_ms
        state["last_ms"] = now_ms
        _last["light"] = 0.0
        return {
            "light": 0.0,
            "light_instant": round(ppfd, 2),
            "light_lux": lux,
            "light_area_mol": 0.0,
            "light_raw": raw,
        }

    if last_ms is None:
        delta_ms = 0
    else:
        delta_ms = time.ticks_diff(now_ms, last_ms)
        if delta_ms < 0:
            delta_ms = 0

    state["dli_mol_m2"] += ppfd * (delta_ms / 1000.0) / 1000000.0
    state["last_ms"] = now_ms

    dli_mol_m2 = round(state["dli_mol_m2"], 4)
    area_m2 = 0.25
    light_area_mol = round(dli_mol_m2 * area_m2, 4)

    _last["light"] = dli_mol_m2
    return {
        "light": dli_mol_m2,
        "light_instant": round(ppfd, 2),
        "light_lux": lux,
        "light_area_mol": light_area_mol,
        "light_raw": raw,
    }


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
