#!/usr/bin/env python3
"""Build relocatable agent packages from one tracked scientific toolkit."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLKIT = ROOT / "plugins" / "cascadia-tools"
HOSTS = ("claude", "opencode", "hermes")
DEFAULT_OUTPUT = ROOT / "dist" / "multi-host"
PAYLOAD_DIRS = {"core", "modules", "scripts", "tools", "docs"}
SKILL_ROOT_NOTE = (
    "\n> Resolve the toolkit at `../../toolkit` relative to this skill's own "
    "directory, not the project's cwd. In EVERY shell invocation, first set "
    "and export `CASCADIATOOLS_ROOT` to that absolute directory; shell state "
    "does not persist between tool calls. Keep outputs in the active project. "
    "Use local execution only; remote backends are not supported by this adapter.\n"
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metadata() -> dict[str, str]:
    return json.loads((TOOLKIT / ".claude-plugin" / "plugin.json").read_text())


def payload_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", str(TOOLKIT.relative_to(ROOT))],
        cwd=ROOT, check=True, capture_output=True,
    )
    files = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        path = ROOT / raw.decode()
        relative = path.relative_to(TOOLKIT)
        if relative.parts[0] in PAYLOAD_DIRS or relative.as_posix() == "catalog.md":
            if path.is_symlink() or not path.is_file():
                raise ValueError(f"Payload must be a regular tracked file: {path}")
            files.append(path)
    if not files:
        raise ValueError("No tracked toolkit payload found")
    return sorted(files)


def skill_metadata(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", text, re.S)
    if not match:
        raise ValueError("Skill must have YAML frontmatter")
    fields = {}
    for line in match[1].splitlines():
        key, separator, value = line.partition(":")
        if not separator or key not in {"name", "description", "allowed-tools"}:
            raise ValueError(f"Unsupported skill frontmatter: {line}")
        fields[key] = value.strip()
    if not fields.get("name") or not fields.get("description"):
        raise ValueError("Skill name and description are required")
    return fields, match[2]


def render_skill(path: Path, host: str, names: list[str]) -> str:
    text = path.read_text()
    if host == "claude":
        return text
    fields, body = skill_metadata(text)
    name = fields["name"]
    if name == "cascadia-private":
        body = (ROOT / "integrations" / "private-mode.md").read_text()
    else:
        body = body.replace("${CLAUDE_PLUGIN_ROOT}", "${CASCADIATOOLS_ROOT}")
        body = body.replace("restart Claude", f"restart {host}")
        body = body.replace("with the Read tool", "with the host's image-reading tool")
    if host == "hermes":
        pattern = r"(?<![\w:-])(" + "|".join(re.escape(n) for n in names) + r")(?![\w:-])"
        body = re.sub(pattern, r"cascadia-tools:\1", body)
    if "CLAUDE_" in body or ".claude/" in body or "allowed-tools:" in body:
        raise ValueError(f"Untranslated Claude construct in {name}")
    unknown = set(re.findall(r"\$\{([^}]+)\}", body)) - {"CASCADIATOOLS_ROOT"}
    if unknown:
        raise ValueError(f"Unresolved variables in {name}: {sorted(unknown)}")
    return (
        f"---\nname: {name}\ndescription: {fields['description']}\n---\n"
        + SKILL_ROOT_NOTE + "\n" + body.lstrip()
    )


def archive(package: Path, target: Path) -> None:
    with target.open("wb") as stream, gzip.GzipFile(
        fileobj=stream, mode="wb", filename="", mtime=0,
    ) as compressed, tarfile.open(fileobj=compressed, mode="w") as tar:
        for path in sorted(package.rglob("*")):
            if not path.is_file():
                continue
            info = tar.gettarinfo(str(path), arcname=f"cascadia-tools/{path.relative_to(package)}")
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            with path.open("rb") as source:
                tar.addfile(info, source)


def build(host: str, output: Path) -> Path:
    output.mkdir(parents=True, exist_ok=True)
    target = output / host
    if target.exists():
        marker = target / "cascadia-build.json"
        if target.is_symlink() or not marker.is_file() or json.loads(marker.read_text()).get("host") != host:
            raise ValueError(f"Refusing to replace an unmanaged directory: {target}")
    skills = sorted((TOOLKIT / "skills").glob("*/SKILL.md"))
    names = [p.parent.name for p in skills]
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    with tempfile.TemporaryDirectory(prefix=f".{host}-", dir=output) as temporary:
        package = Path(temporary) / "package"
        package.mkdir()
        payload = package if host == "claude" else package / "toolkit"
        checksums = {}
        for source in payload_files():
            relative = source.relative_to(TOOLKIT)
            destination = payload / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            checksums[relative.as_posix()] = digest(destination)
        for source in skills:
            destination = package / "skills" / source.parent.name / "SKILL.md"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(render_skill(source, host, names))
        if host == "claude":
            for directory in (".claude-plugin", "hooks"):
                shutil.copytree(TOOLKIT / directory, package / directory)
        else:
            adapter = ROOT / "integrations" / host
            if adapter.exists():
                for source in sorted(adapter.iterdir()):
                    if source.is_file() and source.suffix in {".js", ".json", ".py", ".yaml"}:
                        shutil.copy2(source, package / source.name)
            version = metadata()["version"]
            if host == "hermes":
                (package / "plugin.yaml").write_text(
                    f"name: cascadia-tools\nversion: {version}\n"
                    "description: Validated ecological analyses and protocols\n"
                    "requires_hermes: '>=0.23.0,<0.24.0'\n"
                    "provides_hooks:\n  - pre_tool_call\n"
                )
            else:
                (package / "package.json").write_text(json.dumps({
                    "name": "cascadia-tools-opencode", "version": version,
                    "type": "module", "exports": "./index.js", "engines": {"node": ">=22"},
                }, indent=2) + "\n")
        manifest = {
            "host": host, "version": metadata()["version"], "revision": revision,
            "skills": names, "payload": checksums,
        }
        manifest["files"] = {
            p.relative_to(package).as_posix(): digest(p)
            for p in sorted(package.rglob("*")) if p.is_file()
        }
        (package / "cascadia-build.json").write_text(json.dumps(manifest, indent=2) + "\n")
        if target.exists():
            shutil.rmtree(target)
        shutil.move(str(package), target)
    check(host, output)
    archive(target, output / f"cascadia-tools-{host}-{metadata()['version']}.tar.gz")
    return target


def check(host: str, output: Path) -> dict:
    package = output / host
    manifest = json.loads((package / "cascadia-build.json").read_text())
    if manifest["host"] != host or manifest["version"] != metadata()["version"]:
        raise ValueError(f"Package identity mismatch: {package}")
    actual = {
        p.relative_to(package).as_posix(): digest(p)
        for p in sorted(package.rglob("*")) if p.is_file() and p.name != "cascadia-build.json"
    }
    if actual != manifest["files"]:
        raise ValueError(f"Package integrity mismatch: {package}")
    skills = sorted(p.parent.name for p in (package / "skills").glob("*/SKILL.md"))
    if skills != manifest["skills"]:
        raise ValueError(f"Skill inventory mismatch: {package}")
    for name in skills:
        text = (package / "skills" / name / "SKILL.md").read_text()
        fields, _ = skill_metadata(text)
        if fields["name"] != name:
            raise ValueError(f"Skill ID mismatch: {name}")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check"))
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        selected = HOSTS if args.host == "all" else (args.host,)
        manifests = []
        for host in selected:
            if args.command == "build":
                build(host, args.output)
            manifests.append(check(host, args.output))
            print(f"{host}: {len(manifests[-1]['skills'])} skills; package verified")
        if any(m["payload"] != manifests[0]["payload"] for m in manifests[1:]):
            raise ValueError("Shared scientific payload differs between hosts")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"multi-host: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
