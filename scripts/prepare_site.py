#!/usr/bin/env python3
"""Extract the tracked V3 release ZIP into a GitHub Pages-ready directory."""

from __future__ import annotations

import argparse
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


def prepare(archive: Path, destination: Path) -> None:
    if not archive.is_file() or not zipfile.is_zipfile(archive):
        raise ValueError(f"Not a readable ZIP: {archive}")

    with tempfile.TemporaryDirectory(prefix="blade-forge-") as temp:
        unpacked = Path(temp)
        with zipfile.ZipFile(archive) as package:
            members = package.infolist()
            if len(members) > 50000:
                raise ValueError("Unexpectedly large number of ZIP entries")
            if sum(info.file_size for info in members) > 1_500_000_000:
                raise ValueError("Uncompressed ZIP is unexpectedly large")
            for info in members:
                normalized = info.filename.replace(chr(92), '/')
                relative = PurePosixPath(normalized)
                if (not info.filename or relative.is_absolute() or
                    '..' in relative.parts or (len(relative.parts[0]) > 1 and relative.parts[0][1] == ':')):
                    raise ValueError(f"Unsafe ZIP path: {info.filename}")
                unix_mode = info.external_attr >> 16
                if stat.S_IFMT(unix_mode) == stat.S_IFLNK:
                    raise ValueError(f"ZIP contains a symbolic link: {info.filename}")
                if relative.parts and relative.parts[0] == '__MACOSX':
                    continue
                extracted = unpacked.joinpath(*relative.parts)
                if info.is_dir():
                    extracted.mkdir(parents=True, exist_ok=True)
                else:
                    extracted.parent.mkdir(parents=True, exist_ok=True)
                    with package.open(info) as source, extracted.open('wb') as output:
                        shutil.copyfileobj(source, output)

        candidates = [p for p in unpacked.rglob('*') if p.is_file() and p.name.lower() == 'index.html']
        candidates = [p for p in candidates if not {'node_modules', 'docs', 'examples', 'test', 'tests'} & set(part.lower() for part in p.relative_to(unpacked).parts)]
        if not candidates:
            html = [p for p in unpacked.rglob('*.html') if p.is_file() and '__MACOSX' not in p.parts]
            if len(html) == 1:
                html[0].rename(html[0].with_name('index.html'))
                candidates = [html[0].with_name('index.html')]
        if not candidates:
            sample = [str(p.relative_to(unpacked)) for p in list(unpacked.rglob('*'))[:30]]
            raise ValueError(f"No deployable index.html found. Sample paths: {sample}")
        candidates.sort(key=lambda p: (len(p.relative_to(unpacked).parts), str(p).lower()))
        entry = candidates[0]
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(entry.parent, destination)
        files = [p for p in destination.rglob('*') if p.is_file()]
        print(f"Selected entry: {entry.relative_to(unpacked)}")
        print(f"Deployed {len(files)} files into {destination}")
        print('Root files:', ', '.join(p.name for p in destination.iterdir())[:2000])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    prepare(args.archive, args.destination)
