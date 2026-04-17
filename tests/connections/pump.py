from machine import Pin
from time import sleep

PUMP = Pin(3, Pin.OUT)

while True:
    try:
        PUMP.value(1)
        print("ON")
        sleep(10)
        PUMP.value(0)
        print("OFF")
        sleep(10)
    except KeyboardInterrupt:
        PUMP.value(0)
        print("Shutting Down Machine")
        break