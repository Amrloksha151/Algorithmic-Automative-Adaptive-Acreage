"""
Host-side MQTT simulator for GreenMind firmware testing.

What this script does:
- Publishes synthetic sensor values every second to {prefix}/sensors.
- Values stay within requested ranges:
  - light: 10-15
  - temperature: 25-30
  - humidity: 30-50
  - soil: 10-15
- Subscribes to {prefix}/# and prints every message received from broker.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, Tuple

try:
	import paho.mqtt.client as mqtt
except ImportError as exc:  # pragma: no cover - runtime dependency guard
	print("[SIM] Missing dependency: paho-mqtt")
	print("[SIM] Install with: pip install paho-mqtt")
	raise SystemExit(1) from exc


def _load_firmware_defaults() -> Dict[str, Any]:
	"""Load defaults from firmware/config.py when available."""
	firmware_cfg = Path(__file__).resolve().parents[2] / "firmware" / "config.py"
	if not firmware_cfg.exists():
		return {}

	spec = importlib.util.spec_from_file_location("firmware_config", str(firmware_cfg))
	if spec is None or spec.loader is None:
		return {}

	module = importlib.util.module_from_spec(spec)
	try:
		spec.loader.exec_module(module)
	except Exception:
		return {}

	return {
		"host": getattr(module, "MQTT_BROKER", "192.168.0.49"),
		"port": int(getattr(module, "MQTT_PORT", 1883)),
		"prefix": getattr(module, "TOPIC_PREFIX", "greenhouse"),
	}


def _build_topics(prefix: str) -> Tuple[str, str, str]:
	return (
		f"{prefix}/sensors",
		f"{prefix}/status",
		f"{prefix}/#",
	)


def _random_sensor_payload(start_ms: int) -> Dict[str, Any]:
	now_ms = int(time.monotonic() * 1000)
	return {
		"temperature": round(random.uniform(25.0, 30.0), 1),
		"humidity": round(random.uniform(30.0, 50.0), 1),
		"soil": round(random.uniform(10.0, 15.0), 1),
		"light": round(random.uniform(10.0, 15.0), 1),
		"actuators": {
			"cooling_fan": 0,
			"ventilation_fan": 0,
			"led_strip": 0,
			"pump_5v": 0,
			"mist_maker": 0,
			"pump_12v": 0,
		},
		"uptime_ms": max(0, now_ms - start_ms),
	}


def _parse_args(defaults: Dict[str, Any]) -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="MQTT sensor simulator for firmware testing")
	parser.add_argument("--host", default=defaults.get("host", "192.168.0.49"), help="MQTT broker host")
	parser.add_argument("--port", type=int, default=defaults.get("port", 1883), help="MQTT broker port")
	parser.add_argument("--prefix", default=defaults.get("prefix", "greenhouse"), help="Topic prefix")
	parser.add_argument("--interval", type=float, default=1.0, help="Publish interval seconds")
	parser.add_argument("--client-id", default="aaaa-simulator", help="MQTT client ID")
	parser.add_argument("--username", default="", help="MQTT username (optional)")
	parser.add_argument("--password", default="", help="MQTT password (optional)")
	return parser.parse_args()


def main() -> int:
	defaults = _load_firmware_defaults()
	args = _parse_args(defaults)
	sensor_topic, status_topic, subscribe_filter = _build_topics(args.prefix)

	start_ms = int(time.monotonic() * 1000)

	def on_connect(client: mqtt.Client, _userdata: Any, _flags: Dict[str, Any], rc: int) -> None:
		if rc != 0:
			print(f"[SIM] Connect failed with rc={rc}")
			return

		print(f"[SIM] Connected to {args.host}:{args.port} as {args.client_id}")
		sub_result = client.subscribe(subscribe_filter, qos=0)
		print(f"[SIM] Subscribed to {subscribe_filter}: {sub_result}")
		client.publish(status_topic, payload="online", qos=0, retain=True)

	def on_disconnect(_client: mqtt.Client, _userdata: Any, rc: int) -> None:
		if rc == 0:
			print("[SIM] Disconnected cleanly")
		else:
			print(f"[SIM] Unexpected disconnect rc={rc}; auto-reconnect active")

	def on_message(_client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
		try:
			payload_text = msg.payload.decode("utf-8")
		except Exception:
			payload_text = str(msg.payload)
		print(f"[RX] {msg.topic} -> {payload_text}")

	client = mqtt.Client(client_id=args.client_id, clean_session=True)
	if args.username:
		client.username_pw_set(args.username, args.password)

	client.on_connect = on_connect
	client.on_disconnect = on_disconnect
	client.on_message = on_message
	client.reconnect_delay_set(min_delay=1, max_delay=10)

	try:
		client.connect(args.host, args.port, keepalive=60)
	except Exception as exc:
		print(f"[SIM] Initial connect failed: {exc}")
		return 1

	client.loop_start()
	print("[SIM] Publishing synthetic sensor payloads every", args.interval, "second(s)")

	try:
		while True:
			payload = _random_sensor_payload(start_ms)
			serialized = json.dumps(payload)
			pub_info = client.publish(sensor_topic, payload=serialized, qos=0, retain=False)
			if pub_info.rc != mqtt.MQTT_ERR_SUCCESS:
				print(f"[SIM] Publish failed rc={pub_info.rc}")
			else:
				print(f"[TX] {sensor_topic} -> {serialized}")
			time.sleep(max(0.1, args.interval))
	except KeyboardInterrupt:
		print("\n[SIM] Stopping simulator (Ctrl+C)")
	finally:
		try:
			client.publish(status_topic, payload="offline", qos=0, retain=True)
		except Exception as exc:
			print(f"[SIM] Failed to publish offline status: {exc}")
		client.loop_stop()
		try:
			client.disconnect()
		except Exception:
			pass

	return 0


if __name__ == "__main__":
	raise SystemExit(main())
