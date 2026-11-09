// Rafraîchissement TOLÉRANT des données (local ET CI).
//
// Avant, un seul scraper en échec (source bloquée, 403, panne réseau) arrêtait
// TOUT le rafraîchissement — donc aucune donnée n'était publiée, même celles des
// sources qui fonctionnaient (cf. l'échec transitoire du 2026-08-12). Désormais :
// chaque scraper est lancé à tour de rôle ; s'il échoue, on le NOTE et on
// CONTINUE. Le scraper en échec garde simplement ses données de la veille (son
// data/*.json n'est pas réécrit) et le build assemble le site avec ce qui est
// disponible.
//
// Politique de sortie :
//   - Un scraper qui échoue N'ARRÊTE PAS la chaîne (données partielles = publiables).
//   - Le garde-fou anti-corruption OU un build qui échoue EST fatal : on ne publie
//     pas un site cassé (exit 1 → le workflow saute le commit).
//   - En CI, on écrit `builds_ok` et `failed` dans $GITHUB_OUTPUT : le workflow
//     committe les données fraîches si builds_ok, PUIS marque le run en échec si
//     « failed » n'est pas vide (alerte visuelle sans perdre les données).
//
// L'étape des résumés IA (bill-summaries) reste « best effort » : traitée comme
// un scraper tolérant, un échec (clé absente, API en panne) ne bloque rien.
//
// La clé API vient de api.env en local (chargé si le fichier existe) ou des
// variables d'environnement en CI (secret GitHub) — jamais codée en dur.

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

// Lance un script node. Lève une erreur si le code de sortie n'est pas 0.
function runOrThrow(label, nodeArgs) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`code ${res.status}`);
}


// Colombie-Britannique : pas de pétitions en ligne, pas encore de résumés IA ni de promesses (étapes
// à venir, comme en Saskatchewan à ses débuts).
const doPetitions = false;

// 1) Scrapers (source -> data/*.json) — TOLÉRANT. L'ordre compte : les projets de loi rattachent
// leur parrain à la liste des député·e·s, les ministres aussi, et les votes ont besoin des deux.
// Aucune source n'impose de délai ici ; bc-commun.js s'en impose un de 1,5 s, et un passage
// complet lit une centaine de procès-verbaux : comptez quelques minutes.
const SCRAPERS = [
  // deputes.js écrit AUSSI data/deputes-contacts.json et data/mandats.json : l'API de l'Assemblée
  // publie les courriels législatifs, donc pas de scraper de courriels comme au Nouveau-Brunswick.
  ["Scrape : député·e·s, courriels et mandats (API de l'Assemblée)", ['scrapers/deputes.js']],
  ["Scrape : conseil des ministres (API de l'Assemblée)", ['scrapers/ministers.js']],
  ["Scrape : projets de loi et étapes (API de l'Assemblée)", ['scrapers/bills.js']],
  ['Scrape : votes nominatifs (procès-verbaux)', ['scrapers/votes.js']],
  ['Scrape : calendrier parlementaire (leg.bc.ca)', ['scrapers/calendrier.js'], { soft: true }],
];

const failed = [];      // sources critiques → déclenchent l'alerte (run rouge)
const softFailed = [];  // sources « douces » (pétitions) → juste un log, run vert
for (const [label, args, opts = {}] of SCRAPERS) {
  try {
    runOrThrow(label, args);
  } catch (e) {
    (opts.soft ? softFailed : failed).push(label);
    console.error(`⚠ « ${label} » a échoué (${e.message}) — on garde ses données précédentes et on continue.`);
  }
}

