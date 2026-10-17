"""Resolve m2icondb item/icon ids to /3d viewer URLs (no cookies required)."""

from __future__ import annotations

import re
import urllib.parse
import urllib.request

CDN = "https://assets.m2icondb.com/models/new/"

_ITEM_PATH = re.compile(
    r"(?:https?://(?:www\.)?m2icondb\.com)?/item/(?P<id>\d+)",
    re.I,
)
_M2_PREFIX = re.compile(r"^m2:(?P<id>\d+)\s*$", re.I)


def normalize_icon_id(raw: str) -> str:
    digits = re.sub(r"\D", "", raw.strip())
    if not digits:
        raise ValueError(f"Not an icon id: {raw!r}")
    return digits.zfill(5)


def cdn_exists(rel: str, timeout: float = 30.0) -> bool:
    url = CDN + rel.lstrip("/")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "m2-model-downloader/1.0",
            "Range": "bytes=0-0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 206)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        if e.code in (200, 206):
            return True
        return False
    except urllib.error.URLError:
        return False


def viewer_url_for_weapon_glb(icon_id: str) -> str:
    """Most official weapons use CDN path weapons/{00010}.glb."""
    icon = normalize_icon_id(icon_id)
    glb = f"weapons/{icon}.glb"
    q = urllib.parse.urlencode(
        {
            "glb": glb,
            "weapon": glb,
            "type": "WEAPON",
            "subtype": "WEAPON_SWORD",
            "value3": str(int(icon)),
            "model": icon,
            "motion": "motions/warrior_m.glb",
            "warrior": "true",
        }
    )
    return f"https://m2icondb.com/3d?{q}"


def resolve_m2icondb_line(line: str, *, timeout: float = 30.0) -> str:
    """
    Return a m2icondb.com/3d?... URL for a batch line.

    Accepts:
      - full https://m2icondb.com/3d?...
      - https://m2icondb.com/item/10 (weapon probe on CDN)
      - m2:10
    """
    raw = line.strip()
    if not raw or raw.startswith("#"):
        raise ValueError("empty or comment")

    if "/3d" in raw:
        if raw.startswith("http"):
            return raw
        return "https://m2icondb.com" + (raw if raw.startswith("/") else "/" + raw)

    m = _ITEM_PATH.search(raw) or _M2_PREFIX.match(raw)
    if m:
        icon = normalize_icon_id(m.group("id"))
        glb = f"weapons/{icon}.glb"
        if cdn_exists(glb, timeout=timeout):
            return viewer_url_for_weapon_glb(icon)
        raise ValueError(
            f"No CDN weapon at {glb}. Use a full /3d?... URL in the batch file "
            f"(armor, costume, monster on m2icondb, etc.)."
        )

    if re.fullmatch(r"\d+", raw):
        icon = normalize_icon_id(raw)
        glb = f"weapons/{icon}.glb"
        if cdn_exists(glb, timeout=timeout):
            return viewer_url_for_weapon_glb(icon)
        raise ValueError(f"No CDN weapon at {glb}; provide full /3d URL.")

    raise ValueError(f"Unrecognized m2icondb line: {raw!r}")
