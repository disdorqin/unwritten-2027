/** Batch94 dry-only expansion. C2 owns river differences; these disjoint
 * rooms neither alter the river nor add a clock or new mining authority. */
export const secondMineDryWings=Object.freeze([
 {id:'west-workface',x0:-28,x1:-4,n0:38,n1:56,ceiling:6.3},
 {id:'east-workface',x0:4,x1:32,n0:68,n1:90,ceiling:7},
 {id:'collapse-wing',x0:-66,x1:-48,n0:162,n1:180,ceiling:8},
 {id:'barracks-wing',x0:48,x1:66,n0:166,n1:182,ceiling:7},
]);
export const secondMineDrySites=Object.freeze({
 workfaceWest:{east:-24,north:48},
 workfaceEast:{east:29,north:82},
 collapse:{east:-52,north:167},
 barracks:{east:55,north:174},
});
