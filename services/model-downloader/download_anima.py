#!/usr/bin/env python3
"""
Download Metin2Alerts "Anima" 3D bundles (metin2alerts.com wiki / NPC viewer).

Examples:
  python download_anima.py blacksmith --cookie-file metin2alerts.com_cookies.txt
  python download_anima.py --url https://metin2alerts.com/en/wiki/npc/16001-weaponsmith-i

Requires curl_cffi (Chrome TLS fingerprint) + exported metin2alerts.com cookies
(including cf_clearance). API calls also need X-Challenge-Token from POST /api/wiki-token.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import struct
import sys
from http.cookiejar import MozillaCookieJar
from pathlib import Path

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None  # type: ignore[assignment]

BASE = "https://metin2alerts.com"
FOLDER_RE = re.compile(r"^[A-Za-z0-9_-]+$")
FOLDER_FROM_HTML_RES = [
    re.compile(r'folder\\":\\"([A-Za-z0-9_-]+)'),
    re.compile(r'"folder"\s*:\s*"([A-Za-z0-9_-]+)"'),
    re.compile(r"/store/data/anima/img/([A-Za-z0-9_-]+)\.webp"),
]
IMPERSONATE = "chrome131"


class Metin2AlertsSession:
    def __init__(
        self,
        cookie_file: Path | None,
        cookie_header: str | None,
        timeout: float,
    ) -> None:
        if cffi_requests is None:
            raise RuntimeError(
                "curl_cffi is required. Install with: pip install curl_cffi"
            )
        self._timeout = timeout
        self._challenge_token: str | None = None
        self._challenge_expires_ms: float = 0
        self._session = cffi_requests.Session(impersonate=IMPERSONATE)
        if cookie_file and cookie_file.is_file():
            jar = MozillaCookieJar(str(cookie_file))
            jar.load(ignore_discard=True, ignore_expires=True)
            for c in jar:
                if "metin2alerts" in c.domain:
                    self._session.cookies.set(
                        c.name, c.value, domain=c.domain, path=c.path
                    )
        if cookie_header and cookie_header.strip():
            self._session.headers["Cookie"] = cookie_header.strip()

    def _fetch_challenge_token(self, *, force: bool = False) -> str:
        import time

        now_ms = time.time() * 1000
        if (
            not force
            and self._challenge_token
            and now_ms < self._challenge_expires_ms - 10_000
        ):
            return self._challenge_token

        resp = self._session.post(f"{BASE}/api/wiki-token", timeout=self._timeout)
        if not resp.ok:
            raise RuntimeError(f"wiki-token HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        token = data.get("token") if isinstance(data, dict) else None
        if not isinstance(token, str) or not token:
            raise RuntimeError(f"Unexpected wiki-token response: {data!r}")
        expires = data.get("expiresAt") if isinstance(data, dict) else None
        if isinstance(expires, (int, float)):
            self._challenge_expires_ms = float(expires)
        else:
            self._challenge_expires_ms = now_ms + 15 * 60 * 1000
        self._challenge_token = token
        return token

    def get(
        self,
        url: str,
        *,
        referer: str | None = None,
        challenge: bool = True,
    ) -> bytes:
        headers: dict[str, str] = {}
        if referer:
            headers["Referer"] = referer

        def _do_get(force_token: bool) -> cffi_requests.Response:
            if challenge:
                headers["X-Challenge-Token"] = self._fetch_challenge_token(force=force_token)
            return self._session.get(url, headers=headers, timeout=self._timeout)

        resp = _do_get(force_token=False)
        if challenge and resp.status_code == 403:
            resp = _do_get(force_token=True)

        if resp.status_code == 403 and resp.text.strip().lower() == "forbidden":
            raise RuntimeError(
                f"HTTP 403 forbidden for {url}. Refresh cf_clearance cookie export."
            )
        if "Just a moment" in resp.text[:500]:
            raise RuntimeError(
                "Cloudflare challenge page. Re-export cookies after opening the site in Chrome."
            )
        if not resp.ok:
            raise RuntimeError(f"HTTP {resp.status_code} for {url}: {resp.text[:200]}")
        return resp.content

    def warm_wiki(self) -> None:
        self.get(
            f"{BASE}/en/wiki/npcs",
            referer=f"{BASE}/",
            challenge=False,
        )

    def resolve_folder_from_wiki_url(self, wiki_url: str) -> str:
        html = self.get(wiki_url, referer=f"{BASE}/", challenge=False).decode(
            "utf-8", errors="replace"
        )
        for pat in FOLDER_FROM_HTML_RES:
            m = pat.search(html)
            if m:
                return m.group(1)
        raise RuntimeError(
            "Could not find anima folder in wiki HTML. Pass folder name directly."
        )


def gunzip_if_needed(data: bytes) -> bytes:
    if len(data) >= 2 and data[0] == 0x1F and data[1] == 0x8B:
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
            result = stream.read(200 * 1024 * 1024 + 1)
        if len(result) > 200 * 1024 * 1024:
            raise ValueError('Bundle exceeds decompression limit')
        return result
    return data


def parse_anima_bundle(payload: bytes) -> dict[str, tuple[bytes, str]]:
    if len(payload) < 8:
        raise ValueError("Bundle too small")
    header_len = struct.unpack_from("<I", payload, 0)[0]
    if header_len <= 0 or 4 + header_len > len(payload):
        raise ValueError("Invalid bundle header length")
    meta = json.loads(payload[4 : 4 + header_len].decode("utf-8"))
    entries = meta.get("entries")
    if not isinstance(entries, list):
        raise ValueError("Bundle manifest missing entries[]")
    base = 4 + header_len
    files: dict[str, tuple[bytes, str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        key = entry.get("k")
        offset = entry.get("o")
        length = entry.get("l")
        mime = entry.get("m") or "application/octet-stream"
        if not isinstance(key, str) or not key:
            continue
        if key.startswith(("/", "\\")) or ":" in key or ".." in key.replace("\\", "/").split("/"):
            continue
        if not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length < 0:
            continue
        start = base + offset
        end = start + length
        if start < 0 or end > len(payload):
            raise ValueError(f"Entry out of range: {key}")
        files[key.replace("\\", "/")] = (payload[start:end], str(mime))
    if not files:
        raise ValueError("No files in bundle")
    return files


def fetch_anima_bundle(session: Metin2AlertsSession, folder: str) -> bytes:
    session._fetch_challenge_token()
    token_url = f"{BASE}/api/anima-token/{folder}"
    raw = session.get(token_url, referer=f"{BASE}/")
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict) or "url" not in data:
        raise RuntimeError(f"Unexpected anima-token response: {data!r}")
    bundle_path = data["url"]
    bundle_url = (
        f"{BASE}{bundle_path}"
        if isinstance(bundle_path, str) and bundle_path.startswith("/")
        else str(bundle_path)
    )
    raw_bundle = session.get(bundle_url, referer=f"{BASE}/")
    return gunzip_if_needed(raw_bundle)


def write_bundle_files(files: dict[str, tuple[bytes, str]], out_dir: Path) -> list[str]:
    written: list[str] = []
    for rel, (data, mime) in sorted(files.items()):
        dest = out_dir / rel.replace("/", "\\") if sys.platform == "win32" else out_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        written.append(rel)
    manifest = {
        "files": [
            {"path": p, "bytes": len(files[p][0]), "mime": files[p][1]} for p in written
        ]
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return written


def run_anima(
    *,
    folder: str | None = None,
    wiki_url: str | None = None,
    output: Path | None = None,
    cookie_file: Path | None = None,
    cookie_header: str | None = None,
    timeout: float = 120.0,
    list_only: bool = False,
) -> int:
    if not cookie_file and not cookie_header:
        print(
            "Error: provide cookie_file (e.g. metin2alerts.com_cookies.txt).",
            file=sys.stderr,
        )
        return 1

    try:
        session = Metin2AlertsSession(cookie_file, cookie_header, timeout)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    resolved_folder = folder
    if wiki_url:
        if resolved_folder:
            print(
                "Warning: folder ignored because wiki_url is set.",
                file=sys.stderr,
            )
        try:
            resolved_folder = session.resolve_folder_from_wiki_url(wiki_url)
        except RuntimeError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1
    if not resolved_folder:
        print("Error: provide folder or wiki_url.", file=sys.stderr)
        return 1
    if not FOLDER_RE.fullmatch(resolved_folder):
        print(f"Invalid folder name: {resolved_folder!r}", file=sys.stderr)
        return 1

    out_dir = output or Path(f"anima_{resolved_folder}")
    print(f"Folder: {resolved_folder}")
    if cookie_file:
        print(f"Cookies: {cookie_file}")
    print("Fetching anima token and bundle...")

    try:
        payload = fetch_anima_bundle(session, resolved_folder)
        files = parse_anima_bundle(payload)
    except (RuntimeError, ValueError, json.JSONDecodeError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    paths = sorted(files)
    print(f"Bundle contains {len(paths)} file(s):")
    for p in paths:
        print(f"  {p}  ({len(files[p][0])} bytes, {files[p][1]})")

    if list_only:
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    written = write_bundle_files(files, out_dir)
    print(f"Wrote {len(written)} file(s) to {out_dir.resolve()}")
    glbs = [p for p in written if p.lower().endswith(".glb")]
    if glbs:
        print("GLB:", ", ".join(glbs))
    return 0


def main(argv: list[str] | None = None) -> int:
    script_dir = Path(__file__).resolve().parent
    default_cookie = script_dir / "metin2alerts.com_cookies.txt"

    parser = argparse.ArgumentParser(
        description="Download Metin2Alerts Anima 3D bundle for an NPC/model folder."
    )
    parser.add_argument(
        "folder",
        nargs="?",
        help="Anima folder id (e.g. blacksmith). Omit if --url is set.",
    )
    parser.add_argument(
        "--url",
        help="Metin2Alerts wiki NPC/page URL; folder is parsed from HTML.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output directory (default: ./anima_<folder>)",
    )
    parser.add_argument(
        "--cookie",
        help='Raw Cookie header (usually not needed if --cookie-file is set).',
    )
    parser.add_argument(
        "--cookie-file",
        type=Path,
        default=default_cookie if default_cookie.is_file() else None,
        help=f"Mozilla cookies.txt (default: {default_cookie.name} if present)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="HTTP timeout in seconds (default: 120)",
    )
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="Parse bundle and print file paths without writing files",
    )
    args = parser.parse_args(argv)
    return run_anima(
        folder=args.folder,
        wiki_url=args.url,
        output=args.output,
        cookie_file=args.cookie_file,
        cookie_header=args.cookie,
        timeout=args.timeout,
        list_only=args.list_only,
    )


if __name__ == "__main__":
    raise SystemExit(main())
