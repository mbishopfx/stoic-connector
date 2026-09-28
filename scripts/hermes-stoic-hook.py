#!/usr/bin/env python3
"""Report metadata for Hermes turns that used a project-scoped Stoic MCP tool.

Hermes supplies a JSON hook payload on stdin. This script never stores tool
arguments or results; the local marker contains only a project UUID and count.
"""

import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.request
import uuid


STOIC_TOOL_PREFIX = "mcp__stoic_hermes__"
PROJECT_WRITE_TOOLS = {
    "post_project_message", "create_handoff", "update_project_brief",
    "create_artifact_upload", "upload_text_artifact",
}
PROJECT_ID = re.compile(r"^[0-9a-fA-F-]{36}$")
STATE_DIR = Path.home() / ".config" / "stoic" / "hermes-hooks"
MCP_URL = "https://stoic.bishoptech.dev/api/mcp"


def safe_uuid(value):
    if not isinstance(value, str) or not PROJECT_ID.fullmatch(value):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def marker_path(session_id, turn_id):
    if not isinstance(session_id, str) or not isinstance(turn_id, str):
        return None
    if not session_id or not turn_id or len(session_id) > 200 or len(turn_id) > 200:
        return None
    digest = hashlib.sha256(f"{session_id}\0{turn_id}".encode()).hexdigest()
    return STATE_DIR / f"{digest}.json"


def read_marker(path):
    try:
        data = json.loads(path.read_text())
        return {project: int(count) for project, count in data.items()
                if safe_uuid(project) and isinstance(count, int) and 0 < count < 10000}
    except (OSError, ValueError, TypeError):
        return {}


def write_marker(path, data):
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(STATE_DIR, 0o700)
    temp = path.with_suffix(".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(data, output)
    os.replace(temp, path)


def credential():
    value = os.environ.get("MCP_STOIC_HERMES_API_KEY")
    if value:
        return value
    env_file = Path.home() / ".hermes" / ".env"
    try:
        for line in env_file.read_text().splitlines():
            if line.startswith("MCP_STOIC_HERMES_API_KEY="):
                return line.partition("=")[2].strip().strip("\"'")
    except OSError:
        pass
    return None


def post_report(project_id, body, idempotency_key):
    key = credential()
    if not key:
        return False
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "post_run_report", "arguments": {
            "projectId": project_id, "body": body, "idempotencyKey": idempotency_key,
        },
    }}
    request = urllib.request.Request(MCP_URL, data=json.dumps(payload).encode(), headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
    })
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read(65536).decode()
        if "data: " in raw:
            raw = next((line[6:] for line in raw.splitlines() if line.startswith("data: ")), "")
        result = json.loads(raw)
        return not result.get("error") and not result.get("result", {}).get("isError")
    except (OSError, ValueError, TypeError):
        return False


def handle(payload):
    event = payload.get("hook_event_name")
    extra = payload.get("extra") or {}
    path = marker_path(payload.get("session_id") or extra.get("session_id"), extra.get("turn_id"))
    if path is None:
        return
    if event == "post_tool_call":
        tool_name = payload.get("tool_name") or extra.get("tool_name")
        if (not isinstance(tool_name, str) or not tool_name.startswith(STOIC_TOOL_PREFIX)
                or tool_name.removeprefix(STOIC_TOOL_PREFIX) not in PROJECT_WRITE_TOOLS
                or extra.get("status") in {"error", "blocked"}):
            return
        arguments = payload.get("tool_input") or extra.get("args") or {}
        if not isinstance(arguments, dict):
            return
        project_id = safe_uuid(arguments.get("projectId"))
        if not project_id:
            return
        marker = read_marker(path)
        marker[project_id] = min(marker.get(project_id, 0) + 1, 9999)
        write_marker(path, marker)
    elif event == "on_session_end":
        marker = read_marker(path)
        if not marker:
            return
        outcome = "completed" if extra.get("completed") else "interrupted" if extra.get("interrupted") else "failed" if extra.get("failed") else "ended"
        for project_id, count in marker.copy().items():
            body = f"Hermes run {outcome}. Used {count} Stoic project tool call{'s' if count != 1 else ''}. See the project board and handoff timeline for work details."
            idem = "hermes-hook-" + hashlib.sha256(f"{path.stem}:{project_id}".encode()).hexdigest()[:48]
            if post_report(project_id, body, idem):
                del marker[project_id]
        if marker:
            write_marker(path, marker)
        else:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        handle(json.load(sys.stdin))
    except (ValueError, TypeError, OSError):
        pass
    print("{}")
