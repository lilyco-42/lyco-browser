"""Build the same unpacked directory and ZIP that browser acceptance consumes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import zipfile
from PIL import Image

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Package extensions only in GitHub Actions')
source = Path('resources/branding/icon-source.png')
if hashlib.sha256(source.read_bytes()).hexdigest() != '668059834636febc2df2fa467d5009c922bd3b973ef61370a3be9e7cf66198e1':
    raise SystemExit('Lyco original image digest mismatch')
destination = Path('dist/lyco-subscription-extension')
destination.mkdir(parents=True, exist_ok=True)
for name in ['manifest.json','background.js','connection.mjs','popup.html','popup.css','popup.js']:
    shutil.copyfile(Path('extensions/lain42')/name, destination/name)
for name in ['ICON-LICENSE.md','icon-source.json']:
    shutil.copyfile(source.parent/name, destination/name)
(destination/'BUILD.json').write_text(json.dumps({'commit':os.environ['GITHUB_SHA'],'repository':os.environ['GITHUB_REPOSITORY']}))
icons = destination/'icons'
icons.mkdir(exist_ok=True)
image = Image.open(source).convert('RGBA')
for size in [16,32,48,128]:
    image.resize((size,size),Image.Resampling.LANCZOS).save(icons/(str(size)+'.png'))
archive = Path('dist/LYCO-Subscription-Extension.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as output:
    for file in sorted(destination.rglob('*')):
        if file.is_file():
            output.write(file,file.relative_to(destination).as_posix())
archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
