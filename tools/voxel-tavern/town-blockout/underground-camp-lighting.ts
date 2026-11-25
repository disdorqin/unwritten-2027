import { BoxGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, PointLight, type Group } from 'three';

type LightAnchor = Readonly<{ id: string; radius: number; mount: Group }>;

export function mountUndergroundCampLighting({
  offeringAnchors, guideAnchors,
}: {
  offeringAnchors: readonly LightAnchor[];
  guideAnchors: readonly LightAnchor[];
}) {
  const housingGeometry = new BoxGeometry(.13, .2, .13);
  const paneGeometry = new BoxGeometry(.118, .09, .138);
  const housingMaterial = new MeshLambertMaterial({ color: '#4b3b30' });
  const warmMaterial = new MeshBasicMaterial({ color: '#ffca82' });
  const coolMaterial = new MeshBasicMaterial({ color: '#a8d4ee' });

  function attach(anchor: LightAnchor, warm: boolean) {
    const housing = new Mesh(housingGeometry, housingMaterial);
    const pane = new Mesh(paneGeometry, warm ? warmMaterial : coolMaterial);
    const light = new PointLight(warm ? '#ffbc77' : '#a8d4ee', warm ? 9 : 3, anchor.radius, 2);
    housing.name = anchor.id + '/lantern';
    pane.name = anchor.id + '/lit-pane';
    light.name = anchor.id + '/light';
    housing.visible = !warm;
    pane.visible = false;
    light.visible = false;
    anchor.mount.add(housing, pane, light);
    return { id: anchor.id, housing, pane, light };
  }

  const offerings = offeringAnchors.map(anchor => attach(anchor, true));
  const guides = guideAnchors.map(anchor => attach(anchor, false));
  let disposed = false;

  return {
    sync(activeOfferings: ReadonlySet<string>, litGuideCount: number, remainingLightBudget: number) {
      if (disposed) return;
      let spare = Math.min(5, Math.max(0, Math.floor(remainingLightBudget)));
      const showLight = (source: ReturnType<typeof attach>, requested: boolean) => {
        const visible = requested && spare > 0;
        if (visible) spare--;
        source.light.visible = visible;
        source.pane.visible = visible;
      };
      for (const source of offerings) {
        source.housing.visible = activeOfferings.has(source.id);
        showLight(source, source.housing.visible);
      }
      guides.forEach((source, index) => showLight(source, index < litGuideCount));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of [...offerings, ...guides]) {
        source.housing.removeFromParent();
        source.pane.removeFromParent();
        source.light.removeFromParent();
      }
      housingGeometry.dispose();
      paneGeometry.dispose();
      housingMaterial.dispose();
      warmMaterial.dispose();
      coolMaterial.dispose();
    },
  };
}
