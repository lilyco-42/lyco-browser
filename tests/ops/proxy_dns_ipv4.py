#!/usr/bin/python3
"""Measure A-only encrypted DNS on the exact current IPv4 AU SSH transport."""
import copy,datetime,hashlib,json,os,pathlib,statistics
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='dns-ipv4'
os.umask(0o077);probe=globals()['LYCO_PROBE'];p=pathlib.Path('/etc/sing-box/config.json');raw=p.read_bytes();live=json.loads(raw)
assert hashlib.sha256(raw).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
optimized=copy.deepcopy(live)
# Only TCP destinations sent through the IPv4 AU SSH exit use A-only DNS.
# Preserve the existing dual-family UDP resolution and its HTTPS detour.
assert optimized['dns']==live['dns']
tcp=[];udp=[]
for original in live['route']['rules'][:2]:
    assert original['action']=='resolve' and original['strategy']=='prefer_ipv4' and 'network' not in original
    rule=copy.deepcopy(original);rule.update(network='tcp',strategy='ipv4_only');tcp.append(rule)
    rule=copy.deepcopy(original);rule['network']='udp';udp.append(rule)
optimized['route']['rules']=tcp+udp+copy.deepcopy(live['route']['rules'][2:])
assert optimized['inbounds']==live['inbounds'] and optimized['outbounds']==live['outbounds']
current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
def test(label,cfg):return probe(label,current,live_config=cfg,download_bytes=4194304,github=True,site_checks=True)
def passes(value):
    files=[n for n in value.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
    pages=[n for n in value.get('samples',[]) if n['name'] in ('cloudflare-page','google-page')]
    return value.get('allPassed') is True and len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files) and len(pages)==2 and all(n['firstByteMs']<=2000 for n in pages)
r={'phase':'dns-ipv4','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'observationOnly':True,'sameProductionSshTransport':True,'udpDualFamilyDnsPreserved':True,'baseline':[],'candidate':[]}
for i in range(2):
    r['baseline'].append(test('current-prefer-ipv4-'+str(i+1),live));r['candidate'].append(test('a-only-encrypted-dns-'+str(i+1),optimized))
def pages(values):return [s['firstByteMs'] for v in values for s in v['samples'] if s['name'] in ('cloudflare-page','google-page') and s['ok']]
r['latencyOrAvailabilityImproved']=any(not passes(v) for v in r['baseline']) or (len(pages(r['candidate']))==len(pages(r['baseline']))==4 and statistics.median(pages(r['candidate']))<=.9*statistics.median(pages(r['baseline'])))
r['qualified']=all(passes(n) for n in r['candidate']) and r['latencyOrAvailabilityImproved'];r['liveConfigurationUnchanged']=p.read_bytes()==raw;assert r['liveConfigurationUnchanged']
if r['qualified']:
    plan=p.parent/'.lyco-dns-ipv4-plan.json';assert not plan.exists();plan.write_text(json.dumps({'configuration':optimized,'previousSha256':hashlib.sha256(raw).hexdigest(),'proof':r},indent=2)+'\n');plan.chmod(0o600)
print(json.dumps(r,indent=2),flush=True)
