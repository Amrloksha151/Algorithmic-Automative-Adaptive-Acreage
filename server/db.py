import asyncio
import json
import asyncpg
from typing import Optional, Any, List
_pool: Optional[asyncpg.pool.Pool] = None

async def init_pool(db_url: Optional[str] = None):
    """Initialize the asyncpg pool. Prefer an explicit db_url (from UI); if omitted and a pool
    already exists, return it. This function does not read env vars.
    """
    global _pool
    if _pool is None:
        if not db_url:
            raise RuntimeError('Database connection URL not provided')
        _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=4)
    return _pool

async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

async def ensure_schema():
    pool = await init_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS greenhouse_events (
                id BIGSERIAL PRIMARY KEY,
                ts TIMESTAMPTZ NOT NULL DEFAULT now(),
                event_type TEXT NOT NULL,
                payload JSONB,
                reason TEXT,
                source TEXT
            );
            '''
        )

async def write_event(event_type: str, payload: Any, reason: str = '', source: str = 'server'):
    pool = await init_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            'INSERT INTO greenhouse_events(event_type, payload, reason, source) VALUES($1, $2::jsonb, $3, $4)',
            event_type, json.dumps(payload), reason, source
        )

async def fetch_recent_telemetry(minutes: int = 10) -> List[dict]:
    pool = await init_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT ts, payload FROM greenhouse_events WHERE event_type = $1 AND ts > now() - ($2::interval) ORDER BY ts ASC',
            'telemetry', f'{minutes} minutes'
        )
        return [{'ts': r['ts'].isoformat(), 'payload': r['payload']} for r in rows]

# convenience synchronous helpers for scripts
def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)
