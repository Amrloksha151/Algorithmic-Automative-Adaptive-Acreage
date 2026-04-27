from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class KeyBundle:
    openai_key: Optional[str] = None
    google_key: Optional[str] = None
    updated_at: float = 0.0
    expires_at: float = 0.0


_lock = threading.Lock()
_bundle = KeyBundle()


def set_keys(*, openai_key: Optional[str] = None, google_key: Optional[str] = None, ttl_seconds: int = 8 * 60 * 60) -> Dict[str, object]:
    now = time.time()
    with _lock:
        global _bundle
        _bundle = KeyBundle(
            openai_key=openai_key.strip() if openai_key else None,
            google_key=google_key.strip() if google_key else None,
            updated_at=now,
            expires_at=now + max(ttl_seconds, 60),
        )
        return public_status()


def clear_keys() -> None:
    with _lock:
        global _bundle
        _bundle = KeyBundle()


def get_keys() -> Dict[str, Optional[str]]:
    with _lock:
        if _bundle.expires_at and time.time() > _bundle.expires_at:
            return {"openai_key": None, "google_key": None}
        return {"openai_key": _bundle.openai_key, "google_key": _bundle.google_key}


def public_status() -> Dict[str, object]:
    with _lock:
        active = bool(_bundle.openai_key or _bundle.google_key)
        expired = bool(_bundle.expires_at and time.time() > _bundle.expires_at)
        return {
            "active": active and not expired,
            "updated_at": _bundle.updated_at,
            "expires_at": _bundle.expires_at,
            "has_openai": bool(_bundle.openai_key) and not expired,
            "has_google": bool(_bundle.google_key) and not expired,
        }
