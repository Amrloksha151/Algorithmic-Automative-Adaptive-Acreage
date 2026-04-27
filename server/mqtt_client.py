import json
import threading
import time
from typing import Callable
import paho.mqtt.client as mqtt
from .config import MQTT_BROKER, MQTT_PORT, SENSORS_TOPIC, CMD_TOPIC
from . import db

_client: mqtt.Client = None
_on_telemetry: Callable[[dict], None] = None


def _on_connect(client, userdata, flags, rc):
    print(f"[MQTT] connected rc={rc}")
    client.subscribe(SENSORS_TOPIC)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception as e:
        print(f"[MQTT] failed to parse message: {e}")
        return

    # write to DB and call optional callback
    try:
        # async call to DB via background thread
        threading.Thread(target=lambda: db.run(db.write_event('telemetry', payload, source='mqtt'))).start()
    except Exception as e:
        print(f"[MQTT] db write failed: {e}")

    if _on_telemetry:
        try:
            _on_telemetry(payload)
        except Exception:
            pass


def setup(on_telemetry: Callable[[dict], None] = None):
    global _client, _on_telemetry
    _on_telemetry = on_telemetry
    _client = mqtt.Client()
    _client.on_connect = _on_connect
    _client.on_message = _on_message
    _client.connect(MQTT_BROKER, MQTT_PORT)
    threading.Thread(target=_client.loop_forever, daemon=True).start()
    print(f"[MQTT] client started -> {MQTT_BROKER}:{MQTT_PORT}")


def publish_command(device: str, value, mode: str = 'autonomous', reason: str = ''):
    if not _client:
        raise RuntimeError('MQTT client not initialized')
    payload = json.dumps({
        'device': device,
        'value': value,
        'mode': mode,
        'reason': reason,
        'timestamp': int(time.time() * 1000),
    })
    _client.publish(CMD_TOPIC, payload)
    # Also write the command event to DB asynchronously
    threading.Thread(target=lambda: db.run(db.write_event('command', {'device': device, 'value': value}, reason=reason, source='orchestrator'))).start()
