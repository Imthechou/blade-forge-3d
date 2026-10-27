#!/usr/bin/env python3
"""Produce a transparent WebP atlas for the six Blade Forge tournament targets.

Source is deterministic raster illustration (Pillow), not SVG or runtime vector shapes.
5 rows: whole, cut-top, cut-bottom, shard glyphs, impact flash; 6 material columns.
The two split sprites share coordinates; game applies motion & orientation at runtime.
Run: python3 -m pip install Pillow && python3 game/tools/build_arena_sprites.py
"""
from __future__ import annotations
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

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

def foam():
    im=new();d=ImageDraw.Draw(im)
    shades=[(65,209,199),(236,117,105),(92,156,232)]
    for i,c in enumerate(shades):
        y=49+i*50
        rng=rect_texture(im,(49,y,207,y+51),c,16,200+i)
        d=ImageDraw.Draw(im)
        d.rounded_rectangle((49,y,207,y+51),radius=15,outline=rgba(color(c,-.35),190),width=3)
        d.line((61,y+9,195,y+9),fill=rgba(color(c,.75),160),width=3)
        for j in range(75):
            px=rng.randint(58,195);py=rng.randint(y+10,y+43);rr=rng.choice([1,1,2])
            d.ellipse((px-rr,py-rr,px+rr,py+rr),fill=rgba(color(c,rng.uniform(-.3,.65)),rng.randint(85,170)))
    # textile strap crosses all layers, casting a physical shadow
    d.rounded_rectangle((117,45,136,202),radius=4,fill=(69,72,88,225))
    d.line((121,53,121,196),fill=(196,198,208,145),width=3)
    d.rounded_rectangle((107,105,147,115),radius=3,fill=(51,61,70,160))
    return im

def rope():
    im=new();d=ImageDraw.Draw(im);r=random.Random(20)
    for i in range(6):
        xx=47+i*28
        d.rounded_rectangle((xx,39+(i%2)*5,xx+31,211),radius=12,fill=(89,65,41,220))
        for x in range(xx+3,xx+28):
            n=.6+.4*math.sin(math.pi*(x-xx)/31)
            tone=color((204,167,110), (n-.8)*.8+r.uniform(-.11,.11))
            d.line((x,44+(i%2)*5,x,205),fill=rgba(tone,244),width=2)
        for yy in range(50,206,12):
            d.line((xx+2,yy+(i%2)*4,xx+27,yy+9+(i%2)*4),fill=(94,66,39,154),width=2)
            d.line((xx+6,yy+1+(i%2)*4,xx+26,yy+8+(i%2)*4),fill=(250,226,176,112),width=2)
        for k in range(6):
            fx=xx+4+r.randint(0,21); fy=r.choice([41,206])
            d.line((fx,fy,fx+r.randint(-5,5),fy+(-1 if fy==41 else 1)*r.randint(5,14)),fill=(232,197,143,210),width=2)
    for y in (81,169):
        d.rounded_rectangle((44,y-5,213,y+7),radius=4,fill=(119,52,45,230))
        d.line((50,y-4,207,y-4),fill=(241,146,105,190),width=2)
    return im

def wood():
    im=new();d=ImageDraw.Draw(im);r=random.Random(30)
    rng=rect_texture(im,(52,52,206,221),(153,98,57),24,30)
    d=ImageDraw.Draw(im)
    for i in range(110):
        xx=r.randint(58,201); top=r.randint(67,206)
        col=r.choice([(77,50,35,75),(244,180,116,75),(83,53,33,110)])
        d.line((xx,top,xx+r.randint(-8,8),min(218,top+r.randint(6,39))),fill=col,width=r.randint(1,3))
    d.ellipse((52,32,206,96),fill=(87,57,37,252))
    d.ellipse((60,38,197,90),fill=(206,156,101,255),outline=(119,78,43,245),width=5)
    for i in range(4):
        p=i*11
        d.ellipse((72+p,44+p*.38,185-p,83-p*.35),outline=(130,85,50,170),width=2)
    d.line((126,65,154,56,166,72),fill=(93,55,29,185),width=2)
    d.arc((48,176,210,229),0,180,fill=(55,35,25,100),width=5)
    return im

