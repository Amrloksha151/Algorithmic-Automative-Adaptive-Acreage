from time import sleep
from machine import Pin, ADC

sensor = ADC(Pin(5))

def main():
    while True:
        try:
            raw = sensor.read()
            print(f"Raw ADC: {raw}")
            sleep(1)
        except KeyboardInterrupt:
            print("Shutting down")
            break

if __name__ == '__main__':
    main()