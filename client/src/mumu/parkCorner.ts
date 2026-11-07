// Remembers which reader corner Mumu was last dropped in (F8: "Drag to another corner and it remembers").
// A per-device convenience, so localStorage rather than the contract-owned Dexie tables. Storage can be blocked
// (private window, site data off): that is logged loudly and Mumu simply falls back to the default corner.
import { DEFAULT_PARK_CORNER, type ParkCorner } from "./layout.ts";

const KEY = "mumu.parkCorner";

export function loadParkCorner(): ParkCorner {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "left" || raw === "right" ? raw : DEFAULT_PARK_CORNER;
  } catch (err) {
    console.error("Mumu could not read its saved reader corner", err);
    return DEFAULT_PARK_CORNER;
  }
}

export function saveParkCorner(corner: ParkCorner): void {
  try {
    window.localStorage.setItem(KEY, corner);
  } catch (err) {
    console.error("Mumu could not save its reader corner", err);
  }
}
