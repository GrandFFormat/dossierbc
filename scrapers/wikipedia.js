// Scraper — la page Wikipédia de chaque député·e (le bouton « W » des fiches).
//
// Pourquoi : l'Assemblée publie un nom, une circonscription et un parti. Elle ne raconte pas un
// parcours. Wikipédia le fait, et c'est la seule source libre qui couvre les 93 sièges.
//
// Source : l'article « <N>rd Parliament of British Columbia » d'en.wikipedia.org, section
// « Members ». Son tableau nomme les membres de la législature et pointe vers l'article de
// chacun·e : le lien n'est donc jamais deviné, il est RECOPIÉ de la source.
//
// Le robots.txt d'en.wikipedia.org (relu à chaque exécution, c'est le code qui obéit) interdit
// /w/ et /api/ à tout le monde : l'API MediaWiki est donc hors de question ici. On lit les pages
// /wiki/, qui sont ouvertes — exactement ce qu'un navigateur lit.
//
// Deux pièges vus le 8 novembre 2026 :
//   1. l'Assemblée écrit les noms traditionnels en préfixe (« Laanas - Tamara Davidson »), pas
//      Wikipédia : on compare aussi ce qui suit le tiret ;
//   2. une personne peut vivre sous un autre prénom d'usage (« Reah Arora » chez Wikipédia,
//      « Rohini Arora » à l'Assemblée). Pour ces restes, on essaie SON nom à elle en adresse
//      directe, et on n'accepte la page que si elle se dit bien de l'Assemblée de la C.-B.
// Un nom qu'on n'arrive pas à rattacher reste sans lien et s'affiche dans le rapport. Aucune
// fiche ne reçoit un lien « probable ».

import { writeFileSync, readFileSync } from 'node:fs';
import { plierNom, rang, USER_AGENT } from './bc-commun.js';

