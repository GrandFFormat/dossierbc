// Le budget d'immobilisations de la Ville de Vancouver, et le budget des élus.
//
//   node scrapers/budget.js
//
// SOURCES (portail de données ouvertes, même licence que les votes) :
//   1. « 2026 Multi-Year Capital Project Budget requests and Capital Expenditure Budget » — 630 projets,
//      classés en trois niveaux de service (service_category_1/2/3), avec le budget déjà approuvé, les
//      demandes de 2026, le budget ouvert, la dépense prévue en 2026 et les prévisions 2027 à 2030.
//      C'est ce que la Ville va BÂTIR et ACHETER, pas son budget de fonctionnement.
//   2. « Council budget and expenses » — 27 lignes : les budgets de bureau du maire et des élus.
//
// CE QU'ON N'A PAS, et qu'on ne fabrique pas : Vancouver ne publie ni ses taux de taxe foncière ni
// ses dépenses de fonctionnement par service en données ouvertes. La page Budget de Montréal a un
// calculateur de taxes et la répartition des dépenses (rapport du MAMH) ; celle de Vancouver aura
// le plan d'immobilisations et le budget des élus, et dira pourquoi pas le reste.
//
// Sortie : data/budget.json

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LICENCE, ATTRIBUTION, USER_AGENT, metadonneesDe, toutesLesLignesDe, pageDuJeu } from '../lib/van.js';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const IMMO = '2026-multi-year-capital-project-budget-requests-and-capital-expenditure-budget';
const CONSEIL = 'council-budget-and-expenses';
const ANNEE = 2026;

const n = (v) => { const x = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(x) ? x : 0; };

const metaI = await metadonneesDe(IMMO);
console.log(`Jeu « ${metaI.titre} » : ${metaI.nombreTotal} lignes, modifié le ${(metaI.modifieLe ?? '').slice(0, 10)}. Robot : ${USER_AGENT}`);
const { lignes } = await toutesLesLignesDe(IMMO, null, { orderBy: 'service_category_1,service_category_2,service_category_3,project_program_name', etiquette: 'projets' });

// Les noms de colonnes sont longs et datés (« 2026_new_… ») : on les reconnaît par famille.
const champs = metaI.champs;
const trouver = (re) => champs.find((c) => re.test(c)) ?? null;
const C = {
  cat1: trouver(/^service_category_1$/), cat2: trouver(/^service_category_2$/), cat3: trouver(/^service_category_3$/),
  projet: trouver(/project_program_name/),
  approuve: trouver(/previously_approved/),
  demande: trouver(/^\d{4}_new_multi_year_capital_project_budgets_requests$/),
  ouvert: trouver(/total_open_project_budget/),
  disponible: trouver(/^available_project_budget/),
  depense: trouver(/annual_capital_expenditure_\d{4}_capital_expenditure_budget/),
  prev: [2027, 2028, 2029, 2030].map((a) => [a, trouver(new RegExp(`annual_capital_expenditure_${a}_forecast`))]),
};
for (const [k, v] of Object.entries(C)) if (!v || (Array.isArray(v) && v.some(([, c]) => !c))) console.warn(`⚠ colonne non reconnue pour « ${k} » — champs : ${champs.join(', ')}`);

const categories = new Map();
for (const l of lignes) {
  const c1 = String(l[C.cat1] ?? 'Other').trim() || 'Other';
  const c2 = String(l[C.cat2] ?? '').trim();
  const cat = categories.get(c1) ?? categories.set(c1, { nom: c1, depense: 0, ouvert: 0, demande: 0, previsions: { 2027: 0, 2028: 0, 2029: 0, 2030: 0 }, sousCategories: new Map() }).get(c1);
  const sous = cat.sousCategories.get(c2) ?? cat.sousCategories.set(c2, { nom: c2, depense: 0, projets: [] }).get(c2);
  const projet = {
    nom: String(l[C.projet] ?? '').trim(),
    cat3: String(l[C.cat3] ?? '').trim(),
    approuve: n(l[C.approuve]), demande: n(l[C.demande]), ouvert: n(l[C.ouvert]), disponible: n(l[C.disponible]), depense: n(l[C.depense]),
    previsions: Object.fromEntries(C.prev.map(([a, c]) => [a, n(l[c])])),
  };
  sous.projets.push(projet);
  sous.depense += projet.depense;
  cat.depense += projet.depense; cat.ouvert += projet.ouvert; cat.demande += projet.demande;
  for (const a of [2027, 2028, 2029, 2030]) cat.previsions[a] += projet.previsions[a];
}
const immobilisations = {
  source: pageDuJeu(IMMO), jeu: IMMO, jeuModifieLe: metaI.modifieLe, annee: ANNEE,
  nombreProjets: lignes.length,
  totalDepense: [...categories.values()].reduce((s, c) => s + c.depense, 0),
  totalOuvert: [...categories.values()].reduce((s, c) => s + c.ouvert, 0),
  totalDemande: [...categories.values()].reduce((s, c) => s + c.demande, 0),
  previsions: [2027, 2028, 2029, 2030].reduce((o, a) => ({ ...o, [a]: [...categories.values()].reduce((s, c) => s + c.previsions[a], 0) }), {}),
  categories: [...categories.values()].sort((a, b) => b.depense - a.depense).map((c) => ({
    ...c,
    sousCategories: [...c.sousCategories.values()].sort((a, b) => b.depense - a.depense).map((s) => ({ ...s, projets: s.projets.sort((a, b) => b.depense - a.depense) })),
  })),
};

// Le budget des élus : des lignes qu'on garde telles quelles, avec leurs noms de colonnes — on ne
// connaît pas la structure d'avance, et la page les affiche en tableau.
let conseil = null;
try {
  const metaC = await metadonneesDe(CONSEIL);
  const { lignes: lc } = await toutesLesLignesDe(CONSEIL, null, { orderBy: metaC.champs[0], etiquette: 'lignes du budget des élus' });
  conseil = { source: pageDuJeu(CONSEIL), jeu: CONSEIL, titre: metaC.titre, jeuModifieLe: metaC.modifieLe, champs: metaC.champs, types: metaC.types, lignes: lc };
} catch (e) {
  console.warn(`⚠ budget des élus non lu : ${e.message}`);
}

await mkdir('data', { recursive: true });
await writeFile('data/budget.json.tmp', JSON.stringify({
  source: pageDuJeu(IMMO),
  licence: `${LICENCE.nom} ${LICENCE.version} — ${LICENCE.url}`,
  attribution: ATTRIBUTION,
  extraction: new Date().toISOString(),
  immobilisations,
  conseil,
}, null, 1), 'utf8');
await rename('data/budget.json.tmp', 'data/budget.json');
const M = (x) => (x / 1e6).toFixed(1) + ' M$';
console.log(`Budget : ${lignes.length} projets, dépense d'immobilisations ${ANNEE} ${M(immobilisations.totalDepense)}, budget ouvert ${M(immobilisations.totalOuvert)} ; ${immobilisations.categories.length} catégories.`);
console.log('  ' + immobilisations.categories.slice(0, 6).map((c) => `${c.nom} ${M(c.depense)}`).join(' · '));
if (conseil) console.log(`  Budget des élus : ${conseil.lignes.length} lignes, colonnes ${conseil.champs.join(', ')}`);
