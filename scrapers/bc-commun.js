// Ce que les scrapers de la Colombie-Britannique partagent.
//
// Règle n° 1 : jamais de donnée inventée, jamais de protection contournée. Le robot se présente
// pour ce qu'il est (USER_AGENT). Un 403, un 404 ou un défi anti-robot est une réponse : lire()
// lève une erreur, le scraper s'arrête sans écrire et les données de la veille restent.
//
// Ce que les robots.txt disaient le 8 novembre 2026 (relus à chaque exécution : c'est le code qui
// obéit, pas un commentaire) :
//   - www.leg.bc.ca : ouvert (seuls /admin, /search, /user, /core, /profiles sont interdits) ;
//   - api.lims.leg.bc.ca : aucun robots.txt (404), donc rien d'interdit ;
//   - dyn.leg.bc.ca : « Disallow: » vide, donc ouvert.
// Deux domaines sont FERMÉS aux robots et ne doivent jamais être lus ici — on y renvoie par un
// lien, rien de plus :
//   - www.bclaws.gov.bc.ca (lois refondues) : Googlebot et Bingbot seulement ;
//   - elections.bc.ca (résultats électoraux) : Googlebot, bingbot et BCGovSearch seulement.
// HOTES_PERMIS le dit dans le code : un domaine absent de cette liste est refusé avant même la
// lecture de son robots.txt.
//
// Droit d'auteur (https://www.leg.bc.ca/copyright, relu le 8 novembre 2026) : « No person may
// reproduce the material contained herein by any means for financial gain, or other than personal
// use, without the express written consent of the Speaker. » Le site ne reproduit donc AUCUN texte
// officiel, aucune note explicative et aucune photo de l'Assemblée : il publie les faits (dates,
// étapes, votes nominatifs, noms) et des résumés écrits par nous, chacun à côté du lien vers la
// page officielle. Les textes lus pour écrire un résumé restent hors du dépôt.

export const USER_AGENT =
  'dossier-colombie-britannique-scraper/0.1 (projet citoyen independant, usage non commercial; +https://dossierbc.ca)';
// Le robot se nomme et donne l'adresse du site, pour que l'Assemblée puisse nous joindre. Elle a
// porté celle de DossierQuébec jusqu'au 9 nov. 2026, faute de domaine : dossierbc.ca répond
// depuis la mise en ligne, et c'est lui que les journaux de leg.bc.ca doivent montrer.

export const API = 'https://api.lims.leg.bc.ca';
export const HOTE = 'https://www.leg.bc.ca';

/** Les seuls domaines que ce projet lit. Tout le reste est refusé par lire(). */
const HOTES_PERMIS = new Set(['api.lims.leg.bc.ca', 'lims.leg.bc.ca', 'www.leg.bc.ca', 'dyn.leg.bc.ca']);

const DELAI_MS = 1500;      // notre politesse : aucune source n'exige de délai, on s'en impose un
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
let derniere = 0;
let file = Promise.resolve();

// --- Le garde-fou robots.txt ----------------------------------------------------------------
const robots = new Map();   // origine → { interdits: [motifs], delai }

