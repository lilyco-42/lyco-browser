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
assert not any('owner=mobile-C' in path for path in data['requests']), 'Unreachable proxy fell back to a direct origin request'
print('Native mobile: A/B storage isolation, A reopen persistence, real proxy traffic and stopped-proxy negative control passed.')
