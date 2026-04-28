Cloudflare Workers companion orchestration service for the greenhouse

Overview
- Exposes a Python Workers FastAPI app for UI-driven orchestration
- Stores transient API keys only in memory with TTL when the user submits them from the UI
- Accepts a UI-supplied Neon connection URL and keeps the Worker configuration compatible with Cloudflare deployment
- Runs a scheduled autonomy pass every 30 minutes using Cloudflare Cron Triggers
- Calls AI providers (Google primary, OpenAI fallback) when available; falls back to a local heuristic

Quick start (local)
1. Create a virtualenv and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Configure the Worker project

- Use `server/pyproject.toml` and `server/wrangler.toml` for local development and deployment.
- Install dependencies with `uv` or `pip` and run the Worker locally with `uv run pywrangler dev`.
- Do NOT put AI provider keys or the Neon connection string in environment variables. Instead, supply them from the browser UI at runtime: the UI posts the Neon connection URL to `POST /db/connect` and transient AI keys to `POST /keys`. The Worker keeps those secrets only in memory with a TTL.

3. Run the service during development:

```powershell
cd server
uv run pywrangler dev
```

Notes
- The AI provider calls attempt provider calls only when API keys are supplied by the user at runtime; otherwise the service uses a conservative heuristic recommendation.
- Cloudflare Workers cannot host a raw MQTT broker client or a persistent asyncpg pool, so the Worker keeps a transient in-memory event journal and exposes the same API surface for UI integration and scheduled autonomy.
- To configure the database URL, use the UI to POST the connection string to `/db/connect`, then call `POST /init_db`.
