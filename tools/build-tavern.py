"""Reference-guided tavern asset. Metres, game Y up, front faces +Z.
blender -b --factory-startup --python tools/build-tavern.py -- --render
Static meshes batch by material. Lamps are reproduced by the game renderer.
"""
import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
random.seed(2027)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def vec(p): return Vector((p[0], -p[2], p[1]))

def material(name, color, rough=.7, metal=0, emission=0, grain=False):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    if grain:
        # Packed UV texture also survives GLB export; no render-only shader trick.
        image = bpy.data.images.new(name+' grain', width=128, height=256)
        pixels = []
        for y in range(256):
            for x in range(128):
                v = .83+.09*math.sin(x*.55+math.sin(y*.045)*1.6)+.05*random.random()
                if grain == 'plaster': v=.91+.035*math.sin(x*.22)*math.sin(y*.13)+.05*random.random()
                elif (x+int(math.sin(y*.018)*3))%23 == 0: v -= .09
                pixels.extend([min(1,c*v) for c in color]+[1])
        image.pixels.foreach_set(pixels)
        image.pack()
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        m.node_tree.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
    return m

wood = material('Tavern walnut', (.23, .105, .042), grain=True)
edge = material('Tavern honey wood', (.44, .245, .10), grain=True)
plaster = material('Warm lime plaster', (.72, .64, .49), .95, grain='plaster')
stone = material('Foundation stone', (.30, .34, .36), .95)
stone2 = material('Alternate stone', (.36, .38, .37), .95)
slate = material('Blue grey roof tiles', (.12, .18, .23), .8)
snow = material('Snow', (.88, .94, .98), .95)
red = material('Vermilion cloth', (.42, .035, .022), .93)
red2 = material('Cushion woven red', (.36, .10, .06), .95)
brass = material('Warm brass', (.62, .36, .10), .38, .65)
ceramic = material('Cream glazed ceramic', (.75, .66, .49), .26)
jar_mat = material('Dark glazed wine jars', (.19, .075, .025), .3)
paper = material('Paper lantern glow', (1, .53, .16), .6, emission=1.7)
pane = material('Amber window panes', (.8, .45, .14), .5, emission=.25)
book = material('Muted blue book covers', (.08, .19, .23), .9)
linen = material('Linen cushions and pages', (.65, .55, .37), .95)

def box(name, p, s, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=vec(p))
    o = bpy.context.object
    o.name = name
    o.dimensions = (s[0], s[2], s[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Hand finished edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def beam(name, a, b, width, mat=wood):
    av,bv=vec(a),vec(b)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(av+bv)/2)
    o=bpy.context.object
    o.name=name
    o.dimensions=(width,width,(bv-av).length)
    o.rotation_euler=(bv-av).to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    return o

def lathe(name, p, profile, mat, sides=20):
    verts=[]; faces=[]
    for h,r in profile:
        for i in range(sides):
            a=i*2*math.pi/sides
            verts.append(tuple(vec((r*math.cos(a),h,r*math.sin(a)))))
    for row in range(len(profile)-1):
        for i in range(sides):
            a=row*sides+i; b=row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces); mesh.materials.append(mat)
    o=bpy.data.objects.new(name,mesh); o.location=vec(p); bpy.context.collection.objects.link(o)
    for poly in mesh.polygons: poly.use_smooth=True
    return o

def jar(p, scale=1):
    lathe('Wine jar',p,[(h*scale,r*scale) for h,r in [(0,.13),(.04,.22),(.18,.29),(.42,.28),(.56,.18),(.60,.15)]],jar_mat)
    lathe('Red tied jar cap',(p[0],p[1]+.6*scale,p[2]),[(0,.17*scale),(.04*scale,.22*scale),(.09*scale,.17*scale)],red)

def cup(p):
    lathe('Hollow teacup',p,[(0,.045),(.015,.07),(.11,.09),(.12,.085),(.025,.056),(.025,.0)],ceramic,16)

