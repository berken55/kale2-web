#!/usr/bin/env python3
"""
Download m2icondb.com /3d viewer assets (GLB, DDS/PNG textures, motion, etc.)
from a viewer URL or equivalent query parameters.

Example:
  python download.py "https://m2icondb.com/3d?glb=monster/wolf/wolf.glb&animation=wait&monster=true&skinSource=monster/wolf/wolf&skinTarget=monster/wolf/wolf_blue"
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
DEFAULT_CDN = "https://assets.m2icondb.com/models/new/"
TEXTURE_EXTS = (".dds", ".png")


@dataclass(frozen=True)
class ViewerParams:
    base_url: str
    glb: str | None
    motion: str | None
    weapon: str | None
    costume_hair: str | None
    acce: str | None
    monster: bool
    skin_source: str | None
    skin_target: str | None
    model_ka: str | None
    item_type: str | None
    subtype: str | None
    meffects: list[str]
    effects: list[str]
    weffects: list[str]


def _truthy(value: str | None) -> bool:
    return value is not None and value.lower() in ("1", "true", "yes")


def _safe_path(value: str | None) -> str | None:
    if not value:
        return None
    try:
        value = urllib.parse.unquote(value)
    except Exception:
        pass
    value = value.strip().replace("\\", "/")
    if not value or ".." in value.split("/"):
        return None
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
        return None
    return value


def _safe_glb(value: str | None) -> str | None:
    value = _safe_path(value)
    if not value:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_./-]+\.glb", value, re.I):
        return None
    return value


def _split_effects(raw: str | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for part in raw.split(","):
        name = part.strip().split("@", 1)[0].strip()
        if re.fullmatch(r"[A-Za-z0-9_-]+", name):
            out.append(name)
    return out


def parse_viewer_url(url: str) -> ViewerParams:
    parsed = urllib.parse.urlparse(url)
    q = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)

    def one(key: str) -> str | None:
        vals = q.get(key)
        if not vals:
            return None
        return vals[0]

    base = one("url") or DEFAULT_CDN
    if not base.endswith("/"):
        base += "/"

    glb = _safe_glb(one("glb"))
    motion = _safe_glb(one("motion"))
    weapon = _safe_glb(one("weapon"))
    costume_hair = _safe_glb(one("costumeHair"))
    acce = _safe_glb(one("acce"))

    skin_source = _safe_path(one("skinSource"))
    skin_target = _safe_path(one("skinTarget"))

    model = _safe_path(one("model"))
    item_type = one("type")
    subtype = one("subtype") or ""

    ka: str | None = None
    if not glb and model and item_type:
        if item_type in ("WEAPON", "ITEM_WEAPON") or subtype == "COSTUME_WEAPON":
            ka = f"weapons/{model}"
        elif item_type == "ETC":
            ka = f"etc/{model}"
        elif item_type == "WING" or subtype == "COSTUME_ACCE":
            ka = f"wing/{model}"
        elif item_type == "ARMOR" or subtype in (
            "ARMOR_BODY",
            "COSTUME_BODY",
            "COSTUME_HAIR",
        ):
            ka = f"armors/{model}"
        else:
            ka = model

    return ViewerParams(
        base_url=base,
        glb=glb,
        motion=motion,
        weapon=weapon,
        costume_hair=costume_hair,
        acce=acce,
        monster=_truthy(one("monster")),
        skin_source=skin_source,
        skin_target=skin_target,
        model_ka=ka,
        item_type=item_type,
        subtype=subtype,
        meffects=_split_effects(one("meffects")),
        effects=_split_effects(one("effects")),
        weffects=_split_effects(one("weffects")),
    )


def glb_dir(glb_path: str) -> str:
    if "/" not in glb_path:
        return ""
    return glb_path[: glb_path.rindex("/") + 1]


def base_name(path: str) -> str:
    leaf = path.replace("\\", "/").rsplit("/", 1)[-1]
    if "." in leaf:
        return leaf.rsplit(".", 1)[0]
    return leaf


def is_armor_context(params: ViewerParams) -> bool:
    if params.item_type == "ARMOR":
        return True
    return params.subtype in ("ARMOR_BODY", "COSTUME_BODY", "COSTUME_HAIR")


def texture_rel_path(
    material_name: str,
    glb_prefix: str,
    *,
    monster: bool,
    armor: bool,
    skin_source: str | None,
    skin_target: str | None,
    refine_source: str | None,
    refine_target: str | None,
    ext: str,
) -> str:
    """Mirror m2icondb ModelViewer texture path rules (without runtime WebGL checks)."""
    te = base_name(material_name)
    ic = te.lower()

    if re.match(r"^pc\d?/", material_name, re.I):
        rel = f"armors/{material_name}{ext}"
    elif re.match(r"^item/weapon/costume/", material_name, re.I):
        rel = f"weapons/costume/{te}{ext}"
    elif re.match(r"^item/weapon/", material_name, re.I):
        rel = f"weapons/{te}{ext}"
    elif re.match(r"^item/wing/", material_name, re.I):
        rel = f"wing/{te}{ext}"
    elif "/" in material_name:
        rel = f"{material_name}{ext}"
    else:
        rel = f"{glb_prefix}{material_name}{ext}"

    fr = skin_source or ""
    hr = skin_target or ""
    if (armor or monster) and fr and base_name(fr).lower() == ic:
        rel = f"{hr}{ext}"
    elif armor and refine_source and base_name(refine_source).lower() == ic:
        rel = f"{refine_target or refine_source}{ext}"

    return rel.replace("\\", "/").lower()


def parse_glb_material_names(glb_bytes: bytes) -> list[str]:
    if len(glb_bytes) < 20:
        return []
    magic, _version, _length = struct.unpack_from("<III", glb_bytes, 0)
    if magic != 0x46546C67:  # glTF
        return []
    json_len, json_type = struct.unpack_from("<II", glb_bytes, 12)
    if json_type != 0x4E4F534A:  # JSON
        return []
    chunk = glb_bytes[20 : 20 + json_len]
    try:
        doc = json.loads(chunk.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return []
    names: list[str] = []
    for mat in doc.get("materials") or []:
        name = mat.get("name")
        if isinstance(name, str) and name:
            names.append(name)
    return names


def parse_mtl_textures(mtl_text: str, ext: str) -> list[str]:
    rels: list[str] = []
    for line in mtl_text.splitlines():
        line = line.strip()
        if not line.lower().startswith("map_kd"):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        tex = parts[1].strip().split()[0]
        tex = tex.replace("\\", "/")
        if not tex.lower().endswith(ext):
            tex = re.sub(r"(?:\.([^.]+))?$", ext, tex)
        rels.append(tex.lower())
    return rels


def collect_asset_rels(params: ViewerParams) -> set[str]:
    rels: set[str] = set()

    glbs: list[str] = []
    if params.glb:
        glbs.append(params.glb)
    if params.motion:
        glbs.append(params.motion)
    if params.weapon:
        glbs.append(params.weapon)
    if params.costume_hair:
        glbs.append(params.costume_hair)
    if params.acce:
        glbs.append(params.acce)

    for effect in params.meffects:
        rels.add(f"monster/{effect}.glb")
        glbs.append(f"monster/{effect}.glb")

    for effect in params.effects + params.weffects:
        rels.add(f"effect/{effect}.glb")
        glbs.append(f"effect/{effect}.glb")

    if params.model_ka and not params.glb:
        rels.add(f"{params.model_ka}.obj")
        rels.add(f"{params.model_ka}.mtl")

    for glb in glbs:
        rels.add(glb.replace("\\", "/"))

    # Textures are resolved after GLB/MTL fetch; seed with empty and expand in download pass.
    return rels


def expand_textures_for_glb(
    params: ViewerParams,
    glb_rel: str,
    glb_bytes: bytes,
    *,
    refine_source: str | None = None,
    refine_target: str | None = None,
) -> set[str]:
    prefix = glb_dir(glb_rel)
    armor = is_armor_context(params)
    out: set[str] = set()
    for mat in parse_glb_material_names(glb_bytes):
        for ext in TEXTURE_EXTS:
            out.add(
                texture_rel_path(
                    mat,
                    prefix,
                    monster=params.monster,
                    armor=armor,
                    skin_source=params.skin_source,
                    skin_target=params.skin_target,
                    refine_source=refine_source,
                    refine_target=refine_target,
                    ext=ext,
                )
            )
    return out


def fetch_bytes(url: str, timeout: float) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "m2-model-downloader/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except urllib.error.URLError:
        return None


def download_file(base_url: str, rel: str, dest: Path, timeout: float) -> tuple[str, bool, str]:
    rel_norm = rel.replace("\\", "/").lstrip("/")
    url = urllib.parse.urljoin(base_url, rel_norm)
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = fetch_bytes(url, timeout)
    if data is None:
        return rel_norm, False, "not found"
    dest.write_bytes(data)
    return rel_norm, True, str(dest)


def resolve_all_assets(params: ViewerParams, timeout: float) -> tuple[set[str], dict[str, str]]:
    """Return relative paths to download and optional errors."""
    pending = collect_asset_rels(params)
    done: set[str] = set()
    errors: dict[str, str] = {}

    # BFS: loading GLB/MTL may reveal more textures / nested paths
    while pending - done:
        rel = sorted(pending - done)[0]
        done.add(rel)

        url = urllib.parse.urljoin(params.base_url, rel.lstrip("/"))
        data = fetch_bytes(url, timeout)
        if data is None:
            if rel.lower().endswith(".png") and rel.lower().replace(".png", ".dds") in pending:
                continue
            if rel.lower().endswith(".dds"):
                png = rel[:-4] + ".png"
                if png not in pending:
                    pending.add(png)
                continue
            errors[rel] = "HTTP not found"
            continue

        if rel.lower().endswith(".glb"):
            pending |= expand_textures_for_glb(params, rel, data)
        elif rel.lower().endswith(".mtl"):
            try:
                text = data.decode("utf-8", errors="replace")
            except Exception:
                text = ""
            for ext in TEXTURE_EXTS:
                pending |= set(parse_mtl_textures(text, ext))

    return done, errors


def run_download(
    url: str,
    output: Path,
    *,
    workers: int = 8,
    timeout: float = 60.0,
    dry_run: bool = False,
) -> int:
    params = parse_viewer_url(url)
    if not params.glb and not params.model_ka:
        print("Could not find glb= or model=+type= in URL.", file=sys.stderr)
        return 1

    rels, resolve_errors = resolve_all_assets(params, timeout)

    # Drop PNG if DDS exists for same stem (viewer prefers DDS when supported)
    stems_with_dds = {r[:-4] for r in rels if r.lower().endswith(".dds")}
    rels = {
        r
        for r in rels
        if not (r.lower().endswith(".png") and r[:-4] in stems_with_dds)
    }

    print(f"CDN base: {params.base_url}")
    print(f"Resolved {len(rels)} file(s)")
    for rel in sorted(rels):
        print(f"  {rel}")
    for rel, err in sorted(resolve_errors.items()):
        if rel not in rels:
            print(f"  skip {rel}: {err}", file=sys.stderr)

    manifest = {
        "source_url": url,
        "base_url": params.base_url,
        "files": sorted(rels),
        "skipped": resolve_errors,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    if dry_run:
        return 0

    ok = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(
                download_file,
                params.base_url,
                rel,
                output / rel.replace("/", "\\"),
                timeout,
            ): rel
            for rel in sorted(rels)
        }
        for fut in as_completed(futures):
            rel, success, msg = fut.result()
            if success:
                ok += 1
                print(f"OK  {rel}")
            else:
                fail += 1
                print(f"MISS {rel}", file=sys.stderr)

    print(f"Done: {ok} downloaded, {fail} missing.")
    return 0 if fail == 0 else 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download assets for an m2icondb /3d URL.")
    parser.add_argument("url", help="Full m2icondb.com/3d?... viewer URL")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("downloads"),
        help="Output directory (default: ./downloads)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel download workers (default: 8)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help="HTTP timeout seconds (default: 60)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only list resolved files, do not download",
    )
    args = parser.parse_args(argv)
    return run_download(
        args.url,
        args.output,
        workers=args.workers,
        timeout=args.timeout,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
