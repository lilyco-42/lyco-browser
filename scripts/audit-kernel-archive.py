"""Inspect immutable candidate archives in Actions, without extracting/running code."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Kernel candidate audits run only in GitHub Actions")

lock_path, input_path, output_path = map(Path, sys.argv[1:4])
lock = json.loads(lock_path.read_text(encoding="utf-8"))
output_path.mkdir(parents=True, exist_ok=True)
reports = []
for version in lock["versions"]:
    tag = version["tag"]
    release = json.loads((input_path / f"release-{tag}.json").read_text())
    commit = json.loads((input_path / f"source-{tag}.json").read_text())
    tree = json.loads((input_path / f"tree-{tag}.json").read_text())
    if commit["sha"] != version["source_commit"] or tree.get("truncated"):
        raise SystemExit(f"Source identity or complete tree unavailable for {tag}")
    assets = [item for item in release["assets"] if item["name"] == version["asset"]]
    if len(assets) != 1 or assets[0].get("digest") != "sha256:" + version["sha256"]:
        raise SystemExit(f"Published asset digest changed for {tag}")
    archive_path = input_path / version["asset"]
    if archive_path.stat().st_size != version["size"]:
        raise SystemExit(f"Unexpected archive size for {tag}")
    with archive_path.open("rb") as stream:
        actual_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual_hash != version["sha256"]:
        raise SystemExit(f"Archive hash mismatch for {tag}")
    notices, fonts, executables, unsafe, symlinks = [], [], [], [], []
    notice_dir = output_path / tag
    notice_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        uncompressed = sum(entry.file_size for entry in entries)
        if len(entries) > 30000 or uncompressed > 4_000_000_000:
            raise SystemExit(f"Archive audit bounds exceeded for {tag}")
        for entry in entries:
            name = entry.filename.replace("\\", "/")
            if name.startswith("/") or ":" in name or ".." in PurePosixPath(name).parts:
                unsafe.append(name)
            if stat.S_ISLNK(entry.external_attr >> 16):
                symlinks.append(name)
            suffix = PurePosixPath(name).suffix.lower()
            if suffix in {".ttf", ".otf", ".ttc", ".woff", ".woff2"}:
                fonts.append({"path": name, "bytes": entry.file_size})
            if suffix in {".exe", ".dll"}:
                executables.append({"path": name, "bytes": entry.file_size})
            basename = PurePosixPath(name).name
            if not re.fullmatch(r"(?:licen[cs]e|copyright|copying|notice)[\w.-]*", basename, re.I):
                continue
            notice = {"path": name, "bytes": entry.file_size}
            if entry.is_dir() or entry.file_size > 10_000_000 or name in symlinks:
                notice["status"] = "not_read_requires_review"
            else:
                content = archive.read(entry)
                digest = hashlib.sha256(content).hexdigest()
                try:
                    content.decode("utf-8-sig")
                    text_only = b"\0" not in content and not content.startswith((b"MZ", b"\x7fELF"))
                except UnicodeDecodeError:
                    text_only = False
                if not text_only:
                    notice.update(status="non_utf8_or_binary_not_copied", sha256=digest)
                else:
                    # Never use an archive-controlled path as an output path.
                    saved = notice_dir / f"notice-{len(notices):03}-{digest[:12]}.txt"
                    saved.write_bytes(content)
                    notice.update(sha256=digest, saved_as=str(saved.relative_to(output_path)))
            notices.append(notice)
    patches = [item["path"] for item in tree["tree"]
               if item["path"].startswith("patches/extra/fingerprint/") and item["type"] == "blob"]
    report = {
        "repository": lock["repository"], "tag": tag,
        "source_commit": commit["sha"], "asset": version["asset"], "sha256": actual_hash,
        "archive_bytes": version["size"], "entry_count": len(entries),
        "uncompressed_bytes": uncompressed, "font_files": fonts, "notice_files": notices,
        "native_executables": executables, "unsafe_paths": unsafe, "symlinks": symlinks,
        "published_fingerprint_patch_paths": patches,
        "browser_executed": False, "functional_parity": "UNVERIFIED",
        "distribution_decision": "NOT_CLEARED_REQUIRES_RESOURCE_AND_LICENSE_REVIEW",
        "limitations": [
            "File suffixes cannot reveal every embedded font or licensed binary component.",
            "Repository license metadata does not establish all bundled resource permissions.",
            "Archive/source identity does not prove a reproducible or equivalent browser build."
        ]
    }
    (output_path / f"audit-{tag}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    reports.append({"tag": tag, "entries": len(entries), "fonts": len(fonts),
                    "notices": len(notices), "fingerprint_patches": len(patches), "sha256": actual_hash})
    if unsafe:
        raise SystemExit(f"Unsafe archive names require review for {tag}; no extraction attempted")

summary = {"commit": os.environ["GITHUB_SHA"], "browser_executed": False,
           "product_accepted": False, "candidates": reports}
(output_path / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2))
