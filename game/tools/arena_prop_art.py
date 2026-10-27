"""Original arena prop illustrations, drawn at 3x then filtered for mobile.

Art source stays editable and reproducible with Pillow alone. Broad material
planes carry the lighting; grain is subordinate, rather than hundreds of hard
white outlines. No gameplay, collision geometry or external assets are involved.
"""
import math, random
from PIL import Image, ImageDraw, ImageChops, ImageFilter

SIZE, SS = 256, 3
def blend(a,b,t): return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
def pts(values):
    return [(x*SS,y*SS) for x,y in values] if isinstance(values[0],(tuple,list)) else tuple(v*SS for v in values)
class Pen:
    def __init__(self,im): self.raw=ImageDraw.Draw(im)
    def polygon(self,p,fill): self.raw.polygon(pts(p),fill=fill)
    def line(self,p,fill,width=1): self.raw.line(pts(p),fill=fill,width=max(1,round(width*SS)),joint='curve')
    def ellipse(self,b,fill=None,outline=None,width=1): self.raw.ellipse(pts(b),fill=fill,outline=outline,width=max(1,round(width*SS)))
    def rounded(self,b,r,fill,outline=None,width=1): self.raw.rounded_rectangle(pts(b),r*SS,fill=fill,outline=outline,width=max(1,round(width*SS)))
    def arc(self,b,a,z,fill,width=1):self.raw.arc(pts(b),a,z,fill=fill,width=max(1,round(width*SS)))
class Prop:
    def __init__(self):
        self.im=Image.new('RGBA',(SIZE*SS,SIZE*SS));self.d=Pen(self.im)
        self.detail=Image.new('RGBA',self.im.size);self.ink=Pen(self.detail)
    def gradient(self,poly,colors,axis='x',alpha=255):
        mask=Image.new('L',self.im.size);Pen(mask).polygon(poly,255)
        layer=Image.new('RGBA',self.im.size);d=ImageDraw.Draw(layer)
        values=[p[0 if axis=='x' else 1] for p in poly];lo,hi=min(values)*SS,max(values)*SS
        for i in range(max(0,int(lo)),min(SIZE*SS,int(hi)+1)):
            t=(i-lo)/max(1,hi-lo);q=min(len(colors)-2,int(t*(len(colors)-1)));f=t*(len(colors)-1)-q
            c=blend(colors[q],colors[q+1],f)+(alpha,)
            d.line((i,0,i,SIZE*SS) if axis=='x' else (0,i,SIZE*SS,i),fill=c)
        layer.putalpha(ImageChops.multiply(layer.getchannel('A'),mask));self.im.alpha_composite(layer)
    def finish(self):
        self.detail.putalpha(ImageChops.multiply(self.detail.getchannel('A'),self.im.getchannel('A')))
        self.im.alpha_composite(self.detail)
        return self.im.resize((SIZE,SIZE),Image.Resampling.LANCZOS)

def foam():
    p=Prop();r=random.Random(301)
    tones=[(55,174,167),(207,102,92),(69,126,177)]
    for i,c in enumerate(tones):
        x=47+[3,-3,2][i];y=47+i*53
        poly=[(x+10,y),(x+151,y-3),(x+164,y+8),(x+163,y+45),(x+153,y+51),(x+4,y+53),(x,y+45),(x,y+11)]
        p.gradient(poly,[blend(c,(13,50,58),.32),c,blend(c,(243,248,232),.24),blend(c,(15,53,61),.28)])
        p.ink.line([(x+12,y+8),(x+149,y+5),(x+156,y+11)],(227,253,240,160),2)
        p.ink.line([(x+5,y+44),(x+154,y+43)],(18,52,59,105),2.8)
        for k in range(100):
            px=r.uniform(x+8,x+155);py=r.uniform(y+12,y+42);rr=r.uniform(.45,1.45)
            p.ink.ellipse((px-rr,py-rr,px+rr,py+rr),(9,53,60,74))
            if k%3==0:p.ink.arc((px-rr,py-rr,px+rr,py+rr),20,150,(221,249,232,115),.6)
    # Tensioned woven strap, with a small recessed buckle and stitched edges.
    p.gradient([(132,42),(147,43),(154,207),(139,211)],[(32,54,64),(77,98,103),(37,60,68)])
    for yy in range(49,204,5):p.ink.line((135+(yy-40)*.04,yy,144+(yy-40)*.04,yy-1),(192,208,204,82),.7)
    p.d.rounded((130,111,159,132),4,(44,65,72));p.d.rounded((136,115,153,126),2,(119,137,140))
    p.ink.line((135,114,152,114),(223,238,235,150),1)
    return p.finish()

