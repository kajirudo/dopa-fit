"""Acquire pinned runtime assets and record original URLs/hashes. No build step.
Run once when upgrading dependencies: python tools/fetch-deps.py
"""
import hashlib
import io
import json
import pathlib
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
HEADERS = {'User-Agent': 'Dopa-Fit-dependency-audit/0.1'}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=45) as response:
        return response.read()

records = []
def save(path, data, source, project, version, license_id):
    destination = ROOT / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    records.append(dict(path=path, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), source=source, project=project, version=version, license=license_id))

packages = [
    ('@tensorflow/tfjs-core', '4.22.0', ['dist/tf-core.min.js']),
    ('@tensorflow/tfjs-converter', '4.22.0', ['dist/tf-converter.min.js']),
    ('@tensorflow/tfjs-backend-webgl', '4.22.0', ['dist/tf-backend-webgl.min.js']),
    ('@tensorflow/tfjs-backend-wasm', '4.22.0', ['dist/tf-backend-wasm.min.js', 'dist/tfjs-backend-wasm.wasm', 'dist/tfjs-backend-wasm-simd.wasm', 'dist/tfjs-backend-wasm-threaded-simd.wasm']),
    ('@tensorflow-models/pose-detection', '2.1.3', ['dist/pose-detection.min.js']),
]
for package, version, files in packages:
    meta = json.loads(get(f'https://registry.npmjs.org/{package}/{version}'))
    archive_url = meta['dist']['tarball']
    archive = tarfile.open(fileobj=io.BytesIO(get(archive_url)), mode='r:gz')
    for file in files:
        source = f'https://cdn.jsdelivr.net/npm/{package}@{version}/{file}'
        data = archive.extractfile(f'package/{file}').read()
        save(f'vendor/{pathlib.PurePosixPath(file).name}', data, source, package, version, meta['license'])
        records[-1]['acquisitionSource'] = archive_url
        records[-1]['archiveMember'] = f'package/{file}'
    slug = package.replace('@', '').replace('/', '-')
    for member in archive.getmembers():
        name = pathlib.PurePosixPath(member.name).name
        if member.isfile() and (name.upper() in ('LICENSE', 'LICENSE.TXT', 'NOTICE', 'NOTICE.TXT') or name.endswith('.LICENSE.txt')):
            save(f'licenses/{slug}-{name}', archive.extractfile(member).read(), archive_url, package, version, meta['license'])

model_base = 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4/'
manifest_data = get(model_base + 'model.json?tfjs-format=file')
manifest = json.loads(manifest_data)
save('models/movenet-lightning-v4/model.json', manifest_data, model_base + 'model.json?tfjs-format=file', 'MoveNet SinglePose Lightning', '4', 'Apache-2.0')
for group in manifest['weightsManifest']:
    for shard in group['paths']:
        if pathlib.PurePosixPath(shard).name != shard:
            raise ValueError('Unexpected model shard path')
        url = model_base + shard + '?tfjs-format=file'
        save(f'models/movenet-lightning-v4/{shard}', get(url), url, 'MoveNet SinglePose Lightning', '4', 'Apache-2.0')

card_url = 'https://raw.githubusercontent.com/tensorflow/tfhub.dev/master/assets/docs/google/models/movenet/singlepose/lightning/tfjs/4.md'
card = get(card_url)
if b'Apache 2.0' not in card:
    raise ValueError('Review model license before distributing')
save('licenses/movenet-lightning-v4-model-card.md', card, card_url, 'MoveNet SinglePose Lightning', '4', 'Apache-2.0')
license_url = 'https://raw.githubusercontent.com/tensorflow/tfjs/master/LICENSE'
save('licenses/Apache-2.0.txt', get(license_url), license_url, 'Apache License', '2.0', 'Apache-2.0')
(ROOT / 'docs').mkdir(exist_ok=True)
(ROOT / 'docs/dependency-manifest.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(f'Acquired {len(records)} files; runtime bytes: {sum(r["bytes"] for r in records if r["path"].startswith(("vendor/", "models/"))):,}')
