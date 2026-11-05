"""Build an allowlisted, secret-free static BAS tree for Workers Assets.

Run from community-api as:
  python scripts/build_studio_assets.py

Do not deploy this config without copying the actual staging bindings and
reconfirming every feature flag. The current Wrangler example is intentionally
fail-closed and is not a live deployment configuration.
"""
from pathlib import Path
from shutil import copy2, rmtree
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "community-api" / ".studio-assets-build"
ALLOWED_DIRS = ("js", "css", "vendor", "icons", "diagnostics")
ALLOWED_ROOT = ("index.html", "manifest.webmanifest", "sw.js")
MAX_FILE = 1_000_000
MAX_TOTAL = 15_000_000

if OUT.exists():
    rmtree(OUT)
OUT.mkdir()
count = total = 0
for relative in ALLOWED_ROOT:
    source = ROOT / relative
    if not source.exists():
        continue
    target = OUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink() or not source.is_file() or source.stat().st_size > MAX_FILE:
        raise RuntimeError(f"unsafe root asset: {relative}")
    copy2(source, target)
    count += 1
    total += source.stat().st_size
for directory in ALLOWED_DIRS:
    source = ROOT / directory
    if not source.is_dir():
        continue
    for file in source.rglob("*"):
        if not file.is_file():
            continue
        relative = file.relative_to(ROOT)
        if file.is_symlink() or file.stat().st_size > MAX_FILE:
            raise RuntimeError(f"unsafe asset: {relative}")
        if file.suffix.lower() not in (
            ".js", ".css", ".png", ".jpg", ".jpeg", ".svg",
            ".webp", ".woff2", ".woff", ".ico", ".json",
            ".wav", ".mp3", ".webmanifest"
        ):
            continue
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        copy2(file, target)
        count += 1
        total += file.stat().st_size
        if total > MAX_TOTAL:
            raise RuntimeError("site asset budget exceeded")
assert (OUT / "index.html").is_file()
assert (OUT / "js" / "i18n.js").is_file()
print(json.dumps({"directory": str(OUT), "files": count, "bytes": total}))
