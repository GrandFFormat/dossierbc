// Les contrats attribués par la Ville de Vancouver — et ceux qui ont soumissionné sans gagner.
//
//   node scrapers/contrats.js                 les douze derniers mois disponibles dans le jeu
//   node scrapers/contrats.js --depuis=2025-01-01
//
// SOURCE : le jeu « Awarded contracts » du portail de données ouvertes (lib/van.js, même licence que
// les votes). Une ligne par soumission : le numéro d'appel (bid_number), son type (Request for
// Proposal, Invitation to Tender, Request for Quote…), sa description, la date d'attribution, le
// fournisseur, le montant, et « awarded » : Yes pour le gagnant, No pour les autres soumissionnaires.
// C'est l'équivalent, en une seule table, des contrats du SEAO et de leurs soumissionnaires à
// Montréal — sauf qu'ici il n'y a ni « gré à gré » ni motif : la Ville ne publie que les appels.
//
// CE QUE LE JEU NE DIT PAS, et qu'on ne dit donc pas : les contrats sans appel d'offres, les
// modifications de contrat, le lien avec une décision du conseil. Le jeu s'arrête aussi avant le
// présent (dernière attribution lue le 15 nov. 2026 : 23 déc. 2025) ; la page affiche la date de la
// dernière ligne pour que personne ne prenne ce retard pour une absence de contrats.
//
// Sortie, dans la forme que la page Contrats de Montréal attend (une liste positionnelle, légère) :
//   data/contrats-page.json   { types[], c: [[date, montant, type, nbSoumissions, fournisseur, titre, bidNumber, detail], …] }
//   data/contrats-details.json [[bidNumber, [[fournisseur, montant, gagnant 1/0], …]], …]  — même ordre que `detail`

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LICENCE, ATTRIBUTION, USER_AGENT, metadonneesDe, toutesLesLignesDe, lireJson, urlJeu, pageDuJeu } from '../lib/van.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const JEU = 'awarded-contracts';

const args = Object.fromEntries(process.argv.slice(2).map((r) => { const [k, v] = r.replace(/^--/, '').split('='); return [k, v ?? true]; }));

async function ecrire(chemin, objet) {
  await mkdir('data', { recursive: true });
  await writeFile(`${chemin}.tmp`, JSON.stringify(objet), 'utf8');
  await rename(`${chemin}.tmp`, chemin);
}

const meta = await metadonneesDe(JEU);
console.log(`Jeu « ${meta.titre} » : ${meta.nombreTotal} lignes, modifié le ${(meta.modifieLe ?? '').slice(0, 10)}. Robot : ${USER_AGENT}`);

// La dernière date du jeu : la fenêtre part de là, pas d'aujourd'hui — sinon un jeu en retard de
// dix mois donnerait une page vide, et on croirait que la Ville n'a rien attribué.
const derniere = await lireJson(urlJeu(JEU, 'records', { select: 'max(award_date) as d', limit: 1 }));
const jusqua = String(derniere?.results?.[0]?.d ?? '').slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(jusqua)) throw new Error(`date la plus récente illisible : ${JSON.stringify(derniere)}`);
const depuis = args.depuis ? String(args.depuis) : new Date(new Date(jusqua).getTime() - 365 * 864e5).toISOString().slice(0, 10);
console.log(`Fenêtre : du ${depuis} au ${jusqua} (dernière attribution du jeu).`);

const { lignes } = await toutesLesLignesDe(JEU, `award_date>=date'${depuis}' AND award_date<=date'${jusqua}'`, {
  orderBy: 'award_date,bid_number,vendor_name,bid_amount', etiquette: 'soumissions',
});

// Un lot par bid_number ; dedans, le ou les gagnants et tous les soumissionnaires.
const lots = new Map();
for (const l of lignes) {
  const num = String(l.bid_number ?? '').trim();
  if (!num) continue;
  if (!lots.has(num)) lots.set(num, { num, type: l.bid_type ?? '', titre: l.bid_description ?? '', soums: [], gagnants: [] });
  const lot = lots.get(num);
  const montant = l.bid_amount == null || l.bid_amount === '' ? null : Number(l.bid_amount);
  const s = { nom: String(l.vendor_name ?? '').trim(), montant, gagnant: /^yes$/i.test(String(l.awarded ?? '')), date: String(l.award_date ?? '').slice(0, 10) };
  lot.soums.push(s);
  if (s.gagnant) lot.gagnants.push(s);
}

// Les types, normalisés : la Ville écrit « Request for Quote » et « Request for Quotation »,
// « Express. of Interest » et « Expression of Interest ». Une famille par type.
const TYPES = [
  ['Request for Proposal', /proposal/i],
  ['Invitation to Tender', /tender/i],
  ['Request for Quotation', /quot/i],
  ['Request for Application', /application|prequalif/i],
  ['Expression of Interest', /interest/i],
];
const typeDe = (t) => TYPES.find(([, re]) => re.test(t))?.[0] ?? (t || 'Other');
const types = [];
const indexType = (t) => { const n = typeDe(t); let i = types.indexOf(n); if (i < 0) { types.push(n); i = types.length - 1; } return i; };

const c = [];
const details = [];
for (const lot of [...lots.values()].sort((a, b) => (b.gagnants[0]?.date ?? '').localeCompare(a.gagnants[0]?.date ?? ''))) {
  if (!lot.gagnants.length) continue;   // un appel sans attribution dans la fenêtre : rien à montrer comme contrat
  const soums = lot.soums.slice().sort((a, b) => (b.gagnant - a.gagnant) || ((a.montant ?? Infinity) - (b.montant ?? Infinity))).map((s) => [s.nom, s.montant, s.gagnant ? 1 : 0]);
  const detail = details.length;
  details.push([lot.num, soums]);
  for (const g of lot.gagnants) {
    c.push([g.date, g.montant, indexType(lot.type), lot.soums.length, g.nom, lot.titre.replace(/\s+/g, ' ').trim(), lot.num, detail]);
  }
}

const total = c.reduce((s, x) => s + (x[1] || 0), 0);
await ecrire('data/contrats-page.json', {
  source: pageDuJeu(JEU),
  jeu: JEU,
  licence: `${LICENCE.nom} ${LICENCE.version} — ${LICENCE.url}`,
  attribution: ATTRIBUTION,
  extraction: new Date().toISOString(),
  jeuModifieLe: meta.modifieLe,
  depuis, jusqua,
  nombreLots: details.length,
  types,
  c,
});
await ecrire('data/contrats-details.json', details);
const uneSeule = c.filter((x) => x[3] === 1).length;
console.log(`Contrats : ${c.length} attributions sur ${details.length} appels, ${Math.round(total).toLocaleString('en-CA')} $ au total, ${uneSeule} appel(s) à une seule soumission.`);
console.log('  Types : ' + types.map((t, i) => `${t} ${c.filter((x) => x[2] === i).length}`).join(' · '));
