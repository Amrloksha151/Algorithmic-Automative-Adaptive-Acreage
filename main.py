from machine import Pin, PWM
import asyncio

PINS = {
    "pump": 4,
    "cooling_fan": 8,
    "temp_sensor": 17
}

def read_sensor(sensor, sensor_type:str):
    if sensor_type == "dht22":
        pass
    elif sensor_type == "ldr":
        pass
    elif sensor_type == "soil_mist":
        pass
    else:
        pass

def main():
    ...

if __name__ == '__main__':
    main()