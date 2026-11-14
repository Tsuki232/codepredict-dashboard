"""Exporta la sección de resultados a Word (.docx), con el MISMO texto, tablas y figuras que el PDF.

Uso:  .venv\\Scripts\\python.exe reports/informe_codepredict/exportar_word.py
Reutiliza el HTML ya rellenado por build.py (--resultados), así que PDF y Word no pueden diferir en cifras.
Solo biblioteca estándar + matplotlib (las ecuaciones se insertan como imagen; para editarlas, Word › Insertar › Ecuación).
Formato APA 7: Times New Roman 12, doble espacio, márgenes de 1 pulgada, número de página arriba a la derecha.
"""
from __future__ import annotations

import html
import re
import struct
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent
sys.argv.append("--resultados")           # build.py arma el cuerpo con las cifras ya puestas
sys.path.insert(0, str(HERE))
import build  # noqa: E402  (no ejecuta la generación del PDF: eso está bajo __main__)

OUT = HERE / "CodePredict_AI_Seccion_Resultados.docx"
TMP = HERE / "_build" / "word"
TMP.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- ecuaciones: TeX -> PNG (matplotlib mathtext)
plt.rcParams.update({"mathtext.fontset": "stix", "font.family": "serif"})
eqs: list[tuple[Path, str]] = []


def render_eq(tex: str, i: int) -> tuple[Path, str]:
    m = re.search(r"\\tag\{(\d+)\}", tex)
    num = m.group(1) if m else ""
    tex = re.sub(r"\\tag\{\d+\}", "", tex).strip()
    tex = tex.replace(r"\dfrac", r"\frac").replace(r"\,", r"\ ")
    fig = plt.figure(figsize=(0.1, 0.1))
    fig.text(0, 0, f"${tex}$", fontsize=15)
    p = TMP / f"eq{i}.png"
    fig.savefig(p, dpi=300, bbox_inches="tight", pad_inches=0.05, facecolor="white")
    plt.close(fig)
    return p, num


def sub_eq(m):
    eqs.append(render_eq(m.group(1), len(eqs) + 1))
    return f'<div class="eqmark" data-i="{len(eqs) - 1}"></div>'


body = re.sub(r"\$\$(.*?)\$\$", sub_eq, build.body, flags=re.S)


# ---------------------------------------------------------------- HTML -> bloques
class Run:
    def __init__(self, text, b=False, i=False, sub=False, sup=False, code=False):
        self.text, self.b, self.i, self.sub, self.sup, self.code = text, b, i, sub, sup, code


class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[dict] = []
        self.cur: dict | None = None
        self.fmt = {"b": 0, "i": 0, "sub": 0, "sup": 0, "code": 0}
        self.table: list[list[dict]] | None = None
        self.row: list[dict] | None = None
        self.cell: dict | None = None
        self.in_refs = False
        self.table_cls = ""

    # -- helpers
    def runs_target(self):
        return self.cell if self.cell is not None else self.cur

    def start_block(self, kind, **kw):
        self.cur = {"kind": kind, "runs": [], **kw}

    def end_block(self):
        if self.cur is not None:
            self.blocks.append(self.cur)
            self.cur = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        c = a.get("class", "")
        if tag == "section":
            self.in_refs = "refs" in c
        elif tag in ("h1", "h2"):
            self.start_block(tag, newpage="newpage" in c, notoc="notoc" in c)
        elif tag == "h6":
            self.start_block("capnum")
        elif tag == "p":
            kind = "capnum" if "cap-num" in c else "captitle" if "cap-title" in c else "nota" if "nota" in c else "ref" if self.in_refs else "p"
            self.start_block(kind)
        elif tag == "img":
            w = re.search(r"width:([\d.]+)in", a.get("style", ""))
            self.blocks.append({"kind": "img", "src": a["src"], "w": float(w.group(1)) if w else 5.0})
        elif tag == "div" and "eqmark" in c:
            self.blocks.append({"kind": "eq", "i": int(a["data-i"])})
        elif tag == "table":
            self.table, self.table_cls = [], c
        elif tag == "tr" and self.table is not None:
            self.row = []
            self.row_cls = c
        elif tag in ("td", "th") and self.row is not None:
            self.cell = {"runs": [], "th": tag == "th", "tot": "tot" in getattr(self, "row_cls", "")}
        elif tag in ("em", "i"):
            self.fmt["i"] += 1
        elif tag in ("strong", "b"):
            self.fmt["b"] += 1
        elif tag == "sub":
            self.fmt["sub"] += 1
        elif tag == "sup":
            self.fmt["sup"] += 1
        elif tag == "code":
            self.fmt["code"] += 1
        elif tag == "br":
            t = self.runs_target()
            if t is not None:
                t["runs"].append(Run("\n"))

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h6", "p"):
            self.end_block()
        elif tag in ("td", "th") and self.cell is not None:
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            self.blocks.append({"kind": "table", "rows": self.table, "cls": self.table_cls})
            self.table = None
        elif tag in ("em", "i"):
            self.fmt["i"] -= 1
        elif tag in ("strong", "b"):
            self.fmt["b"] -= 1
        elif tag == "sub":
            self.fmt["sub"] -= 1
        elif tag == "sup":
            self.fmt["sup"] -= 1
        elif tag == "code":
            self.fmt["code"] -= 1

    def handle_data(self, data):
        t = self.runs_target()
        if t is None:
            return
        data = re.sub(r"\s+", " ", data)
        if not data.strip() and not t["runs"]:
            return
        f = self.fmt
        t["runs"].append(Run(data, f["b"] > 0, f["i"] > 0, f["sub"] > 0, f["sup"] > 0, f["code"] > 0))


