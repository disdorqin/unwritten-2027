"""Build the first reference-guided town asset with Blender, not image-to-3D.

Run: blender --background --factory-startup --python tools/build-town-assets.py
Optional: append -- --render to render an inspection image under artifacts/.
"""
import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
if not (ROOT / 'package.json').exists():
    ROOT = Path(__file__).resolve().parent
random.seed(27)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, rough=.65, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    return m


wood = material('Warm walnut timber', (.14, .055, .018))
trim = material('Honey wood edges', (.30, .13, .045))
plaster = material('Ivory lime plaster', (.68, .55, .39), .9)
slate = material('Grey blue roof tiles', (.22, .25, .29), .85)
snow = material('Soft roof snow', (.88, .94, .98), .94)
brass = material('Antique brass', (.56, .33, .095), .32, .65)
ink = material('Clock ink', (.045, .032, .023), .65)
ivory = material('Clock enamel', (.93, .82, .56), .5)
red = material('Muted vermilion', (.49, .065, .035), .72)
glass = material('Warm window panes', (.78, .48, .16), .35)
stones = [material('Stone %d' % i, (.36+i*.025, .35+i*.024, .33+i*.025), .95)
          for i in range(5)]


def finish(obj, mat, bevel=0, name=None):
    if name:
        obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Rounded handmade edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, p, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bevel, name)


def cylinder(name, p, radius, depth, mat, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                      depth=depth, location=p, rotation=rotation)
    return finish(bpy.context.object, mat, .012, name)


def beam(name, a, b, width, mat=wood, depth=None):
    av, bv = Vector(a), Vector(b)
    o = box(name, (av+bv)/2, (width, depth or width, (bv-av).length), mat, .015)
    o.rotation_euler = (bv-av).to_track_quat('Z', 'Y').to_euler()
    return o