def table(x,z,y=.12,low=False):
    height=.48 if low else .83
    for dx in [-.85,.85]:
        for dz in [-.43,.43]: box('Table leg',(x+dx,y+height/2,z+dz),(.13,height,.13),wood)
    box('Table apron',(x,y+height-.15,z),(1.95,.22,.98),wood)
    box('Table top',(x,y+height,z),(2.15,.12,1.15),edge,.045)
    box('Woven table runner',(x,y+height+.066,z),(.42,.013,1.09),red2,.006)
    box('Serving tray',(x+.13,y+height+.09,z),(.58,.035,.38),wood,.02)
    for dx in [-.12,.16]: cup((x+dx,y+height+.12,z+.04))
    lathe('Tea pot',(x+.3,y+height+.12,z-.13),[(0,.08),(.1,.14),(.23,.09),(.25,.10),(.28,.0)],ceramic,16)
    for side in [-1,1]:
        if low:
            box('Floor cushion',(x,y+.09,z+side*.95),(.8,.16,.55),linen,.07)
            continue
        for dx in [-.8,.8]: box('Bench leg',(x+dx,y+.22,z+side*.95),(.13,.44,.26),wood)
        box('Bench seat',(x,y+.48,z+side*.95),(2,.13,.4),edge,.04)
        for dx in [-.48,.48]: box('Bench cushion',(x+dx,y+.57,z+side*.95),(.83,.12,.38),red2,.045)

def lantern(p,red_paper=False):
    x,y,z=p
    box('Lantern luminous body',p,(.36,.52,.36),red if red_paper else paper,.075)
    if red_paper: box('Lantern inner warm panel',(x,y,z+.19),(.24,.36,.015),paper,.015)
    for dy in [-.28,.28]: box('Lantern cap',(x,y+dy,z),(.45,.065,.45),brass,.02)
    for dx in [-.19,.19]:
        for dz in [-.19,.19]: box('Lantern corner rib',(x+dx,y,z+dz),(.035,.55,.035),wood,.007)
    beam('Lantern hanging chain',(x,y+.3,z),(x,y+.75,z),.025,brass)
    if red_paper: beam('Lantern tassel',(x,y-.32,z),(x,y-.65,z),.045,red)

def window_front(x,y,z,width=2.1,height=1.65):
    box('Window warm pane',(x,y,z),(width,height,.035),pane,.005)
    for dx in [-width/2,-width/4,0,width/4,width/2]:
        box('Lattice upright',(x+dx,y,z+.035),(.055,height+.16,.075),edge,.008)
    for dy in [-height/2,-height/4,0,height/4,height/2]:
        box('Lattice crossbar',(x,y+dy,z+.04),(width+.16,.055,.075),edge,.008)
    box('Window sill',(x,y-height/2-.08,z+.08),(width+.3,.13,.28),wood)
    for dx,dy in [(-.14,0),(.14,0),(0,-.14),(0,.14)]:
        bpy.ops.mesh.primitive_torus_add(major_radius=.18,minor_radius=.025,major_segments=16,minor_segments=6,
            location=vec((x+dx,y+dy,z+.1)),rotation=(math.pi/2,0,0))
        bpy.context.object.name='Lattice flower medallion'
        bpy.context.object.data.materials.append(wood)
    for dx in [-width/2-.10,width/2+.10]: box('Window outer jamb',(x+dx,y,z+.05),(.13,height+.32,.14),wood)

# Structural shell, doorway, timber frame and usable upper floor.
box('Main floor',(0,.05,0),(11,.1,9),wood)
for x in [-5.5,5.5]: box('Side wall',(x,3.45,0),(.18,6.9,9),plaster)
box('Rear wall',(0,3.45,-4.5),(11,6.9,.18),plaster)
for x in [-3.35,3.35]:
    box('Front lower wall',(x,1.8,4.5),(4.3,3.6,.18),plaster)
    box('Front upper wall',(x,5.25,4.5),(4.3,3.25,.18),plaster)
box('Lower doorway lintel',(0,3.2,4.5),(2.4,.8,.2),wood)
box('Upper doorway lintel',(0,6.6,4.5),(2.4,.6,.2),wood)
for floor in [0,3.55]:
    for n in range(27):
        x=-5.2+n*.4
        # Upper floor hole over staircase on right.
        depth=8.65 if x<3.4 or floor==0 else 1.2
        z=0 if depth>2 else -3.8
        box('Wood floorboards',(x,floor+.115,z),(.385,.025,depth),edge if n%5 else wood,.005)
