"""Control-flow fixtures only: never connect to a server or simulate product results."""
import os,subprocess,tempfile,unittest
from pathlib import Path

class ScopedSshRetryTests(unittest.TestCase):
    def exercise(self,scenario):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);stub=root/'ssh-fixture'
            stub.write_text('''#!/usr/bin/env python3
import os,pathlib,sys
p=pathlib.Path(os.environ['COUNT_PATH']);n=int(p.read_text())+1 if p.exists() else 1;p.write_text(str(n))
s=os.environ['SSH_SCENARIO']
if s=='operation':print('remote operation failed',file=sys.stderr);sys.exit(1)
if s=='disconnected':print('client_loop: send disconnect: Broken pipe',file=sys.stderr);sys.exit(255)
if s=='partial':print('operation-started');print('Permission denied',file=sys.stderr);sys.exit(255)
if n<3:print('Permission denied (publickey)',file=sys.stderr);sys.exit(255)
print('owned-control-flow-fixture-only')
''');stub.chmod(0o700)
            env={**os.environ,'RUNNER_TEMP':folder,'PROBE_USER':'fixture','PROBE_HOST':'example.invalid',
                 'LYCO_PROBE_PHASE':'owned-fixture','LYCO_SSH_BIN':str(stub),'LYCO_SSH_MAX_ATTEMPTS':'3',
                 'LYCO_SSH_RETRY_DELAY':'0','SSH_SCENARIO':scenario,'COUNT_PATH':str(root/'count')}
            result=subprocess.run(['bash','scripts/run-scoped-ssh-probe.sh'],env=env,capture_output=True,text=True)
            return result,int((root/'count').read_text())
    def test_operational_failure_is_never_retried(self):
        result,count=self.exercise('operation');self.assertEqual(count,1);self.assertNotEqual(result.returncode,0)
    def test_broken_authenticated_connection_is_not_retried(self):
        result,count=self.exercise('disconnected');self.assertEqual(count,1);self.assertNotEqual(result.returncode,0)
    def test_partial_operation_output_prevents_retry(self):
        result,count=self.exercise('partial');self.assertEqual(count,1);self.assertNotEqual(result.returncode,0)
    def test_only_pre_authentication_failure_may_retry(self):
        result,count=self.exercise('authentication');self.assertEqual(count,3);self.assertEqual(result.returncode,0)

if __name__=='__main__':unittest.main()
