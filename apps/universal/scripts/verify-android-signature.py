import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('APK verification runs on Actions only')

report=Path(sys.argv[1]).read_text()
expected_certificate=subprocess.check_output(['openssl','x509','-in',sys.argv[2],'-outform','DER'])
expected=hashlib.sha256(expected_certificate).hexdigest()
fingerprints=re.findall(r'(?m)^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$',report)
if len(fingerprints)!=1:
    raise SystemExit('Exactly one verified APK signer is required')
actual=fingerprints[0].lower()
matches=actual==expected
if os.environ.get('LYCO_REQUIRE_RELEASE_SIGNATURE')=='true' and not matches:
    raise SystemExit('APK signer does not match the retained LYCO release certificate')

data={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
      'certificateSha256':actual,'releaseCertificateSha256':expected,
      'releaseIdentityMatches':matches,'releaseSigningRequested':os.environ.get('LYCO_REQUIRE_RELEASE_SIGNATURE')=='true'}
(Path(os.environ['RUNNER_TEMP'])/'ANDROID-SIGNATURE-PROVENANCE.json').write_text(json.dumps(data,indent=2)+'\n')
print('APK signing identity:', 'LYCO release certificate' if matches else 'CI preview certificate')
