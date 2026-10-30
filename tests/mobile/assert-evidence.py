import json, sys
from pathlib import Path
root=Path(sys.argv[1]);data=json.loads((root/'network.json').read_text())
reports=data['reports']
expected_count=int(sys.argv[2]) if len(sys.argv)>2 else 5
assert expected_count in (5,6)
assert len(reports)==expected_count, f'Expected {expected_count} native reports; observed {len(reports)}'
assert [r['owner'] for r in reports]==['mobile-A','mobile-B','mobile-A']+(['mobile-A'] if expected_count==6 else [])+['mobile-A','mobile-B']
for index,row in enumerate(reports):
    expected=None if index<2 or index==expected_count-2 else 'mobile-B' if index==expected_count-1 else 'mobile-A'
    assert row['before']=={'cookie':expected,'local':expected,'indexedDB':expected}, 'Cookie/localStorage/IndexedDB isolation, clearing or reopen persistence failed'
    assert row['after']=={'cookie':row['owner'],'local':row['owner'],'indexedDB':row['owner']}
assert data['proxyRequests'], 'No HTTP/CONNECT request reached the configured proxy'
navigation=data['navigations']
assert len(navigation)>=5, 'Native address, history or reload did not complete'
assert [row['stage'] for row in navigation[:4]]==['one','two','one','two'], 'Native back/forward history was not used'
assert navigation[-1]['stage']=='two'
assert all(row['cookie']=='mobile-A' and row['local']=='mobile-A' for row in navigation), 'Navigation lost the selected environment storage'
assert not any('owner=mobile-C' in path for path in data['requests']), 'Unreachable proxy fell back to a direct origin request'
print('Native mobile: A/B cookie/localStorage/IndexedDB isolation, reopen persistence, address/history/reload, selected-profile data deletion, real proxy traffic and stopped-proxy negative control passed.')