def torus(name, center, radius, tube, mat, rotation=(math.pi/2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
        location=center, major_radius=radius, minor_radius=tube, rotation=rotation)
    return finish(bpy.context.object, mat, 0, name)


def window(name, x, y, z, w=.7, h=1.0):
    box(name+' pane', (x, y+.035, z), (w, .07, h), glass, .01)
    for dx in [-w/2, w/2]:
        box(name+' jamb', (x+dx, y, z), (.08, .12, h+.1), wood)
    for dz in [-h/2, h/2]:
        box(name+' rail', (x, y, z+dz), (w+.08, .12, .08), wood)
    for dx in [-w/4, 0, w/4]:
        box(name+' lattice', (x+dx, y-.02, z), (.035, .08, h), trim, .008)
    for dz in [-h/4, h/4]:
        box(name+' lattice', (x, y-.02, z+dz), (w, .08, .035), trim, .008)


# Low stone steps and the stone-clad base, with an actual entry gap.
for n in range(3):
    box('Entry step %d' % n, (0, -.05, .12+n*.22),
        (5.0-n*.32, 4.6-n*.32, .24), random.choice(stones), .055)
box('Lower floor', (0, 0, .73), (4.2, 3.8, .18), wood)
for row in range(5):
    z = .9 + row*.35
    for side in [-1, 1]:
        for k in range(5):
            box('Side masonry', (side*1.91, -1.35+k*.68, z),
                (.28, .64, .32), random.choice(stones), .045)
        for k in range(2):
            box('Entry masonry', (side*(1.05+k*.54), -1.77, z),
                (.50, .28, .32), random.choice(stones), .045)
    for k in range(6):
        box('Back masonry', (-1.58+k*.63, 1.75, z),
            (.59, .28, .32), random.choice(stones), .04)

# The lower facade is a hollow shell rather than a solid inaccessible cube.
for side in [-1, 1]:
    box('Plaster side wall', (side*1.82, 0, 4.13), (.16, 3.35, 3.05), plaster)
    box('Entry wall strip', (side*1.22, -1.68, 1.65), (1.08, .16, 1.9), plaster)
box('Back wall', (0, 1.65, 4.13), (3.6, .16, 3.05), plaster)
box('Front wall', (0, -1.65, 4.13), (3.6, .16, 3.05), plaster)
for x in [-1.82, 1.82]:
    for y in [-1.65, 1.65]:
        beam('Main timber post', (x,y,.78), (x,y,6.1), .22)
for z in [2.62, 5.72, 6.03]:
    for y in [-1.72, 1.72]:
        box('Horizontal tie', (0,y,z), (3.96,.22,.20), trim)
    for x in [-1.88, 1.88]:
        box('Side tie', (x,0,z), (.22,3.5,.20), wood)

# Separate pivoted door leaves.
for sign in [-1, 1]:
    pivot = bpy.data.objects.new('Door_'+('Left' if sign<0 else 'Right'), None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (sign*.65, -1.87, .86)
    bpy.context.view_layer.update()
    door = box('Door leaf', (sign*.33,-1.87,1.85), (.62,.13,1.98), wood)
    door.parent = pivot
    door.matrix_parent_inverse = pivot.matrix_world.inverted()
    for dz in [1.2, 2.48]:
        rail=box('Door cross rail', (sign*.33,-1.96,dz), (.54,.07,.1), trim)
        rail.parent=pivot
        rail.matrix_parent_inverse=pivot.matrix_world.inverted()
    knob=torus('Door knocker', (sign*.16,-1.99,1.64), .07,.015,brass)
    knob.parent=pivot
    knob.matrix_parent_inverse=pivot.matrix_world.inverted()
for x in [-.75,.75]:
    box('Door jamb',(x,-1.87,1.84),(.18,.22,2.25),trim)
box('Door lintel',(0,-1.87,3.0),(1.68,.24,.18),trim)
window('Front upper window', 0, -1.79, 3.8, .85, 1.1)
# Side windows and a small vermilion knot break up the close-up facade.
from mathutils import Matrix
before=set(bpy.context.scene.objects)
window('Side upper window', 0, -1.93, 4.0, .65, 1.1)
for ob in set(bpy.context.scene.objects)-before:
    ob.matrix_world=Matrix.Rotation(math.pi/2,4,'Z') @ ob.matrix_world
for offset in [-.11,.11]:
    p=[(0,-1.94,5.28),(.24,-1.94,5.04),(0,-1.94,4.80),(-.24,-1.94,5.04),(0,-1.94,5.28)]
    for a,b in zip(p,p[1:]):
        beam('Vermilion knot',(a[0]+offset,a[1],a[2]),(b[0]+offset,b[1],b[2]),.035,red)
for i in range(5):
    beam('Knot tassel',((i-2)*.045,-1.95,4.78),((i-2)*.045,-1.95,4.47),.02,red)


def balcony(z, half):
    box('Balcony deck', (0,0,z), (half*2, half*2,.16), wood, .045)
    for side in range(4):
        angle=side*math.pi/2
        def rot(x,y,zz):
            return (x*math.cos(angle)-y*math.sin(angle),
                    x*math.sin(angle)+y*math.cos(angle),zz)
        for k in range(7):
            x=-half+.12+k*(2*half-.24)/6
            beam('Balcony spindle',rot(x,-half+.09,z+.12),rot(x,-half+.09,z+.94),.07,trim)
        for h in [.35,.98]:
            beam('Balcony rail',rot(-half,-half+.09,z+h),rot(half,-half+.09,z+h),.105,trim)
        for x in [-half+.1,half-.1]:
            beam('Balcony corner post',rot(x,-half+.09,z),rot(x,-half+.09,z+1.03),.13,wood)
        for x in [-1.25,0,1.25]:
            beam('Balcony brace',rot(x,-1.5,z-.65),rot(x,-half+.05,z-.1),.13)


balcony(6.13,2.22)
# Clock chamber facade and structural timber.
for y in [-1.52,1.52]:
    box('Clock chamber plaster',(0,y,7.85),(3.15,.16,2.95),plaster)
for x in [-1.52,1.52]:
    box('Clock chamber plaster',(x,0,7.85),(.16,3.15,2.95),plaster)
for x in [-1.62,1.62]:
    for y in [-1.62,1.62]:
        beam('Upper frame post',(x,y,6.23),(x,y,9.52),.20)
for z in [6.45,9.32]:
    for y in [-1.64,1.64]:
        box('Upper frame tie',(0,y,z),(3.48,.20,.18),trim)
    for x in [-1.64,1.64]:
        box('Upper side tie',(x,0,z),(.20,3.48,.18),wood)

# One readable clock dial; both hands have correct center pivots.
center=(0,-1.77,7.87)
cylinder('Clock face', center,1.19,.09,ivory,64,(math.pi/2,0,0))
torus('Clock brass bezel',(0,-1.84,7.87),1.20,.055,brass)
roman=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI']
for n,label in enumerate(roman):
    angle=n*math.tau/12
    bpy.ops.object.text_add(location=(math.sin(angle)*.94,-1.84,7.87+math.cos(angle)*.94))
    o=bpy.context.object
    o.name='Dial numeral '+label
    o.data.body=label
    o.data.align_x='CENTER'
    o.data.align_y='CENTER'
    o.data.size=.17
    o.data.extrude=.004
    o.rotation_euler=(math.pi/2,0,0)
    o.data.materials.append(ink)
    bpy.ops.object.convert(target='MESH')


def hand(name,length,width,angle,y):
    verts=[(-width,-.015,-.12),(width,-.015,-.12),(width*.55,-.015,length*.8),
           (0,-.015,length),(-width*.55,-.015,length*.8)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],[(0,1,2,3,4)])
    o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    o.location=(0,y,7.87)
    o.rotation_euler.y=angle
    o.data.materials.append(ink)
    sol=o.modifiers.new('Hand thickness','SOLIDIFY')
    sol.thickness=.035
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=sol.name)
    return o


