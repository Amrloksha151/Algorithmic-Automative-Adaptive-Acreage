Companion orchestration service for the greenhouse

Overview
- Receives telemetry (via MQTT) and writes events to Neon Postgres
- Runs an autonomy loop every 30 minutes to evaluate state and decide actuator commands
- Calls AI providers (Google primary, OpenAI fallback) when available; falls back to a local heuristic
- Publishes actuator commands to MQTT command topic

Quick start (local)
1. Create a virtualenv and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Configure the companion service and UI

- The companion service itself reads only `MQTT_BROKER`, `MQTT_PORT`, `TOPIC_PREFIX`, and optionally `AUTONOMY_INTERVAL_MIN` from environment variables for deployment convenience.
- Do NOT put AI provider keys or the Neon connection string in environment variables. Instead, supply them from the browser UI at runtime: the UI will POST the Neon connection URL to the companion service (`POST /db/connect`) and will hand transient AI keys to the companion via `POST /keys`. The companion service keeps those secrets only in memory for a short TTL and never persists them.

Example `.env` (optional):

```
MQTT_BROKER=192.168.0.49
MQTT_PORT=1883
TOPIC_PREFIX=greenhouse
AUTONOMY_INTERVAL_MIN=30
```

3. Run the service during development:

```powershell
cd server
uvicorn main:app --reload --port 9000
```

Notes
- The AI provider calls attempt provider calls only when API keys are supplied by the user at runtime; otherwise the service uses a conservative heuristic recommendation.
- To create the database schema, first use the UI to POST the Neon connection URL to `/db/connect` (or call that endpoint directly), then call `POST /init_db` to create the `greenhouse_events` table. The service will not read or persist database credentials from environment variables.
