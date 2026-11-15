// Géométrie minimale pour « Près de chez moi » : des polygones de quartier, un point dedans ou pas,
// et une simplification des contours pour que la page ne charge pas des centaines de kilo-octets.
// Le pendant de quebec/lib/geo.js et de la simplification de montreal/scrapers/districts.js, réécrit
// pour ne dépendre de rien d'autre que ce dossier. Aucune librairie, aucun serveur de tuiles.

// Douglas-Peucker, tel qu'à Montréal. La tolérance est en degrés ; on corrige l'axe est-ouest par
// cos(latitude) pour ne pas l'écraser (à 49° nord, un degré de longitude fait 73 km, un degré de
// latitude 111).
function distancePerpendiculaire(p, a, b) {
  const k = Math.cos((49.25 * Math.PI) / 180);
  const [px, py] = [p[0] * k, p[1]], [ax, ay] = [a[0] * k, a[1]], [bx, by] = [b[0] * k, b[1]];
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  let indexMax = 0, distanceMax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distancePerpendiculaire(points[i], points[0], points[points.length - 1]);
    if (d > distanceMax) { distanceMax = d; indexMax = i; }
  }
  if (distanceMax <= tolerance) return [points[0], points[points.length - 1]];
  const gauche = douglasPeucker(points.slice(0, indexMax + 1), tolerance);
  const droite = douglasPeucker(points.slice(indexMax), tolerance);
  return [...gauche.slice(0, -1), ...droite];
}

// Les anneaux extérieurs d'une géométrie GeoJSON (Polygon ou MultiPolygon). Les trous sont ignorés :
// un quartier de Vancouver n'en a pas.
export function anneauxDe(geometry) {
  if (!geometry) return [];
  const g = geometry.type === 'Feature' ? geometry.geometry : geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates[0]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0]);
  return [];
}

// Les coordonnées d'une géométrie quelle qu'elle soit, à plat — pour prendre « le premier point »
// d'un chantier dessiné en ligne.
export function premierPoint(geometry) {
  const g = geometry?.type === 'Feature' ? geometry.geometry : geometry;
  if (!g?.coordinates) return null;
  let c = g.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
}

// Point dans polygone, par lancer de rayon.
export function dansAnneau([x, y], anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// La première zone ({ anneaux: [...] }) qui contient le point, ou null.
export function trouver(zones, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const z of zones) {
    if (z.cadre && (x < z.cadre.ouest || x > z.cadre.est || y < z.cadre.sud || y > z.cadre.nord)) continue;
    if (z.anneaux.some((a) => dansAnneau([x, y], a))) return z;
  }
  return null;
}

export function cadreDe(anneaux) {
  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  for (const a of anneaux) for (const [x, y] of a) { if (x < ouest) ouest = x; if (x > est) est = x; if (y < sud) sud = y; if (y > nord) nord = y; }
  return { ouest, est, sud, nord };
}

// Un contour simplifié et arrondi à cinq décimales (environ un mètre) : Montréal est passé de 586 ko
// à 46 ko ainsi, sans différence visible à l'échelle d'une ville.
export function simplifier(anneaux, tolerance = 0.00012) {
  return anneaux.map((a) => douglasPeucker(a, tolerance).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]));
}