def plastic():
    im=new(); d=ImageDraw.Draw(im);r=random.Random(40)
    rect_texture(im,(47,42,209,213),(183,206,215),12,40)
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((53,47,201,207),radius=8,outline=(59,95,110,240),width=5)
    d.rounded_rectangle((66,60,190,195),radius=5,fill=(209,227,232,165),outline=(89,135,149,155),width=3)
    for x in range(76,198,19):
        d.line((x,61,x+11,189),fill=(73,121,136,95),width=4)
        d.line((x+4,61,x+13,189),fill=(255,255,255,120),width=2)
    for k in (0,1):
        y=90+76*k
        d.line((65,y,192,y),fill=(73,112,126,120),width=5)
        d.line((70,y-2,186,y-2),fill=(255,255,255,140),width=2)
    for x in (61,195):
        for y in (60,196):
            d.ellipse((x-5,y-5,x+5,y+5),fill=(78,112,126,255),outline=(237,246,247,255),width=2)
            d.line((x-3,y,x+3,y),fill=(235,242,245,220),width=1)
    d.polygon([(47,42),(209,42),(203,49),(53,49)],fill=(242,250,250,158))
    return im

def ice():
    im=new();d=ImageDraw.Draw(im);rng=random.Random(50)
    poly=[(64,41),(177,36),(207,62),(214,186),(187,221),(65,215),(41,181),(45,71)]
    d.polygon(poly,fill=(131,222,246,170))
    ice_mask=Image.new('L',(S,S),0);ImageDraw.Draw(ice_mask).polygon(poly,fill=235)
    # translucent gradients with fine grained bubbles, layered polygon facets
    facets=[
      ([(64,41),(177,36),(145,78),(76,97)],(238,253,255,205)),
      ([(177,36),(207,62),(214,186),(170,162)],(65,149,209,122)),
      ([(41,181),(76,97),(132,138),(65,215)],(109,221,250,160)),
      ([(76,97),(145,78),(170,162),(132,138)],(200,245,255,118)),
      ([(132,138),(170,162),(187,221),(65,215)],(66,184,223,130))
    ]
    for pts,c in facets:d.polygon(pts,fill=c)
    for i in range(90):
        x=rng.randint(60,203);y=rng.randint(60,204)
        radius=rng.choice([1,1,1,2,3])
        d.ellipse((x-radius,y-radius,x+radius,y+radius),outline=(238,255,255,rng.randint(100,220)),width=1)
    for pts in [[(76,97),(132,138),(187,221)],[(145,78),(104,113),(75,183)],[(170,162),(135,111),(196,75)]]:
        d.line(pts,fill=(231,255,255,192),width=3,joint='curve')
    d.line(poly+[poly[0]],fill=(225,255,255,242),width=5,joint='curve')
    d.line([(64,42),(180,38),(206,62)],fill=(255,255,255,245),width=6)
    # gently bloom at top edge, but preserve transparency
    layer=new();ld=ImageDraw.Draw(layer);ld.line((67,46,181,42),fill=(255,255,255,170),width=5)
    layer=layer.filter(ImageFilter.GaussianBlur(5))
    im.alpha_composite(layer)
    return im

