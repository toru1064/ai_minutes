#!/usr/bin/env python3
"""Convert a supported requirements file to UTF-8 without modifying the source."""

from __future__ import annotations

import argparse
import codecs
import sys
from pathlib import Path


def decode_requirements(data: bytes) -> str:
    """Decode UTF-8 or BOM-marked UTF-16 requirements bytes strictly."""
    if data.startswith(codecs.BOM_UTF8):
        encoding = "utf-8-sig"
    elif data.startswith(codecs.BOM_UTF16_LE):
        encoding = "utf-16-le"
        data = data[len(codecs.BOM_UTF16_LE) :]
    elif data.startswith(codecs.BOM_UTF16_BE):
        encoding = "utf-16-be"
        data = data[len(codecs.BOM_UTF16_BE) :]
    else:
        encoding = "utf-8"

    try:
        return data.decode(encoding, errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError(
            "input is not valid UTF-8, UTF-8 with BOM, or BOM-marked UTF-16"
        ) from exc


def prepare_requirements(source: Path, destination: Path) -> None:
    """Write decoded requirements as BOM-free UTF-8 to a different path."""
    if source.resolve() == destination.resolve():
        raise ValueError("input and output paths must be different")

    try:
        data = source.read_bytes()
    except OSError as exc:
        raise ValueError(f"could not read input file: {exc}") from exc

    text = decode_requirements(data)
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(text.encode("utf-8"))
    except OSError as exc:
        raise ValueError(f"could not write output file: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert a requirements file to a temporary UTF-8 file."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    try:
        prepare_requirements(args.input, args.output)
    except ValueError as exc:
        print(f"prepare_requirements: error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
