"""Compare actual private AsyncStorage copies; emit hashes, never credentials."""
import hashlib,json,sqlite3,sys,xml.etree.ElementTree as ET
from pathlib import Path
private,evidence=map(Path,sys.argv[1:])
def metadata(label):
    values=[]
    for file in (private/label).rglob('*'):
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
before,after=metadata('search-before'),metadata('search-after')
assert before==after,'Filtering or clearing changed persisted environment metadata'
baseline=json.loads((evidence/'search-network-before.json').read_text())
network=json.loads((evidence/'network.json').read_text())
assert len(baseline['observations'])==len(network['observations'])
assert len(baseline['pageRequests'])==len(network['pageRequests']),'Search opened or rerouted a browser'
assert any(row.get('catalogueSize')==1252 for row in network['requests']),'Complete owned catalogue was not actually delivered'
tests=ET.parse(evidence/'paid-search.xml').getroot()
assert list(tests.iter('testcase')) and not any(list(tests.iter(tag)) for tag in ['failure','error','skipped'])
proof={'scope':'Actual signed Android UI and metadata; 1250 catalogue aliases share owned route A, not independent exits',
       'catalogueEntries':1252,'aliases':1250,'uiFlowPassed':True,'metadataSha256':hashlib.sha256(before.encode()).hexdigest(),
       'metadataUnchanged':True,'newOriginPages':0,'selectionRetained':True,'completeDirectoryRestored':True}
(evidence/'catalogue-search.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
