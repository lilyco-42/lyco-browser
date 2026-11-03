"""Read one actual private AsyncStorage record on the owned Actions emulator."""
import os,sqlite3
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS')!='true':
    raise SystemExit('Native storage evidence is collected on genuine Actions only')

def read_profile_metadata(root):
    values=[]
    for file in Path(root).rglob('*'):
        if not file.is_file() or file.name.endswith(('-wal','-shm')):continue
        with file.open('rb') as stream:
            if stream.read(16)!=b'SQLite format 3\x00':continue
        db=sqlite3.connect(f'file:{file}?mode=ro',uri=True)
        try:
            tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if 'catalystLocalStorage' in tables:
                row=db.execute('SELECT value FROM catalystLocalStorage WHERE key=?',('lyco:browser-profile-metadata:v1',)).fetchone()
                if row:values.append(row[0])
        finally:db.close()
    assert len(values)==1,'Expected one actual profile metadata record'
    return values[0]
