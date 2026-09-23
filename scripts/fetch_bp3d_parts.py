#!/usr/bin/env python3
"""
BodyParts3D (BP3D) Selective OBJ Downloader & Cataloger
======================================================
Downloads only the specific required 3D anatomical .obj models from BodyParts3D
(https://lifesciencedb.jp/bp3d/) using HTTP Range requests without needing to
download or extract multi-gigabyte or 64MB+ archives.

Usage:
  python scripts/fetch_bp3d_parts.py --search "concha"
  python scripts/fetch_bp3d_parts.py --preset sinonasal
  python scripts/fetch_bp3d_parts.py --download FJ3263 FJ3369 FJ3395
"""

import os
import sys
import json
import struct
import zlib
import argparse
import urllib.request
from pathlib import Path

ARCHIVE_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip"
INDEX_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_element_parts.txt"

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
CACHE_DIR = SCRIPT_DIR / ".cache"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "frontend" / "public" / "models" / "bp3d"

# Curated anatomical presets for common clinical radiology exams
PRESETS = {
    "sinonasal": [
        "right inferior nasal concha",
        "left inferior nasal concha",
        "vomer",
        "nasal septum",
        "sphenoid bone",
        "ethmoid",
    ],
    "skull_base": [
        "sphenoid bone",
        "ethmoid",
        "vomer",
        "mandible",
        "frontal bone",
    ],
    "laryngeal": [
        "hyoid bone",
        "thyroid cartilage",
        "cricoid cartilage",
        "epiglottis",
    ],
    "thoracic_skeleton": [
        "sternum",
        "manubrium of sternum",
        "xiphoid process",
        "first rib",
    ]
}

def get_opener():
    opener = urllib.request.build_opener()
    opener.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BodyParts3D-Downloader/1.0")]
    return opener

def ensure_index_downloaded():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    index_cache = CACHE_DIR / "partof_element_parts.txt"
    if not index_cache.exists():
        print("Downloading BodyParts3D anatomical index (partof_element_parts.txt)...")
        opener = get_opener()
        with opener.open(INDEX_URL) as resp, open(index_cache, "wb") as f:
            f.write(resp.read())
        print(f"Index cached at {index_cache}")
    return index_cache

