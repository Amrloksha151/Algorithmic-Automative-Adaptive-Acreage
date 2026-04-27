import os
from typing import List

MQTT_BROKER = os.getenv('MQTT_BROKER', '127.0.0.1')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
TOPIC_PREFIX = os.getenv('TOPIC_PREFIX', 'greenhouse')

# autonomy interval in minutes (can still be set via env for deployment convenience)
AUTONOMY_INTERVAL_MIN = int(os.getenv('AUTONOMY_INTERVAL_MIN', '30'))

# MQTT topics
CMD_TOPIC = f"{TOPIC_PREFIX}/commands"
SENSORS_TOPIC = f"{TOPIC_PREFIX}/sensors"
ACTUATOR_STATE_TOPIC = f"{TOPIC_PREFIX}/actuators/state"
STATUS_TOPIC = f"{TOPIC_PREFIX}/status"
