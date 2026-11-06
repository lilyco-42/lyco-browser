import importlib.util
import os
from pathlib import Path
import unittest

if os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Signature regression tests run on Actions only')
spec=importlib.util.spec_from_file_location('signature',Path(__file__).with_name('verify-android-signature.py'))
signature=importlib.util.module_from_spec(spec);spec.loader.exec_module(signature)
DIGEST='fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c'

class SignatureOutput(unittest.TestCase):
    def report(self,lines,count='1',status='Verifies'):
        return status+'\nNumber of signers: '+count+'\n'+lines+'\n'

    def test_current_runner_output_and_legacy_output(self):
        for label in ['V2 Signer:','V3 Signer:','V3.1 Signer:','Signer #1']:
            text=self.report(label+' certificate SHA-256 digest: '+DIGEST)
            self.assertEqual(signature.signer_fingerprint(text),DIGEST)

    def test_same_certificate_repeated_for_multiple_schemes(self):
        text=self.report('\n'.join(label+' certificate SHA-256 digest: '+DIGEST for label in ['V2 Signer:','V3 Signer:']))
        self.assertEqual(signature.signer_fingerprint(text),DIGEST)

    def test_missing_malformed_multiple_and_unverified_signers_are_rejected(self):
        line='V2 Signer: certificate SHA-256 digest: '+DIGEST
        for text in [self.report(line,count='2'),self.report(line,status='DOES NOT VERIFY'),
                     self.report('V2 Signer: public key SHA-256 digest: '+DIGEST),
                     self.report(line[:-1]),self.report(line+'\nSigner #2 certificate SHA-256 digest: '+'0'*64),
                     self.report(line)+'Number of signers: 1\n']:
            with self.assertRaises(ValueError):signature.signer_fingerprint(text)

if __name__=='__main__':unittest.main()
