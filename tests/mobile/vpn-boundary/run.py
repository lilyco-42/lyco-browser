"""Observe real before/during/after VPN ICE and owned STUN with system consent."""
from pathlib import Path
import ipaddress
import json
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch'
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-vpn-boundary'
package = 'top.lain42.lycovpnboundary'
cases = {'top', 'initial-empty', 'nested-empty'}
candidate = json.loads((root / 'candidate.json').read_text())
assert candidate['notProductAPK'] and not candidate['debuggable'] and not candidate['pagePolicyScript']
fixture_log = (root / 'fixture.log').open('w')
fixture = subprocess.Popen([sys.executable, str(Path(__file__).with_name('fixture.py'))], stdout=fixture_log, stderr=subprocess.STDOUT)


def shell(args):
    return subprocess.check_output(['adb', 'shell', shlex.join(args)], text=True, timeout=30)


def start(action, phase=None):
    args = ['am', 'start', '-W', '-n', package + '/.ProbeActivity', '--es', 'action', action]
    if phase:
        args += ['-d', 'http://localhost:18080/probe?phase=' + phase]
    (root / ((phase or action) + '-launch.txt')).write_text(shell(args))


def ui(label):
    shell(['uiautomator', 'dump', '/data/local/tmp/lyco-vpn-owned.xml'])
    raw = shell(['cat', '/data/local/tmp/lyco-vpn-owned.xml'])
    (root / (label + '-ui.xml')).write_text(raw)
    return ET.fromstring(raw)


def snapshot(label, active):
    deadline = time.monotonic() + 25
    while True:
        tree = ui(label)
        for node in tree.iter('node'):
            text = node.get('text', '')
            if text.startswith('LYCO_VPN '):
                value = json.loads(text.removeprefix('LYCO_VPN '))
                assert not value['error'], value['error']
                if value['active'] is active and value['transportVpn'] is active and value['fdValid'] is active:
                    (root / (label + '-native.json')).write_text(json.dumps(value, indent=2) + '\n')
                    return value
        assert time.monotonic() < deadline, 'Actual VPN network/descriptor state missing'
        time.sleep(.2)


def page(phase):
    start('page', phase)
    deadline = time.monotonic() + 35
    while True:
        data = json.loads((root / 'network.json').read_text())
        rows = [r for r in data['reports'] if r['phase'] == phase]
        if rows:
            assert len(rows) == 1 and {r['name'] for r in rows[0]['observations']} == cases
            assert all(r.get('sdp', '').startswith('v=0') and not r.get('exception') for r in rows[0]['observations'])
            return rows[0]
        assert time.monotonic() < deadline and fixture.poll() is None, 'Actual native page report missing'
        time.sleep(.2)


def literal(value):
    try:
        ipaddress.ip_address(value)
        return isinstance(value, str)
    except (ValueError, TypeError):
        return False


