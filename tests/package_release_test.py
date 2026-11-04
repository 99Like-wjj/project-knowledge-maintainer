"""Check license delivery without modifying any published release artifacts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('changes', 'cli', 'contract', 'schema.generated', 'store', 'writer')


class PackageLicenseTests(unittest.TestCase):
    def test_archive_contains_license_metadata_and_integrity_record(self):
        with tempfile.TemporaryDirectory(prefix='maintainer-package-') as directory:
            out = Path(directory)
            subprocess.run(['python3', str(ROOT / 'tools/package-release.py'),
                            '--output', str(out)], check=True, capture_output=True, text=True)
            package = json.loads((ROOT / 'package.json').read_text())
            archive = out / f"project-knowledge-maintainer-{package['version']}.zip"
            prefix = 'project-knowledge-maintainer/'
            expected = {'LICENSE', 'SKILL.md', 'INSTALL.md', 'references/format-and-tools.md',
                        'schemas/project-knowledge.schema.json', 'package.json', 'manifest.json'}
            expected.update(f'runtime/src/{name}.mjs' for name in MODULES)
            with zipfile.ZipFile(archive) as zipped:
                self.assertIsNone(zipped.testzip())
                self.assertEqual(set(zipped.namelist()), {prefix + name for name in expected})
                self.assertEqual(zipped.read(prefix + 'LICENSE'), (ROOT / 'LICENSE').read_bytes())
                metadata = json.loads(zipped.read(prefix + 'package.json'))
                self.assertEqual(metadata['license'], 'MIT')
                self.assertEqual(metadata['license'], package['license'])
                manifest = json.loads(zipped.read(prefix + 'manifest.json'))
                self.assertEqual(set(manifest['sha256']), expected - {'manifest.json'})
                for name, digest in manifest['sha256'].items():
                    self.assertEqual(hashlib.sha256(zipped.read(prefix + name)).hexdigest(), digest)
                for name in MODULES:
                    self.assertEqual(zipped.read(prefix + f'runtime/src/{name}.mjs'),
                                     (ROOT / f'.build/src/{name}.mjs').read_bytes())
            self.assertEqual((out / 'SHA256SUMS').read_text(),
                             f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n')

    def test_missing_license_rejects_build_before_creating_output(self):
        with tempfile.TemporaryDirectory(prefix='maintainer-package-') as directory:
            fixture = Path(directory) / 'source'
            out = Path(directory) / 'output'
            files = ['tools/package-release.py', 'package.json',
                     'skills/project-knowledge-maintainer/SKILL.md',
                     'skills/project-knowledge-maintainer/INSTALL.md',
                     'skills/project-knowledge-maintainer/references/format-and-tools.md']
            for name in files:
                target = fixture / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            result = subprocess.run(['python3', str(fixture / 'tools/package-release.py'),
                                     '--output', str(out)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('invalid source: LICENSE', result.stderr)
            self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