// 1.5) Garde-fou anti-corruption : refuse de publier si les données fraîches
// semblent catastrophiquement cassées (une source qui change de format et vide
// un champ pour tout le monde — déjà vu : régions des députés passées à 0).
// Seuils très bas : on n'attrape que les effondrements évidents. Un scraper qui
// a ÉCHOUÉ garde ses données de la veille → il passe ce garde-fou (normal).
function sanityCheck() {
  const arr = (path, key) => {
    try { return JSON.parse(readFileSync(path, 'utf-8'))[key] || []; }
    catch { return []; }
  };
  const deputes = arr('data/deputes.json', 'deputes');
  // Projets de loi : scrapers/bills.js ne garde que la législature la plus récente. Au premier
  // projet de la 44e (après le 17 nov. 2026), la liste passe de ~143 à 1, puis grandit : un
  // plancher fixe de 50 bloquerait TOUT le rafraîchissement pendant des semaines. Le plancher
  // suit donc la veille (git HEAD) : 1 le jour où la législature change, sinon min(50, veille).
  // Une législature qui recule, ou absente, reste suspecte.
  const bills = arr('data/bills.json', 'bills');
  let plancherBills = 50;
  try {
    const veille = JSON.parse(execFileSync('git', ['show', 'HEAD:data/bills.json'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })).bills || [];
    const leg = bills[0]?.legislature, legVeille = veille[0]?.legislature;
    if (!leg || (legVeille && leg < legVeille)) plancherBills = Infinity;
    else if (legVeille && leg > legVeille) plancherBills = 1;
    else plancherBills = Math.max(1, Math.min(50, veille.length));
  } catch { /* pas de veille lisible : on garde 50 */ }
  const checks = [
    ['projets de loi', bills.length, plancherBills],
    // Colombie-Britannique : 49 sièges (quelques-uns peuvent être vacants), pas de régions, peu de
    // votes nominatifs (la plupart des projets passent de vive voix).
    ['député·e·s', deputes.length, 40],
    ['député·e·s avec parti', deputes.filter((d) => d.party).length, 40],
    ['ministres', arr('data/ministers.json', 'ministers').length, 10],
  ];
  const failures = checks.filter(([, n, min]) => n < min);
  if (failures.length) {
    console.error('\n✖ Garde-fou : données suspectes — AUCUNE injection, aucun commit.');
    for (const [label, n, min] of failures) console.error(`   - ${label} : ${n} (minimum attendu : ${min})`);
    throw new Error('garde-fou anti-corruption déclenché');
  }
  console.log('\n✓ Garde-fou OK : ' + checks.map(([l, n]) => `${l}=${n}`).join(', '));
}

// 2) Builds (data/*.json -> gabarit.html) — FATAL : on ne publie pas un site cassé.
let publishOk = true;
try {
  sanityCheck();
  const BUILDS = [
    ['Build : projets de loi -> gabarit.html', ['scrapers/build-frontend-data.js']],
    ['Build : députés -> gabarit.html', ['scrapers/build-deputes-data.js']],
    ['Build : courriels -> gabarit.html', ['scrapers/build-depute-emails-data.js']],
    ['Build : votes -> gabarit.html', ['scrapers/build-votes-data.js']],
    ['Build : ministres -> gabarit.html', ['scrapers/build-ministers-data.js']],
    // Ni pétitions ni promesses en Colombie-Britannique : le guide les exclut des nouvelles
    // provinces, et l'Assemblée ne tient pas de pétition en ligne de toute façon.
    // « Quoi de neuf » dérivé des projets de loi et des votes déjà scrapés —
    // APRÈS eux, donc, pour refléter les données du jour.
    ['Build : quoi de neuf -> gabarit.html', ['scrapers/build-news-data.js']],
    // Pages de section pré-rendues (SEO) : APRÈS toutes les injections ci-dessus.
    ['Build : les 7 pages, depuis gabarit.html', ['scripts/build-section-pages.js']],
  ];
  for (const [label, args] of BUILDS) runOrThrow(label, args);
} catch (e) {
  publishOk = false;
  console.error(`\n✖ Étape critique échouée (${e.message}) — rien ne sera publié.`);
}

console.log('\n──────── Résumé du rafraîchissement ────────');
console.log(`  scrapers critiques en échec : ${failed.length ? failed.join(' | ') : 'aucun'}`);
console.log(`  sources douces en échec     : ${softFailed.length ? softFailed.join(' | ') : 'aucune'} (garde les données de la veille, pas d'alerte)`);
console.log(`  garde-fou + build           : ${publishOk ? 'OK' : 'ÉCHEC'}`);

// Sorties pour GitHub Actions (ignorées en local, où $GITHUB_OUTPUT n'existe pas).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `builds_ok=${publishOk}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed.join(' | ')}\n`);
}

// Fatal UNIQUEMENT si le garde-fou/build a cassé. Un scraper raté ne fait pas
// échouer ce process (sinon l'étape de commit serait sautée et on ne publierait
// pas les données fraîches des autres) : c'est le workflow qui transforme
// « failed » en échec de run APRÈS le commit, pour l'alerte.
process.exit(publishOk ? 0 : 1);
