"""Install the source-built binder into the app module; retain the actual JNI ABI set."""
import os,zipfile
from pathlib import Path
if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('Actions only')
root=Path(__file__).resolve().parents[2]
module=root/'apps/universal/modules/lyco-mobile-browser/android'
with zipfile.ZipFile(Path(os.environ['RUNNER_TEMP'])/'lyco-tunnel.aar') as archive:
    target=module/'libs/lyco-tunnel.jar';target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(archive.read('classes.jar'))
    for name in archive.namelist():
        if name.startswith('jni/') and name.endswith('.so'):
            relative=Path(name).relative_to('jni')
            if '..' in relative.parts:raise SystemExit('Invalid JNI library path')
            target=module/'src/main/jniLibs'/relative;target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.read(name))
