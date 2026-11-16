// « Près de chez moi » à Vancouver : les 22 quartiers, l'index des adresses, les permis de construction
// des 12 derniers mois et les chantiers de la Ville, par quartier.
//
//   node scrapers/pres-de-chez-moi.js
//   node scrapers/pres-de-chez-moi.js --sans-adresses     (ne relit pas les 99 723 adresses)
//   node scrapers/pres-de-chez-moi.js --seulement-adresses (les adresses seules, avec leur position)
//
// Même mécanique qu'à Québec et à Montréal (scrapers/adresses.js, permis-travaux.js) : point dans
// polygone ici, petits fichiers pour la page, et aucune adresse tapée par un visiteur n'est envoyée
// nulle part — tout se cherche dans le navigateur.
//
// SOURCES (portail de données ouvertes, même licence que les votes) :
//   « Local area boundary » (22 quartiers officiels), « Property addresses » (99 723 adresses civiques),
//   « Issued building permits » (52 672 permis depuis 2017), « Road Ahead » (chantiers à venir, en cours,
//   et fermetures de rue).
// Les gros jeux (adresses, permis) sont lus en UN export CSV chacun plutôt qu'en mille pages de 100.
//
// CE QUI CHANGE PAR RAPPORT À MONTRÉAL : il n'y a pas de district, donc pas de « votre conseiller ».
// Le quartier remplace le district — c'est ce que la Ville elle-même attache à chaque permis
// (geolocalarea) — et la page renvoie aux onze membres, élus par toute la ville.
//
// Sortie : data/quartiers.json, data/adresses/<lettre>.json + index.json, data/permis/<i>.json + index.json,
//          data/chantiers.json

import { mkdir, writeFile, rename, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LICENCE, ATTRIBUTION, USER_AGENT, metadonneesDe, toutesLesLignesDe, exporterCsv, pageDuJeu, lireJson, urlJeu } from '../lib/van.js';
import { lireCsv, champ, point } from '../lib/csv.js';
import { anneauxDe, simplifier, cadreDe, trouver, premierPoint } from '../lib/geo.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((r) => { const [k, v] = r.replace(/^--/, '').split('='); return [k, v ?? true]; }));
console.log(`Robot : ${USER_AGENT}`);

const ecrire = async (chemin, objet) => { await writeFile(`${chemin}.tmp`, JSON.stringify(objet), 'utf8'); await rename(`${chemin}.tmp`, chemin); };
await mkdir('data', { recursive: true });

// ---------- 1. Les 22 quartiers ----------
const QUARTIERS = 'local-area-boundary';
const { lignes: lq } = await toutesLesLignesDe(QUARTIERS, null, { orderBy: 'name', etiquette: 'quartiers' });
const quartiers = lq.map((l) => {
  const anneaux = anneauxDe(l.geom);
  return { nom: String(l.name).trim(), anneaux, cadre: cadreDe(anneaux) };
}).filter((q) => q.anneaux.length).sort((a, b) => a.nom.localeCompare(b.nom, 'en'));
const noms = quartiers.map((q) => q.nom);
const quartierDe = (x, y) => { const q = trouver(quartiers, x, y); return q ? noms.indexOf(q.nom) : -1; };
{
  const simples = quartiers.map((q) => ({ nom: q.nom, anneaux: simplifier(q.anneaux) }));
  const tous = simples.flatMap((q) => q.anneaux);
  await ecrire('data/quartiers.json', {
    source: pageDuJeu(QUARTIERS), jeu: QUARTIERS, licence: `${LICENCE.nom} ${LICENCE.version}`, attribution: ATTRIBUTION,
    extraction: new Date().toISOString(), nombre: simples.length, cadre: cadreDe(tous),
    pointsAvant: quartiers.reduce((s, q) => s + q.anneaux.reduce((t, a) => t + a.length, 0), 0),
    pointsApres: tous.reduce((s, a) => s + a.length, 0),
    quartiers: simples,
  });
  console.log(`Quartiers : ${simples.length}, contours simplifiés.`);
}

// ---------- 2. Les adresses ----------
// « 5 W 6TH AVENUE » : la Ville écrit la rue en abrégé et en capitales (« W 6TH AV »). La clé de
// recherche normalise les deux côtés pareil (lib côté page : même règle, voir near-me).
const cleVoie = (nom) => String(nom ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9]+/g, ' ').trim()
  .replace(/\bAVENUE\b/g, 'AV').replace(/\bAVE\b/g, 'AV').replace(/\bSTREET\b/g, 'ST').replace(/\bDRIVE\b/g, 'DR').replace(/\bROAD\b/g, 'RD')
  .replace(/\bBOULEVARD\b/g, 'BLVD').replace(/\bPLACE\b/g, 'PL').replace(/\bCRESCENT\b/g, 'CRES').replace(/\bCOURT\b/g, 'CRT').replace(/\bLANE\b/g, 'LANE')
  .replace(/\bHIGHWAY\b/g, 'HWY').replace(/\bWEST\b/g, 'W').replace(/\bEAST\b/g, 'E').replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S')
  .replace(/\s+/g, ' ');
