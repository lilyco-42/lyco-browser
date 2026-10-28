"""Read retained archive font metadata on Actions; never install or render fonts."""
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import tarfile
from collections import Counter

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Packaged font inspection runs on GitHub Actions only')
from fontTools.ttLib import TTFont

archive, output = map(Path, sys.argv[1:])
expected = '358b88196047cec4473c54871785b1d9cb970d56bbccc763a9b77d16ac20b582'
with archive.open('rb') as stream:
    actual = hashlib.file_digest(stream, 'sha256').hexdigest()
if actual != expected:
    raise SystemExit('Retained e5ed180 archive digest differs from the reviewed candidate')

fields = {0: 'copyright', 1: 'family', 6: 'postscript', 13: 'license', 14: 'licenseUrl'}
rows, errors, total = [], [], 0
with tarfile.open(archive, 'r:gz') as package:
    for entry in package:
        if not entry.isfile() or Path(entry.name).suffix.lower() not in ('.ttf', '.otf', '.ttc', '.woff', '.woff2'):
            continue
        if entry.size > 64 * 1024 * 1024 or len(rows) >= 5000:
            raise SystemExit('Font inventory bounds exceeded')
        total += entry.size
        if total > 1024 * 1024 * 1024:
            raise SystemExit('Total font bytes exceed inspection bounds')
        content = package.extractfile(entry).read()
        row = {'path': entry.name, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
               'format': Path(entry.name).suffix.lower(), 'faces': []}
        count = struct.unpack_from('>I', content, 8)[0] if content[:4] == b'ttcf' else 1
        if count < 1 or count > 256:
            raise SystemExit('Font collection face count exceeds bounds')
        for number in range(count):
            try:
                font = TTFont(io.BytesIO(content), fontNumber=number, lazy=True, recalcBBoxes=False, recalcTimestamp=False)
                try:
                    names = {label: [] for label in fields.values()}
                    if 'name' in font:
                        for name in font['name'].names:
                            label = fields.get(name.nameID)
                            if label is None:
                                continue
                            value = name.toUnicode()
                            if len(value) > 32768:
                                raise ValueError('Font name text exceeds inspection bound')
                            if value not in names[label]:
                                names[label].append(value)
                    row['faces'].append({'index': number, **names})
                finally:
                    font.close()
            except Exception as error:
                # Keep the file and face in the inventory. A decoder failure
                # is unresolved evidence, never an empty-license success.
                issue = {'path': entry.name, 'face': number, 'errorType': type(error).__name__}
                errors.append(issue)
                row['faces'].append({'index': number, 'unparsed': type(error).__name__})
        rows.append(row)
if not rows:
    raise SystemExit('No font assets were observed')
record = {'assetSource': 'e5ed18067c7abf0650c5e57c110a269622eb3b71',
          'archiveSha256': actual, 'auditSource': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
          'scope': 'Original font metadata, including compressed WOFF2, from a retained archive. No product execution, font installation, rendering or licensing clearance.',
          'formatCounts': dict(Counter(row['format'] for row in rows)), 'fontBytes': total,
          'unparsedFaces': errors, 'fonts': rows}
output.mkdir(parents=True, exist_ok=True)
(output / 'FONT-INVENTORY.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'files': len(rows), 'formats': record['formatCounts'], 'unparsedFaces': len(errors), 'licensingClearance': False}))
if errors:
    raise SystemExit('Some font faces remain unparsed; original failure metadata retained')
