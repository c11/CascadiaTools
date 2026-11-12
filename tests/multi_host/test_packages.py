import importlib.util
import hashlib
import json
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("multi_host", ROOT / "tools" / "multi_host.py")
assert SPEC is not None and SPEC.loader is not None
packaging = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(packaging)


class PackageTests(unittest.TestCase):
    def test_relocatable_packages_share_payload_and_preserve_claude(self):
        with tempfile.TemporaryDirectory(prefix="cascadia packages ") as temporary:
            output = Path(temporary)
            manifests = []
            for host in packaging.HOSTS:
                package = packaging.build(host, output)
                manifest = packaging.check(host, output)
                manifests.append(manifest)
                self.assertEqual(len(manifest["skills"]), 14)
                for name in ("LICENSE", "LICENSE-docs", "CITATION.cff"):
                    self.assertEqual((package / name).read_bytes(), (ROOT / name).read_bytes())
                for name in manifest["skills"]:
                    source = packaging.TOOLKIT / "skills" / name / "SKILL.md"
                    rendered = (package / "skills" / name / "SKILL.md").read_text()
                    if host == "claude":
                        self.assertEqual(rendered, source.read_text())
                    else:
                        self.assertNotIn("CLAUDE_PLUGIN_ROOT", rendered)
                        self.assertNotIn(".claude/settings", rendered)
                        self.assertNotIn(str(ROOT), rendered)
                self.assertTrue((package / ("scripts" if host == "claude" else "toolkit/scripts") / "Rscript").stat().st_mode & 0o111)
            self.assertEqual(manifests[0]["payload"], manifests[1]["payload"])
            self.assertEqual(manifests[0]["payload"], manifests[2]["payload"])
            text = (output / "hermes/skills/eco-analyze/SKILL.md").read_text()
            self.assertIn("cascadia-tools:eco-analysis-plan", text)
            self.assertEqual(manifests[0]["version"], json.loads(
                (packaging.TOOLKIT / ".claude-plugin/plugin.json").read_text()
            )["version"])

    def test_integrity_check_rejects_changed_payload(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            package = packaging.build("hermes", output)
            (package / "toolkit/core/run.R").write_text("corrupted")
            with self.assertRaisesRegex(ValueError, "integrity"):
                packaging.check("hermes", output)

    def test_renderer_rejects_unknown_host_construct(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "SKILL.md"
            source.write_text("---\nname: demo\ndescription: Test\n---\n${CLAUDE_UNKNOWN}")
            with self.assertRaisesRegex(ValueError, "Claude construct"):
                packaging.render_skill(source, "opencode", ["demo"])

    def test_release_archive_contains_complete_installable_package(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            for host in packaging.HOSTS:
                packaging.build(host, output)
                manifest = packaging.check(host, output)
                archive = output / f"cascadia-tools-{host}-{manifest['version']}.tar.gz"
                with tarfile.open(archive) as bundle:
                    members = {}
                    for member in bundle.getmembers():
                        self.assertTrue(member.isfile())
                        self.assertTrue(member.name.startswith("cascadia-tools/"))
                        stream = bundle.extractfile(member)
                        assert stream is not None
                        members[member.name.removeprefix("cascadia-tools/")] = (
                            hashlib.sha256(stream.read()).hexdigest())
                    members.pop("cascadia-build.json")
                    self.assertEqual(members, manifest["files"])
            package = output / "opencode"
            manifest = packaging.check("opencode", output)
            (package / "index.js").unlink()
            manifest["files"].pop("index.js")
            (package / "cascadia-build.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "entry point"):
                packaging.check("opencode", output)

    def test_rebuild_is_deterministic_and_refuses_unmanaged_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            packaging.build("opencode", output)
            archive = next(output.glob("*.tar.gz"))
            before = archive.read_bytes()
            packaging.build("opencode", output)
            self.assertEqual(before, archive.read_bytes())
            (output / "hermes").mkdir()
            (output / "hermes/user.txt").write_text("preserve")
            with self.assertRaisesRegex(ValueError, "unmanaged"):
                packaging.build("hermes", output)
            self.assertEqual((output / "hermes/user.txt").read_text(), "preserve")


if __name__ == "__main__":
    unittest.main()
