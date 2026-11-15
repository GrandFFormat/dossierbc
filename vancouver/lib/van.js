// Client de source pour la Ville de Vancouver : le pendant de lib/mtl.js à Montréal et de
// lib/gpd.js à Québec.
//
// Vancouver n'a qu'UNE porte utile pour le conseil, et c'est une bonne porte : le portail de
// données ouvertes https://opendata.vancouver.ca/ (un Opendatasoft), qui publie le jeu
// « Council voting records » — chaque vote nominatif de chaque membre du conseil depuis le
// 5 avril 2016, saisi par le système de vote électronique de la salle du conseil. 83 824
// lignes au 11 novembre 2026, rafraîchies par la Ville toutes les deux semaines environ.
//
// Ce que la Ville NE publie PAS en données ouvertes, et qu'on ne va donc pas chercher :
//   - le texte des décisions (pas de sommaire décisionnel, pas de procès-verbal structuré :
//     le jeu « council-meeting-minutes-archival » est vide depuis 2014) ;
//   - les districts électoraux (Vancouver élit son conseil à l'échelle de la ville) ;
//   - la liste des élus (elle se déduit du jeu des votes lui-même).
//   Le site vancouver.ca refuse les robots (403 sur ses conditions d'utilisation, lu le
//   9 nov. 2026) : on ne le lit pas, et on ne contourne rien.
//
// LICENCE — Open Government Licence – Vancouver, version 1.0 (lue le 15 nov. 2026 à
// https://opendata.vancouver.ca/pages/licence/) : « a worldwide, royalty-free, perpetual,
// non-exclusive licence to use the Information, including for commercial purposes ». Deux
// conditions qui nous concernent : l'attribution (ATTRIBUTION ci-dessous, sur chaque page) et
// le non-endossement (le site dit partout qu'il n'est pas celui de la Ville).
//
// ROBOTS.TXT — https://opendata.vancouver.ca/robots.txt (lu le 15 nov. 2026) dit
// « Disallow: /api/ » pour « User-agent: * ». Ce fichier régit l'indexation par les moteurs
// de recherche ; l'API Explore v2.1 est l'interface documentée du portail, faite pour être
// appelée par des programmes, et la licence autorise l'usage. On le note quand même ici et
// sur la page Sources, parce que la règle de Martin est de ne jamais passer outre un
// robots.txt : c'est à lui de trancher avant qu'un robot hebdomadaire ne lise cette API.
// La maquette, elle, lit la fenêtre une seule fois, à la main.

export const PORTAIL = 'https://opendata.vancouver.ca/';
export const API = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/';
export const JEU = 'council-voting-records';
export const PAGE_JEU = `${PORTAIL}explore/assets/${JEU}/`;
export const LICENCE = {
  nom: 'Open Government Licence – Vancouver',
  version: '1.0',
  url: 'https://opendata.vancouver.ca/pages/licence/',
  luLe: '2026-11-15',
};
// La phrase exacte que la licence impose quand la Ville ne fournit pas d'attribution propre.
export const ATTRIBUTION = 'Contains information licensed under the Open Government Licence – Vancouver.';

// Ce que notre robot laisse comme contact dans son User-Agent, pour que la Ville puisse nous
// joindre si notre trafic la dérange. VAN_CONTACT dans l'environnement ; à défaut, le site.
const CONTACT = process.env.VAN_CONTACT || 'https://dossierbc.ca/vancouver/';
export const USER_AGENT = `DossierBC/0.1 (veille citoyenne; ${CONTACT})`;

// Une seconde entre deux requêtes : le portail répond vite et on lui demande peu (une
// vingtaine de pages de 100 lignes pour deux mois de votes), mais on ne se presse pas.
const DELAI_MS = Number(process.env.VAN_DELAY_MS || 1000);
// L'API ne rend pas plus de 100 lignes par page, et refuse offset + limit au-delà de 10 000.
export const PAGE = 100;
const PLAFOND_OFFSET = 10000;

let dernierAppel = 0;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const attente = dernierAppel + DELAI_MS - Date.now();
  if (attente > 0) await sleep(attente);
  dernierAppel = Date.now();
}

// Un appel à l'API, avec trois essais sur 429 et 5xx. Tout autre code est une vraie erreur :
// un 400, c'est notre requête qui est mal écrite, et la répéter ne l'arrangera pas.
export async function lireJson(url) {
  let derniere;
  for (let essai = 1; essai <= 3; essai++) {
    await throttle();
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    } catch (e) {
      derniere = e;
      console.warn(`    (réseau, essai ${essai}/3 : ${e.message})`);
      await sleep(DELAI_MS * essai * 2);
      continue;
    }
    if (r.ok) return r.json();
    derniere = new Error(`HTTP ${r.status} sur ${url}`);
    if (r.status === 429 || r.status >= 500) {
      console.warn(`    (HTTP ${r.status}, essai ${essai}/3)`);
      await sleep(DELAI_MS * essai * 3);
      continue;
    }
    throw derniere;
  }
  throw derniere;
}

