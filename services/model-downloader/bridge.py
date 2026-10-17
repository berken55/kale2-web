"""Private stdin/stdout worker used by the authenticated Kale2 import service."""
import contextlib
import ast
import copy
import io
import json
import re
import struct
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))

from curl_cffi import requests
from PIL import Image
import download
from download_anima import Metin2AlertsSession, fetch_anima_bundle, parse_anima_bundle

MAX_FILE = 50 * 1024 * 1024
MAX_TOTAL = 200 * 1024 * 1024
HOSTS = {'metin2alerts.com', 'www.metin2alerts.com', 'm2icondb.com',
         'www.m2icondb.com', 'assets.m2icondb.com'}


def checked_url(url):
    p = urlparse(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.username or p.password or p.port not in (None, 443):
        raise ValueError('İzin verilmeyen kaynak adresi.')
    return url


class Transport(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs.pop('allow_redirects', None)
        for _ in range(4):
            checked_url(url)
            # Streaming caps the response before it is buffered in memory.
            kwargs.pop('stream', None)
            response = super().request(method, url, allow_redirects=False, stream=True, **kwargs)
            if 300 <= response.status_code < 400:
                location = response.headers.get('location')
                response.close()
                if not location:
                    raise ValueError('Geçersiz yönlendirme.')
                url = urljoin(url, location)
                continue
            data = bytearray()
            limit = 3 * 1024 * 1024 if '/wiki/' in url or urlparse(url).path.startswith('/item/') else MAX_FILE
            try:
                for chunk in response.iter_content():
                    data.extend(chunk)
                    if len(data) > limit:
                        raise ValueError('Kaynak dosyası boyut sınırını aştı.')
            finally:
                response.close()
            response.content = bytes(data)
            return response
        raise ValueError('Çok fazla yönlendirme.')


def safe_rel(value):
    value = value.replace('\\', '/')
    if not re.fullmatch(r'[A-Za-z0-9_./-]+', value) or value.startswith('/') or '..' in value.split('/') or ':' in value:
        raise ValueError('Geçersiz dosya yolu.')
    return value


def session(cookie):
    s = Metin2AlertsSession(None, None, 25)
    s._session.close()
    s._session = Transport(impersonate='chrome131')
    if cookie:
        from http.cookiejar import MozillaCookieJar
        jar = MozillaCookieJar(cookie)
        jar.load(ignore_discard=True, ignore_expires=True)
        for c in jar:
            if c.domain.lstrip('.') in ('metin2alerts.com', 'www.metin2alerts.com'):
                s._session.cookies.set(c.name, c.value, domain=c.domain, path=c.path)
    return s


def monster_record(s, url):
    """Read the site's public catalog as JSON; never execute remote JavaScript."""
    origin = 'https://m2icondb.com'

    def get(path):
        response = s._session.get(urljoin(origin + '/', path), timeout=25)
        if not response.ok:
            raise ValueError('Canavar kataloğu okunamadı.')
        return response.text

    page = get(url)
    entry = re.search(r'src="(/assets/index-[A-Za-z0-9_-]+\.js)"', page)
    if not entry:
        raise ValueError('Canavar kataloğu giriş dosyası bulunamadı.')
    main = get(entry[1])
    app = re.search(r'\./App-[A-Za-z0-9_-]+\.js', main)
    if not app:
        raise ValueError('Canavar kataloğu uygulama dosyası bulunamadı.')
    manifest = get('/assets/' + app[0][2:])
    catalogs = list(dict.fromkeys(re.findall(r'assets/(monsters-[A-Za-z0-9_-]+\.js)', manifest)))
    record = None
    model = urlparse(url).path.rstrip('/').rsplit('/', 1)[-1]
    for catalog in catalogs:
        source = get('/assets/' + catalog)
        data = re.search(r'JSON\.parse\(`([\s\S]*?)`\)', source)
        if not data:
            continue
        records = json.loads(data[1])
        record = next((r for r in records if r.get('model') == model), None)
        if record:
            break
    if not record:
        raise ValueError('Canavar katalogda bulunamadı. Tam /3d bağlantısını kullanın.')
    query = {'glb': safe_rel(record['glb']), 'monster': 'true'}
    if record.get('sourceSkin') and record.get('targetSkin'):
        query.update(skinSource=record['sourceSkin'], skinTarget=record['targetSkin'])
    record['viewerUrl'] = origin + '/3d?' + urlencode(query)
    return record


def armor_shape(source, character, male, value, hair=False):
    """Decode literal JSON tables without evaluating downloaded JavaScript."""
    primary = {'assassin': 'pc2', 'shaman': 'pc2', 'sura': 'pc', 'warrior': 'pc', 'wolfman': 'pc3'}[character]
    folder = primary if male or character == 'wolfman' else ('pc2' if primary == 'pc' else 'pc')
    for match in re.finditer(r'''JSON\.parse\(('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\)''', source):
        try:
            table = json.loads(ast.literal_eval(match[1]))
        except (ValueError, SyntaxError, json.JSONDecodeError):
            continue
        if not isinstance(table, dict):
            continue
        base = table.get('BaseModelFileName', '').replace('\\', '/').lower()
        if f'/{folder}/{character}/' not in base:
            continue
        shape = table.get('HairData' if hair else 'ShapeData', {}).get(str(value))
        if shape and shape.get('model'):
            return shape
    raise ValueError('Zırh için model eşlemesi bulunamadı; tam /3d bağlantısını kullanın.')


def item_viewer_url(s, url):
    origin = 'https://m2icondb.com'
    icon = urlparse(url).path.rstrip('/').rsplit('/', 1)[-1].zfill(5)

    def get(path):
        response = s._session.get(urljoin(origin + '/', path), timeout=25)
        if not response.ok:
            raise ValueError('Eşya model kataloğu okunamadı (HTTP ' + str(response.status_code) + ').')
        return response.text

    catalog = json.loads(get('/locales/en/translation.json'))
    record = catalog.get(icon) or catalog.get(str(int(icon)))
    if not isinstance(record, dict):
        raise ValueError('Eşya model kataloğunda bulunamadı; tam /3d bağlantısını kullanın.')
    subtype = record.get('subtype', '')
    item_type = record.get('type', '').removeprefix('ITEM_')
    query = {'type': item_type, 'subtype': subtype}
    if subtype in ('ARMOR_BODY', 'COSTUME_BODY', 'COSTUME_HAIR'):
        page = get(url)
        entry = re.search(r'src="(/assets/index-[A-Za-z0-9_-]+\.js)"', page)
        if not entry:
            raise ValueError('Zırh kataloğu giriş dosyası bulunamadı.')
        app = re.search(r'\./App-[A-Za-z0-9_-]+\.js', get(entry[1]))
        if not app:
            raise ValueError('Zırh kataloğu uygulama dosyası bulunamadı.')
        manifest = get('/assets/' + app[0][2:])
        viewer = re.search(r'assets/(ModelViewer-[A-Za-z0-9_-]+\.js)', manifest)
        if not viewer:
            raise ValueError('Zırh model eşleme tablosu bulunamadı.')
        character = next((c for c in ('warrior', 'assassin', 'sura', 'shaman', 'wolfman') if record.get(c)), None)
        if not character or record.get('value3') is None:
            raise ValueError('Zırhın sınıfı veya model numarası bulunamadı.')
        shape = armor_shape(get('/assets/' + viewer[1]), character, True, record['value3'], subtype == 'COSTUME_HAIR')
        query['glb'] = 'armors/' + safe_rel(shape['model']) + '.glb'
        if shape.get('sourceSkin') and shape.get('targetSkin'):
            query['skinSource'] = 'armors/' + safe_rel(shape['sourceSkin'])
            query['skinTarget'] = 'armors/' + safe_rel(shape['targetSkin'])
        query[character] = 'true'
        query['motion'] = f'motions/{"wolfman_m" if character == "wolfman" else character + "_m"}.glb'
    else:
        model = record.get('model')
        if not isinstance(model, str) or not model:
            raise ValueError('Bu eşya için 3D model tanımlı değil.')
        model = safe_rel(model)
        query['glb'] = model if model.endswith('.glb') else model + '.glb'
    return origin + '/3d?' + urlencode(query)


def pack_glb(data, texture_for_material, replace_materials=()):
    if data[:4] != b'glTF' or len(data) < 20:
        raise ValueError('Kaynak geçerli bir GLB modeli döndürmedi.')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4e4f534a:
        raise ValueError('GLB JSON bölümü bulunamadı.')
    doc = json.loads(data[20:20 + length])
    offset = 20 + length
    binary = bytearray()
    if offset + 8 <= len(data):
        n, kind = struct.unpack_from('<II', data, offset)
        if kind == 0x004e4942:
            binary.extend(data[offset + 8:offset + 8 + n])
    if any(b.get('uri') for b in doc.get('buffers', [])):
        raise ValueError('Harici GLB buffer desteklenmiyor.')
    if any('uri' in i and not i['uri'].startswith('data:') for i in doc.get('images', [])):
        raise ValueError('Harici GLB resim adresi desteklenmiyor.')
    warnings = []
    for mat in doc.get('materials', []):
        name = mat.get('name', '')
        pbr = mat.setdefault('pbrMetallicRoughness', {})
        material_key = Path(name.replace('\\', '/')).stem.lower()
        # Anima bundles often name materials "4 - Default"; skin mappings name
        # the embedded image instead (e.g. wolf -> wolf_gray).
        texture_index = pbr.get('baseColorTexture', {}).get('index')
        if texture_index is not None:
            tex = doc.get('textures', [])[texture_index]
            image_index = tex.get('source')
            if image_index is None:
                for extension in ('EXT_texture_webp', 'KHR_texture_basisu'):
                    image_index = tex.get('extensions', {}).get(extension, {}).get('source')
                    if image_index is not None:
                        break
            if image_index is not None:
                image_name = doc.get('images', [])[image_index].get('name', '')
                image_key = Path(image_name.replace('\\', '/')).stem.lower()
                if image_key in replace_materials:
                    material_key = image_key
                    name = image_name
        if 'baseColorTexture' in pbr and material_key not in replace_materials:
            continue
        texture = texture_for_material(name)
        if texture is None:
            warnings.append('Doku bulunamadı: ' + name)
            continue
        with Image.open(io.BytesIO(texture)) as image:
            png = io.BytesIO()
            image.convert('RGBA').save(png, format='PNG')
        binary.extend(b'\0' * (-len(binary) % 4))
        views = doc.setdefault('bufferViews', [])
        view = len(views)
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(png.getvalue())})
        binary.extend(png.getvalue())
        images = doc.setdefault('images', [])
        image_index = len(images)
        images.append({'bufferView': view, 'mimeType': 'image/png'})
        textures = doc.setdefault('textures', [])
        pbr['baseColorTexture'] = {'index': len(textures)}
        textures.append({'source': image_index})
        pbr.update({'metallicFactor': 0, 'roughnessFactor': 1, 'baseColorFactor': [1, 1, 1, 1]})
        mat['doubleSided'] = True
    doc['buffers'] = [{'byteLength': len(binary)}]
    binary.extend(b'\0' * (-len(binary) % 4))
    raw = json.dumps(doc, ensure_ascii=True, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    result = struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(raw) + 8 + len(binary))
    result += struct.pack('<II', len(raw), 0x4e4f534a) + raw
    result += struct.pack('<II', len(binary), 0x004e4942) + binary
    if len(result) > MAX_FILE:
        raise ValueError('Paketlenen model 50 MB sınırını aştı.')
    return result, warnings


