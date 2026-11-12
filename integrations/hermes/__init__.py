"""Hermes native binding; scientific code and privacy policy remain in R."""

from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Callable, Protocol

LOGGER = logging.getLogger(__name__)
PACKAGE = Path(__file__).resolve().parent
TOOLKIT = PACKAGE / "toolkit"
PASSIVE = {"skills_list", "skill_view", "todo", "clarify"}


class PluginContext(Protocol):
    def register_skill(self, name: str, path: Path, description: str = "") -> object: ...
    def register_hook(self, name: str, callback: Callable[..., object]) -> object: ...


def project_root(cwd: Path) -> Path:
    cwd = cwd.resolve(strict=True)
    if not cwd.is_dir():
        raise ValueError("Session working directory is not a local directory")
    for candidate in (cwd, *cwd.parents):
        if (candidate / ".cascadia/private.json").exists():
            return candidate
    return cwd


def privacy_request(tool_name: str, args: dict, cwd: Path, project: Path) -> dict:
    request: dict = {
        "version": 1, "host": "hermes", "project": str(project),
        "toolkit": str(TOOLKIT), "operation": "unsupported",
    }
    if not isinstance(args, dict):
        raise ValueError("Invalid tool arguments")
    if tool_name in {"read_file", "write_file", "patch"}:
        path = args.get("path")
        if not isinstance(path, str) or not path:
            raise ValueError(f"{tool_name} requires a file path")
        path = os.path.expanduser(path)
        request.update(
            operation="read" if tool_name == "read_file" else "write",
            paths=[str((cwd / path).resolve())],
        )
    elif tool_name == "search_files":
        path = args.get("path", ".")
        if not isinstance(path, str):
            raise ValueError("Invalid search scope")
        request.update(operation="search", paths=[str((cwd / os.path.expanduser(path)).resolve())],
                       pattern=args.get("pattern", ""))
    elif tool_name == "terminal":
        request.update(operation="shell", command=args.get("command"))
    elif tool_name in PASSIVE:
        request["operation"] = "passive"
    return request


def enforce(tool_name: str, args: dict, cwd: Path) -> dict[str, str] | None:
    try:
        project = project_root(cwd)
        if not (project / ".cascadia/private.json").exists():
            return None
        request = privacy_request(tool_name, args, cwd, project)
        result = subprocess.run(
            ["bash", str(TOOLKIT / "scripts/Rscript"),
             str(TOOLKIT / "scripts/private_guard.R"), "--neutral"],
            input=json.dumps(request), text=True, capture_output=True, timeout=20,
            cwd=cwd, env={**os.environ, "CASCADIATOOLS_ROOT": str(TOOLKIT)},
        )
        if result.returncode:
            raise ValueError(f"Privacy guard failed: {result.stderr.strip()}")
        decision = json.loads(result.stdout)
        if not isinstance(decision, dict):
            raise ValueError("Invalid privacy decision")
        if decision.get("decision") == "allow":
            return None
        if decision.get("decision") != "deny" or not decision.get("reason"):
            raise ValueError("Invalid privacy decision")
        return {"action": "block", "message": str(decision["reason"])}
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired) as error:
        LOGGER.error("Cascadia privacy enforcement failed: %s", error)
        return {"action": "block", "message": f"Cascadia privacy enforcement failed: {error}"}


def register(ctx: PluginContext) -> None:
    from agent.runtime_cwd import resolve_agent_cwd

    manifest = json.loads((PACKAGE / "cascadia-build.json").read_text())
    if manifest["host"] != "hermes" or not (TOOLKIT / "core/run.R").is_file():
        raise ValueError("Install the complete built Hermes package, not the adapter source")
    for name in manifest["skills"]:
        path = PACKAGE / "skills" / name / "SKILL.md"
        description = next(line.removeprefix("description:").strip()
                           for line in path.read_text().splitlines() if line.startswith("description:"))
        ctx.register_skill(name, path, description)

    def pre_tool_call(tool_name: str, args: dict, **kwargs: object) -> dict[str, str] | None:
        try:
            cwd = resolve_agent_cwd()
        except (OSError, ValueError, RuntimeError) as error:
            LOGGER.error("Cascadia session directory unavailable: %s", error)
            return {"action": "block", "message": f"Cascadia session directory unavailable: {error}"}
        return enforce(tool_name, args, cwd)

    ctx.register_hook("pre_tool_call", pre_tool_call)
