from time import sleep
from machine import Pin, PWM

FAN = PWM(Pin(6), freq=25000)
#kosm stem

while True:
    try:
        FAN.duty(512) # duty between 0-1024
        print("ON")
        print("SPEED 50%")
        sleep(20)
        FAN.duty(1023)
        print("SPEED 100%")
        sleep(10)
        FAN.duty(0)
        print("OFF")
        sleep(5)
    except KeyboardInterrupt:
        FAN.duty(0)
        print("Shutting Down System")
        break