def load_index():
    index_file = ensure_index_downloaded()
    entries = []
    # format: concept_id \t name \t element_file_id
    with open(index_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("concept id") or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                entries.append({
                    "concept_id": parts[0].strip(),
                    "name": parts[1].strip(),
                    "file_id": parts[2].strip()
                })
    return entries

def read_zip_central_directory():
    """
    Reads only the Central Directory of the remote zip archive via HTTP Range requests.
    Cached locally so this takes < 1 second.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cd_cache = CACHE_DIR / "cd_index.json"
    if cd_cache.exists():
        with open(cd_cache, "r", encoding="utf-8") as f:
            return json.load(f)

    print("Fetching remote zip metadata via HTTP Range...")
    opener = get_opener()
    
    # 1. Get total file length with HEAD request
    req = urllib.request.Request(ARCHIVE_URL, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        total_len = int(resp.headers.get("Content-Length"))

    # 2. Fetch the last 65 KB to find End of Central Directory (EOCD)
    tail_start = max(0, total_len - 65536)
    req = urllib.request.Request(
        ARCHIVE_URL,
        headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={tail_start}-{total_len - 1}"}
    )
    with urllib.request.urlopen(req) as resp:
        tail_data = resp.read()

    eocd_pos = tail_data.rfind(b"\x50\x4b\x05\x06")
    if eocd_pos == -1:
        raise RuntimeError("Could not locate End of Central Directory in zip archive")

    eocd = tail_data[eocd_pos:eocd_pos + 22]
    _, _, _, total_entries, cd_size, cd_offset = struct.unpack("<HHHHII", eocd[4:20])

    # 3. Fetch exact Central Directory range
    cd_req = urllib.request.Request(
        ARCHIVE_URL,
        headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={cd_offset}-{cd_offset + cd_size - 1}"}
    )
    with urllib.request.urlopen(cd_req) as resp:
        cd_data = resp.read()

    # Parse central directory entries
    file_map = {}
    pos = 0
    while pos < len(cd_data):
        if cd_data[pos:pos+4] != b"\x50\x4b\x01\x02":
            break
        (
            _, _, _, comp_method, _, _, _,
            comp_size, uncomp_size, name_len, extra_len, comment_len,
            _, _, _, local_header_offset
        ) = struct.unpack("<HHHHHHIIIHHHHHII", cd_data[pos+4:pos+46])
        name = cd_data[pos+46:pos+46+name_len].decode("utf-8", errors="ignore")
        
        # Store by filename (e.g. FJ3263.obj)
        base_name = os.path.basename(name)
        if base_name.endswith(".obj"):
            file_id = os.path.splitext(base_name)[0]
            file_map[file_id] = {
                "archive_path": name,
                "file_name": base_name,
                "comp_size": comp_size,
                "uncomp_size": uncomp_size,
                "local_offset": local_header_offset,
                "comp_method": comp_method
            }
        pos += 46 + name_len + extra_len + comment_len

    with open(cd_cache, "w", encoding="utf-8") as f:
        json.dump(file_map, f, indent=2)

    print(f"Indexed {len(file_map)} remote OBJ models from Central Directory.")
    return file_map

def download_single_obj(file_id, cd_info, output_path):
    """
    Downloads only the bytes for this exact OBJ file using HTTP Range and decompresses.
    """
    local_offset = cd_info["local_offset"]
    comp_size = cd_info["comp_size"]
    # Request header + compressed data buffer (extra 120 bytes for local header + filename)
    req_end = local_offset + 30 + 120 + comp_size
    req = urllib.request.Request(
        ARCHIVE_URL,
        headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={local_offset}-{req_end}"}
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()

    # Parse local zip entry header
    sig, _, _, _, _, _, _, _, _, name_len, extra_len = struct.unpack("<IHHHHHIIIHH", raw[:30])
    if sig != 0x04034B50:
        raise ValueError(f"Invalid local zip header signature: {hex(sig)}")

    comp_data = raw[30 + name_len + extra_len : 30 + name_len + extra_len + comp_size]
    
    if cd_info["comp_method"] == 8: # Deflate
        decompressed = zlib.decompress(comp_data, -zlib.MAX_WBITS)
    elif cd_info["comp_method"] == 0: # Stored
        decompressed = comp_data
    else:
        raise ValueError(f"Unsupported compression method: {cd_info['comp_method']}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(decompressed)

    return len(decompressed)

def search_index(query, index_entries):
    q_lower = query.lower()
    matches = []
    for entry in index_entries:
        if q_lower in entry["name"].lower() or q_lower in entry["file_id"].lower() or q_lower in entry["concept_id"].lower():
            matches.append(entry)
    return matches

def update_manifest(output_dir, new_items):
    manifest_path = output_dir / "bp3d_manifest.json"
    manifest = {"attribution": "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International", "structures": {}}
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception:
            pass

    for item in new_items:
        key = item["file_id"]
        manifest["structures"][key] = {
            "file": f"{item['file_id']}.obj",
            "name": item["name"],
            "concept_id": item["concept_id"],
            "category": item.get("category", "Anatomy"),
            "defaultColor": item.get("defaultColor", 0x3ecfe0)
        }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

def main():
    parser = argparse.ArgumentParser(description="Selective BodyParts3D OBJ Downloader")
    parser.add_argument("--search", "-s", type=str, help="Search anatomical index by organ name")
    parser.add_argument("--preset", "-p", choices=list(PRESETS.keys()), help="Download curated preset")
    parser.add_argument("--download", "-d", nargs="+", help="Download specific file IDs (e.g. FJ3263 FJ3369)")
    parser.add_argument("--outdir", "-o", type=str, default=str(DEFAULT_OUTPUT_DIR), help="Output directory")
    args = parser.parse_args()

    out_path = Path(args.outdir)
    index_entries = load_index()
    cd_map = read_zip_central_directory()

    if args.search:
        results = search_index(args.search, index_entries)
        print(f"\nFound {len(results)} matches for '{args.search}':")
        print(f"{'Concept ID':<12} {'File ID':<10} {'Anatomical Name'}")
        print("-" * 65)
        for r in results[:40]:
            print(f"{r['concept_id']:<12} {r['file_id']:<10} {r['name']}")
        if len(results) > 40:
            print(f"... and {len(results) - 40} more matches.")
        return

    items_to_download = []

    if args.preset:
        target_names = PRESETS[args.preset]
        print(f"\nProcessing preset '{args.preset}' ({len(target_names)} target organs)...")
        seen_files = set()
        for name in target_names:
            matches = search_index(name, index_entries)
            # Pick exact or closest match
            for m in matches:
                if m["file_id"] in cd_map and m["file_id"] not in seen_files:
                    seen_files.add(m["file_id"])
                    items_to_download.append(m)
                    break

    elif args.download:
        for fid in args.download:
            clean_fid = fid.replace(".obj", "").strip()
            # find name in index
            matching = [e for e in index_entries if e["file_id"] == clean_fid]
            name = matching[0]["name"] if matching else clean_fid
            concept_id = matching[0]["concept_id"] if matching else "N/A"
            items_to_download.append({
                "file_id": clean_fid,
                "name": name,
                "concept_id": concept_id
            })

    if not items_to_download:
        print("No target items specified. Use --search, --preset, or --download.")
        parser.print_help()
        return

    print(f"\nDownloading {len(items_to_download)} selective OBJ models to {out_path}...")
    manifest_entries = []
    total_bytes = 0

    for item in items_to_download:
        fid = item["file_id"]
        if fid not in cd_map:
            print(f"Warning: {fid} not found in BodyParts3D archive.")
            continue

        cd_info = cd_map[fid]
        target_file = out_path / f"{fid}.obj"
        print(f" -> Fetching {fid}.obj ('{item['name']}') [{cd_info['comp_size'] // 1024} KB compressed]...")
        
        uncomp_len = download_single_obj(fid, cd_info, target_file)
        total_bytes += uncomp_len
        manifest_entries.append(item)

    update_manifest(out_path, manifest_entries)
    print(f"\nSuccessfully downloaded {len(manifest_entries)} OBJ models ({total_bytes // 1024} KB total uncompressed).")
    print(f"Updated manifest at: {out_path / 'bp3d_manifest.json'}")

if __name__ == "__main__":
    main()
