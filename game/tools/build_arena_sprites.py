#!/usr/bin/env python3
"""Produce a transparent WebP atlas for the six Blade Forge tournament targets.

Source is deterministic raster illustration (Pillow), not SVG or runtime vector shapes.
5 rows: whole, cut-top, cut-bottom, shard glyphs, impact flash; 6 material columns.
The two split sprites share coordinates; game applies motion & orientation at runtime.
Run: python3 -m pip install Pillow && python3 game/tools/build_arena_sprites.py
"""
from __future__ import annotations
import json, math, random, sys, io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageStat
from arena_prop_art import make_prop

S = 256
COLORS = {
    'foam': (72, 207, 193), 'rope': (202, 163, 102),
    'wood': (156, 103, 64), 'plastic': (190, 215, 221),
    'ice': (108, 212, 240), 'metal': (180, 196, 211)
}
ORDER = ('foam', 'rope', 'wood', 'plastic', 'ice', 'metal')
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'arena'
OUT.mkdir(parents=True, exist_ok=True)
def rgba(rgb, alpha=255):
    return tuple(max(0, min(255, int(x))) for x in rgb[:3])+(alpha,)
def mix(a,b,t):
    return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
def color(base, amt):
    return mix(base, (255,255,255) if amt>0 else (12,22,32), abs(amt))
def new(): return Image.new('RGBA', (S,S), (0,0,0,0))
def mask_ellipse(img,box,fill): ImageDraw.Draw(img).ellipse(box, fill=fill)
def glow(im,x,y,size,shade):
    layer=new()
    ImageDraw.Draw(layer).ellipse((x-size,y-size,x+size,y+size),fill=rgba(shade,110))
    layer=layer.filter(ImageFilter.GaussianBlur(size*.45))
    im.alpha_composite(layer)
def rect_texture(base, bbox, mat, radius=16, seed=1, alpha=255):
    """Prebaked shaded material volume with subtle grain and edge AO."""
    rng=random.Random(seed)
    x0,y0,x1,y1=map(int,bbox)
    m=Image.new('L',(S,S),0)
    ImageDraw.Draw(m).rounded_rectangle((x0,y0,x1,y1),radius=radius,fill=255)
    pix=Image.new('RGBA',(S,S),(0,0,0,0))
    pd=ImageDraw.Draw(pix)
    for x in range(x0,x1+1):
        phase=(x-x0)/max(1,x1-x0)
        edge=.52+.48*math.sin(math.pi*phase)
        shine=.12*math.exp(-((phase-.36)/.13)**2)
        rr=tuple(max(0,min(255,v*edge+245*shine)) for v in mat)
        pd.line((x,y0,x,y1),fill=rgba(rr,alpha))
    pix.putalpha(ImageChops.multiply(pix.getchannel('A'),m))
    base.alpha_composite(pix)
    return rng
from PIL import ImageChops

def split(im, side, mat):
    """Premultiplied-looking matte edges + short inner exposed fracture lip."""
    cut=new()
    region=Image.new('L',(S,S),0);md=ImageDraw.Draw(region)
    # A shallow 12-degree diagonal cut, later rotated to align with real swipe angle.
    def sy(x): return int(129+(x-128)*.20)
    if side=='top':
        poly=[(0,0),(S,0),(S,sy(S)),(0,sy(0))]
    else:
        poly=[(0,sy(0)),(S,sy(S)),(S,S),(0,S)]
    md.polygon(poly,fill=255)
    sliced=im.copy()
    sliced.putalpha(ImageChops.multiply(im.getchannel('A'),region))
    cut.alpha_composite(sliced)
    lip=ImageDraw.Draw(cut)
    shade=COLORS[mat]
    # narrow inner edge only where source material is visible
    for x in range(40,213,3):
        y=sy(x)
        if im.getpixel((x,max(1,min(S-2,y))))[3]<85:continue
        d= -1 if side=='top' else 1
        lip.line((x,y+d,x+3,sy(x+3)+d),fill=rgba(color(shade,.5 if mat!='metal' else .85),225),width=3)
        lip.line((x,y+d*4,x+3,sy(x+3)+d*4),fill=rgba(color(shade,-.35),80),width=2)
        # Distinct cross section instead of a universal white slash line.
        if mat=='metal':
            lip.line((x,y+d*2,x+3,sy(x+3)+d*2),fill=(224,236,245,230),width=4)
            lip.line((x,y+d*6,x+3,sy(x+3)+d*6),fill=(57,73,89,115),width=2)
            if x%15<3:
                lip.line((x,y+d,x+2,y+d*7),fill=(249,254,255,205),width=1)
        elif mat=='wood' and x%12<3:
            lip.line((x,y,x+2,y+d*9),fill=(210,162,112,210),width=2)
        elif mat=='rope' and x%9<3:
            lip.line((x,y,x+2,y+d*11),fill=(244,214,153,205),width=2)
        elif mat=='ice' and x%15<3:
            lip.line((x,y,x+4,y+d*8),fill=(235,255,255,215),width=2)
        elif mat=='plastic' and x%18<3:
            lip.line((x,y,x+5,y+d*4),fill=(227,249,252,210),width=2)
    return cut