def rope():
    p=Prop();r=random.Random(302)
    for j in range(5):
        cx=64+j*31;top=43+[2,-4,0,5,-2][j];bottom=209+[0,4,-2,2,-3][j]
        poly=[]
        for k in range(25):
            y=top+(bottom-top)*k/24;poly.append((cx-16+math.sin(k*.65+j)*2,y))
        for k in range(24,-1,-1):
            y=top+(bottom-top)*k/24;poly.append((cx+15+math.sin(k*.65+j)*2,y))
        p.gradient(poly,[(82,59,34),(171,132,76),(219,187,125),(174,137,82),(92,67,40)])
        for y in range(top+2,bottom-8,12):
            # Alternating rounded strands read as braid, not diagonal ladder rungs.
            for side in [-1,1]:
                curve=[(cx+side*(14-28*t/18),y+4+8*t/18+math.sin(t/18*math.pi)*2) for t in range(19)]
                p.ink.line(curve,(89,65,37,118),2.6)
                p.ink.line([(x,y-1.4) for x,y in curve],(248,222,166,108),1.0)
        for k in range(10):
            xx=cx+r.uniform(-12,12);yy=r.choice([top,bottom]);sign=-1 if yy==top else 1
            p.d.line([(xx,yy),(xx+r.uniform(-2,2),yy+sign*5),(xx+r.uniform(-5,5),yy+sign*r.uniform(7,13))],(193,164,108,220),.7)
    for y in [80,171]:
        p.gradient([(44,y),(207,y-4),(211,y+6),(47,y+12)],[(101,43,36),(164,75,57),(189,105,75),(108,48,36)],axis='y')
        p.ink.line((48,y+2,204,y-1),(241,170,113,130),1.2)
        p.ink.line((48,y+10,207,y+6),(67,35,25,140),1.4)
    p.d.ellipse((40,73,59,88),None,(138,69,48),3)
    return p.finish()

def wood():
    p=Prop();r=random.Random(303)
    poly=[(57,65),(63,52),(82,47),(174,48),(195,57),(203,72),(202,192),(193,213),(165,221),(88,219),(58,207),(51,185)]
    p.gradient(poly,[(66,41,26),(112,71,39),(164,111,64),(135,88,46),(78,50,29)])
    for j in range(27):
        x=55+j*5.6;start=r.uniform(65,94);length=r.uniform(100,151)
        curve=[(x+math.sin(t*.20+j*1.8)*3+math.sin(t*.08+j)*2,start+t*length/38) for t in range(39)]
        p.ink.line(curve,(46,31,20,r.randrange(60,140)),r.uniform(1.4,3.2))
        p.ink.line([(x-1.2,y) for x,y in curve],(224,169,104,r.randrange(45,104)),.9)
        for k in range(3):
            xx=x+r.uniform(-1,3);yy=r.uniform(92,204)
            p.ink.line([(xx,yy),(xx+3,yy+5),(xx+1,yy+13)],(61,39,24,95),1)
    p.d.ellipse((53,34,203,97),(83,52,29));p.d.ellipse((60,36,199,88),(198,148,91))
    # Off-center, irregular growth rings and radial drying cracks.
    for radius in [9,20,31,43,55,65]:
        ring=[]
        for k in range(97):
            a=k/96*math.tau;rad=radius*(1+.028*math.sin(a*5+radius))
            ring.append((126+math.cos(a)*rad,61+math.sin(a)*rad*.32))
        p.ink.line(ring,(115,75,38,150),1.1)
        p.ink.line([(x,y+.8) for x,y in ring],(242,200,138,100),.7)
    p.ink.line([(126,61),(142,65),(157,71),(174,74),(189,78)],(86,52,27,185),1.2)
    p.ink.arc((59,33,201,89),180,327,(244,204,143,150),1.8)
    p.ink.ellipse((83,126,104,167),None,(58,39,24,125),2)
    p.ink.ellipse((89,133,100,161),None,(188,132,76,155),1.5)
    p.ink.line([(61,205),(89,216),(165,218),(192,210)],(41,29,19,125),2.5)
    return p.finish()

def plastic():
    p=Prop()
    side=[(49,58),(69,42),(207,49),(213,198),(197,215),(54,207)]
    p.gradient(side,[(42,77,91),(86,125,139),(44,78,92)])
    front=[(52,59),(191,49),(203,61),(201,203),(190,213),(55,208),(47,195),(46,71)]
    p.gradient(front,[(97,143,156),(182,211,217),(218,234,234),(131,176,188)])
    inner=[(65,72),(181,65),(189,74),(187,191),(179,199),(65,195),(60,186),(60,80)]
    p.gradient(inner,[(91,139,153),(154,190,198),(195,218,220),(105,157,172)],axis='y')
    # Recessed molded cells and broad structural ribs with actual side bevels.
    for yy in [83,121,160]:
        p.d.rounded((74,yy,176,yy+25),4,(119,162,176))
        p.ink.line((77,yy+2,171,yy+2),(54,97,115,145),2)
        p.ink.line((77,yy+23,172,yy+23),(236,248,247,170),1.4)
    for x in [94,146]:
        p.d.polygon([(x,70),(x+9,69),(x+7,195),(x-2,195)],(175,206,211))
        p.ink.line((x,74,x-1,191),(244,252,248,190),1.7)
        p.ink.line((x+8,73,x+6,192),(50,98,116,135),1.5)
    p.ink.line([(52,64),(189,54),(196,63)],(243,252,250,205),2)
    p.ink.line([(51,198),(58,205),(190,209),(197,201)],(45,87,105,130),2)
    for x,y in [(58,71),(188,65),(58,196),(188,199)]:
        p.d.ellipse((x-4,y-4,x+4,y+4),(67,105,120));p.ink.arc((x-4,y-4,x+4,y+4),190,340,(242,251,247,180),1)
        p.ink.line((x-2,y,x+2,y),(208,230,230,170),.8)
    return p.finish()