P = Parser()
P.feed(body)
blocks = P.blocks

# ---------------------------------------------------------------- docx (WordprocessingML a mano)
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
esc = lambda s: html.escape(s, quote=False)
media: list[tuple[str, Path]] = []        # (nombre dentro del zip, ruta)


def rpr(r: Run, base_b=False, base_i=False, size=None) -> str:
    x = ""
    if r.code:
        x += '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>'
    if r.b or base_b:
        x += "<w:b/>"
    if r.i or base_i:
        x += "<w:i/>"
    if r.code:
        x += '<w:sz w:val="19"/>'
    elif size:
        x += f'<w:sz w:val="{size}"/>'
    if r.sub:
        x += '<w:vertAlign w:val="subscript"/>'
    if r.sup:
        x += '<w:vertAlign w:val="superscript"/>'
    return f"<w:rPr>{x}</w:rPr>" if x else ""


def runs_xml(runs, base_b=False, base_i=False, size=None) -> str:
    out = []
    for r in runs:
        if r.text == "\n":
            out.append("<w:r><w:br/></w:r>")
            continue
        out.append(f'<w:r>{rpr(r, base_b, base_i, size)}<w:t xml:space="preserve">{esc(r.text)}</w:t></w:r>')
    return "".join(out)


def strip_runs(runs):
    """Quita espacios sobrantes en los extremos del párrafo."""
    if runs:
        runs[0].text = runs[0].text.lstrip()
        runs[-1].text = runs[-1].text.rstrip()
    return runs


def png_size(path: Path) -> tuple[int, int]:
    with open(path, "rb") as f:
        f.read(16)
        return struct.unpack(">II", f.read(8))


def image_xml(path: Path, width_in: float, name: str) -> str:
    wpx, hpx = png_size(path)
    cx = int(width_in * 914400)
    cy = int(cx * hpx / wpx)
    idx = len(media) + 1
    rid = f"rIdImg{idx}"
    media.append((f"media/image{idx}.png", path))
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
            f'<wp:docPr id="{idx}" name="{esc(name)}" descr="{esc(name)}"/><wp:cNvGraphicFramePr/>'
            f'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="{idx}" name="{esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
            f'</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


def para(inner: str, style="Normal", jc=None, keep_next=False, page_break=False, hanging=False, spacing=None, indent_first=None) -> str:
    ppr = f'<w:pStyle w:val="{style}"/>'
    if keep_next:
        ppr += "<w:keepNext/>"
    if page_break:
        ppr += "<w:pageBreakBefore/>"
    if spacing:
        ppr += f'<w:spacing w:line="{spacing}" w:lineRule="auto" w:before="0" w:after="0"/>'
    if hanging:
        ppr += '<w:ind w:left="720" w:hanging="720"/>'
    elif indent_first is not None:
        ppr += f'<w:ind w:firstLine="{indent_first}"/>'
    if jc:
        ppr += f'<w:jc w:val="{jc}"/>'
    return f"<w:p><w:pPr>{ppr}</w:pPr>{inner}</w:p>"


