import { TARGET_THUMBNAILS } from './targetThumbnails.js';

// Alpha bounds in the full 400×464 sprites. All image sizes use the same crop.
export const ART_BOUNDS = {
  wood: [94, 22, 305, 394], shield: [77, 14, 323, 394], ice: [75, 20, 325, 390],
  gel: [78, 22, 321, 390], steel: [64, 18, 336, 391], bamboo: [58, 47, 342, 364],
  card: [51, 28, 349, 388], pineapple: [73, 18, 326, 392], rope: [87, 18, 312, 392],
};

const images = new Map();
const asset = (key, format) => new URL('../../../assets/v19/targets/' + key + '.' + format, import.meta.url).href;

export const targetThumbnail = key => TARGET_THUMBNAILS[key];

export function warmTargets(keys) {
  for (const key of keys) {
    if (!Object.hasOwn(ART_BOUNDS, key)) continue;
    let entry = images.get(key);
    if (!entry) {
      const preview = new Image();
      preview.src = targetThumbnail(key);
      entry = { preview, full: null, retryAt: 0 };
      images.set(key, entry);
    }
    if (entry.full || performance.now() < entry.retryAt) continue;
    const full = entry.full = new Image();
    full.decoding = 'async';
    full.onerror = () => {
      full.onerror = () => {
        entry.full = null;
        entry.retryAt = performance.now() + 4000;
      };
      full.src = asset(key, 'png');
    };
    full.src = asset(key, 'webp');
  }
}

export function targetSprite(key) {
  const entry = images.get(key);
  if (entry?.full?.complete && entry.full.naturalWidth) return entry.full;
  if (entry?.preview.complete && entry.preview.naturalWidth) return entry.preview;
  return null;
}