def selected_skin_textures(files, skin):
    if not skin:
        return {}
    for key, (data, _mime) in files.items():
        if not key.endswith('.json'):
            continue
        config = json.loads(data)
        if not isinstance(config, dict):
            continue
        selected = next((v for v in config.get('skins', []) if v.get('model') == skin), None)
        if selected is None:
            continue
        swaps = {}
        for swap in selected.get('swaps', []):
            source = Path(swap['source'].replace('\\', '/')).stem.lower()
            texture = Path(swap['texture'].replace('\\', '/')).name.lower()
            match = next((name for name in files if Path(name).name.lower() == texture), None)
            if match is None:
                raise ValueError('Seçilen kaplamanın dokusu pakette bulunamadı.')
            swaps[source] = files[match][0]
        return swaps
    raise ValueError('Sayfadaki kaplama model paketinde bulunamadı.')


def merge_animations(model_data, motion_data):
    """Copy animation buffers and map tracks to existing bones by name, never index."""
    def read(data):
        if data[:4] != b'glTF' or len(data) < 20:
            raise ValueError('Animasyon dosyası geçerli GLB değil.')
        size, kind = struct.unpack_from('<II', data, 12)
        if kind != 0x4e4f534a:
            raise ValueError('Animasyon JSON bölümü bulunamadı.')
        doc = json.loads(data[20:20 + size])
        offset = 20 + size
        binary = b''
        if offset + 8 <= len(data):
            length, kind = struct.unpack_from('<II', data, offset)
            if kind == 0x004e4942:
                binary = data[offset + 8:offset + 8 + length]
        if len(doc.get('buffers', [])) > 1 or any(b.get('uri') for b in doc.get('buffers', [])):
            raise ValueError('Animasyonun harici buffer yapısı desteklenmiyor.')
        return doc, binary

    doc, binary = read(model_data)
    motion, motion_binary = read(motion_data)
    # Non-skinned objects such as standalone swords do not inherit body motions.
    if not doc.get('skins'):
        return model_data, ['Bu modelin karakter iskeleti yok; ayrı karakter animasyonları eklenmedi.']
    targets = {}
    for i, node in enumerate(doc.get('nodes', [])):
        if node.get('name'):
            targets.setdefault(node['name'], []).append(i)
    mapping = {i: targets[n['name']][0] for i, n in enumerate(motion.get('nodes', []))
               if n.get('name') in targets and len(targets[n['name']]) == 1}
    animations = []
    accessors = set()
    for original in motion.get('animations', []):
        animation = copy.deepcopy(original)
        animation['channels'] = [c for c in animation.get('channels', [])
                                 if c.get('target', {}).get('node') in mapping
                                 and c['target'].get('path') in ('translation', 'rotation', 'scale')]
        if not animation['channels']:
            continue
        used = sorted({c['sampler'] for c in animation['channels']})
        remap = {old: new for new, old in enumerate(used)}
        animation['samplers'] = [animation['samplers'][i] for i in used]
        for channel in animation['channels']:
            channel['target']['node'] = mapping[channel['target']['node']]
            channel['sampler'] = remap[channel['sampler']]
        for sampler in animation['samplers']:
            accessors.update((sampler['input'], sampler['output']))
        animations.append(animation)
    if not animations:
        return model_data, ['Modele uyumlu animasyon bulunamadı.']
    views = set()
    for index in accessors:
        accessor = motion['accessors'][index]
        if 'bufferView' in accessor:
            views.add(accessor['bufferView'])
        for sparse in accessor.get('sparse', {}).values():
            if isinstance(sparse, dict) and 'bufferView' in sparse:
                views.add(sparse['bufferView'])
    output = bytearray(binary)
    view_map = {}
    for index in sorted(views):
        view = copy.deepcopy(motion['bufferViews'][index])
        start, length = view.get('byteOffset', 0), view['byteLength']
        if view.get('buffer', 0) != 0 or start < 0 or length < 0 or start + length > len(motion_binary):
            raise ValueError('Geçersiz animasyon buffer aralığı.')
        output.extend(b'\0' * (-len(output) % 4))
        view.update(buffer=0, byteOffset=len(output))
        output.extend(motion_binary[start:start + length])
        view_map[index] = len(doc.setdefault('bufferViews', []))
        doc['bufferViews'].append(view)
    accessor_map = {}
    for index in sorted(accessors):
        accessor = copy.deepcopy(motion['accessors'][index])
        if 'bufferView' in accessor:
            accessor['bufferView'] = view_map[accessor['bufferView']]
        for sparse in accessor.get('sparse', {}).values():
            if isinstance(sparse, dict) and 'bufferView' in sparse:
                sparse['bufferView'] = view_map[sparse['bufferView']]
        accessor_map[index] = len(doc.setdefault('accessors', []))
        doc['accessors'].append(accessor)
    for animation in animations:
        for sampler in animation['samplers']:
            sampler['input'] = accessor_map[sampler['input']]
            sampler['output'] = accessor_map[sampler['output']]
        doc.setdefault('animations', []).append(animation)
    doc['buffers'] = [{'byteLength': len(output)}]
    output.extend(b'\0' * (-len(output) % 4))
    raw = json.dumps(doc, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    result = struct.pack('<III', 0x46546c67, 2, 28 + len(raw) + len(output))
    result += struct.pack('<II', len(raw), 0x4e4f534a) + raw
    result += struct.pack('<II', len(output), 0x004e4942) + output
    if len(result) > MAX_FILE:
        raise ValueError('Animasyonlu model 50 MB sınırını aştı.')
    return result, []


def run(body):
    s = session(body.get('cookieFile'))
    url = checked_url(body['url'])
    if body['action'] == 'monster':
        return monster_record(s, url)
    if body['action'] == 'item':
        return {'viewerUrl': item_viewer_url(s, url)}
    if body['action'] == 'page':
        data = s.get(url, challenge=False)
        if len(data) > 3 * 1024 * 1024:
            raise ValueError('Sayfa boyutu sınırı aşıldı.')
        return {'html': data.decode('utf-8', errors='replace')}
    if body['action'] == 'asset':
        import base64
        r = s._session.get(url, timeout=25)
        if not r.ok or len(r.content) > 2 * 1024 * 1024:
            raise ValueError('İkon indirilemedi veya boyut sınırını aştı.')
        return {'data': base64.b64encode(r.content).decode(), 'contentType': r.headers.get('content-type', '')}
    warnings = []
    if urlparse(url).hostname.endswith('m2icondb.com'):
        if urlparse(url).path.startswith('/monster/'):
            url = monster_record(s, url)['viewerUrl']
        match = re.fullmatch(r'/item/(\d+)/?', urlparse(url).path)
        if match:
            url = item_viewer_url(s, url)
        params = download.parse_viewer_url(url)
        if params.base_url != download.DEFAULT_CDN:
            raise ValueError('Özel model sunucusu desteklenmiyor.')
        if not params.glb:
            raise ValueError('GLB içeren tam /3d bağlantısını kullanın.')
        cache = {}
        total = 0

        def asset(rel):
            nonlocal total
            rel = safe_rel(rel)
            if rel not in cache:
                r = s._session.get(download.DEFAULT_CDN + rel, timeout=25)
                if r.status_code == 404:
                    cache[rel] = None
                elif not r.ok:
                    raise ValueError('Model kaynağı HTTP ' + str(r.status_code))
                else:
                    total += len(r.content)
                    if total > MAX_TOTAL:
                        raise ValueError('Toplam indirme sınırı aşıldı.')
                    cache[rel] = r.content
            return cache[rel]

        main = asset(params.glb)
        if main is None:
            raise ValueError('Model bulunamadı; tam /3d bağlantısını kullanın.')

        def texture(name):
            for ext in ('.dds', '.png'):
                rel = download.texture_rel_path(name, download.glb_dir(params.glb), monster=params.monster,
                    armor=download.is_armor_context(params), skin_source=params.skin_source,
                    skin_target=params.skin_target, refine_source=None, refine_target=None, ext=ext)
                found = asset(rel)
                if found:
                    return found
            return None
        packed, warnings = pack_glb(main, texture)
        motion_path = params.motion
        if not motion_path:
            armor = re.match(r'armors/(pc[23]?)/(warrior|assassin|sura|shaman|wolfman)/', params.glb)
            if armor:
                folder, character = armor.groups()
                primary = {'warrior': 'pc', 'sura': 'pc', 'assassin': 'pc2', 'shaman': 'pc2', 'wolfman': 'pc3'}[character]
                motion_path = f'motions/{character}_{"m" if folder == primary else "w"}.glb'
        if motion_path:
            try:
                motion = asset(motion_path)
                if motion is None:
                    warnings.append('Ayrı animasyon dosyası bulunamadı.')
                else:
                    packed, motion_warnings = merge_animations(packed, motion)
                    warnings.extend(motion_warnings)
            except (ValueError, requests.RequestsError):
                warnings.append('Ayrı animasyon dosyası eklenemedi; ana model korundu.')
        if params.costume_hair or params.acce or params.effects or params.meffects or params.weffects:
            warnings.append('Ayrı saç, aksesuar ve efekt modelleri bu önizlemeye eklenmedi.')
        filename = Path(params.glb).name
    else:
        html = s.get(url, challenge=False).decode('utf-8', errors='replace')
        from download_anima import FOLDER_FROM_HTML_RES
        folder = next((m.group(1) for p in FOLDER_FROM_HTML_RES if (m := p.search(html))), None)
        if not folder:
            raise ValueError('Sayfada indirilebilir 3D model bulunamadı.')
        files = parse_anima_bundle(fetch_anima_bundle(s, folder))
        if sum(len(v[0]) for v in files.values()) > MAX_TOTAL:
            raise ValueError('Model paketi boyut sınırını aştı.')
        for rel in files:
            safe_rel(rel)
        skin_match = re.search(r'"skin"\s*:\s*"([^"\\]*)"', html.replace('\\"', '"'))
        swaps = selected_skin_textures(files, skin_match[1] if skin_match else '')
        glbs = [k for k in files if k.lower().endswith('.glb')]
        if not glbs:
            raise ValueError('Paket GLB içermiyor.')
        preferred = next((k for k in glbs if Path(k).stem == folder), None)
        if not preferred:
            preferred = max(glbs, key=lambda k: len(files[k][0]))

        def texture(name):
            stem = Path(name.replace('\\', '/')).stem.lower()
            if stem in swaps:
                return swaps[stem]
            key = next((k for k in files if Path(k).stem.lower() == stem and Path(k).suffix.lower() in ('.png', '.dds', '.jpg', '.webp')), None)
            return files[key][0] if key else None
        packed, warnings = pack_glb(files[preferred][0], texture, swaps)
        filename = Path(preferred).name
    Path(body['output']).write_bytes(packed)
    return {'filename': filename, 'warnings': warnings}


if __name__ == '__main__':
    try:
        body = json.load(sys.stdin)
        with contextlib.redirect_stdout(sys.stderr):
            result = run(body)
        print(json.dumps(result, ensure_ascii=True))
    except Exception as exc:
        # Do not expose headers, cookie values, HTML challenge pages or tokens.
        message = str(exc)
        if any(x in message.lower() for x in ('403', 'cloudflare', 'cookie', 'forbidden', 'challenge')):
            message = 'Kaynak erişimi reddetti. Metin2Alerts için güncel cookies.txt yükleyip yeniden deneyin.'
        elif not isinstance(exc, ValueError):
            message = 'İndirme servisi kaynağa ulaşamadı. Bağlantıyı ve Python bağımlılıklarını kontrol edin.'
        print(json.dumps({'error': message[:300]}, ensure_ascii=True))
        sys.exit(1)
