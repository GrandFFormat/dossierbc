// Scraper — le calendrier parlementaire de la Colombie-Britannique.
//
// Sert à la bande du haut : « l'Assemblée ne siège pas » et la date de la prochaine séance. Sans
// elle, un visiteur d'été croit le site en panne. Les dates ne sont jamais écrites à la main.
//
// Source : la page officielle du calendrier (leg.bc.ca/parliamentary-business/parliamentary-
// calendar). Le calendrier y est dessiné en JavaScript, mais ses données sont dans la page, dans
// le bloc de configuration de Drupal (script application/json, clé fullCalendarView) : on les lit
// là, sans exécuter la page.
//
// Ce que l'Assemblée publie : des semaines « In Session », les jours de congé, le discours du
// Trône et le jour du budget. Pas d'heure de séance par jour : les heures sont écrites en toutes
// lettres plus bas dans la page (lundi 10 h, etc.) et ne sont pas lues ici.
//
// Un avertissement de la page à retenir : « provided for informational purposes only and subject
// to further change by order of the Legislative Assembly ». Le site le répète.
//
// Piège : après une élection, le calendrier publié peut ne rien contenir pour la nouvelle
// législature. On écrit alors prochaineSeance: null, et la page dit que la date n'est pas publiée
// plutôt que d'inventer une reprise.

import { writeFileSync } from 'node:fs';
import { lire, texte as texteDe, HOTE } from './bc-commun.js';

const MOIS_EN = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

const PAGE = `${HOTE}/parliamentary-business/parliamentary-calendar`;
const OUT_PATH = 'data/calendrier.json';

/** Les intitulés de la page, et notre genre. Une coquille de l'Assemblée est tolérée (Holdiay). */
const GENRES = [
  { re: /^in session$/i, genre: 'seance' },
  { re: /^speech from the throne$/i, genre: 'trone' },
  { re: /^budget day$/i, genre: 'budget' },
  // « Holdiay » n'est pas une faute de notre côté : c'est l'orthographe d'un congé de 2024 dans le
  // calendrier de l'Assemblée. On l'accepte plutôt que de ranger ce jour dans « autre ».
  { re: /holiday|holdiay|observance/i, genre: 'conge' },
];

const jour = (s) => String(s ?? '').slice(0, 10) || null;

/** Les jours ouvrables de debut à fin inclus : l'Assemblée publie des semaines, pas des jours. */
function joursDe(debut, fin) {
  const out = [];
  const d = new Date(`${debut}T12:00:00Z`);
  const f = new Date(`${(fin ?? debut)}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return out;
  for (let x = d; x <= f; x = new Date(x.getTime() + 86400000)) {
    const n = x.getUTCDay();
    if (n >= 1 && n <= 5) out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  const html = await lire(PAGE);
  const bloc = html.match(/<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/);
  if (!bloc) throw new Error('bloc de configuration introuvable dans la page du calendrier — gabarit changé');
  let reglages;
  try {
    reglages = JSON.parse(bloc[1]);
  } catch (e) {
    throw new Error(`bloc de configuration illisible : ${e.message}`);
  }
  const vue = reglages.fullCalendarView?.[0];
  if (!vue?.calendar_options) throw new Error('aucun calendrier dans le bloc de configuration');
  let options;
  try {
    options = JSON.parse(vue.calendar_options);
  } catch (e) {
    throw new Error(`options du calendrier illisibles : ${e.message}`);
  }
  const brut = options.events ?? [];
  if (!brut.length) throw new Error('le calendrier ne contient aucun événement');

  const evenements = [];
  for (const e of brut) {
    const titre = String(e.title ?? '').trim();
    const def = GENRES.find((g) => g.re.test(titre));
    const debut = jour(e.start);
    if (!debut) continue;
    evenements.push({
      genre: def?.genre ?? 'autre',
      titre,
      debut,
      fin: jour(e.end) ?? debut,
      source: PAGE,
    });
  }
  evenements.sort((a, b) => a.debut.localeCompare(b.debut));

  // Les jours de séance, à plat : c'est ce que la bande du haut interroge.
  const conges = new Set();
  for (const e of evenements.filter((x) => x.genre === 'conge')) for (const j of joursDe(e.debut, e.fin)) conges.add(j);
  const seances = new Set();
  for (const e of evenements.filter((x) => x.genre === 'seance')) for (const j of joursDe(e.debut, e.fin)) seances.add(j);
  const joursDeSeance = [...seances].filter((j) => !conges.has(j)).sort();

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const prochaine = joursDeSeance.find((j) => j >= aujourdhui) ?? null;
  const siegeAujourdhui = joursDeSeance.includes(aujourdhui);

  // Entre une élection et la première séance, le calendrier est muet : l'Assemblée met son état
  // en toutes lettres sur son accueil (« HAPPENING @ the Legislature »). On en tire LA DATE, pas
  // la phrase — leg.bc.ca/copyright interdit de reproduire son texte. Si la phrase disparaît ou
  // change de tournure, la date passe à null et le site se tait, plutôt que de garder une date
  // périmée. Lu le 8 novembre 2026 : résultats certifiés attendus le 18 novembre 2026.
  const resultatsCertifies = await (async () => {
    try {
      const accueil = texteDe(await lire(HOTE));
      const m = accueil.match(/certified results on\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
      if (!m) return null;
      const mois = MOIS_EN.indexOf(m[1].toLowerCase()) + 1;
      if (!mois) return null;
      return `${m[3]}-${String(mois).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
    } catch (e) {
      console.log(`  accueil de l'Assemblée illisible (${e.message}) — aucun avis de résultats certifiés`);
      return null;
    }
  })();

  writeFileSync(OUT_PATH, JSON.stringify({
    luLe: new Date().toISOString(),
    lueLeJour: aujourdhui,
    source: PAGE,
    avis: "Calendrier publié à titre indicatif par l'Assemblée, et modifiable par ordre de la Chambre.",
    siegeAujourdhui,
    prochaineSeance: prochaine ? { date: prochaine, source: PAGE } : null,
    resultatsCertifies: resultatsCertifies ? { date: resultatsCertifies, source: HOTE } : null,
    joursDeSeance,
    annees: [...new Set(joursDeSeance.map((j) => j.slice(0, 4)))].sort(),
    count: evenements.length,
    evenements,
  }, null, 2) + '\n');

  const aVenir = joursDeSeance.filter((j) => j >= aujourdhui);
  console.log(`${evenements.length} événements écrits dans ${OUT_PATH} — ${joursDeSeance.length} jours de séance publiés, ${aVenir.length} encore à venir`);
  console.log(prochaine
    ? `  prochaine séance publiée : ${prochaine}`
    : "  aucune séance à venir dans le calendrier publié : la page le dira plutôt que d'inventer une date");
  const parGenre = {};
  for (const e of evenements) parGenre[e.genre] = (parGenre[e.genre] || 0) + 1;
  console.log(`  genres : ${Object.entries(parGenre).map(([g, n]) => `${g} ${n}`).join(', ')}`);
}

main().catch((err) => {
  console.error('Échec du scraper calendrier.js :', err.message);
  process.exitCode = 1;
});
