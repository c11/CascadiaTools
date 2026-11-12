import importlib.util
import os
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from test_packages import packaging


class HermesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="hermes package ")
        package = packaging.build("hermes", Path(cls.temporary.name))
        spec = importlib.util.spec_from_file_location("cascadia_hermes_test", package / "__init__.py")
        assert spec is not None and spec.loader is not None
        cls.adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.adapter)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_project_scoped_file_reads_and_unsupported_tools(self):
        with tempfile.TemporaryDirectory() as temporary:
            cwd = Path(temporary)
            (cwd / ".cascadia").mkdir()
            (cwd / ".cascadia/private.json").write_text('{"private":true}')
            (cwd / "results").mkdir()
            for name, args, denied in [
                ("read_file", {"path": "data_raw/synthetic.csv"}, True),
                ("read_file", {"path": "results/public.csv"}, False),
                ("search_files", {"pattern": "x"}, True),
                ("delegate_task", {}, True),
                ("skill_view", {"name": "cascadia-tools:eco-analyze"}, False),
            ]:
                with self.subTest(name=name):
                    result = self.adapter.enforce(name, args, cwd)
                    self.assertEqual(result is not None, denied)
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda path: self.adapter.enforce(
                        "read_file", {"path": str(cwd / "data_raw/x")}, path),
                    [cwd, cwd / "results"],
                ))
            self.assertTrue(all(result["action"] == "block" for result in results))
            self.assertEqual(self.adapter.project_root(cwd / "results"), cwd.resolve())

    def test_unavailable_guard_and_timeout_block_explicitly(self):
        with tempfile.TemporaryDirectory() as temporary:
            cwd = Path(temporary)
            (cwd / ".cascadia").mkdir()
            (cwd / ".cascadia/private.json").write_text('{"private":true}')
            for failure in [OSError("R unavailable"), subprocess.TimeoutExpired("guard", 20)]:
                with patch.object(self.adapter.subprocess, "run", side_effect=failure):
                    with self.assertLogs(self.adapter.LOGGER, level="ERROR"):
                        result = self.adapter.enforce("read_file", {"path": "results/x"}, cwd)
                    self.assertEqual(result["action"], "block")
                    self.assertIn("failed", result["message"])
            with patch.object(self.adapter.subprocess, "run",
                              return_value=subprocess.CompletedProcess("guard", 0, "[]", "")):
                with self.assertLogs(self.adapter.LOGGER, level="ERROR"):
                    result = self.adapter.enforce("read_file", {"path": "results/x"}, cwd)
                self.assertEqual(result["action"], "block")

    def test_public_project_does_not_run_guard_or_mutate_environment(self):
        before = os.environ.copy()
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(self.adapter.subprocess, "run") as process:
                self.assertIsNone(self.adapter.enforce("delegate_task", {}, Path(temporary)))
                process.assert_not_called()
        self.assertEqual(before, dict(os.environ))


if __name__ == "__main__":
    unittest.main()