def chips(mat):
    im=new();d=ImageDraw.Draw(im);r=random.Random(110+ORDER.index(mat))
    base=COLORS[mat]
    for slot in range(4):
        cx=64+(slot%2)*128;cy=64+(slot//2)*128
        for i in range(7):
            x=cx+r.randint(-36,36);y=cy+r.randint(-34,34)
            size=r.randint(4,11) if mat in ('ice','plastic','wood','metal') else r.randint(2,7)
            shade=color(base,r.uniform(-.33,.6))
            if mat=='rope':
                d.line((x-size,y-size//2,x+size,y+size//2),fill=rgba(shade),width=r.randint(2,4))
            elif mat=='foam':
                d.ellipse((x-size,y-size,x+size,y+size),fill=rgba(shade,240))
                d.ellipse((x,y,x+2,y+2),fill=(255,255,255,110))
            else:
                d.polygon([(x-size,y+size//3),(x,y-size),(x+size,y),(x+size//2,y+size)],fill=rgba(shade,240))
                d.line((x-size,y+size//3,x,y-size,x+size,y),fill=(255,255,255,135),width=1)
    return im

def flash(mat):
    im=new();r=random.Random(420+ORDER.index(mat));d=ImageDraw.Draw(im)
    c=COLORS[mat]
    center=(128,128)
    for i in range(15):
        theta=(i/15)*math.pi*2+r.uniform(-.15,.15)
        radius=r.randint(30,80) if mat=='metal' else r.randint(20,65)
        q=(128+math.cos(theta)*radius,128+math.sin(theta)*radius)
        d.line((128,128,q[0],q[1]),fill=rgba((255,191,94) if mat=='metal' else color(c,.72),r.randint(105,245)),width=r.randint(2,5))
    for radius in (28,18,8):
        d.ellipse((128-radius,128-radius,128+radius,128+radius),outline=rgba(color(c,.8),max(60,230-radius*4)),width=5)
    glow_layer=new();glow(glow_layer,128,128,54,c)
    glow_layer.alpha_composite(im)
    return glow_layer

def build():
    atlas=Image.new('RGBA',(6*S,5*S),(0,0,0,0))
    for i,mat in enumerate(ORDER):
        whole=make_prop(mat)
        row=(whole,split(whole,'top',mat),split(whole,'bottom',mat),chips(mat),flash(mat))
        for j,sprite in enumerate(row):atlas.alpha_composite(sprite,(i*S,j*S))
    target=OUT/'targets.webp'
    if '--verify' in sys.argv:
        if not target.exists():raise SystemExit('Committed sprite atlas is missing')
        encoded=io.BytesIO();atlas.save(encoded,format='WEBP',quality=90,method=6)
        rebuilt=Image.open(io.BytesIO(encoded.getvalue())).convert('RGBA')
        committed=Image.open(target).convert('RGBA')
        if committed.size!=rebuilt.size:raise SystemExit('Committed sprite atlas has wrong size')
        means=ImageStat.Stat(ImageChops.difference(committed,rebuilt)).mean
        # Small encoder/version variation is allowed; visually stale artwork is not.
        if max(means[:3])>2.0 or means[3]>.25:
            raise SystemExit('Committed atlas differs from its source: '+str(means))
        print('Committed six-material artwork matches source',means)
        return
    atlas.save(target,format='WEBP',quality=90,method=6)
    meta={'cell':S,'columns':list(ORDER),'rows':['whole','top','bottom','chips','flash'],
          'version':2,'asset':'assets/arena/targets.webp',
          'sources':'deterministic generated raster sprites, no SVG and no remote downloads',
          'dimensions':[6*S,5*S]}
    (OUT/'targets.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
    print(str(target),target.stat().st_size,'bytes',atlas.size)
if __name__=='__main__':build()
