from time import sleep
from machine import Pin
import dht


def read_sensor(sensor):
    try:
        sensor.measure()
        return {
            "temperature": sensor.temperature(),
            "humidity": sensor.humidity(),
            "status": "success"
        }
    except Exception as e:
        print("Error: DHT22 failed!", e)
        return {
            "temperature": None,
            "humidity": None,
            "status": "failed"
        }

def main():
    temp_sensor = dht.DHT22(Pin(17))
    while True:
        try:
            results = read_sensor(temp_sensor)
            print(f"Temp: {results["temperature"]} | RH: {results["humidity"]} | Stat: {results["status"]}")
            sleep(10)
        except KeyboardInterrupt:
            print("Shutting Down")
            break

if __name__ == '__main__':
    main()
