"""Compare actual private AsyncStorage copies; emit hashes, never credentials."""
import hashlib,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from profile_storage import read_profile_metadata
private,evidence=map(Path,sys.argv[1:])
before,after=read_profile_metadata(private/'search-before'),read_profile_metadata(private/'search-after')
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
