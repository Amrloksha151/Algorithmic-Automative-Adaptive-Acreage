import ipaddress
import asyncio
import socket
import ssl
from datetime import datetime, timedelta, timezone
from pathlib import Path
from amqtt.broker import Broker
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

tcp_port = 1883
ws_port = 8883

base_dir = Path(__file__).resolve().parent
tls_dir = base_dir / "tls"
tls_cert_path = tls_dir / "broker.crt"
tls_key_path = tls_dir / "broker.key"

ip_addr = socket.gethostbyname(socket.gethostname())


def _subject_alt_names():
    alt_names = [x509.DNSName("localhost")]

    try:
        alt_names.append(x509.DNSName(socket.gethostname()))
    except Exception:
        pass

    for candidate in {"127.0.0.1", ip_addr}:
        try:
            alt_names.append(x509.IPAddress(ipaddress.ip_address(candidate)))
        except ValueError:
            pass

    return alt_names


def _ensure_tls_material():
    if tls_cert_path.exists() and tls_key_path.exists():
        return

    tls_dir.mkdir(parents=True, exist_ok=True)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Algorithmic Automative Adaptive Acreage Broker"),
    ])
    now = datetime.now(timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(_subject_alt_names()), critical=False)
        .sign(private_key, hashes.SHA256())
    )

    tls_key_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    tls_cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))

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
            "ssl": True,
            "certfile": str(tls_cert_path),
            "keyfile": str(tls_key_path),
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
    _ensure_tls_material()
    broker = Broker(config)
    try:
        await broker.start()
        print(f"MQTT TCP Server Listening on http://{ip_addr}:{tcp_port}\nWeb Socket Server Listening on wss://{ip_addr}:{ws_port}")
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        await broker.shutdown()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Exiting...")