box('Upper main floor',(-1.05,3.55,0),(8.9,.2,9),wood)
box('Upper rear landing',(4.45,3.55,-3.6),(2.1,.2,1.8),wood)
box('Upper front landing',(4.45,3.55,3.6),(2.1,.2,1.8),wood)
box('Front balcony floor',(0,3.55,5.25),(11.4,.2,1.5),edge)
for y in [.35,3.45,6.8]:
    if y == .35:
        for x in [-3.4,3.4]: box('Front sill',(x,y,4.62),(4.1,.20,.20),wood)
    else:
        box('Front beam',(0,y,4.62),(11.4,.20,.20),wood)
    box('Rear beam',(0,y,-4.42),(11.2,.20,.20),wood)
for x in [-5.42,-1.3,1.3,5.42]:
    box('Front post',(x,3.45,4.64),(.23,6.9,.26),wood)
    for y in [.6,3.4,6.6]: box('Column collar',(x,y,4.64),(.34,.13,.35),edge)
    for y in [3.05,6.4]:
        for dx in [-.5,.5]: beam('Diagonal bracket',(x,y-.35,4.65),(x+dx,y+.15,4.65),.14,wood)
for x in [-5.42,5.42]:
    for z in [-4.4,-1.5,1.5]: box('Side timber post',(x,3.45,z),(.25,6.9,.22),wood)
    for y in [.35,3.45,6.8]: box('Side beam',(x,y,0),(.24,.2,9),wood)
for x in [-3.45,3.45]:
    for y in [1.85,5.3]: window_front(x,y,4.63,2.75,1.75)
for x in [-5.6,5.6]:
    for y in [1.85,5.3]:
        box('Side window frame',(x,y,0),(.16,1.9,2.5),wood)
        box('Side amber glazing',(x+(.09 if x>0 else -.09),y,0),(.04,1.65,2.25),pane)
        for z in [-1.12,-.56,0,.56,1.12]: box('Side lattice',(x+(.12 if x>0 else -.12),y,z),(.055,1.8,.055),edge,.008)

# Individually shaped stones on the low foundation and shallow porch steps.
for row in range(2):
    for n in range(18):
        x=-5.25+n*.62+(row%2)*.12
        if abs(x)<1.35: continue
        box('Foundation stone',(x,.18+row*.27,4.65),(.58,.25,.25),stone if (n+row)%3 else stone2,.045)
for n in range(2): box('Entrance step',(0,.05+n*.08,4.88-n*.22),(2.7,.1,.46),stone2,.025)

# Balcony rails, modelled as a continuous safe boundary.
for x in [-5.5,-3.7,-1.85,0,1.85,3.7,5.5]:
    box('Balcony post',(x,4.1,5.94),(.13,1.1,.13),wood)
    box('Post snow cap',(x,4.68,5.94),(.21,.09,.21),snow)
box('Balcony handrail',(0,4.61,5.94),(11.2,.13,.17),edge)
box('Snow on handrail',(0,4.71,5.94),(11.2,.08,.18),snow)
box('Balcony lower rail',(0,3.85,5.94),(11.2,.09,.12),wood)
for x in [-5.5,5.5]:
    box('Balcony side rail',(x,4.61,5.25),(.14,.14,1.5),edge)
for n in range(36): box('Balcony baluster',(-5.25+n*.3,4.22,5.94),(.055,.7,.055),wood,.008)

# A physically continuous staircase, upper opening and landing railing.
for n in range(18):
    h=.05+(n+1)*.2; z=2.35-n*.30
    box('Stair tread',(4.4,h/2,z),(1.6,h,.30),edge,.012)
for x in [3.55,5.18]:
    for n in [0,6,12,17]:
        h=.05+(n+1)*.2; z=2.35-n*.30
        box('Stair newel',(x,h+.45,z),(.10,.9,.10),wood)
    beam('Stair handrail',(x,1.17,2.5),(x,4.55,-2.85),.10,edge)
box('Upper stair opening rail',(3.45,4.6,-.15),(.12,.12,5.8),wood)
box('Upper stair lower rail',(3.45,3.78,-.15),(.10,.10,5.8),wood)
for n in range(15): box('Upper stair baluster',(3.45,4.05,-2.8+n*.36),(.06,.78,.06),edge,.008)

# Main room bar, shelving and believable serving objects.
box('Bar counter body',(0,.65,-3.0),(5.5,1.1,.7),wood)
box('Bar polished top',(0,1.24,-3.0),(5.7,.14,.9),edge,.05)
for x in [-1.9,0,1.9]:
    box('Bar panel',(x,.68,-2.635),(1.7,.74,.05),edge)
    box('Bar panel inset',(x,.68,-2.60),(1.50,.59,.025),wood,.01)
