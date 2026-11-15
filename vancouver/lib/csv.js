// Un export CSV du portail de Vancouver : « ; » entre les champs, guillemets doublés dedans, première
// ligne = noms des champs (les noms techniques, puisqu'on demande use_labels=false), parfois un BOM.
// Lu entièrement en mémoire : le plus gros jeu qu'on exporte fait une centaine de milliers de lignes,
// une vingtaine de méga-octets — ça tient.

export function lireCsv(texte, { separateur = ';' } = {}) {
  const t = texte.replace(/^﻿/, '');
  const lignes = [];
  let champ = '', ligne = [], guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); if (ligne.some((x) => x !== '')) lignes.push(ligne); }
  const entete = lignes.shift() ?? [];
  return { entete, lignes: lignes.map((l) => Object.fromEntries(entete.map((nom, i) => [nom, l[i] ?? '']))) };
}

// Le premier nom de champ qui ressemble à ce qu'on cherche. Les jeux de Vancouver nomment leurs
// colonnes de façon stable mais pas toujours prévisible (civic_number ? civicnumber ?) : on
// reconnaît par famille et on dit dans le journal ce qu'on a pris.
export function champ(noms, ...motifs) {
  for (const m of motifs) {
    const trouve = noms.find((n) => m.test(n));
    if (trouve) return trouve;
  }
  return null;
}

// « {"lon": -123.1, "lat": 49.2} » tel que l'export CSV l'écrit, ou « 49.2, -123.1 ».
export function point(valeur) {
  if (valeur == null || valeur === '') return null;
  if (typeof valeur === 'object') return Number.isFinite(valeur.lon) && Number.isFinite(valeur.lat) ? [valeur.lon, valeur.lat] : null;
  const s = String(valeur).trim();
  if (s.startsWith('{')) {
    try { const o = JSON.parse(s); return Number.isFinite(o.lon) && Number.isFinite(o.lat) ? [o.lon, o.lat] : null; } catch { return null; }
  }
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[2]), Number(m[1])] : null;
}
