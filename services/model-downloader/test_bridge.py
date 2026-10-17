import io
import json
import struct
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import urlparse, parse_qs
from PIL import Image
from bridge import checked_url, safe_rel, pack_glb, armor_shape, item_viewer_url, merge_animations, selected_skin_textures
from download_anima import parse_anima_bundle


class BridgeTests(unittest.TestCase):
    def test_variant_skin_selects_the_page_texture(self):
        config = {'skins': [{'model': 'wolf_gray', 'swaps': [{'source': 'wolf', 'texture': 'wolf_gray.png'}]}]}
        files = {'fx/wolf/effect.json': (json.dumps(config).encode(), 'application/json'),
                 'fx/wolf/tex/wolf_gray.png': (b'gray texture', 'image/png'),
                 'fx/wolf/tex/wolf_blue.png': (b'blue texture', 'image/png')}
        self.assertEqual(selected_skin_textures(files, 'wolf_gray'), {'wolf': b'gray texture'})
        self.assertEqual(selected_skin_textures(files, ''), {})
        with self.assertRaises(ValueError): selected_skin_textures(files, 'missing')

    def test_skin_replaces_an_already_embedded_material_texture(self):
        doc = {'asset': {'version': '2.0'}, 'materials': [{'name': '4 - Default', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}],
               'images': [{'uri': 'data:image/webp;base64,', 'name': 'wolf'}], 'textures': [{'extensions': {'EXT_texture_webp': {'source': 0}}}]}
        raw = json.dumps(doc).encode(); raw += b' ' * (-len(raw) % 4)
        glb = struct.pack('<IIIII', 0x46546c67, 2, 20 + len(raw), len(raw), 0x4e4f534a) + raw
        texture = io.BytesIO(); Image.new('RGBA', (2, 2), 'gray').save(texture, format='PNG')
        packed, warnings = pack_glb(glb, lambda _: texture.getvalue(), {'wolf'})
        result = json.loads(packed[20:20 + struct.unpack_from('<I', packed, 12)[0]])
        self.assertEqual(result['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'], 1)
        self.assertEqual(warnings, [])
    def test_motion_tracks_map_bones_by_name_and_keep_original_binary(self):
        def glb(doc, binary):
            raw = json.dumps(doc).encode()
            raw += b' ' * (-len(raw) % 4)
            return struct.pack('<IIIII', 0x46546c67, 2, 28 + len(raw) + len(binary), len(raw), 0x4e4f534a) + raw + struct.pack('<II', len(binary), 0x004e4942) + binary
        model = glb({'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 4}], 'skins': [{'joints': [1]}],
                     'nodes': [{'name': 'Mesh'}, {'name': 'Bone'}]}, b'MESH')
        motion = glb({'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 32}], 'nodes': [{'name': 'Bone'}, {'name': 'Unmatched'}],
                      'bufferViews': [{'buffer': 0, 'byteLength': 8}, {'buffer': 0, 'byteOffset': 8, 'byteLength': 24}],
                      'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 2, 'type': 'SCALAR'}, {'bufferView': 1, 'componentType': 5126, 'count': 2, 'type': 'VEC3'}],
                      'animations': [{'name': 'wait', 'samplers': [{'input': 0, 'output': 1}], 'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'translation'}}, {'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}]}]}, struct.pack('<8f', 0, 1, 0, 0, 0, 10, 0, 0))
        packed, warnings = merge_animations(model, motion)
        size = struct.unpack_from('<I', packed, 12)[0]
        result = json.loads(packed[20:20 + size])
        self.assertEqual(result['animations'][0]['channels'], [{'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}])
        self.assertEqual(packed[28 + size:32 + size], b'MESH')
        self.assertEqual(result['bufferViews'][0]['byteOffset'], 4)
        self.assertEqual(warnings, [])
        self.assertEqual(struct.unpack_from('<I', packed, 8)[0], len(packed))

    def test_item_armor_uses_shape_and_skin_instead_of_weapon_path(self):
        table = {'BaseModelFileName': 'd:/ymir work/pc/warrior/warrior_novice.GR2',
                 'ShapeData': {'3': {'model': 'pc\\warrior\\warrior_nahan', 'sourceSkin': 'pc\\warrior\\warrior_nahan', 'targetSkin': 'pc\\warrior\\warrior_nahan'},
                               '5': {'model': 'pc\\warrior\\warrior_nahan', 'sourceSkin': 'pc\\warrior\\warrior_nahan', 'targetSkin': 'pc\\warrior\\warrior_jain'}}}
        source = 'const table=JSON.parse(' + json.dumps(json.dumps(table)) + ');'
        records = {'11200': {'type': 'ITEM_ARMOR', 'subtype': 'ARMOR_BODY', 'value3': '3', 'warrior': True},
                   '11240': {'type': 'ITEM_ARMOR', 'subtype': 'ARMOR_BODY', 'value3': '5', 'warrior': True},
                   '00010': {'type': 'ITEM_WEAPON', 'subtype': 'WEAPON_SWORD', 'model': 'weapons/00010'}}
        pages = {'/locales/en/translation.json': json.dumps(records),
                 '/item/11200': '<script src="/assets/index-example.js"></script>',
                 '/item/11240': '<script src="/assets/index-example.js"></script>',
                 '/assets/index-example.js': 'import("./App-example.js")',
                 '/assets/App-example.js': '"assets/ModelViewer-example.js"',
                 '/assets/ModelViewer-example.js': source}
        transport = Mock()
        transport.get.side_effect = lambda url, **_: SimpleNamespace(ok=True, text=pages[urlparse(url).path])
        session = SimpleNamespace(_session=transport)
        for icon, skin in [('11200', 'warrior_nahan'), ('11240', 'warrior_jain')]:
            query = parse_qs(urlparse(item_viewer_url(session, 'https://m2icondb.com/item/' + icon)).query)
            self.assertEqual(query['glb'], ['armors/pc/warrior/warrior_nahan.glb'])
            self.assertEqual(query['skinTarget'], ['armors/pc/warrior/' + skin])
            self.assertEqual(query['type'], ['ARMOR'])
        weapon = parse_qs(urlparse(item_viewer_url(session, 'https://m2icondb.com/item/10')).query)
        self.assertEqual(weapon['glb'], ['weapons/00010.glb'])

    def test_unknown_armor_shape_is_reported(self):
        with self.assertRaisesRegex(ValueError, '3d'):
            armor_shape('const unrelated = {};', 'warrior', True, 3)

    def test_texture_is_embedded_and_animation_is_preserved(self):
        doc = {'asset': {'version': '2.0'}, 'materials': [{'name': 'wolf'}], 'animations': [{'name': 'wait'}]}
        raw = json.dumps(doc).encode()
        raw += b' ' * (-len(raw) % 4)
        glb = struct.pack('<IIIII', 0x46546c67, 2, 20 + len(raw), len(raw), 0x4e4f534a) + raw
        texture = io.BytesIO()
        Image.new('RGBA', (2, 2), 'red').save(texture, format='PNG')
        packed, warnings = pack_glb(glb, lambda _: texture.getvalue())
        length = struct.unpack_from('<I', packed, 12)[0]
        result = json.loads(packed[20:20 + length])
        self.assertEqual(result['images'][0]['mimeType'], 'image/png')
        self.assertEqual(result['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'], 0)
        self.assertEqual(result['animations'], doc['animations'])
        self.assertEqual(warnings, [])
        self.assertEqual(struct.unpack_from('<I', packed, 8)[0], len(packed))

    def test_external_buffers_and_unsafe_paths_are_rejected(self):
        for rel in ('../secret', '/tmp/secret', 'C:/secret', '\\secret'):
            with self.assertRaises(ValueError):
                safe_rel(rel)
        for url in ('http://m2icondb.com/item/10', 'https://localhost/', 'https://m2icondb.com.evil.test/'):
            with self.assertRaises(ValueError):
                checked_url(url)

    def test_bundle_absolute_paths_are_ignored(self):
        header = json.dumps({'entries': [{'k': '/unsafe.glb', 'o': 0, 'l': 1}, {'k': 'safe.glb', 'o': 0, 'l': 1}]}).encode()
        payload = struct.pack('<I', len(header)) + header + b'x'
        self.assertEqual(list(parse_anima_bundle(payload)), ['safe.glb'])


if __name__ == '__main__':
    unittest.main()
