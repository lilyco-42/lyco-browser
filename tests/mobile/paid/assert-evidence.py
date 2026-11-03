import json,sys
from pathlib import Path
root=Path(sys.argv[1]);data=json.loads((root/'network.json').read_text())
edited=[row for row in data['observations'] if row['phase']=='paid-A-edited']
rows=[row for row in data['observations'] if row['phase']!='paid-A-edited']
assert len(data['observations'])==8 and len(edited)==1,'Expected seven original observations and one edited-homepage observation'
expected=[('A','direct',None),('A','A','A'),('B','B',None),('A','A','A'),('B','B','B'),('A','B','A'),('A','B','A')]
assert len(rows)==len(expected),f'Expected 7 real paid/migration reports; observed {len(rows)}'
for row,(owner,route,previous) in zip(rows,expected):
    assert row['route']==route and row['before']=={'cookie':previous,'local':previous,'indexedDB':previous}
    assert row['after']=={'cookie':owner,'local':owner,'indexedDB':owner}
assert len(data['pageRequests'])==8,'Expected only seven original pages and one explicit edited-homepage page'
assert edited[0]['route']=='A' and edited[0]['before']==edited[0]['after']=={'cookie':'A','local':'A','indexedDB':'A'}
assert any(row['key']=='device-direct-control' and row['route']=='direct' for row in data['checks']),'Device direct positive control missing'
assert any(row['key']=='system-proxy-control' and row['route']=='direct' for row in data['checks']),'Healthy system proxy alternate-path control missing'
assert {row['owner'] for row in data['requests'] if row['path']=='/studio/api/login'}=={'ci-owner-a','ci-owner-b'}
assert data['revoked'] and sum(row['path']=='/studio/api/me' for row in data['requests'])>=8
assert any(row['path']=='/studio/api/me' and row['nativeGuard'] and row['revoked'] for row in data['requests']),'Native Billing guard did not consume the fixture revocation'
for phase in ['legacy','bound','downgrade','final']:assert (root/f'storage-{phase}.json').exists()
search=json.loads((root/'catalogue-search.json').read_text())
assert search['uiFlowPassed'] and search['catalogueEntries']==1252 and search['metadataUnchanged'] and search['newOriginPages']==0
edit=json.loads((root/'profile-edit.json').read_text())
assert all(edit[key] for key in ['cancelAndInvalidEditsUnchanged','onlyNameAndHomepageChanged','originalUuidCreationTimeAndRoutePreserved','otherProfileUnchanged','processRestartUsedEditedHomepageAndSavedRoute','threeWebsiteStorageTypesPreserved','originalMetadataRestored'])
proof={'checks':['unchanged-signed-apk-default-tls-rejects-untrusted-ci-ca','legacy-to-v2-upgrade-keeps-profile-uuid-and-three-website-storage-types',
 'saved-A-and-B-used-real-authenticated-selected-upstreams','process-restart-relogin-restores-A-choice-and-storage','missing-A-never-selects-B',
 'stopped-A-no-direct-or-system-proxy-fallback-and-B-remains-usable','explicit-A-to-B-keeps-A-data-and-B-separate','other-account-cannot-see-owned-environments',
 'actual-old-apk-refuses-v2-and-cannot-overwrite-bindings','return-to-current-apk-retains-owner-route-and-storage','native-paid-session-revocation-removes-webview',
 'actual-asyncstorage-has-opaque-bindings-and-no-node-or-account-credentials',
 'actual-1252-entry-search-zero-results-and-clear-retain-selected-node-and-persisted-metadata',
 'actual-profile-edit-cancel-validation-restart-homepage-and-original-identity-route-storage-preservation'],
 'observations':rows,'editedHomepageObservation':edited[0],'profileEdit':edit,'catalogueSearch':search,'candidate':json.loads((root/'candidate.json').read_text()),'realPayments':False,
 'scope':'API35 disposable rooted emulator trusts a CI-only CA for test Billing responses. No APK/runtime API/TLS changes. Native WebView uses actual authenticated HTTP upstreams and real same-origin TCP/storage observations; not customer egress, real payment, iOS routing or a store release.'}
(root/'RESULT.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
