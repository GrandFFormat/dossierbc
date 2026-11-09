// Scraper — le résultat de la dernière élection générale.
//
// Pourquoi Wikipédia et pas Elections BC : elections.bc.ca ferme son robots.txt à tout le monde
// sauf Google, Bing et son propre moteur. On ne contourne pas. L'Assemblée, elle, ne publiera les
// député·e·s de la nouvelle législature qu'à la réception des résultats certifiés. Entre les deux,
// la seule source lisible honnêtement est l'article de Wikipédia sur le scrutin — nommé comme tel
// sur la page, avec le jour de la lecture, et remplacé par les chiffres de l'Assemblée dès
// qu'ils existent.
//
// Le robots.txt d'en.wikipedia.org interdit /w/ et /api/ : on lit la page /wiki/, comme un
// navigateur. Voir scrapers/wikipedia.js, même règle.
//
// Ce qu'on lit : le tableau « Summary of the … results of the <année> British Columbia general
// election ». PAS celui du « Student Vote » — une élection simulée dans les écoles, qui porte des
// chiffres très proches dans le même article. Le titre du tableau est donc vérifié.
//
// Les colonnes ne sont jamais prises par leur position : on lit la rangée d'en-têtes, on y cherche
// l'année du scrutin (sièges) et le « % » du vote populaire, et on en déduit les index. Si
// Wikipédia réorganise son tableau, le scraper s'arrête au lieu d'écrire n'importe quoi.

import { writeFileSync, readFileSync } from 'node:fs';
import { USER_AGENT } from './bc-commun.js';

const HOTE = 'https://en.wikipedia.org';
const OUT_PATH = 'data/election.json';

const MOIS_EN = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

/** Les étiquettes de Wikipédia, et le code court de la page. Un parti absent reste sans code. */
const CODES = [
  [/^conservative/i, 'CON'],
  [/^new democratic|^bc ndp/i, 'NDP'],
  [/^green/i, 'VERT'],
  [/^independent/i, 'IND'],
];
const codeDe = (nom) => CODES.find(([re]) => re.test(nom))?.[1] ?? null;

