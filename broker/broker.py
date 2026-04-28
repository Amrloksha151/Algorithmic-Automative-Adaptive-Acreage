import asyncio
from amqtt.broker import Broker


tcp_port = 1883
ws_port = 8883

config = {
    "listeners": {
        "default": {
            "type": "tcp",
            "max_connections": 5,
            "bind": f"0.0.0.0:{tcp_port}"
        },
        "ws": {
            "type": "ws",
            "max_connections": 5,
            "bind": f"0.0.0.0:{ws_port}",
            "ssl": False,
        }
    },
    "plugins": [
        {
            "amqtt.plugins.authentication.AnonymousAuthPlugin": {
                "allow_anonymous": True
            }
        }
    ]
}

async def main():
    broker = Broker(config)
    try:
        await broker.start()
        print(f"MQTT TCP Server Listening on mqtt://192.168.0.49:{tcp_port}\nWeb Socket Server Listening on ws://192.168.0.49:{ws_port}")
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await broker.shutdown()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Exiting...")