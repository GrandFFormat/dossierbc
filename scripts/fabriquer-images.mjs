// Fabrique la marque de DossierBC : l'icône vectorielle et ses PNG.
//
//   commun/bc.svg                              l'icône (onglet du navigateur, données structurées)
//   commun/bc-48.png, bc-180.png, bc-512.png   les tailles que réclament les navigateurs et iOS
//   favicon.ico                                un .ico qui contient le PNG de 48 px
//
// Usage : node scripts/fabriquer-images.mjs
//
// LE DESSIN (9 novembre 2026). La grammaire de la famille Dossier : une tuile carrée, un bandeau
// en bas, un emblème de la province au-dessus (DossierQuébec porte son monogramme, le
// Nouveau-Brunswick son étoile). Pour la Colombie-Britannique, c'est le drapeau de la province
// réduit à sa géométrie : le soleil couchant sur les vagues — la même identité que l'affiche de
// l'accueil. À 16 pixels il reste un point or sur un carré bleu, avec une barre or en bas : rien
// d'autre ne lui ressemble dans une barre d'onglets.
//   tuile   #1f4f8a  le bleu héraldique du cahier
//   soleil  #e3b528  l'or soleil
//   vagues  #fbfbfa  le papier
//
// SANS AUCUNE DÉPENDANCE. L'ancienne version appelait Chromium (Playwright) pour transformer le
// SVG en PNG. Playwright n'est pas installé ici, et 100 Mo de navigateur pour quatre cercles
// n'ont pas de sens : les PNG sont donc rastérisés à la main, et zlib (livré avec Node) les
// comprime. Le dessin est décrit UNE fois, en unités de 64, et sert aux deux formats.
//
// Ce qui n'est PAS ici : dossierbc-partage.png, l'image de partage (1200 × 630 ; l'ancienne
// dossierbc-cover.png de 1702 px reste en place). Elle porte du
// texte composé, donc une police à rendre — il faut un navigateur. Elle est faite par
// design/cover-bc.html : la page dessine l'image dans un canvas, avec les polices du site, puis
// l'envoie en PUT à un petit serveur qui l'écrit. Refaire : servir design/cover-bc.html et
// dossierbc-partage.png sort à côté. Aucune dépendance là non plus — Playwright n'est pas installé.

import { writeFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLEU = [0x1f, 0x4f, 0x8a];
const OR = [0xe3, 0xb5, 0x28];
const PAPIER = [0xfb, 0xfb, 0xfa];

// Le dessin, en unités de 64. Les deux formats lisent ces mêmes valeurs.
const D = {
  bandeau: 52,          // le bandeau commence à 52/64, soit 13/16 : la frontière tombe pile sur
                        // un pixel à 16, 32, 48 et 64 px, sans liseré gris d'anticrénelage
  soleil: { x: 32, y: 24, r: 13 },
  vagues: [41, 47],     // les deux lignes d'eau
  longueur: 32,         // la longueur d'onde
  amplitude: 1.6,
  epaisseur: 2.4,
};

// --- LE SVG ------------------------------------------------------------------------------------
const vague = (y) => {
  const d = D.longueur / 2;
  const h = D.amplitude * 2;
  return `M0,${y} q${d / 2},${-h} ${d},0 t${d},0 t${d},0 t${d},0`;
};
const SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DossierBC">
  <!--
    La marque de DossierBC : le soleil couchant sur les vagues, la tuile bleue, le bandeau or.
    Dessin et couleurs décrits dans scripts/fabriquer-images.mjs, qui fabrique aussi les PNG.
    Aucun double trait d'union dans ce bloc : un commentaire XML l'interdit, et un SVG qui ne se
    parse pas ne s'affiche pas du tout.
  -->
  <rect width="64" height="64" fill="#1f4f8a"/>
  <circle cx="${D.soleil.x}" cy="${D.soleil.y}" r="${D.soleil.r}" fill="#e3b528"/>
  <g fill="none" stroke="#fbfbfa" stroke-width="${D.epaisseur}">
    ${D.vagues.map((y) => `<path d="${vague(y)}"/>`).join('\n    ')}
  </g>
  <rect y="${D.bandeau}" width="64" height="${64 - D.bandeau}" fill="#e3b528"/>
</svg>
`;

// --- LA RASTÉRISATION --------------------------------------------------------------------------
/** La couleur d'un point du dessin, en unités de 64, ou null si c'est le fond. */
function couleurEn(x, y) {
  if (y >= D.bandeau) return OR;
  for (const y0 of D.vagues) {
    const courbe = y0 + D.amplitude * Math.sin((2 * Math.PI * x) / D.longueur);
    if (Math.abs(y - courbe) <= D.epaisseur / 2) return PAPIER;
  }
  const dx = x - D.soleil.x, dy = y - D.soleil.y;
  if (dx * dx + dy * dy <= D.soleil.r * D.soleil.r) return OR;
  return BLEU;
}

/** Le dessin en pixels. Quatre sous-pixels par côté : les bords du soleil restent lisses. */
function rastrer(taille) {
  const SOUS = 4;
  const px = Buffer.alloc(taille * taille * 4);
  for (let j = 0; j < taille; j++) {
    for (let i = 0; i < taille; i++) {
      let r = 0, v = 0, b = 0;
      for (let sj = 0; sj < SOUS; sj++) {
        for (let si = 0; si < SOUS; si++) {
          const c = couleurEn(((i + (si + 0.5) / SOUS) / taille) * 64, ((j + (sj + 0.5) / SOUS) / taille) * 64);
          r += c[0]; v += c[1]; b += c[2];
        }
      }
      const n = SOUS * SOUS, k = (j * taille + i) * 4;
      px[k] = Math.round(r / n); px[k + 1] = Math.round(v / n); px[k + 2] = Math.round(b / n); px[k + 3] = 255;
    }
  }
  return px;
}

// --- L'ÉCRITURE DU PNG ---------------------------------------------------------------------------
// Un PNG, c'est une signature puis des morceaux « longueur + nom + données + CRC ». Trois suffisent :
// IHDR (la forme), IDAT (les pixels dégonflés) et IEND (la fin).
const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const o of buf) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function morceau(nom, donnees) {
  const tete = Buffer.alloc(4);
  tete.writeUInt32BE(donnees.length, 0);
  const corps = Buffer.concat([Buffer.from(nom, 'latin1'), donnees]);
  const fin = Buffer.alloc(4);
  fin.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([tete, corps, fin]);
}
function png(taille, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;      // 8 bits par canal
  ihdr[9] = 6;      // RVB + alpha
  // Chaque rangée est précédée de son octet de filtre. 0 : aucun filtre, le dessin est trop
  // simple pour que le dégonflage y gagne quoi que ce soit.
  const brut = Buffer.alloc(taille * (taille * 4 + 1));
  for (let j = 0; j < taille; j++) {
    pixels.copy(brut, j * (taille * 4 + 1) + 1, j * taille * 4, (j + 1) * taille * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/** Un .ico n'est qu'un petit en-tête devant une image PNG. */
function ico(fichierPng, taille) {
  const tete = Buffer.alloc(22);
  tete.writeUInt16LE(0, 0); tete.writeUInt16LE(1, 2); tete.writeUInt16LE(1, 4);
  tete.writeUInt8(taille, 6); tete.writeUInt8(taille, 7); tete.writeUInt8(0, 8); tete.writeUInt8(0, 9);
  tete.writeUInt16LE(1, 10); tete.writeUInt16LE(32, 12);
  tete.writeUInt32LE(fichierPng.length, 14); tete.writeUInt32LE(22, 18);
  return Buffer.concat([tete, fichierPng]);
}

// --- ET ON ÉCRIT ---------------------------------------------------------------------------------
writeFileSync('commun/bc.svg', SVG);
console.log('✓ commun/bc.svg');
for (const taille of [48, 180, 512]) {
  writeFileSync(`commun/bc-${taille}.png`, png(taille, rastrer(taille)));
  console.log(`✓ commun/bc-${taille}.png`);
}
writeFileSync('favicon.ico', ico(readFileSync('commun/bc-48.png'), 48));
console.log('✓ favicon.ico');
console.log("  (dossierbc-partage.png, l'image de partage, demande une police rendue : elle n'est pas faite ici)");
