// UNE PAGE PAR MINISTRE — /ministres/nicolas-marceau (3 nov. 2026).
//
// Chaque page est ministres.html (en-tête, menu, pied de page, dq.js) dont la vue Ministres est
// remplacée par la fiche de la personne, entièrement écrite dans le HTML : fonctions, parti,
// circonscription, projets de loi parrainés, présence aux votes, mandats, promesses de son parti
// qui touchent son ministère, coordonnées, et biographie + photo tirées de Wikipédia / Commons
// (data/site/ministresWiki.json — ce fichier n'existe pas encore en C.-B. : le script qui le fabriquait cherchait dans la Wikipédia FRANÇAISE « Assemblée nationale du Québec », il est sorti du dépôt le 9 nov. 2026). commun/dq.js voit la vue
// « ministre » (viewFromPath) et laisse la fiche telle quelle ; le texte anglais est dans la page
// (.fr-txt / .en-txt, basculés par body.lang-en).
//
// Lancé par scripts/build-section-pages.js, après les pages de projets de loi. Le dossier est
// refait à neuf (sauf ministres/photos/) : un ministre retiré du Conseil perd sa page.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { slugProjet } from './build-bill-pages.js';

const SITE = 'https://dossierbc.ca';
const DOSSIER = 'ministres';
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
export const slugMinistre = (nom) => String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const lire = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dateFr = (iso) => { const [a, m, j] = iso.split('-').map(Number); return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`; };
export const dateEn = (iso) => { const [a, m, j] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${j}, ${a}`; };
// Le plus court possible (Martin, 3 nov. 2026) : « Source, 3 octobre 2026 », « Source » est le lien.
// Le lien tombe sur la phrase et la surligne (fragment de texte #:~:text=début,fin ; Chrome, Edge, Safari).
// Si la citation n'est pas mot pour mot sur la page, le lien ouvre simplement l'annonce.
const fragmentTexte = (quote) => {
  const mots = String(quote || '').replace(/[«»"“”]/g, '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 3) return '';
  const enc = (t) => encodeURIComponent(t).replace(/-/g, '%2D').replace(/,/g, '%2C');
  // Phrase entière quand elle est courte : un intervalle début,fin peut déborder sur toute la page
  // si la fin n'est pas trouvée juste après (Martin, 3 nov. 2026, Plan CITÉ).
  if (mots.length <= 25) return `#:~:text=${enc(mots.join(' ').replace(/[.!?;:]+$/, ''))}`;
  const debut = mots.slice(0, 8).join(' ');
  const fin = mots.slice(-6).join(' ').replace(/[.!?;:]+$/, '');
  return `#:~:text=${enc(debut)}${fin ? ',' + enc(fin) : ''}`;
};
// Petites icônes carrées sous la photo (Martin, 4 nov. 2026).
const svg = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
export const ICONES_RESEAUX = {
  Facebook: svg('M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z'),
  LinkedIn: svg('M4 9h4v12H4zM6 3a2 2 0 110 4 2 2 0 010-4zm4 6h3.8v1.7c.6-1 1.9-2 3.9-2 4 0 4.3 2.6 4.3 6V21h-4v-5.6c0-1.4 0-3.1-1.9-3.1S12 13.8 12 15.3V21h-2z'),
  X: svg('M17.7 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.5 4.7H5.7z'),
  Instagram: svg('M12 7.3a4.7 4.7 0 100 9.4 4.7 4.7 0 000-9.4zm0 7.7a3 3 0 110-6 3 3 0 010 6zm4.9-8.9a1.1 1.1 0 100 2.2 1.1 1.1 0 000-2.2zM12 2c-2.7 0-3 0-4.1.1C4.3 2.3 2.3 4.3 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15 2 14.7 2 12 2zm0 1.8c2.7 0 3 0 4 .1 2.7.1 3.9 1.4 4 4 .1 1 .1 1.3.1 4s0 3-.1 4c-.1 2.6-1.3 3.9-4 4-1 .1-1.3.1-4 .1s-3 0-4-.1c-2.7-.1-3.9-1.4-4-4-.1-1-.1-1.3-.1-4s0-3 .1-4c.1-2.6 1.3-3.9 4-4 1-.1 1.3-.1 4-.1z'),
  YouTube: svg('M23 7.2a3 3 0 00-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 001 7.2 31 31 0 00.5 12a31 31 0 00.5 4.8 3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1 31 31 0 00.5-4.8 31 31 0 00-.5-4.8zM9.7 15.1V8.9L15.5 12z'),
};
export const nomReseau = (u) => [[/\/\/x\.com|twitter/, 'X'], [/facebook/, 'Facebook'], [/instagram/, 'Instagram'], [/linkedin/, 'LinkedIn'], [/youtube/, 'YouTube'], [/tiktok/, 'TikTok']].find(([r]) => r.test(u))?.[1] || 'Web';
export const citeSource = (p) => {
  const date = String(p.sourceLabel || '').split(' — ').map((x) => x.trim())[2] || '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? dateFr(date) : date;
  const mot = deux('Source', 'Source');
  return (p.sourceUrl ? `<a href="${esc(p.sourceUrl + fragmentTexte(p.quote))}" target="_blank" rel="noopener">${mot}</a>` : mot) + (d ? `, ${esc(d)}` : '');
};
// C.-B. : la législature en cours, tirée des projets de loi (pas écrite à la main).
export const LEG = Math.max(0, ...(() => { try { return JSON.parse(readFileSync('data/site/bills.json', 'utf8')); } catch { return []; } })().map((b) => Number(b.legislature) || 0));
export const LEG_EN = LEG + ({ 1: 'st', 2: 'nd', 3: 'rd' }[(LEG % 100 >= 11 && LEG % 100 <= 13) ? 0 : LEG % 10] || 'th');
export const deux = (fr, en) => `<span class="fr-txt">${fr}</span><span class="en-txt">${en}</span>`;
// Les quatre étiquettes de la Colombie-Britannique, mot pour mot celles de commun/dq.js (const
// seats) : les seules que l'Assemblée reconnaisse. Avant le 9 nov. 2026, cette table était celle du
// Québec et du Nouveau-Brunswick (PQ, CAQ, PLQ, QS, PCQ, LIB, PC) : aucune n'existe ici, et 'NDP'
// comme 'CON' n'y figuraient pas — les fiches retombaient donc sur le code brut.
export const PARTIS = { NDP: ['NPD de la Colombie-Britannique', 'BC NDP'], CON: ['Parti conservateur de la Colombie-Britannique', 'Conservative Party of BC'], VERT: ['Parti vert de la Colombie-Britannique', 'BC Green Party'], IND: ['Indépendant·e', 'Independent'] };

// Ministère → thèmes de promesses. Prudent : seulement des correspondances franches, sur le titre
// du ministère (pas sur « responsable de la région de… »).
const THEMES = [
  [/finances/i, ['Finances publiques', 'Fiscalité']],
  [/transports/i, ['Transport']],
  [/infrastructures/i, ['Infrastructures']],
  [/santé|services sociaux/i, ['Santé']],
  [/aînés/i, ['Aînés']],
  [/éducation/i, ['Éducation']],
  [/immigration/i, ['Immigration']],
  [/culture/i, ['Culture']],
  [/environnement|climat/i, ['Environnement']],
  [/énergie/i, ['Énergie']],
  [/agriculture/i, ['Agriculture']],
  [/famille/i, ['Famille']],
  [/habitation|logement/i, ['Logement']],
  [/justice/i, ['Justice']],
  [/économie/i, ['Économie']],
];

// Pastille de présence (partagée avec scripts/build-chefs-opposition.js).
export function classeurPresence(deputes, presences) {
  const tauxTous = deputes.map((d) => presences[d[4]]?.rate).filter((r) => typeof r === 'number').sort((x, y) => x - y);
  const medianeDe = (t) => { const k = Math.floor(t.length / 2); return t.length % 2 ? t[k] : Math.round((t[k - 1] + t[k]) / 2); };
  const mediane = tauxTous.length ? medianeDe(tauxTous) : 0;
  const sousMed = tauxTous.filter((r) => r < mediane);
  const medianeJaune = sousMed.length ? medianeDe(sousMed) : mediane;
  return (r) => r >= mediane ? 'presence-haute' : r >= medianeJaune ? 'presence-moyenne' : 'presence-neutre';
}

export function construirePagesMinistres() {
  const modele = readFileSync('ministres.html', 'utf8').replace(/\r\n/g, '\n');
  const ministres = lire('data/site/ministers.json', []);
  const deputes = lire('data/site/deputesRaw.json', []);
  const courriels = lire('data/site/deputeEmails.json', {});
  const presences = lire('data/site/presences.json', {});
  // Réseaux sociaux relevés sur bcndp.ca/team (11 nov. 2026), source de chaque lien dans ministresReseaux-sources.json.
  const reseaux = lire('data/site/ministresReseaux.json', {});
  // Même pastille que la page Ministres (tauxPresence de dq.js) : vert à la médiane de l'Assemblée ou
  // au-dessus, jaune jusqu'à la médiane de ceux qui sont sous, sans couleur en dessous.
  const classePresence = classeurPresence(deputes, presences);
  const historique = lire('data/site/historiqueLeg.json', {});
  const parrains = lire('data/site/billsParrains.json', []);
  const promesses = lire('data/site/promises.json', []).filter((p) => !p.draft);
  const wiki = lire('data/site/ministresWiki.json', {});
  const brut = new Map((lire('data/bills.json', { bills: [] }).bills ?? []).map((b) => [b.id, b]));
  const affiches = new Map(lire('data/site/bills.json', []).map((b) => [b.id, b]));
  const courrielDe = new Map(Object.entries(courriels).map(([k, v]) => [norm(k), v]));
  const auj = new Date().toISOString().slice(0, 10);
  // Le Conseil exécutif montré est celui de la législature montrée, et elle peut être FINIE :
  // la 43e a été dissoute le 22 sept. 2026. Jusqu'au 9 nov. 2026, chaque fiche disait « dans le
  // gouvernement Holt (au <aujourd'hui>) » — Holt est la première ministre du NOUVEAU-BRUNSWICK,
  // et la date laissait croire que ce Conseil siégeait encore. On lit les deux faits au lieu de
  // les écrire : la fin de la législature dans legislatureEtat.json, le nom du premier ministre
  // dans le rôle publié par l'Assemblée.
  const etatLeg = lire('data/site/legislatureEtat.json', {});
  const finLeg = etatLeg.montree === LEG ? (etatLeg.terminee || null) : null;
  const premier = ministres.find((x) => /^premier\b/i.test(String(x.role)))?.name || null;

  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.endsWith('.html')) rmSync(`${DOSSIER}/${f}`);
  mkdirSync(DOSSIER, { recursive: true });

  const adresses = [];
  for (const m of ministres) {
    const slug = slugMinistre(m.name);
    const url = `${SITE}/${DOSSIER}/${slug}`;
    const d = deputes.find((x) => norm(x[0]) === norm(m.name));
    const [, riding, region, , assnatId, mandats] = d ?? [];
    const roles = String(m.role).split('·').map((r) => r.trim()).filter(Boolean);
    // Les titres officiels de la C.-B. sont EN ANGLAIS, et on ne traduit pas un titre officiel :
    // « Minister of Finance » reste tel que l'Assemblée l'écrit, majuscule comprise. Les minuscules
    // héritées de DossierQuébec donnaient « était minister of Finance », mi-français mi-anglais.
    const joint = roles.length > 1 ? `${roles.slice(0, -1).join(', ')} et ${roles.at(-1)}` : roles[0];
    const [partiFr, partiEn] = PARTIS[m.party] ?? [m.party, m.party];
    const w = wiki[slug] ?? {};

    // Projets de loi parrainés (nom exact du parrain).
    const projets = parrains.filter((p) => norm(p.sponsor) === norm(m.name)).map((p) => brut.get(p.id) ?? affiches.get(p.id)).filter(Boolean)
      .sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));
    const att = assnatId ? presences[assnatId] : null;
    const passees = assnatId ? historique.presences?.[assnatId] : null;
    const courriel = courrielDe.get(norm(m.name));
    const themes = [...new Set(THEMES.filter(([re]) => roles.some((r) => /^(vice-)?(premi[eè]re? )?ministre (des?|du|de la|de l’|de l'|délégu)/i.test(r) && re.test(r))).flatMap(([, t]) => t))];
    const proms = promesses.filter((p) => p.party === m.party && themes.includes(p.theme)).slice(0, 8);

    // Biographie composée à partir des faits de Wikidata (jamais le texte de l'article).
    const bioFr = [], bioEn = [];
    if (w.naissance || w.lieu) {
      const quand = w.naissance ? (w.naissance.length === 10 ? `le ${dateFr(w.naissance)}` : `en ${w.naissance}`) : '';
      const quandEn = w.naissance ? (w.naissance.length === 10 ? `on ${dateEn(w.naissance)}` : `in ${w.naissance}`) : '';
      bioFr.push(`Naissance ${[quand, w.lieu ? `à ${w.lieu}` : ''].filter(Boolean).join(' ')}.`);
      bioEn.push(`Born ${[quandEn, w.lieuEn ? `in ${w.lieuEn}` : ''].filter(Boolean).join(' ')}.`);
    }
    if (w.formation?.length) { bioFr.push(`Études : ${w.formation.join(', ')}.`); bioEn.push(`Education: ${w.formationEn.join(', ')}.`); }
    if (w.metiers?.length) { bioFr.push(`Avant ou à côté de la politique : ${w.metiers.join(', ')}.`); bioEn.push(`Occupation outside politics: ${w.metiersEn.join(', ')}.`); }
    if (riding) {
      bioFr.push(`Député${/e$/.test(roles[0] ?? '') || /ministre déléguée|première|vice-première/i.test(m.role) ? 'e' : ''} de ${riding} (${partiFr})${mandats ? `, ${mandats === 1 ? 'premier mandat' : `${mandats}e mandat`}` : ''}.`);
      bioEn.push(`MLA for ${riding} (${partiEn})${mandats ? `, ${mandats === 1 ? 'first term' : `term no. ${mandats}`}` : ''}.`);
    }

    const ligne = (lbl, val) => `<div class="m-row"><span class="m-label">${lbl}</span><span class="m-val">${val}</span></div>`;
    const titreCourt = roles[0]?.length && `${m.name}, ${roles[0]}`.length <= 46 ? `${m.name}, ${roles[0]}` : `${m.name}, ministre`;
    const titre = `${titreCourt} — DossierBC`;
    let desc = `${m.name} (${m.party}${riding ? `, ${riding}` : ''}) : ${roles[0]}. Ses fonctions, ses projets de loi, sa présence aux votes et sa biographie.`;
    if (desc.length > 165) desc = `${m.name} : ${roles[0]}`.slice(0, 100).replace(/\s+\S*$/, '') + '. Fonctions, projets de loi, votes, biographie.';
    if (desc.length < 120) desc += ' Gouvernement de la Colombie-Britannique.';
    if (desc.length < 120) desc += ' Fiche à jour sur DossierBC.';

    // C.-B. : le portrait officiel de l'Assemblée législative (leg.bc.ca), en WebP à 200 et 400 px
    // (ministres/photos/<slug>.webp, repris de la version du 7 nov. 2026), sinon Wikimedia Commons.
    const photoParti = existsSync(`${DOSSIER}/photos/${slug}.webp`) ? `/${DOSSIER}/photos/${slug}.jpg` : null;
    if (photoParti) w.photo = null;
    const photo = photoParti ? `<figure class="min-photo"><img src="${photoParti.replace(/.jpg$/, '.webp')}" srcset="${photoParti.replace(/.jpg$/, '.webp')} 1x, ${photoParti.replace(/.jpg$/, '@2x.webp')} 2x" width="200" height="200" alt="${esc(m.name)}"><figcaption>${deux('Photo', 'Photo')} : <a href="https://www.leg.bc.ca/" rel="noopener">${deux('Assemblée législative de la Colombie-Britannique', 'Legislative Assembly of British Columbia')}</a></figcaption></figure>`
      : w.photo ?`<figure class="min-photo"><img src="${esc(w.photo.src)}" width="${w.photo.largeur}" height="${w.photo.hauteur}" alt="${esc(m.name)}"><figcaption>${esc(w.photo.auteur)}, ${w.photo.licenceUrl ? `<a href="${esc(w.photo.licenceUrl)}" rel="noopener license">${esc(w.photo.licence)}</a>` : esc(w.photo.licence)} · <a href="${esc(w.photo.fiche)}" rel="noopener">Wikimedia Commons</a></figcaption></figure>` : '';

    const fiche = `<section class="view active" id="view-ministre">
    <nav class="fil-ariane" aria-label="Fil d'Ariane"><a href="/" data-i18n="fil.accueil">Accueil</a><span class="sep" aria-hidden="true">›</span><a href="/ministres" data-i18n="fil.ministres">Ministres et député·e·s</a><span class="sep" aria-hidden="true">›</span><span aria-current="page">${esc(m.name)}</span></nav>
    <div class="view-hero min-hero">
      <div class="min-colphoto">${photo}${(reseaux[slug] || []).length ? `<p class="min-reseaux">${reseaux[slug].map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="${nomReseau(u)}" aria-label="${nomReseau(u)}">${ICONES_RESEAUX[nomReseau(u)] || nomReseau(u)}</a>`).join('')}</p>` : ''}</div>
      <div class="min-tete">
        <h1 class="hero-h1 hero-h1-md"><span class="hero-sujet">${deux('Ministre de la Colombie-Britannique', 'British Columbia minister')}</span><span>${esc(m.name)}</span></h1>
        <p class="view-hero-sub">${deux(
          finLeg
            ? `${esc(m.name)} était ${esc(joint)} au Conseil exécutif de la ${LEG}<sup>e</sup> législature${premier ? `, dirigé par le premier ministre ${esc(premier)}` : ''}. Cette législature a pris fin le ${dateFr(finLeg)}.`
            : `${esc(m.name)} est ${esc(joint)} au Conseil exécutif de la ${LEG}<sup>e</sup> législature${premier ? `, dirigé par le premier ministre ${esc(premier)}` : ''} (au ${dateFr(auj)}).`,
          finLeg
            ? `${esc(m.name)} was ${esc(m.role).replace(/ · /g, ', ')} in the Executive Council of the ${LEG_EN} Parliament${premier ? `, led by Premier ${esc(premier)}` : ''}. That Parliament ended on ${dateEn(finLeg)}.`
            : `${esc(m.name)} is ${esc(m.role).replace(/ · /g, ', ')} in the Executive Council of the ${LEG_EN} Parliament${premier ? `, led by Premier ${esc(premier)}` : ''} (as of ${dateEn(auj)}).`)}</p>
        <button class="follow-btn" onclick="toggleFollow('${esc(m.name.replace(/'/g, "\\'"))}')" data-i18n="btn.follow">Suivre</button>
      </div>
    </div>
    <div class="band band-white bleed"><div class="min-fiche">
      <h2>${deux('Fonctions', 'Roles')}</h2>
      <ul class="min-liste">${roles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="min-faits">
        ${ligne(deux('Parti', 'Party'), esc(`${partiFr} (${m.party})`))}
        ${riding ? ligne(deux('Circonscription', 'Riding'), esc(riding + (region ? ` — ${region}` : ''))) : ''}
        ${mandats ? ligne(deux('Mandat', 'Term'), deux(mandats === 1 ? '1er' : `${mandats}e`, mandats === 1 ? '1st' : `no. ${mandats}`)) : ''}
      </div>

      <h2>${deux('Projets de loi parrainés', 'Bills sponsored')}</h2>
      ${projets.length ? `<ul class="min-liste">${projets.map((b) => { const s = slugProjet(b); return `<li><a href="${s ? `/projets-de-loi/${s}` : `/projets-de-loi?pl=${b.num}`}">${deux(`PL ${esc(b.num)} — ${esc(b.title)}`, `Bill ${esc(b.num)} — ${esc(b.titleEn || b.title)}`)}</a> <span class="pr-meta">· ${b.legislature ? deux(`${b.legislature}e législature`, `${b.legislature}th Legislature`) + ' · ' : ''}${deux(esc(b.note ?? ''), esc(b.noteEn ?? b.note ?? ''))}</span></li>`; }).join('')}</ul>`
        : `<p>${deux('Aucun projet de loi parrainé dans les données du site pour l’instant.', 'No bill sponsored in the site’s data so far.')}</p>`}

      <h2>${deux('Présence aux votes', 'Vote attendance')}</h2>
      ${att ? `<p>${deux(`<b class="presence-pastille ${classePresence(att.rate)}">${att.rate} %</b> des votes nominaux depuis le ${dateFr(att.depuis)} : ${att.participated} sur ${att.total}, soit ${att.total - att.participated} votes manqués (${LEG}e législature).`, `<b class="presence-pastille ${classePresence(att.rate)}">${att.rate}%</b> of recorded divisions since ${dateEn(att.depuis)}: ${att.participated} of ${att.total}, i.e. ${att.total - att.participated} votes missed (${LEG_EN} Legislature).`)}</p><p class="pr-meta">${deux('Un vote manqué peut être une mission officielle, une maladie ou un conflit d’horaire : le registre n’en donne pas la raison.', 'A missed vote can be an official mission, an illness or a scheduling conflict: the register does not give the reason.')}</p>`
        : `<p><b class="presence-pastille presence-avenir">${deux('À venir', 'Coming')}</b> ${deux('Aucun vote nominal encore pour cette personne.', 'No recorded division yet for this person.')}</p>`}

      ${mandats || passees ? `<h2>${deux('Historique', 'History')}</h2>` : ''}
      <p>${mandats ? deux(mandats === 1 ? 'Premier mandat à l’Assemblée législative.' : `${mandats}e mandat à l’Assemblée législative.`, mandats === 1 ? 'First term in the Legislative Assembly.' : `Term no. ${mandats} in the Legislative Assembly.`) : ''}${passees ? ` ${deux(`Présence aux votes de la ${historique.courante - 1}e législature : ${esc(passees.rate ?? '')} %.`, `Attendance in the previous Legislature: ${esc(passees.rate ?? '')}%.`)}` : ''}</p>

      ${proms.length ? `<h2>${deux(`Promesses du ${esc(partiFr)} qui touchent son ministère`, `${esc(partiEn)} promises related to this portfolio`)}</h2>
      <ul class="min-liste">${proms.map((p) => `<li class="min-promesse"><q>${esc(p.quote)}</q><span class="min-prom-source">${citeSource(p)}</span></li>`).join('')}</ul>
      <p><a href="/promesses">${deux('Toutes les promesses 2026 →', 'All 2026 promises →')}</a></p>` : ''}

      ${bioFr.length ? `<h2>${deux('Biographie', 'Biography')}</h2><p>${deux(esc(bioFr.join(' ')), esc(bioEn.join(' ')))}</p>` : ''}

      <h2>${deux('Coordonnées officielles', 'Official contact')}</h2>
      <p>${courriel ? `<a class="m-mail" href="mailto:${esc(courriel)}">✉ ${esc(courriel)}</a>` : `${deux('<a href="https://www.leg.bc.ca/fr/parlementaires/actuel" rel="noopener">Coordonnées sur leg.bc.ca</a>', '<a href="https://www.leg.bc.ca/en/members/current" rel="noopener">Contact details on leg.bc.ca</a>')}`}</p>
      ${w.url ? `<p class="min-source">${deux('Source', 'Source')} : <a href="${esc(w.url)}" rel="noopener">Wikipédia</a></p>` : ''}
    </div></div>
  </section>`;

    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Ministres et député·e·s', item: `${SITE}/ministres` },
          { '@type': 'ListItem', position: 3, name: m.name, item: url },
        ] },
        { '@type': 'Person', name: m.name, url, jobTitle: roles, memberOf: [{ '@type': 'PoliticalParty', name: partiFr }, { '@type': 'GovernmentOrganization', name: 'Conseil exécutif de la Colombie-Britannique' }],
          ...(photoParti || w.photo ? { image: SITE + (photoParti ? photoParti.replace(/.jpg$/, '.webp') : w.photo.src) } : {}), ...((w.url || reseaux[slug]) ? { sameAs: [...(w.url ? [w.url] : []), ...(w.wikidata ? [`https://www.wikidata.org/wiki/${w.wikidata}`] : []), ...(reseaux[slug] || [])] } : {}) },
      ],
    }, null, 1).replace(/</g, '\\u003c');

    let h = modele;
    const remplacer = (motif, valeur) => {
      if (!motif.test(h)) throw new Error(`build-minister-pages : ${motif} introuvable dans ministres.html`);
      h = h.replace(motif, () => valeur);
    };
    // Titre FRANÇAIS de la fiche, pour commun/dq.js (syncTitle) : le <title> du HTML est l'anglais.
    remplacer(/<title>[^<]*<\/title>/, `<title>${esc(titre)}</title>\n<meta name="dvq:titre-fr" content="${esc(`${m.name}, ministre — DossierBC`)}">`);
    remplacer(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
    remplacer(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
    remplacer(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titre)}">`);
    remplacer(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
    remplacer(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
    remplacer(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(titre)}">`);
    remplacer(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(desc)}">`);
    remplacer(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
    remplacer(/<body data-page="ministres"/, '<body data-page="ministre"');
    remplacer(/<section class="view active" id="view-ministres">[\s\S]*?<\/section>/, fiche);

    // Garde-fous du build, comme pour les pages du site.
    if (titre.length > 65) throw new Error(`build-minister-pages : titre trop long (${titre.length}) : ${titre}`);
    if (desc.length < 120 || desc.length > 165) throw new Error(`build-minister-pages : description de ${desc.length} caractères pour ${m.name}`);
    if ((h.match(/<h1[\s>]/g) || []).length !== 1) throw new Error(`build-minister-pages : ${m.name} n'a pas exactement un <h1>`);
    writeFileSync(`${DOSSIER}/${slug}.html`, h, 'utf8');
    adresses.push(url);
  }

  const plan = readFileSync('sitemap.xml', 'utf8').replace(/\r\n/g, '\n');
  const entrees = adresses.map((u) => `  <url>\n    <loc>${u}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join('\n');
  const nouveau = plan.replace(/\n<\/urlset>/, `\n${entrees}\n</urlset>`);
  if (nouveau !== plan) writeFileSync('sitemap.xml', nouveau, 'utf8');
  console.log(`✓ ${adresses.length} pages de ministres (/${DOSSIER}/prénom-nom), au sitemap.`);
}
