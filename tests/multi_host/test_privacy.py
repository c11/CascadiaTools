import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLKIT = ROOT / "plugins/cascadia-tools"


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="cascadia privacy ")
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name)
        (self.project / ".cascadia").mkdir()
        (self.project / ".cascadia/private.json").write_text(json.dumps({
            "private": True, "data_dirs": ["data_raw", "data"],
        }))
        (self.project / "data_raw").mkdir()
        (self.project / "data_raw/synthetic.csv").write_text("synthetic\n")
        (self.project / "results").mkdir()

    def neutral(self, operation, **kwargs):
        request = {
            "version": 1, "host": "test", "project": str(self.project),
            "operation": operation, "toolkit": str(TOOLKIT), **kwargs,
        }
        result = subprocess.run(
            ["bash", str(TOOLKIT / "scripts/Rscript"),
             str(TOOLKIT / "scripts/private_guard.R"), "--neutral"],
            input=json.dumps(request), text=True, capture_output=True, check=False,
        )
        return result, json.loads(result.stdout)

    def test_file_boundaries_and_search_scopes(self):
        for operation, paths, expected in [
            ("read", ["data_raw/synthetic.csv"], "deny"),
            ("write", [str(self.project / "data/new.csv")], "deny"),
            ("read", ["results/public.csv"], "allow"),
            ("search", ["."], "deny"),
            ("search", ["results"], "allow"),
        ]:
            with self.subTest(operation=operation, paths=paths):
                process, result = self.neutral(operation, paths=paths, pattern="sample")
                self.assertEqual(process.returncode, 0, process.stderr)
                self.assertEqual(result["decision"], expected)

    def test_symlink_and_parent_path_cannot_escape_guard(self):
        (self.project / "alias").symlink_to(self.project / "data_raw", target_is_directory=True)
        for path in ["alias/synthetic.csv", "results/../data_raw/synthetic.csv"]:
            _, result = self.neutral("read", paths=[path])
            self.assertEqual(result["decision"], "deny")

    def test_shell_allowlist_rejects_printing_and_composition(self):
        pipeline = f'"{TOOLKIT}/scripts/Rscript" "{TOOLKIT}/core/run.R" fit glm --config config.yaml'
        for command, expected in [
            ("cat data_raw/synthetic.csv", "deny"),
            ("python user_script.py", "deny"),
            (pipeline, "allow"),
            (pipeline + "; cat data_raw/synthetic.csv", "deny"),
            (f'export CASCADIATOOLS_ROOT="{TOOLKIT}"; ' + pipeline, "allow"),
        ]:
            with self.subTest(command=command):
                _, result = self.neutral("shell", command=command)
                self.assertEqual(result["decision"], expected)

    def test_unsupported_tools_and_missing_fields_fail_closed(self):
        for operation in ["delegate", "external-tool"]:
            _, result = self.neutral(operation)
            self.assertEqual(result["decision"], "deny")
        process, result = self.neutral("read")
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(result["decision"], "error")
        self.assertIn("Missing file path", process.stderr)

    def test_malformed_config_is_reported_not_allowed(self):
        (self.project / ".cascadia/private.json").write_text("{")
        process, result = self.neutral("read", paths=["results/public.csv"])
        self.assertNotEqual(process.returncode, 0)
        self.assertEqual(result["decision"], "error")
        self.assertIn("privacy guard", process.stderr)

    def test_project_state_does_not_leak(self):
        (self.project / ".cascadia/private.json").write_text('{"private":false}')
        _, result = self.neutral("read", paths=["data_raw/synthetic.csv"])
        self.assertEqual(result["decision"], "allow")
        with tempfile.TemporaryDirectory() as public:
            _, result = self.neutral("unsupported", project=public)
            self.assertEqual(result["decision"], "allow")

    def test_claude_translation_preserves_native_denial_and_public_access(self):
        for path, denied in [("data_raw/synthetic.csv", True), ("results/public.csv", False)]:
            process = subprocess.run(
                ["bash", str(TOOLKIT / "scripts/private_guard")],
                input=json.dumps({"tool_name": "Read", "tool_input": {"file_path": path}}),
                text=True, capture_output=True, check=True,
                env={**os.environ, "CLAUDE_PROJECT_DIR": str(self.project)},
            )
            if denied:
                self.assertEqual(json.loads(process.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")
            else:
                self.assertEqual(process.stdout, "")

    def test_claude_malformed_event_is_native_fail_closed(self):
        process = subprocess.run(
            ["bash", str(TOOLKIT / "scripts/private_guard")], input="{",
            text=True, capture_output=True, check=True,
            env={**os.environ, "CLAUDE_PROJECT_DIR": str(self.project)},
        )
        self.assertEqual(json.loads(process.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_claude_summary_command_and_empty_neutral_paths(self):
        process = subprocess.run(
            ["bash", str(TOOLKIT / "scripts/private_guard")],
            input=json.dumps({"tool_name": "Bash", "tool_input": {
                "command": f'"{TOOLKIT}/scripts/Rscript" "{TOOLKIT}/core/run.R" fit glm --config config.yaml',
            }}),
            text=True, capture_output=True, check=True,
            env={**os.environ, "CLAUDE_PROJECT_DIR": str(self.project)},
        )
        self.assertEqual(process.stdout, "")
        _, result = self.neutral("passive", paths=[])
        self.assertEqual(result["decision"], "allow")


if __name__ == "__main__":
    unittest.main()