for z in [-2.56,-3.45]: beam('Bar brass edge',(-2.83,1.3,z),(2.83,1.3,z),.035,brass)
box('Bar shelf backing',(0,1.85,-4.27),(5.6,2.65,.13),wood)
for y in [.25,1.05,1.9,2.75,3.1]: box('Bar shelf',(0,y,-4.02),(5.8,.1,.55),edge)
for x in [-2.8,-.95,.95,2.8]: box('Shelf upright',(x,1.66,-4.02),(.12,2.9,.55),wood)
for x in [-2,-1.0,0,1,2]: jar((x,2.80,-4.0),.76)
for x in [-2.25,-1.55,-.4,.4,1.55,2.25]: jar((x,1.95,-4.0),.70)
for x in [-2.2,-1.5,-.8,0,.7,1.4,2.1]:
    for n in range(2): cup((x,1.11+n*.11,-3.96))
for x in [-1.1,1.1]:
    box('Bar stool leg',(x,.4,-1.95),(.14,.65,.14),wood)
    box('Bar stool seat',(x,.77,-1.95),(.48,.12,.42),edge,.055)
for x in [-.5,-.18,.15]: cup((x,1.33,-2.96))
jar((-2.1,1.33,-3.0),.55)
box('Serving cloth',(.9,1.32,-3.0),(.38,.015,.72),linen,.005)

# Seating leaves the central aisle and access to the stair open.
for x in [-2.25,2.25]: table(x,1.0)
for x in [-2.5,1.1]: table(x,1.2,3.67,True)
box('Upper bookcase',(-5.1,4.65,-1.8),(.45,1.9,2.4),wood)
for y in [4.0,4.55,5.1]:
    box('Book shelf',(-4.82,y,-1.8),(.16,.07,2.25),edge)
    for n in range(8): box('Book spine',(-4.7,y+.19,-2.8+n*.27),(.23,.32+random.random()*.12,.15),book if n%3 else linen,.008)
box('Balcony bench',(2.9,4.1,5.1),(2.5,.18,.55),edge)
for x in [1.9,3.9]: box('Balcony bench leg',(x,3.86,5.1),(.13,.45,.4),wood)

# Small performance platform: enough room to stand, and restrained stage dressing.
box('Performance platform',(-3.8,.25,-2.3),(2.9,.40,2.2),edge)
box('Stage step',(-3.8,.1,-.98),(2.9,.2,.44),wood)
box('Stage backdrop',(-3.8,1.9,-3.7),(2.9,2.7,.12),plaster)
for x in [-5.15,-2.45]:
    for n in range(4): box('Curtain fold',(x+n*.065,1.95,-3.57),(.10,2.65,.14),red,.035)
box('Curtain header',(-3.8,3.2,-3.5),(2.95,.30,.20),red,.05)
box('Guqin table',(-3.8,.98,-2.65),(1.7,.10,.45),wood)
for x in [-4.45,-3.15]: box('Guqin table leg',(x,.70,-2.65),(.1,.55,.36),edge)
box('Guqin body',(-3.8,1.07,-2.65),(1.48,.08,.25),jar_mat,.04)
for n in range(7): beam('Guqin string',(-4.5,1.12,-2.75+n*.029),(-3.1,1.12,-2.75+n*.029),.004,brass)

# Architectural roof meshes and real half-round tiles; few draw batches.
roof_verts={}; roof_faces={}
def patch(name,verts,faces,mat):
    vs=roof_verts.setdefault(mat,[]); fs=roof_faces.setdefault(mat,[]); start=len(vs)
    vs.extend([tuple(vec(v)) for v in verts]); fs.extend([tuple(start+i for i in f) for f in faces])
