#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Native proxy investigation runs on Actions only' >&2; exit 2; }
phase=${1:-all}
[[ "$phase" == all || "$phase" == prepare || "$phase" == run ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-ios-proxy-probe"
app="$RUNNER_TEMP/LYCOProxyProbe.app"
relay_private="$RUNNER_TEMP/lyco-ios-relay-private"
mkdir -p "$evidence" "$app" "$RUNNER_TEMP/probe-core"
stage() { date -u '+%Y-%m-%dT%H:%M:%SZ' | tr '\n' ' '; echo "$1"; }
if [[ "$phase" != run ]]; then
stage 'Extract native core' | tee -a "$evidence/stages.txt"
tar xzf "$RUNNER_TEMP/lyco-tunnel-apple.tar.gz" -C "$RUNNER_TEMP/probe-core"
framework=$(python3 - <<'PY'
import os,plistlib
from pathlib import Path
root=Path(os.environ['RUNNER_TEMP'])/'probe-core/Lycotunnel.xcframework'
info=plistlib.loads((root/'Info.plist').read_bytes())
libraries=[x for x in info['AvailableLibraries'] if x.get('SupportedPlatformVariant')=='simulator' and x['SupportedPlatform']=='ios']
assert len(libraries)==1
print(root/libraries[0]['LibraryIdentifier'])
PY
)
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
arch=$(uname -m)
stage 'Compile minimal UIKit application' | tee -a "$evidence/stages.txt"
xcrun --sdk iphonesimulator swiftc -swift-version 5 -target "$arch-apple-ios17.0-simulator" -sdk "$sdk" \
  -F "$framework" -framework Lycotunnel -framework UIKit -framework WebKit -framework Network \
  -framework Foundation -framework Security -framework CFNetwork -framework CoreFoundation -lresolv \
  "$root/ios-proxy-probe.swift" -o "$app/LYCOProxyProbe"
stage 'Compiled application; prepare metadata' | tee -a "$evidence/stages.txt"
stage 'Generate owned relay certificates on this runner only' | tee -a "$evidence/stages.txt"
(
  umask 077
  mkdir "$relay_private"
  cat > "$relay_private/leaf.cnf" <<'CONFIG'
[req]
prompt = no
distinguished_name = dn
[dn]
CN = 127.0.0.1
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = IP:127.0.0.1
authorityKeyIdentifier = keyid,issuer
subjectKeyIdentifier = hash
CONFIG
  for variant in trusted untrusted; do
    cat > "$relay_private/$variant-ca.cnf" <<CONFIG
[req]
prompt = no
distinguished_name = dn
x509_extensions = root
[dn]
CN = LYCO owned $variant relay test root
[root]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
CONFIG
    openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 2 \
      -config "$relay_private/$variant-ca.cnf" -keyout "$relay_private/$variant-ca.key" -out "$relay_private/$variant-ca.pem"
    openssl req -new -newkey rsa:2048 -sha256 -nodes -config "$relay_private/leaf.cnf" \
      -keyout "$relay_private/$variant.key" -out "$relay_private/$variant.csr"
    openssl x509 -req -in "$relay_private/$variant.csr" -CA "$relay_private/$variant-ca.pem" \
      -CAkey "$relay_private/$variant-ca.key" -CAcreateserial -days 2 -sha256 \
      -extfile "$relay_private/leaf.cnf" -extensions server -out "$relay_private/$variant-leaf.pem"
    cat "$relay_private/$variant-leaf.pem" "$relay_private/$variant-ca.pem" > "$relay_private/$variant.pem"
  done
  openssl x509 -in "$relay_private/trusted-ca.pem" -outform DER -out "$app/relay-anchor.der"
  chmod 644 "$app/relay-anchor.der"
) > "$evidence/relay-certificates.log" 2>&1
python3 - "$app/Info.plist" <<'PY'
import plistlib,sys
from pathlib import Path
Path(sys.argv[1]).write_bytes(plistlib.dumps({
 'CFBundleIdentifier':'top.lain42.lycoproxyprobe','CFBundleName':'LYCO Proxy Probe',
 'CFBundleExecutable':'LYCOProxyProbe','CFBundlePackageType':'APPL',
 'CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'17.0',
 'CFBundleSupportedPlatforms':['iPhoneSimulator'],'UIDeviceFamily':[1,2],
 # This isolated HTTP fixture also exercises URLSession; product ATS is unchanged.
 'LSRequiresIPhoneOS':True,'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True},
}))
PY
xcrun simctl list devices available --json > "$evidence/simulators.json"
xcodebuild -version > "$evidence/xcode-version.txt"
xcrun --sdk iphonesimulator --show-sdk-version > "$evidence/sdk-version.txt"
device=$(python3 - "$evidence/simulators.json" <<'PY'
import json,sys
devices=json.load(open(sys.argv[1]))['devices']
print(next(d['udid'] for group in devices.values() for d in group if d['name'].startswith('iPhone') and d.get('isAvailable')))
PY
)
echo "$device" > "$evidence/simulator-udid.txt"
stage 'Boot simulator' | tee -a "$evidence/stages.txt"
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
stage 'Install minimal application' | tee -a "$evidence/stages.txt"
xcrun simctl install "$device" "$app"
python3 - "$evidence" "$app" <<'PY'
import hashlib,json,os,sys
from pathlib import Path
evidence,app=map(Path,sys.argv[1:])
(evidence/'prepared.json').write_text(json.dumps({'run':os.environ['GITHUB_RUN_ID'],'source':os.environ['GITHUB_SHA'],
 'device':(evidence/'simulator-udid.txt').read_text().strip(),
 'executableSha256':hashlib.sha256((app/'LYCOProxyProbe').read_bytes()).hexdigest(),
 'relayAnchorSha256':hashlib.sha256((app/'relay-anchor.der').read_bytes()).hexdigest(),
 'globalTrustModified':False,'privateKeysInArtifact':False},indent=2)+'\n')
PY
[[ "$phase" != prepare ]] || exit 0
fi
device=$(cat "$evidence/simulator-udid.txt")
python3 - "$evidence" "$app" <<'PY'
import hashlib,json,os,sys
from pathlib import Path
evidence,app=map(Path,sys.argv[1:]);meta=json.loads((evidence/'prepared.json').read_text())
assert meta['run']==os.environ['GITHUB_RUN_ID'] and meta['source']==os.environ['GITHUB_SHA']
assert meta['device']==(evidence/'simulator-udid.txt').read_text().strip()
assert meta['executableSha256']==hashlib.sha256((app/'LYCOProxyProbe').read_bytes()).hexdigest()
assert meta['relayAnchorSha256']==hashlib.sha256((app/'relay-anchor.der').read_bytes()).hexdigest()
with (evidence/'run-started').open('x') as stream:stream.write(os.environ['GITHUB_RUN_ID']+'\n')
PY
container=$(xcrun simctl get_app_container "$device" top.lain42.lycoproxyprobe data)
[[ ! -e "$container/Documents/results.json" ]] || { echo 'Old completed probe cannot supply current results' >&2; exit 1; }
python3 "$root/proxy-probe-fixture.py" "$evidence" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
relay_pid=''
trap 'kill "$fixture_pid" "${relay_pid:-}" 2>/dev/null || true' EXIT
for attempt in $(seq 1 100); do
  kill -0 "$fixture_pid" || { echo 'Owned proxy fixture stopped before readiness' >&2; exit 1; }
  [[ -s "$evidence/network.json" ]] && break
  sleep .1
done
test -s "$evidence/network.json"
node "$root/h2-relay-fixture.mjs" "$evidence" "$relay_private" > "$evidence/relay-fixture.log" 2>&1 &
relay_pid=$!
for attempt in $(seq 1 100); do
  kill -0 "$relay_pid" || { echo 'Owned relay stopped before readiness' >&2; exit 1; }
  if [[ -s "$evidence/relay-network.json" ]] && python3 - "$evidence/relay-network.json" <<'PY'
import json,sys
assert json.load(open(sys.argv[1]))['ready'] is True
PY
  then break; fi
  sleep .1
done
node "$root/h2-relay-fixture.mjs" "$evidence" "$relay_private" --check
stage 'Launch minimal application' | tee -a "$evidence/stages.txt"
xcrun simctl launch "$device" top.lain42.lycoproxyprobe > "$evidence/launch.txt"
# Extra relay and certificate-negative cases retain 6s each. Simulator preparation
# has its own step; no original per-request budget or assertion is relaxed.
for attempt in $(seq 1 360); do
  if [[ -s "$container/Documents/results.json" ]]; then break; fi
  sleep 1
done
stage 'Collect application observations' | tee -a "$evidence/stages.txt"
cp "$container/Documents/results.json" "$evidence/results.json"
python3 - "$evidence" <<'PY'
import json,os,sys
from pathlib import Path
root=Path(sys.argv[1]);all_rows=json.loads((root/'results.json').read_text());events=json.loads((root/'network.json').read_text())
assert len(all_rows)==48, 'All original modes, independent controls, relay and TLS-negative cases must finish'
rows=[row for row in all_rows if row['transport']=='webview']
foundation=[row for row in all_rows if row['transport']=='urlsession']
network=[row for row in all_rows if row['transport']=='network']
assert len(rows)==26 and len(foundation)==11 and len(network)==11
expected=set()
for transport,modes in [('webview',['direct-http','direct-http-v6','core-http','core-socks','core-socks-empty','core-socks-explicit','core-socks-wildcard']),
                        ('urlsession',['direct-http','core-socks']),('network',['direct-http','core-socks'])]:
    prefix='' if transport=='webview' else transport+'-'
    expected.add(prefix+'direct-control-local')
    expected.update(prefix+mode+'-'+phase for mode in modes for phase in ['domain','local','stopped-local'])
    expected.update(prefix+'relay-h2-'+phase for phase in ['domain','local','stopped-local'])
    expected.add(prefix+'relay-untrusted-domain')
assert len({row['case'] for row in all_rows})==48 and {row['case'] for row in all_rows}==expected, 'Every required native case must complete exactly once'
receipts=all(row.get('configurationCount')==1 and row.get('allowsFailover') is False
             for row in all_rows if row['mode']!='direct-control')
baseline=[e for e in events if e['case']=='direct-control-local']
assert baseline and all(not e['viaProxy'] for e in baseline), 'Direct positive control did not reach the same live origin'
control=[row for row in rows if row['case']=='direct-control-local']
assert len(control)==1 and control[0]['result']=='loaded' and control[0].get('originContent'), 'Direct positive control did not finish loading original content'
safe=[];modes=sorted({row['mode'] for row in rows if row['mode'] not in ['direct-control','relay-untrusted']})
for mode in modes:
    probes=[row for row in rows if row['mode']==mode]
    healthy=all(row['result']=='loaded' and row.get('originContent') and
                any(e['case']==row['case'] and e['viaProxy'] for e in events) and
                not any(e['case']==row['case'] and not e['viaProxy'] for e in events)
                for row in probes if row['phase']!='stopped-local')
    stopped=not any(e['case']==mode+'-stopped-local' for e in events)
    if healthy and stopped:safe.append(mode)
def compare(transport,observations):
    control=[row for row in observations if row['mode']=='direct-control']
    baseline=[e for e in events if e['case']==transport+'-direct-control-local']
    valid=(len(control)==1 and control[0]['result']=='loaded' and control[0].get('originContent') and
           bool(baseline) and all(not e['viaProxy'] for e in baseline))
    comparisons=[]
    for mode in ['direct-http','core-socks']:
        for phase in ['domain','local','stopped-local']:
            case=transport+'-'+mode+'-'+phase
            observed,=[row for row in observations if row['case']==case]
            requests=[e for e in events if e['case']==case]
            comparisons.append({'case':case,'result':observed['result'],'originContent':observed.get('originContent',False),
                                'proxyRequests':sum(e['viaProxy'] for e in requests),
                                'directRequests':sum(not e['viaProxy'] for e in requests)})
    domains={mode:any(row['case']==transport+'-'+mode+'-domain' and row['result']=='loaded' and
                     row['originContent'] and row['proxyRequests']>0 and row['directRequests']==0
                     for row in comparisons) for mode in ['direct-http','core-socks']}
    return valid,comparisons,domains
foundation_valid,comparisons,foundation_domains=compare('urlsession',foundation)
network_valid,network_comparisons,network_domains=compare('network',network)
relay=json.loads((root/'relay-network.json').read_text())
fixture=json.loads((root/'relay-fixture-control.json').read_text())
relay_results={}
for transport,observations in [('webview',rows),('urlsession',foundation),('network',network)]:
    prefix='' if transport=='webview' else transport+'-'
    positive,=[row for row in observations if row['case']==prefix+'relay-h2-domain']
    negative,=[row for row in observations if row['case']==prefix+'relay-untrusted-domain']
    trusted=(positive.get('relayTrustChecks',0)>0 and positive.get('relayTrustAcceptedCount',0)>0 and
             positive.get('relayTrustSetupValid') is True and positive.get('originContent') is True and
             any(e['case']==positive['case'] and e['viaProxy'] for e in events) and
             not any(e['case']==positive['case'] and not e['viaProxy'] for e in events) and
             any(e.get('case')==positive['case'] and e['variant']=='trusted' and e['tunnelReady'] for e in relay['streams']))
    untrusted=(negative.get('relayTrustChecks',0)>0 and negative.get('relayTrustAcceptedCount',0)==0 and
               negative.get('relayTrustRejectedCount',0)>0 and negative.get('relayTrustSetupValid') is True and
               not negative.get('originContent') and not any(e['case']==negative['case'] for e in events) and
               not any(e['variant']=='untrusted' for e in relay['streams']))
    candidates=[row for row in observations if row['mode']=='relay-h2']
    routed=all(any(e['case']==row['case'] and e['viaProxy'] for e in events) and
               not any(e['case']==row['case'] and not e['viaProxy'] for e in events) and row.get('originContent')
               and any(e.get('case')==row['case'] and e['variant']=='trusted' and e['tunnelReady'] for e in relay['streams'])
               for row in candidates if row['phase']!='stopped-local')
    stopped=not any(e['case']==prefix+'relay-h2-stopped-local' for e in events)
    relay_results[transport]={'trustedDomainValid':trusted,'untrustedCertificateRejected':untrusted,
                              'healthyTargetsProxied':routed,'stoppedLocalBlocked':stopped,
                              'qualified':trusted and untrusted and routed and stopped}
summary={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
         'scope':'Isolated iOS public-API investigation; not product acceptance or device certification',
         'safeModesForTheseCases':safe,'modes':modes,'originRequests':len(events),
         'foundationControlValid':foundation_valid,'foundationComparisons':comparisons,
         'foundationDomainControls':foundation_domains,
         'networkControlValid':network_valid,'networkComparisons':network_comparisons,
         'networkDomainControls':network_domains,
         'configurationReceiptsValid':receipts,
         'relayFixtureControl':fixture,'relayResults':relay_results,
         'nativeOriginRequests':sum(e['case'] in expected for e in events),
         'foundationIsNotAWebViewReplacement':True}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
assert receipts, 'Actual transport proxy configuration readback differs from the strict request'
assert foundation_valid, 'Foundation direct positive control is invalid; do not infer a system-layer failure'
assert network_valid, 'Network direct positive control is invalid; do not infer lower-stack behavior'
assert fixture['positive'] and fixture['untrustedCertificateRejected'], 'Owned relay/TLS fixture controls invalid'
assert relay_results['webview']['qualified'], 'Secure relay must satisfy the actual WebView routing and TLS gates before adoption'
if not safe:raise SystemExit('No tested public proxy configuration passed both healthy routing and stopped local negative control')
PY
