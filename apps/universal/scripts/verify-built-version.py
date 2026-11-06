"""Check generated native metadata, not only the input Expo configuration."""
import json
import os
from pathlib import Path
import plistlib
import shlex
import sys

if os.environ.get('GITHUB_ACTIONS')!='true':
    raise SystemExit('Built application verification runs on Actions only')
platform,metadata,output=sys.argv[1:]
root=Path(__file__).resolve().parent.parent
product=json.loads((root/'src/product.json').read_text())
config=json.loads((root/'app.json').read_text())['expo']
if platform=='android':
    lines=[line for line in Path(metadata).read_text().splitlines() if line.startswith('package: ')]
    if len(lines)!=1:raise SystemExit('Exactly one APK package declaration is required')
    package=dict(item.split('=',1) for item in shlex.split(lines[0][9:]))
    actual={'identifier':package['name'],'version':package['versionName'],'build':package['versionCode']}
    identifier=config['android']['package']
elif platform in ('ios-device','ios-simulator'):
    info=plistlib.loads(Path(metadata).read_bytes())
    expected_platform='iPhoneOS' if platform=='ios-device' else 'iPhoneSimulator'
    if info['CFBundleSupportedPlatforms']!=[expected_platform]:raise SystemExit('Incorrect Apple binary platform')
    actual={'identifier':info['CFBundleIdentifier'],'version':info['CFBundleShortVersionString'],'build':info['CFBundleVersion']}
    identifier=config['ios']['bundleIdentifier']
else:raise SystemExit('Unknown application platform')
expected={'identifier':identifier,'version':product['version'],'build':str(product['build'])}
if actual!=expected:raise SystemExit('Compiled application identity differs from the shared product manifest: '+json.dumps(actual))
record={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],'platform':platform,
        **actual,'channel':product['channel'],'verification':'compiled-native-metadata'}
Path(output).write_text(json.dumps(record,indent=2)+'\n')
print('Compiled application identity verified:',platform,actual['version'],actual['build'])