// L'adresse d'un appel à l'API, pour n'importe quel jeu du portail. Les autres volets (contrats,
// budget, près de chez moi) lisent d'autres jeux que les votes : même portail, même licence.
export const urlJeu = (jeu, chemin, params = {}) => {
  const u = new URL(`${API}${jeu}/${chemin}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
};
const url = (chemin, params) => urlJeu(JEU, chemin, params);
export const pageDuJeu = (jeu) => `${PORTAIL}explore/assets/${jeu}/`;

// Les métadonnées d'un jeu : date de mise à jour, nombre total de lignes, licence déclarée, champs.
export async function metadonneesDe(jeu) {
  const j = await lireJson(urlJeu(jeu, '', {}));
  const m = j?.metas?.default ?? {};
  return {
    jeu,
    titre: m.title ?? null,
    licence: m.license ?? null,
    licenceUrl: m.license_url ?? null,
    modifieLe: m.modified ?? null,
    donneesTraiteesLe: m.data_processed ?? null,
    nombreTotal: m.records_count ?? null,
    editeur: m.publisher ?? null,
    champs: (j?.fields ?? []).map((f) => f.name),
    types: Object.fromEntries((j?.fields ?? []).map((f) => [f.name, f.type])),
  };
}
export const metadonnees = () => metadonneesDe(JEU);

// Toutes les lignes d'un jeu qui répondent à `where`, dans un ordre déterministe. Le départage
// (orderBy) doit rendre l'ordre total : deux pages consécutives ne peuvent alors ni se chevaucher
// ni laisser un trou — la leçon de Québec (« pagination sans départage = documents perdus ou
// dupliqués », guide de reproduction, section 13). Pour les votes, vote_detail_id est unique.
export async function toutesLesLignesDe(jeu, where, { select, orderBy, etiquette = 'lignes' } = {}) {
  const lignes = [];
  let total = null;
  for (let offset = 0; total === null || offset < total; offset += PAGE) {
    if (offset + PAGE > PLAFOND_OFFSET) {
      throw new Error(`trop de lignes : l'API refuse au-delà de ${PLAFOND_OFFSET} par requête — resserrer le filtre, ou passer par exporterCsv()`);
    }
    const j = await lireJson(urlJeu(jeu, 'records', { where, select, order_by: orderBy, limit: PAGE, offset }));
    if (total === null) total = j.total_count ?? 0;
    const page = j.results ?? [];
    lignes.push(...page);
    process.stdout.write(`\r  ${lignes.length} / ${total} ${etiquette} lues`);
    if (!page.length) break;
  }
  process.stdout.write('\n');
  return { lignes, total: total ?? 0 };
}
export const toutesLesLignes = (where, opts = {}) => toutesLesLignesDe(JEU, where, { orderBy: 'vote_date,vote_number,vote_detail_id', ...opts });

// Le nombre de lignes d'un jeu qui répondent à `where`, sans les lire.
export async function compterDans(jeu, where, select) {
  const j = await lireJson(urlJeu(jeu, 'records', { where, limit: 1, select }));
  return j.total_count ?? 0;
}
export const compter = (where) => compterDans(JEU, where, 'vote_detail_id');

// Un jeu entier (ou filtré) en UNE requête, en CSV — pour les gros jeux (99 723 adresses, 52 672
// permis), où paginer par 100 ferait mille requêtes à la Ville pour la même chose. Le robots.txt
// du portail nomme aussi ce chemin (/exports/) ; même décision que pour /api/ (en tête de fichier).
export async function exporterCsv(jeu, { select, where } = {}) {
  const u = urlJeu(jeu, 'exports/csv', { select, where, delimiter: ';', limit: -1, use_labels: 'false' });
  let derniere;
  for (let essai = 1; essai <= 3; essai++) {
    await throttle();
    try {
      const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' } });
      if (r.ok) return r.text();
      derniere = new Error(`HTTP ${r.status} sur ${u}`);
      if (r.status !== 429 && r.status < 500) throw derniere;
    } catch (e) {
      derniere = e;
      if (/^HTTP [34]/.test(e.message)) throw e;
    }
    console.warn(`    (export ${jeu}, essai ${essai}/3 : ${derniere.message})`);
    await sleep(DELAI_MS * essai * 3);
  }
  throw derniere;
}

// La page de la Ville qui montre les lignes d'une séance : le « document officiel » de chaque
// fiche. Ce n'est pas un procès-verbal (la Ville dit d'ailleurs : « Please consult corresponding
// meeting minutes for official vote records »), c'est la donnée elle-même, chez elle.
export const lienSeance = (meetingId) => `${PAGE_JEU}view/?refine=meeting_id%3A${encodeURIComponent(meetingId)}`;

// Les horodatages du jeu sont en UTC (+00:00). L'heure qu'on affiche est celle de Vancouver.
const FORMAT_HEURE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit', hour12: false });
export function heureVancouver(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return FORMAT_HEURE.format(d).replace(':', 'h');
}

// Les types de séance tels que la Ville les écrit, et la clé courte qu'on leur donne pour les
// identifiants. Un type inconnu n'est pas une erreur : il reçoit une clé dérivée de son nom.
export const INSTANCES = {
  'Council': { cle: 'CO', explication: 'The full Council: the Mayor and the ten Councillors, deciding for the whole city.' },
  'Regular Council': { cle: 'RC', explication: 'A regular meeting of the full Council.' },
  'Special Council': { cle: 'SC', explication: 'A Council meeting called outside the regular schedule, usually for one matter.' },
  'Public Hearing': { cle: 'PH', explication: 'Council sitting to hear the public before deciding on rezoning and development applications.' },
  'Policy & Strategic Priorities': { cle: 'PSP', explication: 'A standing committee of the whole Council on policy and strategic matters; its decisions are referred to Council.' },
  'City Finance & Services': { cle: 'CFS', explication: 'A standing committee of the whole Council on finance, contracts and services; its decisions are referred to Council.' },
  'Courts of Revision': { cle: 'CR', explication: 'Council sitting to hear appeals on local improvement charges and parcel taxes.' },
  'Auditor General Committee': { cle: 'AGC', explication: 'The Council committee that oversees the City’s Auditor General.' },
};
export function cleInstance(nom) {
  if (INSTANCES[nom]) return INSTANCES[nom].cle;
  return String(nom ?? 'X').replace(/[^A-Za-z]+/g, ' ').trim().split(' ').map((m) => m[0]?.toUpperCase() ?? '').join('') || 'X';
}
