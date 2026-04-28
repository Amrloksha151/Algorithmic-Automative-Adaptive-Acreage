from __future__ import annotations

import asyncio
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional

_db_connection_url: Optional[str] = None
_schema_ready = False
_events: Deque[Dict[str, Any]] = deque(maxlen=5000)


async def init_pool(db_url: Optional[str] = None):
    """Store the UI-provided connection URL for later use.

    Cloudflare Workers cannot maintain a raw asyncpg pool, so the worker runtime
    keeps a lightweight in-memory event journal and records the connection URL
    as configuration state. This keeps the API surface compatible while staying
    within Workers runtime limits.
    """
    global _db_connection_url
    if db_url:
        _db_connection_url = db_url
    return {"connectionUrl": _db_connection_url}


async def close_pool():
    return None


async def ensure_schema():
    global _schema_ready
    if not _db_connection_url:
        raise RuntimeError('Database connection URL not provided')
    _schema_ready = True
    return {"ok": True, "schemaReady": _schema_ready}


async def write_event(event_type: str, payload: Any, reason: str = '', source: str = 'server'):
    _events.append(
        {
            'ts': time.time(),
            'event_type': event_type,
            'payload': payload,
            'reason': reason,
            'source': source,
        }
    )


async def fetch_recent_telemetry(minutes: int = 10) -> List[dict]:
    cutoff = time.time() - (minutes * 60)
    return [
        {'ts': event['ts'], 'payload': event['payload']}
        for event in _events
        if event['event_type'] == 'telemetry' and event['ts'] >= cutoff
    ]


async def get_state() -> Dict[str, Any]:
    return {
        'connectionUrlConfigured': bool(_db_connection_url),
        'schemaReady': _schema_ready,
        'eventCount': len(_events),
    }


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)
