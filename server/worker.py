from __future__ import annotations

import json
from typing import Any, Callable, Dict

from workers import Response, WorkerEntrypoint

import main


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}


def _json_response(payload: Any, status: int = 200) -> Response:
    return Response(
        json.dumps(payload),
        status=status,
        headers={**CORS_HEADERS, 'Content-Type': 'application/json'},
    )


def _text_response(text: str, status: int = 200) -> Response:
    return Response(text, status=status, headers=CORS_HEADERS)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        if request.method == 'OPTIONS':
            return _text_response('', 204)

        path = __import__('urllib.parse').parse.urlparse(request.url).path

        routes: Dict[tuple[str, str], Callable[..., Any]] = {
            ('GET', '/health'): main.health,
            ('POST', '/init_db'): main.init_db,
            ('POST', '/db/connect'): main.db_connect,
            ('GET', '/keys/status'): main.keys_status,
            ('POST', '/keys'): main.receive_keys,
            ('DELETE', '/keys'): main.delete_keys,
            ('GET', '/state'): main.state,
            ('GET', '/agent/history'): main.agent_history,
            ('POST', '/agent/run'): main.agent_run,
            ('POST', '/ai/recommend'): main.recommend,
            ('POST', '/autonomy/trigger'): main.trigger_autonomy,
        }

        handler = routes.get((request.method, path))
        if handler is None:
            return _json_response({'detail': 'Not found'}, status=404)

        try:
            if request.method in {'POST', 'PUT', 'PATCH'}:
                try:
                    payload = await request.json()
                except Exception:
                    body_text = await request.text()
                    payload = json.loads(body_text or '{}') if body_text else {}
                result = await handler(payload)
            else:
                result = await handler()
            return _json_response(result)
        except ValueError as error:
            return _json_response({'detail': str(error)}, status=400)
        except Exception as error:
            return _json_response({'detail': str(error)}, status=500)

    async def scheduled(self, controller, env, ctx):
        ctx.waitUntil(main.run_autonomy_cycle())
        return _text_response('scheduled ok')
