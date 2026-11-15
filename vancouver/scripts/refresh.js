// Rafraîchissement du volet Vancouver — en local, à la main.
//
//   npm run refresh                                  la fenêtre de la maquette (juin–juillet 2026)
//   npm run refresh -- --depuis=2026-09-01 --jusqua=2026-10-31
//   npm run refresh -- --fichier=data/brut/council-voting-records.csv
//
// Tolérant, comme scripts/refresh.js de Montréal : une étape qui échoue est notée et on continue,
// la source en panne gardant ses données de la veille.
//
// PAS DE ROBOT. Ce volet est une maquette (Martin, 15 nov. 2026 : « on ne l'activera pas »). Il n'a
// ni workflow GitHub ni planification : on le relance à la main quand on veut regarder une autre
// fenêtre. Avant d'en faire un robot hebdomadaire, deux choses à trancher — voir lib/van.js : le
// robots.txt du portail (« Disallow: /api/ »), et la publication sous dossierbc.ca/vancouver/.
//
// CE QUE ÇA COÛTE À LA VILLE, PAR PASSAGE : les métadonnées du jeu (une requête), son robots.txt
// (une requête), puis une page de 100 lignes par tranche de 100 votes de la fenêtre — dix-neuf
// requêtes pour juin–juillet 2026 — à une seconde d'écart. Rien d'autre : pas de PDF, pas de page
// du site de la Ville. Par la porte du fichier (--fichier), une seule requête : le robots.txt.
//
// CE QUE ÇA COÛTE EN IA : zéro. Vancouver ne publie pas le texte de ses décisions ; il n'y a rien
// à résumer, donc aucun appel à l'API Anthropic dans ce volet.

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [cle, valeur] = raw.replace(/^--/, '').split('=');
    return [cle, valeur ?? true];
  })
);

// LA FENÊTRE DE LA MAQUETTE : juin et juillet 2026, les deux derniers mois où le conseil a siégé
// pour vrai. Mesuré le 15 nov. 2026 sur le jeu de la Ville : mai 1 034 bulletins, juin 671,
// juillet 1 133, août 22, septembre 0, octobre 11, novembre 0. Élections municipales de la
// Colombie-Britannique le 17 octobre 2026 : le conseil était en pause. « Les deux derniers mois »
// au sens strict — septembre et octobre — n'auraient montré que onze bulletins sur un seul point.
const depuis = args.get('depuis') ?? '2026-06-01';
const jusqua = args.get('jusqua') ?? '2026-07-31';
const fichier = args.get('fichier');

// Les trois autres onglets lisent d'autres jeux du même portail. Secondaires : s'ils tombent, le
// cœur (les votes) est quand même publié. --sans-adresses saute la relecture des 99 723 adresses
// (un export de plusieurs méga-octets) quand l'index existe déjà.
const ETAPES = [
  {
    nom: `Votes nominatifs, séances, membres (${depuis} → ${jusqua})`,
    argv: ['scrapers/votes.js', `--depuis=${depuis}`, `--jusqua=${jusqua}`, ...(fichier ? [`--fichier=${fichier}`] : [])],
  },
  { nom: 'Lexique, mesuré sur les points votés', argv: ['scrapers/lexique.js'], secondaire: true },
  { nom: 'Contrats attribués (12 derniers mois du jeu)', argv: ['scrapers/contrats.js'], secondaire: true },
  { nom: 'Budget d’immobilisations 2026 et budget des élus', argv: ['scrapers/budget.js'], secondaire: true },
  { nom: 'Près de chez moi : quartiers, adresses, permis, chantiers', argv: ['scrapers/pres-de-chez-moi.js', ...(args.has('sans-adresses') ? ['--sans-adresses'] : [])], secondaire: true },
];

try {
  const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  if (rev.status === 0) console.log(`Code : commit ${rev.stdout.trim()} — Node ${process.version}`);
} catch {
  // pas de git : tant pis
}

const echecs = [];
const avertissements = [];
for (const etape of ETAPES) {
  console.log(`\n=== ${etape.nom} ===`);
  const res = spawnSync(process.execPath, etape.argv, { stdio: 'inherit' });
  if (res.status === 0) continue;
  if (etape.secondaire) {
    avertissements.push(etape.nom);
    console.warn(`⚠ « ${etape.nom} » a échoué (code ${res.status}) — on garde les données précédentes, ça attendra.`);
  } else {
    echecs.push(etape.nom);
    console.error(`✖ « ${etape.nom} » a échoué (code ${res.status}) — données précédentes conservées.`);
  }
}

console.log('\n=== Bilan ===');
console.log(`  étapes         : ${ETAPES.length}`);
console.log(`  échecs         : ${echecs.length ? echecs.join(' | ') : 'aucun'}`);
console.log(`  avertissements : ${avertissements.length ? avertissements.join(' | ') : 'aucun'}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `failed=${echecs.join(' | ')}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${avertissements.join(' | ')}\n`);
}
process.exitCode = echecs.length ? 1 : 0;
