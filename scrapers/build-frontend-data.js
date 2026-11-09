// Injecte data/bills.json directement dans index.html, entre les marqueurs
// BILLS_DATA_START / BILLS_DATA_END.
//
// Ce fichier disait « le prototype reste un fichier HTML unique et autonome, ouvrable en
// double-cliquant, sans serveur ni fetch() ». Ce n'est plus vrai depuis le 21 septembre 2026 :
// la feuille de style et la logique vivent dans commun/, et les gros textes se chargent à la
// demande. Le site est servi par un serveur, et c'est ce qui lui permet de peser trois fois
// moins. Ouvrir index.html en double-cliquant ne donne plus rien.
//
// Adapte aussi le format des données au gabarit attendu par billCard() :
//   - `id` devient la clé unique utilisée pour les DOM ids (b.num n'est PAS unique,
//     le Québec réutilise les numéros de projet de loi d'une session à l'autre —
//     voir bills.js).
//   - `sponsor` est raccourci à "Prénom Nom" (la donnée brute inclut aussi le rôle,
//     déjà affiché ailleurs sur la page).
//   - `summary` (liste à puces "- ...") est converti en <ul><li>...</li></ul>.
//     Les projets sans résumé utilisable affichent un message honnête plutôt que
//     du contenu vide ou inventé.
//
// Les projets "laisse_de_cote" sont inclus (affichés comme "Sur la glace" côté
// front-end) — on ne les cache plus, voir la conversation sur la distinction
// sanctionné / à l'étude / sur la glace.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// C.-B. : pas de mémoires de commission (outil des abonné·e·s de DossierQuébec, api/ retiré).

const IN_PATH = 'data/bills.json';
const HTML_PATH = 'gabarit.html';   // le MODÈLE, jamais servi : les pages en sont tirées
const START_MARKER = '/* BILLS_DATA_START';
const END_MARKER = '/* BILLS_DATA_END */';

function shortSponsorName(raw) {
  if (!raw) return null;
  const [namePart] = raw.split('—');
  const trimmed = namePart.trim();
  const match = trimmed.match(/^([^,]+),\s*(.+)$/); // "Nom, Prénom" -> "Prénom Nom"
  return match ? `${match[2]} ${match[1]}` : trimmed;
}