try:
    deadline = time.monotonic() + 15
    while not (root / 'network.json').exists():
        assert fixture.poll() is None and time.monotonic() < deadline
        time.sleep(.1)
    subprocess.run(['adb', 'install', '-r', str(root / 'probe.apk')], check=True)
    subprocess.run(['adb', 'reverse', 'tcp:18080', 'tcp:18080'], check=True)
    subprocess.run(['adb', 'logcat', '-c'], check=True)
    (root / 'initial-addresses.json').write_text(shell(['ip', '-j', 'address', 'show']))
    before = page('before')
    snapshot('before', False)
    start('start-vpn')
    deadline = time.monotonic() + 20
    while True:
        tree = ui('consent')
        buttons = [n for n in tree.iter('node') if n.get('package') == 'com.android.vpndialogs' and n.get('resource-id') == 'android:id/button1']
        if buttons:
            break
        assert time.monotonic() < deadline, 'Actual owned system VPN consent dialog missing'
        time.sleep(.2)
    assert any('LYCO owned VPN probe' in n.get('text', '') for n in tree.iter('node'))
    assert len(buttons) == 1, 'Actual owned system VPN consent dialog missing'
    bounds = [int(v) for v in re.findall(r'\d+', buttons[0].get('bounds', ''))]
    assert len(bounds) == 4
    shell(['input', 'tap', str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2)])
    snapshot('vpn-start', True)
    during = page('vpn')
    vpn_state = snapshot('vpn-finished', True)
    start('stop-vpn')
    snapshot('after-stop', False)
    after = page('after')
    snapshot('after', False)
    data = json.loads((root / 'network.json').read_text())
    control_counts = {}
    for phase, report in [('before', before), ('after', after)]:
        for observation in report['observations']:
            name = observation['name']
            received = [r for r in data['stun'] if r['phase'] == phase and r['case'] == name and r['validStun'] and r.get('responseBytes', 0) > 0]
            assert received and observation['candidates'], 'Missing real STUN/native candidate positive control'
            control_counts[phase + '/' + name] = len(received)
    addresses = {}
    for observation in during['observations']:
        found = []
        for row in observation['candidates']:
            if literal(row.get('address')):
                found.append({'source': 'native-event', 'address': row['address'], 'candidateType': row.get('candidateType')})
        for line in observation['sdp'].splitlines():
            fields = line.split()
            if line.startswith('a=candidate:') and len(fields) > 4 and literal(fields[4]):
                found.append({'source': 'original-SDP', 'address': fields[4]})
        for row in observation['localStats']:
            value = row.get('address') or row.get('ip')
            if literal(value):
                found.append({'source': 'original-stats', 'address': value, 'candidateType': row.get('candidateType')})
        addresses[observation['name']] = found
    physical = {a['local'] for row in json.loads((root / 'initial-addresses.json').read_text()) for a in row.get('addr_info', []) if a.get('scope') != 'host'}
    physical_found = {n: [a for a in values if a['address'] in physical] for n, values in addresses.items()}
    counts = {n: vpn_state['stunDestinationPorts'].get(str(data['ports']['vpn'][n]), 0) for n in cases}
    vpn_received = [r for r in data['stun'] if r['phase'] == 'vpn' and r['validStun']]
    result = {'experimentCompleted': True, 'candidate': candidate, 'controlStunCounts': control_counts,
              'actualConsentDialogObserved': True, 'actualVpnState': vpn_state,
              'capturedStunPacketsByContext': counts, 'receivedStunPacketsWithVpn': len(vpn_received),
              'packetInterceptionProvenForTheseContexts': all(v > 0 for v in counts.values()) and not vpn_received,
              'originalNumericAddressObservations': addresses, 'physicalInterfaceAddressesObserved': physical_found,
              'rawAddressGatePassedForTheseThreeContexts': not any(addresses.values()),
              'upstreamForwarding': False, 'turnFunctionalPositiveProven': False,
              'permissionRevocationFailClosedProven': False, 'ipv6PacketBoundaryProven': False,
              'fullOriginalNineContextPrivacyGatePassed': False, 'productAdopted': False,
              'oldDataOrKeyMigrationTested': False,
              'scope': 'Owned non-debuggable API35 vanilla WebView before/during/after capture-only per-app VPN. Three native contexts and real owned STUN endpoints; raw event/SDP/stats retained. Measurement only, not a proxy/TURN/IPv6/revocation/privacy fix or product replacement.'}
    (root / 'RESULT.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ['candidate', 'originalNumericAddressObservations']}, indent=2))
finally:
    with (root / 'final-logcat.txt').open('w') as output:
        subprocess.run(['adb', 'logcat', '-d', '-v', 'threadtime'], stdout=output, check=False)
    with (root / 'final-screen.png').open('wb') as output:
        subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=output, check=False)
    subprocess.run(['adb', 'shell', 'am', 'force-stop', package], check=False)
    subprocess.run(['adb', 'uninstall', package], check=False)
    fixture.terminate()
    fixture.wait(timeout=15)
    fixture_log.close()
