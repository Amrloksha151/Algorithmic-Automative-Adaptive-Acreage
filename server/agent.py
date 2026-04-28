from __future__ import annotations

import json
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional

from . import ai, db
from .key_vault import clear_keys, get_keys, public_status, set_keys

RUN_HISTORY: Deque[Dict[str, Any]] = deque(maxlen=50)

KNOWN_DEVICES = {
    'cooling_fan',
    'ventilation_fan',
    'led_strip',
    'pump_5v',
    'mist_maker',
    'pump_12v',
}

TOOLS = [
    {
        'type': 'function',
        'function': {
            'name': 'get_state',
            'description': 'Read the current worker and greenhouse state snapshot, recent telemetry, and secret status.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'telemetry_minutes': {'type': 'integer', 'minimum': 1, 'maximum': 120, 'default': 10},
                },
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'fetch_recent_telemetry',
            'description': 'Fetch recent telemetry events from the current state store.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'minutes': {'type': 'integer', 'minimum': 1, 'maximum': 120, 'default': 10},
                },
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_keys_status',
            'description': 'Check whether transient provider keys are active.',
            'parameters': {
                'type': 'object',
                'properties': {},
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'set_keys',
            'description': 'Set transient AI provider keys in memory for this runtime only.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'openai_key': {'type': 'string'},
                    'google_key': {'type': 'string'},
                    'ttl_seconds': {'type': 'integer', 'minimum': 60, 'maximum': 86400, 'default': 28800},
                },
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'clear_keys',
            'description': 'Clear transient AI provider keys from memory.',
            'parameters': {
                'type': 'object',
                'properties': {},
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'write_event',
            'description': 'Record a structured event for auditability.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'event_type': {'type': 'string'},
                    'payload': {'type': 'object'},
                    'reason': {'type': 'string'},
                    'source': {'type': 'string'},
                },
                'required': ['event_type', 'payload'],
                'additionalProperties': False,
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'validate_controls',
            'description': 'Normalize a proposed control plan and clamp values to safe bounds.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'controls': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'device': {'type': 'string'},
                                'value': {},
                            },
                            'required': ['device', 'value'],
                            'additionalProperties': False,
                        },
                    },
                },
                'required': ['controls'],
                'additionalProperties': False,
            },
        },
    },
]


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


