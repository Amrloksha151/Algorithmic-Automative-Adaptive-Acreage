import socket
import asyncio
from amqtt.broker import Broker

tcp_port = input("MQTT Default Port: ")
ws_port = input("MQTT WebSocket Port: ")

ip_addr = socket.gethostbyname(socket.gethostname())

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
            "bind": f"0.0.0.0:{ws_port}"
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
        print(f"MQTT TCP Server Listening on http://{ip_addr}:{tcp_port}\nWeb Socket Server Listening on http://{ip_addr}:{ws_port}")
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await broker.shutdown()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Exiting...")