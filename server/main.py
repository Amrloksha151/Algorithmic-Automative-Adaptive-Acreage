import asyncio
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Dict
from . import db, mqtt_client, ai
from .config import AUTONOMY_INTERVAL_MIN
from .key_vault import set_keys, clear_keys, public_status

app = FastAPI(title='Greenhouse Orchestrator')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

class EnvProfile(BaseModel):
    temperature: Dict[str, float]
    humidity: Dict[str, float]
    soil: Dict[str, float]
    light: Dict[str, float]
    photoperiod: float


class KeyPayload(BaseModel):
    openai_key: str | None = None
    google_key: str | None = None
    ttl_seconds: int = 8 * 60 * 60

@app.on_event('startup')
async def startup():
    # Do not auto-initialize DB from environment. The UI should supply the connection URL
    # via the unauthenticated /db/connect endpoint. This keeps credentials out of env vars.
    try:
        pass
    except Exception as e:
        print(f'[STARTUP] skip DB init: {e}')

    # start MQTT client
    try:
        mqtt_client.setup()
    except Exception as e:
        print(f'[STARTUP] MQTT client failed to start: {e}')

    # start autonomy loop
    asyncio.create_task(autonomy_loop())

@app.on_event('shutdown')
async def shutdown():
    try:
        await db.close_pool()
    except Exception:
        pass

@app.get('/health')
async def health():
    return {'ok': True}

@app.post('/init_db')
async def init_db():
    # Ensure schema on an already-initialized pool
    try:
        await db.ensure_schema()
        return {'ok': True}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post('/db/connect')
async def db_connect(payload: Dict[str, str]):
    """Connect the companion service to a Neon/Postgres database using a connection URL
    supplied by the UI. This endpoint is intentionally unauthenticated so the browser
    can hand off credentials transiently; the server will keep them only in memory
    inside the DB pool (no persistent storage).
    Payload: { "connectionUrl": "postgres://user:pass@host:5432/db" }
    """
    conn = payload.get('connectionUrl')
    if not conn:
        raise HTTPException(status_code=400, detail='connectionUrl required')
    try:
        await db.init_pool(conn)
        await db.ensure_schema()
        return {'ok': True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to connect or init schema: {e}')


@app.get('/keys/status')
async def keys_status():
    return public_status()


@app.post('/keys')
async def receive_keys(payload: KeyPayload):
    if not payload.openai_key and not payload.google_key:
        raise HTTPException(status_code=400, detail='At least one API key is required')
    return set_keys(openai_key=payload.openai_key, google_key=payload.google_key, ttl_seconds=payload.ttl_seconds)


@app.delete('/keys')
async def delete_keys():
    clear_keys()
    return {'ok': True}

@app.post('/ai/recommend')
async def recommend(payload: Dict[str, Any]):
    # payload should include environment profile and optionally a telemetry window
    environment = payload.get('environment')
    telemetry = payload.get('telemetry') or await db.fetch_recent_telemetry(10)
    # optional per-request keys supplied by the UI (not stored)
    openai_key = payload.get('openai_key')
    google_key = payload.get('google_key')

    if openai_key or google_key:
        set_keys(openai_key=openai_key, google_key=google_key)

    if not environment:
        raise HTTPException(status_code=400, detail='environment required')

    rec = await ai.get_recommendation(telemetry, environment, openai_key=openai_key, google_key=google_key)
    # write decision to DB
    await db.write_event('decision', rec, reason='ai/recommend', source='ai')
    return rec

@app.post('/autonomy/trigger')
async def trigger_autonomy(payload: Dict[str, Any]):
    # run a single autonomy evaluation and apply commands
    environment = payload.get('environment')
    if not environment:
        raise HTTPException(status_code=400, detail='environment required')
    telemetry = await db.fetch_recent_telemetry(15)
    openai_key = payload.get('openai_key')
    google_key = payload.get('google_key')
    if openai_key or google_key:
        set_keys(openai_key=openai_key, google_key=google_key)

    # Use provided keys for this manual trigger if available; scheduled loop will use vault keys or heuristic
    rec = await ai.get_recommendation(telemetry, environment, openai_key=openai_key, google_key=google_key)

    # publish commands
    for c in rec.get('controls', []):
        mqtt_client.publish_command(c['device'], c['value'], mode=rec.get('mode', 'autonomous'), reason=rec.get('reason', 'scheduled'))

    await db.write_event('autonomy', rec, reason='autonomy/trigger', source='orchestrator')
    return {'ok': True, 'decision': rec}

async def autonomy_loop():
    while True:
        try:
            # read last environment profile to act upon - here we expect callers to POST environment or store profile in DB
            # for now, attempt to query recent telemetry and use a default profile fallback
            telemetry = await db.fetch_recent_telemetry(30)
            default_env = {
                'temperature': {'min': 20, 'max': 25},
                'humidity': {'min': 60, 'max': 70},
                'soil': {'min': 50, 'max': 70},
                'light': {'min': 16, 'max': 20},
                'photoperiod': 14,
            }
            rec = await ai.get_recommendation(telemetry, default_env)
            # publish the suggested controls
            for c in rec.get('controls', []):
                mqtt_client.publish_command(c['device'], c['value'], mode=rec.get('mode', 'autonomous'), reason=rec.get('reason', 'scheduled'))
            # persist the decision
            await db.write_event('autonomy', rec, reason='scheduled autoloop', source='orchestrator')
        except Exception as e:
            print(f'[AUTONOMY] failure: {e}')
        await asyncio.sleep(AUTONOMY_INTERVAL_MIN * 60)
