# ─────────────────────────────────────────────────────────────
#  actuators.py  —  Actuator registry + control functions
#
#  To add a new component:
#    1. Add an entry to ACTUATORS dict below
#    2. That's it — set_pwm() and set_digital() handle the rest
#
#  Dict schema:
#    "name": {
#        "pin":  GPIO pin number (int)
#        "type": "pwm"     → variable speed/brightness via PWM
#                "digital" → simple ON/OFF (relay, simple pump)
#        "freq": PWM frequency in Hz (only required for type="pwm")
#        "invert": True if the output is active-LOW (relay modules)
#                  False (default) for active-HIGH (MOSFETs)
#    }
# ─────────────────────────────────────────────────────────────

from machine import Pin, PWM

# ── Actuator Registry ─────────────────────────────────────────
ACTUATORS = {
    # PWM-controlled devices
    "cooling_fan": {
        "pin":    6,
        "type":   "pwm",
        "freq":   25000,    # 25 kHz — inaudible, ideal for PC fans
        "invert": False,
    },
    "ventilation_fan": {
        "pin":    16,
        "type":   "pwm",
        "freq":   25000,    # 25 kHz — inaudible, ideal for PC fans
        "invert": False,
    },
    "pump_12v": {
        "pin":    18,
        "type":   "pwm",
        "freq":   1000,     # 1 kHz — suitable for DC pumps via MOSFET
        "invert": False,
    },

    # Digital ON/OFF devices
    "pump_5v": {
        "pin":    15,
        "type":   "digital",
        "invert": False,    # MOSFET: HIGH = ON
    },

    "mist_maker": {
        "pin":    17,
        "type":   "digital",
        "invert": True,     # relay module: LOW = ON
    },

    "led_strip": {
        "pin":    13,
        "type":   "pwm",
        "freq":   1000,
        "invert": False,
    },
}

# ── Internal state ─────────────────────────────────────────────
# Holds initialised Pin / PWM objects and current values
_handles = {}     # { name: Pin | PWM }
_state   = {}     # { name: int }   0–100 for pwm, 0/1 for digital


def init_actuators():
    """
    Call once at boot. Initialises all pins/PWM objects
    and sets everything to OFF (safe default).
    """
    for name, cfg in ACTUATORS.items():
        if cfg["type"] == "pwm":
            pwm = PWM(Pin(cfg["pin"]), freq=cfg["freq"], duty=0)
            _handles[name] = pwm
            _state[name]   = 0
            print(f"[ACT] PWM     {name:20s} → GPIO {cfg['pin']}  {cfg['freq']} Hz")

        elif cfg["type"] == "digital":
            # Start in OFF state (respecting invert flag)
            init_val = 1 if cfg.get("invert", False) else 0
            pin = Pin(cfg["pin"], Pin.OUT, value=init_val)
            _handles[name] = pin
            _state[name]   = 0
            print(f"[ACT] Digital {name:20s} → GPIO {cfg['pin']}")


def set_pwm(name: str, percent: int) -> dict:
    """
    Set a PWM actuator to a duty cycle percentage.

    Args:
        name:    actuator name (must exist in ACTUATORS with type="pwm")
        percent: 0–100  (0 = off, 100 = full speed/brightness)

    Returns:
        {"ok": True,  "name": name, "value": percent}
        {"ok": False, "error": "reason"}
    """
    if name not in ACTUATORS:
        return {"ok": False, "error": f"Unknown actuator: {name}"}

    cfg = ACTUATORS[name]
    if cfg["type"] != "pwm":
        return {"ok": False,
                "error": f"{name} is type '{cfg['type']}', use set_digital()"}

    percent = max(0, min(100, int(percent)))
    duty    = int(percent * 1023 / 100)   # MicroPython duty: 0–1023

    if cfg.get("invert", False):
        duty = 1023 - duty

    _handles[name].duty(duty)
    _state[name] = percent
    print(f"[ACT] {name} → {percent}%  (duty={duty})")
    return {"ok": True, "name": name, "value": percent}


def set_digital(name: str, on: bool) -> dict:
    """
    Turn a digital actuator ON or OFF.

    Args:
        name: actuator name (must exist in ACTUATORS with type="digital")
        on:   True = ON, False = OFF

    Returns:
        {"ok": True,  "name": name, "value": 1|0}
        {"ok": False, "error": "reason"}
    """
    if name not in ACTUATORS:
        return {"ok": False, "error": f"Unknown actuator: {name}"}

    cfg = ACTUATORS[name]
    if cfg["type"] != "digital":
        return {"ok": False,
                "error": f"{name} is type '{cfg['type']}', use set_pwm()"}

    # Respect active-LOW invert flag
    pin_val = (0 if on else 1) if cfg.get("invert", False) else (1 if on else 0)
    _handles[name].value(pin_val)
    _state[name] = 1 if on else 0
    print(f"[ACT] {name} → {'ON' if on else 'OFF'}  (pin={pin_val})")
    return {"ok": True, "name": name, "value": 1 if on else 0}


def set_actuator(name: str, value) -> dict:
    """
    Universal control function — routes to set_pwm or set_digital
    automatically based on the actuator's registered type.

    Args:
        name:  actuator name
        value: int 0–100  for pwm
               bool / int 0 or 1  for digital

    Returns:
        result dict from set_pwm() or set_digital()
    """
    if name not in ACTUATORS:
        return {"ok": False, "error": f"Unknown actuator: {name}"}

    cfg = ACTUATORS[name]
    if cfg["type"] == "pwm":
        return set_pwm(name, int(value))
    else:
        return set_digital(name, bool(int(value)))


def get_state() -> dict:
    """Return current state snapshot of all actuators."""
    return dict(_state)


def all_off():
    """Emergency stop — turn everything off."""
    for name, cfg in ACTUATORS.items():
        if cfg["type"] == "pwm":
            set_pwm(name, 0)
        else:
            set_digital(name, False)
    print("[ACT] All actuators OFF")
