"""Retain real counterexamples as failures; never rewrite candidates or packets."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]); data = json.loads((root/'network.json').read_text())
reports = {row['phase']: row for row in data['reports']}
udp = {phase: sum(row['phase']==phase and row['validStun'] for row in data['udp']) for phase in ['control','lyco','stopped','control-after']}
stopped = None
for node in ET.parse(root/'stopped-ui.xml').iter('node'):
    for key in ['text', 'content-desc']:
        value = node.get(key, '')
        if value.startswith('LYCO_RTC_JSON:'):
            stopped = json.loads(value.split(':', 1)[1])

checks = {}
def peer(value):
    return bool(value and value.get('completed') and value.get('apiPresent') and value.get('offerCreated') and not value.get('blocked'))
for phase in ['control', 'control-after']:
    row = reports.get(phase, {})
    checks[phase+'-real-peer-direct-http-and-stun-positive'] = row.get('route')=='direct' and peer(row.get('observation')) and udp[phase]>0
row = reports.get('lyco', {})
checks['actual-product-peer-page-and-report-use-selected-tcp-upstream'] = peer(row.get('observation')) and row.get('route')=='selected' and any(r['phase']=='lyco' and r['route']=='selected' for r in data['pageRequests'])
checks['actual-stopped-product-peer-completed-and-upstream-stopped'] = peer(stopped) and stopped.get('phase')=='stopped' and data['stopped']
checks['healthy-product-no-direct-stun'] = udp['lyco']==0
checks['stopped-product-no-direct-stun'] = udp['stopped']==0
checks['healthy-product-no-literal-ip-candidate'] = row.get('observation', {}).get('literalIP') is False
checks['stopped-product-no-literal-ip-candidate'] = bool(stopped) and stopped.get('literalIP') is False
valid = all(checks[k] for k in list(checks)[:4])
result = {'validProbe':valid,'passed':valid and all(checks.values()),'checks':checks,'udpStunPackets':udp,
          'productHealthy':row.get('observation'),'productStopped':stopped,'candidate':json.loads((root/'candidate.json').read_text()),
          'scope':'Actual signed APK on API35, same-provider plain WebView direct controls, owned HTTP upstream and four distinct STUN ports; 4500ms gathering windows. No RTC observation injection or product test API. Not HTTPS/WSS/IPv6/DNS, real customer egress, iOS or a release.'}
(root/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
if not result['passed']:
    raise SystemExit('Native RTC boundary failed or the probe is invalid; original observations retained')
