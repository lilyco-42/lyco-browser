"""Only Actions converts the owner's already-generated original icon."""
import os,hashlib,sys,json
from pathlib import Path
from PIL import Image
if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('Icon builds run in Actions only')
source=Path('lyco/resources/branding/icon-source.png')
assert hashlib.sha256(source.read_bytes()).hexdigest()=='668059834636febc2df2fa467d5009c922bd3b973ef61370a3be9e7cf66198e1'
image=Image.open(source).convert('RGBA')
assert image.getchannel('A').getextrema()[0]<255
out=Path('upstream/Browserapp/assets');out.mkdir(parents=True,exist_ok=True)
image.save(out/'logo.ico',sizes=[(s,s) for s in [16,24,32,48,64,128,256]])
image.save(out/'logo.icns',sizes=[(s,s) for s in [16,32,64,128,256,512,1024]])
print(json.dumps({'source_sha256':'668059834636febc2df2fa467d5009c922bd3b973ef61370a3be9e7cf66198e1','formats':['ico','icns','png']}))
