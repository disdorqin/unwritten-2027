/**
 * Switchback road play layer (branch window B; road form by window D).
 *
 * The road from the town gate to the front summit (≥2.75 km of
 * switchbacks, ≤12% grade) carries three quiet play elements. Canon
 * red lines: the story is a hidden thread — there is NO route arrow,
 * NO progress HUD, NO timing and NO score on this road. Walking it is
 * the play; these elements only notice that you did.
 *
 * - Mileposts: a stamped post roughly every 250 m of arc length.
 *   Stamping is by standing at the post and interacting, in ANY order
 *   (players join and leave the road at both ends and at the cable
 *   stations). Stamping every post records the road atlas page.
 * - Rest points: a bench and windbreak at the exposed switchback
 *   turns. Standing in a rest point's lee is shelter — the host's
 *   ZB-20 exposure model reads `shelteredAt` and zeroes accumulation
 *   there. Rest points are also where the road's sparse dressing
 *   (thermos, stacked stones) lives; the leaf owns only the shelter
 *   geometry.
 * - Viewpoints: named overlooks. The first visit records the atlas
 *   entry under the overlook's own name; later visits record nothing.
 *
 * All positions are host-supplied from window D's road survey; the
 * leaf owns the rules and the one atlas line.
 */
export type RoadPoint = Readonly<{ east: number; north: number }>;
export type Milepost = RoadPoint & Readonly<{ id: string; arcM: number }>;
export type RestPoint = RoadPoint & Readonly<{ id: string; leeRadiusM: number }>;
export type Viewpoint = RoadPoint & Readonly<{ id: string; name: string; radiusM: number }>;

/** The road atlas page's entire text. */
export const mountainRoadAtlasLine = '这条路，是踩着前人的脚印走出来的。';

export const milepostStampReachM = 3;

export function createMountainRoadLayer(input: {
  mileposts: readonly Milepost[];
  restPoints: readonly RestPoint[];
  viewpoints: readonly Viewpoint[];
}) {
  const stamped = new Set<string>();
  const seenViewpoints = new Set<string>();
  const postById = new Map(input.mileposts.map(post => [post.id, post]));

  const near = (a: RoadPoint, b: RoadPoint, reach: number) =>
    Math.hypot(a.east - b.east, a.north - b.north) <= reach;

  return {
    /** Interact at a post: stamps it if the player is within reach. Returns true only on a NEW stamp. */
    stamp(postId: string, player: RoadPoint): boolean {
      const post = postById.get(postId);
      if (!post || stamped.has(postId)) return false;
      if (!near(player, post, milepostStampReachM)) return false;
      stamped.add(postId);
      return true;
    },
    stampedCount: () => stamped.size,
    /** True once every milepost carries a stamp — the road page records. */
    roadComplete: () => input.mileposts.length > 0 && stamped.size === input.mileposts.length,
    /** Shelter query for the exposure host: inside any rest point's lee. */
    shelteredAt(player: RoadPoint): boolean {
      return input.restPoints.some(rest => near(player, rest, rest.leeRadiusM));
    },
    /** Feed a position; returns the viewpoint whose first visit this is, if any. */
    visit(player: RoadPoint): Viewpoint | undefined {
      for (const viewpoint of input.viewpoints) {
        if (!seenViewpoints.has(viewpoint.id) && near(player, viewpoint, viewpoint.radiusM)) {
          seenViewpoints.add(viewpoint.id);
          return viewpoint;
        }
      }
      return undefined;
    },
  };
}
