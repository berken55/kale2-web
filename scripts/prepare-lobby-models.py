"""Extract a default character and one idle animation; originals remain untouched."""
import copy
import json
from pathlib import Path
import argparse
import struct

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'client/public/assets/characters'
TARGET.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('character', nargs='?', choices=('warrior', 'ninja'), default='warrior')
parser.add_argument('--game-root', type=Path, default=ROOT.parent)
args = parser.parse_args()
character = args.character
source = args.game_root / ('Characters/Warrior Male/warrior_male.glb' if character == 'warrior' else 'Characters/Assassin Male/assassin_male.glb')
selected_nodes = ('kale2_11200', 'hair_1_1') if character == 'warrior' else ('kale2_11400', 'hair_1_1', 'assassin_face')
raw = source.read_bytes()
json_len = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_len])
bin_start = 20 + json_len
bin_len = struct.unpack_from('<I', raw, bin_start)[0]
binary = raw[bin_start + 8:bin_start + 8 + bin_len]

kept = []
for node in doc['nodes']:
    if 'mesh' not in node:
        continue
    if node.get('name') in selected_nodes:
        if node['mesh'] not in kept:
            kept.append(node['mesh'])
        node['mesh'] = kept.index(node['mesh'])
    else:
        node.pop('mesh', None)
        node.pop('skin', None)
if len(kept) != len(selected_nodes):
    raise SystemExit('Expected default character body, face and hair were not found.')
doc['meshes'] = [doc['meshes'][i] for i in kept]
doc['animations'] = [a for a in doc.get('animations', []) if a.get('name') == 'general wait']

accessors = set()
material_ids = set()
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        accessors.update(primitive['attributes'].values())
        if 'indices' in primitive:
            accessors.add(primitive['indices'])
        if 'material' in primitive:
            material_ids.add(primitive['material'])
        for target in primitive.get('targets', []):
            accessors.update(target.values())
for skin in doc.get('skins', []):
    if 'inverseBindMatrices' in skin:
        accessors.add(skin['inverseBindMatrices'])
for animation in doc['animations']:
    for sampler in animation['samplers']:
        accessors.update((sampler['input'], sampler['output']))

def subset(key, ids):
    old = doc.get(key, [])
    mapping = {value: index for index, value in enumerate(sorted(ids))}
    doc[key] = [copy.deepcopy(old[i]) for i in sorted(ids)]
    return mapping

amap = subset('accessors', accessors)
mmap = subset('materials', material_ids)
for mesh in doc['meshes']:
    for p in mesh['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p:
            p['indices'] = amap[p['indices']]
        if 'material' in p:
            p['material'] = mmap[p['material']]
        p['targets'] = [{k: amap[v] for k, v in t.items()} for t in p.get('targets', [])]
        if not p['targets']:
            p.pop('targets')
for skin in doc.get('skins', []):
    if 'inverseBindMatrices' in skin:
        skin['inverseBindMatrices'] = amap[skin['inverseBindMatrices']]
for animation in doc['animations']:
    for sampler in animation['samplers']:
        sampler['input'] = amap[sampler['input']]
        sampler['output'] = amap[sampler['output']]

texture_infos = []
def visit(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key.endswith('Texture') and isinstance(value, dict) and 'index' in value:
                texture_infos.append(value)
            visit(value)
    elif isinstance(obj, list):
        for value in obj:
            visit(value)
visit(doc['materials'])
tmap = subset('textures', {x['index'] for x in texture_infos})
for info in texture_infos:
    info['index'] = tmap[info['index']]
image_refs = []
for texture in doc['textures']:
    if 'source' in texture:
        image_refs.append(texture)
    for extension in texture.get('extensions', {}).values():
        if 'source' in extension:
            image_refs.append(extension)
imap = subset('images', {ref['source'] for ref in image_refs})
for ref in image_refs:
    ref['source'] = imap[ref['source']]

views = {a['bufferView'] for a in doc['accessors'] if 'bufferView' in a}
views.update(i['bufferView'] for i in doc['images'] if 'bufferView' in i)
for accessor in doc['accessors']:
    if 'sparse' in accessor:
        views.update(accessor['sparse'][k]['bufferView'] for k in ('indices', 'values'))
vmap = subset('bufferViews', views)
for obj in doc['accessors'] + doc['images']:
    if 'bufferView' in obj:
        obj['bufferView'] = vmap[obj['bufferView']]
for accessor in doc['accessors']:
    if 'sparse' in accessor:
        for key in ('indices', 'values'):
            accessor['sparse'][key]['bufferView'] = vmap[accessor['sparse'][key]['bufferView']]
packed = bytearray()
for view in doc['bufferViews']:
    packed.extend(b'\0' * (-len(packed) % 4))
    offset = view.get('byteOffset', 0)
    chunk = binary[offset:offset + view['byteLength']]
    view['byteOffset'] = len(packed)
    view['buffer'] = 0
    packed.extend(chunk)
doc['buffers'] = [{'byteLength': len(packed)}]
json_bytes = json.dumps(doc, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
packed.extend(b'\0' * (-len(packed) % 4))
total = 12 + 8 + len(json_bytes) + 8 + len(packed)
output = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes + struct.pack('<II', len(packed), 0x004E4942) + packed
(TARGET / f'{character}.glb').write_bytes(output)
print(f'{character}: {len(raw):,} -> {len(output):,} bytes; embedded textures and idle animation.')
