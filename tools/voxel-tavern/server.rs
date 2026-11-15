use voxelize::{AABBServerExt, AABB, Block, BlockFaces, Chunk, ChunkStage, Registry, Resources, Server, Space, Vec3, VoxelAccess, Voxelize, World, WorldConfig};
use serde::Deserialize;

#[derive(Deserialize)]
struct Part { m: String, b: [f32; 6] }
#[derive(Deserialize)]
struct Blueprint { catalogue: Vec<Vec<Part>>, voxels: Vec<[i32; 4]> }
struct TavernStage { voxels: Vec<[i32; 4]> }
impl ChunkStage for TavernStage {
    fn name(&self) -> String { "finite-tavern".into() }
    fn process(&self, mut chunk: Chunk, _: Resources, _: Option<Space>) -> Chunk {
        let Vec3(x0, _, z0) = chunk.min;
        let Vec3(x1, _, z1) = chunk.max;
        for x in x0..x1 { for z in z0..z1 { for y in 0..2 { chunk.set_voxel(x,y,z,1); } } }
        for [x,y,z,id] in &self.voxels {
            if *x>=x0 && *x<x1 && *z>=z0 && *z<z1 { chunk.set_voxel(*x,*y,*z,*id as u32); }
        }
        chunk
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let mut registry = Registry::new();
    registry.register_block(&Block::new("Snow").id(1).build());
    let blueprint: Blueprint = serde_json::from_str(include_str!("tavern.json")).expect("tavern blueprint");
    for (i, parts) in blueprint.catalogue.iter().enumerate() {
        let mut faces=BlockFaces::new();
        let mut aabbs=Vec::new();
        for (j, p) in parts.iter().enumerate() {
            let b=p.b;
            let f=BlockFaces::six_faces().scale_x(b[3]-b[0]).scale_y(b[4]-b[1]).scale_z(b[5]-b[2])
                .offset_x(b[0]).offset_y(b[1]).offset_z(b[2]).prefix(&format!("{}{}",p.m,j)).build();
            aabbs.push(AABB::from_faces(&f));
            faces=faces+f;
        }
        let mut block=Block::new(&format!("Tavern {}",i)).id(i as u32+2).faces(&faces).aabbs(&aabbs).is_transparent(true);
        if parts.iter().any(|p|p.m=="glow") { block=block.red_light_level(15).green_light_level(11).blue_light_level(6); }
        registry.register_block(&block.build());
    }
    let config = WorldConfig::new()
        .min_chunk([-2, -2]).max_chunk([2, 2])
        .max_height(32).sub_chunks(2)
        .preload(true).preload_radius(1)
        .saving(false).build();
    let mut world = World::new("tavern", &config);
    world.pipeline_mut().add_stage(TavernStage { voxels: blueprint.voxels });
    let mut server = Server::new().port(4000).registry(&registry).build();
    server.add_world(world).expect("finite tavern world");
    Voxelize::run(server).await
}
