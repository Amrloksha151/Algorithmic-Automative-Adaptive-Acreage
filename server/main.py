from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Dict
from . import db, ai
from .agent import recent_runs, run_agent
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


class DbConnectPayload(BaseModel):
    connectionUrl: str


class AutonomyPayload(BaseModel):
    environment: Dict[str, Any]
    openai_key: str | None = None
    google_key: str | None = None


class RecommendPayload(BaseModel):
    environment: Dict[str, Any]
    telemetry: list[dict[str, Any]] | None = None
    openai_key: str | None = None
    google_key: str | None = None


class AgentRunPayload(BaseModel):
    goal: str
    environment: Dict[str, Any]
    telemetry: list[dict[str, Any]] | None = None
    telemetry_minutes: int = 10
    openai_key: str | None = None
    google_key: str | None = None

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
async def db_connect(payload: DbConnectPayload):
    """Connect the companion service to a Neon/Postgres database using a connection URL
    supplied by the UI. This endpoint is intentionally unauthenticated so the browser
    can hand off credentials transiently; the server will keep them only in memory
    inside the DB pool (no persistent storage).
    Payload: { "connectionUrl": "postgres://user:pass@host:5432/db" }
    """
    try:
        await db.init_pool(payload.connectionUrl)
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

@app.get('/state')
async def state():
    return await db.get_state()


@app.get('/agent/history')
async def agent_history():
    return {'runs': await recent_runs()}


@app.post('/agent/run')
async def agent_run(payload: AgentRunPayload):
    telemetry = payload.telemetry or await db.fetch_recent_telemetry(payload.telemetry_minutes)
    result = await run_agent(
        goal=payload.goal,
        environment=payload.environment,
        telemetry=telemetry,
        telemetry_minutes=payload.telemetry_minutes,
        openai_key=payload.openai_key,
        google_key=payload.google_key,
    )
    return {'ok': True, 'result': result}


@app.post('/ai/recommend')
async def recommend(payload: RecommendPayload):
    # payload should include environment profile and optionally a telemetry window
    environment = payload.environment
    telemetry = payload.telemetry or await db.fetch_recent_telemetry(10)
    # optional per-request keys supplied by the UI (not stored)
    openai_key = payload.openai_key
    google_key = payload.google_key

    if openai_key or google_key:
        set_keys(openai_key=openai_key, google_key=google_key)

    if not environment:
        raise HTTPException(status_code=400, detail='environment required')

    rec = await run_agent(
        goal='Recommend greenhouse controls from telemetry and crop targets.',
        environment=environment,
        telemetry=telemetry,
        openai_key=openai_key,
        google_key=google_key,
    )
    # write decision to DB
    await db.write_event('decision', rec, reason='ai/recommend', source='ai')
    return rec

@app.post('/autonomy/trigger')
async def trigger_autonomy(payload: AutonomyPayload):
    # run a single autonomy evaluation and apply commands
    environment = payload.environment
    telemetry = await db.fetch_recent_telemetry(15)
    openai_key = payload.openai_key
    google_key = payload.google_key
    if openai_key or google_key:
        set_keys(openai_key=openai_key, google_key=google_key)

    # Use provided keys for this manual trigger if available; scheduled loop will use vault keys or heuristic
    rec = await run_agent(
        goal='Apply safe autonomous greenhouse controls.',
        environment=environment,
        telemetry=telemetry,
        openai_key=openai_key,
        google_key=google_key,
    )

    await db.write_event('autonomy', rec, reason='autonomy/trigger', source='orchestrator')
    return {'ok': True, 'decision': rec}


async def run_autonomy_cycle():
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
    )
    await db.write_event('autonomy', rec, reason='scheduled autoloop', source='orchestrator')
    return rec
