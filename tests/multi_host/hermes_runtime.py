"""Optional real-host probe; run with uv and the installed Hermes interpreter."""

import argparse
import importlib.util
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--package", type=Path, required=True)
parser.add_argument("--project", type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.source))
import hermes_bootstrap
from agent.runtime_cwd import reset_session_cwd, set_session_cwd
from hermes_cli.plugins import PluginContext, PluginManifest, get_plugin_manager, get_pre_tool_call_directive

package = args.package.resolve()
spec = importlib.util.spec_from_file_location("cascadia_runtime_probe", package / "__init__.py")
assert spec is not None and spec.loader is not None
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
manager = get_plugin_manager()
context = PluginContext(PluginManifest(name="cascadia-tools", path=str(package)), manager)
adapter.register(context)
assert len(manager.list_plugin_skills("cascadia-tools")) == 14
token = set_session_cwd(str(args.project.resolve()))
try:
    directive, reason = get_pre_tool_call_directive("read_file", {"path": "data_raw/synthetic.csv"})
    assert directive == "block" and reason, (directive, reason)
    directive, reason = get_pre_tool_call_directive("read_file", {"path": "results/public.csv"})
    assert directive is None, (directive, reason)
    directive, reason = get_pre_tool_call_directive("terminal", {"command": "cat data_raw/synthetic.csv"})
    assert directive == "block" and reason, (directive, reason)
finally:
    reset_session_cwd(token)
print(json.dumps({"registered_skills": 14, "protected_read": "block",
                  "protected_shell": "block", "public_read": "allow"}))