async def _tool_get_state(arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    telemetry_minutes = int(arguments.get('telemetry_minutes') or context.get('telemetry_minutes') or 10)
    return {
        'goal': context.get('goal'),
        'environment': context.get('environment'),
        'keys': public_status(),
        'db': await db.get_state(),
        'telemetry': await db.fetch_recent_telemetry(telemetry_minutes),
    }


async def _tool_fetch_recent_telemetry(arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    minutes = int(arguments.get('minutes') or context.get('telemetry_minutes') or 10)
    return {'minutes': minutes, 'telemetry': await db.fetch_recent_telemetry(minutes)}


async def _tool_get_keys_status(_: Dict[str, Any], __: Dict[str, Any]) -> Dict[str, Any]:
    return public_status()


async def _tool_set_keys(arguments: Dict[str, Any], _: Dict[str, Any]) -> Dict[str, Any]:
    return set_keys(
        openai_key=arguments.get('openai_key'),
        google_key=arguments.get('google_key'),
        ttl_seconds=int(arguments.get('ttl_seconds') or 28800),
    )


async def _tool_clear_keys(_: Dict[str, Any], __: Dict[str, Any]) -> Dict[str, Any]:
    clear_keys()
    return {'ok': True}


async def _tool_write_event(arguments: Dict[str, Any], _: Dict[str, Any]) -> Dict[str, Any]:
    event_type = arguments['event_type']
    payload = arguments['payload']
    reason = arguments.get('reason', '')
    source = arguments.get('source', 'agent')
    await db.write_event(event_type, payload, reason=reason, source=source)
    return {'ok': True, 'event_type': event_type}


async def _tool_validate_controls(arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    controls = arguments.get('controls') or []
    validated = []
    rejected = []

    for control in controls:
        device = str(control.get('device', '')).strip()
        if device not in KNOWN_DEVICES:
            rejected.append({'device': device, 'reason': 'unknown device'})
            continue

        value = control.get('value')
        if device in {'cooling_fan', 'ventilation_fan', 'led_strip'}:
            try:
                value = max(0, min(100, int(float(value))))
            except (TypeError, ValueError):
                rejected.append({'device': device, 'reason': 'invalid pwm value'})
                continue
        else:
            value = 1 if bool(value) else 0

        validated.append({'device': device, 'value': value})

    return {
        'validated': validated,
        'rejected': rejected,
        'environment': context.get('environment'),
    }


async def _dispatch_tool(name: str, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    tool_map = {
        'get_state': _tool_get_state,
        'fetch_recent_telemetry': _tool_fetch_recent_telemetry,
        'get_keys_status': _tool_get_keys_status,
        'set_keys': _tool_set_keys,
        'clear_keys': _tool_clear_keys,
        'write_event': _tool_write_event,
        'validate_controls': _tool_validate_controls,
    }
    handler = tool_map.get(name)
    if not handler:
        return {'error': f'unknown tool: {name}'}
    return await handler(arguments, context)


def _finalize_result(final_result: Dict[str, Any], telemetry: List[Dict[str, Any]], goal: str, tool_log: List[Dict[str, Any]], validation: Dict[str, Any]) -> Dict[str, Any]:
    final_result['controls'] = validation['validated']
    final_result['rejected_controls'] = validation['rejected']
    final_result['tool_log'] = tool_log
    final_result['goal'] = goal
    final_result['observations'] = {
        'keys': public_status(),
        'telemetry_count': len(telemetry),
    }
    return final_result


async def _run_openai_agent(
    *,
    goal: str,
    environment: Dict[str, Any],
    telemetry: List[Dict[str, Any]],
    openai_key: str,
    telemetry_minutes: int,
    max_steps: int,
) -> Dict[str, Any]:
    context = {
        'goal': goal,
        'environment': environment,
        'telemetry_minutes': telemetry_minutes,
    }
    system_prompt = (
        'You are a greenhouse control agent. Use tools to inspect state before deciding. '
        'Do not guess hidden state. Prefer safe, bounded actions. '
        'When ready, return a JSON object with mode, reason, controls, and optional observations. '
        'Controls must be a list of {device, value} items. '
        'Before finalizing, validate proposed controls with the validate_controls tool.'
    )
    user_prompt = _json({
        'goal': goal,
        'environment': environment,
        'telemetry': telemetry[-10:],
        'constraints': {
            'manual_override_authoritative': True,
            'pwm_range': [0, 100],
            'binary_range': [0, 1],
        },
    })

    messages: List[Dict[str, Any]] = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]
    tool_log: List[Dict[str, Any]] = []
    final_result: Optional[Dict[str, Any]] = None

    for step in range(max_steps):
        response = await ai.call_openai_tool_agent(
            api_key=openai_key,
            messages=messages,
            tools=TOOLS,
            max_tokens=900,
        )
        choice = (response.get('choices') or [{}])[0].get('message', {})
        messages.append(choice)

        tool_calls = choice.get('tool_calls') or []
        if tool_calls:
            for call in tool_calls:
                function = call.get('function') or {}
                name = function.get('name', '')
                raw_args = function.get('arguments') or '{}'
                try:
                    arguments = json.loads(raw_args)
                except json.JSONDecodeError:
                    arguments = {}
                result = await _dispatch_tool(name, arguments, context)
                tool_log.append({'step': step + 1, 'tool': name, 'arguments': arguments, 'result': result})
                messages.append({'role': 'tool', 'tool_call_id': call.get('id'), 'content': _json(result)})
            continue

        content = choice.get('content') or '{}'
        try:
            final_result = json.loads(content)
        except json.JSONDecodeError:
            final_result = {'mode': 'autonomous', 'reason': content, 'controls': []}
        break

    if not final_result:
        final_result = await ai.heuristic_recommendation(telemetry, environment)

    validation = await _tool_validate_controls({'controls': final_result.get('controls') or []}, context)
    final_result = _finalize_result(final_result, telemetry, goal, tool_log, validation)
    record = {
        'goal': goal,
        'environment': environment,
        'telemetry_count': len(telemetry),
        'tool_log': tool_log,
        'final_result': final_result,
        'ts': time.time(),
    }
    await db.write_event('agent_run', record, reason='tool-using agent', source='agent')
    RUN_HISTORY.append(record)
    return final_result


async def _run_google_agent(
    *,
    goal: str,
    environment: Dict[str, Any],
    telemetry: List[Dict[str, Any]],
    google_key: str,
    telemetry_minutes: int,
    max_steps: int,
) -> Dict[str, Any]:
    context = {
        'goal': goal,
        'environment': environment,
        'telemetry_minutes': telemetry_minutes,
    }
    system_prompt = (
        'You are a greenhouse control agent. Use tools to inspect state before deciding. '
        'Do not guess hidden state. Prefer safe, bounded actions. '
        'When ready, return a JSON object with mode, reason, controls, and optional observations. '
        'Controls must be a list of {device, value} items. '
        'Before finalizing, validate proposed controls with the validate_controls tool.'
    )
    user_content = _json({
        'goal': goal,
        'environment': environment,
        'telemetry': telemetry[-10:],
        'constraints': {
            'manual_override_authoritative': True,
            'pwm_range': [0, 100],
            'binary_range': [0, 1],
        },
    })

    contents: List[Dict[str, Any]] = [
        {'role': 'user', 'parts': [{'text': system_prompt + '\n' + user_content}]},
    ]
    tool_log: List[Dict[str, Any]] = []
    final_result: Optional[Dict[str, Any]] = None

    for step in range(max_steps):
        response = await ai.call_google_tool_agent(
            api_key=google_key,
            contents=contents,
            tools=TOOLS,
        )
        function_calls = ai._google_extract_function_calls(response)

        if function_calls:
            candidates = response.get('candidates') or []
            if candidates:
                contents.append((candidates[0] or {}).get('content', {}))

            for call in function_calls:
                name = call.get('name', '')
                arguments = call.get('args') or call.get('arguments') or {}
                result = await _dispatch_tool(name, arguments, context)
                tool_log.append({'step': step + 1, 'tool': name, 'arguments': arguments, 'result': result})
                contents.append(ai._google_function_response_part(name, call.get('id', f'step-{step + 1}'), result))
            continue

        text = ai._google_extract_text(response)
        try:
            final_result = json.loads(text)
        except json.JSONDecodeError:
            final_result = {'mode': 'autonomous', 'reason': text, 'controls': []}
        break

    if not final_result:
        final_result = await ai.heuristic_recommendation(telemetry, environment)

    validation = await _tool_validate_controls({'controls': final_result.get('controls') or []}, context)
    final_result = _finalize_result(final_result, telemetry, goal, tool_log, validation)
    record = {
        'goal': goal,
        'environment': environment,
        'telemetry_count': len(telemetry),
        'tool_log': tool_log,
        'final_result': final_result,
        'ts': time.time(),
    }
    await db.write_event('agent_run', record, reason='tool-using agent', source='agent')
    RUN_HISTORY.append(record)
    return final_result


async def run_agent(
    *,
    goal: str,
    environment: Dict[str, Any],
    telemetry: List[Dict[str, Any]],
    openai_key: Optional[str] = None,
    google_key: Optional[str] = None,
    telemetry_minutes: int = 10,
    max_steps: int = 6,
) -> Dict[str, Any]:
    vault_keys = get_keys()
    openai_key = openai_key or vault_keys.get('openai_key')
    google_key = google_key or vault_keys.get('google_key')

    if google_key:
        try:
            return await _run_google_agent(
                goal=goal,
                environment=environment,
                telemetry=telemetry,
                google_key=google_key,
                telemetry_minutes=telemetry_minutes,
                max_steps=max_steps,
            )
        except Exception as error:
            print(f'Google agent failed: {error}')

    if openai_key:
        try:
            return await _run_openai_agent(
                goal=goal,
                environment=environment,
                telemetry=telemetry,
                openai_key=openai_key,
                telemetry_minutes=telemetry_minutes,
                max_steps=max_steps,
            )
        except Exception as error:
            print(f'OpenAI agent failed: {error}')

    final = await ai.heuristic_recommendation(telemetry, environment)
    validation = await _tool_validate_controls({'controls': final.get('controls') or []}, {
        'goal': goal,
        'environment': environment,
        'telemetry_minutes': telemetry_minutes,
    })
    final = _finalize_result(final, telemetry, goal, [], validation)
    record = {
        'goal': goal,
        'environment': environment,
        'telemetry_count': len(telemetry),
        'tool_log': [],
        'final_result': final,
        'ts': time.time(),
    }
    await db.write_event('agent_run', record, reason='heuristic fallback', source='agent')
    RUN_HISTORY.append(record)
    return final


async def recent_runs() -> List[Dict[str, Any]]:
    return list(RUN_HISTORY)
