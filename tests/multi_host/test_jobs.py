import os
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

from test_packages import packaging


@unittest.skipIf(os.name != "posix" or shutil.which("sbatch") is not None,
                 "Probe is for local POSIX jobs, never a shared scheduler")
class JobTests(unittest.TestCase):
    def test_job_failure_preserves_exit_code_and_log(self):
        with tempfile.TemporaryDirectory(prefix="cascadia job error ") as temporary:
            root = Path(temporary)
            for host in packaging.HOSTS:
                with self.subTest(host=host):
                    package = packaging.build(host, root / "packages")
                    toolkit = package if host == "claude" else package / "toolkit"
                    project = root / host
                    project.mkdir()
                    log = project / "job.log"
                    result = subprocess.run(
                        ["bash", str(toolkit / "scripts/ejob"), "-l", str(log), "--",
                         str(toolkit / "scripts/Rscript"), str(toolkit / "core/run.R"),
                         "describe", "cascadia-test-nonexistent-module"],
                        cwd=project, env={**os.environ, "CASCADIATOOLS_ROOT": str(toolkit)},
                        capture_output=True, text=True, timeout=30,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(f"exit {result.returncode}", result.stdout)
                    self.assertIn("cascadia-test-nonexistent-module", log.read_text())

    def test_cancelling_local_job_terminates_its_own_process_group(self):
        with tempfile.TemporaryDirectory(prefix="cascadia cancellation ") as temporary:
            root = Path(temporary)
            for host in packaging.HOSTS:
                with self.subTest(host=host):
                    package = packaging.build(host, root / "packages")
                    toolkit = package if host == "claude" else package / "toolkit"
                    project = root / host
                    project.mkdir()
                    log = project / "job.log"
                    script = project / "cancellation.R"
                    script.write_text('cat("cascadia test job ready\\n"); flush.console(); Sys.sleep(60)\n')
                    job = subprocess.Popen(
                        ["bash", str(toolkit / "scripts/ejob"), "-c", "1", "-l", str(log), "--",
                         str(toolkit / "scripts/Rscript"), str(script)],
                        cwd=project, env={**os.environ, "CASCADIATOOLS_ROOT": str(toolkit)},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
                    )
                    try:
                        deadline = time.monotonic() + 15
                        while time.monotonic() < deadline:
                            if job.poll() is not None:
                                self.fail(f"Job exited before cancellation: {log.read_text()}")
                            if log.exists() and "cascadia test job ready" in log.read_text():
                                break
                            time.sleep(0.1)
                        else:
                            self.fail("Job never reached its running state")
                    finally:
                        try:
                            os.killpg(job.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        job.wait(timeout=10)
                    self.assertNotEqual(job.returncode, 0)
                    deadline = time.monotonic() + 5
                    while True:
                        processes = subprocess.check_output(
                            ["ps", "-axo", "pgid=,stat="], text=True,
                        )
                        live = [line for line in processes.splitlines()
                                if line.split()[0] == str(job.pid)
                                and not line.split()[1].startswith("Z")]
                        if not live or time.monotonic() >= deadline:
                            break
                        time.sleep(0.05)
                    self.assertFalse(live, "Cancelled job still has live child processes")


if __name__ == "__main__":
    unittest.main()
