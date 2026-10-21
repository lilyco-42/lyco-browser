"""Create a distinctly named OFL test font inside the disposable Actions runner."""
import json
import os
import sys
from pathlib import Path

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise RuntimeError("Font controls are built only in Actions")

from fontTools.ttLib import TTFont

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source, output = Path(sys.argv[2]), Path(sys.argv[3])
names = {
    1: manifest["family"], 2: "Regular", 3: manifest["postscriptName"],
    # local() accepts a full or PostScript name. Keep the full name equal to
    # the tested family so local() and normal Canvas family lookup agree.
    4: manifest["family"], 6: manifest["postscriptName"],
    16: manifest["family"], 17: "Regular",
}
with TTFont(source) as font:
    for record in list(font["name"].names):
        if record.nameID in names:
            font["name"].setName(names[record.nameID], record.nameID,
                                 record.platformID, record.platEncID, record.langID)
    for name_id, text in names.items():
        font["name"].setName(text, name_id, 3, 1, 0x409)
    # A source signature cannot certify the renamed test fixture.
    if "DSIG" in font:
        del font["DSIG"]
    font.save(output)

with TTFont(output) as verified:
    assert verified["name"].getDebugName(1) == manifest["family"]
    assert verified["name"].getDebugName(4) == manifest["family"]
    assert verified["name"].getDebugName(6) == manifest["postscriptName"]
    assert verified["name"].getDebugName(0), "Retain the original copyright notice"
