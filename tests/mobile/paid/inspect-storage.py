"""Inspect a private copy of actual APK AsyncStorage; emit only safe proof."""
import hashlib,json,sqlite3,sys
from pathlib import Path
root,evidence,phase=map(Path,sys.argv[1:])
raw=None
for file in root.rglob('*'):
    if not file.is_file() or file.name.endswith(('-wal','-shm')):continue
    if file.open('rb').read(16)!=b'SQLite format 3\x00':continue
    db=sqlite3.connect(f'file:{file}?mode=ro',uri=True)
    try:
        tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'catalystLocalStorage' in tables:
            row=db.execute('SELECT value FROM catalystLocalStorage WHERE key=?',('lyco:browser-profile-metadata:v1',)).fetchone()
            if row:raw=row[0]
    finally:db.close()
assert raw is not None,'Actual profile metadata was not found'
for secret in ['CI_OWNER_A_TOKEN','CI_OWNER_B_TOKEN','CI_PRIVATE_ROUTE_A','CI_PRIVATE_ROUTE_B','CI_ROUTE_A','CI_ROUTE_B','CI_fixture_password']:
    assert secret not in raw,'Credentials were persisted in profile metadata'
framed=raw.startswith('LYCO_PROFILE_METADATA:2\n')
rows=json.loads(raw.split('\n',1)[1])['profiles'] if framed else json.loads(raw)
proof={'phase':str(phase),'framed_v2':framed,'sha256':hashlib.sha256(raw.encode()).hexdigest(),
       'ids':{row['name']:row['id'] for row in rows},'bindings':{row['name']:row.get('route') for row in rows}}
if str(phase)=='legacy':
    assert not framed and set(proof['ids'])=={'paid-A'}
else:
    assert framed and set(proof['ids'])=={'paid-A','paid-B'}
    fixture=json.loads((evidence/'fixture.json').read_text());b=next(row['id'] for row in fixture['routes'] if row['name']=='CI route B')
    for row in rows:
        assert set(row['route'])=={'owner','routeId','routeName'}
        assert row['route']=={'owner':'ci-owner-a','routeId':b,'routeName':'CI route B'}
    legacy=json.loads((evidence/'storage-legacy.json').read_text())
    assert proof['ids']['paid-A']==legacy['ids']['paid-A'],'Upgrade changed the website data namespace'
    assert proof['ids']['paid-A']!=proof['ids']['paid-B']
    if str(phase)=='downgrade':
        assert proof['sha256']==json.loads((evidence/'storage-bound.json').read_text())['sha256'],'Old reader overwrote v2 bindings'
(evidence/f'storage-{phase}.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'phase':str(phase),'profiles':len(rows),'framed_v2':framed,'no_profile_credentials':True}))