async function reglesDe(origine) {
  if (robots.has(origine)) return robots.get(origine);
  const regles = { interdits: [], delai: DELAI_MS };
  let res;
  try {
    res = await fetch(`${origine}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
  } catch (e) {
    throw new Error(`${origine}/robots.txt illisible (${e.message}) — on ne lit rien sans l'avoir lu`);
  }
  // Un 404 veut dire « pas de robots.txt », donc rien d'interdit. Un 403 ou un 500 veut dire qu'on
  // ne sait pas : on s'arrête plutôt que de supposer.
  if (!res.ok && res.status !== 404) {
    throw new Error(`${origine}/robots.txt : HTTP ${res.status} — on ne devine pas ses règles`);
  }
  if (res.ok) {
    let pourNous = false;
    for (const brut of (await res.text()).split(/\r?\n/)) {
      const ligne = brut.replace(/#.*/, '').trim();
      const [cle, ...reste] = ligne.split(':');
      const val = reste.join(':').trim();
      if (/^user-agent$/i.test(cle)) pourNous = val === '*' || /dossier/i.test(val);
      else if (pourNous && /^disallow$/i.test(cle) && val) regles.interdits.push(val);
      else if (pourNous && /^crawl-delay$/i.test(cle) && Number(val)) {
        regles.delai = Math.max(DELAI_MS, Number(val) * 1000);
      }
    }
  }
  robots.set(origine, regles);
  return regles;
}

function interdit(regles, chemin) {
  return regles.interdits.some((motif) => {
    const re = new RegExp('^' + motif.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return re.test(chemin);
  });
}

/** Attend son tour, vérifie le robots.txt, puis laisse faire l'appel. */
function enFile(cible, appel) {
  const tache = file.then(async () => {
    if (!HOTES_PERMIS.has(cible.host)) {
      throw new Error(`${cible.host} n'est pas dans HOTES_PERMIS — ce projet ne le lit pas`);
    }
    const regles = await reglesDe(cible.origin);
    if (interdit(regles, cible.pathname + cible.search)) {
      throw new Error(`${cible} : interdit par le robots.txt de ${cible.host} — on ne le lit pas`);
    }
    const attente = regles.delai - (Date.now() - derniere);
    if (attente > 0) await dormir(attente);
    derniere = Date.now();
    return appel(regles);
  });
  file = tache.catch(() => {});
  return tache;
}

/**
 * Lit une adresse d'un domaine permis, en file, au rythme demandé par son robots.txt.
 * @param {string} url  adresse complète, ou chemin sur api.lims.leg.bc.ca
 * @param {{ binaire?: boolean, json?: boolean }} options
 */
export function lire(url, options = {}) {
  const cible = new URL(url.startsWith('http') ? url : `${API}/${url.replace(/^\//, '')}`);
  return enFile(cible, async (regles) => {
    let res;
    for (let essai = 1; ; essai++) {
      derniere = Date.now();
      try {
        res = await fetch(cible, {
          headers: { 'User-Agent': USER_AGENT, Accept: options.json ? 'application/json' : '*/*' },
          redirect: 'follow',
        });
        break;
      } catch (e) {
        if (essai > 1) throw new Error(`${cible} : ${e.message}`);
        await dormir(regles.delai);
      }
    }
    const octets = Buffer.from(await res.arrayBuffer());
    const debut = octets.subarray(0, 4000).toString('latin1');
    const defi = Boolean(res.headers.get('cf-mitigated'))
      || /Just a moment|cf-chl|challenge-platform|Attention Required/i.test(debut);
    if (!res.ok || defi) {
      throw new Error(`${cible} : HTTP ${res.status}${defi ? ' (défi anti-robot — on ne le contourne pas)' : ''}`);
    }
    if (options.binaire) return octets;
    const latin = /charset=(iso-8859-1|windows-1252)/i.test(res.headers.get('content-type') || '')
      || /charset=["']?(iso-8859-1|windows-1252)/i.test(debut);
    return octets.toString(latin ? 'latin1' : 'utf8');
  });
}

/** Une lecture JSON de l'API de l'Assemblée (REST). */
export async function lireJson(chemin) {
  const brut = await lire(chemin, { json: true });
  try {
    return JSON.parse(brut);
  } catch {
    throw new Error(`${chemin} : réponse qui n'est pas du JSON (${brut.slice(0, 120)})`);
  }
}

/**
 * Une requête GraphQL à l'API de l'Assemblée. Même politesse que les lectures : en file, avec le
 * délai, et le robots.txt de l'origine vérifié d'abord.
 */
export function graphql(requete, variables = {}) {
  const cible = new URL(`${API}/graphql`);
  return enFile(cible, async () => {
    const res = await fetch(cible, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: requete, variables }),
    });
    const brut = await res.text();
    if (!res.ok) throw new Error(`graphql : HTTP ${res.status} — ${brut.slice(0, 200)}`);
    let rep;
    try {
      rep = JSON.parse(brut);
    } catch {
      throw new Error(`graphql : réponse qui n'est pas du JSON (${brut.slice(0, 120)})`);
    }
    if (rep.errors?.length) throw new Error(`graphql : ${rep.errors.map((e) => e.message).join(' · ')}`);
    return rep.data;
  });
}

/** Texte lisible d'un bout de HTML : une seule espace, entités résolues. */
export function texte(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<sup>([\s\S]*?)<\/sup>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Même logique que norm() côté page : sans accents, casse ni tirets. */
export function plierNom(nom) {
  return (nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[-–—'’.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Les partis, tels que l'API de l'Assemblée les nomme (abbreviation), et le code court que la page
 * utilise pour ses pastilles. Un parti absent de cette table arrête deputes.js : on n'étiquette
 * personne au hasard.
 *
 * À savoir : l'Assemblée ne reconnaît que ces quatre étiquettes. Les député·e·s passés à CentreBC
 * ou à OneBC pendant la 43e législature y figurent comme « Independent ». Le site affiche
 * l'étiquette de l'Assemblée et l'explique, plutôt que d'en inventer une.
 */
export const PARTIS = {
  'BC NDP': { code: 'NDP', fr: 'NPD de la Colombie-Britannique', en: 'BC NDP' },
  'Conservative Party of British Columbia': {
    code: 'CON', fr: 'Parti conservateur de la Colombie-Britannique', en: 'Conservative Party of BC',
  },
  'BC Green Party': { code: 'VERT', fr: 'Parti vert de la Colombie-Britannique', en: 'BC Green Party' },
  Independent: { code: 'IND', fr: 'Indépendant·e', en: 'Independent' },
};

/**
 * La législature en cours, et la plus récente qui a des données.
 *
 * Piège de l'élection (vu le 8 novembre 2026) : l'API ouvre la nouvelle législature dès le
 * scrutin, mais sans session, sans député·e·s et sans conseil des ministres tant que la Chambre
 * ne s'est pas réunie. Le rafraîchissement ne doit pas s'arrêter pour autant : il travaille sur la
 * dernière législature qui a des données, et le site dit où en est la nouvelle.
 */
export async function legislatures() {
  const data = await graphql(`query {
    allParliaments(orderBy: NUMBER_DESC, first: 4) {
      nodes {
        number
        id
        startDate
        endDate
        sessionsByParliamentId(orderBy: NUMBER_DESC) {
          nodes { number id startDate endDate }
        }
        membres: memberParliamentsByParliamentId(condition: { active: true }) { totalCount }
      }
    }
  }`);
  const toutes = (data.allParliaments?.nodes ?? []).map((p) => ({
    numero: p.number,
    id: p.id,
    debut: p.startDate ?? null,
    fin: p.endDate ?? null,
    membres: p.membres?.totalCount ?? 0,
    sessions: (p.sessionsByParliamentId?.nodes ?? []).map((s) => ({
      numero: s.number, id: s.id, debut: s.startDate ?? null, fin: s.endDate ?? null,
    })),
  }));
  if (!toutes.length) throw new Error("aucune législature lue dans l'API");
  const encours = toutes[0];
  const avecDonnees = toutes.find((p) => p.sessions.length && p.membres > 0)
    ?? toutes.find((p) => p.sessions.length);
  if (!avecDonnees) throw new Error('aucune législature avec une session');
  return { encours, avecDonnees, toutes };
}

/** 1 → st, 2 → nd, 3 → rd, 4 → th… */
export function rang(n) {
  const x = Number(n);
  if (x % 100 >= 11 && x % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][x % 10] ?? 'th';
}

/** « 43rd2nd » : la clé que l'API utilise pour les documents d'une session. */
export const cleSession = (leg, ses) => `${leg}${rang(leg)}${ses}${rang(ses)}`;