def table_xml(rows, cls) -> str:
    ncol = max(len(r) for r in rows)
    grid = "".join(f'<w:gridCol w:w="{9360 // ncol}"/>' for _ in range(ncol))
    out = [f'<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="autofit"/>'
           f'<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>{grid}</w:tblGrid>']
    centered = "num" in cls.split()
    for ri, row in enumerate(rows):
        head = row[0]["th"]
        last = ri == len(rows) - 1
        out.append("<w:tr>" + ("<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>" if head else "<w:trPr><w:cantSplit/></w:trPr>"))
        for ci, cell in enumerate(row):
            top = head or cell["tot"]
            bottom = head or last
            b = ""
            if top:
                b += f'<w:top w:val="single" w:sz="{8 if head else 4}" w:space="0" w:color="000000"/>'
            if bottom:
                b += '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>'
            tcpr = f"<w:tcPr><w:tcBorders>{b}</w:tcBorders></w:tcPr>" if b else ""
            jc = "center" if centered and ci > 0 else "left"
            inner = para(runs_xml(strip_runs(cell["runs"]), base_b=head, size=22), style="Tabla", jc=jc)
            out.append(f"<w:tc>{tcpr}{inner}</w:tc>")
        out.append("</w:tr>")
    out.append("</w:tbl>")
    return "".join(out) + para("", style="Tabla")


parts: list[str] = []
for blk in blocks:
    k = blk["kind"]
    if k in ("h1", "h2"):
        parts.append(para(runs_xml(strip_runs(blk["runs"])), style="Heading1" if k == "h1" else "Heading2", page_break=blk.get("newpage") and bool(parts)))
    elif k == "capnum":
        parts.append(para(runs_xml(strip_runs(blk["runs"]), base_b=True), style="Leyenda", keep_next=True))
    elif k == "captitle":
        parts.append(para(runs_xml(strip_runs(blk["runs"]), base_i=True), style="Leyenda", keep_next=True))
    elif k == "nota":
        parts.append(para(runs_xml(strip_runs(blk["runs"])), style="Leyenda"))
    elif k == "ref":
        parts.append(para(runs_xml(strip_runs(blk["runs"])), hanging=True, indent_first=None))
    elif k == "p":
        if any(r.text.strip() for r in blk["runs"]):
            parts.append(para(runs_xml(strip_runs(blk["runs"])), indent_first=720))
    elif k == "img":
        parts.append(para(image_xml(HERE / blk["src"], blk["w"], Path(blk["src"]).stem), style="Leyenda", jc="center"))
    elif k == "eq":
        path, num = eqs[blk["i"]]
        inner = image_xml(path, 3.6, f"Ecuación {num}") + (f'<w:r><w:tab/></w:r><w:r><w:t>({num})</w:t></w:r>' if num else "")
        parts.append(para(inner, style="Normal", jc="center"))
    elif k == "table":
        parts.append(table_xml(blk["rows"], blk["cls"]))

sect = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>')
NS = (f'{W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"')
document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{"".join(parts)}{sect}</w:body></w:document>'

TNR = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>'
styles = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}>
<w:docDefaults><w:rPrDefault><w:rPr>{TNR}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Leyenda"><w:name w:val="Leyenda APA"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Tabla"><w:name w:val="Texto de tabla"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>
</w:styles>'''
header = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>'
          '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
          '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>')
ctypes = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          '<Default Extension="png" ContentType="image/png"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
          '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
            + "".join(f'<Relationship Id="rIdImg{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{n}"/>' for i, (n, _) in enumerate(media))
            + "</Relationships>")
core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:title>CodePredict AI: sección de resultados</dc:title><dc:creator>CodePredict AI</dc:creator><dc:language>es-CO</dc:language></cp:coreProperties>')

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", ctypes)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)
    z.writestr("word/styles.xml", styles)
    z.writestr("word/header1.xml", header)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.writestr("docProps/core.xml", core)
    for name, path in media:
        z.write(path, f"word/{name}")
print(f"OK  {OUT.name}: {len([b for b in blocks if b['kind'] == 'table'])} tablas, {len([b for b in blocks if b['kind'] == 'img'])} figuras, {len(eqs)} ecuaciones")