// Convertit un texte à puces « - … » (une idée par ligne) en <ul>. Utilisé pour
// le résumé FR et sa traduction EN. `emptyValue` = ce qu'on retourne si le texte
// est vide (message pour le FR, null pour l'EN qui retombe alors sur le FR).
function bulletsToHtml(text, emptyValue) {
  if (!text) return emptyValue;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
  if (lines.length === 0) return `<p>${text}</p>`;
  return `<ul class="bill-summary-list">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
}

// Un omnibus se lit comme en Ontario (Martin, 25 sept. 2026) : l'aperçu, puis une tête par loi
// touchée (« Volet 1 · Loi sur le bâtiment ») et ses puces dessous. Le résumé d'un omnibus
// (bill-summaries.js, SYSTEM_OMNIBUS) est déjà fait ainsi : l'aperçu, une ligne vide, puis une puce
// « Nom de la loi : ce qui change » par loi. Une puce sans « : » reste une puce ordinaire.
function omnibusToHtml(text, en) {
  if (!text) return null;
  const [apercu, ...reste] = text.split(/\n\s*\n/);
  const puces = (bloc) => bloc.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  const lois = puces(reste.join('\n'));
  if (!lois.length) return bulletsToHtml(text, null);
  const groupes = [];
  for (const l of lois) {
    const m = l.match(en ? /^([^:]{3,160}):\s+(.+)$/ : /^([^:]{3,160}?)\s*:\s+(.+)$/);
    const nom = m ? m[1].trim() : null;
    // Une loi qui revient plus loin (le résumé suit l'ordre des notes, pas des lois) rejoint sa tête.
    const meme = nom && groupes.find((g) => g.nom === nom);
    if (meme) meme.puces.push(m[2]);
    else groupes.push({ nom, puces: [m ? m[2] : l] });
  }
  let n = 0;
  const html = groupes.map((g) => (g.nom
    ? `<h5 class="volet-titre"><span>${en ? 'Part' : 'Volet'} ${++n}</span> ${g.nom}</h5><ul class="bill-summary-list">${g.puces.map((p) => `<li>${p.charAt(0).toUpperCase() + p.slice(1)}</li>`).join('')}</ul>`
    : `<ul class="bill-summary-list">${g.puces.map((p) => `<li>${p}</li>`).join('')}</ul>`)).join('');
  const tete = puces(apercu);
  return (tete.length ? `<ul class="bill-summary-list">${tete.map((l) => `<li>${l}</li>`).join('')}</ul>` : '') + html;
}

function summaryToHtml(bill) {
  if (bill.omnibus && bill.summary) return omnibusToHtml(bill.summary, false);
  return bulletsToHtml(bill.summary, '<p><em>Pas encore de résumé en langage clair pour ce projet : le texte officiel, sur leg.bc.ca, fait foi.</em></p>');   // N.-B.
}

function main() {
  const data = JSON.parse(readFileSync(IN_PATH, 'utf-8'));

  const bills = data.bills.map((b) => ({
    id: b.id,
    num: b.num,
    // Le numéro TEL QUE L'ASSEMBLÉE L'ÉCRIT : « 22 » pour un projet du gouvernement, « M 249 »
    // pour celui d'un·e député·e, « Pr 3 » pour un projet d'intérêt privé. Sans ce préfixe, le
    // site appellerait « Bill 249 » un projet que l'Assemblée nomme « Bill M 249 ».
    numAffiche: b.numAffiche ?? String(b.num),
    title: b.title,
    status: b.status,
    step: b.step,
    note: b.note,
    sponsor: shortSponsorName(b.sponsor) || (b.type === 'Public du gouvernement' ? 'Gouvernement' : null),
    summary: summaryToHtml(b),
    summaryAiGenerated: Boolean(b.summaryAiGenerated),
    url: b.url,
    urlEn: b.urlEn || null,
    titleEn: b.titleEn || null,
    noteEn: b.noteEn || null,
    summaryEn: b.summaryEn ? (b.omnibus ? omnibusToHtml(b.summaryEn, true) : bulletsToHtml(b.summaryEn, null)) : '<p><em>No plain-language summary for this bill yet: the official text, on leg.bc.ca, is the reference.</em></p>',   // C.-B. : le message existe aussi en anglais
    lastActivity: b.lastActivity,
    presentedOn: b.presentedOn || null,
    // La législature et la session de dépôt : l'adresse de la page du projet (/projets-de-loi/3-43-3,
    // scripts/build-bill-pages.js) et le choix de l'archive (commun/dq.js). Le numéro seul ne suffit
    // pas : il recommence à 1 à chaque session. Absents jusqu'au 4 oct. 2026 : le partage retombait
    // sur ?pl=, et /projets-de-loi/3-43-1 ouvrait le premier « PL 3 » venu.
    legislature: b.legislature ?? null,
    introSession: b.introSession ?? null,
    // Omnibus (25 sept. 2026, scrapers/bill-summaries.js) : combien de lois et règlements le
    // projet touche, d'après sa liste officielle, et s'il est un omnibus. La liste elle-même
    // suit le résumé (chargé à l'ouverture de la carte).
    nbLois: Array.isArray(b.loisTouchees) ? b.loisTouchees.length : null,
    omnibus: Boolean(b.omnibus),
    _lois: Array.isArray(b.loisTouchees) ? b.loisTouchees : [],
  }));

  bills.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  // Les résumés sortent de la page. Mesuré : 177 ko bruts, 55 ko compressés — plus du tiers du
  // poids compressé de la page, pour un texte qui ne s'affiche que dans la carte qu'on déplie.
  // Un fichier par langue, parce qu'on n'a jamais besoin des deux en même temps.
  const resumes = { fr: {}, en: {} };
  const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // La liste officielle des textes touchés, repliée sous le résumé. Les titres restent en
  // français en anglais : ce sont les titres officiels, il n'en existe pas d'autre ici.
  const listeLois = (b, en) => b._lois.length < 2 ? '' :
    `<details class="bill-lois"><summary>${en ? `Laws and regulations affected (${b._lois.length}) — official French titles` : `Lois et règlements touchés (${b._lois.length})`}</summary><ul>${b._lois.map((l) => `<li>${echapper(l)}</li>`).join('')}</ul></details>`;
  // QUI A VOTÉ QUOI, sous une loi sanctionnée (Martin, 18 oct. 2026 : « accountability »). Le vote
  // nominal à l'adoption, en trois colonnes (pour, contre, abstention), chaque nom avec un lien
  // courriel quand l'élu·e siège encore. Pas de message tout écrit : le courriel part vide, avec le
  // nom de la loi en objet. Beaucoup de lois sont adoptées sans vote nom par nom (unanimité, « sur
  // division ») : la case le dit, sans rien inventer. Rangé avec les résumés, chargés à l'ouverture
  // de la carte, pour ne pas alourdir la page (125 noms par vote).
  const votesNominaux = existsSync('data/votes.json') ? (JSON.parse(readFileSync('data/votes.json', 'utf-8')).votes || []) : [];
  const elus = existsSync('data/deputes.json') ? (JSON.parse(readFileSync('data/deputes.json', 'utf-8')).deputes || []) : [];
  const contacts = existsSync('data/deputes-contacts.json') ? (JSON.parse(readFileSync('data/deputes-contacts.json', 'utf-8')).contacts || []) : [];
  const cleNom = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const elusParId = new Map(elus.map((d) => [Number(d.assnatId), d]));
  // Les ancien·ne·s élu·e·s : l'Assemblée ne donne que leur nom de famille dans ses votes, et ils
  // sortent de sa liste à la législature suivante. data/elus-historique.json garde le nom et le
  // parti de toute personne déjà vue dans la liste (jamais vidé), pour les nommer en entier dans
  // les votes archivés « à la postérité » (Martin, 18 oct. 2026).
  const HISTO = 'data/elus-historique.json';
  const histo = existsSync(HISTO) ? JSON.parse(readFileSync(HISTO, 'utf-8')) : { elus: {} };
  let histoChange = false;
  for (const d of elus) {
    const avant = histo.elus[d.assnatId];
    if (!avant || avant.name !== d.name || avant.party !== d.party) { histo.elus[d.assnatId] = { name: d.name, party: d.party }; histoChange = true; }
  }
  if (histoChange) writeFileSync(HISTO, JSON.stringify(histo, null, 1));
  const courriels = new Map(contacts.map((c) => [cleNom(c.name), c.email]));
  // Tous les votes nominaux d'un projet, du plus ancien au plus récent (Martin, 30 oct. 2026 : les
  // votes vivent maintenant dans la carte du projet, plus dans un onglet). Même rapprochement que
  // pour l'adoption avant : numéro, législature et session.
  // C.-B. : scrapers/votes.js rattache chaque vote à sa fiche (billId) en lisant le titre du
  // projet dans le procès-verbal. On s'appuie là-dessus : le numéro seul ne suffit pas, il repart
  // à 1 à chaque session, et un projet rétabli est voté dans deux sessions différentes.
  const votesDuProjet = (b) => votesNominaux.filter((x) => (x.billId
    ? x.billId === b.id
    : x.billNum && String(x.billNum) === String(b.num)
      && Number(x.legislature) === Number(b.legislature) && Number(x.session) === Number(b.introSession)))
    .sort((x, y) => (x.date || '').localeCompare(y.date || '') || (Number(x.num) || 0) - (Number(y.num) || 0));
  const caseVotes = (b, en) => {
    const liste = votesDuProjet(b);
    // C.-B. : les Journaux ne consignent que « pour » et « contre », jamais d'abstention.
    const titre = en ? 'Who voted for or against' : 'Qui a voté pour ou contre';
    // Sans vote nominal, on explique comment la loi a été adoptée (Martin, 18 oct. 2026 : « que les
    // gens comprennent »). Le mode exact (unanimité ou majorité) est sur la fiche de l'Assemblée.
    // Un projet non sanctionné sans vote nominal n'a pas de case : il n'y a rien à expliquer.
    if (!liste.length) return b.status !== 'sanctionne' ? '' : `<details class="bill-votes"><summary>${titre}</summary><p class="bill-votes-note">${en
      ? '<b>No list of names exists for this law.</b> It was passed by voice: members answer from their seats, and only the outcome is written in the Assembly’s Journal. No one is counted.'
      : '<b>Il n’existe pas de liste de noms pour cette loi.</b> Elle a été adoptée de vive voix : les député·e·s répondent de leur place, et seule l’issue est consignée au Journal de l’Assemblée. Personne n’est compté.'}</p><p class="bill-votes-note">${en
      ? 'A list of names exists only for a <b>recorded division</b>: each member is then counted for or against, and their name is written in the Journal.'
      : 'Une liste nom par nom existe seulement lors d’un <b>vote par appel nominal</b> : chaque député·e est alors compté·e pour ou contre, et son nom est inscrit au Journal.'} <a href="${echapper(en ? (b.urlEn || b.url) : b.url)}" target="_blank" rel="noopener">${en ? 'The bill on the Assembly’s website' : 'Le projet sur le site de l’Assemblée'}</a>.</p></details>`;
    const objet = encodeURIComponent((en ? 'Bill ' : 'Projet de loi n° ') + b.num + ' — ' + (en ? (b.titleEn || b.title) : b.title));
    // Une carte par vote, dessinée comme celles de /votes (renderVotes, commun/dq.js). Seuls la tête
    // et la barre sont ici : les noms (125 par vote, avec ✉ et ⧉) pesaient 1,6 Mo dans ce fichier.
    // commun/dq.js (remplirVotesProjet) les tire de data/archives/<législature>/votes/<id>.json à
    // l'ouverture de la case, avec contenuNominal, comme sur /votes.
    const carte = (v) => {
      const t = { pour: v.pour.length, contre: v.contre.length, abstentions: v.abstentions.length };
      const total = t.pour + t.contre + t.abstentions;
      const seg = (g) => (total ? (t[g] / total * 100).toFixed(1) : 0);
      const adopte = t.pour > t.contre;
      const etape = v.stage || (en ? 'Recorded division' : 'Vote nominal');
      return `<div class="vote-card bill-vote-card"><div class="vc-head"><span class="result-badge ${adopte ? 'adopte' : 'rejete'}">${adopte ? (en ? 'Passed' : 'Adopté') : (en ? 'Rejected' : 'Rejeté')}</span><div class="vc-head-main"><h3>${echapper(etape)}</h3><div class="vc-meta">${echapper(v.date)} · ${en ? 'Recorded division' : 'Vote nominal'}</div></div><div class="vc-counts"><span class="vcc pour"><b>${t.pour}</b> ${en ? 'yea' : 'pour'}</span><span class="vcc contre"><b>${t.contre}</b> ${en ? 'nay' : 'contre'}</span></div></div><div class="bar"><div class="seg pour" style="width:${seg('pour')}%"></div><div class="seg contre" style="width:${seg('contre')}%"></div><div class="seg abst" style="width:${seg('abstentions')}%"></div></div><div class="vc-detail open" data-vote="${v.session}-${v.num}" data-leg="${v.legislature}"><div class="vc-pgrid"></div><div class="vc-ncols"></div><div class="vc-foot"><span class="vc-foot-note">${en ? 'Not on the list is not a « no » vote — mission, illness, scheduling.' : 'Ne pas figurer sur la liste n’est pas un vote « non » — mission, maladie, horaire.'}</span><a class="bill-more" href="${echapper(v.url)}" target="_blank" rel="noopener">${en ? 'Votes and Proceedings → leg.bc.ca' : 'Votes and Proceedings → leg.bc.ca'}</a></div></div></div>`;
    };
    const n = liste.length;
    // Le décompte du dernier vote dans le titre de la case, « pour / contre / abst. » dans l'ordre du titre (Martin, 30 oct. 2026 : « les gens sont pas
    // obligés de cliquer pour rien »). Avec plusieurs votes, l'étape du dernier suit entre parenthèses.
    const decompte = (v) => `${v.pour.length} / ${v.contre.length}`;   // C.-B. : pas d'abstention consignée
    return `<details class="bill-votes" data-objet="${objet}"><summary>${titre}${en ? ': ' : ' : '}${decompte(liste[n - 1])}${n > 1 ? ` (${liste[n - 1].stage ? liste[n - 1].stage + ' · ' : ''}${n} ${en ? 'recorded votes' : 'votes nominaux'})` : ''}</summary><p class="bill-votes-note">${en
      ? 'Every recorded division on this bill, oldest first, as written in the Assembly’s Journal. A name in grey: this person no longer sits in the Assembly.'
      : 'Chaque vote nom par nom sur ce projet, du plus ancien au plus récent, tel que consigné au Journal de l’Assemblée. Un nom en gris : cette personne ne siège plus à l’Assemblée.'}</p>${liste.map(carte).join('')}</details>`;
  };
  // « Mémoires déposés » (21 oct. 2026, cinquième outil de l'abonnement). Seul le NOMBRE est public :
  // la liste est servie aux abonné·e·s par api/export.js?jeu=consultations, que commun/dq.js
  // (remplirMemoires) appelle au dépliement de la carte. Source : api/consultations-data.json.
  const nbMemoires = {};
  const caseMemoires = (b, en) => {
    const n = nbMemoires[b.id];
    if (!n) return '';
    return `<details class="bill-votes bill-memoires" data-memoires="${echapper(b.id)}"><summary>${en ? `Briefs submitted in committee (${n})` : `Mémoires déposés en commission (${n})`} <span class="pastille-abonnes">${en ? 'Subscribers only' : 'Réservé aux abonné·e·s'}</span></summary><div class="bill-memoires-corps"><p class="bill-votes-note">${en
      ? `${n} brief${n > 1 ? 's' : ''} submitted to the parliamentary committee. Who submitted them, with the link to each official brief: <span class="pastille-abonnes">reserved for subscribers</span>. <a href="/abonnement">See the subscription</a>.`
      : `${n} mémoire${n > 1 ? 's' : ''} déposé${n > 1 ? 's' : ''} à la commission parlementaire. Qui les a déposés, avec le lien vers chaque mémoire officiel : <span class="pastille-abonnes">réservé aux abonné·e·s</span>. <a href="/abonnement">Voir l’abonnement</a>.`}</p></div></details>`;
  };
  for (const b of bills) {
    if (b.summary) resumes.fr[b.id] = b.summary + listeLois(b, false) + caseVotes(b, false) + caseMemoires(b, false);
    if (b.summaryEn) resumes.en[b.id] = b.summaryEn + listeLois(b, true) + caseVotes(b, true) + caseMemoires(b, true);
  }
  for (const [langue, map] of Object.entries(resumes)) {
    const chemin = `data/bills-resumes-${langue}.json`;
    const contenu = JSON.stringify(map);
    // Ne réécrire que si ça change : garde le diff quotidien à ce qui a vraiment bougé.
    if (existsSync(chemin) && readFileSync(chemin, 'utf-8') === contenu) continue;
    writeFileSync(chemin, contenu);
  }

  // Ce qui part dans la page : tout sauf les résumés.
  const allege = bills.map(({ summary, summaryEn, _lois, ...reste }) => reste);

  const html = readFileSync(HTML_PATH, 'utf-8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marqueurs BILLS_DATA_START/END introuvables dans ${HTML_PATH}`);
  }

  // L'état des législatures, tel que l'API de l'Assemblée le donne (voir scrapers/bills.js). La
  // page s'en sert pour dire, sans qu'aucune date soit écrite à la main, quelle législature elle
  // montre et où en est la suivante (etatLegislature, commun/dq.js). Après une élection, la
  // nouvelle législature existe des semaines avant d'avoir une session, des député·e·s ou un
  // conseil des ministres : c'est ce décalage que ces champs racontent.
  const etat = {
    montree: data.legislature ?? null,
    terminee: data.legislatureTerminee ?? null,
    enCours: data.legislatureEnCours ?? null,
    enCoursDebut: data.legislatureEnCoursDebut ?? null,
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
  };

  const block = `${START_MARKER} — généré automatiquement par scrapers/build-frontend-data.js à partir de\n   data/bills.json (voir scrapers/bills.js et scrapers/bill-summaries.js). Ne pas éditer ce bloc\n   à la main : relancer \`node scrapers/build-frontend-data.js\` à la place.\n   Les résumés ne sont PAS ici : ils vivent dans data/bills-resumes-{fr,en}.json et se chargent\n   au premier dépliement de carte ou à la première recherche.\n   Généré le ${new Date().toISOString()} */\nconst legislatureEtat = ${JSON.stringify(etat)};\nconst bills = ${JSON.stringify(allege, null, 2)};\n`;

  const updated = html.slice(0, startIdx) + block + html.slice(endIdx);
  writeFileSync(HTML_PATH, updated);
  const ko = (x) => (Buffer.byteLength(JSON.stringify(x)) / 1024).toFixed(0);
  console.log(`${bills.length} projets de loi injectés directement dans ${HTML_PATH} — ${ko(allege)} ko dans la page`);
  console.log(`  résumés sortis : ${ko(resumes.fr)} ko en français, ${ko(resumes.en)} ko en anglais`);
}

main();