hour=hand('Clock_HourHand',.64,.055,-math.pi/6,-1.94)
minute=hand('Clock_MinuteHand',.91,.037,0,-1.99)
cylinder('Clock pin',(0,-2.025,7.87),.095,.06,brass,24,(math.pi/2,0,0))
balcony(9.55,1.99)
# Open bell pavilion, bell body and rafters.
for x in [-1.45,1.45]:
    for y in [-1.45,1.45]:
        beam('Pavilion post',(x,y,9.65),(x,y,11.65),.20)
        beam('Pavilion bracket',(x,y,11.0),(x*.72,y,11.57),.15,trim)
for y in [-1.5,1.5]:
    box('Pavilion lintel',(0,y,11.52),(3.3,.22,.24),trim)
for x in [-1.5,1.5]:
    box('Pavilion side lintel',(x,0,11.52),(.22,3.3,.24),wood)
beam('Bell hanging beam',(-1.4,0,11.32),(1.4,0,11.32),.24)
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.52, radius2=.26, depth=.70, location=(0,0,10.65))
bell=finish(bpy.context.object,brass,.025,'Bell_Body')
torus('Bell lip',(0,0,10.29),.51,.035,brass,(0,0,0))
cylinder('Bell suspension',(0,0,11.18),.075,.35,ink)


def roof_z(x,y):
    r=max(abs(x),abs(y))/2.62
    return 13.13-1.60*r+.30*r**6+.16*(abs(x*y)/2.62**2)**3


