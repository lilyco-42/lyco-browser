import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

def signer_fingerprint(report):
    # New build-tools label the certificate by verified scheme ("V2 Signer:").
    # Older tools label it "Signer #1". Require a single actual signer, allowing
    # the same certificate to be repeated for different verified schemes.
    if not re.search(r'(?m)^Verifies\s*$',report) or re.findall(r'(?m)^Number of signers: (\d+)\s*$',report)!=['1']:
        raise ValueError('Exactly one verified APK signer is required')
    fingerprints=re.findall(r'(?m)^(?:Signer #\d+|V\d+(?:\.\d+)? Signer(?: #\d+)?):? certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$',report)
    identities={value.lower() for value in fingerprints}
    if len(identities)!=1:
        raise ValueError('Exactly one verified APK signing certificate is required')
    return identities.pop()

def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('APK verification runs on Actions only')
    report=Path(sys.argv[1]).read_text()
    expected_certificate=subprocess.check_output(['openssl','x509','-in',sys.argv[2],'-outform','DER'])
    expected=hashlib.sha256(expected_certificate).hexdigest()
    actual=signer_fingerprint(report)
    matches=actual==expected
    if os.environ.get('LYCO_REQUIRE_RELEASE_SIGNATURE')=='true' and not matches:
        raise SystemExit('APK signer does not match the retained LYCO release certificate')
    data={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
          'certificateSha256':actual,'releaseCertificateSha256':expected,
          'releaseIdentityMatches':matches,'releaseSigningRequested':os.environ.get('LYCO_REQUIRE_RELEASE_SIGNATURE')=='true'}
    (Path(os.environ['RUNNER_TEMP'])/'ANDROID-SIGNATURE-PROVENANCE.json').write_text(json.dumps(data,indent=2)+'\n')
    print('APK signing identity:', 'LYCO release certificate' if matches else 'CI preview certificate')

if __name__=='__main__':main()