const ADRESSES = 'property-addresses';
if (!args['sans-adresses'] || !existsSync('data/adresses/index.json')) {
  const meta = await metadonneesDe(ADRESSES);
  const cNum = champ(meta.champs, /^civic_?number$/i, /civic/i, /house_?num/i, /^number$/i);
  const cRue = champ(meta.champs, /^std_street$/i, /street_?name/i, /^street$/i, /street/i);
  const cQuartier = champ(meta.champs, /geo_?local_?area/i, /local_?area/i, /neighbou?rhood/i);
  const cPoint = champ(meta.champs, /^geo_point_2d$/i, /geo_point/i);
  console.log(`Adresses : ${meta.nombreTotal} lignes ; colonnes prises — numéro « ${cNum} », rue « ${cRue} », quartier « ${cQuartier ?? '(point dans polygone)'} », point « ${cPoint} ».`);
  if (!cNum || !cRue || !cPoint) throw new Error(`Adresses : colonnes non reconnues parmi ${meta.champs.join(', ')}`);
  const select = [cNum, cRue, cQuartier, cPoint].filter(Boolean).join(',');
  const { lignes: la } = lireCsv(await exporterCsv(ADRESSES, { select }));
  const parLettre = {};
  let n = 0, hors = 0;
  for (const l of la) {
    const numero = Number(String(l[cNum]).replace(/[^0-9]/g, ''));
    const rue = String(l[cRue] ?? '').trim();
    if (!numero || !rue) continue;
    const p = point(l[cPoint]);
    let qi = cQuartier && l[cQuartier] ? noms.indexOf(String(l[cQuartier]).trim()) : -1;
    if (qi < 0 && p) qi = quartierDe(p[0], p[1]);
    if (qi < 0) { hors++; continue; }
    const cle = cleVoie(rue);
    const lettre = (cle[0] || '_').replace(/[^A-Z0-9]/, '_');
    const voie = ((parLettre[lettre] ||= {})[cle] ||= [rue, []]);
    // La position de l'adresse (lat, lon), pour le rayon « − 1 km + » de la page (15 nov. 2026).
    voie[1].push(p ? [numero, numero, qi, +p[1].toFixed(5), +p[0].toFixed(5)] : [numero, numero, qi]);
    n++;
  }
  await rm('data/adresses', { recursive: true, force: true });
  await mkdir('data/adresses', { recursive: true });
  for (const [lettre, voies] of Object.entries(parLettre)) {
    for (const v of Object.values(voies)) v[1].sort((a, b) => a[0] - b[0]);
    await ecrire(`data/adresses/${lettre}.json`, voies);
  }
  await ecrire('data/adresses/index.json', {
    source: `${pageDuJeu(ADRESSES)} et ${pageDuJeu(QUARTIERS)}`, licence: `${LICENCE.nom} ${LICENCE.version}`, attribution: ATTRIBUTION,
    extraction: new Date().toISOString(), adresses: n, horsQuartier: hors, colonnes: { numero: cNum, rue: cRue, quartier: cQuartier, point: cPoint }, quartiers: noms,
  });
  console.log(`Adresses : ${n} placées dans un quartier (${hors} hors des 22 quartiers), ${Object.keys(parLettre).length} fichiers.`);
} else {
  console.log('Adresses : conservées (--sans-adresses).');
}

// --seulement-adresses : relit les adresses (et les quartiers) sans toucher aux permis ni aux
// chantiers — utile quand le volet est en pause et que ses données doivent rester figées.
if (args['seulement-adresses']) {
  console.log('Permis et chantiers : conservés (--seulement-adresses).');
  process.exit(0);
}

