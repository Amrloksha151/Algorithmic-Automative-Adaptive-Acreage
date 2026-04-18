from machine import Pin, PWM
import asyncio

PINS = {
    "pump": PWM(Pin(4), freq=...),
    "cooling_fan": PWM(Pin(8), freq=...)
}

def main():
    ...

if __name__ == '__main__':
    main()