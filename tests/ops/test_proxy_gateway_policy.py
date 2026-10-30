import copy,json,tempfile,unittest
from pathlib import Path
from proxy_gateway_policy import prefer_gateway,routing_digest

class GatewayPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.config={'inbounds':[{'name':'private-user','uuid':'owned-fixture-only'}],
                     'outbounds':[{'tag':'ssh-fast','type':'socks','server':'127.0.0.1','server_port':1085}],
                     'route':{'rules':[{'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}]},'dns':{}}
        self.proof={'schema_version':1,'enabled':True,'verification_run':'40865149238',
                    'routing_sha256':routing_digest(self.config),'minimum_complete_sample_bytes':4194304,'minimum_kib_s':988.9}
        self.nodes=[{'name':'existing-owned-relay','type':'vmess','network':'ws','tls':True,'port':443,
                     'ws-opts':{'path':'/panel-ws'},'uuid':'unchanged-owned-fixture'}]
        self.folder=Path(self.temp.name);self.proof_file=self.folder/'proof.json';self.config_file=self.folder/'config.json'
    def run_policy(self, candidates=None):
        self.proof_file.write_text(json.dumps(self.proof));self.config_file.write_text(json.dumps(self.config))
        return prefer_gateway(self.nodes,['KR','AU'] if candidates is None else candidates,self.proof_file,self.config_file)
    def test_prefers_existing_name_and_preserves_fallbacks_and_credentials(self):
        before=copy.deepcopy(self.nodes);self.assertEqual(self.run_policy(),['existing-owned-relay','KR','AU']);self.assertEqual(self.nodes,before)
    def test_new_customer_account_does_not_invalidate_route_proof(self):
        self.config['inbounds'].append({'uuid':'new-owned-fixture'})
        self.assertEqual(self.run_policy()[0],'existing-owned-relay')
    def test_changed_egress_does_not_reuse_verified_preference(self):
        self.config['outbounds'][0]['server_port']=1086
        self.assertEqual(self.run_policy(),['KR','AU'])
    def test_missing_malformed_disabled_or_weak_proof_keeps_existing_candidates(self):
        for key,value in [('enabled',False),('minimum_complete_sample_bytes',750000),('minimum_kib_s',20),('verification_run','invalid')]:
            with self.subTest(key=key):
                old=self.proof[key];self.proof[key]=value;self.assertEqual(self.run_policy(),['KR','AU']);self.proof[key]=old
        self.assertEqual(prefer_gateway(self.nodes,['KR'],self.folder/'missing',self.config_file),['KR'])
        self.proof_file.write_text('bad json');self.assertEqual(prefer_gateway(self.nodes,['KR'],self.proof_file,self.config_file),['KR'])
    def test_unverified_tls_or_other_protocol_is_not_promoted(self):
        for key,value in [('tls',False),('skip-cert-verify',True),('type','vless'),('port',80)]:
            with self.subTest(key=key):
                before=copy.deepcopy(self.nodes);self.nodes[0][key]=value;self.assertEqual(self.run_policy(),['KR','AU']);self.nodes=before
    def test_generic_download_proof_does_not_certify_specific_sites(self):
        self.run_policy()
        self.assertEqual(prefer_gateway(self.nodes,['KR'],self.proof_file,self.config_file,site='youtube'),['KR'])
        self.proof['site_probes']={'youtube':True,'chatgpt':False};self.run_policy()
        self.assertEqual(prefer_gateway(self.nodes,['KR'],self.proof_file,self.config_file,site='youtube'),['existing-owned-relay','KR'])
        self.assertEqual(prefer_gateway(self.nodes,['KR'],self.proof_file,self.config_file,site='chatgpt'),['KR'])
    def test_repeat_selection_has_no_duplicate_or_input_mutation(self):
        candidates=['KR','existing-owned-relay','AU'];before=list(candidates)
        self.assertEqual(self.run_policy(candidates),['existing-owned-relay','KR','AU']);self.assertEqual(candidates,before)

if __name__=='__main__':unittest.main()