def ice():
    p=Prop();r=random.Random(305)
    hull=[(62,50),(82,38),(178,37),(205,61),(211,175),(197,205),(180,219),(72,213),(47,189),(43,78)]
    p.gradient(hull,[(48,139,177),(104,195,218),(171,229,235),(66,164,197)],alpha=224)
    p.gradient([(62,50),(82,38),(178,37),(193,56),(167,77),(78,83)],[(199,242,245),(245,253,250),(147,219,231)],alpha=239)
    p.gradient([(193,56),(205,61),(211,175),(197,205),(173,191),(170,79)],[(92,178,206),(39,127,174),(112,196,217)],alpha=218)
    p.gradient([(59,79),(78,83),(167,77),(173,191),(157,207),(72,201),(51,184)],[(116,203,220),(199,240,240),(115,206,223)],axis='y',alpha=183)
    # Broad soft frost suspended inside a transparent mass, rather than flat triangles.
    frost=Image.new('RGBA',p.im.size);d=Pen(frost)
    for i in range(20):
        x=r.uniform(77,160);y=r.uniform(91,184);rr=r.uniform(4,14)
        d.ellipse((x-rr,y-rr*.7,x+rr,y+rr*.7),(238,254,252,r.randrange(12,40)))
    frost=frost.filter(ImageFilter.GaussianBlur(3*SS));p.im.alpha_composite(frost)
    for i in range(65):
        x=r.uniform(65,179);y=r.uniform(70,201);rr=r.uniform(.45,1.6)
        p.ink.ellipse((x-rr,y-rr,x+rr,y+rr),None,(244,255,252,r.randrange(55,145)),.6)
    for line in [[(70,57),(91,109),(129,137),(145,188)],[(129,137),(157,125),(171,95)],[(91,109),(77,150)],[(145,188),(164,201)]]:
        p.ink.line(line,(241,255,252,160),1.0)
        p.ink.line([(x+1.3,y) for x,y in line],(50,136,177,82),.8)
    p.ink.line([(63,51),(83,41),(176,40),(191,55)],(250,255,250,224),2.4)
    p.ink.line([(54,83),(58,179),(73,202),(156,208)],(226,254,250,171),1.7)
    p.ink.line([(169,80),(175,188),(195,204)],(33,121,166,119),1.7)
    p.ink.polygon([(63,84),(75,82),(113,186),(106,188)],(244,255,251,70))
    return p.finish()

def metal():
    p=Prop();r=random.Random(306)
    top=[(39,74),(169,49),(217,82),(88,107)]
    side=[(39,74),(88,107),(89,213),(40,184)]
    face=[(88,107),(217,82),(218,184),(89,213)]
    p.gradient(side,[(49,67,80),(100,123,135),(62,82,98)])
    p.gradient(face,[(91,115,135),(171,190,201),(199,212,217),(116,144,164),(72,98,120)])
    p.gradient(top,[(157,183,198),(226,238,241),(187,208,220)],axis='y')
    p.ink.line([(40,74),(169,49),(216,81)],(246,252,249,205),1.6)
    p.ink.line([(89,108),(216,84),(217,183)],(240,249,247,190),1.3)
    p.ink.line([(42,183),(89,212),(216,183)],(25,46,64,180),2)
    p.ink.line((91,113,92,207),(221,238,239,190),1.3)
    # A few controlled machining tracks, with most face left clean and reflective.
    for i in range(240):
        x=r.uniform(95,209);y=r.uniform(105-(x-88)*.18,208-(x-88)*.18);ln=r.uniform(3,20)
        c=(239,249,247,55) if i%3==0 else (30,58,80,35)
        p.ink.line((x,y,min(215,x+ln),y-ln*.18),c,.45)
    for i in range(9):
        p.ink.arc((112-i*3,116-i*.9,170+i*3,148+i*.9),20,167,(228,242,240,27),.65)
    for y in [146,169]:
        p.ink.line((55,y-13,78,y+1),(183,207,214,58),.7)
    p.ink.line([(147,56),(159,64),(173,63)],(255,255,248,75),1)
    return p.finish()

def make_prop(kind):
    return {'foam':foam,'rope':rope,'wood':wood,'plastic':plastic,'ice':ice,'metal':metal}[kind]()
