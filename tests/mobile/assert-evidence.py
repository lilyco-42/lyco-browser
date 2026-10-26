import json, sys
from pathlib import Path
root=Path(sys.argv[1]);data=json.loads((root/'network.json').read_text())
reports=data['reports']
expected=int(sys.argv[2]) if len(sys.argv)>2 else 3
assert expected in (3,4)
assert len(reports)==expected, f'Expected {expected} native reports; observed {len(reports)}'
assert [r['owner'] for r in reports]==['mobile-A','mobile-B','mobile-A']+(['mobile-A'] if expected==4 else [])
for index,row in enumerate(reports):
    expected=None if index<2 else 'mobile-A'
    assert row['before']=={'cookie':expected,'local':expected}, 'Cookie/localStorage isolation or reopen persistence failed'
    assert row['after']=={'cookie':row['owner'],'local':row['owner']}
assert data['proxyRequests'], 'No HTTP/CONNECT request reached the configured proxy'
navigation=data['navigations']
assert len(navigation)>=5, 'Native address, history or reload did not complete'
assert [row['stage'] for row in navigation[:4]]==['one','two','one','two'], 'Native back/forward history was not used'
assert navigation[-1]['stage']=='two'
assert all(row['cookie']=='mobile-A' and row['local']=='mobile-A' for row in navigation), 'Navigation lost the selected environment storage'
assert not any('owner=mobile-C' in path for path in data['requests']), 'Unreachable proxy fell back to a direct origin request'
print('Native mobile: A/B isolation, reopen persistence, address/history/reload, real proxy traffic and stopped-proxy negative control passed.')
