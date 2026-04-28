from __future__ import annotations

from typing import Any, Dict

import ai
import db
from agent import recent_runs, run_agent
from key_vault import clear_keys, public_status, set_keys


async def health() -> Dict[str, Any]:
    return {'ok': True}


async def init_db() -> Dict[str, Any]:
    try:
        await db.ensure_schema()
        return {'ok': True}
    except RuntimeError as error:
        raise ValueError(str(error)) from error


async def db_connect(payload: Dict[str, Any]) -> Dict[str, Any]:
    connection_url = payload.get('connectionUrl')
    if not connection_url:
        raise ValueError('connectionUrl required')
    await db.init_pool(connection_url)
    await db.ensure_schema()
    return {'ok': True}


async def keys_status() -> Dict[str, Any]:
    return public_status()


async def receive_keys(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not payload.get('openai_key') and not payload.get('google_key'):
        raise ValueError('At least one API key is required')
    return set_keys(
        openai_key=payload.get('openai_key'),
        google_key=payload.get('google_key'),
        ttl_seconds=int(payload.get('ttl_seconds') or 8 * 60 * 60),
    )


async def delete_keys() -> Dict[str, Any]:
    clear_keys()
    return {'ok': True}


async def state() -> Dict[str, Any]:
    return await db.get_state()


async def agent_history() -> Dict[str, Any]:
    return {'runs': await recent_runs()}


async def agent_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    environment = payload.get('environment')
    if not environment:
        raise ValueError('environment required')
    telemetry = payload.get('telemetry') or await db.fetch_recent_telemetry(int(payload.get('telemetry_minutes') or 10))
    result = await run_agent(
        goal=payload.get('goal', 'Recommend greenhouse controls from telemetry and crop targets.'),
        environment=environment,
        telemetry=telemetry,
        openai_key=payload.get('openai_key'),
        google_key=payload.get('google_key'),
        telemetry_minutes=int(payload.get('telemetry_minutes') or 10),
    )
    return {'ok': True, 'result': result}


async def recommend(payload: Dict[str, Any]) -> Dict[str, Any]:
    environment = payload.get('environment')
    if not environment:
        raise ValueError('environment required')
    telemetry = payload.get('telemetry') or await db.fetch_recent_telemetry(10)
    rec = await run_agent(
        goal='Recommend greenhouse controls from telemetry and crop targets.',
        environment=environment,
        telemetry=telemetry,
        openai_key=payload.get('openai_key'),
        google_key=payload.get('google_key'),
        telemetry_minutes=10,
    )
    await db.write_event('decision', rec, reason='ai/recommend', source='agent')
    return rec


async def trigger_autonomy(payload: Dict[str, Any]) -> Dict[str, Any]:
    environment = payload.get('environment')
    if not environment:
        raise ValueError('environment required')
    telemetry = await db.fetch_recent_telemetry(15)
    rec = await run_agent(
        goal='Apply safe autonomous greenhouse controls.',
        environment=environment,
        telemetry=telemetry,
        openai_key=payload.get('openai_key'),
        google_key=payload.get('google_key'),
        telemetry_minutes=15,
    )
    await db.write_event('autonomy', rec, reason='autonomy/trigger', source='agent')
    return {'ok': True, 'decision': rec}


async def run_autonomy_cycle() -> Dict[str, Any]:
    telemetry = await db.fetch_recent_telemetry(30)
    default_env = {
        'temperature': {'min': 20, 'max': 25},
        'humidity': {'min': 60, 'max': 70},
        'soil': {'min': 50, 'max': 70},
        'light': {'min': 16, 'max': 20},
        'photoperiod': 14,
    }
    rec = await run_agent(
        goal='Scheduled autonomy review cycle.',
        environment=default_env,
        telemetry=telemetry,
        telemetry_minutes=30,
    )
    await db.write_event('autonomy', rec, reason='scheduled autoloop', source='agent')
    return rec