const HOTE = 'https://en.wikipedia.org';
const OUT_PATH = 'data/wikipedia.json';
const DELAI_MS = 1500;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// --- robots.txt --------------------------------------------------------------------------------
let interdits = null;
async function reglesRobots() {
  if (interdits) return interdits;
  const res = await fetch(`${HOTE}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${HOTE}/robots.txt : HTTP ${res.status} — on ne devine pas ses règles`);
  const regles = { interdits: [], permis: [] };
  let pourNous = false;
  for (const brut of (await res.text()).split(/\r?\n/)) {
    const ligne = brut.replace(/#.*/, '').trim();
    const [cle, ...reste] = ligne.split(':');
    const val = reste.join(':').trim();
    if (/^user-agent$/i.test(cle)) pourNous = val === '*' || /dossier/i.test(val);
    else if (pourNous && /^disallow$/i.test(cle) && val) regles.interdits.push(val);
    else if (pourNous && /^allow$/i.test(cle) && val) regles.permis.push(val);
  }
  return (interdits = regles);
}

/** Lit une page /wiki/ d'en.wikipedia.org, à notre rythme, robots.txt vérifié. */
let derniere = 0;
async function lirePage(chemin) {
  const regles = await reglesRobots();
  const motif = (m) => new RegExp('^' + m.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
  if (regles.interdits.some((m) => motif(m).test(chemin)) && !regles.permis.some((m) => motif(m).test(chemin))) {
    throw new Error(`${chemin} : interdit par le robots.txt d'en.wikipedia.org — on ne le lit pas`);
  }
  const attente = DELAI_MS - (Date.now() - derniere);
  if (attente > 0) await dormir(attente);
  derniere = Date.now();
  const res = await fetch(HOTE + chemin, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${HOTE}${chemin} : HTTP ${res.status}`);
  return res.text();
}

// --- les noms ----------------------------------------------------------------------------------
/** Les écritures sous lesquelles un même nom peut se présenter, pliées pour la comparaison. */
function clesDuNom(nom) {
  const sans = String(nom).replace(/[ʼʾ’]/g, "'");
  const cles = new Set([plierNom(sans)]);
  // « Laanas - Tamara Davidson » : l'Assemblée met le nom traditionnel devant, Wikipédia non.
  const apresTiret = sans.split(/\s[-–]\s/).pop();
  if (apresTiret) cles.add(plierNom(apresTiret));
  return [...cles].filter(Boolean);
}

/** Une page d'article se dit-elle bien de l'Assemblée de la Colombie-Britannique ? */
const estDeputeBC = (html) =>
  /Legislative[ _]Assembly[ _]of[ _]British[ _]Columbia/i.test(html)
  && /British[ _]Columbia[ _]MLAs/i.test(html);

// --- le tableau des membres ----------------------------------------------------------------------
/**
 * Les liens du tableau « Members ». Le modèle {{sortname}} de Wikipédia enveloppe le nom d'une
 * personne dans <span class="fn"> (une hCard) : c'est ce repère qui distingue son lien de celui
 * de sa circonscription ou de son parti, sur la même rangée. Il tient dans les deux HTML que
 * Wikipédia sert selon le visiteur — l'ancien (href="/wiki/…") et celui de Parsoid
 * (href="https://en.wikipedia.org/wiki/…"). Un article inexistant n'a pas d'adresse en /wiki/ :
 * il ne passe donc pas ce filtre.
 */
function liensDesMembres(html) {
  const out = [];
  const re = /<span class="fn">\s*<a [^>]*href="(?:https:\/\/en\.wikipedia\.org)?\/wiki\/([^"#?]+)"[^>]*>([^<]+)<\/a>/g;
  for (const m of html.matchAll(re)) {
    out.push({ article: decodeURIComponent(m[1]), affiche: m[2].replace(/&amp;/g, '&').trim() });
  }
  return out;
}

async function main() {
  const brut = JSON.parse(readFileSync('data/deputes.json', 'utf8'));
  const deputes = Array.isArray(brut) ? brut : (brut.deputes ?? []);
  const leg = brut.legislature;
  if (!deputes.length || !leg) throw new Error('data/deputes.json : ni député·e·s ni législature — lancer deputes.js d\'abord');

  const page = `/wiki/${leg}${rang(leg)}_Parliament_of_British_Columbia`;
  const html = await lirePage(page);
  if (!html) throw new Error(`${HOTE}${page} : l'article de la ${leg}e législature n'existe pas`);
  const membres = liensDesMembres(html);
  if (membres.length < 50) throw new Error(`${page} : ${membres.length} membre(s) lu(s) dans le tableau — gabarit changé`);

  const parCle = new Map();
  for (const m of membres) for (const c of clesDuNom(m.affiche)) if (!parCle.has(c)) parCle.set(c, m.article);

  const liens = {};
  const sansLien = [];
  const parAdresse = [];
  for (const d of deputes) {
    if (!d.assnatId) continue;
    const trouve = clesDuNom(d.name).map((c) => parCle.get(c)).find(Boolean);
    if (trouve) { liens[d.assnatId] = `${HOTE}/wiki/${encodeURI(trouve).replace(/%2C/g, ',')}`; continue; }
    parAdresse.push(d);
  }

  // Les restes : on essaie leur nom tel que l'Assemblée l'écrit, et on vérifie la page.
  for (const d of parAdresse) {
    const nom = String(d.name).split(/\s[-–]\s/).pop().replace(/\s+/g, '_');
    const art = await lirePage(`/wiki/${encodeURI(nom)}`);
    if (art && estDeputeBC(art)) {
      const canonique = art.match(/<link rel="canonical" href="https:\/\/en\.wikipedia\.org\/wiki\/([^"]+)"/);
      liens[d.assnatId] = `${HOTE}/wiki/${canonique ? canonique[1] : encodeURI(nom)}`;
      console.log(`  · ${d.name} : rattaché·e par son nom d'Assemblée`);
    } else {
      sansLien.push(d.name);
    }
  }

  const sortie = {
    luLe: new Date().toISOString(),
    source: HOTE + page,
    avis: 'Liens recopiés du tableau « Members » de l\'article de la législature. Aucun lien deviné.',
    legislature: leg,
    count: Object.keys(liens).length,
    liens,
    sansLien,
  };
  writeFileSync(OUT_PATH, JSON.stringify(sortie, null, 2));
  console.log(`✓ ${OUT_PATH} : ${sortie.count} lien(s) sur ${deputes.length} député·e·s`);
  if (sansLien.length) console.log(`  sans page Wikipédia : ${sansLien.join(', ')}`);
}

main().catch((e) => { console.error(`✖ wikipedia : ${e.message}`); process.exit(1); });
