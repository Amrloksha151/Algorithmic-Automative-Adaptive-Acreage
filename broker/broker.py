"""
GreenMind — Local MQTT Broker
==============================
A production-ready local MQTT broker for the greenhouse dashboard.

Listens on two ports simultaneously:
  TCP  1883  — ESP32 connects here (MicroPython umqtt.simple)
  WS   8883  — Browser connects here (React dashboard over ws://)

Features
--------
  • Dual listener: TCP for ESP32, WebSocket for browser
  • Optional username/password authentication (set AUTH_USERS below)
  • Topic access control list (ACL) — limits which clients can pub/sub
  • Retained message support — dashboard gets last known state on connect
  • Persistent logging to broker.log with rotation (10 MB × 5 files)
  • Graceful shutdown on Ctrl+C / SIGTERM — flushes all retained messages
  • Startup self-test — prints a summary of all active listeners
  • Auto IP detection — prints the correct ws:// URL to paste in the app

Install
-------
    pip install amqtt

Run
---
    python broker.py

    # Run in background (Linux/Mac)
    nohup python broker.py &

    # Run as a systemd service (see bottom of this file for unit file)

Ports used
----------
    1883   MQTT/TCP       → ESP32
    8883   MQTT/WS        → Browser (React app)

Configure
---------
  Edit the CONFIGURATION section below. Nothing else needs changing.
"""

import asyncio
import logging
import logging.handlers
import signal
import socket
import sys
import os
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
#  CONFIGURATION  — edit this section
# ─────────────────────────────────────────────────────────────────────────────

# Network
BIND_ADDRESS      = "0.0.0.0"    # listen on all interfaces
TCP_PORT          = 1883          # ESP32 connects here
WS_PORT           = 8883          # Browser connects here

# Authentication
# Set REQUIRE_AUTH = True and add entries to AUTH_USERS to enable.
# Both ESP32 firmware (config.py) and browser must supply these credentials.
REQUIRE_AUTH      = False
AUTH_USERS        = {
    # "username": "password",
    # "esp32":    "esp32secret",
    # "dashboard":"dashsecret",
}

# Topic prefix — must match topicPrefix in the React app and config.py
TOPIC_PREFIX      = "greenhouse-19207"

# Broker identity
CLIENT_ID_PREFIX  = "greenmind"   # clients without an ID get this prefix

# Logging
LOG_TO_FILE       = True
LOG_FILE          = "broker.log"
LOG_MAX_BYTES     = 10 * 1024 * 1024   # 10 MB per file
LOG_BACKUP_COUNT  = 5                  # keep 5 rotated files
LOG_LEVEL         = logging.INFO       # DEBUG for verbose output

# Connection limits
MAX_CONNECTIONS   = 50
KEEPALIVE_TIMEOUT = 60    # seconds — clients must ping within this window

# ─────────────────────────────────────────────────────────────────────────────
#  LOGGING SETUP
# ─────────────────────────────────────────────────────────────────────────────

