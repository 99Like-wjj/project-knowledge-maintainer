#!/usr/bin/env python3
"""Build an allowlisted, dependency-free Skill distribution outside the source tree."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('changes', 'cli', 'contract', 'schema.generated', 'store', 'writer')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    out = args.output.expanduser().resolve()
    if not args.output.is_absolute() or out == ROOT or ROOT in out.parents:
        parser.error('output must be an absolute directory outside the repository')
    package = json.loads((ROOT / 'package.json').read_text())
    version = package['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        parser.error('stable semantic version required')
    skill = ROOT / 'skills/project-knowledge-maintainer'
    if f'version: "{version}"' not in (skill / 'SKILL.md').read_text():
        parser.error('Skill version mismatch')
    destination = out / 'project-knowledge-maintainer'
    archive = out / f'project-knowledge-maintainer-{version}.zip'
    sums = out / 'SHA256SUMS'
    if any(p.exists() for p in (destination, archive, sums)):
        parser.error('refusing to overwrite existing release artifacts')
    sources = {name: skill / name for name in ('SKILL.md', 'INSTALL.md', 'references/format-and-tools.md')}
    sources['schemas/project-knowledge.schema.json'] = ROOT / 'schemas/project-knowledge.schema.json'
    for name in MODULES:
        sources[f'runtime/src/{name}.mjs'] = ROOT / f'.build/src/{name}.mjs'
    for target, source in sources.items():
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(ROOT):
            parser.error(f'invalid source: {target}')
        source.read_text(encoding='utf-8')
    out.mkdir(parents=True, exist_ok=True)
    destination.mkdir()
    for target, source in sources.items():
        file = destination / target
        file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, file)
    metadata = {'name': package['name'], 'version': version, 'private': True, 'type': 'module', 'engines': {'node': '>=22'}}
    (destination / 'package.json').write_text(json.dumps(metadata, indent=2) + '\n')
    files = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(destination.rglob('*')) if p.is_file()}
    manifest = {'name': package['name'], 'version': version, 'knowledgeFormatVersion': 3, 'sha256': files}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as z:
        for file in sorted(destination.rglob('*')):
            if file.is_file():
                info = zipfile.ZipInfo(str(file.relative_to(out)), (2026, 11, 4, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, file.read_bytes())
    sums.write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n')
    print(json.dumps({'directory': str(destination), 'archive': str(archive), 'checksums': str(sums), 'files': len(files) + 1}, indent=2))


if __name__ == '__main__':
    main()
