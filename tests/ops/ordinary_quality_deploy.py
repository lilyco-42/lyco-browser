#!/usr/bin/python3
"""Apply the measured ordinary-node sampling correction, then require real restored exits."""
import datetime,hashlib,json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request
os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='ordinary-quality'
stage=pathlib.Path('/opt/studio-billing/.ordinary-quality-plan')
plan=json.loads((stage/'plan.json').read_text());candidate=stage/'verify_deep.py'
target=pathlib.Path('/opt/freeproxy-pool/verify_deep.py');old=target.read_bytes()
assert hashlib.sha256(old).hexdigest()=='33762fac3e370a6998a2cfb47ba51392d2fb7a5e05e8fc5517082da2573c499d'
assert hashlib.sha256(candidate.read_bytes()).hexdigest()==plan['qualitySha256']
expected=old.decode()
changes=[('DOWNLOAD_BYTES=262144','DOWNLOAD_BYTES=4194304'),
 ('MAX_SAMPLE_SECS=9','MAX_SAMPLE_SECS=18'),
 ('SAMPLE_URL="https://speed.cloudflare.com/__down?bytes=262144"','SAMPLE_URL="https://speed.cloudflare.com/__down?bytes=4194304"'),
 ('            "samples_kib_s":[],"exit_hash":None,"qualified":False,"reason":"probe_failed"}',
  '            "samples_kib_s":[],"sample_bytes":[],"download_elapsed_ms":[],"https_latency_ms":None,\n            "exit_hash":None,"qualified":False,"reason":"probe_failed"}'),
 ('                y,_,_=fetch(opener,"https://www.youtube.com/generate_204",16,timeout=5)',
  '                y,_,latency=fetch(opener,"https://www.youtube.com/generate_204",16,timeout=5)\n                result["https_latency_ms"]=round(latency*1000)'),
 ('                    result["samples_kib_s"].append(speed)',
  '                    result["samples_kib_s"].append(speed)\n                    result["sample_bytes"].append(len(blob))\n                    result["download_elapsed_ms"].append(round(secs*1000))')]
for before,after in changes:
    assert expected.count(before)==1;expected=expected.replace(before,after,1)
assert candidate.read_text()==expected
compile(expected,'reviewed-ordinary-quality.py','exec')
source=pathlib.Path('/opt/freeproxy-pool/cache/community-verified.json');source_raw=source.read_bytes()
source_doc=json.loads(source_raw)
assert all(n.get('node',{}).get('server')!='43.108.97.29' for n in source_doc['nodes'])
for attempt in range(30):
    if subprocess.run(['systemctl','is-active','--quiet','lyco-community-deep.service']).returncode!=0:break
    time.sleep(2)
else:raise RuntimeError('Existing deep check is still running; do not replace its source')
report_path=pathlib.Path('/opt/freeproxy-pool/cache/community-quality.json')
backup=pathlib.Path('/root/website-backups')/('ordinary-quality-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700);shutil.copy2(target,backup/'verify_deep.py');shutil.copy2(report_path,backup/'community-quality.json')

def atomic(origin,destination):
    metadata=destination.stat();fd,name=tempfile.mkstemp(prefix='.ordinary-quality-',dir=destination.parent)
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(origin.read_bytes());stream.flush();os.fsync(stream.fileno())
        os.chown(name,metadata.st_uid,metadata.st_gid);os.chmod(name,metadata.st_mode&0o777);os.replace(name,destination)
    finally:pathlib.Path(name).unlink(missing_ok=True)

changed=False
try:
    assert target.read_bytes()==old and source.read_bytes()==source_raw
    atomic(candidate,target);changed=True
    subprocess.run(['systemctl','start','--wait','lyco-community-deep.service'],check=True,capture_output=True,timeout=900)
    assert source.read_bytes()==source_raw,'Source changed during measurements'
    actual=json.loads(report_path.read_text());assert actual['source_verified_at_utc']==source_doc['verified_at_utc']
    assert actual['criteria']['bytes_per_sample']==4194304
    assert actual['criteria']['minimum_each_kib_s']==256 and actual['criteria']['minimum_mean_kib_s']==320
    good=[n for n in actual['results'] if n.get('qualified') is True]
    assert good and len(good)==actual['quality_passed']==len(actual['qualified_names'])
    assert len({n['exit_hash'] for n in good})==len(good)
    for n in good:
        assert n['sample_bytes']==[4194304,4194304] and len(n['samples_kib_s'])==2
        assert min(n['samples_kib_s'])>=256 and sum(n['samples_kib_s'])/2>=320
        assert (n['youtube_204'],n['youtube_image'],n['openai_api'])==(204,200,401)
    with urllib.request.urlopen('http://127.0.0.1:4700/api/proxy/community/summary',timeout=5) as response:live=json.load(response)
    assert live['node_category']=='ordinary' and live['available']>0 and live['catalog_total']>live['available']
except Exception:
    if changed:
        atomic(backup/'verify_deep.py',target);atomic(backup/'community-quality.json',report_path)
    raise
result={'phase':'ordinary-quality','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'qualitySourceSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'backup':str(backup),
    'minimumEachKibPerSecond':256,'minimumMeanKibPerSecond':320,'bytesPerSample':4194304,
    'qualified':len(good),'ordinarySummary':live,
    'samples':[{'label':hashlib.sha256(n['name'].encode()).hexdigest()[:8],'httpsLatencyMs':n['https_latency_ms'],
        'kibPerSecond':n['samples_kib_s'],'bytes':n['sample_bytes']} for n in good],
    'nodeConfigurationsAndBillingUnchanged':True}
(backup/'RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
shutil.move(str(stage),str(backup/'staged-source'))
print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
