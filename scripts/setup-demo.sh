#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"
if [ "$#" -gt 1 ] || { [ -n "$MODE" ] && [ "$MODE" != "--reseed" ]; }; then
  echo "Usage: bash scripts/setup-demo.sh [--reseed]" >&2
  exit 1
fi
command -v node >/dev/null || { echo "Install Node.js 18+ first." >&2; exit 1; }
command -v python3 >/dev/null || { echo "Install Python 3.9+ first." >&2; exit 1; }
mkdir -p "$ROOT/.tools/bin"
export PATH="$ROOT/.tools/bin:$PATH"
if ! command -v duckdb >/dev/null; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-*)
      ASSET=duckdb_cli-osx-universal.zip
      SHA=d6ac869dad8b197ce372b20162e2a95d20fc93b6e105505921e143da700bb263 ;;
    Linux-x86_64)
      ASSET=duckdb_cli-linux-amd64.zip
      SHA=3e29952507ebd202e8d0e2678df4490689bfc9c86534e240b541791b969df0e1 ;;
    Linux-aarch64|Linux-arm64)
      ASSET=duckdb_cli-linux-arm64.zip
      SHA=646f60c92268c441f0095ce855e16528a8539e466da2788649f359be8cbdc8d1 ;;
    *) echo "Install the DuckDB CLI for this platform from https://duckdb.org/docs/installation/" >&2; exit 1 ;;
  esac
  ARCHIVE="$ROOT/.tools/$ASSET"
  curl --fail --location --max-time 90 \
    "https://github.com/duckdb/duckdb/releases/download/v1.4.1/$ASSET" --output "$ARCHIVE"
  python3 - "$ARCHIVE" "$SHA" "$ROOT/.tools/bin/duckdb" <<'PY'
import hashlib, pathlib, sys, zipfile
archive, expected, destination = sys.argv[1:]
if hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest() != expected:
    sys.exit("DuckDB archive checksum mismatch; refusing installation")
with zipfile.ZipFile(archive) as bundle:
    pathlib.Path(destination).write_bytes(bundle.read("duckdb"))
PY
  chmod +x "$ROOT/.tools/bin/duckdb"
  rm "$ARCHIVE"
fi
duckdb --version
cd "$ROOT"
node scripts/package.mjs --check
node scripts/workspace.mjs
cd examples/support-desk
if [ "$MODE" = "--reseed" ]; then
  echo "Rebuilding only warehouse/zone1.duckdb and zone2.duckdb from synthetic data."
  python3 seed.py
elif [ ! -e warehouse/zone1.duckdb ] && [ ! -e warehouse/zone2.duckdb ]; then
  python3 seed.py
elif [ ! -e warehouse/zone1.duckdb ] || [ ! -e warehouse/zone2.duckdb ]; then
  echo "Only one zone exists. Review it; use --reseed explicitly to rebuild both." >&2
  exit 1
fi
python3 seed.py --check
echo "Setup local pronto. Na raiz do repo: export PATH=\"\$PWD/.tools/bin:\$PATH\""
echo "Depois: node scripts/github.mjs check && copilot --agent forge-init"