// ---------- 3. Les permis de construction des 12 derniers mois ----------
// Gardés, comme à Québec et à Montréal : constructions neuves, démolitions, et les agrandissements ou
// transformations d'au moins 500 000 $ — la Ville range sous « Addition / Alteration » aussi bien une
// tour qu'un comptoir de cuisine, et c'est le montant déclaré qui distingue les deux.
const PERMIS = 'issued-building-permits';
{
  const meta = await metadonneesDe(PERMIS);
  // La date du permis le plus récent, en UNE requête d'agrégat — pas en paginant les 52 672 lignes.
  const fin = (await lireJson(urlJeu(PERMIS, 'records', { select: 'max(issuedate) as d', limit: 1 })))?.results?.[0]?.d;
  const finIso = String(fin ?? new Date().toISOString()).slice(0, 10);
  const debut = new Date(new Date(finIso).getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const select = ['permitnumber', 'issuedate', 'projectvalue', 'typeofwork', 'address', 'permitcategory', 'propertyuse', 'geolocalarea', 'geo_point_2d'].filter((c) => meta.champs.includes(c)).join(',');
  const { lignes: lp } = lireCsv(await exporterCsv(PERMIS, { select, where: `issuedate>=date'${debut}' AND issuedate<=date'${finIso}'` }));
  const SEUIL = 500000;
  const parQuartier = {};
  let nP = 0;
  for (const l of lp) {
    const type = String(l.typeofwork ?? '');
    const valeur = Number(l.projectvalue) || 0;
    let genre = null;
    if (/^new building/i.test(type)) genre = 'Construction';
    else if (/demolition|deconstruction/i.test(type)) genre = 'Demolition';
    else if (/addition|alteration/i.test(type) && valeur >= SEUIL) genre = 'Alteration';
    if (!genre) continue;
    const p = point(l.geo_point_2d);
    let qi = l.geolocalarea ? noms.indexOf(String(l.geolocalarea).trim()) : -1;
    if (qi < 0 && p) qi = quartierDe(p[0], p[1]);
    if (qi < 0) continue;
    const adresse = String(l.address ?? '').replace(/,\s*Vancouver.*$/i, '').replace(/\s+/g, ' ').trim();
    (parQuartier[qi] ||= []).push([String(l.issuedate).slice(0, 10), adresse, genre, String(l.permitnumber ?? ''), p ? +p[1].toFixed(5) : null, p ? +p[0].toFixed(5) : null, Math.round(valeur), String(l.permitcategory ?? '')]);
    nP++;
  }
  await rm('data/permis', { recursive: true, force: true });
  await mkdir('data/permis', { recursive: true });
  const comptes = {};
  for (const [i, liste] of Object.entries(parQuartier)) { liste.sort((a, b) => b[0].localeCompare(a[0])); comptes[i] = liste.length; await ecrire(`data/permis/${i}.json`, liste); }
  await ecrire('data/permis/index.json', { source: pageDuJeu(PERMIS), jeu: PERMIS, jeuModifieLe: meta.modifieLe, licence: `${LICENCE.nom} ${LICENCE.version}`, attribution: ATTRIBUTION, extraction: new Date().toISOString(), debut, fin: finIso, seuilAlteration: SEUIL, comptes });
  console.log(`Permis : ${nP} gardés du ${debut} au ${finIso} (sur ${lp.length} délivrés), ${Object.keys(comptes).length} quartiers.`);
}

// ---------- 4. Les chantiers de la Ville (Road Ahead) ----------
const CHANTIERS = [
  ['road-ahead-projects-under-construction', 'en-cours'],
  ['road-ahead-upcoming-projects', 'a-venir'],
  ['road-ahead-current-road-closures', 'fermeture'],
];
{
  const parQuartier = {};
  let nT = 0;
  const sources = [];
  for (const [jeu, statut] of CHANTIERS) {
    let meta;
    try { meta = await metadonneesDe(jeu); } catch (e) { console.warn(`⚠ ${jeu} : ${e.message}`); continue; }
    // L'API refuse order_by sur un champ géographique (400) : on départage sur le premier champ ordinaire.
    const { lignes: lt } = await toutesLesLignesDe(jeu, null, { orderBy: meta.champs.find((c) => !/^geo|geom|point|shape/i.test(c)) ?? null, etiquette: `chantiers (${statut})` });
    sources.push({ jeu, titre: meta.titre, modifieLe: meta.modifieLe, nombre: lt.length });
    const cNom = champ(meta.champs, /^project$/i, /^location$/i, /name|title|descr/i);
    const cFin = champ(meta.champs, /comp_?date/i, /end/i, /fin/i);
    const cUrl = champ(meta.champs, /url/i, /link/i);
    const cLieu = champ(meta.champs, /^location$/i, /^street$/i);
    for (const l of lt) {
      const p = premierPoint(l.geom) ?? point(l.geo_point_2d);
      if (!p) continue;
      const qi = quartierDe(p[0], p[1]);
      if (qi < 0) continue;
      const nom = String(l[cNom] ?? l[cLieu] ?? '').trim();
      (parQuartier[qi] ||= []).push([nom, statut, String(l[cFin] ?? '').slice(0, 10), String(l[cUrl] ?? ''), +p[1].toFixed(5), +p[0].toFixed(5), cLieu && l[cLieu] && l[cLieu] !== nom ? String(l[cLieu]) : '']);
      nT++;
    }
  }
  for (const l of Object.values(parQuartier)) l.sort((a, b) => (a[1] === b[1] ? (a[2] || '9').localeCompare(b[2] || '9') : a[1].localeCompare(b[1])));
  await ecrire('data/chantiers.json', { sources, licence: `${LICENCE.nom} ${LICENCE.version}`, attribution: ATTRIBUTION, extraction: new Date().toISOString(), parQuartier });
  console.log(`Chantiers : ${nT} placés dans un quartier (${sources.map((s) => `${s.titre} ${s.nombre}`).join(' · ')}).`);
}