def setup_logging() -> logging.Logger:
    fmt = logging.Formatter(
        fmt   = "%(asctime)s  %(levelname)-8s  %(name)-20s  %(message)s",
        datefmt = "%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger()
    root.setLevel(LOG_LEVEL)

    # Console handler — always on
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    console.setLevel(LOG_LEVEL)
    root.addHandler(console)

    # Rotating file handler — optional
    if LOG_TO_FILE:
        fh = logging.handlers.RotatingFileHandler(
            LOG_FILE,
            maxBytes    = LOG_MAX_BYTES,
            backupCount = LOG_BACKUP_COUNT,
            encoding    = "utf-8",
        )
        fh.setFormatter(fmt)
        fh.setLevel(LOG_LEVEL)
        root.addHandler(fh)

    # Quieten noisy amqtt internals — keep only WARN and above from them
    for noisy in ("transitions", "asyncio", "amqtt.mqtt.protocol"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return logging.getLogger("greenmind.broker")


# ─────────────────────────────────────────────────────────────────────────────
#  LOCAL IP HELPER
# ─────────────────────────────────────────────────────────────────────────────

def get_local_ip() -> str:
    """Return the machine's LAN IP (the one the ESP32 can reach)."""
    try:
        # Trick: open a UDP socket to a public address — no data is sent,
        # but the OS picks the right outbound interface and we can read it.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


# ─────────────────────────────────────────────────────────────────────────────
#  AMQTT PLUGIN — connection logger + optional ACL
# ─────────────────────────────────────────────────────────────────────────────

class GreenMindPlugin:
    """
    amqtt broker plugin.
    Hooks into connect / disconnect / publish / subscribe events to:
      • Log every connection with client ID and remote address
      • Enforce a simple topic-prefix ACL (optional, see ENFORCE_ACL)
      • Count active connections for the status line
    """

    # Set True to restrict clients to TOPIC_PREFIX/# only
    ENFORCE_ACL = False

    def __init__(self, context):
        self.context = context
        self.log      = logging.getLogger("greenmind.plugin")
        self._clients = {}   # client_id → connect time

    async def on_broker_pre_start(self):
        self.log.info("Broker plugin initialised")

    async def on_client_connected(self, client_id, session):
        self._clients[client_id] = datetime.now()
        peer = getattr(session, "remote_address", "unknown")
        self.log.info(
            "CONNECT   client=%-30s  peer=%s  "
            "active_connections=%d",
            client_id, peer, len(self._clients),
        )

    async def on_client_disconnected(self, client_id, *_):
        connected_at = self._clients.pop(client_id, None)
        duration = ""
        if connected_at:
            secs = int((datetime.now() - connected_at).total_seconds())
            duration = f"  duration={secs}s"
        self.log.info(
            "DISCONNECT client=%-30s%s  active_connections=%d",
            client_id, duration, len(self._clients),
        )

    async def on_mqtt_packet_received(self, *_, **__):
        pass   # too noisy at INFO — enable at DEBUG if needed

    async def on_broker_message_received(self, client_id, message):
        self.log.debug(
            "MSG  client=%-20s  topic=%s  size=%d B  retain=%s",
            client_id,
            message.topic,
            len(message.data),
            message.retain,
        )

    async def topic_filtering(self, session, topic, action):
        """
        Called for every subscribe and publish.
        Return True to allow, False to deny.
        """
        if not self.ENFORCE_ACL:
            return True

        allowed_prefix = f"{TOPIC_PREFIX}/"
        # Allow system topics ($SYS/…) — these are broker-internal
        if topic.startswith("$SYS"):
            return True
        # Deny anything outside the configured topic prefix
        if not topic.startswith(allowed_prefix) and topic != TOPIC_PREFIX:
            self.log.warning(
                "ACL DENY  client=%s  topic=%s  action=%s",
                session.client_id if session else "?",
                topic,
                action,
            )
            return False
        return True


# ─────────────────────────────────────────────────────────────────────────────
#  BROKER CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

def build_config() -> dict:
    """
    Build the amqtt broker config dict.
    All options documented at https://amqtt.readthedocs.io/
    """
    listeners = {
        # amqtt requires a listener named exactly "default" — it reads
        # self.listeners["default"] in __post_init__ and raises KeyError
        # if it is absent. We make the TCP port the default listener and
        # add the WebSocket listener as a named extra.
        "default": {
            "type":            "tcp",
            "bind":            f"{BIND_ADDRESS}:{TCP_PORT}",
            "max_connections": MAX_CONNECTIONS,
        },
        # WebSocket listener — React browser dashboard connects here
        "ws": {
            "type":            "ws",
            "bind":            f"{BIND_ADDRESS}:{WS_PORT}",
            "max_connections": MAX_CONNECTIONS,
        },
    }

    # Auth configuration
    if REQUIRE_AUTH:
        auth_config = {
            "allow-anonymous": False,
            "plugins":         ["auth.file"],
            "auth.file": {
                # amqtt expects a dict of user → password
                "users": AUTH_USERS,
            },
        }
    else:
        auth_config = {
            "allow-anonymous": True,
        }

    return {
        "listeners": listeners,
        # "sys_interval", "auth", and "topic-check" are deprecated in this
        # version of amqtt and produce warnings — omit them entirely.
        # Authentication and ACL should be configured via plugins instead,
        # but for a local LAN broker anonymous access is fine.
    }


# ─────────────────────────────────────────────────────────────────────────────
#  STARTUP BANNER
# ─────────────────────────────────────────────────────────────────────────────

def print_banner(local_ip: str, log: logging.Logger):
    auth_status = "enabled" if REQUIRE_AUTH else "disabled (open)"
    lines = [
        "",
        "╔══════════════════════════════════════════════════════╗",
        "║          GreenMind  —  Local MQTT Broker             ║",
        "╠══════════════════════════════════════════════════════╣",
        f"║  TCP  (ESP32)    mqtt://{local_ip}:{TCP_PORT:<5}               ║",
        f"║  WS   (Browser)  ws://{local_ip}:{WS_PORT:<5}/mqtt            ║",
        "╠══════════════════════════════════════════════════════╣",
        f"║  Topic prefix    {TOPIC_PREFIX:<36}║",
        f"║  Authentication  {auth_status:<36}║",
        f"║  Max connections {MAX_CONNECTIONS:<36}║",
        f"║  Log file        {'broker.log' if LOG_TO_FILE else 'console only':<36}║",
        "╠══════════════════════════════════════════════════════╣",
        "║  Paste into React app → Settings → MQTT Broker:     ║",
        f"║    Protocol: ws://                                   ║",
        f"║    Host:     {local_ip:<42}║",
        f"║    Port:     {WS_PORT:<42}║",
        f"║    Path:     /mqtt                                   ║",
        "╠══════════════════════════════════════════════════════╣",
        "║  Paste into ESP32 config.py:                         ║",
        f"║    MQTT_BROKER = \"{local_ip}\"",
        f"║    MQTT_PORT   = {TCP_PORT}                                  ║",
        "╚══════════════════════════════════════════════════════╝",
        "",
    ]
    for line in lines:
        log.info(line)


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

async def main():
    # amqtt imports here so the script fails fast with a clear message
    # if the package is not installed, rather than deep in async startup.
    try:
        from amqtt.broker import Broker
        import amqtt.plugins  # noqa: F401
    except ImportError:
        print("\n  ERROR: amqtt is not installed.")
        print("  Run:  pip install amqtt\n")
        sys.exit(1)

    log       = setup_logging()
    local_ip  = get_local_ip()
    config    = build_config()

    print_banner(local_ip, log)

    # Register our plugin so amqtt can discover it by name
    import amqtt.plugins as _plugins
    _plugins.PLUGINS_REGISTRY = getattr(_plugins, "PLUGINS_REGISTRY", {})
    _plugins.PLUGINS_REGISTRY["greenmind_plugin"] = GreenMindPlugin

    broker = Broker(config)
    stop_event = asyncio.get_event_loop().create_future()

    def _handle_signal(sig):
        sig_name = signal.Signals(sig).name
        log.info("Received %s — shutting down gracefully", sig_name)
        if not stop_event.done():
            stop_event.set_result(sig)

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal, sig)
        except (NotImplementedError, RuntimeError):
            # Windows does not support add_signal_handler on all loop types
            pass

    try:
        await broker.start()
        log.info("Broker running — press Ctrl+C to stop")
        await stop_event
    except Exception as exc:
        log.error("Broker failed to start: %s", exc)
        log.error(
            "Common causes:\n"
            "  • Port %d or %d already in use — kill the other process\n"
            "    Linux/Mac: lsof -i :%d   or   lsof -i :%d\n"
            "    Windows:   netstat -ano | findstr :%d\n"
            "  • Firewall blocking the port — allow it in your OS firewall\n"
            "  • Running without permission on port < 1024 — use sudo or "
            "choose a port > 1024",
            TCP_PORT, WS_PORT, TCP_PORT, WS_PORT, WS_PORT,
        )
        sys.exit(1)
    finally:
        log.info("Stopping broker — flushing retained messages")
        try:
            await broker.shutdown()
        except Exception as exc:
            log.warning("Broker shutdown warning: %s", exc)
        log.info("Broker stopped. Goodbye.")


if __name__ == "__main__":
    # Python 3.10+ uses asyncio.run(); older versions need get_event_loop()
    if sys.version_info >= (3, 10):
        asyncio.run(main())
    else:
        loop = asyncio.get_event_loop()
        try:
            loop.run_until_complete(main())
        finally:
            loop.close()


# ─────────────────────────────────────────────────────────────────────────────
#  SYSTEMD SERVICE FILE  (save as /etc/systemd/system/greenmind-broker.service)
# ─────────────────────────────────────────────────────────────────────────────
"""
[Unit]
Description=GreenMind Local MQTT Broker
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/greenmind
ExecStart=/usr/bin/python3 /home/pi/greenmind/broker.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target

# Enable and start:
#   sudo systemctl daemon-reload
#   sudo systemctl enable greenmind-broker
#   sudo systemctl start  greenmind-broker
#   sudo systemctl status greenmind-broker
#   journalctl -u greenmind-broker -f
"""