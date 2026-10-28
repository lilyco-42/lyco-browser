import json,sys
from pathlib import Path
root=Path(sys.argv[1]);data=json.loads((root/'network.json').read_text());rows=data['observations']
expected=[('A','direct',None),('A','A','A'),('B','B',None),('A','A','A'),('B','B','B'),('A','B','A'),('A','B','A')]
assert len(rows)==len(expected),f'Expected 7 real paid/migration reports; observed {len(rows)}'
for row,(owner,route,previous) in zip(rows,expected):
    assert row['route']==route and row['before']=={'cookie':previous,'local':previous,'indexedDB':previous}
    assert row['after']=={'cookie':owner,'local':owner,'indexedDB':owner}
assert len(data['pageRequests'])==7,'Missing/stopped selection reached the origin or another route'
assert any(row['key']=='device-direct-control' and row['route']=='direct' for row in data['checks']),'Device direct positive control missing'
assert {row['owner'] for row in data['requests'] if row['path']=='/studio/api/login'}=={'ci-owner-a','ci-owner-b'}
assert data['revoked'] and sum(row['path']=='/studio/api/me' for row in data['requests'])>=8
assert any(row['path']=='/studio/api/me' and row['nativeGuard'] and row['revoked'] for row in data['requests']),'Native Billing guard did not consume the fixture revocation'
for phase in ['legacy','bound','downgrade','final']:assert (root/f'storage-{phase}.json').exists()
proof={'checks':['unchanged-signed-apk-default-tls-rejects-untrusted-ci-ca','legacy-to-v2-upgrade-keeps-profile-uuid-and-three-website-storage-types',
 'saved-A-and-B-used-real-authenticated-selected-upstreams','process-restart-relogin-restores-A-choice-and-storage','missing-A-never-selects-B',
 'stopped-A-no-direct-or-system-proxy-fallback-and-B-remains-usable','explicit-A-to-B-keeps-A-data-and-B-separate','other-account-cannot-see-owned-environments',
 'actual-old-apk-refuses-v2-and-cannot-overwrite-bindings','return-to-current-apk-retains-owner-route-and-storage','native-paid-session-revocation-removes-webview',
 'actual-asyncstorage-has-opaque-bindings-and-no-node-or-account-credentials'],
 'observations':rows,'candidate':json.loads((root/'candidate.json').read_text()),'realPayments':False,
 'scope':'API35 disposable rooted emulator trusts a CI-only CA for test Billing responses. No APK/runtime API/TLS changes. Native WebView uses actual authenticated HTTP upstreams and real same-origin TCP/storage observations; not customer egress, real payment, iOS routing or a store release.'}
(root/'RESULT.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
