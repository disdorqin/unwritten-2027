import { createExpansionReviewRenderer } from './town-expansion-review-renderer.js';
import { createOrbitalReview } from './town-expansion-review-orbital.js';
import { createUndergroundReview } from './town-expansion-review-underground.js';

const renderer = createExpansionReviewRenderer();
const undergroundButton = document.querySelector<HTMLButtonElement>('#review-underground')!;
const orbitalButton = document.querySelector<HTMLButtonElement>('#review-orbital')!;
let underground: ReturnType<typeof createUndergroundReview> | undefined;
let orbital: ReturnType<typeof createOrbitalReview> | undefined;

function showUnderground() {
  undergroundButton.setAttribute('aria-pressed', 'true');
  orbitalButton.setAttribute('aria-pressed', 'false');
  underground ??= createUndergroundReview(renderer.show);
  underground.show();
}

function showOrbital() {
  undergroundButton.setAttribute('aria-pressed', 'false');
  orbitalButton.setAttribute('aria-pressed', 'true');
  orbital ??= createOrbitalReview(renderer.show);
  orbital.show();
}

undergroundButton.addEventListener('click', showUnderground);
orbitalButton.addEventListener('click', showOrbital);
showUnderground();
