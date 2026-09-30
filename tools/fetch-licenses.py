"""Record licenses from pinned upstream distributions, including WASM components."""
import urllib.request, hashlib, json, pathlib, io, tarfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Dopa-Fit-audit'}), timeout=45).read()
entries = []
sources = [
 ('TensorFlow.js','Apache-2.0','https://raw.githubusercontent.com/tensorflow/tfjs/tfjs-v4.22.0/LICENSE','tensorflow-js-LICENSE.txt'),
 ('TensorFlow models','Apache-2.0','https://raw.githubusercontent.com/tensorflow/tfjs-models/pose-detection-v2.1.3/LICENSE','tensorflow-models-LICENSE.txt'),
 ('XNNPACK','BSD-3-Clause','https://raw.githubusercontent.com/google/XNNPACK/5e8033a72a8d0f1c2b1f06e29137cc697c6b661d/LICENSE','XNNPACK-LICENSE.txt'),
 ('FP16','MIT','https://raw.githubusercontent.com/Maratyszcza/FP16/3c54eacb74f6f5e39077300c5564156c424d77ba/LICENSE','FP16-LICENSE.txt'),
 ('FXdiv','MIT','https://raw.githubusercontent.com/Maratyszcza/FXdiv/b408327ac2a15ec3e43352421954f5b1967701d1/LICENSE','FXdiv-LICENSE.txt'),
 ('pthreadpool','BSD-2-Clause','https://raw.githubusercontent.com/Maratyszcza/pthreadpool/545ebe9f225aec6dca49109516fac02e973a3de2/LICENSE','pthreadpool-LICENSE.txt'),
 ('cpuinfo','BSD-2-Clause','https://raw.githubusercontent.com/pytorch/cpuinfo/ed8b86a253800bafdb7b25c5c399f91bff9cb1f3/LICENSE','cpuinfo-LICENSE.txt'),
 ('clog (cpuinfo)','BSD-2-Clause','https://raw.githubusercontent.com/pytorch/cpuinfo/d5e37adf1406cf899d7d9ec1d317c47506ccb970/LICENSE','clog-LICENSE.txt'),
 ('psimd','MIT','https://raw.githubusercontent.com/Maratyszcza/psimd/072586a71b55b7f8c584153d223e95687148a900/LICENSE','psimd-LICENSE.txt'),
 ('Emscripten','MIT and NCSA; bundled notices','https://raw.githubusercontent.com/emscripten-core/emscripten/3.1.28/LICENSE','emscripten-LICENSE.txt'),
 ('musl libc','MIT and bundled BSD notices','https://raw.githubusercontent.com/emscripten-core/emscripten/3.1.28/system/lib/libc/musl/COPYRIGHT','musl-COPYRIGHT.txt'),
]
def save(project,license_id,url,name,data):
    path='licenses/'+name
    (ROOT/path).write_bytes(data)
    entries.append(dict(project=project,license=license_id,source=url,path=path,sha256=hashlib.sha256(data).hexdigest()))
for project, license_id, url, name in sources:
    save(project,license_id,url,name,get(url))
for package, version in [('long','4.0.0'),('seedrandom','3.0.5'),('tslib','2.4.0')]:
    meta=json.loads(get('https://registry.npmjs.org/'+package+'/'+version))
    url=meta['dist']['tarball']; archive=tarfile.open(fileobj=io.BytesIO(get(url)),mode='r:gz')
    if package == 'seedrandom':
        text=archive.extractfile('package/seedrandom.js').read().decode()
        save('seedrandom 3.0.5','MIT',url,'seedrandom-LICENSE.txt',(text.split('/*',1)[1].split('*/',1)[0].strip()+'\n').encode())
    for member in archive.getmembers():
        if member.isfile() and pathlib.PurePosixPath(member.name).name.upper() in ['LICENSE','LICENSE.TXT','LICENSE.MD','COPYING','COPYRIGHTNOTICE.TXT']:
            save(package+' '+version,meta['license'],url,package+'-'+pathlib.PurePosixPath(member.name).name+('' if member.name.lower().endswith('.txt') else '.txt'),archive.extractfile(member).read())
(ROOT/'docs/license-sources.json').write_text(json.dumps(entries,indent=2)+'\n',encoding='utf-8')
print('Recorded',len(entries),'third-party licenses')