def roof_y(r): return 8.95-2.18*r+.26*r**5
for side in [-1,1]:
    for row in range(13):
        r0=row/13; r1=(row+1.12)/13
        z0=side*5.4*r0; z1=side*5.4*r1
        patch('Roof deck',[(-6,roof_y(r0)-.07,z0),(6,roof_y(r0)-.07,z0),(6,roof_y(r1)-.07,z1),(-6,roof_y(r1)-.07,z1)],[(0,1,2,3)],slate)
        for col in range(34):
            xc=-5.85+col*.35
            verts=[]
            for r,z in [(r0,z0),(r1,z1)]:
                for k in range(7):
                    a=k*math.pi/6
                    verts.append((xc+math.cos(a)*.17,roof_y(r)+math.sin(a)*.075,z))
            patch('Roof tile',verts,[(k,k+1,k+8,k+7) for k in range(6)],snow if row<2 or (row>10 and col%7<4) else slate)
    beam('Eave edge',(-6,roof_y(1)-.1,side*5.4),(6,roof_y(1)-.1,side*5.4),.19,wood)
    beam('Snow eave',(-6,roof_y(1)+.06,side*5.4),(6,roof_y(1)+.06,side*5.4),.1,snow)
# Porch canopy below the balcony, independently tiled and snow-capped.
for row in range(5):
    r0=row/5; r1=(row+1.12)/5
    z0=4.65+r0*1.85;z1=4.65+r1*1.85
    y0=3.62-r0*.46+.08*r0**4;y1=3.62-r1*.46+.08*r1**4
    for col in range(34):
        xc=-5.85+col*.35;verts=[]
        for y,z in [(y0,z0),(y1,z1)]:
            for k in range(7):
                a=k*math.pi/6;verts.append((xc+math.cos(a)*.17,y+math.sin(a)*.07,z))
        patch('Porch tile',verts,[(k,k+1,k+8,k+7) for k in range(6)],snow if row==0 or (row==4 and col%6<4) else slate)
beam('Porch carved fascia',(-6.0,3.1,6.5),(6.0,3.1,6.5),.18,wood)
for x in [-5.4,-3,3,5.4]: beam('Porch bracket',(x,2.9,5.6),(x,3.45,4.8),.15,edge)
for mat,verts in roof_verts.items():
    mesh=bpy.data.meshes.new('Tiled roof'); mesh.from_pydata(verts,[],roof_faces[mat]); mesh.materials.append(mat)
    bpy.context.collection.objects.link(bpy.data.objects.new('Tavern roof '+mat.name,mesh))
beam('Roof ridge',(-6.2,8.99,0),(6.2,8.99,0),.19,slate)
beam('Ridge snow',(-6.25,9.1,0),(6.25,9.1,0),.14,snow)
for x in [-5.5,5.5]:
    mesh=bpy.data.meshes.new('Gable plaster panel')
    mesh.from_pydata([tuple(vec(p)) for p in [(x,6.88,-4.5),(x,6.88,4.5),(x,8.90,0)]],[],[(0,1,2)])
    mesh.materials.append(plaster)
    bpy.context.collection.objects.link(bpy.data.objects.new('Gable plaster infill',mesh))
    for s in [-1,1]: beam('Gable rafter',(x,6.95,s*4.5),(x,8.95,0),.17,wood)
    for z in [-3,-1.5,0,1.5,3]: box('Gable upright',(x,7.45,z),(.15,.9,.15),wood)
for x in [-4.8,-2.4,0,2.4,4.8]:
    box('Ceiling beam',(x,6.8,0),(.18,.22,9),wood)
    box('Ground ceiling joist',(x,3.35,0),(.16,.24,8.8),edge)
for z in [-3.2,0,3.2]: box('Ground ceiling crossbeam',(0,3.3,z),(10.8,.27,.19),wood)

# Small physical decorations: a plum-branch stage backdrop and framed wall menu.
for a,b in [((-4.9,1.0,-3.6),(-3.25,2.85,-3.6)),((-4.45,1.5,-3.6),(-4.75,2.5,-3.6)),((-3.85,2.2,-3.6),(-2.7,2.5,-3.6))]:
    beam('Stage plum branch',a,b,.035,wood)
    av,bv=Vector(a),Vector(b)
    for n in range(7):
        p=av.lerp(bv,(n+1)/8)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.055,location=vec(p))
        bpy.context.object.name='Stage plum blossom';bpy.context.object.data.materials.append(red2)
box('Menu wooden frame',(2.9,2.0,-4.25),(.48,1.2,.12),edge)
box('Menu paper',(2.9,2.0,-4.16),(.36,1.05,.025),linen,.004)
for n in range(6): box('Menu ink line',(2.9,2.35-n*.13,-4.14),(.22,.018,.008),wood,.002)

