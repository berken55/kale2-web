# Admin model import worker

The authenticated API starts `bridge.py` as a private worker. No extra public port
is needed. The downloader modules were copied from the local model-downloader
project; the web application does not depend on a Desktop path.

Install Python 3.10+ dependencies:

```sh
python -m pip install -r services/model-downloader/requirements.txt
```

Set `MODEL_DOWNLOADER_PYTHON` to the Python executable if it is not on PATH.
Set `UPLOAD_DIR` to change persistent model/icon storage and
`MODEL_DOWNLOADER_TEMP_DIR` to choose the worker's temporary download directory
when the system drive is short on space. Keep the cookie directory private.
For the existing Linux deployment run `deploy/setup-model-downloader.sh` after
installing `python3-venv`. Apply the updated nginx configuration (240s read timeout).

Use **Admin → Items → Linkten içe aktar**, paste a Metin2Alerts item/mob/NPC
URL, an m2icondb `/item/ID` or `/monster/MODEL` URL, or its full `/3d?...` configuration URL.
Supply Vnum explicitly when the 3D configuration has no ID. Review the draft,
then save to download the model. Item links resolve the source site's public
item catalog. Body armor and hair use its class-specific shape/skin tables;
weapon and other model-bearing records use their catalog model path. Models
missing from these catalogs need their full GLB viewer configuration.

m2icondb monster pages use the site's public monster catalog, including its
statistics and first listed Vnum (review variants before saving).
m2icondb item models do not include item statistics. For a known Vnum the service
reads the corresponding Metin2Alerts page for statistics. Unread fields are
reported in the draft; they are not inferred from mesh geometry. Review values
against your game server before saving.

Upload a Netscape `cookies.txt` for Metin2Alerts in the import dialog when needed.
Cookies are kept under `DATA_DIR/import-private`, outside the public uploads
directory and Git. The UI can replace or delete them. No cookies are required
for m2icondb models.

Main GLB meshes keep their embedded animations; DDS/PNG material textures are
converted to embedded PNG images for browser display. Compatible character-motion
GLBs are merged into skinned armor by bone name; the viewer lists available clips
and provides playback, pause, restart, speed and timeline controls. Existing armor
downloads need a model refresh to acquire newly merged motion clips. Separate
hair/accessory and effect GLBs are not combined into the main mesh; the download
response reports this limitation. Texture failures
are also reported. Imports run at most two workers, with a three-minute timeout,
50 MB per output and bounded source downloads. A failed model download leaves
the previous model in place; item data may already have been saved by the editor.