async function lirePage(chemin) {
  const res = await fetch(HOTE + '/robots.txt', { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${HOTE}/robots.txt : HTTP ${res.status} — on ne devine pas ses règles`);
  let pourNous = false;
  const interdits = [];
  for (const brut of (await res.text()).split(/\r?\n/)) {
    const ligne = brut.replace(/#.*/, '').trim();
    const [cle, ...reste] = ligne.split(':');
    const val = reste.join(':').trim();
    if (/^user-agent$/i.test(cle)) pourNous = val === '*' || /dossier/i.test(val);
    else if (pourNous && /^disallow$/i.test(cle) && val) interdits.push(val);
  }
  if (interdits.some((m) => chemin.startsWith(m.replace(/\*.*$/, '')))) {
    throw new Error(`${chemin} : interdit par le robots.txt d'en.wikipedia.org`);
  }
  const page = await fetch(HOTE + chemin, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!page.ok) throw new Error(`${HOTE}${chemin} : HTTP ${page.status}`);
  return page.text();
}

/** Le contenu texte des cellules d'une rangée. */
const cellules = (tr) =>
  [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());

const entier = (s) => {
  const n = Number(String(s).replace(/\[[^\]]*\]/g, '').replace(/[,\s]/g, ''));
  return Number.isInteger(n) ? n : null;
};
const nombre = (s) => {
  const n = Number(String(s).replace(/\[[^\]]*\]/g, '').replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const etat = JSON.parse(readFileSync('data/deputes.json', 'utf8'));
  const debut = etat.legislatureEnCoursDebut;
  if (!debut) throw new Error('data/deputes.json ne dit pas quand la législature en cours a commencé');
  const annee = Number(String(debut).slice(0, 4));

  const chemin = `/wiki/${annee}_British_Columbia_general_election`;
  const html = await lirePage(chemin);

  // Le jour du scrutin, écrit en toutes lettres dans la première phrase de l'article.
  const quand = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    .match(/general election was held on ([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  const mois = quand ? MOIS_EN.indexOf(quand[1].toLowerCase()) + 1 : 0;
  const scrutin = quand && mois
    ? `${quand[3]}-${String(mois).padStart(2, '0')}-${String(Number(quand[2])).padStart(2, '0')}`
    : null;
  if (!scrutin) throw new Error(`${chemin} : la date du scrutin n'est pas lisible dans l'article`);

  // LE bon tableau : son titre nomme l'élection générale, pas le « Student Vote ».
  let table = null;
  for (const m of html.matchAll(/<caption[^>]*>([\s\S]*?)<\/caption>/g)) {
    const titre = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/results of the .*general election/i.test(titre) || /student/i.test(titre)) continue;
    const debutTable = html.lastIndexOf('<table', m.index);
    const finTable = html.indexOf('</table>', m.index);
    if (debutTable < 0 || finTable < 0) continue;
    table = html.slice(debutTable, finTable);
    break;
  }
  if (!table) throw new Error(`${chemin} : tableau des résultats introuvable — l'article a changé de forme`);

  const rangees = table.split(/<tr[^>]*>/).slice(1).map(cellules).filter((c) => c.length);

  // Les en-têtes : l'année du scrutin donne la colonne des sièges, le « % » celle du vote.
  const iEntetes = rangees.findIndex((c) => c.includes(String(annee)) && c.some((x) => /^%$/.test(x)));
  if (iEntetes < 0) throw new Error(`${chemin} : la rangée d'en-têtes ne nomme ni ${annee} ni le pourcentage du vote`);
  const sous = rangees[iEntetes];
  const colSieges = sous.indexOf(String(annee));
  const colPourcent = sous.findIndex((x, i) => /^%$/.test(x) && i > colSieges);
  if (colSieges < 0 || colPourcent < 0) throw new Error(`${chemin} : colonnes des sièges ou du vote introuvables`);

  // Une rangée de parti porte : [couleur, parti, chef, candidat·e·s, …les sous-colonnes]. La
  // rangée des indépendant·e·s n'a PAS de cellule « chef » : tout y glisse d'un cran. On ne compte
  // donc pas les colonnes depuis la gauche, on les compte depuis la DROITE — les sous-colonnes
  // finissent toujours la rangée. Une rangée qui n'a pas la forme d'un parti est sautée.
  const partis = [];
  for (const c of rangees.slice(iEntetes + 1)) {
    const nom = c[1] ?? '';
    if (/^(total|turnout|rejected|registered|source|eligible|valid)/i.test(c[0] ?? '')) break;
    const base = c.length - sous.length;
    if (!nom || base < 3) continue;
    const sieges = entier(c[base + colSieges]);
    if (sieges === null) continue;
    const chef = base >= 4 ? (c[2] ?? '') : '';
    partis.push({
      nom,
      code: codeDe(nom),
      chef: chef.replace(/\s*\((interim|intérimaire)\)\s*$/i, '').trim() || null,
      interimaire: /\(interim\)/i.test(chef),
      sieges,
      pourcentVote: nombre(c[base + colPourcent]),
    });
  }
  if (!partis.length) throw new Error(`${chemin} : aucune rangée de parti lue dans le tableau`);

  const total = partis.reduce((s, p) => s + p.sieges, 0);
  const gagnant = [...partis].sort((a, b) => b.sieges - a.sieges)[0];

  const sortie = {
    luLe: new Date().toISOString(),
    lueLeJour: new Date().toISOString().slice(0, 10),
    source: HOTE + chemin,
    sourceNom: 'Wikipedia',
    avis: "Résultats lus sur Wikipédia, faute de source officielle lisible : elections.bc.ca "
      + "interdit la lecture automatisée, et l'Assemblée ne publie ses député·e·s qu'à la "
      + 'réception des résultats certifiés.',
    scrutin,
    siegesTotal: total,
    majorite: Math.floor(total / 2) + 1,
    gagnant: gagnant.code,
    majoritaire: gagnant.sieges > total / 2,
    partis,
  };
  writeFileSync(OUT_PATH, JSON.stringify(sortie, null, 2) + '\n');
  console.log(`✓ ${OUT_PATH} : scrutin du ${scrutin}, ${total} sièges`);
  for (const p of partis) console.log(`   ${String(p.sieges).padStart(3)} · ${p.nom}${p.code ? ` (${p.code})` : ''} — ${p.pourcentVote ?? '?'} %`);
}

main().catch((e) => { console.error(`✖ election : ${e.message}`); process.exit(1); });