# Facade sign, lanterns, firewood rack and everyday jars.
box('Sign carved frame',(0,2.78,6.52),(3.8,.64,.17),edge,.05)
box('Sign dark face',(0,2.78,6.62),(3.56,.48,.045),wood,.02)
font_path='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
if Path(font_path).exists():
    bpy.ops.object.text_add(location=vec((0,2.57,6.65)),rotation=(math.pi/2,0,0))
    o=bpy.context.object; o.name='Tavern name'; o.data.body='雪夜酒馆'; o.data.align_x='CENTER'; o.data.size=.70
    o.data.font=bpy.data.fonts.load(font_path); o.data.extrude=.004; o.data.materials.append(brass)
    bpy.ops.object.convert(target='MESH')
for x in [-2.5,2.5]: lantern((x,2.5,6.32),True)
for x in [-1.30,1.30]:
    box('Open door solid lower panel',(x,.68,5.18),(.12,1.05,1.0),wood)
    for z in [4.7,5.2,5.68]: box('Open door lattice stile',(x,1.92,z),(.12,1.46,.055),edge,.008)
    for y in [1.22,1.60,1.98,2.36,2.66]: box('Open door lattice crossbar',(x,y,5.18),(.12,.055,1.0),edge,.008)
    box('Red couplet paper',(x*1.14,1.7,4.83),(.13,1.6,.025),red,.003)
for x,z in [(-1.4,1.5),(1.4,-1.3),(-3.9,-1.0)]: lantern((x,2.9,z))
for x,z in [(-2.6,1.0),(1.8,-.7)]: lantern((x,6.1,z))
for x in [-5.25,5.25]:
    box('Porch support',(x,1.75,5.7),(.2,3.5,.2),wood)
for row in range(4):
    for col in range(5):
        x=-5.0+col*.29; y=.32+row*.26
        lathe('Cut firewood log',(x,y,5.05),[(0,.12),(.72,.12)],edge,12).rotation_euler.x=math.pi/2
for x in [-5.1,-3.6]: box('Firewood rack post',(x,.8,5.0),(.11,1.5,.11),wood)
for x in [-4.6,-3.95]: jar((x,.1,5.65),1.0)

# Consolidate static geometry by material, leaving the asset as a manageable GLB.
groups={}
for o in list(bpy.context.scene.objects):
    if o.type=='MESH' and o.data.materials: groups.setdefault(o.data.materials[0].name,[]).append(o)
for name,group in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    if len(group)>1:bpy.ops.object.join()
    group[0].name='Tavern_'+name.replace(' ','_')
for f in ['public/models','assets-source/blender','artifacts']:(ROOT/f).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/blender/tavern.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/tavern.glb'),export_format='GLB',export_cameras=False,export_lights=False)
print('TAVERN_BUILT',len(groups),'material batches',flush=True)

if '--render' in sys.argv or '--render-exterior' in sys.argv:
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=80; scene.cycles.use_denoising=False
    scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=94
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.31,.46,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.32
    box('Preview snow ground',(0,-.15,0),(200,.12,200),snow,0)
    def area(p,target,power,color,size):
        bpy.ops.object.light_add(type='AREA',location=vec(p));o=bpy.context.object
        o.data.energy=power;o.data.color=color;o.data.size=size
        o.rotation_euler=(vec(target)-o.location).to_track_quat('-Z','Y').to_euler()
    area((-9,14,7),(0,3,0),1800,(.65,.78,1),8)
    area((7,9,12),(0,3,0),2200,(1,.73,.43),7)
    area((0,3.2,1),(0,.5,-1),500,(1,.71,.42),5)
    area((0,6.4,0),(0,4.1,0),350,(1,.71,.42),4)
    area((0,2.4,5.8),(0,1.6,-2),450,(1,.78,.5),3)
    bpy.ops.object.camera_add(location=vec((14,11,20)))
    cam=bpy.context.object;scene.camera=cam
    def render(name,p,target,lens=28,ortho=None):
        cam.location=vec(p);cam.rotation_euler=(vec(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=lens
        if ortho:cam.data.ortho_scale=ortho
        scene.render.filepath=str(ROOT/'artifacts'/name);bpy.ops.render.render(write_still=True)
    render('tavern-exterior.jpg',(14,6,22),(0,4,.3),ortho=18)
    if '--render' in sys.argv:
        render('tavern-hall.jpg',(.1,1.75,4.0),(0,1.7,-2.5),lens=18)
        render('tavern-upper.jpg',(-3.5,5.2,-2.5),(.7,4.7,4.7),lens=22)