def metal():
    """Premium forged solid-steel billet, chamfered and brushed (NO hollow pipe)."""
    im=new();d=ImageDraw.Draw(im);r=random.Random(60)
    top=[(39,72),(170,50),(219,86),(90,107)]
    side=[(39,72),(90,107),(90,215),(39,187)]
    front=[(90,107),(219,86),(219,187),(90,215)]
    d.polygon(side,fill=(58,75,88,255))
    d.polygon(front,fill=(140,153,169,255))
    d.polygon(top,fill=(216,231,242,255))
    # Satin steel face: directional speculars following ingot perspective.
    for x in range(94,216):
        t=(x-94)/124
        level=104+56*math.exp(-((t-.32)/.19)**2)+12*math.cos(t*9)-9*t
        d.line((x,106-(x-90)*.157,x,215-(x-90)*.217),
               fill=rgba((level*.84,level*.93,level*1.03),180),width=2)
    # Forged grain / micro-scratches clipped to the visible solid face.
    mask=Image.new('L',(S,S),0);ImageDraw.Draw(mask).polygon(front,fill=255)
    marks=new();md=ImageDraw.Draw(marks)
    for i in range(580):
        x=r.randint(92,216);y=r.randint(88,216);ln=r.randint(2,18)
        c=(251,254,255,r.randint(18,85)) if i%3==0 else (19,38,54,r.randint(14,83))
        md.line((x,y,x+ln,y-max(1,int(ln*.14))),fill=c,width=1)
    marks.putalpha(ImageChops.multiply(marks.getchannel('A'),mask))
    im.alpha_composite(marks)
    d=ImageDraw.Draw(im)
    # Chamfered perimeter and solid top reflection; no dark oval or opening.
    d.line(top+[top[0]],fill=(238,248,255,211),width=4,joint='curve')
    d.line([(39,72),(90,107),(90,215),(39,187),(39,72)],fill=(48,65,80,220),width=4,joint='curve')
    d.line([(90,107),(219,86),(219,187),(90,215)],fill=(240,248,253,210),width=3,joint='curve')
    d.line((96,111,211,91),fill=(250,254,255,190),width=3)
    d.line((92,211,214,184),fill=(31,46,61,235),width=5)
    d.line((49,77,165,56),fill=(255,255,255,176),width=3)
    d.line((103,143,189,129),fill=(32,52,65,107),width=2)
    d.line((103,145,189,131),fill=(245,252,254,112),width=1)
    return im


BUILD={'foam':foam,'rope':rope,'wood':wood,'plastic':plastic,'ice':ice,'metal':metal}

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

def premium_finish(source, mat):
    """Offline baked micro-texture & transparent bevel sheen for all six materials."""
    im=source.copy();alpha=im.getchannel('A');overlay=new()
    d=ImageDraw.Draw(overlay);r=random.Random(8800+ORDER.index(mat)*713)
    light=(248,255,255,110) if mat in ('metal','ice','plastic') else (252,228,175,128)
    dark=(34,63,87,85) if mat in ('metal','ice','plastic') else (74,48,29,100)
    for i in range(200):
        x=r.randrange(25,230);y=r.randrange(25,231)
        if alpha.getpixel((x,y))<80:continue
        c=light if i%4==0 else dark
        if mat in ('metal','plastic'):
            dx=r.randrange(4,18);d.line((x,y,x+dx,y-max(0,dx//7)),fill=c,width=1)
        elif mat in ('rope','wood'):
            d.line((x,y,x+r.randrange(-2,5),y+r.randrange(2,12)),fill=c,width=1)
        else:
            rr=1 if i%8 else 2;d.ellipse((x-rr,y-rr,x+rr,y+rr),fill=c)
    overlay.putalpha(ImageChops.multiply(overlay.getchannel('A'),alpha))
    im.alpha_composite(overlay)
    interior=alpha.filter(ImageFilter.MinFilter(5))
    rim=ImageChops.subtract(alpha,interior)
    shine=Image.new('RGBA',(S,S),(231,248,255,0))
    shine.putalpha(rim.point(lambda a:int(a*.25)))
    im.alpha_composite(shine)
    return im

def build():
    atlas=Image.new('RGBA',(6*S,5*S),(0,0,0,0))
    for i,mat in enumerate(ORDER):
        whole=premium_finish(BUILD[mat](),mat)
        row=(whole,split(whole,'top',mat),split(whole,'bottom',mat),chips(mat),flash(mat))
        for j,sprite in enumerate(row):atlas.alpha_composite(sprite,(i*S,j*S))
    target=OUT/'targets.webp'
    atlas.save(target,format='WEBP',quality=83,method=6)
    meta={'cell':S,'columns':list(ORDER),'rows':['whole','top','bottom','chips','flash'],
          'version':1,'asset':'assets/arena/targets.webp',
          'sources':'deterministic generated raster sprites, no SVG and no remote downloads',
          'dimensions':[6*S,5*S]}
    (OUT/'targets.json').write_text(json.dumps(meta,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(str(target),target.stat().st_size,'bytes',atlas.size)
if __name__=='__main__':build()
