"""Blender postal building; matches shared/town.ts collision in metres.
Run: blender -b --factory-startup --python tools/build-post-office.py
Append -- --render for an inspection render. This is scripted modelling.
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .8
    return m

wood = material('Walnut timber', (.19, .09, .035))
trim = material('Honey edges', (.38, .22, .10))
wall = material('Warm plaster', (.65, .54, .39))
tile = material('Grey slate', (.13, .18, .22))
snow = material('Snow caps', (.86, .92, .97))
red = material('Vermilion postbox', (.46, .055, .025))
gold = material('Brass trim', (.65, .42, .14))
pane = material('Warm panes', (.65, .36, .10))
paper = material('Letter paper', (.84, .76, .57))
ink = material('Ink and slot shadows', (.035, .025, .02))

# Blender X,Y,Z maps to glTF X,Z,-Y. Front of building faces positive game Z.
def box(name, p, size, mat, bevel=.025):
    x, y, z = p
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    o = bpy.context.object
    o.name = name
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

# Shell leaves the original two-metre doorway open; furniture matches collider.
box('Floor', (0, .05, 0), (8, .1, 7), trim)
for x in [-4, 4]:
    box('Side wall', (x, 1.8, 0), (.2, 3.6, 7), wall)
box('Back wall', (0, 1.8, -3.5), (8, 3.6, .2), wall)
for x in [-2.5, 2.5]:
    box('Front wall', (x, 1.8, 3.5), (3, 3.6, .2), wall)
box('Door lintel', (0, 3.2, 3.5), (2, .8, .2), wood)
box('Ceiling', (0, 3.7, 0), (8.5, .2, 7.5), wood)
box('Writing desk', (0, .65, -1), (3, 1.3, 1.1), wood)
box('Desk top', (0, 1.31, -1), (3.1, .08, 1.2), trim)
for x in [-.99, 0, .99]:
    box('Drawer panel', (x, .97, -.43), (.88, .37, .06), trim)
    box('Drawer handle', (x, 1.01, -.37), (.20, .045, .055), gold, .012)
box('Writing blotter', (-.38, 1.365, -.95), (1.15, .018, .72), red, .008)
for n in range(4):
    sheet = box('Writing paper', (-.38+n*.005, 1.382+n*.006, -.95), (.62, .006, .45), paper, 0)
    sheet.rotation_euler.z = .07
box('Ink bottle', (.5, 1.46, -1.16), (.12, .18, .12), ink)
pen = box('Brush pen', (.63, 1.41, -.87), (.035, .035, .50), wood, .008)
pen.rotation_euler.z = -.35
for n in range(5):
    box('Stacked envelopes', (1.1, 1.39+n*.018, -1.15), (.36, .015, .23), paper, .004)

# Decorative interior stays against walls and out of the entry/desk approach.
for n in range(20):
    x = -3.8+n*.40
    box('Floorboard', (x, .112, 0), (.385, .018, 6.8), trim if n%4 else wood, .005)
for x in [-3.1, -1.6, 1.6, 3.1]:
    box('Ceiling joist', (x, 3.42, 0), (.13, .18, 6.8), wood)
box('Sorting cabinet back', (2.2, 1.1, -3.28), (2, 2.2, .12), wood)
for y in [.12, .62, 1.12, 1.62, 2.12]:
    box('Letter sorting shelf', (2.2, y, -3.05), (2.05, .065, .48), trim)
for x in [1.2, 1.86, 2.53, 3.2]:
    box('Letter sorting divider', (x, 1.12, -3.05), (.065, 2.1, .48), wood)
for row in range(4):
    for col in range(3):
        if (row+col)%3 == 0:
            continue
        for n in range(3):
            box('Sorted mail', (1.52+col*.67, .19+row*.5+n*.026, -2.99), (.37, .021, .25), paper, .003)
for x, h in [(-3.2, .38), (-2.55, .5)]:
    box('Postal parcel', (x, h/2+.12, -3), (.55, h, .48), paper)
    box('Parcel ribbon', (x, h+.125, -3), (.055, .012, .49), red, .002)
box('Noticeboard frame', (-2.5, 2.05, -3.34), (1.8, 1.2, .12), wood)
box('Noticeboard cork', (-2.5, 2.05, -3.26), (1.62, 1.02, .04), trim)
for x, y in [(-2.9, 2.2), (-2.35, 2.1), (-2.6, 1.8)]:
    box('Pinned notice', (x, y, -3.225), (.35, .32, .012), paper, .004)
    box('Notice pin', (x, y+.13, -3.21), (.035, .035, .02), red, .009)
for x in [-2.8, 2.8]:
    box('Pendant stem', (x, 3.15, -.5), (.055, .5, .055), wood)
    box('Pendant warm shade', (x, 2.86, -.5), (.43, .38, .43), pane, .06)
    for dx in [-.23, .23]:
        box('Pendant frame', (x+dx, 2.86, -.5), (.04, .44, .47), wood, .008)
for x in [-3.85, -1.12, 1.12, 3.85]:
    box('Front column', (x, 1.8, 3.53), (.18, 3.6, .20), wood)
for x in [-3.85, 3.85]:
    box('Rear column', (x, 1.8, -3.35), (.20, 3.6, .20), wood)
for y in [2.9, 3.45]:
    box('Front horizontal timber', (0, y, 3.61), (8, .14, .12), wood)
# Do not put a horizontal sill across the doorway.
for x in [-2.5, 2.5]:
    box('Wall sill', (x, .3, 3.61), (3, .14, .12), wood)
for x in [-2.55, 2.55]:
    box('Window backing', (x, 1.95, 3.64), (1.75, 1.35, .06), pane)
    for dx in [-.92, -.46, 0, .46, .92]:
        box('Lattice upright', (x+dx, 1.95, 3.70), (.055, 1.47, .07), wood, .009)
    for y in [1.22, 1.70, 2.19, 2.68]:
        box('Lattice rail', (x, y, 3.70), (1.9, .055, .07), wood, .009)
    box('Snow window sill', (x, 1.19, 3.75), (2.05, .12, .28), snow)

# Gable roof: individual tiles share one material batch after consolidation.
roof_angle = math.atan2(1.65, 4.15)
for side in [-1, 1]:
    slope = box('Roof slope', (0, 4.52, side*2.02), (9.1, .19, 4.48), tile)
    slope.rotation_euler.x = side*roof_angle
    for row in range(9):
        distance = .25 + row*.48
        z = side*distance
        y = 5.55 - distance*math.tan(roof_angle)
        for col in range(22):
            x = -4.4 + col*.42
            t = box('Roof tile', (x, y, z), (.39, .08, .55), snow if row < 4 else tile, .018)
            t.rotation_euler.x = side*roof_angle
    box('Eave beam', (0, 3.73, side*4.24), (9.35, .21, .23), wood)
    box('Snow eave edge', (0, 3.88, side*4.24), (9.4, .12, .30), snow)
box('Snow ridge', (0, 5.45, 0), (9.35, .20, .24), snow)
for x in [-4.6, 4.6]:
    box('Ridge end', (x, 5.5, 0), (.16, .28, .30), tile)
for x in [-3.5, -2, 2, 3.5]:
    box('Rafter', (x, 3.45, 0), (.13, .22, 7.2), trim)
box('Postbox body', (3, .85, 4), (.65, 1.35, .65), red, .08)
box('Postbox snow cap', (3, 1.57, 4), (.75, .14, .75), snow, .06)
box('Post slot', (3, 1.19, 4.34), (.40, .075, .02), wood, .008)
box('Postbox brass plate', (3, .88, 4.34), (.30, .22, .02), gold)

groups = {}
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH':
        groups.setdefault(o.data.materials[0].name, []).append(o)
for name, group in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:
        o.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    group[0].name = 'PostOffice_' + name.replace(' ', '_')
for folder in ['public/models', 'assets-source/blender', 'artifacts']:
    (ROOT/folder).mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/blender/post-office.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/post-office.glb'), export_format='GLB', export_cameras=False, export_lights=False)
print('POST_OFFICE_BUILT', len(groups), 'material batches')

if '--render' in sys.argv:
    box('Preview ground', (0, -.12, 0), (200, .1, 200), snow, 0)
    for loc, power in [((4, -6, 11), 1800), ((-6, -2, 8), 1100), ((0, 7, 10), 1800)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.data.energy = power
        light.data.size = 7
        light.rotation_euler = (Vector((0, 0, 2))-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(12, -17, 10))
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0, 0, 2))-cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 15
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(ROOT/'artifacts/post-office-render.png')
    bpy.ops.render.render(write_still=True)
    cam.location = (3.0, -2.5, 2.7)
    cam.rotation_euler = (Vector((-.25, 1.5, 1.4))-cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'PERSP'
    cam.data.lens = 22
    bpy.ops.object.light_add(type='AREA', location=(0, -.8, 3.15))
    bpy.context.object.data.energy = 100
    bpy.context.object.data.color = (1, .7, .4)
    bpy.context.object.data.size = 3
    scene.render.filepath = str(ROOT/'artifacts/post-office-interior-render.png')
    bpy.ops.render.render(write_still=True)
