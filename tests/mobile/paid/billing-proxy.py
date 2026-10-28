"""CI device proxy: replace only test Billing traffic; never contact production."""
import http.client,json,os
from pathlib import Path
from mitmproxy import http
if os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Actions only')
fixture=json.loads((Path(os.environ['RUNNER_TEMP'])/'lyco-mobile-paid/fixture.json').read_text())
def request(flow: http.HTTPFlow):
    host=flow.request.pretty_host
    if host=='lain42.top' and flow.request.path.startswith('/studio/api/'):
        port=fixture['apiPort'];target=flow.request.path
    elif host in ('10.0.2.2','127.0.0.1') and flow.request.port==fixture['originPort']:
        # Keep the system-proxy fallback path healthy: forbidden bypasses must
        # reach the origin and be detected, rather than hidden by this fixture.
        port=fixture['originPort'];target=flow.request.path
    else:
        flow.response=http.Response.make(502,b'CI proxy blocks external traffic');return
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=15)
    try:
        headers={k:v for k,v in flow.request.headers.items() if k.lower() not in ('host','proxy-authorization','connection','content-length')}
        connection.request(flow.request.method,target,flow.request.raw_content,headers)
        result=connection.getresponse();body=result.read()
        response_headers={k:v for k,v in result.getheaders() if k.lower() not in ('content-length','transfer-encoding','connection')}
        flow.response=http.Response.make(result.status,body,response_headers)
    finally:connection.close()
