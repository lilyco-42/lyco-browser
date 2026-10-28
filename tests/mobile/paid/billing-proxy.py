"""CI device proxy: replace only test Billing traffic; never contact production."""
import json,os
from http.client import HTTPConnection
from pathlib import Path
from mitmproxy import http
if os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Actions only')
fixture=json.loads((Path(os.environ['RUNNER_TEMP'])/'lyco-mobile-paid/fixture.json').read_text())
events=Path(os.environ['RUNNER_TEMP'])/'lyco-mobile-paid/proxy-events.jsonl'
def record(kind,**fields):
    with events.open('a') as output:output.write(json.dumps({'event':kind,**fields})+'\n')
def http_connect(flow: http.HTTPFlow):
    host,port=flow.request.host,flow.request.port
    record('connect',host=host,port=port)
    if host=='lain42.top' and port==443:
        # Never establish a production connection, even if the proxy later
        # needs an upstream socket while detecting the tunneled protocol.
        flow.metadata['ci_target']=('127.0.0.1',fixture['apiPort'])
    elif host in ('10.0.2.2','127.0.0.1') and port==fixture['originPort']:
        # 10.0.2.2 is the emulator's host alias, not a runner-side address.
        # The mobile core uses CONNECT even for a plaintext HTTP destination.
        flow.metadata['ci_target']=('127.0.0.1',fixture['originPort'])
    else:flow.response=http.Response.make(502,b'CI tunnel blocks external traffic')
def http_connected(flow: http.HTTPFlow):
    # mitmproxy 12.2.1 initializes server.address after http_connect; apply the
    # approved target here, before its lazy child protocol opens any socket.
    flow.server_conn.address=flow.metadata['ci_target']
def request(flow: http.HTTPFlow):
    host=flow.request.pretty_host
    record('request',host=host,port=flow.request.port,path=flow.request.path)
    if host=='lain42.top' and flow.request.path.startswith('/studio/api/'):
        port=fixture['apiPort'];target=flow.request.path
    elif host in ('10.0.2.2','127.0.0.1') and flow.request.port==fixture['originPort']:
        # Keep the system-proxy fallback path healthy: forbidden bypasses must
        # reach the origin and be detected, rather than hidden by this fixture.
        port=fixture['originPort'];target=flow.request.path
    else:
        flow.response=http.Response.make(502,b'CI proxy blocks external traffic');return
    connection=HTTPConnection('127.0.0.1',port,timeout=15)
    try:
        headers={k:v for k,v in flow.request.headers.items() if k.lower() not in ('host','proxy-authorization','connection','content-length')}
        connection.request(flow.request.method,target,flow.request.raw_content,headers)
        result=connection.getresponse();body=result.read()
        response_headers={k:v for k,v in result.getheaders() if k.lower() not in ('content-length','transfer-encoding','connection')}
        flow.response=http.Response.make(result.status,body,response_headers)
        record('response',status=result.status,bytes=len(body))
    except Exception as error:
        record('fixture-error',type=type(error).__name__)
        raise
    finally:connection.close()
def error(flow: http.HTTPFlow):
    record('error',message=str(flow.error))
