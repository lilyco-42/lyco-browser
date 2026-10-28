"""Retain real counterexamples as failures; never rewrite candidates or packets."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1]); data = json.loads((root/'network.json').read_text())
engine_probe = len(sys.argv)==3 and sys.argv[2]=='--native-engine'
reports = {row['phase']: row for row in data['reports']}
window = json.loads((root/'stopped-window-network.json').read_text())
expected_cases = json.loads((Path(__file__).parent/'rtc-cases.json').read_text())
udp = {phase: sum(row['phase']==phase and row['validStun'] for row in data['udp']) for phase in ['control','lyco','stopped','control-after']}
stopped_summary = None
native_title_completed = False
for node in ET.parse(root/'stopped-ui.xml').iter('node'):
    for key in ['text', 'content-desc']:
        value = node.get(key, '')
        if value.startswith('LYCO_RTC_JSON:'):
            stopped_summary = json.loads(value.split(':', 1)[1])
        if value=='ENGINE TITLE: LYCO RTC stopped completed': native_title_completed = True
stopped = reports.get('stopped', {}).get('observation')

checks = {}
def peer(value):
    return bool(value and value.get('completed') and value.get('apiPresent') and value.get('offerCreated') and not value.get('blocked'))
def cases(value):
    return {row['case']: row for row in (value or {}).get('cases', [])}
def literal(value):
    if not isinstance(value, str): return False
    try:
        import ipaddress
        ipaddress.ip_address(value); return True
    except ValueError: return False
def originals_have_ip(value):
    if any(literal(row.get('address')) for row in value.get('candidates', [])): return True
    for line in value.get('sdp','').splitlines():
        if line.startswith('a=candidate:'):
            fields=line.split()
            if len(fields)>4 and literal(fields[4]): return True
    return any(literal(row.get('address') or row.get('ip')) for row in value.get('localStats', []))
def clean_relay(value):
    records=value.get('candidates', [])
    if not records or any(row.get('type')!='relay' for row in records): return False
    # Real relay addresses are allowed in the TURN positive only. Host/srflx or
    # related device addresses remain prohibited; SDP/stats stay original.
    for line in value.get('sdp','').splitlines():
        if not line.startswith('a=candidate:'): continue
        fields=line.split()
        if len(fields)<8 or fields[7]!='relay': return False
        if 'raddr' in fields and fields[fields.index('raddr')+1] not in ('0.0.0.0','::'): return False
    for row in value.get('localStats', []):
        if row.get('candidateType')!='relay' and literal(row.get('address') or row.get('ip')): return False
        if row.get('relatedAddress') not in (None,'','0.0.0.0','::'): return False
    return True
for phase in ['control', 'control-after']:
    row = reports.get(phase, {})
    observed=cases(row.get('observation'))
    checks[phase+'-real-peer-direct-http-and-stun-positive'] = row.get('route')=='direct' and peer(row.get('observation')) and set(observed)==set(expected_cases) and all(
        value.get('applicable') is False or (peer(value) and originals_have_ip(value) and any(p['phase']==phase and p['case']==name and p['validStun'] for p in data['udp'])) for name,value in observed.items())
row = reports.get('lyco', {})
checks['actual-product-peer-page-and-report-use-selected-tcp-upstream'] = peer(row.get('observation')) and row.get('route')=='selected' and any(r['phase']=='lyco' and r['route']=='selected' for r in data['pageRequests'])
ui_completed = (bool(stopped_summary) and stopped_summary.get('phase')=='stopped' and stopped_summary.get('completed') is True) or (engine_probe and native_title_completed)
checks['actual-stopped-product-peer-completed-and-upstream-stopped'] = peer(stopped) and stopped.get('phase')=='stopped' and ui_completed and window['stopped'] and window['stopEvents'][-1]['action']=='stop'
valid = all(checks.values())
checks['healthy-product-no-direct-stun'] = udp['lyco']==0
checks['stopped-product-no-direct-stun'] = udp['stopped']==0
checks['healthy-product-no-literal-ip-candidate'] = row.get('observation', {}).get('literalIP') is False
checks['stopped-product-no-literal-ip-candidate'] = bool(stopped) and stopped.get('literalIP') is False
for phase,observation in [('lyco',row.get('observation')),('stopped',stopped)]:
    observed=cases(observation)
    checks[phase+'-all-first-script-frame-and-config-peers-complete'] = set(observed)==set(expected_cases) and all(value.get('applicable') is False or peer(value) for value in observed.values())
    checks[phase+'-original-events-sdp-and-stats-no-device-address'] = bool(observed) and all(not originals_have_ip(value) for value in observed.values())
    if engine_probe:
        # Gecko applies a native policy below the page API. Retain the real
        # configuration as evidence rather than imposing the JS shim's reported
        # policy value. Packet/event/SDP/stats and real TURN gates remain strict.
        def native_configuration(name, value):
            if value.get('applicable') is False: return name=='legacy-constructor'
            config=value.get('configuration',{})
            return config.get('iceTransportPolicy') in ('all','relay') and isinstance(config.get('iceServers'),list)
        checks[phase+'-native-engine-original-configuration-readable'] = bool(observed) and all(native_configuration(name,value) for name,value in observed.items())
    else:
        checks[phase+'-actual-relay-policy-on-every-applicable-peer'] = bool(observed) and all(value.get('applicable') is False or value.get('configuration',{}).get('iceTransportPolicy')=='relay' for value in observed.values())
for phase in ['control','control-after']:
    observation=reports.get(phase,{}).get('observation',{}).get('turn',{})
    checks[phase+'-real-turn-tcp-datachannel-positive'] = peer(observation) and observation.get('dataAck') is True and clean_relay(observation) and any(p['phase']==phase and p['route']=='direct' and p['clientBytes']>0 and p['serverBytes']>0 for p in data['turnConnections']) and any(p['phase']==phase and p['message']=='LYCO_OWNED_TURN_PING' for p in data['peerMessages'])
    valid = valid and checks[phase+'-real-turn-tcp-datachannel-positive']
healthy=row.get('observation',{}).get('turn',{})
checks['healthy-real-turn-tcp-datachannel-via-selected-upstream'] = peer(healthy) and healthy.get('dataAck') is True and clean_relay(healthy) and any(p['phase']=='lyco' and p['route']=='selected' and p['clientBytes']>0 and p['serverBytes']>0 for p in data['turnConnections']) and any(p['phase']=='lyco' and p['route']=='selected' for p in data['peerOffers']) and any(p['phase']=='lyco' and p['message']=='LYCO_OWNED_TURN_PING' for p in data['peerMessages'])
checks['healthy-and-stopped-no-direct-turn-tcp'] = all(p['route']=='selected' for p in data['turnConnections'] if p['phase'] in ('lyco','stopped'))
checks['stopped-real-turn-peer-complete-without-traffic-or-data-ack'] = bool(stopped) and stopped.get('turn',{}).get('completed') is True and stopped.get('turn',{}).get('offerCreated') is True and stopped.get('turn',{}).get('dataAck') is False and not any(p['phase']=='stopped' for p in window['turnConnections']) and not any(p['phase']=='stopped' for p in data['peerMessages'])
result = {'validProbe':valid,'passed':valid and all(checks.values()),'checks':checks,'udpStunPackets':udp,
          'productHealthy':row.get('observation'),'productStopped':stopped,'candidate':json.loads((root/'candidate.json').read_text()),
          'scope':f'Actual signed APK on API35 with same-provider before/after plain WebView controls; {len(expected_cases)} first-script/frame/configuration cases, distinct STUN ports, unchanged native candidates/SDP/local-candidate stats, owned coturn TCP and real aiortc datachannel. 4500ms gathering and 18000ms datachannel windows. Original stopped observation retained before recovery-only HTTP upload. No RTC observation injection or product test API. Not all providers, HTTPS/WSS/IPv6/DNS, real customer egress, iOS or a release.'}
if engine_probe:
    for phase in ['control','control-after','lyco']:
        values=reports.get(phase,{}).get('observation',{}).get('loopbacks',[])
        checks[phase+'-actual-three-loopback-http-targets-positive'] = len(values)==3 and all(x.get('ok') for x in values) and all(
            any(x['phase']==phase and x['family']==host and x['route']==('selected' if phase=='lyco' else 'direct') for x in data['loopbackRequests']) for host in ['127.0.0.1','[::1]','localhost'])
        if phase!='lyco': valid = valid and checks[phase+'-actual-three-loopback-http-targets-positive']
    values=(stopped or {}).get('loopbacks',[])
    checks['stopped-three-loopback-targets-no-direct-fallback'] = len(values)==3 and all(x.get('ok') is False for x in values) and not any(x['phase']=='stopped' for x in window['loopbackRequests'])
    meta=result['candidate']
    checks['standalone-release-engine-without-page-policy'] = meta.get('notProductAPK') is True and meta.get('debuggable') is False and meta.get('pagePolicyScript') is False and native_title_completed
    result['checks']={k.replace('product','engine'):v for k,v in checks.items()}
    result['validProbe']=valid; result['passed']=valid and all(checks.values())
    result['probeHealthy']=result.pop('productHealthy'); result['probeStopped']=result.pop('productStopped')
    result['engineCapabilityOnly']=True
    result['scope']='Standalone non-debuggable GeckoView experiment, NOT the LYCO product APK or a migration. Same-engine before/after controls; ten real first-script/frame/config cases, raw events/SDP/localStats, actual owned TURN TCP datachannel, three actual loopback HTTP targets and stopped-route negatives. Native public configFilePath only, no page policy or RTC observation rewriting. No product adoption, independent-storage migration, all-platform release, customer egress or iOS proof.'
(root/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
if not result['passed']:
    raise SystemExit('Native RTC boundary failed or the probe is invalid; original observations retained')
