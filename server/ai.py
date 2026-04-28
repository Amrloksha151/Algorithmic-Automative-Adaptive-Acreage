import json
import re
from typing import Dict, Any, List, Optional
import httpx

from .key_vault import get_keys

# This module implements provider integrations that use API keys supplied
# per-request (not stored). If provider calls fail, we fall back to the
# lightweight heuristic recommendation.

GOOGLE_GENAI_URL = "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate"
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_DEFAULT_MODEL = "gemini-2.0-flash"


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    # attempt to find a JSON object in arbitrary text
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


async def call_google_genai(prompt: str, api_key: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        payload = {"prompt": {"text": prompt}, "temperature": 0.2, "max_output_tokens": 512}
        params = {"key": api_key}
        r = await client.post(GOOGLE_GENAI_URL, params=params, json=payload)
        r.raise_for_status()
        data = r.json()
        # Google returns candidates with content text
        text = None
        if isinstance(data, dict):
            c = data.get("candidates") or []
            if c:
                text = c[0].get("content")
        if not text:
            # Try other response shapes
            text = json.dumps(data)
        parsed = _extract_json(text)
        if parsed:
            return parsed
        # Last resort: return boxed text as 'reason'
        return {"mode": "autonomous", "reason": text, "controls": []}


async def call_google_tool_agent(
    *,
    api_key: str,
    contents: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    model: str = GEMINI_DEFAULT_MODEL,
) -> Dict[str, Any]:
    payload = {
        'contents': contents,
        'tools': [
            {
                'functionDeclarations': [tool['function'] for tool in tools if tool.get('type') == 'function'],
            }
        ],
    }

    headers = {
        'x-goog-api-key': api_key,
        'Content-Type': 'application/json',
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(GEMINI_GENERATE_URL.format(model=model), headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


def _google_extract_function_calls(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    candidates = response.get('candidates') or []
    if not candidates:
        return []
    content = (candidates[0] or {}).get('content') or {}
    parts = content.get('parts') or []
    function_calls = []
    for part in parts:
        function_call = part.get('functionCall') or part.get('function_call')
        if function_call:
            function_calls.append(function_call)
    return function_calls


def _google_extract_text(response: Dict[str, Any]) -> str:
    candidates = response.get('candidates') or []
    if not candidates:
        return ''
    content = (candidates[0] or {}).get('content') or {}
    parts = content.get('parts') or []
    texts = []
    for part in parts:
        text = part.get('text')
        if text:
            texts.append(text)
    return '\n'.join(texts).strip()


def _google_function_response_part(name: str, call_id: str, result: Any) -> Dict[str, Any]:
    return {
        'role': 'user',
        'parts': [
            {
                'functionResponse': {
                    'name': name,
                    'id': call_id,
                    'response': result,
                }
            }
        ],
    }


async def call_openai(prompt: str, api_key: str) -> Dict[str, Any]:
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You output only JSON with keys mode, reason, controls. controls is a list of {device, value} objects."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 512,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)
        if resp.status_code >= 400:
            # Retry a cheaper/older model once before failing to the heuristic
            payload["model"] = "gpt-4o-mini"
            resp.raise_for_status()
        data = resp.json()

    text = ""
    choices = data.get("choices") or []
    if choices:
        text = choices[0].get("message", {}).get("content", "")

    parsed = _extract_json(text)
    if parsed:
        return parsed
    # If the model returned plain text instructions, wrap as reason
    return {"mode": "autonomous", "reason": text, "controls": []}


async def call_openai_tool_agent(*, api_key: str, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]], model: str = 'gpt-4o-mini', temperature: float = 0.2, max_tokens: int = 700) -> Dict[str, Any]:
    payload = {
        'model': model,
        'messages': messages,
        'tools': tools,
        'tool_choice': 'auto',
        'temperature': temperature,
        'max_tokens': max_tokens,
    }

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()

async def heuristic_recommendation(telemetry: List[Dict[str, Any]], environment: Dict[str, Any]) -> Dict[str, Any]:
    # Simple non-AI fallback: use latest reading and simple deltas
    latest = telemetry[-1]['payload'] if telemetry else {}
    temp = float(latest.get('temperature') or environment['temperature']['max'])
    hum = float(latest.get('humidity') or environment['humidity']['min'])
    soil = float(latest.get('soil') or environment['soil']['min'])
    light = float(latest.get('light') or environment['light']['min'])

    t_gap = max(0.0, environment['temperature']['max'] - temp)
    h_gap = max(0.0, environment['humidity']['min'] - hum)
    s_gap = max(0.0, environment['soil']['min'] - soil)
    l_gap = max(0.0, environment['light']['min'] - light)

    coolingFan = int(min(100, max(0, t_gap * 15 + (h_gap > 0) * 10)))
    ventFan = int(min(100, max(0, t_gap * 10 + h_gap * 3)))
    led = int(min(100, max(0, 30 + l_gap * 12))) if l_gap > 0 else 0
    irrigation = 1 if s_gap > 0 else 0
    mist = 1 if h_gap > 2 else 0
    pump12 = 1 if t_gap > 1 else 0

    return {
        'mode': 'autonomous',
        'reason': 'heuristic fallback recommendation',
        'controls': [
            {'device': 'cooling_fan', 'value': coolingFan},
            {'device': 'ventilation_fan', 'value': ventFan},
            {'device': 'led_strip', 'value': led},
            {'device': 'pump_5v', 'value': irrigation},
            {'device': 'mist_maker', 'value': mist},
            {'device': 'pump_12v', 'value': pump12},
        ]
    }


async def get_recommendation(telemetry: List[Dict[str, Any]], environment: Dict[str, Any], *, openai_key: Optional[str] = None, google_key: Optional[str] = None) -> Dict[str, Any]:
    vault_keys = get_keys()
    openai_key = openai_key or vault_keys.get('openai_key')
    google_key = google_key or vault_keys.get('google_key')

    if openai_key or google_key:
        from .agent import run_agent

        return await run_agent(
            goal='Recommend greenhouse controls from telemetry and crop targets.',
            environment=environment,
            telemetry=telemetry,
            openai_key=openai_key,
            google_key=google_key,
        )

    prompt = f"Telemetry: {telemetry[-5:]}\nTarget: {environment}\nSuggest actuator values as JSON with keys mode, reason, controls where controls is a list of {{device, value}} entries."

    return await heuristic_recommendation(telemetry, environment)
