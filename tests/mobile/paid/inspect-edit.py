"""Inspect private native records and origin observations without exporting databases."""
import hashlib,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from profile_storage import read_profile_metadata

private,evidence=map(Path,sys.argv[1:])
values={phase:read_profile_metadata(private/('edit-'+phase)) for phase in ['before','rejected','saved','restored']}
assert values['before']==values['rejected'],'Cancel or rejected edits changed persisted records'
assert values['before']==values['restored'],'Restoring original details changed identity or other metadata'
def profiles(raw):
    assert raw.startswith('LYCO_PROFILE_METADATA:2\n')
    rows=json.loads(raw.split('\n',1)[1])['profiles']
    assert len(rows)==2
    return {row['name']:row for row in rows}
before,saved=profiles(values['before']),profiles(values['saved'])
assert set(before)=={'paid-A','paid-B'} and set(saved)=={'paid-A-edited','paid-B'}
fixture=json.loads((evidence/'fixture.json').read_text());url=fixture['origin']+'/page?owner=A&phase=paid-A-edited'
assert saved['paid-A-edited']=={**before['paid-A'],'name':'paid-A-edited','url':url},'Editing changed more than name/homepage'
assert saved['paid-B']==before['paid-B'],'Editing A changed B'
baseline=json.loads((evidence/'edit-network-before.json').read_text())
rejected=json.loads((evidence/'edit-network-rejected.json').read_text())
current=json.loads((evidence/'network.json').read_text())
assert len(baseline['pageRequests'])==len(rejected['pageRequests']),'Rejected edits opened a webpage'
assert len(current['pageRequests'])==len(baseline['pageRequests'])+1
edited=[row for row in current['observations'] if row['phase']=='paid-A-edited']
assert len(edited)==1 and edited[0]['route']=='A'
assert edited[0]['before']==edited[0]['after']=={'cookie':'A','local':'A','indexedDB':'A'},'Edited environment lost website data'
for name in ['paid-edit-reject','paid-edit-details-save','paid-edit-reopen','paid-edit-details-restore']:
    root=ET.parse(evidence/(name+'.xml')).getroot()
    assert list(root.iter('testcase')) and not any(list(root.iter(tag)) for tag in ['failure','error','skipped'])
proof={'scope':'Actual signed Android UI, private metadata and original same-origin TCP/storage observations',
       'cancelAndInvalidEditsUnchanged':True,'onlyNameAndHomepageChanged':True,'originalUuidCreationTimeAndRoutePreserved':True,
       'otherProfileUnchanged':True,'processRestartUsedEditedHomepageAndSavedRoute':True,'threeWebsiteStorageTypesPreserved':True,
       'originalMetadataRestored':True,'originalMetadataSha256':hashlib.sha256(values['before'].encode()).hexdigest(),
       'editedMetadataSha256':hashlib.sha256(values['saved'].encode()).hexdigest(),'newOriginPages':1,'observation':edited[0]}
(evidence/'profile-edit.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