# Continuous curved roof shell, then individual overlapping tile strips.
for side in range(4):
    a=side*math.pi/2
    def roofpos(u,r):
        x,y=u*r*2.62,-r*2.62
        return Vector((x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a),roof_z(x,y)))
    verts=[]
    for r in [0,.2,.4,.6,.8,1]:
        for u in [-1,1]:
            verts.append(tuple(roofpos(u,r)))
    faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(5)]
    mesh=bpy.data.meshes.new('Curved roof panel')
    mesh.from_pydata(verts,[],faces)
    o=bpy.data.objects.new('Roof_Structure',mesh)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(slate)
    for row in range(9):
        r0=.14+row*.095
        r1=min(1.025,r0+.12)
        cols=max(3,int(27*r0))
        for k in range(cols):
            u=-1+(k+.5)*2/cols
            p0,p1=roofpos(u,r0),roofpos(u,r1)
            direction=(p1-p0).normalized()
            across=Vector((math.cos(a),math.sin(a),0))
            up=across.cross(direction).normalized()
            if up.z<0:
                up=-up
            width=2.62*r0/cols*.92
            vv=[]
            for p in [p0,p1]:
                for j in range(7):
                    t=j*math.pi/6
                    vv.append(tuple(p+across*(math.cos(t)*width)+up*(.035+math.sin(t)*.065)))
            ff=[(j,j+1,j+8,j+7) for j in range(6)]
            me=bpy.data.meshes.new('Tile')
            me.from_pydata(vv,[],ff)
            ob=bpy.data.objects.new('Roof_Tiles',me)
            bpy.context.collection.objects.link(ob)
            ob.data.materials.append(snow if row<3 else slate)
    p0,p1=roofpos(-1,1),roofpos(1,1)
    beam('Roof eave timber',p0-Vector((0,0,.12)),p1-Vector((0,0,.12)),.17,wood)
    beam('Snow eave rim',p0+Vector((0,0,.04)),p1+Vector((0,0,.04)),.09,snow)
    beam('Hip ridge',roofpos(-1,.06),roofpos(-1,1.025),.11,slate)
cylinder('Roof finial',(0,0,13.24),.12,.38,brass)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.17,location=(0,0,13.44))
finish(bpy.context.object,brass,0,'Roof finial orb')

# Consolidate static meshes by material to keep runtime draw calls controlled.
dynamic=[hour,minute,bell]
static=[o for o in list(bpy.context.scene.objects) if o.type=='MESH' and o not in dynamic and not o.parent]
groups={}
for obj in static:
    if obj.data.materials:
        groups.setdefault(obj.data.materials[0],[]).append(obj)
for mat, group in groups.items():
    if len(group)<2:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:
        o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join()
    group[0].name='Clocktower_'+mat.name.replace(' ','_')

for folder in ['public/models','assets-source/blender','artifacts']:
    (ROOT/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/blender/clocktower.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/clocktower.glb'),
    export_format='GLB',export_apply=True,export_extras=True,export_cameras=False,export_lights=False)
triangles=sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons)
print('CLOCKTOWER_BUILT',str(ROOT/'public/models/clocktower.glb'),'triangles',triangles)

if '--render' in sys.argv:
    world=bpy.context.scene.world
    world.color=(.13,.16,.21)
    box('Preview ground',(0,0,-.18),(200,200,.16),material('Preview snow',(.66,.74,.80)),0)
    for loc,power,size in [((5,-8,16),1900,8),((-6,-2,10),1300,6),((3,6,14),2000,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        light=bpy.context.object
        light.data.energy=power
        light.data.shape='DISK'
        light.data.size=size
        light.rotation_euler=(Vector((0,0,6))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(20,-28,17))
    cam=bpy.context.object
    cam.rotation_euler=(Vector((0,0,6.5))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO'
    cam.data.ortho_scale=16
    scene=bpy.context.scene
    scene.camera=cam
    scene.render.engine='CYCLES'
    scene.cycles.samples=96
    scene.cycles.use_denoising=False
    scene.render.resolution_x=1000
    scene.render.resolution_y=1200
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.render.filepath=str(ROOT/'artifacts/clocktower-render.png')
    bpy.ops.render.render(write_still=True)
