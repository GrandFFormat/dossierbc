// La logique de DossierQuébec, partagée par les sept pages.
//
// Elle vivait en ligne dans index.html, donc recopiée à l'identique dans six pages de 2 Mo.
// Ici, le navigateur la prend une seule fois et la garde.
//
// Script CLASSIQUE, jamais un module : les fonctions appelées depuis les attributs onclick du
// HTML doivent vivre dans la portée globale. Il est posé après tout le HTML, donc le document
// est déjà analysé quand ce code démarre.

/* ---------------- LES DONNÉES DE LA PAGE ---------------- */
//
// Chaque page déclare dans <body data-donnees="…"> ce qu'elle affiche, et ne charge que ça.
// Avant, les six pages de la racine portaient les neuf jeux en ligne, identiques : 500 ko par
// page, dont la quasi-totalité ne servait pas à la vue affichée. Ouvrir /lexique téléchargeait
// les 735 votes nominatifs.
//
// Ce sont des `let`, pas des `const` : ils sont vides jusqu'à l'arrivée des fichiers. Toute
// fonction de rendu tourne APRÈS chargerDonnees(), et celles dont la vue n'est pas sur la page
// sortent immédiatement (voir les gardes en tête de chacune).
let ministers = [], bills = [], votes = [], presences = {}, historiqueLeg = {}, deputesRaw = [],
    deputeEmails = {}, newsItems = [], petitions = [], promises = [], stats = null, journal = [];

// Dérivés des précédents, recalculés une fois les fichiers arrivés.
let deputes = [], deputeById = new Map(), voteById = new Map();

// Nom déclaré dans data-donnees → variable à remplir. Trois noms visent `bills` avec des
// contenus différents, et c'est voulu : l'accueil n'a besoin que des 4 projets récents, la page
// des votes que des titres et parrains. Charger les 143 projets complets pour ça, c'était 113 ko.
// Rempli par chargerDonnees() ; null tant que le fichier n'est pas arrivé.
let legislatureEtat = null;

const _remplir = {
  ministers: (v) => { ministers = v; },
  bills: (v) => { bills = v; },
  apercuBills: (v) => { bills = v; },
  billsTitres: (v) => { bills = v; },
  // Page Ministres : le parrain et son rôle, rien d'autre (« PL parrainés », billsSponsoredBy).
  billsParrains: (v) => { bills = v; },
  votes: (v) => { votes = v; },
  presences: (v) => { presences = v; },
  // Législatures terminées : présence et PL parrainés par personne (pastilles des cartes).
  historiqueLeg: (v) => { historiqueLeg = v; },
  deputesRaw: (v) => { deputesRaw = v; },
  deputeEmails: (v) => { deputeEmails = v; },
  newsItems: (v) => { newsItems = v; },
  petitions: (v) => { petitions = v; },
  promises: (v) => { promises = v; },
  stats: (v) => { stats = v; },
  // L'état des législatures (scrapers/build-frontend-data.js) : quelle législature est montrée,
  // laquelle est en cours, depuis quand. Il arrive par le réseau comme le reste.
  legislatureEtat: (v) => { legislatureEtat = v; },
  journal: (v) => { journal = v; },
};

// Presque tout sort de data/site/, que scripts/build-section-pages.js régénère. Le journal des
// mises à jour, lui, est écrit À LA MAIN : il vit à part, pour que personne ne le croie fabriqué.
const _chemins = { journal: '/data/journal.json' };

// Les jeux qui n'ont pas pu arriver. Leur liste écrite dans le HTML par le build (div.prerendu)
// reste alors affichée : c'est justement le cas où elle sert. Voir retirerPrerendus().
const _echecs = new Set();
async function chargerDonnees(){
  const demandes = (document.body.dataset.donnees || '').split(',').map(s => s.trim()).filter(Boolean);
  // En parallèle : ces fichiers ne dépendent pas les uns des autres, les enchaîner coûterait
  // un aller-retour par jeu.
  await Promise.all(demandes.map(async (nom) => {
    const poser = _remplir[nom];
    if(!poser){ console.warn('jeu de données inconnu : ' + nom); return; }
    try {
      const r = await fetch(_chemins[nom] || `/data/site/${nom}.json`);
      if(!r.ok) throw new Error(r.status);
      poser(await r.json());
    } catch (e) {
      // Une page à moitié vide vaut mieux qu'une page blanche : on note et on continue.
      console.error(`données ${nom} non chargées :`, e.message);
      _echecs.add(nom);
    }
  }));
  deputes = deputesRaw.map(d => ({ name: d[0], riding: d[1], region: d[2], party: d[3], assnatId: d[4], mandats: d[5] ?? null, wiki: d[6] ?? null, role: d[7] ?? null }));
  // N.-B. : la présidence vient des données (deputes.js la lit sur leg.bc.ca), pas d'une liste écrite à la main.
  for(const d of deputes) if(d.role === 'speaker') presidingRoles[norm(d.name)] = { fr: "Présidence de l'Assemblée législative", en: 'Speaker of the Legislative Assembly' };
  deputeById = new Map(deputes.map(d => [d.assnatId, d]));
  voteById = new Map(votes.map(v => [v.id, v]));
  if(newsItems.length) newsAnchor = newsItems.reduce((max, n) => (n.date > max ? n.date : max), newsItems[0].date);
  // Les trois compteurs de l'accueil étaient posés par renderMinistres, renderBills et
  // renderVotes — des vues qui ne sont plus sur cette page. Ils viennent maintenant de stats.
  if(stats){
    const poser = (id, n) => { const e = document.getElementById(id); if(e) e.textContent = n; };
    poser('statDeputes', stats.deputes);
    poser('statMinistres', stats.ministres);
    poser('statProjets', stats.projets);
    poser('statVotes', stats.votes);
  }
  poserSessionAffiche();
}

// ARCHIVES DES PROJETS DE LOI (4 oct. 2026). scrapers/bills.js ne garde que la législature la plus
// récente ; scripts/build-bill-pages.js recopie donc chaque législature dans data/archives/<n>/.
// Tant que l'archive EST la législature en direct (aujourd'hui : la 43e), rien ne change ici.
// Ensuite, /projets-de-loi/3-43-3 et /projets-de-loi?archives=43 chargent l'archive à la place
// des projets en direct. Les VOTES suivent depuis le 30 oct. 2026 (scrapers/build-votes-data.js
// les recopie aussi) : /votes?archives=43 lit data/archives/43/votes.json, et le nominatif de
// data/archives/43/votes/. La page /archives liste les législatures terminées (renderArchives).
let archiveLeg = null;      // la législature archivée affichée, sinon null
let archivesDispo = [];     // les législatures archivées, sauf celle en direct
let legEnDirect = 0;        // la législature en direct, selon data/archives/index.json
let votesBase = '/data/votes';   // où vit le nominatif des votes affichés (archive ou direct)
async function chargerArchive(){
  const surProjets = !!document.getElementById('billsList');
  const surVotes = !!document.getElementById('votesList');
  if(!surProjets && !surVotes && !document.getElementById('archivesListe')) return;   // rien d'archivable ici
  const page = location.pathname.match(/^\/projets-de-loi\/\d+-(\d+)-\d+/);
  const demandee = Number(page ? page[1] : new URLSearchParams(location.search).get('archives')) || 0;
  try {
    const idx = await fetch('/data/archives/index.json').then(r => r.ok ? r.json() : null);
    legEnDirect = (idx && idx.enDirect) || Math.max(0, ...bills.map(b => Number(b.legislature) || 0));
    archivesDispo = ((idx && idx.legislatures) || []).filter(l => l !== legEnDirect);
  } catch (e) { /* sans index : pas d'archives, la page marche comme avant */ }
  if(!demandee || !archivesDispo.includes(demandee) || (!surProjets && !surVotes)) return;
  try {
    // Les projets de l'archive : complets sur /projets-de-loi, pour leurs titres sur /votes.
    const r = await fetch(`/data/archives/${demandee}/bills.json`);
    if(!r.ok) throw new Error(r.status);
    bills = await r.json();
    archiveLeg = demandee;
    if(surVotes){
      const rv = await fetch(`/data/archives/${demandee}/votes.json`);
      if(!rv.ok) throw new Error(rv.status);
      votes = await rv.json();
      voteById = new Map(votes.map(v => [v.id, v]));
      votesBase = `/data/archives/${demandee}/votes`;
    }
  } catch (e) { console.error('archive non chargée :', e.message); }
}
// Une législature terminée : les projets non sanctionnés y sont morts, dissolution en cours ou non.
// Une législature est finie quand on est dans les archives, quand l'Assemblée est dissoute — ou,
// en Colombie-Britannique, quand celle qu'on montre n'est plus celle en cours (legislatureEtat,
// lu dans les données de l'Assemblée). Sans ce dernier cas, un projet mort à la prorogation
// s'affichait « On ice », comme s'il pouvait encore repartir.
const legislatureFinie = () => ASSEMBLY.dissolved || archiveLeg !== null
  || Boolean(typeof legislatureEtat !== 'undefined' && legislatureEtat
    && legislatureEtat.enCours && legislatureEtat.montree
    && legislatureEtat.enCours !== legislatureEtat.montree);
// « 43e législature » / « 43rd legislature ».
function nomLegislature(l, isEn){
  return isEn ? `${l}${l % 10 === 1 && l % 100 !== 11 ? 'st' : l % 10 === 2 && l % 100 !== 12 ? 'nd' : l % 10 === 3 && l % 100 !== 13 ? 'rd' : 'th'} legislature` : `${l}<sup>e</sup> législature`;
}
// La bande « vous êtes dans les archives », au-dessus de la liste des projets ou des votes. Hors
// archives, rien : l'onglet Archives mène aux législatures terminées (30 oct. 2026).
function renderArchivesNote(){
  const isEn = currentLang === 'en';
  const lang = isEn ? '?lang=en' : '';
  const lienVotes = document.querySelector('#lienTousVotes a');
  if(lienVotes) lienVotes.setAttribute('href', archiveLeg ? `/votes?archives=${archiveLeg}` : '/votes');
  for(const [tete, avant, html] of [
    [document.getElementById('billsResultHead'), true, isEn
      ? `<b>Archives: ${nomLegislature(archiveLeg, true)}.</b> These bills belong to a legislature that has ended. <a href="/projets-de-loi${lang}">← Current bills</a>`
      : `<b>Archives de la ${nomLegislature(archiveLeg, false)}.</b> Ces projets datent d'une législature terminée. <a href="/projets-de-loi">← Projets de loi en cours</a>`],
    [document.querySelector('#view-votes .section-head'), true, isEn
      ? `<b>Archives: ${nomLegislature(archiveLeg, true)}.</b> These votes belong to a legislature that has ended. <a href="/votes${lang}">← Current votes</a>`
      : `<b>Archives de la ${nomLegislature(archiveLeg, false)}.</b> Ces votes datent d'une législature terminée. <a href="/votes">← Votes en cours</a>`],
  ]){
    if(!tete) continue;
    let note = tete.parentNode.querySelector(':scope > .archives-note.archives-bande');
    if(!archiveLeg){ if(note) note.remove(); continue; }
    if(!note){
      note = document.createElement('p');
      note.className = 'archives-note archives-bande';
      if(avant) tete.before(note);
    }
    note.innerHTML = html;
  }
}
// La page /archives : une carte par législature terminée, la plus récente d'abord. Avant la première
// archive (la 43e, le 17 nov. 2026), une ligne dit quand elle arrivera.
function renderArchives(){
  const liste = document.getElementById('archivesListe');
  if(!liste) return;
  const isEn = currentLang === 'en';
  const q = (premier) => isEn ? (premier ? '?lang=en' : '&lang=en') : '';
  if(!archivesDispo.length){
    const l = legEnDirect || 43;
    liste.innerHTML = `<li class="regle"><p>${isEn
      ? `The ${nomLegislature(l, true)} will be archived here as soon as the ${nomLegislature(l + 1, true)} publishes its own Members and cabinet. Until then, its bills, its recorded votes and its people are the ones this site shows: on the <a href="/projets-de-loi${q(true)}">Bills</a>, <a href="/votes${q(true)}">Votes</a> and <a href="/ministres${q(true)}">Ministers</a> pages.`
      : `La ${nomLegislature(l, false)} sera archivée ici dès que la ${nomLegislature(l + 1, false)} aura publié ses propres député·e·s et son conseil des ministres. D'ici là, ses projets de loi, ses votes nominatifs et ses gens sont ceux que le site montre : sur les pages <a href="/projets-de-loi">Projets de loi</a>, <a href="/votes">Votes</a> et <a href="/ministres">Ministres</a>.`}</p></li>`;
    return;
  }
  liste.innerHTML = archivesDispo.slice().sort((a, b) => b - a).map(l => `
      <li class="regle">
        <h2 class="regle-titre"><span class="regle-no">${l}<sup>${isEn ? '' : 'e'}</sup></span><span>${isEn ? `The ${nomLegislature(l, true)}` : `La ${nomLegislature(l, false)}`}</span></h2>
        <p class="archives-liens"><a href="/projets-de-loi?archives=${l}${q(false)}">${isEn ? `Bills of the ${nomLegislature(l, true)}` : `Projets de loi de la ${nomLegislature(l, false)}`} →</a><br>
        <a href="/votes?archives=${l}${q(false)}">${isEn ? `Votes of the ${nomLegislature(l, true)}` : `Votes de la ${nomLegislature(l, false)}`} →</a></p>
      </li>`).join('');
}

/* ---------------- I18N ---------------- */
const translations = {
  fr: {
    /* LE FRANÇAIS DU SITE. DossierBC est anglophone : son HTML est en anglais, et ce bloc
       porte la version française de chaque texte fixe. Il a été rempli en récoltant le
       français du gabarit au moment de la bascule, le 8 novembre 2026. Une clé ajoutée au
       gabarit doit recevoir SA LIGNE ICI, sinon le bouton « Français » laissera l'anglais.
       Ne pas éditer à la main sans savoir : les valeurs portent du HTML (gras, liens). */
    "apercu.composition.sub": "Répartition des sièges par parti",
    "apercu.recent.sub": "Cliquez un projet pour lire son résumé en langage clair, son étape et les votes.",
    "apercu.source": "Source officielle : <a href=\"https://www.leg.bc.ca/\" target=\"_blank\" rel=\"noopener\">leg.bc.ca</a>",
    "apercu.voirtout": "Voir tout →",
    "apropos.sources.h": "Sources publiques utilisées ici",
    "apropos.sources.p": "\r\n        <b style=\"color:var(--ink)\">Projets de loi, étapes et dates</b> — le système d'information législative de l'Assemblée (api.lims.leg.bc.ca), « progress of bills » de chaque session : la date de chaque lecture, telle que l'Assemblée l'a inscrite.<br>\r\n        <b style=\"color:var(--ink)\">Détails des projets de loi</b> (type, parrain, texte officiel) — leg.bc.ca, la fiche de chaque projet. L'Assemblée législative de la Colombie-Britannique publie EN ANGLAIS seulement : le titre d'une loi n'a pas de version française, et on ne le traduit pas.<br>\r\n        <b style=\"color:var(--ink)\">Résumés en langage clair</b> — <b style=\"color:var(--ink)\">il n'y en a pas encore.</b> Chaque page de projet de loi le dit et renvoie au texte officiel, plutôt que d'afficher quelque chose écrit sans l'avoir lu.<br>\r\n        <b style=\"color:var(--ink)\">Votes nominatifs</b> — les Journaux de l'Assemblée (Votes and Proceedings, leg.bc.ca), le seul endroit où les noms sont consignés.<br>\r\n        <b style=\"color:var(--ink)\">Conseil exécutif et député·e·s</b> — l'interface de données de l'Assemblée (leg.bc.ca) : fonctions, parti, circonscription. Les courriels affichés sont les adresses législatives (prénom.nom.MLA@leg.bc.ca) que l'Assemblée publie elle-même pour qu'on puisse écrire à ses élu·e·s.<br>\r\n        <b style=\"color:var(--ink)\">Résultat de l'élection du 24 octobre 2026</b> — l'article de Wikipédia sur le scrutin, nommé sous la barre des sièges avec le jour de la lecture. C'est la seule chose que le site y prend : elections.bc.ca ferme son site aux robots.<br>\r\n        <b style=\"color:var(--ink)\">Présence (%)</b> — calculée à partir des votes nominatifs ci-dessus, en ne comptant que les divisions de la CHAMBRE (voir la définition dans le lexique) ; aucune source externe.\r\n      ",
    "bd.back": "← Retour à l'aperçu",
    "bd.intro1": "Bonjour, moi c'est",
    "bd.intro3": "j'ai 45 ans et dossierbc.ca, c'est votre premier pas vers la démocratie !",
    "bd.mot1": "Si on veut que les gens comprennent la politique, il faut la ramener à leur niveau.",
    "bd.mot2": "Quand j'ai voulu m'y intéresser, en plus de ne pas connaître le jargon, les projets de loi tenaient en deux lignes… et cinquante PDF. Le commun des mortels passait son chemin.",
    "bd.mot3": "J'ai eu l'idée de me servir de l'intelligence artificielle pour, d'abord, analyser tout ça, et ensuite le vulgariser. C'est comme ça que DossierQuébec est né, puis DossierBC.",
    "bd.mot4": "Ici, les résumés en langage clair ne sont pas encore écrits : chaque projet de loi le dit et renvoie au texte officiel. En attendant, j'ai mis à la disposition des gens un lexique qui explique les fondements du jargon politique. Je suis l'Éducaloi de la politique !",
    "btn.follow": "+ Suivre",
    "btn.following": "✓ Suivi",
    "btn.hideSummary": "− Masquer le résumé",
    "btn.viewFull": "Voir la fiche officielle sur leg.bc.ca →",
    "btn.viewSummary": "+ Voir le résumé",
    "cal.status": "● Assemblée législative de la Colombie-Britannique",
    "ch.more": "Voir plus →",
    "chexp.h": "✋ C'est quoi, « challenger » ?",
    "chexp.p1": "Un clic sur « Demander une explication » = une demande citoyenne pour que le parrain du projet l'explique en langage clair, et pour qu'on le garde à l'œil ensemble.",
    "chexp.p2": "<b>Un compte (courriel) est requis</b> — une demande par personne, aucune demande anonyme.",
    "chexp.p2.dissous": "<b>Un compte (courriel) est requis</b> — une demande par personne, aucune demande anonyme. L'Assemblée est dissoute : ces projets sont morts au feuilleton. Les demandes restent enregistrées et comptées — elles diront, à la rentrée du 17 novembre, ce que les gens voulaient voir expliqué.",
    "chexp.p3": "En Colombie-Britannique, ces demandes ne mènent à rien d'officiel : l'Assemblée ne reçoit que des pétitions sur papier, déposées par un·e député·e, et ne tient pas de pétition en ligne. Pour l'instant, c'est une façon simple de voir quelles lois posent problème aux gens. Un jour, un·e élu·e y verra peut-être un outil.",
    "commandite.cta": "Commanditer une ville →",
    "commandite.h": "Faites entrer votre conseil municipal",
    "commandite.p": "Ordres du jour, votes et résolutions en langage clair. Une commandite locale finance une ville.",
    "commandite.sur": "Commandite",
    "commandite.villes": "Vancouver, Surrey, Victoria — aucune ville de la C.-B. n'est couverte",
    "fil.accueil": "Accueil",
    "fil.rtv": "Représentez votre ville",
    "fil.bd": "Mises à jour du site",
    "fil.introuvable": "Page introuvable",
    "filter.etapes": "Étapes",
    "filter.statuts": "Statuts",
    "footer.left": "Site non officiel — données publiques de l'Assemblée législative de la Colombie-Britannique ·",
    "footer.regles": "Les règles",
    "footer.right": "Une réalisation de",
    "footer.source": "Code source",
    "footer.villes": "Villes :",
    "h.apropos": "D'où viennent ces données, et comment aller plus loin",
    "h.billsrecent": "Récemment actifs à l'Assemblée",
    "h.composition": "Composition de l'Assemblée",
    "h.compte": "Compte",
    "h.lexique": "Lexique du jargon parlementaire",
    "h.lexique.sub": "Pour comprendre le reste du site sans avoir fait un cours de science politique",
    "h.lobby": "Le registre des lobbyistes",
    "h.ministres": "Ministres et député·e·s",
    "h.ministres2": "Les ministres",
    "h.personnes": "Qui gravite autour de l'Assemblée",
    "h.petitions": "Pétitions à l'Assemblée législative",
    "h.projets": "Projets de loi",
    "h.quoideneuf": "Ce qui s'est vraiment passé",
    "kicker.journal": "Journal",
    "kicker.projets": "Projets de loi",
    "h.quoideneuf.sub": "Du plus récent au plus ancien. Uniquement des événements du compte rendu officiel.",
    "h.trouve": "Trouvez votre député",
    "h.votes": "Registre des votes",
    "hero.cta": "Explorer →",
    "hero.cta2": "Les député·e·s",
    "hero.l1": "Qui siège,",
    "hero.l2": "qui légifère,",
    "hero.l3": "qui vote quoi.",
    "hero.manifesto": "L'Assemblée législative de la Colombie-Britannique, réorganisée <b>par personne</b> et traduite en <b>langage clair</b>. Aucun jugement, aucun verdict — un site citoyen indépendant, sur de vraies données publiques.",
    "legend.label": "Le chemin d'un projet de loi :",
    "legend.link": "C'est quoi ces étapes ? → Lexique",
    "lex.1.d": "Le texte qu'un député ou le gouvernement soumet à l'Assemblée pour qu'il devienne une loi. Il devient une vraie loi seulement une fois adopté puis sanctionné.",
    "lex.1.t": "Projet de loi",
    "lex.10.d": "Le député responsable d'organiser les travaux de son groupe à l'Assemblée — un peu le chef d'orchestre du calendrier et des débats pour son parti.",
    "lex.10.t": "Leader parlementaire",
    "lex.11.d": "Le député chargé de s'assurer que les membres de son groupe parlementaire sont présents aux votes et suivent la ligne du parti.",
    "lex.11.t": "Whip",
    "lex.12.d": "Un ministre qui n'est pas le grand titulaire d'un ministère, mais qui a la charge officielle d'un dossier précis à l'intérieur ou en marge de celui-ci.",
    "lex.12.t": "Ministre délégué / Ministre responsable de",
    "lex.13.d": "Le chiffre affiché sous chaque député·e : sur les votes par appel nominal <b>de la Chambre</b>, la part de ceux où cette personne apparaît comme pour ou contre — donc était présente pour voter, peu importe le sens de son vote. Les divisions tenues en <b>comité</b> (Committee of the Whole, Committee of Supply, en Section A, B ou C) n'y entrent pas : une dizaine de député·e·s seulement y siègent, et les compter ferait passer tout le monde pour absent. Le compte débute à l'ouverture de la législature. L'Assemblée ne publie pas d'assiduité officielle ; c'est un indicateur de présence, pas une mesure officielle, et un vote manqué peut être une mission officielle, une maladie ou un conflit d'horaire — le registre n'en donne pas la raison.",
    "lex.13.t": "Présence (%)",
    "lex.14.d": "Un texte qu’un organisme, une entreprise ou un·e citoyen·ne soumet à un comité de l’Assemblée pour dire ce qu’il pense d’un projet de loi ou d’un sujet à l’étude : ce qu’il appuie, ce qu’il faudrait changer, ce qui l’inquiète. Certains sont invités à venir le présenter devant les député·e·s.",
    "lex.14.t": "Mémoire (en comité)",
    "lex.15.d": "Les deux cherchent à influencer une décision, pas de la même façon. Le <b>mémoire</b> est une prise de position publique, dans le cadre officiel d’un comité : on sait qui parle et sur quel sujet. Le <b>lobbyisme</b> se fait en privé : rencontres, appels ou courriels auprès d’un ministre, d’un cabinet ou de fonctionnaires. La loi oblige seulement à l’inscrire au registre des lobbyistes de la province, qui dit qui fait pression, pour qui et sur quel sujet, jamais ce qui s’est dit.",
    "lex.15.t": "Mémoire ou lobbyisme?",
    "lex.2.d": "La première grande étape : l'Assemblée débat de l'idée générale du projet de loi et vote pour dire si elle l'accepte, avant d'en étudier le détail article par article.",
    "lex.2.t": "Deuxième lecture",
    "lex.3.d": "L'étape où le projet de loi est passé au peigne fin, article par article, le plus souvent en comité plénier (toute l'Assemblée siégeant comme comité), parfois par un comité permanent. Des amendements peuvent y être proposés.",
    "lex.3.t": "Étude en comité",
    "lex.4.d": "Le vote final de l'Assemblée sur l'ensemble du projet de loi, une fois l'étude en comité terminée.",
    "lex.4.t": "Troisième lecture",
    "lex.5.d": "La toute dernière étape : le ou la lieutenant-gouverneur·e donne son assentiment officiel, et le projet de loi devient formellement une loi de la Colombie-Britannique.",
    "lex.5.t": "Sanction royale",
    "lex.6.d": "Un groupe plus restreint de député·e·s qui étudie un sujet ou un projet de loi en profondeur, peut entendre des expert·e·s et des citoyen·ne·s, puis fait rapport à l'Assemblée au complet.",
    "lex.6.t": "Comité",
    "lex.7.d": "Un vote où le nom de chaque député·e et son choix (pour ou contre) sont consignés dans les Journaux de l'Assemblée — par opposition à un vote de vive voix, où seul le résultat est noté. Au Colombie-Britannique, la plupart des projets de loi passent de vive voix.",
    "lex.7.t": "Vote par appel nominal",
    "lex.8.d": "Le compte rendu officiel, mais résumé, de chaque séance : décisions, votes, dépôts de documents. C'est là, et seulement là, que sont consignés les noms lors d'un vote par appel nominal.",
    "lex.8.t": "Journal de l'Assemblée",
    "lex.9.d": "La transcription complète, mot pour mot, de tout ce qui a été dit en Chambre — contrairement au Journal de l'Assemblée, qui ne fait que résumer les décisions.",
    "lex.9.t": "Journal des débats",
    "lexcat.outils": "Outils citoyens",
    "lexcat.pers": "Personnes et rôles",
    "lexcat.proc": "Processus",
    "lexcat.votes": "Votes",
    "lexhero.l1": "Le jargon,",
    "lexhero.l2": "décodé.",
    "lexhero.sub": "« Première lecture », « comité plénier », « sanction royale »… L'Assemblée a son vocabulaire. <b>Ici, chaque terme est expliqué comme à un·e ami·e.</b>",
    "lire.1.h": "Vote nominal",
    "lire.1.p": "Chaque député·e se lève et son choix est consigné aux Journaux de l'Assemblée. C'est le seul type de vote qu'on peut attribuer à une personne.",
    "lire.2.h": "Adopté ≠ loi",
    "lire.2.p": "Un vote gagné fait avancer le projet d'une étape. Il ne devient loi qu'après la sanction du lieutenant-gouverneur.",
    "lire.3.h": "Ligne de parti",
    "lire.3.p": "La plupart des votes suivent la consigne du parti. Les votes libres sont rares — et c'est là que le détail nominatif devient intéressant.",
    "lire.h": "Comment lire un vote",
    "lobby.body": "Toute personne payée pour communiquer avec des <b>titulaires de charge publique</b> (ministres, député·e·s, hauts fonctionnaires…) afin d'influencer une décision doit s'inscrire au <b>registre des lobbyistes</b> de la Colombie-Britannique, tenu par le Bureau du registraire des lobbyistes.",
    "lobby.link1": "Consulter le registre officiel ↗",
    "lobby.link2": "Accueil du registre ↗",
    "lobby.link3": "Commissaire à l'intégrité ↗",
    "lobby.note": "Pourquoi ce site ne reproduit pas le registre : nous n'avons pas demandé l'autorisation au registraire, et on ne recopie pas un registre public sans elle. L'outil de recherche ci-dessous est l'officiel, et il reste la référence.",
    "lobby.sub": "Qui est payé pour influencer les décisions publiques — et comment le consulter",
    "lp.aster": "* La présidence de l'Assemblée n'est pas la même chose que le ou la première ministre : elle dirige les débats et reste neutre, alors que le ou la première ministre dirige le gouvernement et vote comme les autres élus. <a href=\"/lexique#role-presidence\">Voir la présidence de l'Assemblée dans le Lexique →</a>",
    "lp.aster2": "** Mis à jour chaque semaine : le site relit les votes nominatifs consignés dans les Journaux de l'Assemblée et recalcule le taux de chacun, puis la médiane, les couleurs et les nombres ci-dessus. Un vote apparaît ici une fois son Journal publié.",
    "lp.debut": "Seules comptent les divisions de la Chambre. Les comités siègent en Section A, B ou C avec une dizaine de député·e·s : leurs votes ne disent rien de la présence des autres, et sont laissés de côté. Une personne élue à une partielle est comptée à partir du jour de son élection, pas avant.",
    "lp.formule": "<b>88 %</b> : sur 100 votes par appel nominal tenus par la Chambre depuis l’ouverture de la législature, la personne a voté à 88 — pour ou contre, peu importe le sens.",
    "lp.lien": "Définition complète → Lexique",
    "lp.nd": "<b>n/d</b> : aucun vote enregistré pour cette personne.",
    "lp.officiel": "Ce n'est pas une mesure officielle : l'Assemblée ne publie pas d'assiduité, et un vote manqué n'en dit pas la raison.",
    "lp.pres": "<b>—</b> : la présidence de l'Assemblée*. Par neutralité, elle ne vote que pour départager une égalité : un taux bas ne voudrait pas dire une absence.",
    "lp.titre": "Lire la présence aux votes",
    "maj.h": "Mises à jour du site",
    "maj.sub": "Ce qui a changé sur DossierBC, du plus récent au plus ancien",
    "mdr.bande": "<b>Une idée, une erreur ?</b> Chaque message est lu.",
    "mdr.ecrire": "Nous écrire",
    "mdr.gratuit": "<b>Gratuit : 3 suivis en tout.</b>",
    "mdr.titre": "Ce que vous suivez, au même endroit",
    "mdvilles.h": "Vos projets de ville",
    "min.legende43": "Présence et projets parrainés : la législature en cours seulement. « n/d » et 0 pour qui n'y a pas encore voté ni parrainé de projet.",
    "min.restNote": "Tous les partis",
    "min.restTitle": "Le reste de l'Assemblée",
    "min.sub2b": " membres du Conseil exécutif en fonction (leg.bc.ca)",
    "minhero.l1": "Conseil exécutif",
    "minhero.l2": "&amp; toute l'Assemblée.",
    "minhero.sub": "Les membres du Conseil exécutif, puis les député·e·s de tous les partis (<b>les député·e·s sont plus bas</b>) — <b>une seule recherche pour les deux.</b>",
    "mission.assnat.1": "Organise tout par document officiel",
    "mission.assnat.2": "La source légale et complète",
    "mission.assnat.3": "Neutre — ne compare et ne résume jamais",
    "mission.assnat.tag": "Le site officiel",
    "mission.eyebrow": "Notre mission",
    "mission.site.1": "Organise tout par personne : une fiche, tous ses dossiers",
    "mission.site.2": "Traduit le jargon en langage clair (voir le Lexique)",
    "mission.site.3": "Vous laisse suivre ce qui vous touche, sans jugement ni verdict",
    "mission.site.tag": "Ce site",
    "mission.st1": "leg.bc.ca est la source qui fait foi. Ce site ne fait que ",
    "mission.st2": "faciliter le suivi.",
    "nav.apercu": "Aperçu",
    "nav.apropos": "D'où viennent ces données",
    "nav.archives": "Archives",
    "nav.close": "Fermer",
    "nav.compte": "Compte & à propos",
    "nav.lexique": "Lexique",
    "nav.ministres": "Ministres",
    "nav.mondossier": "Mon dossier",
    "nav.personnes": "Qui gravite autour",
    "nav.petitions": "Pétitions",
    "nav.projets": "Projets de loi",
    "nav.quoideneuf": "Quoi de neuf",
    "nav.rtv": "Représentez votre ville",
    "nav.trouve": "Trouvez votre député",
    "nav.villes": "Villes",
    "nav.votes": "Votes",
    "p404.abst": "Abstention",
    "p404.accueil": "Accueil",
    "p404.bande.h": "⚠️ Erreur 404 — cette adresse ne mène nulle part",
    "p404.bande.p": "La page demandée n'existe pas sur DossierBC, ou elle a changé d'adresse. Rien de grave : <b>les vrais projets de loi, eux, sont à un clic.</b>",
    "p404.blague": "Ce vote est une blague : il n'a jamais eu lieu, et il n'y a pas 404 député·e·s. Sur ce site, c'est la seule donnée inventée. <a href=\"/votes\">Les vrais votes sont ici.</a>",
    "p404.contre": "Contre",
    "p404.e1": "Première lecture ✓",
    "p404.e2": "Deuxième lecture",
    "p404.e3": "Étude en comité",
    "p404.e4": "Sanction royale",
    "p404.l1": "Cette page est morte",
    "p404.l2": "dans l'œuf.",
    "p404.lien1": "Ceux qui existent pour vrai, résumés en clair.",
    "p404.lien2": "Qui a voté quoi, député·e par député·e.",
    "p404.lien4": "On recommence du début, sans rancune.",
    "p404.pour": "Pour",
    "p404.sub": "Comme bien des projets de loi : présentée avec de belles intentions, jamais adoptée. <b>Ou alors l'adresse a une faute de frappe, ça arrive même aux légistes.</b>",
    "p404.verdict": "Motion rejetée. Même pas proche.",
    "p404.vote.motion": "« Que cette page existe. »",
    "p404.vote.sur": "Vote par appel nominal",
    "pers.1.desc": "Élue par la Chambre, elle préside les débats et y fait respecter l'ordre. Députée de Madawaska Les Lacs-Edmundston (Parti libéral), mais son rôle de présidence exige la neutralité.",
    "pers.1.role": "Présidente de l'Assemblée législative",
    "pers.2.badge": "Cérémoniel + sanction des lois",
    "pers.2.desc": "33e titulaire du poste, installée le 22 janvier 2025. Elle représente le Roi en Colombie-Britannique, et c'est elle qui donne la sanction royale citée dans chaque fiche de projet de loi de ce site.",
    "pers.2.role": "Lieutenante-gouverneure de la Colombie-Britannique",
    "pers.3.desc": "Rend compte à l'Assemblée et à la population de la gestion des fonds et des ressources publics. En poste depuis janvier 2022.",
    "pers.3.role": "Vérificateur général de la Colombie-Britannique",
    "pers.4.desc": "Examine les plaintes contre le secteur public provincial et veille aussi à l'accès à l'information et à la protection de la vie privée. En poste depuis le 1er janvier 2022.",
    "pers.4.role": "Ombud de la Colombie-Britannique",
    "pers.5.desc": "Dirige les élections provinciales de façon impartiale, ainsi que les élections municipales, et contrôle le financement politique. En poste depuis mars 2017.",
    "pers.5.role": "Directrice générale des élections",
    "pers.6.desc": "Veille aux règles sur les conflits d'intérêts des député·e·s et des hauts fonctionnaires, et tient le Registre des lobbyistes. En poste depuis le 1er janvier 2020.",
    "pers.6.role": "Commissaire à l'intégrité",
    "pers.7.desc": "Protège et défend les droits des enfants, des jeunes, des adultes vulnérables et des aînés. En poste depuis le 7 février 2022.",
    "pers.7.role": "Défenseur des enfants, des jeunes et des aînés",
    "pers.8.desc": "Enquête sur les plaintes liées à la Loi sur les langues officielles et fait la promotion des deux langues officielles. En poste depuis le 2 janvier 2020.",
    "pers.8.role": "Commissaire aux langues officielles",
    "pers.badge.designee": "Personne désignée",
    "pers.g1": "À l'intérieur de l'Assemblée",
    "pers.g2": "Représentante de la Couronne",
    "pers.g3": "Chiens de garde indépendants — nommés par l'Assemblée, pas par le gouvernement",
    "pers.info": "Ces personnes exercent des fonctions publiques officielles et sont nommées selon un processus prévu par la loi — c'est en cela que l'information ci-dessus est publique. Ça ne veut pas dire que tout ce qui les concerne devient public : je m'en tiens ici à leur fonction officielle, comme pour tout le reste du site.",
    "pers.sub": "Les rôles publics qu'on n'avait pas encore couverts — vrais noms, vraies fonctions actuelles",
    "ph.searchBills": "Numéro, titre ou mot-clé…",
    "ph.searchDeputes": "Nom, circonscription ou région…",
    "ph.searchMinistres": "Nom, circonscription, parti…",
    "ph.searchVotes": "Mot-clé : sujet, numéro de projet de loi…",
    "projets.tousvotes": "Tous les votes nominaux, motions comprises →",
    "projhero.l1": "Projets de loi,",
    "projhero.l2": "traduits en clair.",
    "projhero.sub": "Chaque projet avec son étape réelle et la date de chaque lecture. <b>Le texte intégral reste toujours à un clic, sur leg.bc.ca.</b>",
    "promo.h": "Suivez jusqu'à trois projets",
    "promo.mesdossiers": "Mon dossier →",
    "promo.p": "Un lien arrive par courriel quand un projet suivi bouge. Jusqu'à 3 projets dans Mon dossier.",
    "promo.sur": "Gratuit · sans mot de passe",
    "promo.courriel": "Votre courriel",
    "quicknav.apropos": "D'où viennent ces données",
    "quicknav.label": "Aller à :",
    "quicknav.lexiqueitem": "Lexique",
    "quicknav.lobby": "Registre des lobbyistes",
    "quicknav.personnes": "Qui gravite autour",
    "quoideneuf.fil": "Fil chronologique, du plus récent au plus ancien.",
    "regles.1.h": "Jamais de donnée inventée",
    "regles.1.p": "C'est la règle numéro un. Si une information manque, la case reste vide ou le site le dit. On ne devine pas et on ne complète pas.",
    "regles.2.h": "Sources primaires seulement",
    "regles.2.p": "On cite l'institution elle-même, jamais quelqu'un qui en parle : l'<b>Assemblée législative de la Colombie-Britannique</b> (leg.bc.ca) pour les projets de loi, leurs étapes, les votes nominatifs consignés dans ses Journaux, les député·e·s et le Conseil exécutif.",
    "regles.3.h": "Aucun média",
    "regles.3.p": "Rien n'est tiré de la presse. Les médias ont retiré leur contenu de l'usage par l'intelligence artificielle, et le site ne les lit pas. Ce qui a été dit en conférence de presse, mais que l'Assemblée n'a pas consigné, n'apparaît donc pas ici. Une seule exception, nommée sur la page où elle sert : le résultat de l'élection du 24 octobre 2026 est lu dans l'article de Wikipédia sur le scrutin, parce qu'Elections BC ferme son site aux robots.",
    "regles.4.h": "On respecte les refus des sites",
    "regles.4.p": "Si un site demande aux outils automatisés de ne pas le lire, on ne le lit pas, même quand ce serait techniquement possible. C'est le cas d'<b>elections.bc.ca</b> et de <b>bclaws.gov.bc.ca</b> : on y renvoie par un lien, on n'en lit rien. Le robot s'identifie honnêtement, et respecte le rythme demandé quand un site en impose un. On ne contourne jamais un CAPTCHA ni une protection contre les robots. Les courriels des député·e·s affichés ici sont les adresses législatives que l'Assemblée publie elle-même, pour qu'on puisse écrire à ses élu·e·s — rien d'autre : ni adresse personnelle, ni adresse de bureau de circonscription. Quand l'accès est bloqué, on écrit à l'organisme pour demander la permission.",
    "regles.5.h": "Un vote nominatif, c'est un vote nominatif",
    "regles.5.p": "Les noms sont recopiés des Journaux de l'Assemblée, le seul endroit où ils sont consignés — jamais déduits de l'appartenance à un parti. <b>La plupart des projets de loi sont adoptés de vive voix</b> : l'absence de vote nominatif ne veut pas dire « unanime », et le site ne l'écrit jamais.",
    "regles.6.h": "La présence ne compte que les votes de la Chambre",
    "regles.6.p": "Les comités — Committee of the Whole, Committee of Supply — siègent en Section A, B ou C avec une dizaine de député·e·s. Leurs divisions ne sont pas un vote de la Chambre : les compter ferait passer presque tout le monde pour absent. Le taux affiché ne retient donc que les divisions de la Chambre, et le lexique dit comment il est calculé.",
    "regles.7.h": "Aucun verdict",
    "regles.7.p": "Le site ne dit jamais qu'un projet de loi est bon ou mauvais, ni qu'un vote était le bon. Il met les faits côte à côte, chacun avec sa source. C'est vous qui jugez.",
    "regles.8.h": "Le texte officiel fait toujours foi",
    "regles.8.p": "Le texte intégral reste à un clic de chaque projet de loi. <b>Les résumés en langage clair ne sont pas encore écrits</b> : chaque page le dit, plutôt que d'afficher quelque chose écrit sans l'avoir lu. En cas d'écart, c'est le document d'origine qui compte. Le site est indépendant et n'a aucun caractère officiel.",
    "regles.9.h": "On explique ce qui manque",
    "regles.9.p": "Quand une source est absente ou incomplète, la page le dit et dit pourquoi. Une absence ne doit jamais être lue comme un silence d'un·e élu·e ou d'un parti.",
    "regles.suite": "Ces règles s'appliquent partout sur le site. Suivez ce qui change dans les <a href=\"/sources\">mises à jour du site</a>. Tout le contenu du site est gratuit.",
    "regleshero.l1": "Les règles,",
    "regleshero.l2": "noir sur blanc.",
    "regleshero.sub": "Le site ne publie que ce qu'une institution ou un parti a lui-même publié, tel quel, avec un lien vers l'original. <b>Et il dit clairement ce qui manque.</b>",
    "signales.agir": "Pour agir officiellement :",
    "signales.sur": "Signalés par les citoyen·ne·s",
    "signales.avis": "<b>Pas de pétition en ligne en Colombie-Britannique.</b> L'Assemblée n'accepte que les pétitions sur papier, déposées par un·e député·e. Signaler un projet ici n'a aucune valeur officielle : c'est un compteur citoyen qui montre ce qui préoccupe, et vous indique comment agir.",
    "signales.depute": "écrire à votre député·e",
    "stat.deputes": "Député·e·s",
    "stat.ministres": "Ministres",
    "stat.projets": "Projets de loi",
    "stat.votes": "Votes enregistrés",
    "suggest.cta": "✉ Suggérer un terme",
    "suggest.h": "Un mot vous échappe ?",
    "suggest.p": "Si vous avez buté sur un terme en lisant un projet de loi ou un vote, d'autres aussi. Suggérez-le sur la page Facebook — il sera ajouté avec une définition en langage clair.",
    "sujet.apercu": "L'Assemblée législative de la Colombie-Britannique en clair",
    "sujet.introuvable": "Page introuvable",
    "sujet.archives": "Législatures terminées",
    "archhero.l1": "Ce qu'il y a eu",
    "archhero.l2": "avant.",
    "archhero.sub": "Une législature se termine et tout ce qu'elle avait commencé meurt avec elle. Ici, rien n'est effacé : les projets de loi, les votes nominatifs et les gens de chaque législature finie gardent leur page, telle qu'elle était le dernier jour.",
    "sujet.lexique": "Lexique de l'Assemblée législative",
    "sujet.ministres": "Ministres et député·e·s de la Colombie-Britannique",
    "sujet.mondossier": "Mon dossier",
    "sujet.projets": "Projets de loi de la Colombie-Britannique",
    "sujet.regles": "Les règles de sources de DossierBC",
    "sujet.votes": "Votes nominatifs à l'Assemblée législative",
    "trouve.info": "Ces entrées viennent directement de la liste officielle des député·e·s en fonction à l'Assemblée législative de la Colombie-Britannique. Certains sièges peuvent changer entre deux mises à jour (démission, élection partielle) — cette liste est une photo prise au moment de la dernière mise à jour, pas un flux automatiquement à jour.",
    "votehero.l1": "Qui a voté",
    "votehero.l2": "pour, contre, absent.",
    "votehero.sub": "Le registre des votes nominatifs, tel quel. <b>On n'interprète pas — on montre.</b> Une absence peut être une mission officielle, une maladie, un conflit d'horaire.",
    "votes.info.b": "Sur le détail « qui a voté quoi »",
    "votes.info.text": "— l'Assemblée législative ne tient pas de registre des votes : le nom de chaque député·e n'est consigné que dans ses Journaux quotidiens, lors d'un vote par appel nominal. Le détail nominatif ci-dessus vient de ces Journaux, pas d'une estimation. Un vote dont un seul nom ne se rattache pas à la liste des député·e·s n'est pas publié. Le parti affiché est le parti actuel de chaque député·e.",
    "votes.sub": "La législature en cours — décomptes et noms lus dans les Journaux officiels",
    "pers.absence": "<b>Pas encore couvert pour la Colombie-Britannique.</b> Cette section réunit les titulaires de charges autour d'une assemblée — la présidence, le greffier, le vérificateur général, l'ombudsperson, le commissaire à l'information et à la protection de la vie privée. Elle est vide à dessein : l'Assemblée publie ces nominations sur ses propres pages, et nous ne les avons pas encore lues avec un scraper. Plutôt que d'afficher les noms d'une autre province, on écrit ce qui manque. La présidence, elle, est dans l'API : elle est marquée sur la page des député·e·s.",
  },
  en: {
    'nav.close':"Close",'nav.villes':"Cities",'nav.rtv':"Represent your city",
    'signales.sur':"Flagged by citizens",'kicker.projets':"Bills",'kicker.journal':"Journal",'promo.courriel':"Your email",
    'signales.avis':"<b>No online petitions in British Columbia.</b> The Assembly only accepts paper petitions, tabled by an MLA. Flagging a bill here has no official value: it is a citizen counter that shows what worries people, and points you to how to act.",
    'signales.agir':"To act officially:",'signales.depute':"write to your MLA",'quoideneuf.fil':"A timeline, newest first.",'nav.apercu':"Overview",'nav.ministres':"Ministers",'nav.projets':"Bills",
    'nav.votes':"Votes",'nav.archives':"Archives",'nav.quoideneuf':"What's new",'nav.compte':"Account & about",'nav.trouve':"Find your MLA",
    'nav.lexique':"Glossary",'nav.personnes':"Who's involved",'nav.petitions':"Petitions",'nav.apropos':"Where this data comes from",
    'stat.deputes':"MLAs",'stat.ministres':"Ministers",'stat.projets':"Bills",'stat.votes':"Votes recorded",
    // Sans cette ligne, revenir de « Français » à « English » laissait ce bloc en français.
    'pers.absence':"<b>Not yet covered for British Columbia.</b> This section lists the officers around an assembly — the Speaker, the Clerk, the Auditor General, the Ombudsperson, the Information and Privacy Commissioner. On this site it is empty on purpose: the Legislative Assembly publishes these appointments on its own pages, and we have not yet read them with a scraper. Rather than show the wrong province's names, we say what is missing. The Speaker, who does appear in the API, is marked on the Members page.",
    'h.composition':"Composition of the Assembly",
    'h.billsrecent':"Recently active in the House",
    'h.ministres':"Ministers and MLAs",
    'h.ministres2':"The ministers",
    'min.merged.sub':"The Cabinet, then all 125 MNAs from every party — one search box for both",
    'min.sub2b':" members of the Executive Council in office (leg.bc.ca)",
    'min.legende43':"Attendance and bills sponsored: the current legislature only. “n/a” and 0 for anyone who has not yet voted or sponsored a bill in it.",
    'min.restTitle':"The rest of the Assembly",
    'min.restNote':"Every party",
    'h.comparateur':"Comparator",
    'h.finances':"Public finances",
    'fin.sub':"Pick a person: what they earn, what is allocated to them, what they reported spending — never a ranking",
    'comp.sub':"Two ministers, the same facts, side by side — never a ranking",
    'h.projets':"Bills",
    'h.votes':"Vote registry",
    'h.compte':"Account",
    'h.trouve':"Find your MLA",
    'h.quoideneuf':"What actually happened",
    'h.quoideneuf.sub':"Newest first. Only events from the official record.",
    'h.lexique':"Parliamentary glossary",
    'h.lexique.sub':"To understand the rest of the site without a political science degree",
    'h.personnes':"Who's involved around the Assembly",
    'h.petitions':"Petitions to the Legislative Assembly",
    'h.apropos':"Where this data comes from, and how to go further",
    'ph.searchMinistres':"Name, riding, party…",
    'ph.searchBills':"Number, title or keyword…",
    // Refonte brutaliste — heroes de vues et bandes explicatives
    'hero.l1':"Who sits,",
    'hero.l2':"who legislates,",
    'hero.l3':"who votes what.",
    'hero.manifesto':"The B.C. Legislature reorganized <b>by person</b> and translated into <b>plain language</b>. No judgement, no verdict — an independent citizen site on real public data.",   // N.-B. : passages surlignés comme en français
    'hero.cta':"Explore →",
    'hero.cta2':"The members",
    'projhero.l1':"Bills,",
    'projhero.l2':"translated plainly.",
    'projhero.sub':"Every bill with its real stage and the date of each reading. The full text is always one click away on leg.bc.ca.",
    'votehero.l1':"Who voted",
    'votehero.l2':"for, against, absent.",
    'votehero.sub':"The recorded-division registry, as is. We don't interpret — we show. An absence can be an official mission, an illness, a scheduling conflict.",
    'minhero.l1':"Executive Council",
    'minhero.l2':"& the whole Assembly.",
    'minhero.sub':"The members of the Executive Council, then the MLAs from every party (<b>the MLAs are further down</b>) — <b>one search for both.</b>",
    'lexhero.l1':"The jargon,",
    'lexhero.l2':"decoded.",
    'lexhero.sub':"“First reading”, “Committee of the Whole”, “Royal Assent”… The Assembly has its own vocabulary. Here, every term is explained like you'd explain it to a friend.",
    'legend.label':"A bill's path:",
    'legend.link':"What are these stages? → Glossary",
    'chexp.h':"✋ What is “challenging”?",
    'chexp.p1':"One click on “Ask for an explanation” = a citizen request for the bill's sponsor to explain it in plain language, and for us to keep an eye on it together.",
    'chexp.p2':"<b>An account (email) is required</b> — one request per person, no anonymous requests.",
    'chexp.p3':"In British Columbia, these requests lead to nothing official: the Assembly has no online petitions, unlike Quebec or the House of Commons. For now, it is a simple way to see which laws trouble people. Some day, an elected member may find a use for it.",
    // Pendant la dissolution : même geste, promesse différente. Aucune Assemblée ne peut
    // recevoir une pétition avant la rentrée — on dit donc ce qui arrive vraiment aux demandes.
    'chexp.p2.dissous':"<b>An account (email) is required</b> — one request per person, no anonymous requests. The Assembly is dissolved: these bills died on the order paper. Requests are still recorded and counted — when it returns on 17 November, they will show what people wanted explained.",
    'lire.h':"How to read a vote",
    'lire.1.h':"Recorded division",
    'lire.1.p':"Each MLA stands and their choice is recorded in the Journals of the Legislative Assembly. It's the only kind of vote that can be attributed to a person.",
    'lire.2.h':"Passed ≠ law",
    'lire.2.p':"A winning vote moves the bill one stage forward. It only becomes law after assent by the Lieutenant-Governor.",
    'lire.3.h':"Party line",
    'lire.3.p':"Most votes follow the party's instruction. Free votes are rare — and that's where the nominal detail gets interesting.",
    'suggest.h':"Missing a word?",
    'suggest.p':"If a term tripped you up while reading a bill or a vote, it tripped others too. Suggest it on the Facebook page — it will be added with a plain-language definition.",
    'suggest.cta':"✉ Suggest a term",
    'ch.more':"See more →",
    'lexcat.proc':"Process", 'lexcat.votes':"Votes", 'lexcat.pers':"People & roles", 'lexcat.outils':"Citizen tools",
    'mission.eyebrow':"Our mission",
    'mission.st1':"leg.bc.ca is the source of record. This site only makes it ",
    'mission.st2':"easier to follow.",
    'filter.statuts':"Statuses", 'filter.etapes':"Stages",
    'ph.searchDeputes':"Name, riding, or region…",
    'ph.searchVotes':"Keyword: subject, bill number…",
    'btn.follow':"+ Follow",'btn.following':"✓ Following",
    'btn.viewSummary':"+ View summary",'btn.hideSummary':"− Hide summary",
    'btn.viewFull':"See the official page on leg.bc.ca →",
    'footer.left':"Unofficial site — public data from British Columbia's Legislative Assembly ·",
    'footer.right':"A project by",
    'footer.source':"Source code",

    // Ministers
    'min.sub1':"Fréchette Cabinet, sworn in April 21, 2026 — ",
    'min.sub2':" members confirmed out of 29 announced",
    'min.incomplete.b':"Up to date.",
    'min.incomplete.pre':"These ",
    'min.incomplete.post':" ministers come directly from the official Council of Ministers page on quebec.ca, scraped live — not a hand-maintained list.",
    // Bills
    'proj.sub':"43rd Legislature — real status as of June 12, 2026 (adjournment)",
    // Votes
    'votes.sub':"The current legislature — counts and names read in the official Journals",
    'votes.info.b':"On the \u201cwho voted what\u201d detail",
    'votes.info.text':"— the Legislative Assembly keeps no register of votes: each MLA's name is only written in its daily Journals, during a recorded division. The by-member breakdown above comes from those Journals, not an estimate. A vote where even one name can't be matched to the list of MLAs is not published. The party shown is each MLA's current party.",
    // Find your MNA
    'trouve.sub':"Every riding — the full list, straight from the Legislative Assembly",
    'trouve.info':"These entries come directly from the official list of sitting MLAs at British Columbia's Legislative Assembly. Some seats may change between updates (resignation, by-election) — this list is a snapshot taken at the last update, not an automatically updated feed.",
    // What's new / calendar
    'cal.status':"● Legislative Assembly of British Columbia",
    'cal.title':"Sitting calendar",
    // Dissolution de la 43e législature (2026-08-27) — à retirer le 17 nov. 2026.
    'diss.h':"📅 New bills arrive on November 17",
    'diss.p1':"The new Assembly sits from <b>November 17, 2026</b>. The first bills of the 44th legislature will appear here as soon as they are introduced.",
    'diss.p2':"Direct consequence: <b>every bill that had not been assented to died with it.</b> They will have to start over before the new Assembly, convened on <b>November 17, 2026</b>. What remains here is the full record of the 43rd legislature: the laws that passed, how each member voted, and the bills that did not make it.",
    'diss.p3':"<em>We can't wait for these bills to come in either, la la!</em>",
    'diss.cta':"What the parties are promising →",
    'prom.l1':"What they promise,",
    'prom.l2':"what they'll do with it.",
    'prom.sub':"The parties' commitments for the October 5, 2026 election, each with its source. <b>No verdict is issued here</b> — as the new Assembly legislates, each promise will be placed next to what was actually done.",
    'h.promesses':"Election promises",
    'prom.lex':"The parties' commitments for the October 5, 2026 election, each with its source — and, as the new Assembly legislates, what was actually done about them. No verdict: the promise and the action, side by side.",
    'prom.lex.cta':"See the promises →",
    'prom.byparty':"By party",
    'prom.bytheme':"By topic",
    'prom.method':"Our method:",
    'prom.m1':"Exact quote",
    'prom.m2':"Source linked",
    'prom.m3':"No judgment",
    'prom.caq':"Only one source is accepted here: the <b>party's own official documents</b>, quoted word for word. <b>Every concrete commitment found there</b>, and the <b>Coalition avenir Québec</b> does not appear at all — its website asks automated tools like ours not to read it, and we honour that request rather than work around it.",
    'prom.meth.h':"Where these promises come from",
    'prom.meth.1':"<b>From the parties themselves.</b> Every quote is taken from a document the party published — an electoral platform or a campaign announcement — and reproduced word for word. A quote that cannot be found verbatim in the source is rejected automatically. The “See the source” link on each card leads to the original.",
    'prom.meth.2':"<b>Everything concrete each party has published.</b> Commitments are picked out automatically: amounts, targets, deadlines, things created or abolished. Nothing here ranks them by importance. A commitment stated with nothing concrete may be missing. The number of cards varies from party to party: it reflects how much text each one has published.",
    'prom.meth.3':"<b>The period covered is not the same for everyone.</b> Québec solidaire, the Liberal Party and the Conservative Party publish a full platform, read in its entirety. The Parti Québécois does not: its commitments are read from its campaign announcements since the August 27 dissolution.",
    'prom.meth.4':"<b>The Coalition avenir Québec is absent.</b> It has published commitments on its website, but that site asks automated tools not to read it. We do not work around that request. It will be added as soon as a readable source exists.",
    'prom.meth.5':"<b>Nothing is taken from the news media.</b> A commitment announced at a press conference but never published by the party does not appear here. Quebec news organizations have opted their content out of AI use, and our permission requests remain unanswered.",
    'prom.meth.fin':"In short: an absence from this list says nothing about what a party thinks. For the full list, follow the link to the source.",
    'prom.ail.h':"Comparison tools from news outlets",
    'prom.ail.p':"Several newsrooms have built their own promise comparison tools, with resources we do not have. <b>We do not reproduce their content</b>: these outlets have opted their material out of AI use, and our permission requests remain unanswered. We respect that choice. But a link is not a reproduction — so here they are, because they will be useful to you.",
    'prom.next.h':"And after October 5?",
    'prom.next.p':"The new Assembly sits from <b>November 17, 2026</b>. From then on, every bill introduced will be placed next to the promise it matches — and the absence of a bill on a commitment will be just as visible. That is the follow-up nobody does past election week.",
    'dissp.h':"⚠️ These bills never became law",
    'dissp.p':"The Assembly was dissolved on <b>August 27, 2026</b>. Any bill that had not been <b>assented to</b> therefore <b>died on the Order Paper</b> — that is the Assembly's official term. On the cards we say it plainly: <b>“dead on arrival”</b> if the bill never got past introduction, <b>“died along the way”</b> if it got further. Either way, it must start over before the new Assembly (November 17, 2026). Bills marked “Assented to” did become law.",
    'cal.p1':"The Assembly doesn't sit year-round. Its Standing Orders set two working periods: a spring period starting the 2nd Tuesday of February (16 weeks, plus 2 intensive weeks), and a fall period starting the 3rd Tuesday of September (10 weeks, plus 2 intensive weeks). Outside these periods the Assembly is adjourned — barring a special sitting called by the Premier.",
    'cal.p2':"This page outlines the main working periods, not the daily schedule. For a day-by-day view of upcoming sittings and committees, the Assembly's official calendar remains the reference.",
    // Lexicon
    'lex.1.t':"Bill", 'lex.1.d':"The text a member or the government submits to the Assembly to become a law. It only becomes a real law once passed and then assented to.",
    'lex.2.t':"Second reading", 'lex.2.d':"The first big step: the Assembly debates the general idea of the bill and votes on whether it accepts it, before studying the details clause by clause.",
    'lex.3.t':"Committee stage", 'lex.3.d':"The step where the bill is gone over clause by clause, most often in Committee of the Whole (the entire Assembly sitting as a committee), sometimes by a standing committee. Amendments can be proposed there.",
    'lex.4.t':"Third reading", 'lex.4.d':"The Assembly's final vote on the bill as a whole, once the committee stage is over.",
    'lex.5.t':"Royal Assent", 'lex.5.d':"The very last step: the Lieutenant-Governor gives official assent, and the bill formally becomes a law of British Columbia.",
    'lex.6.t':"Committee", 'lex.6.d':"A smaller group of MLAs who study a subject or a bill in depth, may hear from experts and citizens, then report back to the full Assembly.",
    'lex.14.t':"Brief (to a committee)", 'lex.14.d':"A document that an organization, a business or a citizen submits to an Assembly committee to say what they think of a bill or a subject under study: what they support, what should change, what worries them. Some are invited to present it in person to the MLAs.",
    'lex.15.t':"Brief or lobbying?", 'lex.15.d':"Both try to influence a decision, but not in the same way. A <b>brief</b> is a public position, within a committee's official process: you know who is speaking and on what subject. <b>Lobbying</b> happens in private: meetings, calls or emails with a minister, a minister's office or public servants. The law only requires that it be entered in the province's lobbyists' registry, which says who is lobbying, for whom and on what subject, never what was said.",
    'lex.7.t':"Recorded vote", 'lex.7.d':"A vote where each MLA's name and choice (for or against) are written in the Assembly's Journals — as opposed to a voice vote, where only the result is noted. In British Columbia, most bills pass by voice vote.",
    'lex.8.t':"Journal of the Assembly", 'lex.8.d':"The official, summarized record of each sitting: decisions, votes, documents tabled. It is there, and only there, that names are written down during a recorded division.",
    'lex.9.t':"Debates journal (Journal des débats)", 'lex.9.d':"The complete, word-for-word transcript of everything said in the House — unlike the Journal of the Assembly, which only summarizes the decisions.",
    'lex.10.t':"House leader", 'lex.10.d':"The MLA responsible for organizing their group's proceedings at the Assembly — a bit like the conductor of the calendar and debates for their party.",
    'lex.11.t':"Whip", 'lex.11.d':"The MLA in charge of making sure members of their parliamentary group are present for votes and follow the party line.",
    'lex.12.t':"Minister Delegate / Minister Responsible for", 'lex.12.d':"A minister who isn't the main head of a department, but who officially holds responsibility for a specific file within or alongside it.",
    'lex.13.t':"Attendance (%)", 'lex.13.d':"The figure shown under each MLA: out of the recorded divisions <b>of the House</b>, the share in which this person appears as for or against — meaning they were present to vote, whichever way they voted. Divisions held in <b>committee</b> (Committee of the Whole, Committee of Supply, in Section A, B or C) are left out: only about a dozen members sit there, and counting them would make everyone look absent. The count starts when the legislature opens. The Assembly publishes no official attendance; this is an indicator of presence, not an official measure, and a missed vote can be an official mission, an illness or a scheduling conflict — the register does not give the reason.",
    // Who's involved
    'pers.sub':"The public roles we hadn't covered yet — real names, real current functions",
    'pers.g1':"Inside the Assembly",
    'pers.g2':"The Crown's representative",
    'pers.g3':"Independent watchdogs — appointed by the Assembly, not the government",
    'pers.1.role':"Speaker of the Legislative Assembly", 'pers.1.desc':"Elected by the House, she presides over its debates and keeps order. MLA for Madawaska Les Lacs-Edmundston (Liberal Party), but the role of Speaker requires neutrality.",
    'pers.2.role':"Lieutenant Governor of British Columbia", 'pers.2.desc':"33rd holder of the office, installed on January 22, 2025. She represents the King in British Columbia, and she gives the Royal Assent noted on each bill page of this site.",
    'pers.2.badge':"Ceremonial + assent to laws",
    'pers.3.role':"Auditor General of British Columbia", 'pers.3.desc':"Reports to the Assembly and the public on how public funds and resources are managed. In office since January 2022.",
    'pers.4.role':"Ombud British Columbia", 'pers.4.desc':"Reviews complaints about the provincial public sector and also oversees access to information and privacy. In office since January 1, 2022.",
    'pers.5.role':"Chief Electoral Officer", 'pers.5.desc':"Runs provincial elections impartially, as well as municipal elections, and supervises political financing. In office since March 2017.",
    'pers.6.role':"Integrity Commissioner", 'pers.6.desc':"Oversees conflict-of-interest rules for MLAs and senior officials, and keeps the Lobbyists' Registry. In office since January 1, 2020.",
    'pers.7.role':"Child, Youth and Senior Advocate", 'pers.7.desc':"Protects and defends the rights of children, youth, vulnerable adults and older adults. In office since February 7, 2022.",
    'pers.8.role':"Commissioner of Official Languages", 'pers.8.desc':"Investigates complaints under the Official Languages Act and promotes both official languages. In office since January 2, 2020.",
    'pers.badge.designee':"Appointed officer",
    'pers.info':"These people hold official public functions and are appointed through a legally defined process — that's what makes the information above public. That doesn't mean everything about them becomes public: I stick to their official function here, as with the rest of the site.",
    'h.lobby':"The lobbyist registry",
    'lobby.sub':"Who's paid to influence public decisions — and how to look it up",
    'lobby.body':"Anyone paid to communicate with <b>public office holders</b> (ministers, MLAs, senior officials…) to influence a decision must register in the <b>Lobbyists' Registry</b>, kept by the <b>Office of the Integrity Commissioner</b>, an independent office. Lobbyists must declare their activities there.",
    'lobby.note':"Why this site does not reproduce the registry: it can only be consulted through the official search tool. Rather than make a copy that would be neither reliable nor up to date, we link directly to the official public tools.",
    'lobby.link1':"Search the registry ↗",
    'lobby.link2':"Registry home ↗",
    'lobby.link3':"Integrity Commissioner ↗",
    // Petitions
    'pet.sub':"In British Columbia, on paper only",
    'pet.info':"Each petition above is reproduced as-is from the National Assembly's official list, with a link to the official page where you can find and sign it. The signature count shown is the one recorded at the last update — for the exact, current count, or to sign, use the \u201cFind and sign on assnat.qc.ca\u201d link on each card.",
    // Where this data comes from
    'apropos.sources.h':"Public sources used here",
    'apropos.sources.p':"<b style=\"color:var(--ink)\">Bills, stages and dates</b> — the Assembly's Legislative Information Management System (api.lims.leg.bc.ca), “progress of bills” for each session: the date of each reading, exactly as the Assembly recorded it.<br><b style=\"color:var(--ink)\">Bill details</b> (type, sponsor, official text) — leg.bc.ca, each bill's page.<br><b style=\"color:var(--ink)\">Plain-language summaries</b> — <b style=\"color:var(--ink)\">there are none yet.</b> Each bill page says so and links to the official text, rather than showing something written without having read it.<br><b style=\"color:var(--ink)\">Recorded divisions</b> — the Assembly's Votes and Proceedings (leg.bc.ca), the only place where names are recorded.<br><b style=\"color:var(--ink)\">Executive Council and MLAs</b> — the Assembly's data interface (leg.bc.ca): roles, party, constituency. The email addresses shown are the legislative addresses (first.last.MLA@leg.bc.ca) the Assembly publishes itself so that people can write to their members.<br><b style=\"color:var(--ink)\">The October 24, 2026 election result</b> — the Wikipedia article on that election, named under the seat bar with the day it was read. It is the only thing the site takes from there: elections.bc.ca closes its site to automated readers.<br><b style=\"color:var(--ink)\">Attendance (%)</b> — calculated from the recorded divisions above, counting divisions of the HOUSE only (see the definition in the glossary); no outside source.",
    'apropos.missing.h':"What's missing for a real production site",
    'apropos.missing.p':"1. <b style=\"color:var(--ink)\">A backend that queries these sources automatically</b> (e.g. a scheduled task that re-reads the vote registry and the bill feed every day) and writes them to a real database.<br>2. <b style=\"color:var(--ink)\">Hosting</b> for this backend and database (e.g. Vercel + Supabase/Postgres, or a classic Node server).<br>3. <b style=\"color:var(--ink)\">The by-MNA vote detail</b>, to be extracted from the official registry — the single biggest missing piece for fully answering \u201cwho voted for what.\u201d<br>4. <b style=\"color:var(--ink)\">An attendance proxy</b>: the Assembly doesn't publish attendance as such; the best public indicator is an MNA's participation rate in recorded votes (the method used by media outlets such as Radio-Canada and The Canadian Press).",
    'apropos.claude.p':"I can write this backend and help you deploy it when you're ready — this is exactly the kind of project where <b style=\"color:var(--ink)\">Claude Code</b> is especially useful, because it can work directly inside a repository, run sync scripts, and iterate on deployment with you.",
    // Overview page
    'apercu.composition.sub':"Seats by party",
    'apercu.recent.sub':"Click a bill to read its plain-language summary, its stage and the votes.",
    'maj.h':"Site updates",
    'sujet.apercu':"British Columbia's Legislative Assembly in plain language",
    'sujet.ministres':"British Columbia ministers and MLAs",
    'sujet.projets':"British Columbia bills",
    'sujet.votes':"Recorded divisions at the Legislative Assembly",
    'sujet.promesses':"2026 election promises",
    'sujet.lexique':"Legislative Assembly glossary",
    'fil.accueil':"Home",
    'fil.ministres':"Ministers and MNAs",
    'fil.projets':"Bills",
    'fil.votes':"Votes",
    'fil.promesses':"Promises",
    'fil.lexique':"Glossary",
    'fil.bd':"Site updates",
    'nav.mondossier':"My file",
    'sujet.mondossier':"My file",
    'fil.mondossier':"My file",
    'mdvilles.h':"Your city projects",
    'mdvilles.sub':"The projects you follow, all cities combined. Click a project to see its decisions, most recent first. To add one, pick it further down, or click “Project: …” on a decision in a city section.",
    'mdr.titre':"What you follow, in one place",
'mdr.gratuit':"<b>Free: 3 follows in all.</b>",   // N.-B. : sans abonnement
'mdr.bande':"<b>An idea, an error?</b> Every message is read.",
'mdr.ecrire':"Write to us",'mdr.offrir.h':"Give a subscription",
'mdhero.l1':"Your bills,",
    'mdhero.l2':"the members you follow.",
    'mdhero.sub':"What you follow at the National Assembly and in the cities, with one account. <b><a class=\"md-lien\" href=\"#villes\">Your city projects</a> are further down.</b>",
    'lp.titre':"How to read vote attendance",
    'lp.lien':"Full definition → Glossary",
    'lp.formule':"<b>88%</b>: out of 100 recorded divisions held by the House since the legislature opened, the person voted in 88 — yea or nay, whichever way.",
    'lp.debut':"Only divisions of the House count. Committees sit in Section A, B or C with about a dozen members: their divisions say nothing about anyone else’s attendance, and are left out. Someone elected at a by-election is counted from the day of their election, not before.",
    'lp.pres':"<b>—</b>: the Speaker of the Assembly*. To stay neutral, the Speaker only votes to break a tie: a low rate would not mean an absence.",
    'lp.aster2':"** Updated every week: the site rereads the recorded divisions written in the Assembly's Journals and recalculates each person's rate, then the median, the colours and the numbers above. A vote shows up here once its Journal is published.",
    'lp.aster':"* The Assembly's President is not the same as the Premier: the President runs the debates and stays neutral, while the Premier heads the government and votes like the other members. <a href=\"/lexique#role-presidence\">See the Assembly's presidency in the Glossary →</a>",
    'lp.nd':"<b>n/a</b>: no recorded vote for this person.",
    'lp.officiel':"This is not an official measure: the Assembly does not publish attendance, and a missed vote does not tell why.",
    'promo.sur':"Free · no password",
    'mdavenir.html':"<div class=\"md-carte-tete\"><h2>Coming soon</h2><span class=\"md-etiquette\">Soon</span></div><p>All the text on the site will stay free: bills and their summaries, ministers and MNAs, votes, promises. Extra tools are coming soon, for subscribers:</p><ul class=\"ab-outils\"><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Custom alerts</b> — an email when a bill touches a keyword you care about, when a member introduces a bill or votes, or when a bill moves to a new stage.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Custom RSS feeds</b> — the feed of all the news, and a feed per keyword, per MNA or per ministry, in your RSS reader.</div></li><li><span class=\"ab-etat ab-bientot\">Soon</span><div><b>Consultation deadlines</b> — for groups and lobbies: the deadline to file a brief with a parliamentary committee, with a reminder before it closes.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Topic watch</b> — every week, everything that moved in your field: bills, votes, consultations.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Who filed a brief on what</b> — the groups that spoke up on each bill in committee.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Data export</b> — votes, attendance and bills as Excel or CSV files, ready to analyze.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Follow a company or an organization</b> — its briefs filed in committee at the National Assembly, in one place, and an alert for each new brief.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>No ad badges</b> — on DossierBC, the « ☕ Support us » buttons on bills disappear.</div></li><li><span class=\"ab-etat ab-bientot\">Soon</span><div><b>Monthly recap, subscriber edition</b> — the Québec City and Montréal council recap, with the “Where the money goes” section.</div></li></ul><p><a class=\"md-lien\" href=\"/abonnement\">See the optional subscription and the status of each tool →</a></p>",
    'promo.h':"Follow up to three bills",
    'promo.p':"A link arrives by email when a bill you follow moves. Up to 3 bills in My file.",
    'apercu.voirtout':"See all →",'apercu.source':'Official source: <a href="https://www.leg.bc.ca/en" target="_blank" rel="noopener">leg.bc.ca</a>',
    'commandite.villes':"Vancouver, Surrey, Victoria — no B.C. city is covered yet",
    'commandite.sur':"Sponsorship",'commandite.h':"Bring your city council in",'commandite.p':"Agendas, votes and resolutions in plain language. One local sponsor funds one city.",'commandite.cta':"Sponsor a city →",
    'promo.diss':"The bills of the 43rd legislature died when the Assembly was dissolved on August 27: following will resume with the first bills of the new legislature, convened on November 17, 2026.",
    'promo.compte.h':"Your account",
    'promo.mesdossiers':"My file →",
    'footer.villes':"Cities:",
    'maj.sub':"What changed on DossierBC, newest first",
    'bd.intro1':"Hi! My name is",
    'bd.intro3':"I'm 45, and dossierbc.ca is your first step into democracy!",
    'bd.mot1':"If we want people to understand politics, it has to be brought down to their level.",
    'bd.mot2':"When I first tried to take an interest in it, on top of not knowing the jargon, bills came as two lines… and fifty PDFs. Most people would simply walk away.",
    'bd.mot3':"So I had an idea: use artificial intelligence first to read through all of it, then to put it in plain words. That's how DossierQuébec was born — and now DossierBC.",
    'bd.mot4':"Here, the plain-language summaries are not written yet: each bill says so and links to the official text. In the meantime, I've given people a glossary that explains the basics of political jargon. Plain-language law exists — think of this as its equivalent for politics!",
    'h.petitionsrecent':"Petitions open right now",
    'apercu.petitions.sub':"Click the \u201cPetitions\u201d tab for the full list",
    'quicknav.label':"Jump to:",
    'footer.regles':"The rules",
    'footer.abonnement':"Subscription",
    'fil.abonnement':"Subscription",
    'sujet.abonnement':"The optional subscription",
    'abhero.l1':"The content stays free,",
    'abhero.l2':"the tools are extra.",
    'abhero.sub':"All the text on the site is free and will stay free. The subscription is optional: it gives extra tools. <b>Cancel anytime, prices in Canadian dollars.</b>",
    'abgratuit.html':"<div class=\"md-carte-tete\"><h2>What stays free, for everyone</h2><span class=\"md-etiquette\">Free</span></div><p>Bills and their summaries, ministers and MNAs, votes, promises, the glossary, city decisions, and the features already on those pages. Following too: 3 follows per account, bills, members and city projects, subscriber or not.</p>",
    'aboutils.html':"<div class=\"md-carte-tete\"><h2>What the subscription gives</h2></div><p>The planned tools, each with its status. A tool marked “Soon” does not exist yet: subscribers get it at no extra cost as soon as it is released, at the same price for as long as the subscription stays active. Tools on city decisions await the cities’ approval: until then they stay free or upcoming.</p><ul class=\"ab-outils\"><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Custom alerts</b> — an email when a bill touches a keyword you care about, when a member introduces a bill or votes, or when a bill moves to a new stage.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>RSS feeds</b> — the feed of all the news, plus custom feeds per keyword, per MNA or per ministry.</div></li><li><span class=\"ab-etat ab-bientot\">Soon</span><div><b>Consultation deadlines</b> — the deadline to file a brief with a parliamentary committee, with a reminder before it closes.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Topic watch</b> — every week, everything that moved in your field: bills, votes, consultations.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Who filed a brief on what</b> — the groups that spoke up on each bill in committee.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Data export</b> — the Assembly's votes, attendance and bills as Excel or CSV files.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>Follow a company or an organization</b> — its briefs filed in committee at the National Assembly, in one place, and an alert for each new brief.</div></li><li><span class=\"ab-etat ab-bientot ab-selon\">Depends on subscriptions</span><div><b>Money details</b> — the amounts in each Ville de Québec item, read from the official documents. Stopped on October 22, 2026 for lack of funds: it will come back if subscriptions allow it.</div></li><li><span class=\"ab-etat ab-dispo\">Available</span><div><b>No ad badges</b> — on DossierBC, the « ☕ Support us » buttons on bills disappear.</div></li><li><span class=\"ab-etat ab-bientot\">Soon</span><div><b>Monthly recap, subscriber edition</b> — the Québec City and Montréal council recap, with the “Where the money goes” section.</div></li></ul>",
    'abforfaits.html':"<div class=\"md-carte-tete\"><h2>The plans</h2></div><ul class=\"ab-forfaits\"><li class=\"ab-forfait\" data-forfait=\"mensuel\" role=\"button\" tabindex=\"0\" onclick=\"abChoisirForfait(this.dataset.forfait)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abChoisirForfait(this.dataset.forfait)}\"><b class=\"ab-montant\">$9.99</b><span>a month</span></li><li class=\"ab-forfait\" data-forfait=\"trimestriel\" role=\"button\" tabindex=\"0\" onclick=\"abChoisirForfait(this.dataset.forfait)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abChoisirForfait(this.dataset.forfait)}\"><b class=\"ab-montant\">$26.99</b><span>every 3 months</span></li><li class=\"ab-forfait\" data-forfait=\"annuel\" role=\"button\" tabindex=\"0\" onclick=\"abChoisirForfait(this.dataset.forfait)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abChoisirForfait(this.dataset.forfait)}\"><b class=\"ab-montant\">$99</b><span>a year — two months free</span></li></ul><p class=\"md-note\">Prices in Canadian dollars, with no taxes added: the amount shown is the amount paid. Card payment on Stripe's secure page: DossierBC never sees your card. Cancel anytime, from this page or My file, in two clicks: the subscription stays active until the end of the paid period, then stops with no further charge.</p>",
    'abcadeau.html':"<div class=\"md-carte-tete\"><h2>Give 1 month, 3 months or 1 year</h2><span class=\"md-etiquette\">Gift</span></div><p>A fixed length: you pay once, with no renewal. The code arrives in your email and in My file: give it to anyone you like.</p><ul class=\"ab-forfaits\"><li class=\"ab-forfait ab-cadeau\" data-duree=\"mensuel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrir(this.dataset.duree, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrir(this.dataset.duree, this)}\"><b class=\"ab-montant\">$9.99</b><span>1 month</span></li><li class=\"ab-forfait ab-cadeau\" data-duree=\"trimestriel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrir(this.dataset.duree, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrir(this.dataset.duree, this)}\"><b class=\"ab-montant\">$26.99</b><span>3 months</span></li><li class=\"ab-forfait ab-cadeau\" data-duree=\"annuel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrir(this.dataset.duree, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrir(this.dataset.duree, this)}\"><b class=\"ab-montant\">$99</b><span>1 year</span></li></ul><p class=\"md-note\">You need to be signed in to give. Card payment on Stripe's secure page, with no taxes added.</p>",
    'mdcadeau.html':"<span class=\"md-cadeau-titre\">One time</span><span class=\"md-cadeau-puces\"><button type=\"button\" class=\"md-cadeau-puce ab-cadeau\" data-duree=\"mensuel\" onclick=\"abOffrir(this.dataset.duree, this)\">1 month · $9.99</button> <button type=\"button\" class=\"md-cadeau-puce ab-cadeau\" data-duree=\"trimestriel\" onclick=\"abOffrir(this.dataset.duree, this)\">3 months · $26.99</button> <button type=\"button\" class=\"md-cadeau-puce ab-cadeau\" data-duree=\"annuel\" onclick=\"abOffrir(this.dataset.duree, this)\">1 year · $99</button> <input type=\"number\" class=\"md-cadeau-qte\" min=\"1\" max=\"100\" step=\"1\" inputmode=\"numeric\" placeholder=\"×1\" aria-label=\"How many codes\" title=\"How many codes (up to 100)\"></span><span class=\"md-note\">One-time payment. The code arrives by email.</span>",
    'aboffert.html':"<div class=\"md-carte-tete\"><h2>Give a subscription</h2><span class=\"md-etiquette\">Recurring</span></div><p>You pay every month, every 3 months or every year for someone else, until you cancel. The code arrives in your email and in My file: the person pastes it in the “Enter your code here” box. Their access follows your payments and stops if you cancel.</p><ul class=\"ab-forfaits\"><li class=\"ab-forfait ab-offert\" data-forfait=\"mensuel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrirAbonnement(this.dataset.forfait, this)}\"><b class=\"ab-montant\">$9.99</b><span>per month</span></li><li class=\"ab-forfait ab-offert\" data-forfait=\"trimestriel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrirAbonnement(this.dataset.forfait, this)}\"><b class=\"ab-montant\">$26.99</b><span>every 3 months</span></li><li class=\"ab-forfait ab-offert\" data-forfait=\"annuel\" role=\"button\" tabindex=\"0\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();abOffrirAbonnement(this.dataset.forfait, this)}\"><b class=\"ab-montant\">$99</b><span>per year</span></li></ul><p class=\"md-note\">The first period starts with your payment, even if the code has not been used yet. You cancel at any time in My file, at no cost. You need to be signed in to give.</p>",
    'mdoffert.html':"<span class=\"md-cadeau-titre\">Recurring</span><span class=\"md-cadeau-puces\"><button type=\"button\" class=\"md-cadeau-puce ab-offert\" data-forfait=\"mensuel\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\">$9.99/month</button> <button type=\"button\" class=\"md-cadeau-puce ab-offert\" data-forfait=\"trimestriel\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\">$26.99/3 months</button> <button type=\"button\" class=\"md-cadeau-puce ab-offert\" data-forfait=\"annuel\" onclick=\"abOffrirAbonnement(this.dataset.forfait, this)\">$99/year</button> <input type=\"number\" class=\"md-cadeau-qte\" min=\"1\" max=\"100\" step=\"1\" inputmode=\"numeric\" placeholder=\"×1\" aria-label=\"How many codes\" title=\"How many codes (up to 100)\"></span><span class=\"md-note\">Until you cancel: “Manage” and “Cancel” buttons in My file, under Your account. The code arrives by email.</span>",
    'abcode.html':"<div class=\"md-carte-tete\"><h2>Have a code?</h2></div><p>Paste it here. The subscription opens on your account for the length given; if you already have time left, it is added. A gift subscription code keeps you subscribed as long as the person giving it keeps paying.</p>",
    'abcode.ph':"Enter your code here",
    'abcode.btn':"Use the code",
    'fil.regles':"The rules",
    'fil.archives':"Archives",
    'fil.rtv':"Represent your city",
    'sujet.archives':"Past legislatures",
    'archhero.l1':"What came",
    'archhero.l2':"before.",
    'archhero.sub':"A legislature ends and everything it had begun dies with it. Nothing is deleted here: the bills, the recorded votes and the people of each finished Parliament keep their page, exactly as they were on the last day.",
    'arch.prom.h':"2026 election promises",
    'arch.prom.p':"The parties' commitments for the 5 October 2026 election, each with its official source.",
    'arch.min.h':"Former ministers of the Legault and Fréchette governments",
    'arch.min.p':"One profile per minister of the 43rd Legislature (2022-2026): roles, bills sponsored and vote attendance.",
    'projets.tousvotes':"All recorded votes, motions included →",
    'sujet.regles':"DossierBC's sourcing rules",
    'regleshero.l1':"The rules,",
    'regleshero.l2':"in black and white.",
    'regleshero.sub':"The site only publishes what an institution or a party has itself published, as is, with a link to the original. <b>And it says clearly what is missing.</b>",
    'regles.1.h':"No invented data",
    'regles.1.p':"This is rule number one. If a piece of information is missing, the field stays empty or the site says so. We do not guess and we do not fill in.",
    'regles.2.h':"Primary sources only",
    'regles.2.p':"We quote the institution itself, never someone talking about it: British Columbia's <b>Legislative Assembly</b> (leg.bc.ca) for bills, their stages, the recorded divisions written in its Journals, the MLAs and the Executive Council.",
    'regles.3.h':"No news media",
    'regles.3.p':"Nothing is taken from the press. News outlets have withdrawn their content from use by artificial intelligence, and the site does not read them. What was said at a press conference but never recorded by the Assembly therefore does not appear here. One exception, named on the page where it is used: the October 24, 2026 election result is read from the Wikipedia article on that election, because Elections BC closes its site to automated readers.",
    'regles.4.h':"We respect a website's refusal",
    'regles.4.p':"If a website asks automated tools not to read it, we do not read it, even when it would be technically possible. That is the case for <b>elections.bc.ca</b> and <b>bclaws.gov.bc.ca</b>: we link to them and read nothing from them. The program that reads official websites identifies itself honestly, and waits the pace a site asks for when it sets one. We never work around a CAPTCHA or an anti-bot protection. The MLA email addresses shown here are the legislative addresses the Assembly publishes itself, so that people can write to their members — and nothing else: no personal address, no constituency-office address. When access is blocked, we write to the organization to ask for permission.",
    'regles.5.h':"A recorded division is a recorded division",
    'regles.5.p':"Names are copied from the Assembly's Votes and Proceedings, the only place they are recorded — never inferred from party membership. <b>Most bills pass on a voice vote</b>: the absence of a recorded division does not mean “unanimous”, and the site never writes that it does.",
    'regles.6.h':"Attendance counts House divisions only",
    'regles.6.p':"Committees — Committee of the Whole, Committee of Supply — sit in Section A, B or C with about a dozen members. Their divisions are not a vote of the House: counting them would make almost everyone look absent. The published rate therefore keeps only divisions of the House, and the glossary says how it is calculated.",
    'regles.7.h':"No verdict",
    'regles.7.p':"The site never says a bill is good or bad, nor that a vote was the right one. It places the facts side by side, each with its source. You are the judge.",
    'regles.8.h':"The official text always prevails",
    'regles.8.p':"The full text is one click away from every bill. <b>Plain-language summaries are not written yet</b>: each page says so, rather than showing something written without having read it. If anything differs, the original document is the one that counts. The site is independent and has no official status.",
    'regles.9.h':"We explain what is missing",
    'regles.9.p':"When a source is absent or incomplete, the page says so and says why. An absence must never be read as silence from a member or a party.",
    'regles.suite':"These rules apply everywhere on the site. Follow what changes in the <a href=\"/sources\">site updates</a>. All the content on the site is free.",   // N.-B. : sans abonnement
    'fil.introuvable':"Page not found",
    'sujet.introuvable':"Page not found",
    'p404.bande.h':"⚠️ Error 404 — this address leads nowhere",
    'p404.bande.p':"The page you asked for doesn't exist on DossierBC, or its address has changed. No big deal: <b>the real bills are one click away.</b>",
    'p404.l1':"This page was dead",
    'p404.l2':"on arrival.",
    'p404.sub':"Like many bills: introduced with the best intentions, never passed. <b>Or the address has a typo, which happens even to legislative drafters.</b>",
    'p404.vote.sur':"Recorded division",
    'p404.vote.motion':"“That this page exist.”",
    'p404.pour':"Yeas",
    'p404.contre':"Nays",
    'p404.abst':"Abstentions",
    'p404.verdict':"Motion defeated. Not even close.",
    'p404.e1':"First reading ✓",
    'p404.e2':"Second reading",
    'p404.e3':"Committee stage",
    'p404.e4':"Royal Assent",
    'p404.blague':"This vote is a joke: it never took place, and there are not 404 MLAs. On this site, it is the only invented data. <a href=\"/votes\">The real votes are here.</a>",
    'p404.lien1':"The ones that actually exist, in plain language.",
    'p404.lien2':"Who voted for what, MLA by MLA.",
    'p404.lien3':"What the parties promised, word for word.",
    'p404.accueil':"Home",
    'p404.lien4':"Let's start over, no hard feelings.",
    'footer.rss':"RSS feed",
    'footer.flaticon':"Icons: Flaticon",
    'quicknav.mission':"Our mission",
    'quicknav.composition':"Composition",
    'quicknav.projets':"Bills",
    'quicknav.quoideneuf':"What's new",
    'quicknav.petitions':"Petitions",
    'footer.etmoi':"and me",
    'footer.coffee':"Buy me a coffee",
    'bd.back':"← Back to overview",
    'quicknav.personnes':"Who's involved",
    'quicknav.lobby':"Lobbyist registry",
    'quicknav.lexiqueitem':"Glossary",
    'quicknav.apropos':"Where this data comes from",
    'quicknav.ministres':"Cabinet",
    'quicknav.deputes':"Rest of the Assembly",
    'quicknav.comparateur':"Ministers comparator",
    'snooze.label':"😴 Collapse",
    'mission.h':"Our mission — why this isn't just a copy of the National Assembly's website",
    'mission.intro':"<b>This is an independent citizen-run site built with real public data from the Assemblée nationale du Québec and Données Québec.</b>",
    'mission.p':"The National Assembly's official site is the most reliable source that exists, and this site never tries to replace it — only to make it easier to follow for someone who doesn't have time to dig through parliamentary procedure menus.",
    'mission.assnat.tag':"The official site",
    'mission.assnat.1':"Organizes everything by official document",
    'mission.assnat.2':"The complete, legally authoritative source",
    'mission.assnat.3':"Neutral — never compares or summarizes",
    'mission.site.tag':"This site",
    'mission.site.1':"Organizes everything by person: one profile, all their files",
    'mission.site.2':"Translates the jargon into plain language (see the Glossary)",
    'mission.site.3':"Lets you follow what affects you, with no judgment or verdict",
    'intro.compact.text':"Independent citizen-run site · Our mission",
    'intro.show':"😴 Show",
    'intro.hide':"😴 Collapse",
    // Roadmap statuses
    'rm.status.now':"Already there", 'rm.status.later':"To do", 'rm.status.next':"Next step",
    'rm.status.dropped':"Idea explored, dropped for now", 'rm.status.caution':"To do — extra caution",
    'rm.status.verified':"To do — verifiable approach only", 'rm.status.laterlabel':"Later",
    // Roadmap items
    'rm.1.h':"Follow ministers, no account needed",
    'rm.1.p':"The \u201cFollow\u201d button (Cabinet tab) already works: your choice is saved in your browser. Current limit: it won't follow you if you switch devices or clear your browsing data.",
    'rm.2.h':"Priority issues — visitor voting",
    'rm.2.p':"Removed from the site for now, kept here as an idea to revisit later.",
    'rm.2.r1':"<b style=\"color:var(--ink)\">The idea:</b> a tab where visitors propose an issue that affects them (e.g. \u201cprisons no longer do their rehabilitation job\u201d) and vote for the ones that should take priority — a sentiment barometer, not an official poll.",
    'rm.2.r2':"<b style=\"color:var(--ink)\">What already worked in an earlier version:</b> votes were genuinely shared across all site visitors, in real time.",
    'rm.2.r3':"<b style=\"color:var(--ink)\">Its honest limit:</b> without a user account, nothing stops someone from re-voting by switching browsers — so not representative of a real popular vote.",
    'rm.2.r4':"<b style=\"color:var(--ink)\">Worth remembering:</b> the National Assembly already has its own official e-petition system, which obliges a minister to respond publicly — a channel with real weight, unlike this barometer.",
    'rm.2.link':"See the real petition system on assnat.qc.ca →",
    'rm.3.h':"User accounts (email or Google)",
    'rm.3.p':"Done: magic-link (email) sign-in via Supabase Auth — no password to manage. Followed ministers and MNAs now sync across devices for signed-in visitors (a `follows` table, protected by security rules — each person only sees their own follows). Signed-out visitors keep local, browser-only follows, as before.",
    'rm.4.h':"Voluntary donations to support the project",
    'rm.4.p':"Decision already made: no advertising on this site, a “support the project” model with a voluntary donation (Stripe). <b style=\"color:var(--ink)\">Underway:</b> a sole proprietorship registration has been submitted to the Quebec business registrar (waiting on the business number, usually 24-72 business hours after payment). Once received: opening a Stripe account, then a simple Stripe payment link (“Customers choose what to pay”, open amount) — no server needed for this step, just a button pointing to that link. No automatic recurring donation for now (needs a different setup, worth revisiting later if useful). Below the 30,000 dollars/year threshold, no GST/QST registration is required.",
    'rm.5.h':"Ministers' career history",
    'rm.5.p':"Discussed, then deliberately dropped: LinkedIn (and official bios) already cover this for most ministers, and piecing together all 27 career paths by hand, one by one, from scattered press releases and articles doesn't seem like a good effort-to-value tradeoff compared to the site's other priorities (vote registry, user accounts). Kept here for the record, not as an active task.",
    'rm.6.h':"Side-by-side comparison of two ministers",
    'rm.6.p':"Done, in the Cabinet tab: pick two ministers from the dropdowns, their files show up in columns — portfolio, party, riding, real attendance, bills sponsored. What used to block this (vote participation) is now resolved. No “previous positions” row: that item was deliberately dropped higher up this list (LinkedIn and official bios already cover it), so no invented data to fill that cell.",
    'rm.6.r1':"<b style=\"color:var(--ink)\">What this is not:</b> not a ranking (“best/worst minister”) — just the same facts, twice, side by side. Same spirit as the rest of the site: verifiable facts, not judgment.",
    'rm.7.h':"Detailed calendar of upcoming sittings, day by day",
    'rm.7.p':"Currently, the What's New tab only shows the general rules of the parliamentary calendar (when the Assembly generally sits), not a precise schedule of upcoming sittings and committees. Same technical wall as the vote registry: the official calendar page loads its content via JavaScript.",
    'rm.8.h':"Automatic alerts (email)",
    'rm.8.p':"Done: a weekly email digest. Follow a bill (“Follow” button) or ask for an explanation on it, and you'll get a summary when it changes stage — one email a week, never one per change, to avoid fatigue. Sent by a scheduled cloud job (Vercel) that re-reads Données Québec each week and only writes to the people concerned. You only get what you follow; stop anytime by unfollowing.",
    'rm.9.h':"Search expanded to bills' full text",
    'rm.9.p':"The current keyword search looks through titles and the AI summaries generated from the full text (see the item above), but not the full text itself. A very specific word that only appears in the bill's actual text (not in the summary) won't surface anything yet. Indexing the full text for search is a separate project from the summary itself.",
    'rm.10.h':"Minister rating system (report card by issue)",
    'rm.10.p':"Discussed, then deliberately dropped: it would shift the site from \u201cI report verifiable facts\u201d to \u201cI pass judgment on real people,\u201d without a solid methodology behind it. Kept here for the record, not as an active task.",
    'rm.11.h':"Campaign promises vs. government actions — for all parties",
    'rm.11.p':"Proof of concept below. Non-negotiable rule if this gets generalized: never a \u201ckept / broken\u201d verdict written by me — only the promise and the action, each sourced, placed side by side so the reader can judge for themselves. This has to cover the platform of <b style=\"color:var(--ink)\">every party represented in the Assembly</b> (CAQ, PLQ, PQ, QS, PCQ), not just the one in power — otherwise the site would look like it's only scrutinizing one party, which would be unfair and would hurt the credibility of the whole site.",
    'rm.11.r1':"No verdict from me here — just the promise as reported, and the government action as reported, each with its source. It's up to you to judge whether one answers the other.",
    'rm.11.t1':"Reported promise", 'rm.11.t2':"Reported government action",
    'rm.11.t3':"During the CAQ leadership race, Christine Fréchette promised to reopen the Québec Experience Program (PEQ) for two years, with a grandfather clause for immigrants already in Québec when it closed. <a href=\"https://www.lapresse.ca/actualites/politique/2026-04-21/nouveau-conseil-des-ministres/christine-frechette-promet-un-souffle-nouveau-a-son-gouvernement.php\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Source →</a>",
    'rm.11.t4':"On April 21, 2026, responsibility for implementing this PEQ reopening was given to François Bonnardel, appointed Minister of Immigration. <a href=\"https://www.lapresse.ca/actualites/politique/2026-04-21/nouveau-conseil-des-ministres/christine-frechette-promet-un-souffle-nouveau-a-son-gouvernement.php\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Source →</a>",
    'rm.11.r2':"Objective status: responsibility assigned. No concrete bill or order-in-council found yet confirming implementation — to be checked as future sessions unfold.",
    'rm.12.h':"By-MNA vote detail (who voted what)",
    'rm.12.p':"Done: all 735 recorded votes from the 3 sessions of the 43rd Legislature, with each MNA's name and party for every vote (Yea/Nay/Abstention) — on top of the totals already shown before. Scraped directly from the official registry's detail pages (one per vote), not an estimate. Open “View names by MNA” on any vote in the Votes tab for a real example.",
    'rm.12.r1':"<b style=\"color:var(--ink)\">Matching to bills:</b> 64 of the 735 votes are automatically linked to the right bill in the Bills tab, always verifying the title — even when only one candidate exists for a given number (a real collision was found and fixed: the different 2023 Bill 10 had first been wrongly linked to the 2026 Bill 10 simply because the old one had been excluded from tracking). The rest are procedural motions with no associated bill, or bills already fully enacted and therefore outside this site's tracked “current business” scope.",
    'rm.12.r2':"<b style=\"color:var(--ink)\">Useful detail:</b> the party shown next to each name is the one on record at the time of the vote, not the MNA's current party — useful for spotting floor crossings since.",
    'rm.13.h':"AI summaries based on the full bill text",
    'rm.13.p':"Done for all 120 active bills: a short 3-to-7-bullet summary, written by the Claude API from the actual full text (PDF) as introduced, not just the title. Real cost: about $4 USD for the whole set. Open any summary in the Bills tab for a real example.",
    'rm.13.r1':"<b style=\"color:var(--ink)\">What it covers:</b> the concrete changes that affect people (numbers, obligations, bans, new bodies), in plain language, never a value judgment.",
    'rm.13.r2':"<b style=\"color:var(--ink)\">Its honest limit:</b> the summary covers the text as introduced, not necessarily the final version after committee amendments — that's stated directly on every summary. For 2 bills out of 120, the retrieved PDF was just a procedural document with nothing to summarize; the site says so instead of inventing content.",
    'rm.13.r3':"<b style=\"color:var(--ink)\">Related next step:</b> index this full text for keyword search (see the item above), and eventually summarize the final version rather than the one as introduced, time permitting.",
    'rm.14.h':"Public contact badges (email)",
    'rm.14.p':"Done for the 27 ministers and 125 MNAs: the official email (assnat.qc.ca) is shown directly next to the party badge, in the Ministers tab. Scraped in a single fetch of the index page (the table already listed everyone's email). Social media (LinkedIn, Facebook, Instagram) is deliberately left out: those accounts aren't listed anywhere official, and finding them by name search would risk mixing up people with the same name or landing on a fake account — no reliable way to verify the match yet.",
    'rm.15.h':"Lobbyist registry — who declares wanting to influence whom, on what subject",
    'rm.15.p':"Québec has a real official registry (Carrefour Lobby Québec) where every lobbyist must publicly declare who they represent, which department or agency they're approaching, and on what subject. <b style=\"color:var(--ink)\">Why it's not done:</b> checked — it's not just a page that loads its content via JavaScript (that alone would be workable, see the vote registry). The search form is protected by reCAPTCHA (Google), a deliberate anti-automation measure, not just a technical wall. Bypassing a reCAPTCHA to scrape at scale wouldn't be an honest practice, whatever the tool — so this is dropped for now, not a matter of time or technical effort. <b style=\"color:var(--ink)\">Step taken:</b> confirmed no dataset yet exists on Données Québec for this registry (0 search results); an open-data publication request has been drafted for Données Québec (pilote@donneesquebec.ca), to be sent by the person behind this project rather than through any automated mechanism.",
    'rm.16.h':"Synced follows across devices",
    'rm.16.p':"Once accounts are in place, \u201cFollow a minister\u201d and votes will be saved to your account instead of your browser — fixing both current limits at once.",
    'rm.18.h':"Ask for an explanation on a bill (+ possible petition)",
    'rm.18.p':"Done: in the Bills tab, any signed-in person can ask for an explanation on an active bill — never one already enacted, always verified against real data (never a made-up number). One request per person per bill, thanks to user accounts (prevents stuffing). <b style=\"color:var(--ink)\">Anti-troll limit:</b> a maximum of 10 requests per account per month, enforced by a server-side security rule (can't be bypassed from the browser) — stops one account from flooding the system by flagging every bill at once. The real count is only visible to designated admin accounts — not public for now. <b style=\"color:var(--ink)\">Real limit of the official system:</b> a petition to the National Assembly must be tabled by an MNA, who can refuse to present it — so what comes next (finding an MNA willing to sponsor it, a Facebook post, tabling the petition) stays a manual process, not automated. <b style=\"color:var(--ink)\">Watch closely:</b> same risk as the minister rating system dropped above — the numbers are shown raw, without interpretation, never as a judgment, to stay true to the ‘never a verdict on real people’ rule.",
    'rm.17.h':"English version of the site",
    'rm.17.p':"Done: the \u201cEnglish\u201d button (top of the site) translates the whole interface, plus the detailed content — bills, ministers, votes, glossary, petitions, roadmap. The official titles for Bills 1, 7, and 13 come from the real English pages on assnat.qc.ca; the other titles and summaries are my own translation, not yet checked word-for-word against the official site.",
  }
};
// La langue du site. Elle ne vit plus seulement en mémoire (Martin, 24 sept. 2026 : « EN et
// français, on ne voit pas de différence dans l'URL ») ; elle est à deux endroits :
//   - dans l'ADRESSE : « ?lang=en » en anglais, rien en français (la langue par défaut). Une
//     adresse copiée ou partagée ouvre la page dans la même langue ;
//   - dans le NAVIGATEUR : dvq:langue, la même clé que Mes dossiers, Abonnement et le volet de
//     Montréal (commun/langue.js) — un seul choix pour tout le site. Depuis que chaque onglet est
//     une vraie page (21 sept.), sans elle chaque clic ramenait au français.
// L'adresse l'emporte sur le choix gardé, et le remplace — sauf en revenant par Précédent ou
// Suivant : une ANCIENNE adresse « ?lang=en » ne doit pas défaire le français choisi depuis, pour
// tout le site (relecture du 24 sept. 2026). Le <head> de gabarit.html refait la même lecture pour
// cacher la page le temps de la traduire : les deux doivent décider exactement pareil.
const CLE_LANGUE = 'dvq:langue';
const langueValide = (l) => l === 'en' || l === 'fr';
function langueGardee(){ try{ return localStorage.getItem(CLE_LANGUE); }catch(e){ return null; } }
function arriveeParHistorique(){
  try{ const n = performance.getEntriesByType('navigation')[0]; return !!n && n.type === 'back_forward'; }catch(e){ return false; }
}
function langueDeDepart(){
  let demandee = null;
  try{ demandee = new URLSearchParams(location.search).get('lang'); }catch(e){}
  const gardee = langueGardee();
  if(arriveeParHistorique() && langueValide(gardee)) return gardee;
  if(langueValide(demandee)){
    try{ localStorage.setItem(CLE_LANGUE, demandee); }catch(e){}
    return demandee;
  }
  // C.-B. : ANGLAIS PAR DÉFAUT (comme l'Ontario). L'Assemblée ne publie qu'en anglais ; le
  // français est complet, mais ce n'est pas la langue de départ.
  return gardee === 'fr' ? 'fr' : 'en';
}
let currentLang = langueDeDepart();

// Écrit la langue dans l'adresse, sans recharger ni ajouter d'entrée à l'historique.
function langueDansAdresse(){
  try{
    const url = new URL(location.href);
    if(currentLang === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
    const cible = url.pathname + url.search + url.hash;
    if(cible !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', cible);
  }catch(e){}
}
// Ce qu'un lien vers une page du site doit porter pour garder la langue : rien en français.
// premier : le lien n'a pas encore de « ? ».
function paramLangue(premier){ return currentLang === 'en' ? (premier ? '?lang=en' : '&lang=en') : ''; }
langueDansAdresse();

// Tout lien vers une page du site emporte la langue — clic, clic du milieu, « copier l'adresse du
// lien » — même quand le navigateur ne garde rien (données de site bloquées). Réécrit au moment du
// geste plutôt qu'au dessin : les listes dessinées plus tard sont couvertes aussi. On ne touche un
// lien que s'il le faut, pour ne pas réencoder ses autres paramètres.
function lienDansLaLangue(e){
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if(!a) return;
  let url;
  try{ url = new URL(a.href); }catch(_){ return; }
  if(url.origin !== location.origin) return;
  if(currentLang === 'en'){
    if(url.searchParams.get('lang') === 'en') return;
    url.searchParams.set('lang', 'en');
  }else{
    if(!url.searchParams.has('lang')) return;
    url.searchParams.delete('lang');
  }
  a.href = url.href;
}
['click', 'auxclick', 'contextmenu'].forEach((type) => document.addEventListener(type, lienDansLaLangue, true));

// Un seul choix pour tout le site, même déjà ouvert : cette page suit le choix gardé quand il
// change dans un autre onglet (storage), ou pendant qu'elle dormait dans le cache aller-retour
// (pageshow). Avant la fin du démarrage, init() dessinera de toute façon dans la bonne langue.
let demarrageFini = false;
function suivreLaLangueGardee(){
  const gardee = langueGardee();
  if(!langueValide(gardee) || gardee === currentLang) return;
  currentLang = gardee;
  langueDansAdresse();
  if(!demarrageFini) return;
  applyLanguage();
  if(typeof renderTicker === 'function') renderTicker();
}
window.addEventListener('storage', (e) => { if(e.key === CLE_LANGUE) suivreLaLangueGardee(); });
window.addEventListener('pageshow', (e) => { if(e.persisted) suivreLaLangueGardee(); });

function t(key){ return (translations[currentLang] && translations[currentLang][key]) || key; }

// Mémorise le HTML français d'origine de chaque élément traduit, une seule fois.
// Sans ça, un aller-retour FR→EN→FR laissait en anglais tout élément qui n'a
// pas d'entrée française explicite (le français venait du HTML inline, écrasé
// par l'anglais et jamais restauré). On restaure maintenant cet original.
const i18nOriginals = new WeakMap();
// Les textes fixes de la page (data-i18n) et ce qui les accompagne. À part du reste
// d'applyLanguage pour pouvoir passer dès le démarrage, avant les données : en anglais, le <head>
// garde la page cachée le temps de la traduire, et ce qui se montre doit déjà être traduit.
function traduireTextesFixes(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if(!i18nOriginals.has(el)) i18nOriginals.set(el, el.innerHTML);
    const entry = translations[currentLang] && translations[currentLang][key];
    el.innerHTML = (entry !== undefined) ? entry : i18nOriginals.get(el);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder');
    const entry = translations[currentLang] && translations[currentLang][key];
    if(entry !== undefined){ el.placeholder = entry; }
  });
  { const _e = document.getElementById('langToggle'); if(_e) _e.textContent = currentLang === 'fr' ? 'English' : 'Français'; }
  // Le cahier de la C.-B. met aussi la langue dans le pied de page.
  { const _f = document.getElementById('langToggleFooter'); if(_f) _f.textContent = currentLang === 'fr' ? 'English' : 'Français'; }
  document.body.classList.toggle('lang-en', currentLang === 'en');
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'fr';
  { const _e = document.getElementById('footerLeft'); if(_e) _e.textContent = t('footer.left'); }
  { const _e = document.getElementById('footerRight'); if(_e) _e.textContent = t('footer.right'); }
  { const _e = document.getElementById('footerDafr'); if(_e) _e.href = currentLang === 'en' ? 'https://www.dafrsolution.com/en' : 'https://www.dafrsolution.com'; }
  if(typeof syncTitle === 'function') syncTitle(viewFromPath());
  if(typeof etatLegislature === 'function') etatLegislature();
  // Les noms d'onglets changent de longueur avec la langue : l'en-tête se remesure.
  if(typeof majEnteteDeuxRangees === 'function') majEnteteDeuxRangees();
}
// N.-B. (7 nov. 2026) : le surtitre de l'affiche, « 61e législature · 3e session », tiré des
// projets de loi chargés (la législature la plus récente, puis sa session la plus récente).
// Rien n'est écrit à la main : sans projet chargé, le surtitre reste caché.
function poserSessionAffiche(){
  const e = document.getElementById('heroSession');
  if(!e || typeof bills === 'undefined' || !bills.length) return;
  const leg = Math.max(...bills.map(b => Number(b.legislature) || 0));
  const ses = Math.max(...bills.filter(b => Number(b.legislature) === leg).map(b => Number(b.introSession) || 0));
  if(!leg || !ses) return;
  const ordFr = (n) => n === 1 ? '1<sup>re</sup>' : n + '<sup>e</sup>';
  const ordEn = (n) => n + ({1:'st', 2:'nd', 3:'rd'}[(n % 100 >= 11 && n % 100 <= 13) ? 0 : n % 10] || 'th');
  e.innerHTML = currentLang === 'en'
    ? ordEn(leg) + ' Legislature · ' + ordEn(ses) + ' Session'
    : leg + '<sup>e</sup> législature · ' + ordFr(ses) + ' session';
  // Une législature terminée se dit au passé, sinon l'affiche annonce une session qui n'existe plus.
  if(typeof legislatureEtat !== 'undefined' && legislatureEtat && legislatureEtat.enCours
    && legislatureEtat.montree && legislatureEtat.enCours !== legislatureEtat.montree){
    e.innerHTML += currentLang === 'en' ? ' · ended' : ' · terminée';
  }
  e.hidden = false;
  // N.-B. : l'encadré de l'accueil (et la bande défilante, qui le lit) dit la même chose.
  // C.-B. : ne jamais écrire « session en cours » quand elle ne l'est plus. La législature
  // montrée peut être terminée depuis des mois (etatLegislature s'en charge et écrit la vraie
  // phrase) — on laisse alors cette ligne tranquille.
  const legPassee = typeof legislatureEtat !== 'undefined' && legislatureEtat
    && legislatureEtat.enCours && legislatureEtat.montree
    && legislatureEtat.enCours !== legislatureEtat.montree;
  const cal = document.querySelector('.calendar-box .status');
  if(cal && !ASSEMBLY.dissolved && !legPassee){
    cal.innerHTML = (cal.closest('.nb-etat') ? '' : '● ') + (currentLang === 'en'
      ? ordEn(leg) + ' Legislature · ' + ordEn(ses) + ' Session under way'
      : leg + '<sup>e</sup> législature · ' + ordFr(ses) + ' session en cours');
    if(typeof renderTicker === 'function') renderTicker();
  }
  // N.-B. (maquette) : dans le bandeau de l'accueil, la prochaine séance lue au calendrier de
  // leg.bc.ca (scrapers/calendrier.js). Une date passée ne s'affiche pas : le bandeau garde la session.
  const etat = document.querySelector('.nb-etat .status');
  const s = stats && stats.prochaineSeance;
  if(etat && s && !ASSEMBLY.dissolved && s.date >= new Date().toLocaleDateString('en-CA')){
    const [a, m, j] = s.date.split('-').map(Number);
    const jour = new Date(a, m - 1, j).toLocaleDateString(currentLang === 'en' ? 'en-CA' : 'fr-CA', { day:'numeric', month:'long', year:'numeric' });
    etat.innerHTML = currentLang === 'en'
      ? '<b>Next sitting: ' + jour + '.</b> New bills appear here as soon as they are tabled in Victoria.'
      : '<b>Prochaine séance le ' + jour + '.</b> Les nouveaux projets de loi apparaîtront ici dès leur dépôt à Victoria.';
  }
}
function applyLanguage(){
  traduireTextesFixes();
  // Re-render dynamic lists so their JS-generated buttons pick up the new language
  renderHemicycle();
  renderLegendePresence();
  renderPartyFilters();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderStatusFilters();
  renderStepFilters();
  updateSortToggleLabel();  updateMinistresSortLabel();
  renderAccountBox();
  renderAdminFlagCounts();
  renderComparateurSelects();
  renderComparateurTable();
  renderFinancesSelect();
  renderFinances();
  renderBills();
  renderDeputes(document.getElementById('searchMinistres')?.value);
  renderVotes();
  renderApercuBills();
  renderApercuPetitions();
  renderNews();
  renderChallenged();
  renderPromises();
  renderJournal();
  renderArchives();
  document.querySelectorAll('.snooze-pill').forEach(pill=>{
    // La pastille de l'intro compacte (#introCompact) n'a pas de <span> imbriqué
    // comme les autres — sans ce repli, ça plantait ici et bloquait tout le
    // reste du chargement de la page (y compris l'authentification).
    const isCollapsed = pill.classList.contains('snoozed');
    const labelSpan = pill.querySelector('span') || pill;
    labelSpan.textContent = isCollapsed ? (currentLang==='en' ? '😴 Show' : '😴 Afficher') : (currentLang==='en' ? '😴 Collapse' : '😴 Réduire');
  });
  // Le <title> suit la langue ET l'onglet courant (déduit de l'URL).
  if(typeof syncTitle === 'function') syncTitle(viewFromPath());
  if(typeof etatLegislature === 'function') etatLegislature();
  poserSessionAffiche();
  // N.-B. : « + Représentez votre ville » ouvre le formulaire de DossierQuébec dans la langue de la page.
  const rtv = document.getElementById('lienRtv');
  // Depuis le 9 novembre 2026, DossierBC a SA page : la pastille et le pied de page n'envoient
  // plus sur dossierquebec.ca, qui montrait une liste de villes québécoises à quelqu'un de Kelowna.
  for(const a of [rtv, ...document.querySelectorAll('.lienRtv')]) if(a) a.href = '/represente-ta-ville' + paramLangue(true);
  // L'infobulle de la bascule de thème suit la langue elle aussi.
  if(typeof appliquerTheme === 'function') appliquerTheme();
}

/* L'ÉTAT DES LÉGISLATURES, dit par les données et non à la main.

   En Colombie-Britannique, une législature peut exister des semaines avant d'avoir siégé : après
   une élection générale, l'Assemblée ouvre la nouvelle législature tout de suite, mais ne publie
   ni session, ni député·e·s, ni conseil des ministres avant la première séance. Le site montre
   alors la dernière législature qui a des données — et doit le DIRE, sinon il a l'air périmé.

   Tout vient de legislatureEtat, injecté par scrapers/build-frontend-data.js depuis
   data/bills.json, c'est-à-dire de l'API de l'Assemblée : la législature montrée, celle en cours,
   et la date d'ouverture de celle-ci. Aucune date n'est écrite ici, et le message disparaît de
   lui-même dès que la nouvelle législature a une session.

   Ce qu'on NE dit PAS : qui a gagné l'élection, et quand elle a eu lieu. L'Assemblée ne le publie
   pas, et le robots.txt d'elections.bc.ca interdit sa lecture à tout robot sauf Google et Bing. On
   renvoie donc au site d'Elections BC par un lien, sans en recopier quoi que ce soit. */
// Le résultat du dernier scrutin, pour la période entre l'élection et la première séance.
// Il vient de Wikipédia (scrapers/election.js) : elections.bc.ca ferme son robots.txt, et
// l'Assemblée ne publie rien avant les résultats certifiés. La source est donc NOMMÉE sur la
// page, avec le jour de la lecture — une donnée non officielle ne passe pas pour officielle.
function blocResultat(isEn){
  const e = typeof stats !== 'undefined' && stats && stats.election;
  if(!e || !e.partis || !e.partis.length) return '';
  const jour = (iso) => {
    try{ return new Date(iso + 'T12:00:00Z').toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' }); }
    catch(err){ return iso; }
  };
  const etiquette = (p) => {
    const s = seats.find((x) => x.party === p.code);
    return s ? (isEn ? s.labelEn : s.label) : p.nom;
  };
  const pct = (n) => n === null || n === undefined ? '' : n.toFixed(1).replace('.', isEn ? '.' : ',') + ' %';
  const total = e.siegesTotal || e.partis.reduce((s, p) => s + p.sieges, 0);
  const tri = [...e.partis].sort((a, b) => b.sieges - a.sieges);
  const barre = tri.map((p) => '<span style="width:' + (p.sieges / total * 100).toFixed(2) + '%;background:'
    + (partyColors[p.code] || '#8B8578') + '"></span>').join('');
  const lignes = tri.map((p) => '<li><i style="background:' + (partyColors[p.code] || '#8B8578') + '"></i>'
    + '<b>' + p.sieges + '</b> <span class="bc-scrutin-nom">' + etiquette(p) + '</span>'
    + '<span class="bc-scrutin-pct">' + pct(p.pourcentVote) + '</span></li>').join('');
  const vainqueur = tri[0];
  // « Le Parti conservateur », « Les indépendant·e·s » : sans l'article, la phrase française
  // commence par un nom nu. Les étiquettes de partis sont toutes masculines.
  const article = vainqueur.code === 'IND' ? 'Les ' : 'Le ';
  const resume = isEn
    ? '<b>' + etiquette(vainqueur) + ' won ' + vainqueur.sieges + ' of ' + total + ' seats</b>'
      + (e.majoritaire ? ' — a majority' : ' — short of the ' + e.majorite + ' needed for a majority') + '.'
    : '<b>' + article + etiquette(vainqueur) + ' a remporté ' + vainqueur.sieges + ' sièges sur ' + total + '</b>'
      + (e.majoritaire ? ' — une majorité' : ' — sous les ' + e.majorite + ' qu\'il faut pour une majorité') + '.';
  return '<div class="bc-scrutin">'
    + '<div class="bc-scrutin-titre">' + (isEn ? 'General election of ' : 'Élection générale du ') + jour(e.scrutin) + '</div>'
    + '<div class="bc-scrutin-barre">' + barre + '</div>'
    + '<ul class="bc-scrutin-liste">' + lignes + '</ul>'
    + '<p class="bc-scrutin-resume">' + resume + '</p>'
    + '<p class="bc-scrutin-note">' + (isEn
      ? 'These figures come from <a href="' + e.source + '" target="_blank" rel="noopener">Wikipedia</a>, read on '
        + jour(e.lueLeJour) + '. They are not the Assembly\'s: Elections BC does not allow its results to be read '
        + 'automatically, and the Assembly publishes none of its own until the certified results arrive. The '
        + 'Executive Council shown on this site is still the one the Assembly publishes, that of the previous Parliament.'
      : 'Ces chiffres viennent de <a href="' + e.source + '" target="_blank" rel="noopener">Wikipédia</a>, lus le '
        + jour(e.lueLeJour) + '. Ils ne sont pas ceux de l\'Assemblée : Elections BC interdit la lecture '
        + 'automatisée de ses résultats, et l\'Assemblée n\'en publie aucun avant les résultats certifiés. Le '
        + 'conseil des ministres affiché sur ce site reste celui que l\'Assemblée publie, celui de la législature précédente.')
    + '</p></div>';
}

function etatLegislature(){
  if(typeof legislatureEtat === 'undefined' || !legislatureEtat) return;
  const e = legislatureEtat;
  // Rien à expliquer tant que la législature montrée EST celle en cours.
  if(!e.enCours || !e.montree || e.enCours === e.montree) return;
  const isEn = currentLang === 'en';
  const rang = (n) => {
    if(isEn){ const r = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th','st','nd','rd'][n % 10] || 'th'); return n + r; }
    return n + (n === 1 ? 're' : 'e');
  };
  const date = (iso) => {
    if(!iso) return null;
    try{ return new Date(iso + 'T12:00:00Z').toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' }); }
    catch(err){ return iso; }
  };
  const finMontree = (e.sessions || []).map((s) => s.fin).filter(Boolean).sort().pop() || null;
  const ouverture = date(e.enCoursDebut);
  // La seule date officielle qui existe entre l'élection et la première séance : celle où
  // l'Assemblée dit attendre les résultats certifiés pour publier ses député·e·s (lue sur son
  // accueil par scrapers/calendrier.js). Une fois passée, elle ne veut plus rien dire : on la
  // laisse tomber et la phrase générale reprend sa place.
  const certifie = stats && stats.resultatsCertifies
    && stats.resultatsCertifies.date >= new Date().toLocaleDateString('en-CA')
    ? stats.resultatsCertifies.date : null;

  const ligne = isEn
    ? '● ' + rang(e.montree) + ' Parliament' + (finMontree ? ' ended ' + date(finMontree) : ' is over')
      + ' · the ' + rang(e.enCours) + ' has not sat yet'
      + (certifie ? ' · Members on ' + date(certifie) : '')
    : '● La ' + rang(e.montree) + ' législature' + (finMontree ? ' s\'est terminée le ' + date(finMontree) : ' est terminée')
      + ' · la ' + rang(e.enCours) + ' n\'a pas encore siégé'
      + (certifie ? ' · député·e·s le ' + date(certifie) : '');
  const cal = document.querySelector('[data-i18n="cal.status"]');
  if(cal) cal.textContent = ligne;
  if(typeof renderTicker === 'function') renderTicker();   // il lit cal.status

  const resultat = blocResultat(isEn);
  const texte = isEn
    ? '<b>This is the record of the ' + rang(e.montree) + ' Parliament.</b> A general election has been held since'
      + (ouverture ? ', and the ' + rang(e.enCours) + ' Parliament has been open since ' + ouverture : '')
      + (certifie
        ? '. The Assembly is waiting for the certified results, which it expects on ' + date(certifie)
          + ', before publishing the Members of the ' + rang(e.enCours) + ' — and it has announced no sitting date. '
        : ', but the Legislative Assembly has not yet published its Members, its cabinet or a sitting date — so there is nothing yet to show for it. ')
      + 'Every bill that had not received Royal Assent died when the ' + rang(e.montree) + ' ended; they would have to start over.'
      + (resultat ? '' : ' For the election results, see <a href="https://elections.bc.ca" target="_blank" rel="noopener">Elections BC</a>: we do not reproduce them, because its robots.txt does not allow us to read them.')
    : '<b>Ce que vous voyez est le bilan de la ' + rang(e.montree) + ' législature.</b> Une élection générale a eu lieu depuis'
      + (ouverture ? ', et la ' + rang(e.enCours) + ' législature est ouverte depuis le ' + ouverture : '')
      + (certifie
        ? '. L\'Assemblée attend les résultats certifiés, qu\'elle annonce pour le ' + date(certifie)
          + ', avant de publier les député·e·s de la ' + rang(e.enCours) + ' — et elle n\'annonce aucune date de séance. '
        : ', mais l\'Assemblée législative n\'a encore publié ni ses député·e·s, ni son conseil des ministres, ni de date de séance — il n\'y a donc rien à en montrer. ')
      + 'Tout projet de loi qui n\'avait pas reçu la sanction royale est mort avec la ' + rang(e.montree) + ' : il faudrait le redéposer.'
      + (resultat ? '' : ' Pour les résultats du scrutin, voir <a href="https://elections.bc.ca" target="_blank" rel="noopener">Elections BC</a> : nous ne les reproduisons pas, son robots.txt nous interdisant de les lire.');

  for(const sel of ['#etatLegislature', '#etatLegislatureAccueil', '#deputesInfoBox']){
    const el = document.querySelector(sel);
    if(!el) continue;
    el.innerHTML = texte + resultat;
    el.hidden = false;
  }
  const t = document.querySelector('#deputesTitle h2');
  if(t) t.textContent = isEn ? 'The ' + rang(e.montree) + ' Parliament' : 'La ' + rang(e.montree) + ' législature';
  const note = document.querySelector('#deputesTitle .head-note');
  if(note) note.textContent = isEn
    ? 'Members at the end of the ' + rang(e.montree) + ' Parliament'
    : 'Les député·e·s à la fin de la ' + rang(e.montree) + ' législature';
}


function basculerLangue(){
  currentLang = currentLang === 'fr' ? 'en' : 'fr';
  try{ localStorage.setItem(CLE_LANGUE, currentLang); }catch(e){}
  langueDansAdresse();
  applyLanguage();
  if(typeof renderTicker === 'function') renderTicker(); // le ticker suit la langue
}
document.getElementById('langToggle')?.addEventListener('click', basculerLangue);
// Le même geste dans le pied de page, comme sur la maquette.
document.getElementById('langToggleFooter')?.addEventListener('click', (e)=>{ e.preventDefault(); basculerLangue(); });

/* ---------------- DATA ---------------- */

// Couleurs des partis. C.-B. : ni l'Assemblée ni Wikipédia ne publient de code de couleur pour
// les partis de la province. Les pages Wikipédia (lues le 8 nov. 2026) ne donnent que le mot —
// « Orange » pour le NPD, « Blue » pour les conservateurs, et rien du tout pour les verts.
// CES CODES SONT DONC LES NÔTRES, pas des valeurs officielles : l'orange et le gris sont ceux que
// DossierSaskatchewan emploie déjà pour un NPD et pour les indépendant·e·s, le vert celui que la
// famille emploie déjà pour un parti vert, et le bleu conservateur (#024DAF) vient de la Charte
// Dossier.
// Rappel de la charte : ces couleurs ne servent QU'AUX pastilles de parti. Le bleu conservateur
// est presque celui de l'accent du site (#0047BB) — c'est le conflit que la charte signale pour la
// Colombie-Britannique, et il est assumé.
const partyColors = { NDP:'#F58220', CON:'#024DAF', VERT:'#3D9B35', IND:'#8B8578' };
// Refonte : badges de parti à fond PLEIN — couleur de texte lisible par parti
// (noir sur l'orange clair, blanc sur les foncés).
const partyTextColors = { NDP:'#131313', CON:'#fff', VERT:'#fff', IND:'#fff' };
function partyText(p){ return partyTextColors[p] || '#fff'; }

// C.-B. : les groupes de l'Assemblée législative. Le nombre de sièges se compte sur la liste des
// député·e·s (deputesRaw), lue à chaque rafraîchissement dans l'API de l'Assemblée — jamais écrit
// en dur. Les quatre étiquettes sont les seules que l'Assemblée reconnaisse : les député·e·s
// passés à CentreBC ou à OneBC pendant la 43e législature y figurent comme indépendant·e·s, et la
// page des règles l'explique.
const seats = [
  {party:'NDP', label:'NPD de la Colombie-Britannique', labelEn:'BC NDP'},
  {party:'CON', label:'Parti conservateur de la Colombie-Britannique', labelEn:'Conservative Party of BC'},
  {party:'VERT', label:'Parti vert de la Colombie-Britannique', labelEn:'BC Green Party'},
  {party:'IND', label:'Indépendant·e·s', labelEn:'Independents'},
].map((s) => Object.defineProperty(s, 'n', {
  get(){ return (typeof deputesRaw !== 'undefined' ? deputesRaw : []).filter((d) => d[3] === s.party).length; },
  enumerable: true,
}));






// Stepper simplifié à 3 étapes pour l'affichage. Les données gardent la pleine
// granularité officielle (b.step de 1 à 5, régénéré chaque jour par les scrapers) ;
// displayStep() replie « Adoption du principe » (2) et « Prise en considération » (4)
// dans « Étude détaillée » — assez précis pour un lecteur pressé, et le détail réel
// reste visible dans la note de chaque carte (« Adoption du principe le … »).
const steps = ['Première lecture','Deuxième lecture et comité','Troisième lecture / Sanction'];   // N.-B. : les lectures de l'Assemblée législative
const stepsEn = ['First reading','Second reading & committee','Third reading / Assent'];
function displayStep(step){
  if(step === null || step === undefined) return step;
  return step <= 1 ? 1 : (step >= 5 ? 3 : 2);
}

// Votes réels du registre des votes de l'Assemblée nationale (43e législature,
// sessions 1 à 3) — voir scrapers/votes.js pour le scraper et
// scrapers/build-votes-data.js pour l'injection. Chaque entrée du détail
// nominatif (nominal.pour/contre/abstentions) est une paire [ID assnat, parti
// au moment du vote] ; le nom complet est retrouvé via `deputes` (voir
// DEPUTES_DATA_START plus haut) en joignant sur cet ID.



// (le calcul de `deputes` a rejoint chargerDonnees, en haut : il ne peut plus tourner au
//  chargement du script, puisque deputesRaw arrive par le réseau.)

/* ---------------- STORAGE (favoris) ---------------- */
// `window.storage` était une API propre à l'environnement Claude.ai, pas une vraie
// fonction de navigateur — elle n'existe plus une fois le site hébergé ailleurs.
// Remplacée ici par un vrai stockage local (localStorage), avec la même interface
// (.get(key) -> {value} | null, .set(key, value)) pour ne pas toucher aux appels
// existants plus bas. Préfixe pour éviter les collisions avec d'autres clés.
window.storage = {
  async get(key){
    const value = localStorage.getItem('dossierquebec:' + key);
    return value === null ? null : { value };
  },
  async set(key, value){
    localStorage.setItem('dossierquebec:' + key, value);
  }
};

let followed = {};
async function loadFollowed(){
  try{
    const res = await window.storage.get('followed-ministers');
    followed = res ? JSON.parse(res.value) : {};
  }catch(e){ followed = {}; }
}
async function toggleFollow(name){
  followed[name] = !followed[name];
  if(currentUser){
    await upsertFollow('minister', name, followed[name]);
  } else {
    try{ await window.storage.set('followed-ministers', JSON.stringify(followed)); }catch(e){}
  }
  // En vue combinée (voir toggleMinistresSort), un ministre peut être affiché
  // dans la même grille qu'un·e député·e — les deux fonctions de rendu doivent
  // donc rafraîchir ensemble, peu importe qui a déclenché le suivi.
  const kw = document.getElementById('searchMinistres')?.value;
  renderMinistres(kw);
  renderDeputes(kw);
}

let followedDeputes = {};
async function loadFollowedDeputes(){
  try{
    const res = await window.storage.get('followed-deputes');
    followedDeputes = res ? JSON.parse(res.value) : {};
  }catch(e){ followedDeputes = {}; }
}
async function toggleFollowDepute(id){
  followedDeputes[id] = !followedDeputes[id];
  if(currentUser){
    await upsertFollow('depute', id, followedDeputes[id]);
  } else {
    try{ await window.storage.set('followed-deputes', JSON.stringify(followedDeputes)); }catch(e){}
  }
  const kw = document.getElementById('searchMinistres')?.value;
  renderMinistres(kw);
  renderDeputes(kw);
}

// Suivi des projets de loi (21 sept. 2026). Rangé avec les projets des villes, dans
// bc_dossiers_suivis (ville « assemblee », dossier_id « pl:<id> ») : même limite (3 en tout,
// trigger Postgres), visible dans Mon dossier. Connexion requise : un suivi anonyme se perdrait.
// (L'ancien suivi par `bc_follows` type 'bill' n'a jamais pu s'enregistrer : la contrainte de
// la table n'accepte que 'minister' et 'depute'.)
let followedBills = {};
async function loadFollowedBills(){
  followedBills = {};
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('bc_dossiers_suivis')
    .select('dossier_id').eq('user_id', currentUser.id).eq('ville', 'assemblee');
  if(error){ console.error('loadFollowedBills:', error); return; }
  for(const row of (data || [])){
    const m = /^pl:(\d+)$/.exec(row.dossier_id);
    if(m) followedBills[m[1]] = true;
  }
}
async function toggleFollowBill(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  const b = bills.find(x => x.id === billId);
  if(!b) return;
  if(btn) btn.disabled = true;
  const cle = { user_id: currentUser.id, ville: 'assemblee', dossier_id: 'pl:' + billId };
  const { error } = followedBills[billId]
    ? await supabaseClient.from('bc_dossiers_suivis').delete().eq('user_id', cle.user_id).eq('ville', cle.ville).eq('dossier_id', cle.dossier_id)
    : await supabaseClient.from('bc_dossiers_suivis').upsert(
        { ...cle, numero: 'PL ' + b.num, objet: String(b.title || '').slice(0, 600) },
        { onConflict: 'user_id,ville,dossier_id', ignoreDuplicates: true });
  if(error){
    console.error('toggleFollowBill:', error);
    if(btn) btn.disabled = false;
    // Le plafond vient du trigger : « limite de N suivis atteinte ». Un seul quota pour tout ce
    // qu'on suit — projets de loi, projets de ville, mots-clés, organismes. (« projets » est
    // l'ancien message, gardé tant que le nouveau script SQL n'est pas exécuté.)
    const plafond = Number(/limite de (\d+) (?:projets )?suivis/.exec(error.message || '')?.[1]) || 0;
    if(plafond){
      alert(isEn ? `Limit reached: ${plafond} things followed in all (bills and city projects together). Remove one in My file first.` : `Limite atteinte : ${plafond} suivis en tout (projets de loi et projets de ville ensemble). Retirez-en un dans Mon dossier d’abord.`);
    } else if(/consultation/i.test(error.message || '')){
      alert(isEn ? 'This is a reading-station account: it cannot change what it follows.' : 'Ce compte est un poste de consultation : il ne peut pas modifier ses suivis.');
    } else {
      alert(isEn ? "Couldn't save. Try again." : 'Impossible d’enregistrer. Réessayez.');
    }
    return;
  }
  followedBills[billId] = !followedBills[billId];
  // Sur place, sans redessiner la liste : la carte ouverte doit le rester, avec le nouvel état.
  for(const bouton of document.querySelectorAll(`button[id^="suivre-"][id$="-${billId}"]`)){
    bouton.textContent = libelleSuivreLoi(followedBills[billId], isEn);
    bouton.classList.toggle('on', !!followedBills[billId]);
    bouton.disabled = false;
  }
}
const libelleSuivreLoi = (suivi, isEn) => suivi
  ? (isEn ? '★ Following — stop' : '★ Suivi — retirer')
  : (isEn ? '☆ Follow this bill' : '☆ Suivre ce projet de loi');
// Un projet de loi « vivant » : pas de dissolution en cours, ET de la législature en cours. Le
// 17 nov. 2026, dissolved repasse à false alors que bills.json porte encore les 143 projets de la
// 43e, tous morts le 27 août, jusqu'à ce que Données Québec publie le premier de la 44e. Aucun
// projet de la 43e n'a d'activité après la dissolution ; tout projet de la 44e en a une après
// newLegislatureOn.
const loiVivante = (b) => !ASSEMBLY.dissolved && String(b.lastActivity || '') >= ASSEMBLY.newLegislatureOn;

// Un projet se « challenge » tant qu'il n'est pas devenu loi.
//
// ⚠️ Cette règle passait par loiVivante(), qui est faux pour TOUS les projets pendant la
// dissolution : le bouton « Demander une explication » avait donc disparu de chaque carte du
// site, et plus personne ne pouvait challenger quoi que ce soit — alors que c'est le geste
// central de DossierQuébec, et qu'une campagne électorale est précisément le moment où les
// gens veulent des explications. On laisse donc challenger les projets morts au feuilleton :
// la demande est enregistrée, comptée, et elle dira à la rentrée ce que les gens voulaient
// voir expliqué. Seul un projet SANCTIONNÉ (devenu loi) ne se challenge pas.
const peutEtreChallenge = (b) => !ASSEMBLY.challenge ? false : archiveLeg !== null ? false : ASSEMBLY.dissolved
  ? b.status !== 'sanctionne'
  : (b.status === 'encours' && loiVivante(b));

/* ---------------- FINANCES PUBLIQUES ---------------- */
// Le tableau de la bande bleue (page Ministres et député·e·s) : une personne, trois blocs. Tout sort
// de data/finances.json, que scrapers/finances.js recopie de l'Assemblée nationale. Le fichier pèse
// près de 300 ko : il n'arrive qu'à cette page, après le reste, et le menu se remplit à son arrivée.
// Rien n'est additionné ni classé ici : les montants sont ceux que l'Assemblée publie.
let _finances = null, _financesP = null, _finHist = null;
function chargerFinances(){
  if(_financesP) return _financesP;
  // Les années précédentes (data/finances-historique.json) arrivent en même temps ; leur absence
  // n'empêche rien : le tableau s'affiche sans le bloc « d'une année à l'autre ».
  const hist = fetch('/data/finances-historique.json').then(r => r.ok ? r.json() : null).catch(() => null);
  _financesP = fetch('/data/finances.json').then(r => r.ok ? r.json() : null).catch(() => null)
    .then(async d => { _finances = d; _finHist = d ? await hist : null; if(!d) _financesP = null; return d; });
  return _financesP;
}
// Un même cabinet peut avoir plusieurs rapports dans l'année, un par personne qui l'a dirigé, et
// l'Assemblée l'écrit au masculin ou au féminin selon la personne (« du chef » / « de la cheffe »).
// Cette clé les réunit. Un cabinet de vice-présidence porte le nom de sa ou son titulaire : il reste seul.
const finCleCabinet = (entite) => finCle(entite).replace(/^cabinet (du|de la|de l) ?/, '')
  .replace(/\bcheffe\b/g, 'chef').replace(/\bvice presidente\b/g, 'vice president').replace(/\bpresidente\b/g, 'president');
// « D'une année à l'autre » : les postes principaux d'un rapport, période par période.
function finEvolution(r, isEn){
  const h = _finHist && _finHist.rapports[`${finCle(r.nom)}|${finCle(r.entite)}`];
  const annees = h ? Object.keys(h.annees).sort() : [];
  if(annees.length < 2) return '';
  const postes = [];
  for(const l of r.lignes) if(l.niveau === 0 && !postes.includes(l.libelle)) postes.push(l.libelle);
  for(const a of annees) for(const lib of Object.keys(h.annees[a])) if(!postes.includes(lib) && !r.lignes.some(l => l.libelle === lib && l.niveau > 0)) postes.push(lib);
  const cellule = (a, lib) => h.annees[a][lib] == null ? '<td class="fin-rien">—</td>' : `<td>${finArgent(h.annees[a][lib])}</td>`;
  return `<div class="fin-evol">
    <h4>${isEn ? 'From one year to the next' : 'D’une année à l’autre'}</h4>
    <div class="fin-evol-defile"><table class="fin-table fin-table-evol">
      <tr><th></th>${annees.map(a => `<th>${a}</th>`).join('')}</tr>
      ${postes.map(lib => `<tr><td>${lib}</td>${annees.map(a => cellule(a, lib)).join('')}</tr>`).join('')}
    </table></div>
    <p class="fin-note">${isEn ? 'Amounts rounded to the dollar, as published in each disclosure. A dash: this line does not appear in that year’s report, or there is no report under this name. The Assembly has renamed some lines over the years: the site keeps each name as published, without merging them.' : 'Montants arrondis au dollar, tels que publiés dans chaque divulgation. Un tiret : ce poste n’apparaît pas dans le rapport de cette année-là, ou il n’y a pas de rapport à ce nom. L’Assemblée a renommé certains postes au fil des ans : le site garde chaque nom tel que publié, sans les fusionner.'}</p>
  </div>`;
}
// « Le cabinet au complet » : quand plusieurs personnes ont un rapport pour le même cabinet, la
// somme de leurs postes principaux. C'est le SEUL calcul du site sur ces données, il porte sur des
// postes de même nature, et il est étiqueté comme tel.
function finCabinetComplet(r, isEn){
  if(r.type !== 'cabinet') return '';
  const k = finCleCabinet(r.entite);
  const tous = _finances.depenses.rapports.filter(x => x.type === 'cabinet' && finCleCabinet(x.entite) === k);
  if(tous.length < 2) return '';
  const postes = [];
  for(const x of tous) for(const l of x.lignes) if(l.niveau === 0 && !postes.includes(l.libelle)) postes.push(l.libelle);
  const de = (x, lib) => (x.lignes.find(l => l.niveau === 0 && l.libelle === lib) || {}).montant;
  return `<div class="fin-evol">
    <h4>${isEn ? 'The whole office this year' : 'Le cabinet au complet cette année'}</h4>
    <div class="fin-evol-defile"><table class="fin-table fin-table-evol">
      <tr><th></th>${tous.map(x => `<th>${x.nom}</th>`).join('')}<th>${isEn ? 'Added up' : 'Additionné'}</th></tr>
      ${postes.map(lib => `<tr><td>${lib}</td>${tous.map(x => de(x, lib) == null ? '<td class="fin-rien">—</td>' : `<td>${finArgent(de(x, lib))}</td>`).join('')}<td class="fin-somme">${finArgent(tous.reduce((s, x) => s + (de(x, lib) || 0), 0))}</td></tr>`).join('')}
    </table></div>
    <p class="fin-note">${isEn
      ? `The Assembly publishes ${tous.length} reports for this office in ${_finances.depenses.periode}, one per person named. The last column is added up by the site, line by line; the Assembly does not publish it.`
      : `L’Assemblée publie ${tous.length} rapports pour ce cabinet en ${_finances.depenses.periode}, un par personne nommée. La dernière colonne est additionnée par le site, poste par poste ; l’Assemblée ne la publie pas.`}</p>
  </div>`;
}
const finCle = (s) => norm(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim();
const finArgent = (n, cents) => Number(n).toLocaleString(currentLang === 'en' ? 'en-CA' : 'fr-CA',
  { style:'currency', currency:'CAD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
// Les rapports de dépenses d'une personne : ceux à son nom, et celui de sa circonscription quand
// l'Assemblée écrit son nom un peu autrement (« Brigitte Garceau » / « Brigitte B. Garceau »).
function finRapportsDe(nom, circ){
  if(!_finances) return [];
  const k = finCle(nom), dernier = k.split(' ').pop();
  return _finances.depenses.rapports.filter(r => r.type !== 'vacant' && (finCle(r.nom) === k
    || (r.type === 'depute' && circ && finCle(r.entite) === finCle(circ) && finCle(r.nom).split(' ').pop() === dernier)));
}
// L'indemnité additionnelle qu'on peut rattacher SANS deviner : celle d'un·e ministre en poste.
function finFonctionDe(nom){
  const m = ministers.find(x => x.name === nom);
  if(!m || !_finances) return null;
  const pm = /^premi[eè]re? ministre/i.test(m.role || '');
  const f = _finances.bareme.fonctions.find(x => pm ? /^Premi[èe]re ou premier ministre/i.test(x.fonction) : /^Ministre\b/i.test(x.fonction));
  return f ? { ...f, role: m.role, roleEn: m.roleEn } : null;
}
function renderFinancesSelect(){
  const sel = document.getElementById('financesSelect');
  if(!sel) return;
  const isEn = currentLang === 'en';
  const garde = sel.value;
  const noms = new Map();   // clé normalisée → nom affiché
  for(const d of deputes) noms.set(finCle(d.name), d.name);
  for(const m of ministers) if(!noms.has(finCle(m.name))) noms.set(finCle(m.name), m.name);
  if(_finances) for(const r of _finances.depenses.rapports){
    if(r.type === 'vacant') continue;
    const k = finCle(r.nom);
    // Un rapport au nom légèrement différent de celui de la liste des député·e·s : on ne double pas.
    if(!noms.has(k) && ![...noms.keys()].some(x => x.split(' ').pop() === k.split(' ').pop() && deputes.some(d => finCle(d.name) === x && r.type === 'depute' && finCle(d.riding) === finCle(r.entite)))) noms.set(k, r.nom);
  }
  const tri = [...noms.values()].sort((a, b) => a.split(' ').pop().localeCompare(b.split(' ').pop(), 'fr'));
  sel.innerHTML = `<option value="">${isEn ? 'Choose a person…' : 'Choisir une personne…'}</option>`
    + tri.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
  sel.setAttribute('aria-label', isEn ? 'Choose an MLA' : 'Choisir un·e député·e');
  const haut = document.getElementById('financesHaut');
  if(haut){ const e = isEn ? 'Back to the ministers' : 'Revenir aux ministres'; haut.title = e; haut.setAttribute('aria-label', e); }
  if(garde && tri.includes(garde)) sel.value = garde;
}
function renderFinances(){
  const boite = document.getElementById('financesTable');
  const sel = document.getElementById('financesSelect');
  if(!boite || !sel) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  const nom = sel.value;
  if(!_finances){
    boite.innerHTML = `<div class="fin-vide">${isEn ? 'Loading the Assembly’s figures…' : 'Chargement des chiffres de l’Assemblée…'}</div>`;
    chargerFinances().then(d => { renderFinancesSelect(); if(d) renderFinances(); else boite.innerHTML = `<div class="fin-vide">${isEn ? 'The figures could not be loaded. Try again later.' : 'Les chiffres n’ont pas pu être chargés. Réessayez plus tard.'}</div>`; });
    return;
  }
  const F = _finances, B = F.bareme;
  if(!nom){
    boite.innerHTML = `<div class="fin-vide">${isEn
      ? 'Pick a name above, or press the <b>$</b> button on any card.'
      : 'Choisissez un nom ci-dessus, ou touchez le bouton <b>$</b> d’une fiche.'}</div>`;
    return;
  }
  const dep = deputes.find(d => d.name === nom);
  const rapports = finRapportsDe(nom, dep && dep.riding);
  const circ = (dep && dep.riding) || (rapports.find(r => r.type === 'depute') || {}).entite || null;
  const groupe = circ ? F.groupes[Object.keys(F.groupes).find(g => finCle(g) === finCle(circ))] : null;
  const fonction = finFonctionDe(nom);
  const src = (url, texte) => `<a href="${url}" target="_blank" rel="noopener">${texte} ↗</a>`;
  const ligne = (lib, val, cls) => `<tr class="${cls || ''}"><td>${lib}</td><td>${val}</td></tr>`;

  // 1. Ce que la personne gagne (barème).
  const gagne = `<section class="fin-bloc">
    <h3>${isEn ? 'What this person earns' : 'Ce que cette personne gagne'}</h3>
    <table class="fin-table">
      ${ligne(isEn ? 'Basic annual indemnity' : 'Indemnité annuelle de base', finArgent(B.base))}
      ${fonction ? ligne(`${isEn ? 'Additional indemnity' : 'Indemnité additionnelle'} — ${isEn ? (fonction.roleEn || fonction.role) : fonction.role} (${fonction.pourcentage})`, finArgent(fonction.additionnelle)) : ''}
      ${fonction ? ligne(isEn ? 'Total, as shown by the Assembly' : 'Total, tel qu’affiché par l’Assemblée', finArgent(fonction.total), 'fin-total') : ''}
    </table>
    <p class="fin-note">${fonction
      ? (isEn ? 'Worked out from the function: the Assembly publishes a scale by function, not a pay slip per person.' : 'Déduit de la fonction : l’Assemblée publie un barème par fonction, pas une paie par personne.')
      : (isEn ? 'A parliamentary function (whip, House leader, committee chair, parliamentary assistant…) adds an indemnity. The site only attaches it when the function is certain: see the scale.' : 'Une fonction parlementaire (whip, leader, présidence de commission, adjoint·e parlementaire…) ajoute une indemnité. Le site ne la rattache que lorsque la fonction est certaine : voir le barème.')}
      ${isEn ? 'Scale in force since' : 'Barème en vigueur depuis le'} ${B.depuis}. ${src(B.source, isEn ? 'National Assembly, indemnities and allowances' : 'Assemblée nationale, indemnités et allocations')}</p>
  </section>`;

  // 2. Ce qui est alloué à sa circonscription (barème, selon le groupe).
  const alloue = groupe ? `<section class="fin-bloc">
    <h3>${isEn ? 'What is allocated to the riding' : 'Ce qui est alloué à sa circonscription'}</h3>
    <table class="fin-table">
      ${B.allocations.filter(a => a.parGroupe[groupe] != null).map(a => ligne(a.libelle, finArgent(a.parGroupe[groupe]))).join('')}
    </table>
    <p class="fin-note">${circ}, ${isEn ? 'group' : 'groupe'} ${groupe} ${isEn ? '(ridings are grouped by area, 1 to 5). Annual amounts from the scale: a ceiling, not a spending. This scale has been in force since ' + B.depuis + ', while the reported expenses cover ' + F.depenses.periode + ': the two cannot be compared line by line.' : '(les circonscriptions sont groupées selon leur superficie, de 1 à 5). Montants annuels du barème : un plafond, pas une dépense. Ce barème est en vigueur depuis le ' + B.depuis + ', alors que les dépenses déclarées portent sur ' + F.depenses.periode + ' : les deux ne se comparent pas ligne à ligne.'} ${src(B.source, isEn ? 'National Assembly' : 'Assemblée nationale')}</p>
  </section>` : '';

  // 3. Ce qu'elle a déclaré avoir dépensé (ses rapports).
  const TYPE = isEn ? { depute:'Riding', cabinet:'Office (cabinet)', recherche:'Research service' } : { depute:'Circonscription', cabinet:'Cabinet', recherche:'Service de recherche' };
  const depense = rapports.length ? rapports.map(r => { const plus = finCabinetComplet(r, isEn) + finEvolution(r, isEn); return `<section class="fin-bloc${plus ? ' fin-bloc-large' : ''}"><div class="fin-col">
    <h3>${isEn ? 'What was reported as spent' : 'Ce qui a été déclaré comme dépensé'} <span class="fin-tag">${TYPE[r.type]}</span></h3>
    <p class="fin-entite">${r.entite}</p>
    <table class="fin-table">
      ${r.lignes.map(l => ligne(l.libelle + (l.note ? ` <span class="fin-petit">· ${l.note}</span>` : ''), finArgent(l.montant, true), 'fin-n' + l.niveau)).join('')}
    </table>
    <p class="fin-note">${isEn ? 'Expense report' : 'Rapport de dépenses'} ${F.depenses.periode}, ${isEn ? 'amounts as published' : 'montants tels que publiés'}${r.type !== 'depute' ? (isEn ? '. The Assembly puts this report under this person’s name; several people can be named for the same office in one year' : '. L’Assemblée place ce rapport sous le nom de cette personne ; plusieurs personnes peuvent être nommées pour un même cabinet dans l’année') : ''}. ${isEn ? 'Line names are shown in French, as published. ' : ''}${src(F.depenses.source, isEn ? 'National Assembly, expense reports' : 'Assemblée nationale, rapports de dépenses')}</p>
    </div>${plus ? `<div class="fin-col fin-col-plus">${plus}</div>` : ''}
  </section>`; }).join('') : `<section class="fin-bloc"><h3>${isEn ? 'What was reported as spent' : 'Ce qui a été déclaré comme dépensé'}</h3>
    <p class="fin-note">${isEn ? `No expense report under this name in the Assembly’s ${F.depenses.periode} disclosure.` : `Aucun rapport de dépenses à ce nom dans la divulgation ${F.depenses.periode} de l’Assemblée.`}</p></section>`;

  boite.innerHTML = `<div class="fin-tete"><b>${nom}</b>${circ ? ` · ${circ}` : ''}</div><div class="fin-grille">${gagne}${alloue}${depense}</div>${finLegende(isEn)}`;
}
// LA LÉGENDE du tableau (Martin, 6 oct. 2026 : « s'il y a des précisions comme ça, du cas par cas,
// hésite pas à rajouter une légende pour que l'utilisateur comprenne »). Toutes les précisions qui
// évitent une mauvaise lecture, réunies au même endroit, sous le tableau. À TENIR À JOUR : chaque
// cas particulier découvert dans ces données s'ajoute ici, pas seulement dans une note de code.
function finLegende(isEn){
  const F = _finances, B = F.bareme;
  const vacants = F.depenses.rapports.filter(r => r.type === 'vacant').map(r => r.entite.replace(/\s*-\s*Vacant$/i, ''));
  const annees = _finHist ? Object.values(_finHist.documents).map(d => d.periode).sort() : [];
  const P = isEn ? [
    ['What this person earns', `The Assembly publishes a scale by function, not a pay slip per person. The site shows the basic indemnity for everyone and adds the indemnity for a function only for ministers, the one function it knows for certain. For a whip, a House leader, a committee chair or a parliamentary assistant, only the basic indemnity is shown: see the Assembly’s scale for theirs.`],
    ['What is allocated', `Annual ceilings, not amounts spent. They depend on the riding’s group, from 1 to 5, set by its area: a very large riding gets more for travel. This scale has been in force since ${B.depuis}; the expenses shown cover ${F.depenses.periode}. The two are not from the same year and cannot be compared line by line.`],
    ['What was reported as spent', `Amounts copied as published in the Assembly’s expense report. The site gives no grand total: the Assembly gives none, and adding up a rent and a payroll means nothing.`],
    ['A line at $0', `The report says $0 and gives no reason. The site does not guess it: to know it, one has to ask the Assembly.`],
    ['Office and research service', `The Assembly files these reports under a person’s name. When several people are named for the same office in the same year, “The whole office” puts them side by side. Its last column, in yellow, is added up by the site line by line: it is the only calculation the site makes on these figures, and the Assembly does not publish it.`],
    ['From one year to the next', `${annees.length} disclosures are online at the Assembly${annees.length ? ` (${annees[0]} to ${annees[annees.length - 1]})` : ''}. A dash means the line does not appear that year, or there is no report under this name. The Assembly has renamed some lines over time: the site keeps each name as published and does not merge them. For an office, the history follows the person, not the office.`],
    ...(vacants.length ? [['Vacant ridings', `${vacants.join(' and ')} are listed as “vacant” in the Assembly’s report. Their report carries the name of the person who administered the riding: the site does not put it under that person’s name.`]] : []),
    ['No ranking', `The amounts depend on the area of the riding, local rents and the distance from Québec City. The site shows them and does not rank anyone.`],
  ] : [
    ['Ce que cette personne gagne', `L’Assemblée publie un barème par fonction, pas une paie par personne. Le site affiche l’indemnité de base pour tout le monde et n’ajoute l’indemnité de fonction que pour les ministres, la seule fonction qu’il connaît avec certitude. Pour un·e whip, un·e leader, une présidence de commission ou un·e adjoint·e parlementaire, seule l’indemnité de base est affichée : voir le barème de l’Assemblée pour la leur.`],
    ['Ce qui est alloué', `Des plafonds annuels, pas des montants dépensés. Ils dépendent du groupe de la circonscription, de 1 à 5, fixé selon sa superficie : une très grande circonscription reçoit davantage pour les déplacements. Ce barème est en vigueur depuis le ${B.depuis} ; les dépenses affichées portent sur ${F.depenses.periode}. Les deux ne sont pas de la même année et ne se comparent pas ligne à ligne.`],
    ['Ce qui a été déclaré comme dépensé', `Les montants sont recopiés tels que publiés dans le rapport de dépenses de l’Assemblée. Le site ne donne aucun grand total : l’Assemblée n’en donne pas, et additionner un loyer et une masse salariale ne veut rien dire.`],
    ['Une ligne à 0 $', `Le rapport indique 0 $ et n’en donne pas la raison. Le site ne la devine pas : pour la connaître, il faut la demander à l’Assemblée.`],
    ['Cabinet et service de recherche', `L’Assemblée place ces rapports sous le nom d’une personne. Quand plusieurs personnes sont nommées pour le même cabinet la même année, « Le cabinet au complet » les met côte à côte. Sa dernière colonne, en jaune, est additionnée par le site poste par poste : c’est le seul calcul que le site fait sur ces chiffres, et l’Assemblée ne le publie pas.`],
    ['D’une année à l’autre', `${annees.length} divulgations sont en ligne à l’Assemblée${annees.length ? ` (${annees[0]} à ${annees[annees.length - 1]})` : ''}. Un tiret veut dire que le poste n’apparaît pas cette année-là, ou qu’il n’y a pas de rapport à ce nom. L’Assemblée a renommé certains postes au fil des ans : le site garde chaque nom tel que publié et ne les fusionne pas. Pour un cabinet, l’historique suit la personne, pas le cabinet.`],
    ...(vacants.length ? [['Circonscriptions vacantes', `${vacants.join(' et ')} figurent comme « vacantes » dans le rapport de l’Assemblée. Leur rapport porte le nom de la personne qui administrait la circonscription : le site ne le range pas sous le nom de cette personne.`]] : []),
    ['Aucun classement', `Les montants dépendent de la superficie de la circonscription, du prix des loyers et de la distance de Québec. Le site les montre et ne classe personne.`],
  ];
  return `<details class="fin-legende" open>
    <summary>${isEn ? 'How to read this table' : 'Comment lire ce tableau'}</summary>
    <dl>${P.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>
  </details>`;
}
// Le bouton « $ » d'une fiche : choisit la personne et amène au tableau.
function voirFinances(nom){
  const sel = document.getElementById('financesSelect');
  if(!sel) return;
  const poser = () => {
    if(![...sel.options].some(o => o.value === nom)) sel.add(new Option(nom, nom));
    sel.value = nom;
    renderFinances();
    document.getElementById('band-finances')?.scrollIntoView({ behavior:'smooth', block:'start' });
  };
  if(_finances) poser(); else { renderFinances(); chargerFinances().then(() => { renderFinancesSelect(); poser(); }); }
}
// La flèche à côté du menu : remonte au titre « Les ministres », ou à celui de la vue classée par
// présence quand c'est elle qui est affichée (« Les ministres » est alors caché).
function retourMinistres(){
  const titre = document.getElementById('ministresTitle');
  const cible = titre && titre.offsetParent ? titre : (document.getElementById('combinedTitle') || titre);
  if(cible) cible.scrollIntoView({ behavior:'smooth', block:'start' });
}
window.retourMinistres = retourMinistres;
window.renderFinances = renderFinances;
window.voirFinances = voirFinances;
// Partager la fiche d'un·e élu·e (22 oct. 2026) : l'icône à gauche du bouton $ copie d'un clic
// un court résumé de la fiche (rôle, circonscription, parti, présence aux votes,
// projets de loi parrainés) et le lien rouvre la page Ministres avec ce nom dans la recherche.
const ICONE_PARTAGE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="18" cy="5" r="3.2"/><circle cx="6" cy="12" r="3.2"/><circle cx="18" cy="19" r="3.2"/><path d="M8.6 10.7l6.8-3.9 1 1.7-6.8 3.9zM8.6 13.3l1-1.7 6.8 3.9-1 1.7z"/></svg>';
const partageBouton = (nom) => `<span class="part-elu"><button class="part-btn" type="button" title="${currentLang === 'en' ? 'Share' : 'Partager'}" aria-label="${currentLang === 'en' ? 'Share the profile of' : 'Partager la fiche de'} ${nom.replace(/"/g, '&quot;')}" onclick="ouvrirPartageElu(this, '${nom.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">${ICONE_PARTAGE}</button></span>`;
function resumeElu(nom, isEn){
  const dep = resolveDepute(nom);
  const ministre = ministers.find((m) => m.name === nom);
  const role = ministre ? (isEn ? (ministre.roleEn || ministre.role) : ministre.role) : (isEn ? 'MLA' : 'Député·e');
  const att = dep ? attendanceForAssnatId(dep.assnatId) : null;
  const parraines = billsSponsoredBy(nom);
  const pl = parraines.length;
  const lois = parraines.filter((b) => b.status === 'sanctionne').length;
  // Ancienneté (Martin, 22 oct. 2026) : moins d'un an, ou au moins N ans, comptée depuis le premier vote
  // nominal enregistré (le registre commence à la 43e législature, d'où « au moins »).
  const depuis = att?.depuis ? new Date(att.depuis + 'T12:00:00') : null;
  const ans = depuis ? Math.floor((Date.now() - depuis) / (365.25 * 864e5)) : null;
  const anciennete = ans !== null
    ? (ans < 1 ? (isEn ? 'MLA for less than a year' : 'Député·e depuis moins d’un an')
      : (isEn ? `MLA for at least ${ans} year${ans > 1 ? 's' : ''}` : `Député·e depuis au moins ${ans} an${ans > 1 ? 's' : ''}`))
    : (dep ? (isEn ? 'Newly elected on October 5, 2026' : 'Élu·e le 5 octobre 2026') : '');
  const morceaux = [
    ministre ? `${nom}, ${role},` : `${nom},`,
    dep ? (isEn ? `MLA for ${dep.riding}` : `député·e de ${dep.riding}`) : '',
    (ministre?.party || dep?.party) ? `(${ministre?.party || dep.party})` : '',
  ].filter(Boolean).join(' ');
  const faits = [
    att ? (isEn ? `Recorded-vote attendance: ${att.rate}%` : `Présence aux votes : ${att.rate} %`) : '',
    isEn ? `Bills sponsored: ${pl}${lois ? `, ${lois} became law` : ''}` : `Projets de loi parrainés : ${pl}${lois ? `, dont ${lois} devenus lois` : ''}`,
    // Le mandat (Martin, 23 oct. 2026), lu sur la fiche de l'Assemblée : « 3e mandat ». Sans ce
    // chiffre, l'ancienneté tirée des votes.
    dep?.mandats ? (isEn ? `${dep.mandats}${({ 1: 'st', 2: 'nd', 3: 'rd' })[dep.mandats] || 'th'} term` : `${dep.mandats === 1 ? '1er' : dep.mandats + 'e'} mandat`) : anciennete,
  ].filter(Boolean).join(' · ');
  return `${morceaux}. ${faits}.`;
}
// Un lien lisible à partager (Martin, 26 oct. 2026) : « Pascal Bérubé » → « pascal-berube ».
const slugElu = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Un clic copie le résumé et le lien, sans menu (Martin, 22 oct. 2026) ; ✓ le confirme.
function ouvrirPartageElu(bouton, nom){
  const isEn = currentLang === 'en';
  const lien = `https://dossierbc.ca/ministres?elu=${slugElu(nom)}${isEn ? '&lang=en' : ''}`;
  const texte = `${resumeElu(nom, isEn)} ${lien}`;
  const fait = () => {
    const avant = bouton.innerHTML;
    bouton.textContent = '✓';
    bouton.title = isEn ? 'Copied' : 'Copié';
    setTimeout(() => { bouton.innerHTML = avant; bouton.title = isEn ? 'Share' : 'Partager'; }, 1500);
  };
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject()).then(fait).catch(() => window.prompt(isEn ? 'Copy:' : 'Copiez :', texte));
}
function copierPartageElu(b){
  const isEn = currentLang === 'en';
  const fait = () => { b.textContent = '✓ ' + (isEn ? 'Copied' : 'Copié'); setTimeout(() => b.closest('.part-menu')?.remove(), 900); };
  (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.texte) : Promise.reject()).then(fait).catch(() => window.prompt(isEn ? 'Copy:' : 'Copiez :', b.dataset.texte));
}
document.addEventListener('click', (e) => { if(!e.target.closest('.part-elu')) document.querySelectorAll('.part-menu').forEach((m) => m.remove()); });
window.ouvrirPartageElu = ouvrirPartageElu;
window.copierPartageElu = copierPartageElu;
// Le lien partagé : /ministres?elu=Nom remplit la recherche une fois les données arrivées.
document.addEventListener('DOMContentLoaded', () => {
  const demande = new URLSearchParams(location.search).get('elu');
  if(!demande) return;
  let nom = demande;
  let essais = 0;
  const remplir = () => {
    const champ = document.getElementById('searchMinistres');
    if(champ && ministers.length){
      // Lien lisible (?elu=pascal-berube) : retrouver le vrai nom ; un ancien lien avec le nom complet marche encore.
      const vrai = [...ministers.map((m) => m.name), ...deputes.map((d) => d.name)].find((n) => slugElu(n) === slugElu(demande));
      if(vrai) nom = vrai.replace(/\s*\([^)]*\)\s*$/, '');
      champ.value = nom; champ.dispatchEvent(new Event('input', { bubbles: true })); champ.scrollIntoView({ block: 'center' });
      // Un seul résultat : descendre jusqu'à sa carte (lien des fiches d'anciens ministres, 4 nov. 2026).
      setTimeout(() => { const seul = document.querySelectorAll('.search-retour-nom'); if(seul.length === 1) seul[0].click(); }, 300);
      return; }
    if(++essais < 40) setTimeout(remplir, 250);
  };
  remplir();
});
// Les partis disparus de l'Assemblée (22 oct. 2026, Martin) : dans la grille des ministres, leur
// pastille devient un jeu d'arcade. La première carte est Pac-Girl, les autres un chemin de points
// qu'elle va manger, saupoudré de fantômes et de fruits. Le parti et son sort au survol (et pour les
// lecteurs d'écran). Dessins pixel maison. Un parti dissous s'ajoute ici avec sa phrase.
const PARTIS_DISPARUS = {};   // N.-B. : aucun parti disparu de l'Assemblée
const SPRITES = {
  // . vide, 1 couleur principale, 2 blanc, 3 bleu foncé (yeux), 4 rose, 5 vert, 6 rouge, 7 noir
  // Pac-Girl en 16 × 16 (Martin, 22 oct. 2026) : boucle rouge, yeux à cils, lèvres rouges, bouche vers la droite.
  pacgirl: ['................','.66..66.1111....','.6666661111111..','..666611111111..','.66116611771711.','...1111177177116','..111111771111..','.1111111111.....','.111111111......','.1111111111.....','.11111111111....','..1111111111116.','..111111111111..','...1111111111...','.....111111.....','................'],
  point:   ['..............','..............','..............','..............','..............','.....1111.....','....111111....','....111111....','.....1111.....','..............','..............','..............','..............','..............'],
  fantome: ['.....1111.....','...11111111...','..1111111111..','.111111111111.','.112211112211.','11222211222211','11223311223311','11223311223311','11122111122111','11111111111111','11111111111111','11111111111111','11.111..111.11','1...11..11...1'],
  cerise:  ['..........5...','.........55...','........5.5...','.......5..5...','......5...5...','.....5....5...','....5.....5...','..666.....666.','.66626...66626','.66666...66666','.66666...66666','..666.....666.','..............','..............'],
  // Fantôme apeuré (8 = yeux et bouche) : bleu à yeux pâles, ou blanc à yeux rouges quand il clignote.
  apeure:  ['.....1111.....','...11111111...','..1111111111..','.111111111111.','.111111111111.','.111881188111.','.111881188111.','.111111111111.','11111111111111','11811881188111','18118118118181','11111111111111','11.111..111.11','1...11..11...1'],
  fraise:  ['.....5555.....','....555555....','..6666666666..','.666626666266.','.666666666666.','.662666626666.','.666666666666.','..6662666266..','..6666666666..','...66666666...','....666666....','.....6666.....','......66......','..............'],
};
const COULEURS = { pacgirl: '#FFD600', point: '#FFC107', cerise: '#E53935', fraise: '#E53935' };
const COULEURS_FANTOMES = ['#00BCD4', '#F58220', '#E53935', '#EC407A'];
function spriteSvg(nom, couleur, accent = '#FFCCBC'){
  const pal = { '8': accent, '1': couleur, '2': '#fff', '3': '#1a237e', '4': '#EC407A', '5': '#2E7D32', '6': '#E53935', '7': '#131313' };
  let rects = '';
  SPRITES[nom].forEach((ligne, y) => [...ligne].forEach((c, x) => { if(c !== '.') rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[c]}"/>`; }));
  const n = SPRITES[nom].length;
  return `<svg viewBox="0 0 ${n} ${n}" width="26" height="26" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
// Le rôle de chaque carte selon sa place dans la liste : 1re = Pac-Girl ; ensuite surtout des points,
// avec un fantôme ou un fruit environ une carte sur quatre (tiré au hasard à chaque affichage).
// Toujours un point entre deux autres icônes (Martin) : le plan est tiré une fois par chargement.
// Deux fantômes apeurés à des ministres précis (Martin, 22 oct. 2026) : le bleu à Mathieu Lévesque,
// le blanc à Daniel Bernard. Leurs voisins restent des points, comme pour les autres icônes.
const FANTOMES_FIXES = {
  'Mathieu Lévesque': () => spriteSvg('apeure', '#2196F3', '#FFCCBC'),
  'Daniel Bernard': () => spriteSvg('apeure', '#F5F5F5', '#E53935'),
};
// Pac-Girl en dessin lisse (Martin, 22 oct. 2026 : « meilleure déf ») : tête jaune bouche vers la
// droite, boucle rouge, un œil rond, contour noir épais. Dessin maison.
const PACGIRL_SVG = '<svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">'
  + '<path d="M90 34 A42 42 0 1 0 90 74 L54 54 Z" fill="#FFE600" stroke="#111" stroke-width="7" stroke-linejoin="round"/>'
  + '<circle cx="58" cy="34" r="7" fill="#111"/>'
  + '<path d="M30 22 L6 8 Q0 24 8 38 Z M30 22 L48 0 Q60 10 56 26 Z" fill="#E53935" stroke="#111" stroke-width="3" stroke-linejoin="round"/>'
  + '<circle cx="30" cy="22" r="7" fill="#E53935" stroke="#111" stroke-width="3"/></svg>';
let _planArcade = null;
function planArcade(){
  if(_planArcade && _planArcade.length === ministers.length) return _planArcade;
  // Un fantôme ou un fruit a un point en haut, en bas, à gauche et à droite (Martin) : dans la grille
  // réelle (colonnes lues sur la page, 3 par défaut), aucune autre icône n'est sa voisine.
  const grille = document.getElementById('ministresGrid');
  const cols = Math.max(1, (grille ? getComputedStyle(grille).gridTemplateColumns.split(' ').filter(Boolean).length : 3) || 3);
  _planArcade = ministers.map(() => null);
  const icone = (j) => j >= 0 && _planArcade[j] && _planArcade[j] !== 'point';
  _planArcade.forEach((_, i) => {
    if(i === 0) { _planArcade[i] = PACGIRL_SVG; return; }
    if(FANTOMES_FIXES[ministers[i].name]) { _planArcade[i] = FANTOMES_FIXES[ministers[i].name](); return; }
    const voisinFixe = (j) => j < ministers.length && FANTOMES_FIXES[ministers[j]?.name];
    if((i % cols !== cols - 1 && voisinFixe(i + 1)) || voisinFixe(i + cols)) { _planArcade[i] = 'point'; return; }
    const voisinGauche = i % cols !== 0 && icone(i - 1);
    const voisinHaut = icone(i - cols);
    const r = Math.random();
    if(!voisinGauche && !voisinHaut && r < 0.4){
      const t = Math.random();
      _planArcade[i] = t < 0.55 ? spriteSvg('fantome', COULEURS_FANTOMES[Math.floor(Math.random() * 4)]) : t < 0.8 ? spriteSvg('cerise', COULEURS.cerise) : spriteSvg('fraise', COULEURS.fraise);
    } else _planArcade[i] = 'point';
  });
  return _planArcade;
}
function spritePourMinistre(nom){
  const i = ministers.findIndex((m) => m.name === nom);
  const choix = i >= 0 ? planArcade()[i] : 'point';
  return choix === 'point' ? spriteSvg('point', COULEURS.point) : choix;
}
function pastilleMinistre(party, nom, styleCouleur){
  const disparu = PARTIS_DISPARUS[party];
  if(!disparu) return `<span class="depute-party" style="${styleCouleur}">${party}</span>`;
  const titre = `${party} — ${currentLang === 'en' ? disparu.en : disparu.fr}`.replace(/"/g, '&quot;');
  return `<span class="depute-party parti-arcade" title="${titre}" role="img" aria-label="${titre}">${spritePourMinistre(nom)}</span>`;
}
// Le « W » à côté du $ (Martin, 23 oct. 2026) : la page Wikipédia de la personne, quand une page sûre
// existe (scrapers/wikipedia.js) ; sinon rien. Wikipédia raconte le parcours que l'Assemblée n'explique pas.
const wikiBouton = (nom) => { const w = resolveDepute(nom)?.wiki; return w ? `<a class="wiki-btn" href="${w}" target="_blank" rel="noopener" title="Wikipédia" aria-label="${currentLang === 'en' ? 'Wikipedia page of' : 'Page Wikipédia de'} ${nom.replace(/"/g, '&quot;')}">W</a>` : ''; };
// N.-B. (Martin, 7 nov. 2026) : pas de finances au N.-B. pour l'instant, donc pas de bouton « $ ».
const finBouton = () => '';
const finBoutonDQ = (nom) => `<button class="fin-btn" type="button" title="${currentLang === 'en' ? 'Public finances' : 'Finances publiques'}" aria-label="${currentLang === 'en' ? 'Public finances of' : 'Finances publiques de'} ${nom.replace(/"/g, '&quot;')}" onclick="voirFinances('${nom.replace(/'/g, "\\'")}')">$</button>`;

/* ---------------- COMPTES (Supabase) ---------------- */
// Auth par lien magique (courriel) — voir scripts/supabase-schema.sql pour la
// table `bc_follows` et ses règles de sécurité (chaque compte ne voit que ses
// propres suivis). Tant que personne n'est connecté, le suivi reste dans
// localStorage comme avant (comportement inchangé pour les visiteurs anonymes).
const supabaseClient = supabase.createClient(
  'https://wfgcqftgtmptfutrbujz.supabase.co',
  'sb_publishable_CutVYEz29QYUV3tCDsAhSQ_RvZUQ3G6'
);
let currentUser = null;

async function upsertFollow(personType, personKey, isFollowed){
  if(!currentUser) return;
  // Supabase ne "throw" pas pour une erreur de requête (RLS refusée, etc.) —
  // elle revient dans `error` sur la réponse normale. Le try/catch seul ne
  // suffit donc pas : il faut vérifier `error` explicitement, sinon un échec
  // silencieux laisse croire que le suivi a été enregistré alors que non.
  try{
    let error;
    if(isFollowed){
      ({ error } = await supabaseClient.from('bc_follows').upsert(
        { user_id: currentUser.id, person_type: personType, person_key: personKey },
        { onConflict: 'user_id,person_type,person_key' }
      ));
    } else {
      ({ error } = await supabaseClient.from('bc_follows').delete()
        .eq('user_id', currentUser.id).eq('person_type', personType).eq('person_key', personKey));
    }
    if(error) console.error('Supabase follow sync error:', error);
  }catch(e){ console.error('Supabase follow sync failed:', e); }
}

async function loadFollowsFromSupabase(){
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('bc_follows')
    .select('person_type, person_key').eq('user_id', currentUser.id);
  if(error){ console.error(error); return; }
  followed = {};
  followedDeputes = {};
  for(const row of (data || [])){
    if(row.person_type === 'minister') followed[row.person_key] = true;
    else if(row.person_type === 'depute') followedDeputes[row.person_key] = true;
  }
}

// Projets de loi pour lesquels CE compte a demandé une explication (bc_bill_flags).
// La RLS n'autorise chaque personne à voir que ses propres lignes — donc ceci ne
// révèle rien sur les autres. Alimente l'état « déjà demandé » du bouton par carte.
let myFlaggedBills = {};
async function loadMyFlagsFromSupabase(){
  myFlaggedBills = {};
  if(!currentUser) return;
  const { data, error } = await supabaseClient.from('bc_bill_flags')
    .select('bill_id').eq('user_id', currentUser.id);
  if(error){ console.error('loadMyFlagsFromSupabase failed:', error); return; }
  for(const row of (data || [])) myFlaggedBills[row.bill_id] = true;
}

// Demande une explication sur un projet de loi (bouton par carte, 3 états).
// Réutilise la table bc_bill_flags : RLS + limite mensuelle inchangées, l'insert
// reste réservé au rôle authenticated avec auth.uid() = user_id. Un doublon
// (23505 = déjà demandé) est traité comme un succès.
async function requestExplanation(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  if(btn) btn.disabled = true;

  // 1) Vérifie que la session est ENCORE valide côté serveur (le jeton peut
  //    avoir expiré même si currentUser est encore en mémoire). C'est la cause
  //    la plus fréquente du faux message « limite mensuelle ».
  const { data: fresh, error: authErr } = await supabaseClient.auth.getUser();
  if(authErr || !fresh || !fresh.user){
    if(btn) btn.disabled = false;
    alert(isEn ? 'Your session has expired — please sign in again.' : 'Votre session a expiré — reconnectez-vous.');
    goToAccount();
    return;
  }
  const uid = fresh.user.id;

  const { error } = await supabaseClient.from('bc_bill_flags').insert({ user_id: uid, bill_id: billId });
  if(error && error.code !== '23505'){
    console.error('requestExplanation insert error:', error);
    if(btn) btn.disabled = false;
    // 2) Distingue la VRAIE limite (≥10 en 30 jours) des autres erreurs :
    //    on compte les demandes récentes de la personne (RLS : ne voit que
    //    les siennes) au lieu de supposer que c'est toujours la limite.
    let atLimit = false;
    try{
      const since = new Date(Date.now() - 30*864e5).toISOString();
      const { count } = await supabaseClient.from('bc_bill_flags')
        .select('*', { count: 'exact', head: true }).gte('created_at', since);
      atLimit = (typeof count === 'number' && count >= 10);
    }catch(e){}
    alert(atLimit
      ? (isEn ? "You've reached your monthly limit (10 requests)." : "Vous avez atteint votre limite mensuelle (10 demandes).")
      : (isEn ? ("Couldn't record your request. (" + (error.message || error.code || 'unknown') + ")")
              : ("Impossible d'enregistrer la demande. (" + (error.message || error.code || 'inconnu') + ")")));
    return;
  }
  myFlaggedBills[billId] = true; // succès OU doublon = « challengé »
  if(btn){
    // Bouton réactivé (pas disabled) pour permettre de RETIRER le challenge
    // ensuite. Le libellé indique l'état « challengé + retirer ».
    btn.textContent = isEn ? '✓ Challenged — remove' : '✓ Challengé — retirer';
    btn.title = isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge';
    btn.classList.add('on');
    btn.disabled = false;
  }
  challengedCache = null; renderChallenged(); renderApercuBills(); // le compteur a bougé
}

// Bascule : challenge si pas encore fait, retire si déjà fait.
async function toggleChallenge(billId, btnId){
  if(!currentUser){ goToAccount(); return; }
  return myFlaggedBills[billId] ? removeExplanation(billId, btnId) : requestExplanation(billId, btnId);
}

// Retire la demande/challenge de la personne sur ce projet de loi.
async function removeExplanation(billId, btnId){
  const isEn = currentLang === 'en';
  const btn = document.getElementById(btnId);
  if(btn) btn.disabled = true;
  const { error } = await supabaseClient.from('bc_bill_flags')
    .delete().eq('user_id', currentUser.id).eq('bill_id', billId);
  if(error){
    console.error('removeExplanation delete error:', error);
    if(btn) btn.disabled = false;
    alert(isEn ? ("Couldn't remove your challenge. (" + (error.message || error.code || 'unknown') + ")")
               : ("Impossible de retirer votre challenge. (" + (error.message || error.code || 'inconnu') + ")"));
    return;
  }
  myFlaggedBills[billId] = false;
  if(btn){
    btn.textContent = (btn.classList.contains('ch-demand') ? '✋ ' : '') + (isEn ? 'Ask for an explanation' : 'Demander une explication');
    btn.removeAttribute('title');
    btn.classList.remove('on');
    btn.disabled = false;
  }
  challengedCache = null; renderChallenged(); renderApercuBills();
}

async function signInWithMagicLink(email){
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  return error;
}

async function signOutUser(){
  await supabaseClient.auth.signOut();
}

async function handleMagicLinkClick(){
  const input = document.getElementById('accountEmailInput');
  const note = document.getElementById('accountStatusNote');
  const btn = document.getElementById('magicLinkBtn');
  const isEn = currentLang === 'en';
  const email = input ? input.value.trim() : '';
  if(!email || !note || !btn) return;
  // Désactivé tout de suite pour éviter les clics multiples (donc plusieurs
  // courriels envoyés) pendant que la requête est en cours.
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi en cours…';
  const error = await signInWithMagicLink(email);
  if(error){
    btn.disabled = false;
    if(error.code === 'over_email_send_rate_limit'){
      note.textContent = isEn
        ? 'A link was already sent recently — check your inbox, or wait a bit before trying again.'
        : 'Un lien a déjà été envoyé récemment — vérifiez votre boîte courriel, ou attendez un peu avant de réessayer.';
    } else {
      note.textContent = isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.';
    }
  } else {
    btn.textContent = isEn ? '✓ Link sent' : '✓ Lien envoyé';
    note.textContent = isEn ? `Check your inbox (${email}) for the sign-in link.` : `Vérifiez votre boîte courriel (${email}) pour le lien de connexion.`;
  }
}

// La boîte « Votre compte » de l'encadré du compte gratuit, sur l'accueil (gabarit.html,
// #promoCompte). Même connexion par lien que Lexique (signInWithMagicLink), ses propres ids :
// les deux boîtes ne sont jamais sur la même page, mais le gabarit les porte toutes les deux.
// L'état de l'envoi du lien vit hors de la boîte : un changement de langue la redessine, et
// l'envoi en cours (ou fait) ne doit pas redevenir un bouton qu'on peut recliquer.
let promoEnvoi = null; // null | { etat: 'encours' | 'envoye', email }
function renderPromoCompte(){
  const box = document.getElementById('promoCompte');
  if(!box) return;
  const isEn = currentLang === 'en';
  if(currentUser){
    const nom = (currentUser.email || '').split('@')[0] || currentUser.email;
    const echappe = String(nom).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    box.innerHTML = `<p class="promo-compte-note" style="margin:0">${isEn ? 'Signed in as' : 'Connecté comme'} <b>${echappe}</b>. ${isEn ? 'Your followed bills are in <a class="promo-lien" href="/mon-dossier">My file</a>, your city projects too, <a class="promo-lien" href="/mon-dossier#villes">further down</a>.' : 'Vos projets de loi suivis sont dans <a class="promo-lien" href="/mon-dossier">Mon dossier</a>, vos projets de ville aussi, <a class="promo-lien" href="/mon-dossier#villes">plus bas</a>.'}</p>`;
    return;
  }
  const saisie = promoEnvoi?.email || document.getElementById('promoEmail')?.value || '';
  const occupe = !!promoEnvoi;
  const libelle = promoEnvoi?.etat === 'envoye' ? (isEn ? '✓ Link sent' : '✓ Lien envoyé')
    : promoEnvoi?.etat === 'encours' ? (isEn ? 'Sending…' : 'Envoi…')
    : (isEn ? 'Get the link' : 'Recevoir le lien');
  const note = promoEnvoi?.etat === 'envoye'
    ? (isEn ? 'Check your inbox for the sign-in link.' : 'Vérifiez vos courriels : le lien de connexion vous attend.')
    : box.closest('.nb-boite') ? ''   // N.-B. : la boîte de l'accueil le dit déjà (maquette)
    : (isEn ? 'No password: a sign-in link arrives by email. A free account follows 3 things in all.' : 'Pas de mot de passe : un lien de connexion arrive par courriel. Le compte gratuit suit 3 choses en tout.');
  box.innerHTML = `<div class="promo-compte-ligne">
      <input type="email" id="promoEmail" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}"${occupe ? ' readonly' : ''}>
      <button class="account-btn" id="promoLienBtn" onclick="handlePromoLink()"${occupe ? ' disabled' : ''}>${libelle}</button>
    </div>
    <p class="promo-compte-note" id="promoNote">${note}</p>`;
  const champ = document.getElementById('promoEmail');
  if(champ && saisie) champ.value = saisie;
  champ?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); handlePromoLink(); } });
}

async function handlePromoLink(){
  const isEn = currentLang === 'en';
  const input = document.getElementById('promoEmail');
  const email = input ? input.value.trim() : '';
  // Un envoi en cours ou déjà fait : Entrée ou un second clic ne renvoient rien.
  if(promoEnvoi) return;
  if(!email || !input.checkValidity()){ input?.focus(); return; }
  promoEnvoi = { etat: 'encours', email };
  renderPromoCompte();
  const error = await signInWithMagicLink(email);
  if(error){
    promoEnvoi = null;
    renderPromoCompte();
    const note = document.getElementById('promoNote');   // la boîte a pu être refaite entre-temps
    if(note) note.textContent = error.code === 'over_email_send_rate_limit'
      ? (isEn ? 'A link was already sent recently — check your inbox, or wait a bit.' : 'Un lien a déjà été envoyé récemment — vérifiez vos courriels, ou attendez un peu.')
      : (isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.');
    return;
  }
  promoEnvoi = { etat: 'envoye', email };
  renderPromoCompte();
}

/* ---------------- /mon-dossier — l'espace de la personne, côté ASSEMBLÉE ----------------
   Les villes y ont leur section depuis le 30 sept. 2026 (#villes, commun/mes-dossiers.js) ; avant, /mes-dossiers (Martin, 22 sept. 2026 : « complètement
   séparés »). Ici : les projets de loi suivis, les élus suivis, les mots-clés de l'Assemblée et
   l'alerte du matin. Rien de personnel n'est écrit dans le HTML : tout arrive de Supabase, avec
   les règles de sécurité qui font que chaque compte ne voit que ses propres lignes. */
const mdH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let mdPorteeOk = null;   // la colonne portee existe-t-elle ? (scripts/supabase-schema-mots-cles-portee.sql)

// Le quota de ce qu'on suit : 3 projets de loi par compte, le même pour tout le monde (pas
// d'abonnement sur DossierBC). Les élu·e·s suivi·e·s n'en font pas partie.
// Le compte vient de la BASE, pas de l'écran — c'est elle qui tranche (trigger
// bc_limite_suivis, scripts/supabase-colombie-britannique.sql). Si la lecture échoue, on
// renvoie `sur: null` et la page n'affiche aucun total plutôt qu'un total faux.
//
// DossierQuébec compte ici, en plus, les projets de ville, les mots-clés et les organismes :
// trois choses qui n'existent pas en C.-B., et dont les tables sont les SIENNES. On ne les lit
// pas (9 nov. 2026, avant la mise en ligne).
const MD_PLAFOND = 3;
async function mdQuota(){
  const plafond = MD_PLAFOND;
  if(!currentUser) return { total: 0, sur: null, parties: null };
  const d = await supabaseClient.from('bc_dossiers_suivis').select('dossier_id');
  if(d.error) return { total: 0, sur: null, parties: null };
  const dossiers = d.data ?? [];
  return { total: dossiers.length, sur: plafond, parties: { lois: dossiers.length, villes: 0 } };
}

async function renderMonDossier(){
  if(!document.getElementById('mdCompte')) return;   // pas sur cette page
  const isEn = currentLang === 'en';
  const quota = await mdQuota();
  mdCompte(isEn, quota);
  mdLois(isEn, quota);
  mdElus(isEn);
  // Les sept outils d'abonné·e de DossierQuébec (préoccupations, export, flux, alertes, veille,
  // consultations, organismes) : leurs tuiles ne sont même pas dessinées quand il n'y a pas
  // d'abonnement, et leurs blocs restent cachés. Les appeler quand même, c'était huit lectures
  // des tables de DQ à chaque ouverture de la page, pour un écran que personne ne voit.
  if(ASSEMBLY.abonnement !== false){
    mdPreoccupations(isEn);
    mdExport(isEn);
    mdFlux(isEn);
    mdAlertes(isEn);
    mdVeille(isEn);
    mdConsultations(isEn);
    mdOrganismes(isEn);
  }
  mdRefonte(isEn, quota);
}

// REFONTE de Mon dossier (prototype, 3 nov. 2026) : compteurs, « Pour commencer » ou les listes,
// tuiles des outils d'abonné·e (chaque tuile déplie l'outil existant), bande « Nous écrire ».
const MD_ICONES = {
  cloche: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  theme: '<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  organisme: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  consult: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
  rss: '<path d="M5 19h.01"/><path d="M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14"/>',
  excel: '<rect x="4" y="3" width="16" height="18"/><path d="M8 8l8 8M16 8l-8 8"/>',
};
const mdIcone = (n) => `<svg class="mdr-icone" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true">${MD_ICONES[n]}</svg>`;
let _mdOuvert = null;
async function mdRefonte(isEn, quota){
  const zc = document.getElementById('mdCompteurs');
  if(!zc) return;
  const L = isEn ? '?lang=en' : '';
  const nLois = currentUser ? Object.keys(followedBills).filter((id) => followedBills[id]).length : 0;
  const nElus = currentUser ? Object.keys(followed).filter((n) => followed[n]).length + deputesSuivisParNom().length : 0;
  // Pas de compteur « Projets de ville » : aucune ville de la C.-B. n'est couverte.
  const compteur = (cls, n, t) => `<div class="mdr-compteur ${cls}"><span class="mdr-nb">${n}</span><span class="mdr-lib">${t}</span></div>`;
  zc.innerHTML = compteur('mdr-bleu', nLois, isEn ? 'Bills' : 'Projets de loi')
    + compteur('mdr-ocre', nElus, isEn ? 'Members' : 'Élu·e·s');

  const aDesSuivis = nLois + nElus > 0;
  document.getElementById('mdSuivis').hidden = !aDesSuivis;
  // Pas de bloc « Vos projets de ville » sur DossierBC (voir gabarit.html) : rien à montrer.
  const courriels = document.getElementById('courriels');
  if(courriels) courriels.hidden = !currentUser;
  const debut = document.getElementById('mdDebut');
  if(aDesSuivis) debut.innerHTML = '';
  else {
    const carte = (n, titre, sous, liens) => `<div class="mdr-carte">
      <span class="mdr-num">${n}.</span><b class="mdr-carte-titre">${titre}</b><span class="mdr-carte-sous">${sous}</span>
      <span class="mdr-carte-action">${liens.map(([h, t]) => `<a href="${h}${L}">${t}</a>`).join(' · ')}</span></div>`;
    debut.innerHTML = `<h2 class="mdr-h2">${isEn ? 'Getting started' : 'Pour commencer'}</h2>
      <div class="mdr-cartes">
        ${carte(1, isEn ? 'A bill' : 'Un projet de loi', isEn ? 'An alert at every stage' : 'Une alerte à chaque étape', [['/projets-de-loi', isEn ? 'Choose a bill →' : 'Choisir un projet →']])}
        ${carte(2, isEn ? 'A member' : 'Un·e élu·e', isEn ? 'Their votes and bills' : 'Ses votes et ses projets', [['/ministres', isEn ? 'Find my MLA →' : 'Trouver mon député →']])}
        ${''/* N.-B. (Martin) : pas de carte « Un projet de ville » (Québec ou Montréal) */}
      </div>`;
  }

  // N.-B. (Martin, 7 nov. 2026) : abonnement éteint, pas de tuiles des abonné·e·s.
  if(ASSEMBLY.abonnement === false){ const p = document.getElementById("mdPlus"); if(p){ p.innerHTML = ""; p.hidden = true; } if(location.hash === "#ecrire") mdBasculerEcrire(true); return; }
  const abonne = await estAbonne();
  const tuiles = [
    ['mdAlertes', 'cloche', isEn ? 'Keyword alerts' : 'Alertes par mot-clé', isEn ? 'An email in the morning' : 'Un courriel le matin'],
    ['mdVeille', 'theme', isEn ? 'Topic watch' : 'Veille par thème', isEn ? 'Every Monday' : 'Chaque lundi'],
    ['mdOrganismes', 'organisme', isEn ? 'Follow an organization' : 'Suivre un organisme', isEn ? 'Its briefs filed' : 'Ses mémoires déposés'],
    ['mdConsultations', 'consult', isEn ? 'Consultations' : 'Consultations', isEn ? 'Who filed what' : 'Qui a déposé quoi'],
    ['mdFlux', 'rss', isEn ? 'RSS feeds' : 'Flux RSS', isEn ? 'In your reader' : 'Dans votre lecteur'],
    ['mdExport', 'excel', isEn ? 'Excel export' : 'Export Excel', isEn ? 'Votes and attendance' : 'Votes et présences'],
  ];
  document.getElementById('mdPlus').innerHTML = `<div class="mdr-plus-tete"><h2 class="mdr-h2">${isEn ? 'Going further · subscribers' : 'Pour aller plus loin · abonné·e·s'}</h2>
      <span><a class="md-lien" href="/abonnement${L}#code">${isEn ? 'Received a code?' : 'Vous avez reçu un code ?'}</a> · <a class="md-lien" href="/abonnement${L}">${isEn ? 'See the subscription →' : 'Voir l’abonnement →'}</a></span></div>
    <div class="mdr-tuiles">${tuiles.map(([id, ic, t, st]) => abonne
      ? `<button type="button" class="mdr-tuile" data-outil="${id}" aria-expanded="${_mdOuvert === id}" aria-controls="${id}" onclick="mdOuvrirOutil('${id}')">${mdIcone(ic)}<b>${t}</b><span>${st}</span></button>`
      : `<a class="mdr-tuile" href="/abonnement${L}">${mdIcone(ic)}<b>${t}</b><span>${st}</span></a>`).join('')}</div>`;
  tuiles.forEach(([id]) => { const z = document.getElementById(id); if(z) z.hidden = !(abonne && _mdOuvert === id); });
  if(location.hash === '#ecrire') mdBasculerEcrire(true);
}
function mdOuvrirOutil(id){
  _mdOuvert = _mdOuvert === id ? null : id;
  document.querySelectorAll('.mdr-tuile[data-outil]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.outil === _mdOuvert)));
  document.querySelectorAll('#mdOutils > .md-bloc').forEach((z) => { z.hidden = z.id !== _mdOuvert; });
  if(_mdOuvert) document.getElementById(_mdOuvert)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function mdBasculerOffrir(){
  const pli = document.getElementById('mdOffrirPli');
  if(!pli) return;
  pli.hidden = !pli.hidden;
  document.getElementById('mdOffrirBtn')?.setAttribute('aria-expanded', String(!pli.hidden));
  if(!pli.hidden) pli.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function mdBasculerEcrire(ouvrir){
  const pli = document.getElementById('mdEcrirePli'), btn = document.getElementById('mdEcrireBtn');
  if(!pli) return;
  pli.hidden = ouvrir === true ? false : !pli.hidden;
  btn?.setAttribute('aria-expanded', String(!pli.hidden));
  if(!pli.hidden && ouvrir !== true) pli.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// SUIVRE UNE ENTREPRISE OU UN ORGANISME (21 oct. 2026), septième outil de l'abonnement. On cherche parmi
// les auteurs de mémoires déposés en commission (« Déposé par »), on en suit jusqu'à MD_ORG_MAX, et on
// voit leurs mémoires. Le serveur (api/export.js?jeu=organismes, api/_organismes.js) vérifie
// l'abonnement et fait la recherche ; la table organismes_suivis (portee « assemblee ») garde la clé
// de chaque organisme. La base refuse un 11e organisme, ou tout organisme à qui n'est pas abonné.
const MD_ORG_MAX = 10;
async function organismesServeur(params){
  const { data: { session } } = await supabaseClient.auth.getSession();
  const r = await fetch(`/api/export?jeu=organismes&${params}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
async function mdOrganismes(isEn){
  const zone = document.getElementById('mdOrganismes');
  if(!zone) return;
  const tete = `<div class="md-carte-tete"><h2>${isEn ? 'Follow a company or an organization' : 'Suivre une entreprise ou un organisme'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'What a company, union, association or professional order asks for or defends before the National Assembly: the briefs it filed in committee, in one place, and a line in the morning email for each new brief. Source: Assemblée nationale du Québec (titles in French).' : 'Ce qu’une entreprise, un syndicat, une association ou un ordre professionnel demande ou défend devant l’Assemblée nationale : ses mémoires déposés en commission, au même endroit, et une ligne dans le courriel du matin à chaque nouveau mémoire. Source : Assemblée nationale du Québec.'}</p>`;
  if(!(await estAbonne())){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p></div>`;
    return;
  }
  let suivis = [], d = null;
  try{
    const { data, error } = await supabaseClient.from('organismes_suivis').select('id, nom').eq('portee', 'assemblee').order('created_at');
    if(error) throw error;
    suivis = data || [];
    d = await organismesServeur(suivis.map((x) => 'c=' + encodeURIComponent(x.nom)).join('&'));
  }catch(e){}
  if(!d){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Unavailable right now. Try again later.' : 'Indisponible pour le moment. Réessayez plus tard.'}</p></div>`;
    return;
  }
  const plein = suivis.length >= MD_ORG_MAX;
  const liste = suivis.length ? suivis.map((s) => {
    const o = d.organismes?.[s.nom];
    const retirer = `<button class="md-bouton-doux" onclick="mdRetirerOrganisme('${mdH(s.id)}')">${isEn ? 'Stop following' : 'Ne plus suivre'}</button>`;
    if(!o) return `<div class="md-memoires"><p><b>${mdH(s.nom)}</b> — ${isEn ? 'no longer in the data.' : 'n’est plus dans les données.'} ${retirer}</p></div>`;
    const memoires = `<ul class="bill-memoires-liste">${o.liste.map((m) => `<li>${m.url ? `<a href="${mdH(m.url)}" target="_blank" rel="noopener">${mdH(m.titre || m.depose)}</a>` : mdH(m.titre || m.depose)}
        <span>${mdH(mdDateCourte(m.date, isEn))}</span>
        <div class="md-note">${isEn ? 'Bill' : 'Projet de loi'} ${mdH(m.num)} — ${mdH(m.titrePl)}${m.commission ? ` · ${mdH(m.commission)}` : ''}</div></li>`).join('')}</ul>`;
    return `<details class="md-memoires"><summary><b>${mdH(o.nom)}</b> (${o.memoires})</summary>
      ${o.variantes.length ? `<p class="md-note">${isEn ? 'Also written: ' : 'Aussi écrit : '}${o.variantes.map(mdH).join(' ; ')}</p>` : ''}
      ${memoires}<p>${retirer}</p></details>`;
  }).join('') : `<p class="md-note">${isEn ? 'No organization followed yet.' : 'Aucun organisme suivi pour l’instant.'}</p>`;
  const maj = d.misAJour ? String(d.misAJour).slice(0, 10) : '';
  zone.innerHTML = `<div class="md-carte">${tete}
    <h3 class="md-sous-titre">${isEn ? `Followed (${suivis.length} of ${MD_ORG_MAX})` : `Suivis (${suivis.length} sur ${MD_ORG_MAX})`}</h3>
    ${liste}
    <h3 class="md-sous-titre">${isEn ? 'Search' : 'Chercher'}</h3>
    ${plein ? `<p class="md-note">${isEn ? `All ${MD_ORG_MAX} are used. Stop following one to add another.` : `Vos ${MD_ORG_MAX} organismes sont utilisés. Cessez d’en suivre un pour en ajouter un autre.`}</p>` : ''}
    <div class="md-ligne"><input type="search" id="mdOrgRecherche" maxlength="120" placeholder="${isEn ? 'A name, e.g. Desjardins, Barreau' : 'Un nom, par exemple Desjardins, Barreau'}" aria-label="${isEn ? 'Search organizations' : 'Chercher un organisme'}">
      <button class="account-btn" onclick="mdChercherOrganisme()">${isEn ? 'Search' : 'Chercher'}</button></div>
    <p class="md-note" id="mdOrgNote" aria-live="polite"></p>
    <ul class="md-avenir-liste" id="mdOrgResultats"></ul>
    <p class="md-note">${isEn ? 'Names are grouped when they differ only by accents, capitals, apostrophes, hyphens, a final acronym in brackets, “inc.” or a leading article. Any other difference keeps two separate entries. A joint brief also counts for each co-signer that has filed alone. Individuals are not listed.' : 'Les noms sont regroupés quand ils ne diffèrent que par les accents, les majuscules, les apostrophes, les tirets, un sigle final entre parenthèses, « inc. » ou un article au début. Toute autre différence laisse deux entrées séparées. Un mémoire commun compte aussi pour chaque cosignataire qui a déjà déposé seul. Les particuliers ne sont pas listés.'}${maj ? (isEn ? ` Data read on ${mdH(mdDateCourte(maj, true))}.` : ` Données relues le ${mdH(mdDateCourte(maj, false))}.`) : ''}</p>
  </div>`;
  zone._suivis = new Set(suivis.map((s) => s.nom));
  zone._plein = plein;
  document.getElementById('mdOrgRecherche')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); mdChercherOrganisme(); } });
}
let _mdOrgResultats = [];
async function mdChercherOrganisme(){
  const isEn = currentLang === 'en';
  const zone = document.getElementById('mdOrganismes');
  const q = (document.getElementById('mdOrgRecherche')?.value || '').trim();
  const note = document.getElementById('mdOrgNote'), ul = document.getElementById('mdOrgResultats');
  if(q.length < 2){ note.textContent = isEn ? 'At least 2 characters.' : 'Au moins 2 caractères.'; return; }
  note.textContent = isEn ? 'Searching…' : 'Recherche…';
  try{
    const d = await organismesServeur('q=' + encodeURIComponent(q));
    _mdOrgResultats = d.resultats || [];
  }catch(e){ note.textContent = isEn ? 'Search unavailable. Try again later.' : 'Recherche indisponible. Réessayez plus tard.'; return; }
  note.textContent = _mdOrgResultats.length ? '' : (isEn ? 'No organization by that name has filed a brief.' : 'Aucun organisme de ce nom n’a déposé de mémoire.');
  ul.innerHTML = _mdOrgResultats.map((o, i) => `<li><b>${mdH(o.nom)}</b> <span class="md-note">${o.memoires} ${isEn ? (o.memoires > 1 ? 'briefs' : 'brief') : (o.memoires > 1 ? 'mémoires' : 'mémoire')}</span>
    ${zone._suivis?.has(o.cle) ? `<span class="md-note">· ${isEn ? 'followed' : 'suivi'}</span>` : zone._plein ? '' : `<button class="md-bouton-doux" onclick="mdSuivreOrganisme(${i})">${isEn ? 'Follow' : 'Suivre'}</button>`}</li>`).join('');
}
async function mdSuivreOrganisme(i){
  const isEn = currentLang === 'en';
  const o = _mdOrgResultats[i];
  const note = document.getElementById('mdOrgNote');
  if(!o || !currentUser) return;
  const { error } = await supabaseClient.from('organismes_suivis').insert({ user_id: currentUser.id, nom: o.cle, portee: 'assemblee' });
  if(error){
    note.textContent = /duplicate|23505/.test(error.message + error.code) ? (isEn ? 'Already followed.' : 'Déjà suivi.')
      : /limite de \d+ organismes/.test(error.message) ? (isEn ? `All ${MD_ORG_MAX} are used.` : `Vos ${MD_ORG_MAX} organismes sont utilisés.`)
      : /abonn/.test(error.message) ? (isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.')
      : (isEn ? 'Could not follow it. Try again.' : 'Impossible de le suivre. Réessayez.');
    return;
  }
  mdOrganismes(isEn);
}
async function mdRetirerOrganisme(id){
  const isEn = currentLang === 'en';
  const { error } = await supabaseClient.from('organismes_suivis').delete().eq('id', id);
  if(error){ const n = document.getElementById('mdOrgNote'); if(n) n.textContent = isEn ? 'Could not remove it. Try again.' : 'Impossible de le retirer. Réessayez.'; return; }
  mdOrganismes(isEn);
}
window.mdChercherOrganisme = mdChercherOrganisme;
window.mdSuivreOrganisme = mdSuivreOrganisme;
window.mdRetirerOrganisme = mdRetirerOrganisme;

// CONSULTATIONS ET MÉMOIRES (21 oct. 2026), quatrième et cinquième outils de l'abonnement. Les
// consultations à venir en commission (dates des séances, et la date limite quand l'Assemblée la
// publie), puis, pour chaque projet de loi suivi, les mémoires déposés. Tout vient du serveur
// (api/export.js?jeu=consultations), qui vérifie l'abonnement ; rien n'est dans un fichier public.
async function mdConsultations(isEn){
  const zone = document.getElementById('mdConsultations');
  if(!zone) return;
  const tete = `<div class="md-carte-tete"><h2>${isEn ? 'Consultations and briefs' : 'Consultations et mémoires'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'Upcoming committee consultations on bills, and who submitted a brief on the bills you follow. Source: Assemblée nationale du Québec (titles in French).' : 'Les consultations à venir en commission parlementaire, et qui a déposé un mémoire sur les projets de loi que vous suivez. Source : Assemblée nationale du Québec.'}</p>`;
  if(!(await estAbonne())){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p></div>`;
    return;
  }
  let d = null;
  try{
    const { data } = await supabaseClient.from('bc_dossiers_suivis').select('dossier_id').eq('ville', 'assemblee');
    const ids = (data || []).map((x) => /^pl:(\d+)$/.exec(x.dossier_id)?.[1]).filter(Boolean);
    d = await consultationsServeur(ids);
  }catch(e){}
  if(!d){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Unavailable right now. Try again later.' : 'Indisponible pour le moment. Réessayez plus tard.'}</p></div>`;
    return;
  }
  const type = (t) => t === 'generale' ? (isEn ? 'General consultation (open to all)' : 'Consultation générale (ouverte à tous)') : (isEn ? 'Special consultations (by invitation)' : 'Consultations particulières (sur invitation)');
  const aVenir = d.aVenir.length
    ? `<ul class="md-avenir-liste">${d.aVenir.map((c) => `<li><a class="md-lien" href="${mdH(c.url)}" target="_blank" rel="noopener">${mdH(c.titre)}</a>
        <div class="md-note">${mdH(c.commission)} · ${type(c.type)}${c.prochaineSeance ? ` · ${isEn ? 'next hearing: ' : 'prochaine séance : '}${mdH(mdDateCourte(c.prochaineSeance, isEn))}` : ''}</div>
        <div class="md-note">${c.dateLimite
          ? `<b>${isEn ? 'Deadline: ' : 'Date limite : '}${mdH(mdDateCourte(c.dateLimite, isEn))}</b>`
          : (isEn ? 'No deadline published on the Assembly’s website.' : 'Aucune date limite publiée sur le site de l’Assemblée.')}</div></li>`).join('')}</ul>`
    : `<p class="md-note">${isEn ? 'No consultation under way or announced. None will be before the new legislature’s first bills (not before November 17, 2026).' : 'Aucune consultation en cours ni annoncée. Il n’y en aura pas avant les premiers projets de loi de la nouvelle législature (pas avant le 17 novembre 2026).'}</p>`;
  const projets = Object.values(d.projets || {}).filter((p) => p.memoires.length);
  const memoires = projets.length
    ? projets.map((p) => `<details class="md-memoires"><summary><b>${isEn ? 'Bill' : 'Projet de loi'} ${mdH(p.num)}</b> — ${mdH(p.titre)} (${p.memoires.length})</summary>${listeMemoiresHtml(p.memoires, isEn)}</details>`).join('')
    : `<p class="md-note">${isEn ? 'No briefs on the bills you follow. Follow a bill from the Bills tab to see its briefs here.' : 'Aucun mémoire sur les projets de loi que vous suivez. Suivez un projet de loi depuis l’onglet Projets de loi pour voir ses mémoires ici.'}</p>`;
  zone.innerHTML = `<div class="md-carte">${tete}
    <h3>${isEn ? 'Upcoming consultations' : 'Consultations à venir'}</h3>${aVenir}
    <p class="md-note">${isEn ? 'Email reminder 7 days before a published deadline, for the bills you follow or that contain one of your keywords (in the morning alerts).' : 'Rappel par courriel 7 jours avant une date limite publiée, pour les projets de loi que vous suivez ou qui contiennent un de vos mots-clés (dans les alertes du matin).'}</p>
    <h3>${isEn ? 'Briefs on the bills you follow' : 'Mémoires sur les projets de loi suivis'}</h3>${memoires}
  </div>`;
}

// « CE QUI VOUS PRÉOCCUPE » (Martin, 18 oct. 2026). Une boîte de texte pour les gens connectés,
// le nombre de messages reçus, et le tableau des sujets en pourcentage. Les messages ne sont jamais
// affichés : une fois par jour, scrapers/preoccupations.js les classe (Claude) et publie seulement
// le tableau, data/preoccupations.json. Pour l'instant dans Mon dossier ; l'accueil plus tard.
let _preoc = null;
async function mdPreoccupations(isEn){
  const zone = document.getElementById('mdPreoccupations');
  if(!zone) return;
  // En direct d'abord (Martin, 19 oct. 2026 : le tableau suit ses approbations tout de suite) : la
  // fonction Supabase preoccupations_tableau() ne rend que les totaux, jamais un message. Si elle
  // manque ou tombe, on retombe sur le tableau publié chaque matin (data/preoccupations.json).
  if(!_preoc){
    try{
      const { data, error } = await supabaseClient.rpc('preoccupations_tableau');
      if(error || !data) throw error || new Error('vide');
      const sujets = (data.sujets || []).map((s) => ({ fr: s.sujet, en: s.sujet, n: s.n }));
      _preoc = { recus: data.recus || 0, mentions: sujets.reduce((t, s) => t + s.n, 0), sujets, direct: true };
    }catch(e){
      try{ _preoc = await (await fetch('/data/preoccupations.json')).json(); }catch(e2){ _preoc = { recus: 0, mentions: 0, sujets: [] }; }
    }
  }
  const p = _preoc;
  const h = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const lignes = (p.sujets || []).map((s) => {
    const pc = p.mentions ? Math.round(s.n / p.mentions * 100) : 0;
    return `<tr><td>${h(isEn ? (s.en || s.fr) : s.fr)}</td><td class="md-preoc-barre"><span style="width:${pc}%"></span></td><td class="md-preoc-pc">${pc} %</td></tr>`;
  }).join('');
  // La boîte reste visible sans compte ; c'est à l'envoi qu'on dit qu'il en faut un.
  const formulaire = true
    ? `<label class="md-note" for="mdPreocTexte">${isEn ? 'In your own words: a problem, a topic, something that should change.' : 'En vos mots : un problème, un sujet, quelque chose qui devrait changer.'}</label>
       <textarea id="mdPreocTexte" class="md-preoc-texte" maxlength="2000" rows="4" oninput="mdCompterMots()" placeholder="${isEn ? 'What worries you?' : 'Qu’est-ce qui vous préoccupe ?'}"></textarea>
       <div class="md-preoc-envoi"><button class="account-btn" id="mdPreocBtn" onclick="mdEnvoyerPreoccupation()">${isEn ? 'Send' : 'Envoyer'}</button><span class="md-note" id="mdPreocNote">${isEn ? 'Your message is never published. 300 words and 3 messages per day at most. An account is needed to send.' : 'Votre message n’est jamais publié. 300 mots et 3 messages par jour au plus. Il faut un compte pour envoyer.'}</span><span class="md-note md-preoc-mots" id="mdPreocMots"></span></div>`
    : `<p>${isEn ? 'Sign in (above) to write what worries you.' : 'Connectez-vous (plus haut) pour écrire ce qui vous préoccupe.'}</p>`;
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete"><h2>${isEn ? 'What worries you' : 'Ce qui vous préoccupe'}</h2><span class="md-etiquette">${p.recus || 0} ${isEn ? ((p.recus || 0) > 1 ? 'messages received' : 'message received') : ((p.recus || 0) > 1 ? 'messages reçus' : 'message reçu')}</span></div>
    ${formulaire}
    ${lignes ? `<table class="md-preoc-table"><tbody>${lignes}</tbody></table>` : `<p class="md-note">${isEn ? 'The table of topics will appear here once the first messages are sorted.' : 'Le tableau des sujets paraîtra ici quand les premiers messages auront été classés.'}</p>`}
    <p class="md-note">${isEn
      ? `Messages are read and grouped into topics by hand, from time to time. A person counts once per topic. This is not a poll: only visitors who wrote are counted.${p.direct ? ' Live count.' : p.majLe ? ` Last count: ${h(p.majLe)}.` : ''}`
      : `Les messages sont lus et regroupés en sujets à la main, à temps perdu. Une personne compte une fois par sujet. Ce n’est pas un sondage : seuls les visiteurs qui ont écrit sont comptés.${p.direct ? ' Compte en direct.' : p.majLe ? ` Dernier compte : ${h(p.majLe)}.` : ''}`}</p>
  </div>`;
}
async function mdEnvoyerPreoccupation(){
  const isEn = currentLang === 'en';
  const champ = document.getElementById('mdPreocTexte'), btn = document.getElementById('mdPreocBtn'), note = document.getElementById('mdPreocNote');
  const texte = (champ?.value || '').trim();
  if(texte.length < 3){ note.textContent = isEn ? 'Write a few words first.' : 'Écrivez quelques mots d’abord.'; return; }
  if(nbMots(texte) > 300){ note.textContent = isEn ? `Your message has ${nbMots(texte)} words: 300 at most.` : `Votre message compte ${nbMots(texte)} mots : 300 au plus.`; return; }
  if(!currentUser){
    note.innerHTML = isEn
      ? '<b>An account is needed to send your message.</b> Enter your email in “Your account”, just above: a sign-in link arrives, no password. Your text stays here in the meantime.'
      : '<b>Il faut un compte pour envoyer votre message.</b> Entrez votre courriel dans « Votre compte », juste au-dessus : un lien de connexion arrive, sans mot de passe. Votre texte reste ici en attendant.';
    note.classList.add('md-preoc-alerte');
    document.getElementById('mdCompte')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  btn.disabled = true;
  const { error } = await supabaseClient.from('preoccupations').insert({ texte: texte.slice(0, 2000) });
  btn.disabled = false;
  if(error){
    console.error('preoccupations:', error);
    note.textContent = /limite/.test(error.message || '')
      ? (isEn ? 'You have reached 3 messages for today. Come back tomorrow.' : 'Vous avez atteint 3 messages pour aujourd’hui. Revenez demain.')
      : (isEn ? 'The message could not be sent. Try again later.' : 'Le message n’a pas pu partir. Réessayez plus tard.');
    return;
  }
  champ.value = '';
  note.textContent = isEn ? '✓ Received, thank you. It will be counted at the next sorting.' : '✓ Reçu, merci. Il sera compté au prochain classement.';
}
window.mdEnvoyerPreoccupation = mdEnvoyerPreoccupation;
const nbMots = (t) => (String(t).trim().match(/\S+/g) || []).length;
function mdCompterMots(){
  const n = nbMots(document.getElementById('mdPreocTexte')?.value || ''), z = document.getElementById('mdPreocMots');
  if(z){ z.textContent = n ? `${n} / 300 ${currentLang === 'en' ? 'words' : 'mots'}` : ''; z.classList.toggle('md-preoc-trop', n > 300); }
}
window.mdCompterMots = mdCompterMots;

// LES MESSAGES, CÔTÉ ADMIN (Martin, 18 oct. 2026 : sous « Demandes d'explications », page Lexique).
// Les 200 plus récents, avec leur statut et leur sujet ; un admin peut marquer un message comme spam
// (ou l'en sortir) et le changer de sujet. Le tableau public se recalcule au classement du matin.
// Lecture et correction permises par scripts/supabase-schema-preoccupations-admin.sql.
async function renderAdminPreoccupations(){
  const zone = document.getElementById('adminPreoccupations');
  if(!zone) return;
  if(!(await checkIsAdmin())){ zone.innerHTML = ''; return; }
  const isEn = currentLang === 'en';
  const { data, error } = await supabaseClient.from('preoccupations').select('id, texte, statut, sujet, created_at').order('created_at', { ascending: false }).limit(200);
  if(error){ console.error('renderAdminPreoccupations:', error); zone.innerHTML = `<div class="account-note">${isEn ? 'Messages could not be read.' : 'Les messages n’ont pas pu être lus.'}</div>`; return; }
  // Les sujets : ceux déjà donnés à un message, plus ceux du tableau publié. Le sujet EST son libellé
  // (« Coût du logement ») : Martin les crée et les range lui-même, sans IA (18 oct. 2026).
  let publies = [];
  try{ publies = (await (await fetch('/data/preoccupations.json')).json()).sujets || []; }catch(e){}
  const sujets = [...new Set([...(data || []).map((m) => m.sujet).filter(Boolean), ...publies.map((p) => p.fr || p.cle)])].sort((a, b) => a.localeCompare(b, 'fr'));
  const h = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const choix = (m) => `<select onchange="adminPreocSujet('${m.id}', this.value, this)"><option value="">${isEn ? '— no topic —' : '— aucun sujet —'}</option>${sujets.map((t) => `<option value="${h(t)}"${t === m.sujet ? ' selected' : ''}>${h(t)}</option>`).join('')}<option value="__nouveau__">${isEn ? '➕ New topic…' : '➕ Nouveau sujet…'}</option></select>`;
  const lignes = (data || []).map((m) => `<tr class="admin-preoc-${m.statut}">
      <td>${h(String(m.created_at).slice(0, 10))}</td>
      <td>${h(m.texte)}</td>
      <td>${m.statut === 'spam' ? (isEn ? 'spam' : 'spam') : m.statut === 'classe' ? (isEn ? 'sorted' : 'classé') : (isEn ? 'new' : 'nouveau')}</td>
      <td>${m.statut === 'classe' ? `<span class="admin-preoc-ok">✓ ${isEn ? 'Approved' : 'Approuvé'}</span>` : m.statut === 'spam' ? '—' : `<button class="account-btn" onclick="adminPreocApprouver('${m.id}', ${m.sujet ? 'true' : 'false'})">${isEn ? 'Approve' : 'Approuver'}</button>`}</td>
      <td class="admin-preoc-actions">${choix(m)} <button class="account-btn" onclick="adminPreocSpam('${m.id}', ${m.statut === 'spam' ? 'false' : 'true'})">${m.statut === 'spam' ? (isEn ? 'Not spam' : 'Pas du spam') : 'Spam'}</button></td>
    </tr>`).join('');
  zone.innerHTML = `<div class="account-note" style="margin:18px 0 10px;"><b>${isEn ? 'What worries visitors (admin only)' : 'Ce qui préoccupe les visiteurs (réservé aux admins)'}</b> — ${isEn
    ? `${(data || []).length} most recent message(s). For each message: pick a topic (or create one with « ➕ New topic… »), then « Approve » so it counts in the public table; otherwise « Spam ». The public table is recounted every morning.`
    : `${(data || []).length > 1 ? `les ${(data || []).length} messages les plus récents` : `${(data || []).length} message`}. Pour chaque message : choisissez un sujet (ou créez-en un avec « ➕ Nouveau sujet… »), puis « Approuver » pour qu’il compte dans le tableau public ; sinon « Spam ». Le tableau public se recompte chaque matin.`}</div>
    ${lignes ? `<div class="admin-preoc-defile"><table class="admin-preoc"><thead><tr><th>${isEn ? 'Date' : 'Date'}</th><th>Message</th><th>${isEn ? 'Status' : 'Statut'}</th><th>${isEn ? 'Approved' : 'Approuvé'}</th><th>${isEn ? 'Topic' : 'Sujet'}</th></tr></thead><tbody>${lignes}</tbody></table></div>` : `<p class="account-note">${isEn ? 'No message yet.' : 'Aucun message pour l’instant.'}</p>`}`;
}
async function adminPreocSpam(id, spam){
  const { error } = await supabaseClient.from('preoccupations').update(spam ? { statut: 'spam', sujet: null } : { statut: 'nouveau', sujet: null }).eq('id', id);
  if(error){ console.error('adminPreocSpam:', error); alert(currentLang === 'en' ? 'Not saved.' : 'Pas enregistré.'); }
  renderAdminPreoccupations();
}
async function adminPreocSujet(id, sujet, menu){
  if(sujet === '__nouveau__'){
    const libelle = (window.prompt(currentLang === 'en' ? 'Name of the new topic (e.g. Cost of housing):' : 'Nom du nouveau sujet (ex. : Coût du logement) :') || '').trim().slice(0, 80);
    if(libelle.length < 2){ if(menu) renderAdminPreoccupations(); return; }
    sujet = libelle;
  }
  const { error } = await supabaseClient.from('preoccupations').update(sujet ? { sujet } : { statut: 'nouveau', sujet: null }).eq('id', id);
  if(error){ console.error('adminPreocSujet:', error); alert(currentLang === 'en' ? 'Not saved.' : 'Pas enregistré.'); }
  renderAdminPreoccupations();
}
async function adminPreocApprouver(id, aUnSujet){
  if(!aUnSujet){ alert(currentLang === 'en' ? 'Pick a topic first, in the menu next to Spam.' : 'Choisissez d’abord un sujet, dans le menu à côté de Spam.'); return; }
  const { error } = await supabaseClient.from('preoccupations').update({ statut: 'classe' }).eq('id', id);
  if(error){ console.error('adminPreocApprouver:', error); alert(currentLang === 'en' ? 'Not saved.' : 'Pas enregistré.'); }
  renderAdminPreoccupations();
}
window.adminPreocApprouver = adminPreocApprouver;
window.adminPreocSpam = adminPreocSpam;
window.adminPreocSujet = adminPreocSujet;

// L'EXPORT DES DONNÉES (21 oct. 2026), premier outil de l'abonnement. Trois fichiers CSV des données
// de l'Assemblée : votes nominaux (une ligne par député·e et par vote), présences, projets de loi.
// Le serveur (api/export.js) vérifie l'abonnement avant de fabriquer le fichier ; ici, on ne fait que
// montrer les boutons aux abonné·e·s et le lien vers /abonnement aux autres.
function moisExport(){
  try{ const m = new URL(location.href).searchParams.get('mois') || ''; return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null; }catch(e){ return null; }
}
// Les mois que le serveur accepte (api/export.js) : de novembre 2022 au mois en cours, heure de Montréal.
function mdMoisPermis(){
  let [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  const liste = [];
  while(`${a}-${String(m).padStart(2, '0')}` >= '2022-11'){ liste.push(`${a}-${String(m).padStart(2, '0')}`); m--; if(m === 0){ m = 12; a--; } }
  return liste;   // du plus récent au plus ancien
}
const mdNomMois = (m, isEn) => { const [a, n] = m.split('-').map(Number); const t = new Date(Date.UTC(a, n - 1, 15)).toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }); return t.charAt(0).toUpperCase() + t.slice(1); };
async function mdExport(isEn){
  const zone = document.getElementById('mdExport');
  if(!zone) return;
  let abonne = false;
  if(currentUser){
    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch('/api/abonnement', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
      abonne = r.ok && (await r.json()).abonne === true;
    }catch(e){}
  }
  const jeux = [
    ['votes', isEn ? 'Recorded votes' : 'Votes nominaux', isEn ? 'one line per vote: date, subject, totals' : 'une ligne par vote : date, sujet, totaux'],
    ['votes-deputes', isEn ? 'Who voted what' : 'Qui a voté quoi', isEn ? 'one line per member and per vote, linked by the « vote » column' : 'une ligne par député·e et par vote, reliée par la colonne « vote »'],
    ['presences', isEn ? 'Attendance' : 'Présences', isEn ? 'per member, at votes' : 'par député·e, aux votes'],
    ['projets', isEn ? 'Bills' : 'Projets de loi', isEn ? 'number, title, status, dates' : 'numéro, titre, statut, dates'],
  ];
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete"><h2>${isEn ? 'Data export' : 'Export des données'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'National Assembly data as CSV files, ready for Excel or Google Sheets. Source: Assemblée nationale du Québec.' : 'Les données de l’Assemblée nationale en fichiers CSV, prêts pour Excel ou Google Sheets. Source : Assemblée nationale du Québec.'}</p>
    ${abonne ? `<p class="md-ligne"><label class="md-note" for="mdExportMois">${isEn ? 'Month covered:' : 'Mois couvert :'}</label> <select id="mdExportMois">${mdMoisPermis().map((m) => `<option value="${m}"${m === (moisExport() || mdMoisPermis()[0]) ? ' selected' : ''}>${mdNomMois(m, isEn)}</option>`).join('')}</select></p><p class="md-note">${isEn ? 'One month per file: pick the month, then the file. Bills: those introduced or that moved during the month.' : 'Un mois par fichier : choisissez le mois, puis le fichier. Projets de loi : ceux présentés ou qui ont bougé pendant le mois.'}</p>` : ''}
    ${abonne
      ? `<div class="md-export-boutons">${jeux.map(([j, t, d]) => `<button class="account-btn" onclick="mdTelecharger('${j}', this)">${t}</button><span class="md-note">${d}</span>`).join('')}</div>`
      : `<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p>`}
  </div>`;
}
async function mdTelecharger(jeu, bouton){
  const isEn = currentLang === 'en';
  const avant = bouton.textContent;
  bouton.disabled = true; bouton.textContent = isEn ? 'Preparing…' : 'Préparation…';
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    // ?mois=AAAA-MM dans l'adresse (les liens « Les fichiers du mois » de l'infolettre) : ce mois-là
    // seulement, pour les votes et les présences.
    const mois = document.getElementById('mdExportMois')?.value || mdMoisPermis()[0];
    const r = await fetch(`/api/export?jeu=${jeu}&mois=${mois}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
    if(!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || `dossierquebec-${jeu}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }catch(e){
    alert(isEn ? 'The file could not be prepared. Try again later.' : 'Le fichier n’a pas pu être préparé. Réessayez plus tard.');
  }
  bouton.disabled = false; bouton.textContent = avant;
}
window.mdTelecharger = mdTelecharger;

// LES FLUX RSS (21 oct. 2026), troisième outil de l'abonnement, avec le flux général (réservé aux
// abonné·e·s le même jour). L'adresse personnelle signée vient du serveur (api/abonnement.js,
// ?action=flux) : le navigateur n'y ajoute que « &type=… », il ne connaît aucun secret. api/feed.js
// revérifie l'abonnement à chaque lecture.
let mdFluxAdresse = '';
async function mdFlux(isEn){
  const zone = document.getElementById('mdFlux');
  if(!zone) return;
  let donnees = null;
  if(currentUser){
    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch('/api/abonnement?action=flux', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
      if(r.ok) donnees = await r.json();
    }catch(e){}
  }
  const tete = `<div class="md-carte-tete"><h2>${isEn ? 'Custom RSS feeds' : 'Flux RSS personnalisés'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'National Assembly news in any RSS reader (Feedly, Inoreader, Thunderbird…). Source: Assemblée nationale du Québec. Feeds are in French.' : 'Les nouvelles de l’Assemblée nationale dans n’importe quel lecteur RSS (Feedly, Inoreader, Thunderbird…). Source : Assemblée nationale du Québec.'}</p>`;
  if(!donnees?.adresse){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p></div>`;
    return;
  }
  mdFluxAdresse = donnees.adresse;
  const copier = `<button class="md-bouton-doux" aria-label="${isEn ? 'Copy' : 'Copier'}" onclick="copierCourriel(this, this.previousElementSibling.value)">⧉</button>`;
  const ligne = (titre, adresse) => `<li><b>${titre}</b><div class="md-ligne"><input type="text" readonly value="${mdH(adresse)}" aria-label="${mdH(titre)}" onfocus="this.select()">${copier}</div></li>`;
  const min = donnees.ministeres || [];
  zone.innerHTML = `<div class="md-carte">${tete}
    <p class="md-note">${isEn ? 'Paste this address into your RSS reader. It is personal: do not share it.' : 'Collez cette adresse dans votre lecteur RSS. Elle est personnelle : ne la partagez pas.'}</p>
    <ul class="md-avenir-liste">
      ${ligne(isEn ? 'All National Assembly news' : 'Toutes les nouvelles de l’Assemblée', mdFluxAdresse)}
      ${ligne(isEn ? 'Your keywords (bills that contain one of them)' : 'Vos mots-clés (projets de loi qui en contiennent un)', mdFluxAdresse + '&type=mots')}
      ${ligne(isEn ? 'Your followed members (bills introduced and recorded votes)' : 'Vos élus suivis (projets de loi présentés et votes nominaux)', mdFluxAdresse + '&type=elus')}
      ${min.length ? `<li><b>${isEn ? 'By ministry (bills it sponsors) — one feed per ministry' : 'Par ministère (projets de loi qu’il parraine) — un flux par ministère'}</b>
        <div id="mdFluxMins"></div></li>` : ''}
      <li><b>${isEn ? 'One keyword — one feed per keyword' : 'Un mot-clé précis — un flux par mot-clé'}</b>
        <div id="mdFluxMots"></div></li>
      ${(donnees.elus || []).length ? `<li><b>${isEn ? 'One member — one feed per member (bills introduced and recorded votes)' : 'Un élu précis — un flux par élu (projets de loi présentés et votes nominaux)'}</b>
        <div id="mdFluxElus"></div></li>` : ''}
    </ul>
    <p class="md-note">${isEn ? 'Keywords are managed in the alerts card; followed members, from the ministers and MNAs pages.' : 'Les mots-clés se gèrent dans la carte des alertes ; les élus suivis, depuis les pages des ministres et des député·e·s.'}</p>
  </div>`;
  _mdMins = min;
  _mdElus = donnees.elus || [];
  if(min.length) mdFluxAjouterMinistere(true);
  mdFluxAjouterMot(true);
  if(_mdElus.length) mdFluxAjouterElu(true);
}
// Les flux par ministère (Martin, 21 oct. 2026 : « à gauche de ministre, un + ; s'ils veulent suivre
// plus d'un ministre, une ligne s'additionne »). Chaque ligne : un ministère, son adresse, ⧉ copier.
// Le + de la première ligne en ajoute une ; les lignes ajoutées ont un − pour se retirer.
let _mdMins = [];
function mdFluxAjouterMinistere(premiere){
  const boite = document.getElementById('mdFluxMins');
  if(!boite) return;
  const isEn = currentLang === 'en';
  const deja = [...boite.querySelectorAll('select')].map((x) => x.value);
  const choix = _mdMins.find((m) => !deja.includes(m)) || _mdMins[0];
  const ligne = document.createElement('div');
  ligne.className = 'md-ligne md-flux-min';
  ligne.innerHTML = `<button type="button" class="md-bouton-doux md-flux-plus" aria-label="${premiere ? (isEn ? 'Add a ministry' : 'Ajouter un ministère') : (isEn ? 'Remove this ministry' : 'Retirer ce ministère')}" onclick="${premiere ? 'mdFluxAjouterMinistere(false)' : 'this.parentElement.remove()'}">${premiere ? '+' : '−'}</button><select aria-label="${isEn ? 'Ministry' : 'Ministère'}" onchange="mdFluxMinistere(this)">${_mdMins.map((m) => `<option value="${mdH(m)}"${m === choix ? ' selected' : ''}>${mdH(m)}</option>`).join('')}</select><input type="text" readonly aria-label="${isEn ? 'Ministry feed' : 'Flux du ministère'}" onfocus="this.select()"><button class="md-bouton-doux" aria-label="${isEn ? 'Copy' : 'Copier'}" onclick="copierCourriel(this, this.previousElementSibling.value)">⧉</button>`;
  boite.appendChild(ligne);
  mdFluxMinistere(ligne.querySelector('select'));
}
function mdFluxMinistere(select){
  const a = select?.parentElement?.querySelector('input');
  if(a) a.value = mdFluxAdresse + '&type=ministere&m=' + encodeURIComponent(select.value);
}
window.mdFluxMinistere = mdFluxMinistere;
window.mdFluxAjouterMinistere = mdFluxAjouterMinistere;

// Même principe pour un mot-clé précis (champ libre) et un élu précis (menu) : + ajoute une ligne.
let _mdElus = [];
const mdBoutonPlus = (premiere, fn, isEn, quoi) => `<button type="button" class="md-bouton-doux md-flux-plus" aria-label="${premiere ? (isEn ? 'Add' : 'Ajouter') : (isEn ? 'Remove' : 'Retirer')} ${quoi}" onclick="${premiere ? fn + '(false)' : 'this.parentElement.remove()'}">${premiere ? '+' : '−'}</button>`;
const mdBoutonCopier = (isEn) => `<button class="md-bouton-doux" aria-label="${isEn ? 'Copy' : 'Copier'}" onclick="copierCourriel(this, this.previousElementSibling.value)">⧉</button>`;
function mdFluxAjouterMot(premiere){
  const boite = document.getElementById('mdFluxMots');
  if(!boite) return;
  const isEn = currentLang === 'en';
  const ligne = document.createElement('div');
  ligne.className = 'md-ligne md-flux-min';
  ligne.innerHTML = `${mdBoutonPlus(premiere, 'mdFluxAjouterMot', isEn, isEn ? 'a keyword' : 'un mot-clé')}<input type="text" class="md-flux-mot" maxlength="60" placeholder="${isEn ? 'e.g. housing' : 'ex. : logement'}" aria-label="${isEn ? 'Keyword' : 'Mot-clé'}" oninput="mdFluxMot(this)"><input type="text" readonly aria-label="${isEn ? 'Keyword feed' : 'Flux du mot-clé'}" onfocus="this.select()">${mdBoutonCopier(isEn)}`;
  boite.appendChild(ligne);
  mdFluxMot(ligne.querySelector('.md-flux-mot'));
}
function mdFluxMot(champ){
  const a = champ?.nextElementSibling;
  const mot = (champ?.value || '').trim();
  if(a) a.value = mot ? mdFluxAdresse + '&type=mots&q=' + encodeURIComponent(mot) : '';
}
function mdFluxAjouterElu(premiere){
  const boite = document.getElementById('mdFluxElus');
  if(!boite) return;
  const isEn = currentLang === 'en';
  const deja = [...boite.querySelectorAll('select')].map((x) => x.value);
  const choix = (_mdElus.find((e) => !deja.includes(e.cle)) || _mdElus[0]).cle;
  const ligne = document.createElement('div');
  ligne.className = 'md-ligne md-flux-min';
  ligne.innerHTML = `${mdBoutonPlus(premiere, 'mdFluxAjouterElu', isEn, isEn ? 'a member' : 'un élu')}<select aria-label="${isEn ? 'Member' : 'Élu'}" onchange="mdFluxElu(this)">${_mdElus.map((e) => `<option value="${mdH(e.cle)}"${e.cle === choix ? ' selected' : ''}>${mdH(e.nom)}</option>`).join('')}</select><input type="text" readonly aria-label="${isEn ? 'Member feed' : 'Flux de l’élu'}" onfocus="this.select()">${mdBoutonCopier(isEn)}`;
  boite.appendChild(ligne);
  mdFluxElu(ligne.querySelector('select'));
}
function mdFluxElu(select){
  const a = select?.nextElementSibling;
  if(a) a.value = mdFluxAdresse + '&type=elus&e=' + encodeURIComponent(select.value);
}
window.mdFluxAjouterMot = mdFluxAjouterMot;
window.mdFluxMot = mdFluxMot;
window.mdFluxAjouterElu = mdFluxAjouterElu;
window.mdFluxElu = mdFluxElu;

// LES ALERTES SUR MESURE (21 oct. 2026), deuxième outil de l'abonnement. Un courriel le matin quand,
// à l'Assemblée nationale, un projet de loi contient un mot-clé, un élu suivi présente un projet ou
// vote, ou un projet de loi suivi change d'étape. Le serveur (api/_alertes-assemblee.js) ne lit que
// les abonné·e·s actifs ; la base (scripts/supabase-alertes-retour.sql) refuse un mot-clé à qui n'est
// pas abonné et en plafonne le nombre. Ici : l'écran, avec le même contrôle que l'export.
const MD_MOTS_MAX = 10;
async function mdAlertes(isEn){
  const zone = document.getElementById('mdAlertes');
  if(!zone) return;
  let abonne = false;
  if(currentUser){
    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch('/api/abonnement', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
      abonne = r.ok && (await r.json()).abonne === true;
    }catch(e){}
  }
  const tete = `<div class="md-carte-tete"><h2>${isEn ? 'Custom alerts' : 'Alertes sur mesure'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'An email in the morning when, at the National Assembly, a bill contains one of your keywords, a member you follow introduces a bill or votes, or a bill you follow moves to a new stage. National Assembly only.' : 'Un courriel le matin quand, à l’Assemblée nationale, un projet de loi contient un de vos mots-clés, un élu que vous suivez présente un projet de loi ou vote, ou un projet de loi que vous suivez change d’étape. Seulement l’Assemblée nationale.'}</p>`;
  if(!abonne){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p></div>`;
    return;
  }
  const [m, p] = await Promise.all([
    supabaseClient.from('alertes_mots_cles').select('id, mot').eq('portee', 'assemblee').order('created_at'),
    supabaseClient.from('alertes_preferences').select('actif').maybeSingle(),
  ]);
  const mots = m.data ?? [];
  const actif = p.data?.actif !== false;
  const nLois = Object.keys(followedBills).filter((id) => followedBills[id]).length;
  const nElus = Object.keys(followed).filter((n) => followed[n]).length + deputesSuivisParNom().length;
  const plein = mots.length >= MD_MOTS_MAX;
  zone.innerHTML = `<div class="md-carte">${tete}
    <p class="md-note"><b>${actif ? (isEn ? 'Alerts on.' : 'Alertes activées.') : (isEn ? 'Alerts paused.' : 'Alertes coupées.')}</b>
      <button class="md-bouton-doux" onclick="mdAlertesActif(${actif ? 'false' : 'true'})">${actif ? (isEn ? 'Pause alerts' : 'Couper les alertes') : (isEn ? 'Turn alerts back on' : 'Rétablir les alertes')}</button></p>
    <h3 class="md-sous-titre">${isEn ? 'What is watched' : 'Ce qui est surveillé'}</h3>
    <ul class="md-avenir-liste">
      <li>${isEn ? `<b>${mots.length}</b> keyword${mots.length > 1 ? 's' : ''} of ${MD_MOTS_MAX}, searched in the title and summary of bills` : `<b>${mots.length}</b> mot${mots.length > 1 ? 's' : ''}-clé${mots.length > 1 ? 's' : ''} sur ${MD_MOTS_MAX}, cherché${mots.length > 1 ? 's' : ''} dans le titre et le résumé des projets de loi`}</li>
      <li>${isEn ? `<b>${nElus}</b> member${nElus > 1 ? 's' : ''} followed: bills introduced and recorded votes` : `<b>${nElus}</b> élu${nElus > 1 ? 's' : ''} suivi${nElus > 1 ? 's' : ''} : projets de loi présentés et votes nominaux`}</li>
      <li>${isEn ? `<b>${nLois}</b> bill${nLois > 1 ? 's' : ''} followed: each new stage` : `<b>${nLois}</b> projet${nLois > 1 ? 's' : ''} de loi suivi${nLois > 1 ? 's' : ''} : chaque nouvelle étape`}</li>
    </ul>
    <h3 class="md-sous-titre">${isEn ? 'Your keywords' : 'Vos mots-clés'}</h3>
    ${mots.length ? `<ul class="md-mots">${mots.map((x) => `<li class="md-mot"><span>${mdH(x.mot)}</span><button class="md-bouton-doux" aria-label="${isEn ? 'Remove' : 'Retirer'} ${mdH(x.mot)}" onclick="mdRetirerMot('${mdH(x.id)}')">×</button></li>`).join('')}</ul>`
      : `<p class="md-note">${isEn ? 'No keyword yet. Click an idea below or type your own.' : 'Aucun mot-clé pour l’instant. Cliquez sur une idée ci-dessous ou tapez le vôtre.'}</p>`}
    ${plein ? `<p class="md-note">${isEn ? `All ${MD_MOTS_MAX} keywords are used. Remove one to add another.` : `Vos ${MD_MOTS_MAX} mots-clés sont utilisés. Retirez-en un pour en ajouter un autre.`}</p>`
      : `<div class="md-ligne"><input type="text" id="mdMot" maxlength="60" placeholder="${isEn ? 'E.g. housing' : 'Ex. : logement'}" aria-label="${isEn ? 'A keyword' : 'Un mot-clé'}">
        <button class="account-btn" onclick="mdAjouterMot()">${isEn ? 'Add' : 'Ajouter'}</button></div>
      <p class="md-exemples"><span>${isEn ? 'Ideas:' : 'Idées :'}</span>${(isEn ? MD_EXEMPLES_EN : MD_EXEMPLES).filter((e) => !mots.some((x) => norm(x.mot) === norm(e))).map((e) => `<button type="button" class="md-exemple" onclick="mdEssayerMot('${mdH(e)}')">+ ${mdH(e)}</button>`).join('')}</p>`}
    <p class="md-note" id="mdMotNote" aria-live="polite"></p>
    <p class="md-note"><button class="md-bouton-doux" onclick="mdEssaiAlertes(this)">${isEn ? 'Send me a test email' : 'M’envoyer un courriel d’essai'}</button>
      ${isEn ? 'The most recent items for each thing you follow, to see what an alert looks like (3 per day). Alerts are in French.' : 'Les éléments les plus récents de chaque suivi, pour voir à quoi ressemble une alerte (3 par jour).'}</p>
  </div>`;
  document.getElementById('mdMot')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); mdAjouterMot(); } });
}
// Exemples cliquables sous le champ des mots-clés (Martin, 4 nov. 2026) : un clic l'ajoute.
const MD_EXEMPLES = ['logement', 'tramway', 'CPE', 'langue française', 'immigration', 'mines', 'santé mentale', 'forêt'];
const MD_EXEMPLES_EN = ['housing', 'tramway', 'daycare', 'French language', 'immigration', 'mining', 'mental health', 'forest'];
function mdEssayerMot(mot){ const champ = document.getElementById('mdMot'); if(!champ) return; champ.value = mot; mdAjouterMot(); }
window.mdEssayerMot = mdEssayerMot;
async function mdAjouterMot(){
  const isEn = currentLang === 'en';
  const champ = document.getElementById('mdMot');
  const note = document.getElementById('mdMotNote');
  const mot = (champ?.value || '').trim().replace(/\s+/g, ' ');
  if(mot.length < 2 || mot.length > 60){ note.textContent = isEn ? 'Between 2 and 60 characters.' : 'Entre 2 et 60 caractères.'; return; }
  const { error } = await supabaseClient.from('alertes_mots_cles').insert({ user_id: currentUser.id, mot, portee: 'assemblee' });
  if(error){
    note.textContent = /duplicate|23505/.test(error.message + error.code) ? (isEn ? 'This keyword is already in your list.' : 'Ce mot-clé est déjà dans votre liste.')
      : /limite de \d+ mots/.test(error.message) ? (isEn ? `All ${MD_MOTS_MAX} keywords are used.` : `Vos ${MD_MOTS_MAX} mots-clés sont utilisés.`)
      : /abonn/.test(error.message) ? (isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.')
      : (isEn ? 'The keyword could not be added. Try again.' : 'Le mot-clé n’a pas pu être ajouté. Réessayez.');
    return;
  }
  mdAlertes(isEn);
}
async function mdRetirerMot(id){
  const isEn = currentLang === 'en';
  const { error } = await supabaseClient.from('alertes_mots_cles').delete().eq('id', id);
  if(error){ const n = document.getElementById('mdMotNote'); if(n) n.textContent = isEn ? 'Could not remove it. Try again.' : 'Impossible de le retirer. Réessayez.'; return; }
  mdAlertes(isEn);
}
async function mdAlertesActif(actif){
  const isEn = currentLang === 'en';
  const { error } = await supabaseClient.from('alertes_preferences').upsert({ user_id: currentUser.id, actif, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if(error){ const n = document.getElementById('mdMotNote'); if(n) n.textContent = isEn ? 'The change was not saved. Try again.' : 'Le changement n’a pas été enregistré. Réessayez.'; return; }
  mdAlertes(isEn);
}
async function mdEssaiAlertes(bouton){
  const isEn = currentLang === 'en';
  const note = document.getElementById('mdMotNote');
  bouton.disabled = true;
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    const r = await fetch('/api/infolettre-envoi?essai=moi', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
    const d = await r.json().catch(() => ({}));
    note.textContent = r.status === 429 ? (isEn ? 'Limit of 3 tests per 24 hours reached.' : 'Limite de 3 essais par 24 heures atteinte.')
      : !r.ok ? (isEn ? 'The test could not be sent. Try again later.' : 'L’essai n’a pas pu partir. Réessayez plus tard.')
      : d.envoye ? (isEn ? 'Test sent: check your inbox.' : 'Essai envoyé : regardez votre boîte de courriel.')
      : (isEn ? 'Nothing to show yet: add a keyword, or follow a bill or a member.' : 'Rien à montrer pour l’instant : ajoutez un mot-clé, ou suivez un projet de loi ou un élu.');
  }catch(e){
    note.textContent = isEn ? 'The test could not be sent. Try again later.' : 'L’essai n’a pas pu partir. Réessayez plus tard.';
  }
  bouton.disabled = false;
}
window.mdAjouterMot = mdAjouterMot;
window.mdRetirerMot = mdRetirerMot;
window.mdAlertesActif = mdAlertesActif;
window.mdEssaiAlertes = mdEssaiAlertes;

// LA VEILLE PAR THÈME (21 oct. 2026), sixième outil de l'abonnement. Chaque lundi, un courriel avec ce
// qui a bougé à l'Assemblée dans les thèmes cochés (api/_veille-theme.js, envoyé par
// api/infolettre-envoi.js). Les choix vont dans alertes_preferences.veille_themes ; la base
// (scripts/supabase-veille.sql) refuse un thème à qui n'est pas abonné. LA MÊME LISTE DE CODES vit
// dans api/_veille-theme.js (THEMES, avec la table ministères → mots) et dans le SQL.
const VEILLE_THEMES = [
  { code: 'sante', fr: 'Santé', en: 'Health' },
  { code: 'education', fr: 'Éducation', en: 'Education' },
  { code: 'logement', fr: 'Logement et habitation', en: 'Housing' },
  { code: 'environnement', fr: 'Environnement et énergie', en: 'Environment and energy' },
  { code: 'economie', fr: 'Économie et finances publiques', en: 'Economy and public finances' },
  { code: 'travail', fr: 'Travail', en: 'Labour' },
  { code: 'justice', fr: 'Justice et sécurité publique', en: 'Justice and public safety' },
  { code: 'immigration', fr: 'Immigration et langue française', en: 'Immigration and French language' },
  { code: 'transports', fr: 'Transports', en: 'Transportation' },
  { code: 'agriculture', fr: 'Agriculture et territoire', en: 'Agriculture and land' },
  { code: 'culture', fr: 'Culture et communications', en: 'Culture and communications' },
  { code: 'municipal', fr: 'Affaires municipales et régions', en: 'Municipal affairs and regions' },
  { code: 'famille', fr: 'Famille et services sociaux', en: 'Family and social services' },
  { code: 'gouvernance', fr: 'Gouvernance et institutions', en: 'Governance and institutions' },
];
async function mdVeille(isEn){
  const zone = document.getElementById('mdVeille');
  if(!zone) return;
  let abonne = false;
  if(currentUser){
    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch('/api/abonnement', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
      abonne = r.ok && (await r.json()).abonne === true;
    }catch(e){}
  }
  const tete = `<div class="md-carte-tete"><h2>${isEn ? 'Topic watch' : 'Veille par thème'}</h2><span class="md-etiquette">${isEn ? 'Subscribers' : 'Abonné·e·s'}</span></div>
    <p>${isEn ? 'Every Monday, one email with everything that moved at the National Assembly in the topics you pick: bills introduced or moving to a new stage, recorded votes on those bills, committee consultations and the briefs filed. Nothing is sent in a week with no news.' : 'Chaque lundi, un courriel avec tout ce qui a bougé à l’Assemblée nationale dans les thèmes choisis : projets de loi présentés ou qui changent d’étape, votes nominaux sur ces projets, consultations en commission et mémoires déposés. Aucun courriel une semaine sans nouveauté.'}</p>`;
  if(!abonne){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.'} <a class="md-lien" href="/abonnement">${isEn ? 'See the subscription' : 'Voir l’abonnement'}</a></p></div>`;
    return;
  }
  const { data, error } = await supabaseClient.from('alertes_preferences').select('veille_themes').maybeSingle();
  if(error){
    zone.innerHTML = `<div class="md-carte">${tete}<p class="md-note">${isEn ? 'Topic watch is not available yet. Come back soon.' : 'La veille par thème n’est pas encore ouverte. Revenez bientôt.'}</p></div>`;
    return;
  }
  const choisis = new Set(data?.veille_themes ?? []);
  zone.innerHTML = `<div class="md-carte">${tete}
    <fieldset class="md-themes"><legend class="md-sous-titre">${isEn ? 'Your topics' : 'Vos thèmes'}</legend>
      ${VEILLE_THEMES.map((t) => `<label class="md-case"><input type="checkbox" value="${t.code}" ${choisis.has(t.code) ? 'checked' : ''} onchange="mdVeilleChoix()"> <span>${isEn ? t.en : t.fr}</span></label>`).join('')}
    </fieldset>
    <p class="md-note" id="mdVeilleNote" aria-live="polite">${choisis.size
      ? (isEn ? `${choisis.size} topic${choisis.size > 1 ? 's' : ''} chosen. Next email: Monday morning, if there is news. Emails are in French.` : `${choisis.size} thème${choisis.size > 1 ? 's' : ''} choisi${choisis.size > 1 ? 's' : ''}. Prochain courriel : lundi matin, s’il y a du neuf.`)
      : (isEn ? 'No topic chosen: no email.' : 'Aucun thème choisi : aucun courriel.')}</p>
    <p class="md-note">${isEn ? 'A bill is placed in a topic by the ministry that introduces it, or else by the words of its title, without AI. A bill with no clear topic is placed nowhere. Votes, consultations and briefs follow their bill.' : 'Un projet de loi entre dans un thème par le ministère qui le présente, sinon par les mots de son titre, sans IA. Un projet sans thème clair n’est classé nulle part. Les votes, les consultations et les mémoires suivent leur projet de loi.'}</p>
  </div>`;
}
async function mdVeilleChoix(){
  const isEn = currentLang === 'en';
  const note = document.getElementById('mdVeilleNote');
  const themes = [...document.querySelectorAll('#mdVeille input[type="checkbox"]:checked')].map((c) => c.value);
  const { error } = await supabaseClient.from('alertes_preferences').upsert({ user_id: currentUser.id, veille_themes: themes, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if(error){
    if(note) note.textContent = /abonn/.test(error.message) ? (isEn ? 'Reserved for subscribers.' : 'Réservé aux abonné·e·s.') : (isEn ? 'The change was not saved. Try again.' : 'Le changement n’a pas été enregistré. Réessayez.');
    return;
  }
  if(note) note.textContent = themes.length
    ? (isEn ? `Saved: ${themes.length} topic${themes.length > 1 ? 's' : ''}. Next email: Monday morning, if there is news.` : `Enregistré : ${themes.length} thème${themes.length > 1 ? 's' : ''}. Prochain courriel : lundi matin, s’il y a du neuf.`)
    : (isEn ? 'Saved: no topic, no email.' : 'Enregistré : aucun thème, aucun courriel.');
}
window.mdVeilleChoix = mdVeilleChoix;

function mdCompte(isEn, quota){
  const zone = document.getElementById('mdCompte');
  if(!currentUser){
    zone.innerHTML = `<div class="mdr-connexion">
      <label class="mdr-connexion-lib" for="mdEmail">${isEn ? 'Sign in' : 'Se connecter'}</label>
      <div class="md-ligne">
        <input type="email" id="mdEmail" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}">
        <button class="mdr-btn-jaune" id="mdLienBtn" onclick="mdEnvoyerLien()">${isEn ? 'Get the link' : 'Recevoir le lien'}</button>
      </div>
      <p class="md-note" id="mdNote" aria-live="polite">${isEn ? 'No password: a sign-in link arrives by email.' : 'Pas de mot de passe : un lien de connexion arrive par courriel.'}</p>
    </div>`;
    document.getElementById('mdEmail')?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); mdEnvoyerLien(); } });
    return;
  }
  zone.innerHTML = `<div class="md-carte md-compte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Your account' : 'Votre compte'}</h2>
      <button class="md-bouton-doux" onclick="signOutUser()">${isEn ? 'Sign out' : 'Se déconnecter'}</button>
    </div>
    <p>${mdH(currentUser.email)}</p>
    ${quota?.sur ? `<p class="md-note md-quota"><b>${isEn ? `${quota.total} of ${quota.sur} follows used` : `${quota.total} suivis sur ${quota.sur}`}</b> — ${isEn
      ? 'bills you follow.' : 'projets de loi suivis.'}
      <br>${isEn ? 'Members you follow are not counted.' : 'Les élus suivis ne comptent pas dans ce total.'}</p>` : ''}
    <div id="mdAbonnement"></div>
  </div>`;
  mdAbonnement(isEn);
}

// L'ABONNEMENT FACULTATIF (remis le 21 oct. 2026). L'état vient TOUJOURS du serveur
// (api/abonnement.js), qui lit la table écrite par le webhook Stripe : le navigateur ne décide
// jamais seul qui est abonné. Le suivi reste à 3 pour tout le monde, abonné ou non.
async function abEtatServeur(){
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    const r = await fetch('/api/abonnement', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
    return r.ok ? await r.json() : null;
  }catch(e){ return null; }
}
const abDate = (iso, isEn) => new Date(iso).toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { year:'numeric', month:'long', day:'numeric' });

// Les boutons Gérer / Annuler, communs à Mon dossier et à /abonnement. « Annuler mon abonnement » :
// le bouton que la loi exige pour un abonnement conclu en ligne (Loi 10, Québec).
function abBoutonsGestion(etat, isEn){
  return `${etat.gerable ? `<button type="button" class="account-btn" onclick="abAction('portail', this)">${isEn ? 'Manage my subscription' : 'Gérer mon abonnement'}</button> ` : ''}
    ${etat.annulable ? `<button type="button" class="md-bouton-doux" onclick="abAction('annuler', this)">${isEn ? 'Cancel my subscription' : 'Annuler mon abonnement'}</button>` : ''}`;
}
function abPhraseActive(etat, isEn){
  // Un abonnement offert par quelqu'un d'autre (21 oct. 2026) : il suit les paiements du donateur.
  if(etat.source === 'offert' && etat.fin) return etat.annulationPrevue
    ? (isEn ? `Your subscription is a gift. The person giving it has cancelled it: it stays active until ${abDate(etat.fin, isEn)}.` : `Votre abonnement est offert. La personne qui vous l’offre l’a annulé : il reste actif jusqu’au ${abDate(etat.fin, isEn)}.`)
    : (isEn ? `Your subscription is a gift: it renews as long as the person giving it keeps paying (next renewal around ${abDate(etat.fin, isEn)}).` : `Votre abonnement est offert : il se renouvelle tant que la personne qui vous l’offre le paie (prochaine échéance vers le ${abDate(etat.fin, isEn)}).`);
  if(etat.annulationPrevue && etat.fin) return isEn
    ? `Cancelled: it stays active until ${abDate(etat.fin, isEn)}, then stops with no further charge.`
    : `Annulé : il reste actif jusqu’au ${abDate(etat.fin, isEn)}, puis il s’arrête sans autres frais.`;
  // Un abonnement offert (code cadeau) ne se renouvelle pas : sa date de fin se dit.
  if(!etat.gerable && etat.fin) return isEn
    ? `Your subscription is active until ${abDate(etat.fin, isEn)}.`
    : `Votre abonnement est actif jusqu’au ${abDate(etat.fin, isEn)}.`;
  return isEn ? 'Your subscription is active. Thank you.' : 'Votre abonnement est actif. Merci.';
}

async function mdAbonnement(isEn, avisCode){
  const zone = document.getElementById('mdAbonnement');
  if(ASSEMBLY.abonnement === false){ if(zone){ zone.innerHTML = ''; zone.hidden = true; } return; }   // N.-B. : abonnement éteint
  if(!zone) return;
  const [etat, codes] = await Promise.all([abEtatServeur(), abMesCodes(isEn)]);
  if(!document.body.contains(zone)) return;   // la carte a été redessinée entre-temps
  // « Offrir » sous « Votre compte », pour tout compte connecté (Martin, 21 oct. 2026).
  const merci = new URLSearchParams(location.search).get('cadeau') === 'merci'
    ? `<p class="md-note"><b>${isEn ? 'Thank you.' : 'Merci.'}</b> ${isEn ? 'Your gift code is on its way by email; it also appears below within a minute.' : 'Votre code cadeau part par courriel ; il paraît aussi ci-dessous d’ici une minute.'}</p>`
    : ({
      merci: `<p class="md-note"><b>${isEn ? 'Thank you.' : 'Merci.'}</b> ${isEn ? 'The code of the subscription you are giving is on its way by email; it also appears below within a minute.' : 'Le code de l’abonnement que vous offrez part par courriel ; il paraît aussi ci-dessous d’ici une minute.'}</p>`,
      annulation: `<p class="md-note">${isEn ? 'The subscription you were giving is cancelled: no further charge after the current period.' : 'L’abonnement que vous offriez est annulé : plus aucun débit après la période en cours.'}</p>`,
    }[new URLSearchParams(location.search).get('offert')] || '');
  // Offrir et faire valoir un code (remis le 21 oct. 2026) : la même case que sur /abonnement.
  const cadeau = `${merci}<div class="md-ligne"><input type="text" class="ab-code-champ" autocomplete="off" spellcheck="false" maxlength="40" placeholder="${isEn ? 'Enter your code here' : 'Mettez votre code ici'}" aria-label="${isEn ? 'Enter your code here' : 'Mettez votre code ici'}"> <button type="button" class="account-btn" onclick="abUtiliserCode(this)">${isEn ? 'Use the code' : 'Utiliser le code'}</button></div>
    <p class="md-note ab-code-etat" aria-live="polite">${avisCode ? mdH(avisCode) : ''}</p>
    ${codes}`;
  if(etat?.abonne){
    zone.innerHTML = `<p class="md-note"><a class="md-lien" href="/abonnement${isEn ? '?lang=en' : ''}"><b>${isEn ? 'Subscriber' : 'Abonné·e'}</b></a> — ${abPhraseActive(etat, isEn)}</p>
      <p class="md-ligne">${abBoutonsGestion(etat, isEn)}</p><p class="md-note ab-action-etat" aria-live="polite"></p>${cadeau}`;
  }else{
    zone.innerHTML = `<p class="md-note">${isEn ? 'Free account.' : 'Compte gratuit.'} <a class="md-lien" href="/abonnement${isEn ? '?lang=en' : ''}"><b>${isEn ? 'Subscribe' : 'Abonnez-vous'}</b></a></p>${cadeau}`;
  }
}

async function renderAbonnement(){
  const zone = document.getElementById('abEtat');
  if(!zone) return;   // pas sur cette page
  const isEn = currentLang === 'en';
  const q = new URLSearchParams(location.search).get('abonnement');
  const etat = await abEtatServeur();
  const avis = q === 'annule'
    ? `<p class="md-note">${isEn ? 'Payment interrupted: nothing was charged.' : 'Paiement interrompu : rien n’a été débité.'}</p>`
    : q === 'annulation'
      ? `<p class="md-note">${isEn ? 'Cancellation sent to Stripe. If this page still says the subscription is active, the confirmation is a few seconds away: reload it. Access stays open until the end of the period already paid for.' : 'Annulation transmise à Stripe. Si cette page dit encore que l’abonnement est actif, la confirmation arrive dans quelques secondes : rechargez-la. L’accès reste ouvert jusqu’à la fin de la période déjà payée.'}</p>`
      : '';
  let corps;
  if(!etat){
    corps = `<p>${isEn ? 'Payment is not responding right now. Reload the page in a moment.' : 'Le paiement ne répond pas pour l’instant. Rechargez la page dans un moment.'}</p>`;
  }else if(etat.abonne){
    corps = `<p>${abPhraseActive(etat, isEn)}</p><p class="md-ligne">${abBoutonsGestion(etat, isEn)}</p>`;
  }else if(etat.peutPayer){
    const nom = { mensuel: isEn ? '$9.99 a month' : '9,99 $ par mois', trimestriel: isEn ? '$26.99 every 3 months' : '26,99 $ tous les 3 mois', annuel: isEn ? '$99 a year' : '99 $ par an' };
    const boutons = ['mensuel', 'trimestriel', 'annuel'].filter((f) => etat.forfaits?.[f])
      .map((f) => `<button type="button" class="account-btn" onclick="abAction('paiement', this, '${f}')">${isEn ? 'Subscribe' : 'S’abonner'} — ${nom[f]}</button>`).join(' ');
    corps = `${etat.mode === 'test' ? `<p class="md-note"><b>${isEn ? 'Test mode' : 'Mode essai'}</b> : ${isEn ? 'no real card is charged. Test card 4242 4242 4242 4242, any future date, any code.' : 'aucune vraie carte n’est débitée. Carte d’essai 4242 4242 4242 4242, une date future, n’importe quel code.'}</p>` : ''}
      <p class="md-ligne">${boutons}</p>`;
  }else if(etat.ouvert && !etat.connecte){
    // La connexion sur place (Martin, 21 oct. 2026) : on choisit un forfait, on entre son courriel ici.
    corps = `<p>${isEn ? 'Enter your email: a sign-in link arrives, no password. Then pick your plan above.' : 'Entrez votre courriel : un lien de connexion arrive, sans mot de passe. Ensuite, choisissez votre forfait plus haut.'}</p>
      <div class="md-ligne"><input type="email" id="abEmail" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}"> <button type="button" class="account-btn" id="abLienBtn" onclick="abEnvoyerLien()">${isEn ? 'Get the link' : 'Recevoir le lien'}</button></div>
      <p class="md-note">${isEn ? 'Open the link in this same browser, then come back to this page.' : 'Ouvrez le lien dans ce même navigateur, puis revenez sur cette page.'}</p>`;
  }else{
    corps = `<p>${isEn ? 'Payment is not open yet. Everything on the site stays free in the meantime.' : 'Le paiement n’est pas encore ouvert. Tout le site reste gratuit d’ici là.'}</p>`;
  }
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete"><h2>${etat?.abonne ? (isEn ? 'Your subscription' : 'Votre abonnement') : etat && !etat.connecte ? (isEn ? 'Sign in' : 'S’identifier') : (isEn ? 'Subscribe' : 'S’abonner')}</h2></div>
    ${avis}${corps}<p class="md-note ab-action-etat" aria-live="polite"></p>
  </div>`;
  // Pas connecté : la case du code le dit aussi, avant qu'on la remplisse.
  { const carte = document.querySelector('#code .md-carte');
    carte?.querySelector('.ab-code-connexion')?.remove();
    if(carte && etat && !etat.connecte) carte.querySelector('.md-carte-tete')?.insertAdjacentHTML('beforeend', `<span class="md-etiquette ab-code-connexion">${isEn ? 'Sign in first' : 'Identifiez-vous d’abord'}</span>`); }
  // Pas connecté : chaque case de forfait le dit (Martin, 21 oct. 2026).
  document.querySelectorAll('.ab-forfaits').forEach((u) => { u.classList.toggle('ab-sans-compte', Boolean(etat && !etat.connecte)); u.querySelectorAll('.ab-forfait').forEach((li) => { li.dataset.avis = isEn ? 'Sign in first' : 'Identifiez-vous d’abord'; }); });
  _abEtat = etat;
  // Un forfait choisi avant la connexion reste marqué au retour du lien.
  let garde = null; try{ garde = localStorage.getItem('dossierquebec:forfait'); }catch(e){}
  if(garde) abMarquerForfait(garde);
}

// LES CASES DES FORFAITS, CLIQUABLES (Martin, 21 oct. 2026 : « je pensais que ces cases allaient
// devenir jaunes au survol pour la sélection »). Abonné : rien à choisir. Connecté : Stripe s'ouvre
// sur ce forfait. Pas connecté : le forfait est retenu et la case de connexion prend le relais.
let _abEtat = null;
function abMarquerForfait(f){
  document.querySelectorAll('.ab-forfait').forEach((li) => li.classList.toggle('ab-forfait-choisi', li.dataset.forfait === f));
}
function abChoisirForfait(f){
  const isEn = currentLang === 'en';
  abMarquerForfait(f);
  const zone = document.getElementById('abEtat');
  const note = zone?.querySelector('.ab-action-etat');
  if(_abEtat?.abonne){ zone?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if(_abEtat?.peutPayer && _abEtat.forfaits?.[f]){
    abAction('paiement', document.querySelector(`.ab-forfait[data-forfait="${f}"]`), f);
    return;
  }
  try{ localStorage.setItem('dossierquebec:forfait', f); }catch(e){}
  zone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('abEmail')?.focus();
  if(note && !_abEtat?.ouvert) note.textContent = isEn ? 'Payment is not open yet.' : 'Le paiement n’est pas encore ouvert.';
}
async function abEnvoyerLien(){
  const isEn = currentLang === 'en';
  const champ = document.getElementById('abEmail'), btn = document.getElementById('abLienBtn');
  const note = document.querySelector('#abEtat .ab-action-etat');
  const email = (champ?.value || '').trim();
  if(!email || !champ.checkValidity()){ champ?.focus(); return; }
  btn.disabled = true;
  const erreur = await signInWithMagicLink(email);
  btn.disabled = false;
  if(note) note.textContent = erreur
    ? (isEn ? 'The link could not be sent. Try again in a moment.' : 'Le lien n’a pas pu partir. Réessayez dans un moment.')
    : (isEn ? '✓ Check your email: the sign-in link is on its way.' : '✓ Vérifiez vos courriels : le lien de connexion est en route.');
}
window.abChoisirForfait = abChoisirForfait;
window.abEnvoyerLien = abEnvoyerLien;

// Ouvre Stripe (paiement, portail ou annulation). L'adresse vient du serveur, jamais du navigateur.
async function abAction(action, bouton, forfait){
  const isEn = currentLang === 'en';
  const note = bouton?.closest('.md-carte')?.querySelector('.ab-action-etat') || document.querySelector('#abEtat .ab-action-etat');
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){ location.assign('/mon-dossier'); return; }
  if(bouton) bouton.disabled = true;
  if(note) note.textContent = isEn ? 'Opening Stripe…' : 'Ouverture de Stripe…';
  const r = await fetch(`/api/abonnement?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ langue: isEn ? 'en' : 'fr', forfait: forfait || 'mensuel' }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if(d.url){ try{ localStorage.removeItem('dossierquebec:forfait'); }catch(e){} location.assign(d.url); return; }
  if(bouton) bouton.disabled = false;
  if(note) note.textContent = r?.status === 409
    ? (isEn ? 'Your subscription is already active.' : 'Votre abonnement est déjà actif.')
    : (d.erreur === 'prix mal configuré' || d.erreur === 'forfait indisponible')
      ? (isEn ? 'Payment is being set up: nothing was charged. Try again a little later.' : 'Le paiement est en cours de configuration : rien n’a été débité. Réessayez un peu plus tard.')
      : (isEn ? 'Stripe is not responding right now. Try again in a minute.' : 'Stripe ne répond pas pour l’instant. Réessayez dans une minute.');
}
window.abAction = abAction;

// OFFRIR UN ABONNEMENT (remis le 21 oct. 2026). Un paiement unique chez Stripe ; le webhook
// fabrique le code et l'envoie par courriel à l'acheteur. Le navigateur n'envoie que le NOM de la
// durée : le montant est fixé par le serveur (api/_cadeau.js).
async function abOffrir(duree, case_){
  const isEn = currentLang === 'en';
  const carte = case_?.closest('.md-carte');
  const note = carte?.querySelector('.ab-cadeau-etat') || case_?.closest('.md-cadeau-discret')?.querySelector('.ab-cadeau-etat');
  document.querySelectorAll('.ab-cadeau').forEach((li) => li.classList.toggle('ab-forfait-choisi', li === case_));
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    if(note) note.innerHTML = isEn
      ? 'Sign in first: <a class="md-lien" href="/mon-dossier">My file</a>, then come back to this page.'
      : 'Connectez-vous d’abord : <a class="md-lien" href="/mon-dossier">Mon dossier</a>, puis revenez sur cette page.';
    return;
  }
  if(_abEtat && !_abEtat.peutOffrir){
    if(note) note.textContent = isEn ? 'Payment is not open yet.' : 'Le paiement n’est pas encore ouvert.';
    return;
  }
  if(note) note.textContent = isEn ? 'Opening Stripe…' : 'Ouverture de Stripe…';
  const r = await fetch('/api/abonnement?action=cadeau', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ duree, quantite: case_?.closest('.md-cadeau-puces')?.querySelector('.md-cadeau-qte')?.value || 1, langue: isEn ? 'en' : 'fr' }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if(d.url){ location.assign(d.url); return; }
  if(note) note.textContent = r?.status === 403
    ? (isEn ? 'Payment is not open yet.' : 'Le paiement n’est pas encore ouvert.')
    : (isEn ? 'Stripe is not responding right now. Try again in a minute.' : 'Stripe ne répond pas pour l’instant. Réessayez dans une minute.');
}
window.abOffrir = abOffrir;

// OFFRIR UN ABONNEMENT RÉCURRENT (21 oct. 2026). Un abonnement Stripe ordinaire, payé par le
// donateur au profit de quelqu'un d'autre, jusqu'à ce qu'il annule. Le navigateur n'envoie que le
// NOM du forfait (api/abonnement.js, action « offrir »).
async function abOffrirAbonnement(forfait, case_){
  const isEn = currentLang === 'en';
  const carte = case_?.closest('.md-carte');
  const note = carte?.querySelector('.ab-offert-etat') || case_?.closest('.md-cadeau-discret')?.querySelector('.ab-cadeau-etat');
  document.querySelectorAll('.ab-offert').forEach((li) => li.classList.toggle('ab-forfait-choisi', li === case_));
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    if(note) note.innerHTML = isEn
      ? 'Sign in first: <a class="md-lien" href="/mon-dossier">My file</a>, then come back to this page.'
      : 'Connectez-vous d’abord : <a class="md-lien" href="/mon-dossier">Mon dossier</a>, puis revenez sur cette page.';
    return;
  }
  if(_abEtat && !_abEtat.peutOffrir){
    if(note) note.textContent = isEn ? 'Payment is not open yet.' : 'Le paiement n’est pas encore ouvert.';
    return;
  }
  if(note) note.textContent = isEn ? 'Opening Stripe…' : 'Ouverture de Stripe…';
  const r = await fetch('/api/abonnement?action=offrir', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ forfait, quantite: case_?.closest('.md-cadeau-puces')?.querySelector('.md-cadeau-qte')?.value || 1, langue: isEn ? 'en' : 'fr' }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if(d.url){ location.assign(d.url); return; }
  if(note) note.textContent = r?.status === 403
    ? (isEn ? 'Payment is not open yet.' : 'Le paiement n’est pas encore ouvert.')
    : (d.erreur === 'prix mal configuré' || d.erreur === 'forfait indisponible')
      ? (isEn ? 'Payment is being set up: nothing was charged. Try again a little later.' : 'Le paiement est en cours de configuration : rien n’a été débité. Réessayez un peu plus tard.')
      : (isEn ? 'Stripe is not responding right now. Try again in a minute.' : 'Stripe ne répond pas pour l’instant. Réessayez dans une minute.');
}
window.abOffrirAbonnement = abOffrirAbonnement;

// Gérer ou annuler un abonnement offert : le portail Stripe du donateur, ouvert sur celui-ci.
async function abGererOffert(action, bouton){
  const isEn = currentLang === 'en';
  const note = bouton?.closest('#mdAbonnement')?.querySelector('.ab-offert-etat');
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session) return;
  bouton.disabled = true;
  if(note) note.textContent = isEn ? 'Opening Stripe…' : 'Ouverture de Stripe…';
  const r = await fetch(`/api/abonnement?action=${action === 'annuler' ? 'annuler' : 'portail'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ offert: bouton.dataset.code, langue: isEn ? 'en' : 'fr' }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if(d.url){ location.assign(d.url); return; }
  bouton.disabled = false;
  if(note) note.textContent = isEn ? 'Stripe is not responding right now. Try again in a minute.' : 'Stripe ne répond pas pour l’instant. Réessayez dans une minute.';
}
window.abGererOffert = abGererOffert;

// Le lien de la carte cadeau (courriel) : /abonnement?code=XXXX remplit la case.
function abCodeDuLien(){
  // Gardé le temps de s'identifier : le lien de connexion ramène sans le ?code=.
  let c = new URLSearchParams(location.search).get('code');
  try{ if(c) localStorage.setItem('dossierquebec:code', c); else c = localStorage.getItem('dossierquebec:code'); }catch(e){}
  if(!c) return;
  const champ = document.querySelector('#code .ab-code-champ');
  if(champ && !champ.value){ champ.value = c.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40); champ.closest('#code')?.scrollIntoView({ block: 'center' }); }
}
document.addEventListener('DOMContentLoaded', () => setTimeout(abCodeDuLien, 300));

// La case « Mettez votre code ici », sur /abonnement et dans Mon dossier. Le serveur vérifie tout
// (code inconnu ou déjà servi, 10 essais par heure) et écrit l'abonnement.
function abRaisonCode(d, isEn){
  const t = {
    inconnu: ['Ce code n’existe pas. Vérifiez-le et réessayez.', 'This code does not exist. Check it and try again.'],
    utilise: ['Ce code a déjà servi.', 'This code has already been used.'],
    stripe: ['Vous avez déjà un abonnement payé par carte : le code ne peut pas s’y ajouter. Gardez-le pour plus tard, ou offrez-le.', 'You already have a subscription paid by card: the code cannot be added to it. Keep it for later, or give it away.'],
    permanent: ['Votre accès est déjà permanent : gardez le code, ou offrez-le.', 'Your access is already permanent: keep the code, or give it away.'],
    soi_meme: ['C’est vous qui offrez cet abonnement : donnez le code à la personne que vous abonnez.', 'You are the one giving this subscription: give the code to the person you are subscribing.'],
    termine: ['Cet abonnement offert a été annulé : le code ne vaut plus.', 'This gift subscription was cancelled: the code is no longer valid.'],
    deja_abonne: ['Votre abonnement est déjà actif : le code reste neuf. Gardez-le pour la fin de votre abonnement, ou rendez-le à la personne qui vous l’a donné.', 'Your subscription is already active: the code stays unused. Keep it for when your subscription ends, or give it back to the person who gave it to you.'],
    offert: ['Votre abonnement vous est déjà offert par quelqu’un : le code ne peut pas s’y ajouter. Gardez-le pour plus tard.', 'Your subscription is already a gift from someone: the code cannot be added to it. Keep it for later.'],
    trop: ['Trop d’essais. Réessayez dans une heure.', 'Too many tries. Try again in an hour.'],
    connexion: ['Connectez-vous d’abord.', 'Sign in first.'],
  }[d?.raison];
  return t ? t[isEn ? 1 : 0] : (isEn ? 'The code could not be used. Try again in a moment.' : 'Le code n’a pas pu servir. Réessayez dans un moment.');
}
async function abUtiliserCode(bouton){
  const isEn = currentLang === 'en';
  const carte = bouton.closest('.md-carte, #mdAbonnement');
  const champ = carte?.querySelector('.ab-code-champ');
  const note = carte?.querySelector('.ab-code-etat');
  const code = (champ?.value || '').trim();
  if(!code){ champ?.focus(); return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    if(note) note.innerHTML = isEn
      ? 'Sign in first: <a class="md-lien" href="/mon-dossier">My file</a>, then come back with your code.'
      : 'Connectez-vous d’abord : <a class="md-lien" href="/mon-dossier">Mon dossier</a>, puis revenez avec votre code.';
    return;
  }
  bouton.disabled = true;
  const r = await fetch('/api/abonnement?action=code', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  bouton.disabled = false;
  if(d.ok){ try{ localStorage.removeItem('dossierquebec:code'); }catch(e){}
    const fait = d.offert
      ? (isEn
        ? '✓ Done: your subscription is active. It renews as long as the person giving it keeps paying.'
        : '✓ C’est fait : votre abonnement est actif. Il se renouvelle tant que la personne qui vous l’offre le paie.')
      : isEn
        ? `✓ Done: your subscription is active until ${abDate(d.fin, true)}.`
        : `✓ C’est fait : votre abonnement est actif jusqu’au ${abDate(d.fin, false)}.`;
    if(champ) champ.value = '';
    if(note) note.textContent = fait;
    renderAbonnement();
    if(carte?.id === 'mdAbonnement') mdAbonnement(isEn, fait);
    return;
  }
  if(note) note.textContent = abRaisonCode(d, isEn);
}
window.abUtiliserCode = abUtiliserCode;

// Les codes achetés par ce compte (Mon dossier), utilisés ou non.
// ✉ et ⧉ à côté d'un code pas encore utilisé (Martin, 21 oct. 2026) : le message tout prêt, avec le lien
// qui remplit la case du code, à envoyer par courriel ou à coller où l'on veut.
function abMessageCode(code, quoi, isEn){
  const lien = `${location.origin}/abonnement?code=${encodeURIComponent(code.replace(/-/g, ''))}${isEn ? '&lang=en' : ''}#code`;
  return {
    sujet: isEn ? 'A DossierBC subscription for you' : 'Un abonnement à DossierBC pour vous',  // N.-B.
    corps: isEn
      ? `I am giving you ${quoi} of DossierBC: bills, votes and MLAs of the British Columbia Legislative Assembly, with the subscriber tools.

Click to activate it (the code is already filled in):
${lien}

Code: ${code}`
      : `Je vous offre ${quoi} à DossierBC : projets de loi, votes et élu·e·s de l’Assemblée législative de la Colombie-Britannique, avec les outils des abonné·e·s.

Cliquez pour l’activer (le code est déjà inscrit) :
${lien}

Code : ${code}`,
  };
}
function abBoutonsCode(code, quoi, isEn){
  const m = abMessageCode(code, quoi, isEn);
  const mail = `mailto:?subject=${encodeURIComponent(m.sujet)}&body=${encodeURIComponent(m.corps)}`;
  return ` <a class="md-bouton-doux" href="${mail}" title="${isEn ? 'Send by email' : 'Envoyer par courriel'}">✉</a> <button type="button" class="md-bouton-doux" data-texte="${mdH(m.corps)}" title="${isEn ? 'Copy the message' : 'Copier le message'}" onclick="abCopierCode(this)">⧉</button>`;
}
function abCopierCode(b){
  const isEn = currentLang === 'en';
  const fait = () => { b.textContent = '✓'; setTimeout(() => { b.textContent = '⧉'; }, 1500); };
  (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.texte) : Promise.reject()).then(fait).catch(() => window.prompt(isEn ? 'Copy:' : 'Copiez :', b.dataset.texte));
}
window.abCopierCode = abCopierCode;

async function abMesCodes(isEn){
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session) return '';
    const r = await fetch('/api/abonnement?action=codes', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const d = r.ok ? await r.json() : {};
    const codes = d.codes || [], offerts = d.offerts || [];
    const duree = (m) => isEn ? (m === 1 ? '1 month' : m === 12 ? '1 year' : `${m} months`) : (m === 1 ? '1 mois' : m === 12 ? '1 an' : `${m} mois`);
    const utilise = (u) => u ? (isEn ? 'used' : 'utilisé') : (isEn ? 'not used yet' : 'pas encore utilisé');
    const listeCodes = codes.length ? `<p class="md-note"><b>${isEn ? 'Your gift codes' : 'Vos codes cadeaux'}</b></p><ul class="ab-mes-codes">${codes.map((c) =>
      `<li><code>${mdH(c.code)}</code> — ${duree(c.mois)} — ${utilise(c.utilise)}${c.utilise ? '' : abBoutonsCode(c.code, isEn ? duree(c.mois) : `${duree(c.mois)} d’abonnement`, isEn)}</li>`).join('')}</ul>` : '';
    // Les abonnements RÉCURRENTS offerts (21 oct. 2026) : le donateur les gère et les annule d'ici.
    const rythme = { mensuel: isEn ? 'every month' : 'chaque mois', trimestriel: isEn ? 'every 3 months' : 'chaque trimestre', annuel: isEn ? 'every year' : 'chaque année' };
    const etatOffert = (o) => !o.actif
      ? (isEn ? 'ended' : 'terminé')
      : o.annulationPrevue && o.fin
        ? (isEn ? `cancelled, ends on ${abDate(o.fin, true)}` : `annulé, se termine le ${abDate(o.fin, false)}`)
        : '';
    const listeOfferts = offerts.length ? `<p class="md-note"><b>${isEn ? 'Subscriptions you are giving' : 'Vos abonnements offerts'}</b></p><ul class="ab-mes-codes">${offerts.map((o) =>
      `<li><code>${mdH(o.code)}</code> — ${isEn ? 'gift subscription, renewed' : 'abonnement offert, renouvelé'} ${rythme[o.forfait] || ''} — ${utilise(o.utilise)}${!o.utilise && o.actif ? abBoutonsCode(o.code, isEn ? 'a subscription' : 'un abonnement', isEn) : ''}${etatOffert(o) ? ` — ${etatOffert(o)}` : ''}${o.actif
        ? ` <button type="button" class="md-bouton-doux" data-code="${mdH(o.code)}" onclick="abGererOffert('portail', this)">${isEn ? 'Manage' : 'Gérer'}</button>${o.annulationPrevue ? '' : ` <button type="button" class="md-bouton-doux" data-code="${mdH(o.code)}" onclick="abGererOffert('annuler', this)">${isEn ? 'Cancel' : 'Annuler'}</button>`}`
        : ''}</li>`).join('')}</ul><p class="md-note ab-offert-etat" aria-live="polite"></p>` : '';
    return listeCodes + listeOfferts;
  }catch(e){ return ''; }
}

async function mdEnvoyerLien(){
  const input = document.getElementById('mdEmail');
  const note = document.getElementById('mdNote');
  const btn = document.getElementById('mdLienBtn');
  const isEn = currentLang === 'en';
  const email = input ? input.value.trim() : '';
  if(!email || !input.checkValidity() || !btn || btn.disabled){ input?.focus(); return; }
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi en cours…';
  const error = await signInWithMagicLink(email);
  if(error){
    btn.disabled = false;
    note.textContent = error.code === 'over_email_send_rate_limit'
      ? (isEn ? 'A link was already sent recently — check your inbox, or wait a bit.' : 'Un lien a déjà été envoyé récemment — vérifiez vos courriels, ou attendez un peu.')
      : (isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.');
    return;
  }
  btn.textContent = isEn ? '✓ Link sent' : '✓ Lien envoyé';
  note.textContent = isEn ? `Check your inbox (${email}).` : `Vérifiez vos courriels (${email}).`;
}

function mdLois(isEn, quota){
  const zone = document.getElementById('mdLois');
  const ids = Object.keys(followedBills).filter((id) => followedBills[id]);
  // Le plafond est commun à tout ce qu'on suit : il est affiché une seule fois, dans la carte du
  // compte. Ici, juste le nombre de projets de loi.
  const plafond = quota?.sur ?? MD_PLAFOND;
  const suivables = bills.filter((b) => loiVivante(b) && (b.status === 'encours' || b.status === 'laisse_de_cote')).length;
  const vide = !currentUser
    ? (isEn ? 'Sign in to follow bills: what you follow stays with your account, on every device.' : 'Connectez-vous pour suivre des projets de loi : vos suivis restent sur votre compte, sur tous vos appareils.')
    : suivables
      ? `${isEn ? 'No bill followed yet.' : 'Aucun projet de loi suivi.'} <a class="md-lien" href="/projets-de-loi">${isEn ? 'Follow one from the Bills page' : 'Suivez-en un depuis la page Projets de loi'}</a>`
      : (isEn ? 'No bill can be followed right now: the Assembly has no bill under study. The buttons come back with the first bills of the new legislature.' : 'Aucun projet de loi ne peut être suivi pour l’instant : l’Assemblée n’en a aucun à l’étude. Les boutons reviendront avec les premiers projets de la nouvelle législature.');
  const lignes = ids.map((id) => {
    const b = bills.find((x) => String(x.id) === String(id));
    if(!b) return `<li class="md-ligne-loi"><div><b>${isEn ? 'Bill no longer in the current legislature' : 'Projet de loi absent de la législature en cours'}</b>
      <div class="md-note">${isEn ? 'It became law in an earlier session, or its legislature ended.' : 'Il est devenu loi lors d’une session précédente, ou sa législature a pris fin.'}</div></div>
      <button class="md-bouton-doux" onclick="mdRetirerLoi('${mdH(id)}')">${isEn ? 'Stop following' : 'Ne plus suivre'}</button></li>`;
    const note = isEn ? (b.noteEn || b.note) : b.note;
    return `<li class="md-ligne-loi">
      <div>
        <div class="md-loi-tete"><span class="md-pl">PL ${mdH(b.num)}</span> <span class="status-pill ${statusClass(b.status)}">${statusLabel(b.status, b.step)}</span></div>
        <b>${mdH(isEn ? (b.titleEn || b.title) : b.title)}</b>
        <div class="md-note">${mdH(note || '')}</div>
        <div class="md-liens"><a class="md-lien" href="/projets-de-loi?pl=${encodeURIComponent(b.num)}&id=${encodeURIComponent(b.id)}">${isEn ? 'Its card and summary' : 'Sa fiche et son résumé'}</a>
          <a class="md-lien" href="${mdH(isEn ? (b.urlEn || b.url) : b.url)}" target="_blank" rel="noopener">${isEn ? 'On the Assembly’s website ↗' : 'Sur le site de l’Assemblée ↗'}</a></div>
      </div>
      <button class="md-bouton-doux" onclick="mdRetirerLoi('${mdH(b.id)}')">${isEn ? 'Stop following' : 'Ne plus suivre'}</button>
    </li>`;
  }).join('');
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Bills you follow' : 'Projets de loi suivis'}</h2>
      <span class="md-etiquette">${ids.length}</span>
    </div>
    ${ids.length ? `<ul class="md-liste">${lignes}</ul>` : `<p>${vide}</p>`}
    <p class="md-note">${isEn ? `${plafond} follows in all — bills and city projects together.` : `${plafond} suivis en tout — projets de loi et projets de ville ensemble.`}</p>
  </div>`;
}

async function mdRetirerLoi(id){
  await toggleFollowBill(Number(id), null);
  renderMonDossier();
}

function mdElus(isEn){
  const zone = document.getElementById('mdElus');
  const ministres = Object.keys(followed).filter((n) => followed[n]);
  const deps = deputesSuivisParNom();
  const ligne = (nom, sous, onclick) => `<li class="md-ligne-elu"><div><b>${mdH(nom)}</b>${sous ? `<div class="md-note">${mdH(sous)}</div>` : ''}</div>
    <button class="md-bouton-doux" onclick="${onclick}">${isEn ? 'Unfollow' : 'Ne plus suivre'}</button></li>`;
  const lignes = [
    ...ministres.map((n) => ligne(n, ministers.find((m) => m.name === n) ? (isEn ? (ministers.find((m) => m.name === n).roleEn || ministers.find((m) => m.name === n).role) : ministers.find((m) => m.name === n).role) : '', `mdRetirerElu('minister', '${mdH(n).replace(/'/g, "\\'")}')`)),
    ...deps.map(([nom, sous]) => ligne(nom, sous, `mdRetirerDeputeNom('${mdH(nom).replace(/'/g, "\\'")}')`)),
  ].join('');
  zone.innerHTML = `<div class="md-carte">
    <div class="md-carte-tete">
      <h2>${isEn ? 'Members you follow' : 'Élus suivis'}</h2>
      <span class="md-etiquette">${ministres.length + deps.length}</span>
    </div>
    ${lignes ? `<ul class="md-liste">${lignes}</ul>` : `<p>${isEn ? 'No minister or MLA followed yet.' : 'Aucun ministre ni député suivi.'} <a class="md-lien" href="/ministres">${isEn ? 'Follow someone from the Ministers and MLAs page' : 'Suivez quelqu’un depuis la page Ministres et député·e·s'}</a></p>`}
  </div>`;
}

// Une personne suivie avant et après le 5 octobre a deux clés « Nom|Circonscription » (ex. Maïté
// Blanchette Vézina, Rimouski puis La Peltrie) : une seule ligne, la circonscription actuelle (4 nov. 2026).
function deputesSuivisParNom(){
  const parNom = new Map();
  for(const k of Object.keys(followedDeputes).filter((x) => followedDeputes[x])){
    const [nom, circ] = k.split('|');
    parNom.set(nom, circ || '');   // la clé la plus récente l'emporte
  }
  return [...parNom].map(([nom, circ]) => [nom, (typeof deputes !== 'undefined' && deputes.find((d) => d.name === nom)?.riding) || circ]);
}
async function mdRetirerDeputeNom(nom){
  for(const k of Object.keys(followedDeputes).filter((x) => followedDeputes[x] && x.split('|')[0] === nom)) await toggleFollowDepute(k);
  renderMonDossier();
}
window.mdRetirerDeputeNom = mdRetirerDeputeNom;
async function mdRetirerElu(type, cle){
  if(type === 'minister') await toggleFollow(cle); else await toggleFollowDepute(cle);
  renderMonDossier();
}


function renderAccountBox(){
  renderPromoCompte();
  renderMonDossier();   // page /mon-dossier : elle se redessine à la connexion et au changement de langue
  renderAbonnement();   // page /abonnement : même chose
  if(!document.getElementById('accountBox')) return;   // vue absente de cette page
  const box = document.getElementById('accountBox');
  if(!box) return;
  const isEn = currentLang === 'en';
  if(currentUser){
    const displayName = (currentUser.email || '').split('@')[0] || currentUser.email;
    box.innerHTML = `
      <div class="account-row">
        <span>${isEn ? 'Signed in as' : 'Connecté·e comme'} <span class="account-email">${displayName}</span></span>
        <button class="account-btn" onclick="signOutUser()">${isEn ? 'Sign out' : 'Se déconnecter'}</button>
      </div>
      <div class="account-note">${isEn ? 'The ministers, MLAs, and bills you follow are now synced to your account, across devices.' : 'Les ministres, député·e·s et projets de loi que vous suivez sont maintenant synchronisés à votre compte, entre tous vos appareils.'}</div>
    `;
  } else {
    const saisie = document.getElementById('accountEmailInput')?.value || '';
    box.innerHTML = `
      <div class="account-row">
        <input type="email" id="accountEmailInput" placeholder="${isEn ? 'Your email' : 'Votre courriel'}">
        <button class="account-btn" id="magicLinkBtn" onclick="handleMagicLinkClick()">${isEn ? 'Send magic link' : 'Envoyer un lien de connexion'}</button>
      </div>
      <div class="account-note" id="accountStatusNote">${isEn ? 'Sign in to sync the ministers, MLAs, and bills you follow across devices.' : 'Connectez-vous pour synchroniser les ministres, député·e·s et projets de loi que vous suivez entre vos appareils.'}</div>
    `;
    const champ = document.getElementById('accountEmailInput');
    if(champ && saisie) champ.value = saisie;
  }
}

async function initAuth(){
  // `renderAccountBox()` est toujours appelé dans un `finally` — si le
  // chargement des suivis échoue (réseau, etc.), la barre de compte doit
  // quand même s'afficher plutôt que de rester vide.
  try{
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    if(currentUser) await loadFollowsFromSupabase();
    await loadFollowedBills();
    await loadMyFlagsFromSupabase();
  }catch(e){
    console.error('initAuth failed:', e);
  }finally{
    renderAccountBox();
    renderAdminFlagCounts();
    marquerAbonne();
  }

  supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
    // Même personne qu'avant (INITIAL_SESSION juste après initAuth, TOKEN_REFRESHED, SIGNED_IN au
    // retour sur l'onglet) : rien à recharger ni à redessiner. Redessiner refermait la carte qu'un
    // lien ?pl=…&id=… venait d'ouvrir (courriels d'alerte, Mes dossiers).
    if((newSession?.user?.id ?? null) === (currentUser?.id ?? null)){ currentUser = newSession?.user ?? null; return; }
    try{
      currentUser = newSession?.user ?? null;
      if(currentUser) await loadFollowsFromSupabase();
      await loadFollowedBills();
      await loadMyFlagsFromSupabase();
    }catch(e){
      console.error('onAuthStateChange failed:', e);
    }finally{
      renderAccountBox();
      renderAdminFlagCounts();
      _abonneP = null; marquerAbonne();
    }
    const kw = document.getElementById('searchMinistres')?.value || '';
    renderMinistres(kw);
    renderDeputes(kw);
    renderBills();
    renderApercuBills();
  });
}

/* ---------------- DEMANDES D'EXPLICATIONS (bc_bill_flags) ---------------- */
// Voir scripts/supabase-schema-flags.sql. Contrainte unique côté base de
// données : un compte ne peut demander qu'une fois par projet de loi. Le
// numéro entré est toujours vérifié contre les vraies données `bills` avant
// d'accepter la demande — jamais de projet de loi deviné ou inventé.

// Réservé aux comptes listés dans la table `admins` (voir
// scripts/supabase-schema-flags.sql) — les vrais chiffres de demandes par
// projet de loi, rien d'autre que ça. Compté côté navigateur à partir des
// lignes que la politique de sécurité autorise un·e admin à voir en entier
// (tout le monde d'autre ne voit que ses propres demandes).
async function checkIsAdmin(){
  if(!currentUser) return false;
  const { data, error } = await supabaseClient.from('admins').select('user_id').eq('user_id', currentUser.id).maybeSingle();
  if(error){ console.error('checkIsAdmin failed:', error); return false; }
  return !!data;
}

// Paliers de pétition (le seuil monte via le bouton admin « Resend »).
const PETITION_TIERS = [1000, 5000, 25000];

async function renderAdminFlagCounts(){
  renderAdminPreoccupations();   // le panneau des préoccupations suit celui des demandes, sur la même page
  if(!document.getElementById('adminFlagCounts')) return;   // vue absente de cette page
  const container = document.getElementById('adminFlagCounts');
  if(!container) return;
  const isAdmin = await checkIsAdmin();
  if(!isAdmin){ container.innerHTML = ''; return; }
  // La page du compte ne charge aucun projet : sans les titres, ce panneau n'affichait que
  // des « #27053 ». Admins seulement, donc jamais payé par un visiteur ordinaire.
  await chargerChallenges();

  const { data, error } = await supabaseClient.from('bc_bill_flags').select('bill_id');
  if(error){ console.error('renderAdminFlagCounts failed:', error); container.innerHTML = ''; return; }
  // État de campagne (seuil courant + escalade en attente) — table bill_campaign.
  const { data: campData } = await supabaseClient.from('bill_campaign').select('bill_id, threshold, escalation_pending');
  const camp = {}; for(const r of (campData || [])) camp[r.bill_id] = r;

  const isEn = currentLang === 'en';
  const counts = {};
  for(const row of (data || [])) counts[row.bill_id] = (counts[row.bill_id] || 0) + 1;
  const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);

  const rowsHtml = entries.length ? entries.map(([billId, count]) => {
    const bill = projetChallenge(billId);
    const title = bill ? (isEn ? (bill.titleEn || bill.title) : bill.title) : `#${billId}`;
    const c = camp[billId];
    const threshold = c ? c.threshold : PETITION_TIERS[0];
    const pending = c && c.escalation_pending;
    return `<div class="account-row" style="flex-wrap:wrap; gap:8px;">
      <span style="flex:1 1 180px;">${title}</span>
      <b>${count} / ${threshold}</b>
      <button class="account-btn" style="padding:4px 10px; font-size:11px;" onclick="adminResend(${billId})">${pending ? (isEn ? '↑ queued' : '↑ en file') : 'Resend ↑'}</button>
      <button class="account-btn" style="padding:4px 10px; font-size:11px;" onclick="adminReset(${billId})">Reset</button>
    </div>`;
  }).join('') : `<div class="account-note">${isEn ? 'No requests yet.' : 'Aucune demande pour l\'instant.'}</div>`;

  container.innerHTML = `
    <div class="account-box">
      <div class="account-note" style="margin-bottom:10px;"><b>${isEn ? 'Explanation requests (admin only)' : "Demandes d'explications (réservé aux admins)"}</b> — ${isEn ? 'Resend raises the petition threshold and queues an escalation email in the next digest; Reset clears the campaign.' : "Resend monte le seuil de pétition et met un courriel d'escalade dans le prochain digest ; Reset remet la campagne à zéro."}</div>
      ${rowsHtml}
    </div>
  `;
}

// Escalade (bouton admin) : monte le seuil de pétition au palier suivant et pose
// escalation_pending → le prochain digest aux 2 semaines annonce « le parrain a
// répondu mais insuffisant, on continue jusqu'à X ». Mutation via la RLS admin.
async function adminResend(billId){
  const { data } = await supabaseClient.from('bill_campaign').select('threshold').eq('bill_id', billId).maybeSingle();
  const cur = data ? data.threshold : PETITION_TIERS[0];
  const next = PETITION_TIERS.find(t => t > cur) ?? cur;
  if(next === cur && !confirm('Seuil déjà au maximum. Renvoyer quand même un courriel d\'escalade au prochain digest ?')) return;
  const { error } = await supabaseClient.from('bill_campaign').upsert(
    { bill_id: billId, threshold: next, escalation_pending: true, updated_at: new Date().toISOString() },
    { onConflict: 'bill_id' }
  );
  if(error){ alert('Erreur : ' + error.message); return; }
  alert(`Escalade posée (seuil ${cur} → ${next}). Le prochain digest l'annoncera.`);
  renderAdminFlagCounts();
}

// Reset (bouton admin) : efface la campagne de ce projet — repart à zéro.
async function adminReset(billId){
  if(!confirm('Réinitialiser la campagne de ce projet (repart à zéro) ?')) return;
  const { error } = await supabaseClient.from('bill_campaign').delete().eq('bill_id', billId);
  if(error){ alert('Erreur : ' + error.message); return; }
  renderAdminFlagCounts();
}

/* Promesses électorales — promesse et action côte à côte, sans verdict.
   La colonne « action » reste vide tant que la nouvelle Assemblée n'a pas
   légiféré (17 nov. 2026) ; elle se remplira à partir des projets de loi
   déjà scrapés. Le vide est lui aussi une information. */
/* Couleurs de sujet. Les thèmes courants ont une couleur fixe ; tout nouveau
   thème ajouté dans data/promises.json reçoit automatiquement une couleur
   stable de la palette de secours (dérivée du nom, donc toujours la même). */
const themeColors = {
  'Santé':'#E23A3A', 'Logement':'#0E4FC1', 'Transport':'#1E9E5A',
  'Finances publiques':'#FFD24D', 'Éducation':'#FF7B33', 'Environnement':'#12429B',
  'Économie':'#7C5CD6', 'Famille':'#D4537E', 'Culture':'#00A5CF',
  'Immigration':'#B45309', 'Énergie':'#0891B2', 'Justice':'#6B7280', 'Agriculture':'#84A31E', 'Aînés':'#7C3AED', 'Fiscalité':'#A16207', 'Infrastructures':'#475569',
};
const themeFallback = ['#8B5CF6','#0891B2','#C2410C','#4D7C0F','#BE185D','#0F766E'];
function themeColor(t){
  if(themeColors[t]) return themeColors[t];
  let h = 0; for(let i=0; i<String(t).length; i++) h = (h*31 + String(t).charCodeAt(i)) % 9973;
  return themeFallback[h % themeFallback.length];
}
// Noir ou blanc selon la luminance du fond — marche aussi pour les couleurs de secours.
function readableOn(hex){
  const c = String(hex).replace('#','');
  const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#131313' : '#fff';
}

let promParty = 'tous';
let promTheme = 'tous';
// Levé par init juste avant son propre renderPromises(). Avant, un clic sur un filtre (écrit dans
// le HTML par le build) redessinait tout avec une liste encore vide : « Tous 0 », des rangées qui
// rétrécissent, « Aucune promesse » au-dessus de la liste du build. Le choix est retenu, et
// appliqué dès que les données sont là.
let promPret = false;
function setPromParty(p){ promParty = p; renderPromises(); }
function setPromTheme(t){ promTheme = t; renderPromises(); }

// Construit les deux rangées de filtres à partir des données elles-mêmes :
// à mesure que des promesses sont ajoutées, les partis et sujets apparaissent
// tout seuls — rien à maintenir à la main.
function renderPromFilters(){
  const isEn = currentLang === 'en';
  const partyEl = document.getElementById('promPartyFilters');
  const themeEl = document.getElementById('promThemeFilters');
  const tous = isEn ? 'All' : 'Tous';
  // Les boutons portent TOUJOURS la couleur (parti ou sujet) : on reconnaît
  // d'un coup d'œil. La sélection se marque par la classe .qf-sel (ombre dure),
  // pas par la couleur — sinon on perdrait le repère visuel.
  // Compteurs CROISÉS : le nombre affiché sur un bouton de parti tient compte du
  // sujet sélectionné, et inversement. Sinon le chiffre ne correspondrait pas aux
  // cartes visibles à l'écran. Un « 0 » est donc possible et il est honnête : ce
  // parti n'a rien dans ce sujet parmi ce qu'on a trouvé dans ses documents
  // (plus de plafond par parti depuis le 5 oct. 2026).
  const nb = (f) => promises.filter(f).length;
  const compteur = (n) => ` <span class="qf-n">${n}</span>`;

  if(partyEl){
    const partis = [...new Set(promises.map(p => p.party))];
    const sousTheme = (p) => promTheme === 'tous' || p.theme === promTheme;
    partyEl.innerHTML = [['tous', tous], ...partis.map(x => [x, x])].map(([k, label]) => {
      const sel = promParty === k;
      const n = k === 'tous' ? nb(sousTheme) : nb(p => p.party === k && sousTheme(p));
      const zero = n === 0 ? ' qf-zero' : '';
      if(k === 'tous') return `<button class="qf-btn ${sel ? 'active' : ''}${zero}" onclick="setPromParty('tous')">${label}${compteur(n)}</button>`;
      const bg = partyColors[k] || '#8B8578';
      return `<button class="qf-btn ${sel ? 'qf-sel' : ''}${zero}" style="background:${bg}; color:${partyText(k)};" onclick="setPromParty('${k}')">${label}${compteur(n)}</button>`;
    }).join('');
    // « Médias » à la suite des partis : ce n'est PAS un filtre, c'est un renvoi
    // vers les comparateurs des salles de rédaction, en bas de page. Il est posé
    // ici parce que c'est là que regarde quelqu'un qui compare — mais il doit se
    // distinguer des partis, sinon on croit à un filtre qui ne filtre rien :
    // d'où le trait pointillé, l'absence de couleur de parti et la flèche.
    partyEl.innerHTML += `<button class="qf-btn qf-renvoi" onclick="allerAuxComparateurs()" title="${isEn
      ? 'Comparison tools built by newsrooms, at the bottom of the page'
      : 'Les comparateurs des salles de rédaction, en bas de page'}">${isEn ? 'Media' : 'Médias'}${compteur(4)} ↓</button>`;
  }
  if(themeEl){
    const sujets = [...new Set(promises.map(p => p.theme))].sort();
    const sousParti = (p) => promParty === 'tous' || p.party === promParty;
    themeEl.innerHTML = [['tous', tous], ...sujets.map(x => [x, x])].map(([k, label]) => {
      const sel = promTheme === k;
      const esc = String(k).replace(/'/g, "\\'");
      const n = k === 'tous' ? nb(sousParti) : nb(p => p.theme === k && sousParti(p));
      const zero = n === 0 ? ' qf-zero' : '';
      if(k === 'tous') return `<button class="qf-btn ${sel ? 'active' : ''}${zero}" onclick="setPromTheme('tous')">${label}${compteur(n)}</button>`;
      const bg = themeColor(k);
      return `<button class="qf-btn ${sel ? 'qf-sel' : ''}${zero}" style="background:${bg}; color:${readableOn(bg)};" onclick="setPromTheme('${esc}')">${label}${compteur(n)}</button>`;
    }).join('');
  }
}

// Renvoi vers les comparateurs des médias, en bas de la page Promesses.
function allerAuxComparateurs(){
  const el = document.getElementById('prom-ailleurs');
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPromises(){
  if(!document.getElementById('promisesList')) return;   // vue absente de cette page
  if(!promPret) return;   // données pas encore là : filtres et liste du build restent tels quels
  const el = document.getElementById('promisesList');
  if(!el) return;
  const isEn = currentLang === 'en';
  renderPromFilters();
  const liste = promises.filter(p =>
    (promParty === 'tous' || p.party === promParty) &&
    (promTheme === 'tous' || p.theme === promTheme));
  const titreEl = document.getElementById('promResultTitle');
  const noteEl = document.getElementById('promResultNote');
  if(titreEl) titreEl.textContent = promParty === 'tous' && promTheme === 'tous'
    ? (isEn ? 'All promises' : 'Toutes les promesses')
    : [promParty !== 'tous' ? promParty : null, promTheme !== 'tous' ? promTheme : null].filter(Boolean).join(' · ');
  if(noteEl) noteEl.textContent = `${liste.length} ${isEn ? (liste.length > 1 ? 'promises' : 'promise') : (liste.length > 1 ? 'promesses' : 'promesse')}`;
  if(!promises.length){
    el.innerHTML = `<div class="no-results">${isEn ? 'No promise recorded yet.' : 'Aucune promesse saisie pour l\'instant.'}</div>`;
    return;
  }
  if(!liste.length){
    el.innerHTML = `<div class="no-results">${isEn ? 'No promise matches these filters.' : 'Aucune promesse ne correspond à ces filtres.'}</div>`;
    return;
  }
  // Une section par parti (Martin, 5 oct. 2026) : le parti qui forme le gouvernement en tête
  // (ASSEMBLY.gagnant, vide tant que le résultat n'est pas officiel), les autres ensuite.
  const nomParti = (sigle) => {
    const s = seats.find(x => x.party === sigle);
    // Sans le rôle entre parenthèses (« opposition officielle ») : il date de la législature dissoute.
    return s ? (isEn ? s.labelEn : s.label).replace(/\s*\(.*\)$/, '') : sigle;
  };
  const partisListe = [...new Set(liste.map(p => p.party))]
    // Dans l'ordre des sièges obtenus (ASSEMBLY.ordrePartis), le premier en tête ; un parti absent de
    // cette liste va à la fin.
    .sort((a, b) => { const o = ASSEMBLY.ordrePartis || [], r = (x) => (x === ASSEMBLY.gagnant ? -1 : o.includes(x) ? o.indexOf(x) : 99); return r(a) - r(b); });
  const carte = (p) => {
    const couleur = partyColors[p.party] || '#8B8578';
    const badge = `<span class="depute-party" style="background:${couleur}; color:${partyText(p.party)}">${p.party}</span>`;
    const brouillon = p.draft ? `<span class="prom-draft">${isEn ? 'To verify' : 'À vérifier'}</span>` : '';
    const typeSrc = p.sourceType === 'primaire'
      ? (isEn ? 'Primary source (party)' : 'Source primaire (parti)')
      : (isEn ? 'Journalistic source' : 'Source journalistique');
    return `<div class="prom-card">
      <div class="prom-top">${badge}<button class="prom-theme-pill" style="background:${themeColor(p.theme)}; color:${readableOn(themeColor(p.theme))};" onclick="setPromTheme('${String(p.theme).replace(/'/g, "\\'")}')" title="${isEn ? 'Filter by this topic' : 'Filtrer par ce sujet'}">${p.theme}</button>${brouillon}</div>
      <p class="prom-quote">« ${p.quote} »</p>
      <div class="prom-grid">
        <div class="prom-col">
          <span class="lbl">${isEn ? 'The promise' : 'La promesse'}</span>
          <p>${p.sourceLabel}</p>
          <p class="prom-srctype">${typeSrc} · ${isEn ? 'captured on' : 'captée le'} ${p.capturedAt}</p>
          <a href="${p.sourceUrl}" target="_blank" rel="noopener">${isEn ? 'See the source' : 'Voir la source'}</a>
        </div>
        <div class="prom-col">
          <span class="lbl att">${isEn ? 'The action' : 'L\'action'}</span>
          <p class="prom-none">${isEn
            ? 'Nothing yet. The new Assembly sits from November 17, 2026.'
            : 'Rien encore. La nouvelle Assemblée siège à partir du 17 novembre 2026.'}</p>
        </div>
      </div>
    </div>`;
  };
  el.innerHTML = partisListe.map(sigle => {
    const cartes = liste.filter(p => p.party === sigle);
    const gouv = sigle === ASSEMBLY.gagnant;
    const n = `${cartes.length} ${isEn ? (cartes.length > 1 ? 'promises' : 'promise') : (cartes.length > 1 ? 'promesses' : 'promesse')}`;
    const titre = `<span class="prom-parti-puce" style="background:${partyColors[sigle] || '#8B8578'}"></span>${nomParti(sigle)}${gouv && ASSEMBLY.gagnantNote ? ` <span class="prom-parti-role">${isEn ? (ASSEMBLY.gagnantNoteEn || ASSEMBLY.gagnantNote) : ASSEMBLY.gagnantNote}</span>` : ''} <span class="prom-parti-n">${n}</span>`;
    // Les autres partis : repliés sous celui qui a remporté le plus de sièges (Martin, 6 oct. 2026),
    // un menu par parti. Dépliés d'office si on a filtré sur un seul parti, ou tant qu'aucun parti
    // n'est mis en tête.
    if (ASSEMBLY.gagnant && !gouv && promParty === 'tous') {
      return `<details class="prom-parti prom-parti-repli">
      <summary class="prom-parti-titre">${titre}</summary>
      ${cartes.map(carte).join('')}
    </details>`;
    }
    return `<section class="prom-parti${gouv ? ' prom-parti-gouv' : ''}">
      <h3 class="prom-parti-titre">${titre}</h3>
      ${cartes.map(carte).join('')}
    </section>`;
  }).join('');
}

/* ---------------- RENDER ---------------- */
const mailIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';
const deputesDirectoryUrl = 'https://www.leg.bc.ca/fr/parlementaires/actuel';   // N.-B. : les courriels sont masqués sur leg.bc.ca, la fiche reste le chemin



function findDeputeEmail(name){
  if(!name) return null;
  const clean = name.replace(/\s*\([^)]*\)\s*/g,'').trim();
  return deputeEmails[norm(clean)] || null;
}

let partyFilter = '';
const partyOrder = ['NDP','CON','VERT','IND'];   // C.-B.

function renderPartyFilters(){
  const el = document.getElementById('partyFilters');
  if(!el) return;
  const allLabel = currentLang==='en' ? 'All' : 'Tous';
  el.innerHTML = `<span class="party-chip ${!partyFilter?'active':''}" style="${!partyFilter ? 'background:var(--ink); border-color:var(--ink);' : 'border-color:var(--line); color:var(--slate);'}" onclick="setPartyFilter('')">${allLabel}</span>` +
    partyOrder.map(p => `
    <span class="party-chip ${partyFilter===p?'active':''}" style="${partyFilter===p ? `background:${partyColors[p]}; border-color:${partyColors[p]};` : `border-color:${partyColors[p]}66; color:${partyColors[p]};`}" onclick="setPartyFilter('${p}')">${p}</span>
  `).join('');
}

function setPartyFilter(p){
  partyFilter = (partyFilter === p) ? '' : p;
  renderPartyFilters();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderDeputes(document.getElementById('searchMinistres')?.value);
}

let introCollapsed = false;
async function loadIntroState(){
  try{
    const res = await window.storage.get('apercu-intro-collapsed');
    introCollapsed = res ? JSON.parse(res.value) : false;
  }catch(e){ introCollapsed = false; }
  applyIntroState();
}
function applyIntroState(){
  // Refonte : les boutons « 😴 Réduire » ont été retirés — la mission est
  // toujours affichée, peu importe l'état sauvegardé d'avant.
  const block = document.getElementById('introBlock');
  if(block) block.classList.remove('collapsed');
}

document.querySelectorAll('.quick-nav a').forEach(a=>{
  a.addEventListener('click', ()=>{
    const targetId = a.getAttribute('data-jump');
    const introTargets = ['sec-mission','sec-composition'];
    if(introTargets.includes(targetId) && introCollapsed){
      introCollapsed = false;
      applyIntroState();
      window.storage.set('apercu-intro-collapsed', JSON.stringify(false)).catch(()=>{});
    }
    requestAnimationFrame(()=>{
      const el = document.getElementById(targetId);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
});

let fontZoom = 100;
// Le CSS n'a aucun moyen de connaître la largeur dont dispose RÉELLEMENT la
// mise en page : l'unité vw inclut la barre de défilement, et ni vw ni les
// media queries ne suivent le `zoom` que le bouton A+ applique sur <body>
// (à 150 % sur un téléphone de 412 px, la page se compose comme dans 275 px).
// On la mesure donc ici et on la publie : --vw pour les bandes pleine largeur,
// la classe .etroit pour les réglages qu'un @media ne peut pas déclencher.
function majMetriquesMiseEnPage(){
  // ⚠️ clientWidth peut valoir 0 : onglet caché, rendu en arrière-plan, capture
  // de vignette. Publier « --vw: 0px » cassait toute la mise en page ET ne se
  // corrigeait jamais, car le repli « var(--vw, 100vw) » ne s'applique que si la
  // variable est ABSENTE — pas si elle est présente mais fausse. On ne publie
  // donc rien tant qu'on n'a pas une largeur crédible.
  const largeur = document.documentElement.clientWidth || window.innerWidth || 0;
  if(largeur < 200) return;
  const effective = largeur / (fontZoom / 100);
  document.body.style.setProperty('--vw', effective + 'px');
  document.documentElement.classList.toggle('etroit', effective < 360);
  // La rangée du logo a besoin de 411 px : voir .entete-etroite dans le CSS.
  document.documentElement.classList.toggle('entete-etroite', effective < 420);
  majEnteteDeuxRangees();
}
// L'en-tête tient-il sur UNE rangée ? Logo + onglets + boutons côte à côte demandent environ
// 1 330 px en français et 1 260 en anglais (mesuré le 24 sept. 2026). En dessous, la rangée
// passait à la ligne toute seule et les boutons tombaient seuls sous le logo, à gauche — un
// en-tête cassé en français sur un portable de 1 280 px. On passe alors proprement à deux
// rangées (.entete-deux-rangees dans dq.css) : logo et boutons en haut, onglets dessous.
// Mesuré plutôt que fixé : la largeur dépend de la langue, du zoom A+ et de la police une fois
// chargée — un @media ne voit ni l'une ni l'autre. Toutes les mesures sont des offsetWidth /
// clientWidth : dans le même repère, zoom compris. Sous 640 px, le menu mobile prend le relais.
function majEnteteDeuxRangees(){
  const racine = document.documentElement;
  const entete = document.querySelector('#dq-topbar header.top');
  const onglets = entete && entete.querySelector('nav.tabs');
  const logo = entete && entete.querySelector('.brand');
  const boutons = entete && entete.querySelector('.header-ctrls');
  if(!entete || !onglets || !logo || !boutons) return;
  if(getComputedStyle(onglets).position === 'fixed'){ racine.classList.remove('entete-deux-rangees'); return; }
  const style = getComputedStyle(entete);
  const dispo = entete.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if(dispo < 200) return;   // onglet caché, vignette : rien de crédible à mesurer
  const liens = [...onglets.querySelectorAll('a[data-view], .villes-menu')];   // N.-B. : l'onglet Villes compte aussi
  const ecart = parseFloat(getComputedStyle(onglets).columnGap) || 0;
  const largeurOnglets = liens.reduce((s, a) => s + a.offsetWidth, 0) + Math.max(0, liens.length - 1) * ecart;
  const besoin = logo.offsetWidth + largeurOnglets + boutons.offsetWidth + 2 * (parseFloat(style.columnGap) || 0);
  // 4 px de marge : les offsetWidth sont arrondis.
  racine.classList.toggle('entete-deux-rangees', besoin + 4 > dispo);
}
majEnteteDeuxRangees();
// La police arrive après le premier dessin (display=swap) et change la largeur des onglets.
if(document.fonts && document.fonts.ready) document.fonts.ready.then(majEnteteDeuxRangees);
window.addEventListener('resize', majMetriquesMiseEnPage);
// Rattrapage : si la page a été construite alors qu'elle n'avait pas encore de
// largeur, on remesure dès qu'elle devient visible.
window.addEventListener('pageshow', majMetriquesMiseEnPage);
document.addEventListener('visibilitychange', () => { if(!document.hidden) majMetriquesMiseEnPage(); });
async function loadFontZoom(){
  try{
    const res = await window.storage.get('font-zoom');
    fontZoom = res ? JSON.parse(res.value) : 100;
  }catch(e){ fontZoom = 100; }
  applyFontZoom();
}
function applyFontZoom(){
  document.body.style.zoom = fontZoom + '%';
  majMetriquesMiseEnPage();
  { const _e = document.getElementById('fontPct'); if(_e) _e.textContent = fontZoom + '%'; }
  { const _e = document.getElementById('fontMinus'); if(_e) _e.disabled = fontZoom <= 80; }
  { const _e = document.getElementById('fontPlus'); if(_e) _e.disabled = fontZoom >= 150; }
}
async function changeFontZoom(delta){
  fontZoom = Math.max(80, Math.min(150, fontZoom + delta));
  applyFontZoom();
  try{ await window.storage.set('font-zoom', JSON.stringify(fontZoom)); }catch(e){}
}

/* ---------------- THÈME SOMBRE ----------------
   Volontairement PAS branché sur prefers-color-scheme : tant que le thème est à
   l'essai, personne ne doit le recevoir sans l'avoir demandé. Le jour où on le
   juge prêt, il suffira de lire la préférence système au premier chargement.
   L'attribut vit sur <html> et non sur <body>, pour que le fond de page soit
   peint avant même que le corps existe. */
let themeSombre = false;
function appliquerTheme(){
  document.documentElement.setAttribute('data-theme', themeSombre ? 'dark' : 'light');
  const b = document.getElementById('themeToggle');
  if(!b) return;
  const isEn = currentLang === 'en';
  b.setAttribute('aria-pressed', themeSombre ? 'true' : 'false');
  const t = themeSombre
    ? (isEn ? 'Switch to light theme' : 'Passer au thème clair')
    : (isEn ? 'Switch to dark theme' : 'Passer au thème sombre');
  b.setAttribute('aria-label', t);
  b.setAttribute('title', t);
}
async function loadTheme(){
  try{
    const res = await window.storage.get('theme');
    themeSombre = res ? JSON.parse(res.value) === 'dark' : false;
  }catch(e){ themeSombre = false; }
  appliquerTheme();
}
async function basculerTheme(){
  themeSombre = !themeSombre;
  appliquerTheme();
  try{ await window.storage.set('theme', JSON.stringify(themeSombre ? 'dark' : 'light')); }catch(e){}
}
document.getElementById('themeToggle')?.addEventListener('click', basculerTheme);
document.getElementById('fontMinus')?.addEventListener('click', ()=> changeFontZoom(-10));
document.getElementById('fontPlus')?.addEventListener('click', ()=> changeFontZoom(10));

let snoozedSections = {};
async function loadSnoozedSections(){
  try{
    const res = await window.storage.get('snoozed-sections');
    snoozedSections = res ? JSON.parse(res.value) : {};
  }catch(e){ snoozedSections = {}; }
  Object.keys(snoozedSections).forEach(key=>{
    if(snoozedSections[key]){
      const body = document.getElementById('body-'+key);
      const pill = document.getElementById('snooze-'+key);
      if(body && pill){
        body.classList.add('collapsed');
        pill.classList.add('snoozed');
        const labelSpan = pill.querySelector('span');
        labelSpan.textContent = currentLang==='en' ? '😴 Show' : '😴 Afficher';
      }
    }
  });
}

async function toggleSnooze(key, persist){
  const body = document.getElementById('body-'+key);
  const pill = document.getElementById('snooze-'+key);
  const isCollapsed = body.classList.toggle('collapsed');
  pill.classList.toggle('snoozed', isCollapsed);
  const labelSpan = pill.querySelector('span');
  const isEn = currentLang === 'en';
  labelSpan.textContent = isCollapsed ? (isEn ? '😴 Show' : '😴 Afficher') : (isEn ? '😴 Collapse' : '😴 Réduire');
  if(persist){
    snoozedSections[key] = isCollapsed;
    try{ await window.storage.set('snoozed-sections', JSON.stringify(snoozedSections)); }catch(e){}
  }
}

function initials(name){
  return name.split(' ').filter(w=>w[0]===w[0].toUpperCase()).slice(0,2).map(w=>w[0]).join('');
}

// Vrais éléments datés, tirés de la page d'accueil assnat.qc.ca (relevés le 12 juin 2026)

// La date la plus récente du fil d'actualité, qui sert de « aujourd'hui » aux barres de
// progression. Calculée dans chargerDonnees : au chargement du script, newsItems est encore
// vide — les données arrivent par le réseau.
let newsAnchor = null;
// Borne le nombre d'ÉVÉNEMENTS, pas de journées : une seule journée de fin de
// session peut en contenir neuf et remplir l'écran à elle seule.
const NEWS_STEP = 8;
let newsShown = NEWS_STEP;

function renderNews(){
  if(!document.getElementById('newsList')) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  // Pagination par JOURNÉES, pas par fenêtres de 7 jours : une seule semaine de
  // fin de session peut contenir 20 événements et remplir tout l'écran. On
  // affiche un nombre fixe de journées, comme les pétitions affichent 3 cartes.
  const visible = newsItems.slice(0, newsShown);
  const hasMore = newsItems.length > visible.length;
  const moreBtn = isEn ? "+ Show more" : "+ Voir plus";
  const noMore = isEn ? 'Data not yet confirmed beyond this — to be added later.' : 'Donnée manquante au-delà de cette date — à confirmer plus tard.';

  // DISSOLUTION : sans explication, « Quoi de neuf » affichant des entrées de
  // juin donne l'impression d'un site à l'abandon. La vraie raison, c'est qu'il
  // ne s'est rien passé : l'Assemblée a suspendu ses travaux le 12 juin puis a
  // été dissoute le 27 août. On le dit, plutôt que de laisser le doute.
  const avisDissolution = (typeof ASSEMBLY !== 'undefined' && ASSEMBLY.dissolved)
    ? `<div class="info-box" style="margin-bottom:16px;">${isEn
        ? "Nothing new since June 12, 2026 — and that is expected. The Assembly rose that day, then was dissolved on August 27. There will be no new parliamentary activity until the new Assembly convenes on November 17, 2026. What follows is the final record of the 43rd legislature."
        : "Rien de neuf depuis le 12 juin 2026 — et c'est normal. L'Assemblée a suspendu ses travaux ce jour-là, puis a été dissoute le 27 août. Il n'y aura pas de nouvelle activité parlementaire avant la rentrée de la nouvelle Assemblée, le 17 novembre 2026. Ce qui suit est le dernier état des travaux de la 43<sup>e</sup> législature."}</div>`
    : '';

  // Regroupé PAR JOUR : une même date revenait jusqu'à huit fois de suite, ce
  // qui noyait le contenu sous des en-têtes répétés. Un bloc par journée, avec
  // tous ses événements en dessous.
  const parJour = [];
  for(const n of visible){
    const dernier = parJour[parJour.length - 1];
    if(dernier && dernier.date === n.date) dernier.items.push(n);
    else parJour.push({ date: n.date, label: isEn ? (n.labelEn||n.label) : n.label, items: [n] });
  }

  document.getElementById('newsList').innerHTML = avisDissolution + parJour.map(j => `
    <div class="news-item">
      <div class="news-date">${j.label}</div>
      <div class="news-body">${j.items.map(n => `<p>${isEn ? (n.textEn||n.text) : n.text}</p>`).join('')}</div>
    </div>
  `).join('') + (hasMore ? `<button class="bill-more" style="margin-top:14px; border:none; cursor:pointer;" onclick="loadMoreNews()">${moreBtn}</button>` : `<div class="no-results">${noMore}</div>`);
}

function loadMoreNews(){
  newsShown += NEWS_STEP;
  renderNews();
}

function toggleRoadmapRecap(id){
  const el = document.getElementById(id);
  const hint = document.getElementById('hint-'+id);
  const isOpen = el.classList.toggle('open');
  hint.textContent = isOpen ? '−' : '+';
}

// Vraies pétitions électroniques ouvertes pour signature — assnat.qc.ca
// Confirmées deux fois : une première fois par un fetch direct, une seconde fois
// indépendamment par l'utilisateur qui les a copiées depuis son propre navigateur.




function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

let petitionsShown = 3;

function renderPetitions(targetId){
  targetId = targetId || 'petitionsList';
  const el = document.getElementById(targetId);
  // Son conteneur est passé en paramètre, donc aucune garde automatique ne pouvait le couvrir :
  // sur /ministres ou /votes, il n'existe pas.
  if(!el) return;
  const isEn = currentLang === 'en';
  // DISSOLUTION : le Règlement de l'Assemblée interdit de signer une pétition
  // électronique quand l'Assemblée est dissoute — il n'y a donc AUCUNE pétition
  // ouverte. On n'affiche pas les anciennes : elles ne sont plus signables, et
  // les montrer avec un bouton « signer » enverrait les gens vers un mur.
  // (Le scraper hebdo garde ses données de la veille ; c'est l'affichage qui
  // tranche, comme pour les projets de loi morts au feuilleton.)
  if(typeof ASSEMBLY !== 'undefined' && ASSEMBLY.dissolved){
    const msg = isEn
      ? "No petition can be signed right now. The National Assembly's rules prohibit signing an e-petition while the Assembly is dissolved — which has been the case since August 27, 2026. Petitions reopen once the new Assembly convenes, on November 17, 2026."
      : "Aucune pétition ne peut être signée en ce moment. Le Règlement de l'Assemblée interdit de signer une pétition électronique pendant que l'Assemblée est dissoute — c'est le cas depuis le 27 août 2026. Les pétitions rouvriront à la rentrée de la nouvelle Assemblée, le 17 novembre 2026.";
    const lien = isEn ? "See the official notice on assnat.qc.ca →" : "Voir l'avis officiel sur assnat.qc.ca →";
    const url = isEn
      ? "https://www.assnat.qc.ca/en/exprimez-votre-opinion/petition/signer-petition/index.html"
      : "https://www.assnat.qc.ca/fr/exprimez-votre-opinion/petition/signer-petition/index.html";
    el.innerHTML = `<div class="no-results">${msg}</div>
    <a class="bill-more" href="${url}" target="_blank" rel="noopener" style="display:inline-block; margin-top:12px;">${lien}</a>`;
    return;
  }
  if(petitions.length === 0){
    // N.-B. : il n'existe pas de pétition en ligne. L'Assemblée n'accepte que les pétitions sur papier,
    // signées à la main et déposées par un·e député·e ; ses Journaux n'en donnent que le numéro et l'objet.
    const emptyMsg = isEn
      ? "There are no online petitions in British Columbia. The Legislative Assembly only accepts paper petitions, signed by hand and tabled by an MLA. No button, here or elsewhere, has official value: the way in is through your MLA."
      : "Il n'y a pas de pétition en ligne en Colombie-Britannique. L'Assemblée législative n'accepte que les pétitions sur papier, signées à la main et déposées par un·e député·e. Aucun bouton, ici ou ailleurs, n'a de valeur officielle : le chemin passe par votre député·e.";
    const emptyLinkText = isEn ? "Find your MLA →" : "Trouver votre député·e →";
    const emptyUrl = isEn ? "/ministres?lang=en" : "/ministres";
    el.innerHTML = `<div class="no-results">${emptyMsg}</div>
    <a class="bill-more" href="${emptyUrl}" target="_blank" rel="noopener" style="display:inline-block; margin-top:12px;">${emptyLinkText}</a>`;
    return;
  }
  const sponsorLabel = isEn ? "Sponsoring MLA" : "Députée ou député intermédiaire";
  const openLabel = isEn ? "Open from" : "Ouverte du";
  const toLabel = isEn ? "to" : "au";
  const signatureLabel = isEn ? "signature" : "signature";
  const viewSignLabel = isEn ? "Find and sign on assnat.qc.ca →" : "Trouver et signer sur assnat.qc.ca →";
  const moreLabel = isEn ? "+ Show 3 more" : "+ Voir 3 de plus";
  const sorted = petitions.slice().sort((a,b)=>b.count-a.count);
  const list = sorted.slice(0, petitionsShown);
  const hasMore = petitionsShown < sorted.length;
  el.innerHTML = list.map(p=>{
    const total = daysBetween(p.start,p.end);
    const elapsed = Math.min(total, daysBetween(p.start, newsAnchor));
    const pct = Math.max(4, Math.min(100, Math.round(elapsed/total*100)));
    const title = isEn ? (p.titleEn||p.title) : p.title;
    const url = isEn ? (p.urlEn||p.url) : p.url;
    const localeCount = p.count.toLocaleString(isEn ? 'en-CA' : 'fr-CA');
    return `
    <div class="petition-card">
      <h3>${title}</h3>
      <div class="petition-meta">
        <span>${sponsorLabel} : <b>${p.sponsor}</b></span>
        <span>${openLabel} <b>${p.start}</b> ${toLabel} <b>${p.end}</b></span>
      </div>
      <div class="petition-progress"><div class="fill" style="width:${pct}%"></div></div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="petition-count">${localeCount} ${signatureLabel}${p.count>1?'s':''}</span>
        <a class="bill-more" href="${url}" target="_blank" rel="noopener">${viewSignLabel}</a>
      </div>
    </div>
  `;}).join('') + (hasMore ? `<button class="bill-more" style="margin-top:6px; border:none; cursor:pointer;" onclick="loadMorePetitions('${targetId}')">${moreLabel}</button>` : '');
}

function loadMorePetitions(targetId){
  petitionsShown += 3;
  renderPetitions(targetId);
}

function renderApercuPetitions(){
  renderPetitions('apercuPetitions');
}

function norm(s){
  return (s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[-–—']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderDeputes(filter){
  if(!document.getElementById('deputesList')) return;   // vue absente de cette page
  // Toute nouvelle liste (recherche, filtre de parti, tri, langue) refait le retour sous la boîte :
  // sinon il garderait l'ancien compte et des boutons vers des fiches qui n'existent plus.
  planifierRetour();
  // En mode trié (voir toggleMinistresSort), renderMinistres() affiche tout le
  // monde (ministres + reste de l'Assemblée) fusionné dans une seule liste —
  // cette grille-ci reste donc vide et n'a rien à faire.
  if(ministresSortMode){
    { const _e = document.getElementById('deputesList'); if(_e) _e.innerHTML = ''; }
    return;
  }
  const f = norm(filter);
  const ministerNames = new Set(ministers.map(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,''))));
  const list = deputes.filter(d => !ministerNames.has(norm(d.name)) && (!partyFilter || d.party===partyFilter) && (!f ||
    norm(d.name).includes(f) ||
    norm(d.riding).includes(f) ||
    norm(d.region).includes(f)
  ));
  const el = document.getElementById('deputesList');
  if(list.length === 0){
    el.innerHTML = `<div class="no-results">${currentLang==='en' ? 'No results for this search.' : 'Aucun résultat pour cette recherche.'}</div>`;
    return;
  }
  const isEn = currentLang === 'en';
  // Refonte brutaliste : tableau GROUPÉ PAR PARTI (bandeau pleine largeur aux
  // couleurs du parti), au lieu de la grille de cartes — mêmes données, mêmes
  // boutons Suivre (followedDeputes), même courriel.
  const partyOrder = seats.map(s=>s.party);
  const groups = partyOrder
    .map(p => ({ party:p, seat: seats.find(s=>s.party===p), members: list.filter(d=>d.party===p)
      // Le ou les chefs en tête de leur parti (Martin, 4 nov. 2026), puis par ordre alphabétique.
      .sort((a, b) => ((CHEFS_OPPOSITION.indexOf(a.name) + 1 || 99) - (CHEFS_OPPOSITION.indexOf(b.name) + 1 || 99)) || a.name.localeCompare(b.name, 'fr')) }))
    .filter(g => g.members.length);
  const nameLabel = isEn ? 'Name' : 'Nom';
  const ridingLabel = isEn ? 'Riding — region' : 'Circonscription — région';
  const followColLabel = isEn ? 'Follow' : 'Suivre';
  const seatWord = isEn ? 'shown' : 'affiché·e·s';
  el.innerHTML = `<div class="dep-table">
    <div class="dep-table-head"><span>${nameLabel}</span><span>${ridingLabel}</span><span>${followColLabel}</span></div>
    ${groups.map(g => {
      const label = isEn ? (g.seat.labelEn||g.seat.label) : g.seat.label;
      return `
      <div class="dep-group-banner" style="background:${partyColors[g.party]}; color:${partyText(g.party)}">
        <span class="dep-group-name">${label}</span>
        <span class="dep-group-count">${g.members.length} ${seatWord}</span>
      </div>
      ${g.members.map(d => {
        const email = findDeputeEmail(d.name);
        const mailHref = email ? 'mailto:'+email : deputesDirectoryUrl;
        const mailText = email ? email : (isEn ? 'Contact details on leg.bc.ca' : 'Coordonnées sur leg.bc.ca');
        const followKey = d.name + '|' + d.riding;
        const isFollowed = !!followedDeputes[followKey];
        const att = attendanceForAssnatId(d.assnatId);
        const presidingNote = presidingRoleNote(d.name, isEn);
        const attNote = presidingNote ? presidingNote : att
          ? ligneLegislatures(d.name, d, att, isEn)
          : (isEn ? 'attendance: n/a' : 'présence : n/d');
        return `
        <div class="dep-row">
          <div>
            <div class="dep-name">${CHEFS_OPPOSITION.includes(d.name) ? `<a href="/deputes/${slugMinistre(d.name)}">${d.name}</a>` : d.name}</div>
            <a class="dep-mail" href="${mailHref}" ${email ? '' : 'target="_blank" rel="noopener"'}>✉ ${mailText}</a>
          </div>
          <div>
            <div class="dep-riding">${d.region ? `${d.riding} — ${d.region}` : d.riding}</div>
            <div class="dep-att">${attNote}</div>
          </div>
          <div class="dep-actions">${partageBouton(d.name)}${wikiBouton(d.name)}${finBouton(d.name)}
          <button class="follow-btn dep-follow ${isFollowed?'on':''}" onclick="toggleFollowDepute('${followKey.replace(/'/g,"\\'")}')">${isFollowed ? t('btn.following') : t('btn.follow')}</button></div>
        </div>`;
      }).join('')}`;
    }).join('')}
  </div>`;
}

// Carte unifiée pour la vue combinée (ministres + reste de l'Assemblée sur un
// seul pied d'égalité, voir toggleMinistresSort) — même info qu'avant, juste
// réunie dans un seul type de carte puisque le classement mélange les deux
// groupes plutôt que de garder la priorité "Conseil des ministres" en premier.
// Chefs de l'opposition qui ont leur fiche /deputes/<slug> (data/site/chefsOpposition.json, scripts/build-chefs-opposition.js).
// C.-B. : VIDE, et ce n'est pas un oubli. L'API de l'Assemblée ne publie qu'un seul rôle de chef
// (« Leader of the Third Party »), jamais celui de l'opposition officielle, et la 43e législature
// a changé quatre fois de chef de l'opposition en dix mois. Tant que la 44e n'a pas publié ses
// député·e·s, aucune fiche de chef n'est fabriquée : un nom ici fabrique un lien vers une page
// qui n'existe pas.
const CHEFS_OPPOSITION = [];
// Même slug que scripts/build-minister-pages.js (slugMinistre).
function slugMinistre(nom){ return String(nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function personCard(p){
  const isEn = currentLang === 'en';
  const isMin = p.type === 'minister';
  const name = isMin ? p.m.name : p.d.name;
  // Dans la vue combinée (classement par présence), on affiche circonscription
  // — région pour tout le monde, ministres compris, pour rester cohérent sur
  // un même pied d'égalité plutôt que de garder le titre de portefeuille.
  const minDep = isMin && p.combined ? resolveDepute(name) : null;
  const subtitle = isMin
    ? (p.combined ? (minDep ? [minDep.riding, minDep.region].filter(Boolean).join(' — ') : '') : (isEn ? (p.m.roleEn||p.m.role) : p.m.role))
    : [p.d.riding, p.d.region].filter(Boolean).join(' — ');   // N.-B. : pas de région
  const party = isMin ? p.m.party : p.d.party;
  const email = findDeputeEmail(name);
  const mailHref = email ? 'mailto:'+email : deputesDirectoryUrl;
  const mailTitle = email ? email : (isEn ? 'Contact details on leg.bc.ca' : 'Coordonnées sur leg.bc.ca');
  const followKey = isMin ? name : (p.d.name + '|' + p.d.riding);
  const isFollowed = isMin ? !!followed[name] : !!followedDeputes[followKey];
  const followOnclick = isMin
    ? `toggleFollow('${name.replace(/'/g,"\\'")}')`
    : `toggleFollowDepute('${followKey.replace(/'/g,"\\'")}')`;
  const presidingNote = presidingRoleNote(name, isEn);
  const attNote = presidingNote ? presidingNote : p.att
    ? (isEn ? `attendance: ${p.att.rate}% (${p.att.participated}/${p.att.total})` : `présence : ${p.att.rate} % (${p.att.participated}/${p.att.total})`)
    : (isEn ? 'attendance: not available' : 'présence : non disponible');
  const attTitle = presidingNote
    ? (isEn ? 'The Assembly\'s President and Vice-Presidents referee the debates (nothing to do with the Premier). To stay neutral, they vote little or not at all — so a low or absent vote count does not mean they were absent.' : 'La présidence et les vice-présidences de l\'Assemblée arbitrent les débats (rien à voir avec la ou le premier ministre). Par neutralité, elles votent peu ou pas du tout — un faible taux ou une absence de vote ne veut donc pas dire qu\'elles étaient absentes.')
    : isEn
    ? `Share of the recorded divisions of the House in the ${ordinalLeg(historiqueLeg.courante || 43, true)} Legislature in which this MLA appears (for or against) — an indicator of presence; the Assembly publishes no attendance. Committee divisions, held in Section A, B or C with about a dozen members, are left out.`
    : `Part des votes par appel nominal tenus par la Chambre pendant la ${ordinalLeg(historiqueLeg.courante || 43, false)} législature où cette personne apparaît (pour ou contre) — un indicateur de présence ; l’Assemblée ne publie pas d’assiduité. Les votes de comité, tenus en Section A, B ou C avec une dizaine de député·e·s, sont laissés de côté.`
  // Carte au format de la maquette (Ministres.dc.html) : badge parti + Suivre
  // en tête, nom 800 uppercase, portefeuille bleu, puis les faits en rangées
  // étiquette/valeur (circonscription, présence, PL parrainés) et le courriel.
  const dep = isMin ? resolveDepute(name) : p.d;
  const riding = dep ? dep.riding : (isEn ? 'n/a' : 'n/d');
  const presidingShort = presidingNote ? '—' : null;
  const attShort = presidingShort ? presidingShort : (p.att ? pastillePresence(p.att.rate, isEn) + presencesPasseesTexte(dep?.assnatId, isEn) : (isEn ? 'n/a' : 'n/d'));
  const labels = isEn
    ? { riding:'Riding', att:'Vote attendance', bills:'Bills sponsored / term' }
    : { riding:'Circonscription', att:'Présence votes', bills:'PL parrainés / mandat' };
  return `
    <div class="m-card">
      <div class="m-card-top">
        <div class="m-top-row">
          ${pastilleMinistre(party, name, `background:${partyColors[party]}; color:${partyText(party)}`)}
          ${partageBouton(name)}${wikiBouton(name)}${finBouton(name)}
          <button class="follow-btn ${isFollowed?'on':''}" onclick="${followOnclick}">${isFollowed ? t('btn.following') : t('btn.follow')}</button>
        </div>
        <div class="m-name">${isMin ? `<a href="/ministres/${slugMinistre(name)}">${name}</a>` : name}</div>
        <div class="m-portfolio">${subtitle}</div>
      </div>
      <div class="m-card-bottom">
        <div class="m-row"><span class="m-label">${labels.riding}</span><span class="m-val">${riding}</span></div>
        ${dep?.mandats ? `<div class="m-row"><span class="m-label">${isEn ? 'Term' : 'Mandat'}</span><span class="m-val">${isEn ? ordinalLeg(dep.mandats, true) : (dep.mandats === 1 ? '1er' : dep.mandats + 'e')}</span></div>` : ''}
        <div title="${presidingNote ? attTitle : (isEn ? 'Attendance: share of recorded votes taken part in. PL: bills sponsored.' : 'Présence : part des votes nominaux où la personne a voté. PL : projets de loi parrainés.')}">${pastillesLegislatures(name, dep, p.att, presidingShort, isEn)}</div>
        <a class="m-mail" href="${mailHref}" ${email ? '' : 'target="_blank" rel="noopener"'} onclick="event.stopPropagation()" title="${mailTitle}">✉ ${email ? email : (isEn ? 'Contact details on leg.bc.ca' : 'Coordonnées sur leg.bc.ca')}</a>
      </div>
    </div>
  `;
}

function renderHemicycle(){
  if(!document.getElementById('compoBar')) return;   // vue absente de cette page
  // Refonte brutaliste : la composition est une barre empilée bordée (segments
  // proportionnels aux sièges, séparés par des bordures noires) + légende à
  // carrés — mêmes données réelles `seats` que l'ancien hémicycle SVG.
  const bar = document.getElementById('compoBar');
  const legend = document.getElementById('hemicycleLegend');
  if(!bar || !legend) return;
  const isEn = currentLang === 'en';
  // Entre le scrutin et l'ouverture, la barre montre les sièges remportés le 5 octobre (ASSEMBLY.sieges,
  // Élections Québec), pas ceux de la 43e législature.
  const resultat = ASSEMBLY.phase === 'entre-deux' && ASSEMBLY.sieges;
  const seatsAff = resultat
    ? Object.entries(ASSEMBLY.sieges).map(([party, n]) => { const s0 = seats.find(s => s.party === party) || {}; return { ...s0, party, n, label: s0.label?.replace(/\s*\(.*\)$/, '') || party, labelEn: s0.labelEn?.replace(/\s*\(.*\)$/, '') || party }; })
    : seats;
  const total = seatsAff.reduce((a,s)=>a+s.n,0);
  if(resultat){
    const h = document.querySelector('[data-i18n="h.composition"]');
    if(h) h.textContent = isEn ? `Composition — ${total} seats won on October 5` : `Composition — ${total} sièges remportés le 5 octobre`;
    const sub = document.querySelector('#sec-composition [data-i18n="apercu.composition.sub"]');
    if(sub) sub.textContent = isEn ? 'Élections Québec results · the new Assembly opens on November 17' : 'Résultats d’Élections Québec · la nouvelle Assemblée ouvre le 17 novembre';
  }
  bar.innerHTML = seatsAff.map((s,i)=>
    `<div class="compo-seg" title="${(isEn ? (s.labelEn||s.label) : s.label)} — ${s.n}" style="width:${(s.n/total*100).toFixed(2)}%; background:${partyColors[s.party] || '#999'};${i>0 ? ' border-left:3px solid var(--ink);' : ''}"></div>`
  ).join('');
  // Légende en ACRONYMES (le nom complet reste au survol des segments).
  legend.innerHTML = seatsAff.map(s=>`
    <div class="compo-row" title="${isEn ? (s.labelEn||s.label) : s.label}"><span class="compo-swatch" style="background:${partyColors[s.party]}"></span>${s.party} — <b>${s.n}</b></div>
  `).join('');
}

let ministresSortMode = null; // null (ordre par défaut) | 'desc' (+ actif) | 'asc' (- actif)
function toggleMinistresSort(){
  ministresSortMode = ministresSortMode === null ? 'desc' : (ministresSortMode === 'desc' ? 'asc' : null);
  updateMinistresSortLabel();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderDeputes(document.getElementById('searchMinistres')?.value);
}
// La capsule « Votes ↑ ↓ » : à côté de « Les ministres », et dans le titre de la vue classée (où
// « Les ministres » est caché). ↑ = les plus présents d'abord (desc), ↓ = les moins présents d'abord
// (asc) ; recliquer la flèche active revient à l'ordre habituel.
function setMinistresSort(mode){
  ministresSortMode = ministresSortMode === mode ? null : mode;
  updateMinistresSortLabel();
  renderMinistres(document.getElementById('searchMinistres')?.value);
  renderDeputes(document.getElementById('searchMinistres')?.value);
}
window.setMinistresSort = setMinistresSort;
function triVoteHtml(){
  const isEn = currentLang === 'en';
  const b = (mode, fleche, etiquette) => `<button type="button" class="tri-vote-btn${ministresSortMode === mode ? ' on' : ''}" aria-pressed="${ministresSortMode === mode}" title="${etiquette}" aria-label="${etiquette}" onclick="setMinistresSort('${mode}')">${fleche}</button>`;
  return `<span class="tri-vote-lbl">${isEn ? 'Votes' : 'Votes'}</span>`
    + b('desc', '↑', isEn ? 'Sort everyone by vote attendance, most present first' : 'Classer tout le monde par présence aux votes, les plus présents d’abord')
    + b('asc', '↓', isEn ? 'Sort everyone by vote attendance, least present first' : 'Classer tout le monde par présence aux votes, les moins présents d’abord');
}
function updateMinistresSortLabel(){
  { const c = document.getElementById('triVoteMinistres'); if(c) c.innerHTML = triVoteHtml(); }
  if(!document.getElementById('ministresSortToggle')) return;   // vue absente de cette page
  const btn = document.getElementById('ministresSortToggle');
  if(!btn) return;
  const isEn = currentLang === 'en';
  if(ministresSortMode === 'desc') btn.textContent = isEn ? '↓ Most active first' : '↓ + actif d\'abord';
  else if(ministresSortMode === 'asc') btn.textContent = isEn ? '↑ Least active first' : '↑ - actif d\'abord';
  else btn.textContent = isEn ? 'Sort: default order' : 'Trier : ordre par défaut';
}

function sortByAttendance(list, dir){
  // La présidence et les 3 vice-présidences (voir presidingRoles) ont parfois
  // un vrai pourcentage très bas (ex. un vice-président qui vote rarement en
  // dehors de ses rares remplacements), pas juste `null` — les exclure du
  // classement seulement quand `att` est absent laissait ces personnes-là
  // se glisser dans le tri normal, tandis que celles à 0 vote (att=null)
  // étaient poussées « à la fin » peu importe la direction : en ordre
  // ascendant, ça les faisait atterrir à la position des PLUS actif·ves.
  // Il faut exclure les 4 rôles de présidence du classement au complet, pas
  // seulement selon qu'ils ont ou non une donnée calculable.
  return list.slice().sort((a,b)=>{
    const nameA = a.type === 'minister' ? a.m.name : a.d.name;
    const nameB = b.type === 'minister' ? b.m.name : b.d.name;
    const excludedA = !!presidingRoleNote(nameA, false);
    const excludedB = !!presidingRoleNote(nameB, false);
    if(excludedA && excludedB) return 0;
    if(excludedA) return 1; // toujours en dernier, peu importe la direction
    if(excludedB) return -1;
    const ra = a.att ? a.att.rate : null;
    const rb = b.att ? b.att.rate : null;
    if(ra === null && rb === null) return 0;
    if(ra === null) return 1; // pas de donnée : toujours en dernier, peu importe la direction
    if(rb === null) return -1;
    return dir === 'desc' ? rb - ra : ra - rb;
  });
}

function renderMinistres(filter){
  if(!document.getElementById('ministresGrid')) return;   // vue absente de cette page
  const grid = document.getElementById('ministresGrid');
  const isEn = currentLang === 'en';
  // (le compteur de l accueil vient de stats.json : voir chargerDonnees. Cette vue ne le
  //  porte plus, et l ecrire ici plantait sur /ministres.)

  if(ministresSortMode){
    // Vue combinée : plus de priorité "Conseil des ministres" — tout le monde
    // (ministres + reste de l'Assemblée) sur un même pied d'égalité, classé
    // par présence. Voir toggleMinistresSort().
    { const _e = document.getElementById('ministresTitle'); if(_e) _e.style.display = 'none'; }
    { const _e = document.getElementById('deputesTitle'); if(_e) _e.style.display = 'none'; }
    { const _e = document.getElementById('deputesInfoBox'); if(_e) _e.style.display = 'none'; }
    const combinedTitle = document.getElementById('combinedTitle');
    combinedTitle.style.display = '';

    const f = norm(filter);
    const minList = ministers
      .filter(m => (!partyFilter || m.party===partyFilter) && (!f || norm(m.name).includes(f) || norm(m.role).includes(f) || norm(m.roleEn||'').includes(f)))
      .map(m => ({ type:'minister', m, att: computeAttendance(m.name), combined: true }));
    const ministerNames = new Set(ministers.map(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,''))));
    const depList = deputes
      .filter(d => !ministerNames.has(norm(d.name)) && (!partyFilter || d.party===partyFilter) && (!f ||
        norm(d.name).includes(f) || norm(d.riding).includes(f) || norm(d.region).includes(f)))
      .map(d => ({ type:'depute', d, att: attendanceForAssnatId(d.assnatId) }));
    const combined = sortByAttendance([...minList, ...depList], ministresSortMode);

    combinedTitle.innerHTML = `<span>${isEn
      ? `All elected members — ${ministresSortMode === 'desc' ? 'most present at votes first' : 'least present at votes first'} (${combined.length} shown)`
      : `Tou·te·s les élu·e·s — ${ministresSortMode === 'desc' ? 'les plus présents aux votes d’abord' : 'les moins présents aux votes d’abord'} (${combined.length} affiché·e·s)`}</span><span class="tri-vote">${triVoteHtml()}</span><span class="tri-vote-avis">${isEn
      ? '<b>A low rank does not always mean absent by choice.</b> A missed vote can be an official mission, an illness or a scheduling conflict: the Assembly’s register does not give the reason. Distance can also play a part: some ridings are very far from Victoria. The Speaker and Deputy Speakers vote little or not at all, out of neutrality.'
      : '<b>Un bas de classement ne veut pas toujours dire absent par choix.</b> Un vote manqué peut être une mission officielle, une maladie ou un conflit d’horaire : le registre de l’Assemblée n’en donne pas la raison. La distance peut entrer en compte aussi : certaines circonscriptions sont très loin de Victoria. La présidence et les vice-présidences votent peu ou pas du tout, par neutralité.'}</span>`;
    grid.innerHTML = combined.length
      ? combined.map(personCard).join('')
      : `<div class="no-results">${isEn ? 'No results for this search.' : 'Aucun résultat pour cette recherche.'}</div>`;
    return;
  }

  // Ordre par défaut : Conseil des ministres seulement dans cette grille (rang
  // de cabinet), le reste de l'Assemblée s'affiche séparément via renderDeputes().
  { const _e = document.getElementById('ministresTitle'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('deputesTitle'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('deputesInfoBox'); if(_e) _e.style.display = ''; }
  { const _e = document.getElementById('combinedTitle'); if(_e) _e.style.display = 'none'; }

  const f = norm(filter);
  const list = ministers.filter(m => (!partyFilter || m.party===partyFilter) && (!f || norm(m.name).includes(f) || norm(m.role).includes(f) || norm(m.roleEn||'').includes(f)));
  grid.innerHTML = list.map(m => personCard({ type:'minister', m, att: computeAttendance(m.name) })).join('');
  { const _e = document.getElementById('ministresCount'); if(_e) _e.textContent = ministers.length; }
}

// Comparateur de deux ministres (voir onglet 5, item réglé une fois la
// présence réelle disponible). Pas de ligne "postes précédents" — cet item a
// été volontairement écarté (LinkedIn et les bios officielles couvrent déjà
// ça), donc pas de donnée inventée ici pour remplir cette case.
function renderComparateurSelects(){
  if(!document.getElementById('compareA')) return;   // vue absente de cette page
  const selA = document.getElementById('compareA');
  const selB = document.getElementById('compareB');
  if(!selA || !selB) return;
  const isEn = currentLang === 'en';
  const placeholder = isEn ? '— Choose a minister —' : '— Choisir un ministre —';
  const options = `<option value="">${placeholder}</option>` + ministers.map(m => `<option value="${m.name.replace(/"/g,'&quot;')}">${m.name}</option>`).join('');
  const prevA = selA.value, prevB = selB.value;
  selA.innerHTML = options;
  selB.innerHTML = options;
  if([...selA.options].some(o=>o.value===prevA)) selA.value = prevA;
  if([...selB.options].some(o=>o.value===prevB)) selB.value = prevB;
}

function billsSponsoredBy(ministerName){
  const bareName = norm(ministerName.replace(/\s*\([^)]*\)\s*/g, ''));
  const memeNom = bills.filter(b => b.sponsor && norm(b.sponsor) === bareName);
  // Homonymes (les deux Eric Girard) : le nom du parrain ne suffit pas, il faut que son rôle
  // (« Ministre des Finances », jeu billsParrains) soit un rôle de CETTE personne. Sans rôle pour
  // trancher, on n'attribue rien plutôt que de prêter les lois de l'un à l'autre.
  const homonymes = deputes.filter(d => norm(d.name) === bareName).length > 1
    || ministers.some(m => m.name !== ministerName && norm(m.name.replace(/\s*\([^)]*\)\s*/g, '')) === bareName);
  if(!homonymes) return memeNom;
  const fiche = ministers.find(m => m.name === ministerName);
  const roles = fiche ? String(fiche.role || '').split('·').map(r => norm(r)).filter(Boolean) : [];
  return memeNom.filter(b => b.role && roles.includes(norm(b.role)));
}

function renderComparateurTable(){
  if(!document.getElementById('comparateurTable')) return;   // vue absente de cette page
  const container = document.getElementById('comparateurTable');
  if(!container) return;
  const isEn = currentLang === 'en';
  const nameA = document.getElementById('compareA')?.value;
  const nameB = document.getElementById('compareB')?.value;
  if(!nameA || !nameB){
    // Placeholder tant que les deux ministres ne sont pas choisis
    container.innerHTML = `<div class="compare-placeholder">
      <div class="cp-cols">
        <div class="cp-col ${nameA ? 'filled' : ''}"><span class="cp-slot">A</span><span class="cp-txt">${nameA ? nameA : (isEn ? 'Pick a first minister' : 'Choisissez un premier ministre')}</span></div>
        <div class="cp-vs">VS</div>
        <div class="cp-col ${nameB ? 'filled' : ''}"><span class="cp-slot">B</span><span class="cp-txt">${nameB ? nameB : (isEn ? 'Pick a second minister' : 'Choisissez un second ministre')}</span></div>
      </div>
      <div class="cp-hint">${isEn ? 'Portfolio · party · riding · vote attendance · bills sponsored — side by side.' : 'Portefeuille · parti · circonscription · présence votes · PL parrainés — côte à côte.'}</div>
    </div>`;
    return;
  }
  const mA = ministers.find(m => m.name === nameA);
  const mB = ministers.find(m => m.name === nameB);
  const depA = resolveDepute(nameA);
  const depB = resolveDepute(nameB);
  const presA = presidingRoleNote(nameA, isEn);
  const presB = presidingRoleNote(nameB, isEn);
  const attA = presA ? null : computeAttendance(nameA);
  const attB = presB ? null : computeAttendance(nameB);
  const billsA = billsSponsoredBy(nameA);
  const billsB = billsSponsoredBy(nameB);

  // Valeurs concises comme la maquette (pas de listes de titres qui débordent).
  const attCell = (att, pres) => pres ? '—' : (att ? pastillePresence(att.rate, isEn) : (isEn ? 'n/a' : 'n/d'));
  const rows = [
    [isEn?'Portfolio':'Portefeuille', isEn?(mA.roleEn||mA.role):mA.role, isEn?(mB.roleEn||mB.role):mB.role],
    [isEn?'Party':'Parti', mA.party, mB.party],
    [isEn?'Riding':'Circonscription', depA?depA.riding:'?', depB?depB.riding:'?'],
    [isEn?'Vote attendance':'Présence votes', attCell(attA,presA), attCell(attB,presB)],
    [isEn?'Bills sponsored':'PL parrainés', String(billsA.length), String(billsB.length)],
  ];

  container.innerHTML = `
    <div class="compare-table-wrap"><table class="compare-table">
      <tr><th></th><th>${mA.name}</th><th>${mB.name}</th></tr>
      ${rows.map(([label,a,b]) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`).join('')}
    </table></div>
  `;
}

/* ---------- État de l'Assemblée (source de vérité unique) ----------
   L'Assemblée nationale a été DISSOUTE le 27 août 2026 (fin de la 43e
   législature) : élections générales le 5 octobre 2026, nouvelle Assemblée
   convoquée le 17 novembre 2026.
   Conséquences factuelles, appliquées partout via cet objet :
     - tout projet de loi NON sanctionné meurt au feuilleton ;
     - les député·e·s cessent de l'être (ce sont des sortant·e·s / candidat·e·s) ;
     - on ne peut plus « challenger » un projet mort ni interpeller son parrain.
   ➜ Quand la nouvelle législature commencera (17 nov. 2026), remettre
     `dissolved: false` et mettre à jour la ligne « cal.status ». */
const ASSEMBLY = {
  // C.-B. : il n'y a PAS de machinerie d'élection ici, contrairement à DossierQuébec. L'état réel
  // des législatures est lu dans les données (legislatureEtat, etatLegislature plus haut), parce
  // qu'une date écrite à la main finit toujours par mentir. dissolved reste donc à false : les
  // textes de dissolution du Québec ne doivent jamais s'afficher.
  dissolved: false,
  challenge: true,     // le bouton « Demander une explication » et la bande jaune restent sur les projets
  filtreChallenge: false,   // … mais pas de filtre « 🔥 Challengés »
  abonnement: false,   // gratuit, sans abonnement : les conditions de l'Assemblée l'exigent (page des règles)
  cafe: false,
  dissolvedOn: null,
  electionOn: null,
  // Le premier dépôt de la législature montrée, pour reconnaître un projet encore vivant
  // (loiVivante). Lu dans data/bills.json, pas deviné.
  newLegislatureOn: null,
  resultat: '',
  resultatEn: '',
  gagnant: '',
  gagnantNote: '',
  gagnantNoteEn: '',
  ordrePartis: ['NDP', 'CON', 'IND', 'VERT'],
  sieges: {},
};

// Phase déduite de la DATE LOCALE du visiteur, pour que le site ne dise pas
// « élections le 5 octobre » le matin du 6 sans que personne n'ait à y toucher —
// c'est le moment de trafic maximal, et un site au futur y aurait l'air
// abandonné. Le jour du vote compte encore comme campagne (on vote jusqu'à
// 20 h). Le retour à « legislature » reste MANUEL : dissolved = false le
// 17 novembre, quand la nouvelle Assemblée siège.
// Le soir du vote compte déjà comme « après » : les bureaux ferment à 20 h, heure du Québec
// (1er oct. 2026 — avant, la phase ne changeait que le 6, et un résultat écrit le soir du 5
// restait invisible pendant toute la soirée électorale, au moment du plus fort trafic).
// Un résultat écrit dans ASSEMBLY.resultat s'affiche aussi, quelle que soit l'heure.
// C.-B. : il n'y a pas de phase électorale à deviner. Le site ne tient pas de calendrier
// d'élection — l'état des législatures est lu dans les données (etatLegislature). Ce champ ne
// reste que pour les fonctions de DossierQuébec qui l'interrogent encore.
ASSEMBLY.phase = ASSEMBLY.dissolved ? 'entre-deux' : 'legislature';

function statusLabel(s, step){
  const isEn = currentLang === 'en';
  // À la dissolution, tout ce qui n'est pas sanctionné meurt (« mort au feuilleton »
  // dans le jargon de l'Assemblée — gardé dans la bande d'explication et le Lexique,
  // mais PAS sur la pastille : ici on écrit en langage clair).
  // On distingue selon l'étape atteinte, sinon le libellé contredirait les chips
  // d'étapes affichées juste en dessous : 95 des 102 projets n'ont jamais dépassé
  // la présentation, 7 s'étaient rendus à l'adoption du principe.
  if(legislatureFinie() && s !== 'sanctionne'){
    // Appel sans étape (chips de filtre, qui portent sur un statut, pas un projet).
    if(step === undefined || step === null){
      return isEn ? 'Not passed' : 'Non adopté';
    }
    return (step <= 1)
      ? (isEn ? 'Dead on arrival' : 'Mort dans l\'œuf')
      : (isEn ? 'Died along the way' : 'Tombé en cours de route');
  }
  if(isEn){
    return s==='sanctionne' ? 'Assented to' : s==='laisse_de_cote' ? 'On ice' : 'Under review';
  }
  return s==='sanctionne' ? 'Sanctionnée' : s==='laisse_de_cote' ? 'Sur la glace' : 'À l\'étude';
}
function statusClass(s){
  if(legislatureFinie() && s !== 'sanctionne') return 'status-mort';
  return s==='sanctionne' ? 'status-sanctionne' : s==='laisse_de_cote' ? 'status-glace' : 'status-encours';
}

// Fait correspondre le nom du parrain (format "Prénom Nom", voir build-frontend-data.js)
// avec les listes ministers/deputes déjà présentes sur la page, pour afficher son parti.
// Retourne null si aucune correspondance fiable n'est trouvée (jamais de supposition).
function sponsorParty(sponsorName){
  if(!sponsorName) return null;
  const target = norm(sponsorName);
  const minister = ministers.find(m => norm(m.name.replace(/\s*\([^)]*\)\s*/g,'')) === target);
  if(minister) return minister.party;
  const depute = deputes.find(d => norm(d.name) === target);
  return depute ? depute.party : null;
}

// Parti du parrain, calculé UNE SEULE FOIS par projet et mis en cache.
// ⚠️ Ne pas appeler sponsorParty() dans le filtre de recherche : mesuré à 7,1 ms
// pour les 143 projets, soit près de trois fois le coût total d'une frappe
// (2,5 ms). Invisible sur un ordinateur, sensible sur un téléphone lent.
// On stocke le sigle ET le nom complet, pour que « CAQ » comme « coalition
// avenir québec » trouvent la même chose.
let _partiParProjet = null;
function partiDuProjet(b){
  if(!_partiParProjet){
    _partiParProjet = new Map();
    // ⚠️ Le nom complet vient de `seats`, PAS de `deputes` : le champ partyFull
    // existe bien dans data/deputes.json mais l'injection ne le reprend pas, et
    // le chercher là donnait silencieusement une chaîne vide — « CAQ » trouvait,
    // « coalition avenir » ne trouvait rien.
    const nomComplet = new Map();
    for(const s of seats) if(s.party && s.label) nomComplet.set(s.party, s.label);
    for(const x of bills){
      const sigle = sponsorParty(x.sponsor);
      _partiParProjet.set(x.id, sigle ? `${sigle} ${nomComplet.get(sigle) || ''}` : '');
    }
  }
  return _partiParProjet.get(b.id) || '';
}

function billCard(b, ctx){
  ctx = ctx || 'full';
  const domId = 'bill-summary-' + ctx + '-' + b.id;
  const isEn = currentLang === 'en';
  const title = isEn ? (b.titleEn||b.title) : b.title;
  const note = isEn ? (b.noteEn||b.note) : b.note;
  // Le résumé n'est plus dans `b` : il arrive au dépliement (voir resumesProjets).
  const url = isEn ? (b.urlEn||b.url) : b.url;
  const billLabel = isEn ? `Bill ${b.numAffiche ?? b.num}` : `PL nº ${b.numAffiche ?? b.num}`;
  const sponsorLabel = isEn ? 'Sponsor' : 'Parrain';
  const pourLabel = isEn ? 'yeas' : 'pour';
  const contreLabel = isEn ? 'nays' : 'contre';
  const abstLabel = isEn ? 'abstentions' : 'abstention';
  const srcNote = isEn ? "Summary written from the official title and public documents — not an excerpt of the bill's text." : "Résumé rédigé à partir du titre officiel et des documents publics — pas un extrait du texte de loi.";
  const lastActivityLabel = isEn ? 'Last activity' : 'Dernière activité';
  const lastActivityValue = b.lastActivity ? b.lastActivity : (isEn ? 'not confirmed' : 'non confirmée');
  const presentedOnLabel = isEn ? 'Tracked since' : 'Suivi depuis le';
  const presentedOnValue = b.presentedOn || (isEn ? 'unknown' : 'inconnu');
  const noSponsorLabel = isEn ? 'Not specified' : 'Non précisé';
  const party = sponsorParty(b.sponsor);
  const partyBadge = party ? `<span class="depute-party" style="background:${partyColors[party]}; color:${partyText(party)}">${party}</span>` : '';
  // Badge « 🔥 N demandes » (maquette) quand le projet est challengé — compte
  // AGRÉGÉ public (challengedCache) ; absent tant que le cache n'est pas chargé
  // (renderChallenged re-rend les listes une fois le cache arrivé).
  const chEntry = (challengedCache || []).find(c => Number(c.bill_id) === b.id);
  // Juste l'icône sur la carte (Martin, 29 sept. 2026) ; le nombre de demandes reste dans l'infobulle.
  const nbDemandes = chEntry ? `${Number(chEntry.cnt).toLocaleString(isEn ? 'en-CA' : 'fr-CA')} ${isEn ? (Number(chEntry.cnt) > 1 ? 'requests' : 'request') : (Number(chEntry.cnt) > 1 ? 'demandes' : 'demande')}` : '';
  const hotBadge = chEntry ? `<span class="hot-badge hot-badge-icone" title="${isEn ? 'Challenged: ' : 'Challengé : '}${nbDemandes}" aria-label="${isEn ? 'Challenged: ' : 'Challengé : '}${nbDemandes}">🔥</span>` : '';
  const isFollowed = !!followedBills[b.id];
  // Le suivi (et les alertes courriel) est caché sur les projets sanctionnés :
  // ils sont finaux, ne changeront plus d'étape, donc rien à suivre. Gardé sur
  // les « sur la glace » (laissés de côté) : un projet dormant pourrait être
  // réactivé, auquel cas la personne qui le suit voudra être avertie. Caché aussi
  // pendant une dissolution : tout projet non sanctionné est mort au feuilleton,
  // le suivre promettrait une alerte qui ne viendra jamais.
  const canFollow = loiVivante(b) && (b.status === 'encours' || b.status === 'laisse_de_cote');
  const followBtnId = 'suivre-' + ctx + '-' + b.id;
  const followRow = !canFollow ? '' : `<div class="bill-follow-row">
      <span class="follow-hint">${!currentUser
        ? (isEn ? 'Sign in to follow it — it goes to My file' : 'Connexion requise — il s’ajoute à Mon dossier')
        : (isEn ? 'It goes to My file' : 'Il s’ajoute à Mon dossier')}</span>
      <button class="follow-btn ${isFollowed?'on':''}" id="${followBtnId}" onclick="event.stopPropagation(); ${currentUser ? `toggleFollowBill(${b.id}, '${followBtnId}')` : 'goToAccount()'}">${!currentUser
        ? (isEn ? '🔒 Sign in to follow' : '🔒 Se connecter pour suivre')
        : libelleSuivreLoi(isFollowed, isEn)}</button>
    </div>`;
  // Bouton « Demander une explication » (remplace l'ancien « Suivre » pour les
  // projets de loi — le suivi des personnes reste intact ailleurs). 3 états :
  // déconnecté (mène au compte), à demander, déjà demandé. Voir peutEtreChallenge().
  const isFlagged = !!myFlaggedBills[b.id];
  const canFlag = peutEtreChallenge(b);
  const flagBtnId = 'demand-' + ctx + '-' + b.id;
  // Pendant la dissolution, on ne promet pas un courriel « si ça devient loi » : ça ne peut
  // pas arriver avant la rentrée. On dit ce qui se passe vraiment — la demande est comptée.
  const mailHint = ASSEMBLY.dissolved
    ? (isEn ? 'Recorded and counted — it waits for the new legislature on 17 November'
            : 'Enregistrée et comptée — elle attend la rentrée du 17 novembre')
    : (isEn ? 'One email at the moments that count (500 & 1,000 requests, or if it becomes law)'
            : 'Un courriel aux moments qui comptent (500 et 1000 demandes, ou si ça devient loi)');
  let flagRow = '';
  if(canFlag){
    let hint, label, onclick = '', title = '';
    if(!currentUser){
      hint = isEn ? 'Sign in — one request per person, no anonymous requests' : 'Connexion requise — une demande par personne, aucune demande anonyme';
      label = isEn ? '🔒 Sign in to challenge' : '🔒 Se connecter pour challenger';
      onclick = "goToAccount()";
    } else if(isFlagged){
      // Déjà challengé → re-cliquer RETIRE le challenge (bascule).
      hint = mailHint; label = isEn ? '✓ Challenged — remove' : '✓ Challengé — retirer';
      title = isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge';
      onclick = `toggleChallenge(${b.id}, '${flagBtnId}')`;
    } else {
      hint = mailHint; label = isEn ? 'Ask for an explanation' : 'Demander une explication';
      onclick = `toggleChallenge(${b.id}, '${flagBtnId}')`;
    }
    flagRow = `<div class="bill-follow-row">
      <span class="follow-hint">${hint}</span>
      <button class="follow-btn ${isFlagged?'on':''}" id="${flagBtnId}"${title?` title="${title}"`:''} onclick="event.stopPropagation(); ${onclick}">${label}</button>
    </div>`;
  }
  // Partage du projet : toujours les trois mêmes boutons, 𝕏 / Facebook / copier.
  // Le lien pointe vers /projets-de-loi?pl=NUM, qui ouvre directement CE projet
  // (voir openBillFromQuery).
  //
  // ⚠️ Ne PAS réintroduire navigator.share ici. On avait un bouton « ↗ Partager »
  // unique quand le navigateur supporte le partage natif — mais Chrome et Brave
  // le supportent AUSSI sur Windows, où il ouvre la fenêtre de partage du
  // système : un gros panneau modal pour copier un lien. Sur téléphone c'est
  // naturel, sur ordinateur c'est disproportionné, et on ne peut pas distinguer
  // les deux de façon fiable. Trois boutons visibles font le travail partout.
  const shareCtrls =
      `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'x', event)" aria-label="${isEn ? 'Share on X' : 'Partager sur X'}" data-reseau="x"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'fb', event)" aria-label="${isEn ? 'Share on Facebook' : 'Partager sur Facebook'}" data-reseau="fb"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 24V13.1h3.7l.55-4.3H13.6V6.1c0-1.24.35-2.09 2.13-2.09H18V.17A30 30 0 0 0 14.7 0C11.4 0 9.2 2 9.2 5.66v3.14H5.5v4.3h3.7V24z"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'li', event)" aria-label="${isEn ? 'Share on LinkedIn' : 'Partager sur LinkedIn'}" data-reseau="li"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.34 7.43a2.47 2.47 0 1 1 0-4.94 2.47 2.47 0 0 1 0 4.94zM7.48 20.45H3.2V9h4.28zM20.45 20.45h-4.26v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H7.94V9h4.1v1.56h.06c.57-1.08 1.96-2.22 4.04-2.22 4.32 0 5.12 2.84 5.12 6.54z"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'reddit', event)" aria-label="${isEn ? 'Share on Reddit' : 'Partager sur Reddit'}" data-reseau="reddit"><svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="11.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.6" cy="11" r="1.1" fill="currentColor"/><circle cx="12.4" cy="11" r="1.1" fill="currentColor"/><path d="M7.4 13.7c1.5 1 3.7 1 5.2 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 5l1-3.3 3 .8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="15.3" cy="2.8" r="1.3" fill="currentColor"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'threads', event)" aria-label="${isEn ? 'Share on Threads' : 'Partager sur Threads'}" data-reseau="threads"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.2 11.2c-.4-3-2.3-4.4-5-4.4-2 0-3.5.9-4.3 2.3M16.8 11.3c-2.6-.6-7.3-.5-7.3 2.2 0 2.6 4.6 2.7 6 .3 1-1.6 1.1-4 .6-5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17 11.4c3.2 1.3 3.6 5 1.2 7.3-2.6 2.5-8.9 2.7-11.7-.9C4 14.7 4.2 7.6 7.3 4.6c2.6-2.6 8.3-2.8 11.2.3 1 1 1.6 2.2 1.9 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'bsky', event)" aria-label="${isEn ? 'Share on Bluesky' : 'Partager sur Bluesky'}" data-reseau="bsky"><svg width="15" height="14" viewBox="0 0 24 22" aria-hidden="true"><path fill="currentColor" d="M12 9.6C10.6 6.9 6.8 1.9 3.6 1.3 1.3.9 1 3 1 4.4c0 1.3.8 6.2 1.3 7.1 1 1.9 3.5 2.4 5.9 2-4 .8-5.6 3-3 5.4 3.6 3.3 5.6-.6 6.8-3.2.1.2 0 0 0 0 1.2 2.6 3.2 6.5 6.8 3.2 2.6-2.4 1-4.6-3-5.4 2.4.4 4.9-.1 5.9-2 .5-.9 1.3-5.8 1.3-7.1 0-1.4-.3-3.5-2.6-3.1-3.2.6-7 5.6-8.4 8.3z"/></svg></button>`
    + `<button class="bill-share-btn ic" onclick="event.stopPropagation(); shareBill(${b.id}, 'copy', event)" aria-label="${isEn ? 'Copy link' : 'Copier le lien'}">⧉</button>`;
  const shareRow = `<div class="bill-share-row">
      <span class="bill-share-label">${isEn ? 'Share:' : 'Partager :'}</span>
      ${shareCtrls}
    </div>${boutonCafe(b, isEn)}${boiteAbonnement(isEn)}`;
  // Les votes ne sont plus affichés sur les cartes de projets de loi — le
  // détail complet (décomptes + qui a voté quoi) vit dans l'onglet Votes.
  return `
    <div class="bill" onclick="toggleBillSummary('${domId}', event)">
      <div class="head">
        <span class="num">${billLabel}</span>
        <div class="bill-head-main">
          <h3>${title}</h3>
          <div class="meta">${sponsorLabel} : ${b.sponsor || noSponsorLabel} · ${presentedOnLabel} ${presentedOnValue}</div>
        </div>
        <div class="bill-head-right">
          ${hotBadge}
          ${b.omnibus ? `<span class="status-pill omnibus-pill" title="${isEn ? 'Changes several laws under one title' : 'Modifie plusieurs lois sous un seul titre'}">Omnibus${b.nbLois ? ` · ${b.nbLois} ${isEn ? 'laws' : 'lois'}` : ''}</span>` : ''}
          ${partyBadge}
          <span class="status-pill ${statusClass(b.status)}">${statusLabel(b.status, b.step)}</span>
        </div>
      </div>
      <div class="bstep-row">
        ${(isEn?stepsEn:steps).map((s,i)=>{
          const cur = displayStep(b.step)-1;
          const cls = i < cur ? 'on' : (i === cur ? 'now' : 'off');
          return `<span class="bstep ${cls}">${s}</span>`;
        }).join('')}
      </div>
      <div class="expand-hint" id="hint-${domId}">${t('btn.viewSummary')}</div>
      <div class="bill-summary" id="${domId}" data-bill="${b.id}">
        <div class="bill-open-grid">
          <div>
            <div class="open-label">${isEn ? 'What it does, plainly' : 'Ce que ça fait, en clair'}</div>
            ${b.omnibus ? `<p class="omnibus-avis">${isEn ? `<strong>Omnibus bill:</strong> it changes ${b.nbLois || 'several'} laws and regulations, and its title names only part of them. The summary below covers them all, law by law.` : `<strong>Projet omnibus :</strong> il modifie ${b.nbLois || 'plusieurs'} lois et règlements, et son titre n’en nomme qu’une partie. Le résumé ci-dessous les couvre toutes, loi par loi.`}</p>` : ''}
            <div class="bill-summary-body"></div>
            <p class="src-note">${b.summaryAiGenerated ? (isEn ? '⚙ AI-generated summary of the bill as introduced — may not reflect amendments made since.' : '⚙ Résumé généré par IA à partir du texte tel que présenté — peut ne pas refléter les amendements adoptés depuis.') : srcNote}</p>
          </div>
          <div class="bill-open-side">
            <div class="open-label side">${lastActivityLabel}</div>
            <div class="last-event-box">${lastActivityValue}${note ? ` — ${note}` : ''}</div>
            <a class="bill-more" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${t('btn.viewFull')}</a>
            ${followRow}
            ${flagRow}
            ${shareRow}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Les résumés en clair des projets de loi — le cœur de l'onglet, mais aussi 177 ko bruts et
// 55 ko compressés, soit plus du tiers du poids de la page pour du texte qui ne s'affiche que
// dans la carte dépliée. Ils vivent donc dans data/bills-resumes-<langue>.json et arrivent au
// premier besoin : un dépliement de carte, ou une recherche par mot-clé (qui les fouille).
// Un fichier par langue : on n'a jamais besoin des deux à la fois.
const _resumes = new Map();
function resumesProjets(langue){
  const cle = langue === 'en' ? 'en' : 'fr';
  if(_resumes.has(cle)) return _resumes.get(cle);
  const p = fetch(archiveLeg ? `/data/archives/${archiveLeg}/bills-resumes-${cle}.json` : `/data/bills-resumes-${cle}.json`)
    .then(r => r.ok ? r.json() : null)
    // Un échec ne doit pas rester collé : on l'oublie pour que la prochaine tentative réessaie.
    .catch(() => null)
    .then(d => { if(!d) _resumes.delete(cle); return d; });
  _resumes.set(cle, p);
  return p;
}
// Ce qu'on a DÉJÀ sous la main, sans attendre. Sert à la recherche, qui doit rester synchrone.
let _resumesFr = null, _resumesEn = null;
function resumeConnu(b, isEn){
  const m = isEn ? _resumesEn : _resumesFr;
  return (m && m[b.id]) || (isEn && _resumesFr ? _resumesFr[b.id] : null) || null;
}
async function chargerResumes(langue){
  const m = await resumesProjets(langue);
  if(!m) return null;
  if(langue === 'en') _resumesEn = m; else _resumesFr = m;
  return m;
}

async function remplirResume(el){
  if(el.dataset.rempli) return;
  const isEn = currentLang === 'en';
  const corps = el.querySelector('.bill-summary-body');
  if(!corps) return;
  const dejaLa = resumeConnu({ id: el.dataset.bill }, isEn);
  if(!dejaLa) corps.innerHTML = `<p><em>${isEn ? 'Loading the summary…' : 'Chargement du résumé…'}</em></p>`;
  const m = await chargerResumes(isEn ? 'en' : 'fr');
  // L'anglais n'existe pas pour tous les projets : on retombe sur le français, comme avant.
  let texte = m ? m[el.dataset.bill] : null;
  if(!texte && isEn) texte = (await chargerResumes('fr'))?.[el.dataset.bill] || null;
  corps.innerHTML = texte
    || `<p><em>${isEn ? 'No plain-language summary for this bill yet: the official text, on leg.bc.ca, is the reference.' : 'Pas encore de résumé en langage clair pour ce projet : le texte officiel, sur leg.bc.ca, fait foi.'}</em></p>`;   // N.-B. : les résumés viendront plus tard (guide, étape 8)
  if(texte) el.dataset.rempli = '1';
  remplirMemoires(corps);
  remplirVotesProjet(corps);
}

// LES VOTES D'UN PROJET DE LOI (30 oct. 2026 : les votes ont quitté la barre du haut pour vivre dans
// la carte de leur projet). Le résumé apporte la tête de chaque carte de vote ; les noms arrivent à
// l'ouverture de la case « Qui a voté… », depuis data/archives/<législature>/votes/<id>.json (une
// copie par législature, voir scrapers/build-votes-data.js), et se dessinent comme sur /votes.
const _nomsLeg = new Map();
function nomsDeLaLegislature(leg){
  if(!_nomsLeg.has(leg)) _nomsLeg.set(leg, fetch(`/data/archives/${leg}/noms.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})));
  return _nomsLeg.get(leg);
}
let _courrielsP = null;
function courrielsDeputes(){
  if(Object.keys(deputeEmails).length) return Promise.resolve(deputeEmails);
  if(!_courrielsP) _courrielsP = fetch('/data/site/deputeEmails.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return _courrielsP;
}
function remplirVotesProjet(corps){
  for(const d of corps.querySelectorAll('details.bill-votes[data-objet]')){
    d.addEventListener('toggle', () => { if(d.open) remplirCartesVotes(d); });
    if(d.open) remplirCartesVotes(d);
  }
}
async function remplirCartesVotes(d){
  const isEn = currentLang === 'en';
  const objet = d.dataset.objet || '';
  for(const det of d.querySelectorAll('.vc-detail[data-vote]:not([data-rempli])')){
    det.dataset.rempli = '1';
    const colonnes = det.querySelector('.vc-ncols');
    colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Loading the names…' : 'Chargement des noms…'}</div>`;
    const leg = det.dataset.leg;
    const [nominal, noms, mails] = await Promise.all([
      fetch(`/data/archives/${leg}/votes/${encodeURIComponent(det.dataset.vote)}.json`).then(r => r.ok ? r.json() : null).catch(() => null),
      nomsDeLaLegislature(leg), courrielsDeputes(),
    ]);
    if(!nominal){
      delete det.dataset.rempli;
      colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Could not load the names. Open the official record below.' : 'Les noms n\'ont pas pu être chargés. Le procès-verbal officiel est en dessous.'}</div>`;
      continue;
    }
    const totals = { pour: (nominal.pour || []).length, contre: (nominal.contre || []).length, abstentions: (nominal.abstentions || []).length };
    det.querySelector('.vc-pgrid').innerHTML = contenuNominal({ totals }, nominal, isEn).partyBoxes;
    // Les trois colonnes de /votes, plus ✉ et ⧉ pour qui siège encore.
    const heads = isEn ? ['Yea', 'Nay', 'Abstentions'] : ['Pour', 'Contre', 'Abstentions'];
    colonnes.innerHTML = ['pour', 'contre', 'abstentions'].map((g, i) => {
      const lignes = (nominal[g] || []).map(([id, party]) => {
        const dep = deputeById.get(id);
        const nom = dep ? dep.name : (noms[id] || ('#' + id));
        const courriel = dep ? (mails[norm(dep.name)] || null) : null;
        const outils = courriel ? ` <a class="bill-votes-mail" href="mailto:${echapperHtml(courriel)}?subject=${objet}" aria-label="${isEn ? 'Email' : 'Écrire à'} ${echapperHtml(nom)}">✉</a><button type="button" class="bill-votes-copie" onclick="event.stopPropagation(); copierCourriel(this, '${echapperHtml(courriel)}')" title="${isEn ? 'Copy the address' : 'Copier l’adresse'}" aria-label="${isEn ? 'Copy the address of' : 'Copier l’adresse de'} ${echapperHtml(nom)}">⧉</button>` : '';
        return `<div class="vc-nrow${dep ? '' : ' bill-votes-ancien'}"><span class="vc-chip" style="background:${partyColors[party] || '#999'}"></span>${echapperHtml(nom)}${outils}</div>`;
      }).join('');
      return `<div class="vc-ncol"><div class="vc-nhead ${['pour', 'contre', 'abst'][i]}">${heads[i]} — ${totals[g]}</div><div class="vc-nbody">${lignes || `<div class="vc-empty">${isEn ? 'None' : 'Personne'}</div>`}</div></div>`;
    }).join('');
  }
}

// « Mémoires déposés » sous un projet de loi (21 oct. 2026). Le fichier public ne contient que le
// nombre ; un·e abonné·e reçoit la liste du serveur (api/export.js?jeu=consultations&pl=…), qui
// vérifie l'abonnement. Les autres gardent la phrase avec le lien vers /abonnement.
let _abonneP = null;
// Abonné·e : body.abonne cache les boutons café (Martin, 2 nov. 2026).
function marquerAbonne(){ document.body.classList.toggle('connecte', !!currentUser); estAbonne().then((a) => document.body.classList.toggle('abonne', a)); }
function estAbonne(){
  if(!currentUser) return Promise.resolve(false);
  if(!_abonneP) _abonneP = (async () => {
    try{
      const { data: { session } } = await supabaseClient.auth.getSession();
      const r = await fetch('/api/abonnement', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} });
      return r.ok && (await r.json()).abonne === true;
    }catch(e){ return false; }
  })();
  return _abonneP;
}
async function consultationsServeur(ids){
  const { data: { session } } = await supabaseClient.auth.getSession();
  const r = await fetch(`/api/export?jeu=consultations&pl=${encodeURIComponent(ids.join(','))}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
const mdDateCourte = (iso, isEn) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function listeMemoiresHtml(memoires, isEn){
  return `<ul class="bill-memoires-liste">${memoires.map((m) => `<li>${m.url
    ? `<a href="${mdH(m.url)}" target="_blank" rel="noopener">${mdH(m.depose)}</a>`
    : mdH(m.depose)} <span>${mdH(mdDateCourte(m.date, isEn))}</span></li>`).join('')}</ul>`;
}
async function remplirMemoires(corps){
  const boite = corps && corps.querySelector('.bill-memoires');
  if(!boite || boite.dataset.charge) return;
  if(!(await estAbonne())) return;
  boite.dataset.charge = '1';
  // Abonné·e : la pastille jaune « Réservé aux abonné·e·s » n'a plus lieu d'être.
  boite.querySelectorAll('.pastille-abonnes').forEach((p) => p.remove());
  const isEn = currentLang === 'en';
  const zone = boite.querySelector('.bill-memoires-corps');
  try{
    const d = await consultationsServeur([boite.dataset.memoires]);
    const p = d.projets?.[boite.dataset.memoires];
    if(!p || !p.memoires.length) return;
    zone.innerHTML = `<p class="bill-votes-note">${isEn ? 'Briefs as listed by the National Assembly (official titles, in French). The link opens the official brief.' : 'Les mémoires tels que l’Assemblée nationale les publie. Le lien ouvre le mémoire officiel.'}</p>${listeMemoiresHtml(p.memoires, isEn)}`;
  }catch(e){ delete boite.dataset.charge; }
}

function toggleBillSummary(domId, evt){
  if(evt) evt.stopPropagation();
  // Un clic dans la liste des lois touchées (son + ou la liste dépliée) ne ferme pas la carte.
  // Ailleurs dans son encadré que sur le +, le clic ouvre ou ferme la liste, et seulement elle.
  const lois = evt && evt.target && evt.target.closest ? evt.target.closest('.bill-lois') : null;
  if(lois){
    if(!evt.target.closest('summary') && !evt.target.closest('a')) lois.open = !lois.open;
    return;
  }
  // Même chose pour la case « Qui a voté » : un clic dedans (nom, ✉, liste) ne ferme pas la carte.
  if(evt && evt.target && evt.target.closest && evt.target.closest('.bill-votes')) return;
  const el = document.getElementById(domId);
  const hint = document.getElementById('hint-'+domId);
  const willOpen = !el.classList.contains('open');
  if(willOpen) remplirResume(el);
  if(willOpen){
    // Accordéon (maquette) : un seul résumé ouvert à la fois.
    document.querySelectorAll('.bill-summary.open').forEach(other=>{
      if(other === el) return;
      other.classList.remove('open');
      const h = document.getElementById('hint-'+other.id);
      if(h) h.textContent = t('btn.viewSummary');
    });
  }
  el.classList.toggle('open', willOpen);
  if(hint) hint.textContent = willOpen ? t('btn.hideSummary') : t('btn.viewSummary');
  // À l'ouverture, le titre du projet revient devant les yeux (Martin, 30 oct. 2026) :
  // fermer le résumé du dessus fait remonter la page et laissait le titre hors écran.
  if(willOpen){
    const carte = el.closest('.bill');
    const entete = document.querySelector('header');
    const haut = entete && getComputedStyle(entete).position.match(/sticky|fixed/) ? entete.offsetHeight : 0;
    if(carte) window.scrollTo({ top: carte.getBoundingClientRect().top + scrollY - haut - 12, behavior: 'smooth' });
  }
}

// Bascule la section « votes enregistrés » d'une carte entre la vue compacte
// (une ligne par vote) et la vue détaillée (détail nominatif, les + par ligne).
function toggleBillVotes(id){
  const compact  = document.getElementById(id + '-compact');
  const detailed = document.getElementById(id + '-detailed');
  const plus     = document.getElementById('plus-' + id);
  if(!compact || !detailed) return;
  const opening = detailed.style.display === 'none';
  detailed.style.display = opening ? '' : 'none';
  compact.style.display  = opening ? 'none' : '';
  if(plus) plus.textContent = opening ? '−' : '+';
}

let billsStatusFilter = '';
let billsStepFilter = null;
let billsSortDir = 'desc';
const billsStatusOrder = ['sanctionne','encours','laisse_de_cote'];

function renderStatusFilters(){
  if(!document.getElementById('statusFilters')) return;   // vue absente de cette page
  const el = document.getElementById('statusFilters');
  if(!el) return;
  const allLabel = currentLang==='en' ? 'All statuses' : 'Tous les statuts';
  el.innerHTML = `<span class="status-chip ${!billsStatusFilter?'active':''}" onclick="setBillsStatusFilter('')">${allLabel}</span>` +
    billsStatusOrder.map(s=>`<span class="status-chip ${billsStatusFilter===s?'active':''}" onclick="setBillsStatusFilter('${s}')">${statusLabel(s)}</span>`).join('');
}
function toggleFilterPanel(which){
  const panelId = which === 'status' ? 'statusFilters' : 'stepFilters';
  const btnId = which === 'status' ? 'statusFilterBtn' : 'stepFilterBtn';
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  const isOpen = panel.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen);
}
function closeFilterPanelsOnMobile(){
  if(window.innerWidth > 640) return;
  ['statusFilters','stepFilters'].forEach(id=>{
    document.getElementById(id).classList.remove('open');
  });
  ['statusFilterBtn','stepFilterBtn'].forEach(id=>{
    document.getElementById(id).setAttribute('aria-expanded','false');
  });
}

function setBillsStatusFilter(s){
  billsStatusFilter = (billsStatusFilter===s) ? '' : s;
  renderStatusFilters();
  renderBills();
  closeFilterPanelsOnMobile();
}

function renderStepFilters(){
  if(!document.getElementById('stepFilters')) return;   // vue absente de cette page
  const el = document.getElementById('stepFilters');
  if(!el) return;
  const labels = currentLang==='en' ? stepsEn : steps;
  el.innerHTML = labels.map((s,i)=>`<span class="step-chip ${billsStepFilter===i+1?'active':''}" onclick="setBillsStepFilter(${i+1})">${s}</span>`).join('');
}
function setBillsStepFilter(n){
  billsStepFilter = (billsStepFilter===n) ? null : n;
  renderStepFilters();
  renderBills();
  closeFilterPanelsOnMobile();
}

function updateSortToggleLabel(){
  if(!document.getElementById('sortToggle')) return;   // vue absente de cette page
  const btn = document.getElementById('sortToggle');
  if(!btn) return;
  // Libellés courts : le bouton vit dans la rangée des contrôles, à côté de la
  // recherche. Il annonce l'ORDRE COURANT, pas l'action — c'est ce qu'on lit sur
  // les en-têtes de tri partout ailleurs.
  const asc = currentLang==='en' ? '↑ Oldest activity' : '↑ Activité ancienne';
  const desc = currentLang==='en' ? '↓ Recent activity' : '↓ Activité récente';
  btn.textContent = billsSortDir === 'desc' ? desc : asc;
  btn.setAttribute('title', currentLang==='en'
    ? 'Sort by date of last activity on the bill'
    : "Trier par date de dernière activité sur le projet de loi");
}
function toggleBillsSort(){
  billsSortDir = billsSortDir === 'desc' ? 'asc' : 'desc';
  updateSortToggleLabel();
  billsShown = BILLS_STEP;
  renderBills();
}

// Filtre rapide des votes : Tous / Divisés / Projets de loi / Motions.
//
// Remplace un réglage « afficher les motions » qui n'a JAMAIS fonctionné : son
// état existait, son libellé était traduit, mais aucun bouton ne le posait dans
// la page, ET renderVotes ne le lisait pas. Doublement mort.
//
// « Divisé » = au moins deux partis ont pris des positions majoritaires
// différentes. Mesuré sur les 735 votes de la 43e législature : 52 % sont
// unanimes (motions de condamnation, nominations — lire « 105 pour, 0 contre »
// n'apprend rien), 44 % opposent les partis, et AUCUN n'est serré — avec 79
// sièges, la CAQ gagne chaque affrontement par une cinquantaine de voix.
// L'information n'est donc pas qui gagne : c'est sur quoi on s'oppose.
let votesQuickFilter = 'tous';
function setVotesQuickFilter(k){
  votesQuickFilter = k;
  votesShown = 6;
  renderVotes();
}
// Calculé au build, plus au chargement : c'est scrapers/build-votes-data.js qui parcourt le
// détail nominatif et pose `divise` sur chaque vote. Avant, le navigateur relisait 1 032 ko de
// nominatif à la première frappe dans le champ de recherche — pour en tirer 735 booléens.
function voteDivise(v){
  return v.divise === true;
}
function voteAdmisParFiltre(v, filtre){
  if(filtre === 'divises') return voteDivise(v);
  if(filtre === 'projets') return !!v.billNum;
  if(filtre === 'motions') return !v.billNum;
  return true;
}
// Les compteurs tiennent compte de la recherche en cours (comme sur Promesses) :
// le chiffre d'un bouton doit correspondre à ce qu'on verrait en le pressant.
function renderVotesQuickFilters(correspondRecherche){
  if(!document.getElementById('votesQuickFilters')) return;   // vue absente de cette page
  const el = document.getElementById('votesQuickFilters');
  if(!el) return;
  const isEn = currentLang === 'en';
  const defs = [
    ['tous',    isEn ? 'All' : 'Tous'],
    ['divises', isEn ? 'Divided' : 'Divisés'],
    ['projets', isEn ? 'Bills' : 'Projets de loi'],
    ['motions', 'Motions'],
  ];
  const titres = {
    divises: isEn
      ? 'Votes where at least two parties took opposite positions'
      : 'Votes où au moins deux partis ont pris des positions opposées',
    motions: isEn
      ? 'Motions are not bills: they state a position, they do not make law'
      : 'Une motion n\'est pas un projet de loi : elle exprime une position, elle ne fait pas de loi',
  };
  el.innerHTML = defs.map(([k, label]) => {
    const n = votes.filter(v => correspondRecherche(v) && voteAdmisParFiltre(v, k)).length;
    const sel = votesQuickFilter === k;
    return `<button class="qf-btn ${sel ? 'active' : ''}${n === 0 ? ' qf-zero' : ''}" onclick="setVotesQuickFilter('${k}')"${titres[k] ? ` title="${titres[k]}"` : ''}>${label} <span class="qf-n">${n}</span></button>`;
  }).join('');
}

// Filtre rapide des projets (maquette) : Tous / En cours / Adoptés / 🔥 Challengés
let billsQuickFilter = 'tous';
// Challengés et Omnibus se cumulent avec le statut (Tous / Non adoptés / Adoptés) et entre eux
// (Martin, 25 sept. 2026) : « Adoptés » + « Omnibus » = les omnibus adoptés.
const BILLS_EXTRAS = ['challenges', 'omnibus'];
const billsExtras = new Set();
// On n'affiche pas les 143 projets d'un coup : 10, puis « + 10 » à la demande.
// ⚠️ Toute action qui change la LISTE (filtre, recherche, tri) doit remettre ce
// compteur à BILLS_STEP — sinon on garde une fenêtre ouverte sur une liste qui
// n'a plus rien à voir, et le lecteur croit voir « tout » ce qui correspond.
const BILLS_STEP = 10;
let billsShown = BILLS_STEP;
function loadMoreBills(){ billsShown += BILLS_STEP; renderBills(); }
function setBillsQuickFilter(k){
  if(BILLS_EXTRAS.includes(k)){ billsExtras.has(k) ? billsExtras.delete(k) : billsExtras.add(k); }
  else billsQuickFilter = k;
  billsShown = BILLS_STEP;
  renderBills();
}
function renderBillsQuickFilters(){
  if(!document.getElementById('billsQuickFilters')) return;   // vue absente de cette page
  const el = document.getElementById('billsQuickFilters');
  if(!el) return;
  const isEn = currentLang === 'en';
  const defs = [
    ['tous', isEn ? 'All' : 'Tous'],
    ['encours', legislatureFinie() ? (isEn ? 'Not passed' : 'Non adoptés') : (isEn ? 'Active' : 'En cours')],
    ['adoptes', isEn ? 'Passed' : 'Adoptés'],
    ...(ASSEMBLY.filtreChallenge ? [['challenges', isEn ? '🔥 Challenged' : '🔥 Challengés']] : []),   // N.-B. : pas de filtre (Martin, 7 nov. 2026)
    // Omnibus (25 sept. 2026) : un projet qui touche plusieurs lois sous un seul titre.
    ...((typeof bills !== 'undefined' && bills.some((b) => b.omnibus)) ? [['omnibus', 'Omnibus']] : []),   // N.-B. : le filtre n'apparaît que si un projet est omnibus
  ];
  el.innerHTML = defs.map(([k, label]) =>
    `<button class="qf-btn ${(billsQuickFilter===k || billsExtras.has(k))?'active':''}"${BILLS_EXTRAS.includes(k) ? ` aria-pressed="${billsExtras.has(k)}"` : ''} onclick="setBillsQuickFilter('${k}')">${label}</button>`
  ).join('');
}

function renderBills(keyword){
  if(!document.getElementById('billsList')) return;   // vue absente de cette page
  renderArchivesNote();
  _rangCafe = 0;   // les libellés du bouton café repartent du premier (boutonCafe)
  keyword = keyword !== undefined ? keyword : (document.getElementById('searchBills')?.value || '');
  const kw = norm(keyword);
  const isEn = currentLang === 'en';
  const ch = challengedCache || [];
  // La recherche fouille les résumés, qui ne sont plus dans la page. Dès qu'on cherche vraiment
  // quelque chose, on va les chercher et on refait le rendu une fois arrivés — plutôt que de
  // faire payer 55 ko à tous ceux qui ne cherchent jamais rien. Entre les deux, la recherche
  // porte déjà sur le titre, la note, le parrain et le numéro.
  if(kw && !_resumesFr) chargerResumes('fr').then(m => { if(m) renderBills(keyword); });
  // « 3 », « pl 3 », « PL Nº 3 », « projet de loi n° 3 » désignent tous le PROJET
  // NUMÉRO 3, et rien d'autre. Sans cette règle, « 3 » renvoyait 75 projets (tout
  // résumé ou toute date contenant un 3) et « pl 3 » en renvoyait 14, parce que
  // « pl 30 », « pl 31 »… contiennent « pl 3 » comme sous-chaîne.
  // ?parrain=Nom (lien des cartes de ministres) : tant que la recherche contient ce nom tel quel,
  // seuls les projets dont il ou elle est le parrain restent, pas ceux qui le nomment dans leur résumé.
  const parrainDemande = norm(new URLSearchParams(location.search).get('parrain') || '');
  const parParrain = parrainDemande && kw === parrainDemande;
  const numCherche = (kw.match(/^(?:pl|projet de loi)?\s*(?:n[°ºo]?\s*)?(\d+)$/) || [])[1] ?? null;
  const list = bills.filter(b => {
    const quickOk = (billsQuickFilter === 'tous'
      || (billsQuickFilter === 'encours' && (legislatureFinie() ? b.status !== 'sanctionne' : b.status === 'encours'))
      || (billsQuickFilter === 'adoptes' && b.status === 'sanctionne'))
      && (!billsExtras.has('challenges') || ch.some(c => Number(c.bill_id) === b.id))
      && (!billsExtras.has('omnibus') || b.omnibus);
    const summaryText = ((_resumesFr && _resumesFr[b.id]) || '').replace(/<[^>]+>/g, ' ');
    // On cherche dans : le titre, le résumé en clair, la ligne de statut, le nom
    // du parrain, le numéro sous toutes ses écritures, et le PARTI du parrain
    // (sigle + nom complet). Sans le parti, taper « CAQ » ne donnait rien alors
    // que chaque carte affiche une pastille CAQ — le lecteur croit à un bogue.
    // « pl 3 » est ajouté parce que c'est la notation que le site lui-même
    // affiche sur toutes les cartes ; elle ne trouvait rien.
    const haystack = norm([
      b.title, summaryText, b.note, b.sponsor,
      'projet de loi n° ' + b.num, 'pl ' + b.num, 'pl no ' + b.num,
      partiDuProjet(b),
    ].join(' '));
    const kwOk = !kw || (parParrain ? norm(b.sponsor) === parrainDemande : numCherche !== null ? String(b.num) === numCherche : haystack.includes(kw));
    return quickOk && kwOk;
  }).sort((a,b)=>{
    const da = a.lastActivity || '', db = b.lastActivity || '';
    if(!da && !db) return 0;
    if(!da) return 1;
    if(!db) return -1;
    return billsSortDir === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
  });
  // La bande jaune « challenger » s'intercale entre le 2e et le 3e projet :
  // 2 premiers dans #billsList, le reste dans #billsListRest (la bande est
  // le noeud HTML statique entre les deux).
  const el = document.getElementById('billsList');
  const rest = document.getElementById('billsListRest');
  const banner = document.getElementById('band-challenge-explainer');
  const visibles = list.slice(0, billsShown);
  if(list.length){
    // Entre la 1re et la 2e carte, l'astuce de l'accueil (Martin, 30 sept. 2026) : on ne devine pas
    // qu'une carte s'ouvre d'un clic.
    const astuce = `<div class="bills-astuce">${isEn ? '↓ Click anywhere in the white square to see the summary ↓' : '↓ Cliquez n’importe où dans le carré blanc pour voir le résumé ↓'}</div>`;
    el.innerHTML = visibles.slice(0, 2).map((b, i)=>(i === 1 ? astuce : '') + billCard(b,'full')).join('');
    if(rest){
      rest.innerHTML = visibles.slice(2).map(b=>billCard(b,'full')).join('');
      // Barre « + 10 », même patron que celle des votes.
      if(list.length > visibles.length){
        const reste = list.length - visibles.length;
        const pas = Math.min(BILLS_STEP, reste);
        rest.innerHTML += `<button class="votes-more" onclick="loadMoreBills()">${isEn
          ? `Show ${pas} more — ${visibles.length} of ${list.length}`
          : `Voir ${pas} de plus — ${visibles.length} sur ${list.length}`}</button>`;
      } else if(list.length > BILLS_STEP){
        rest.innerHTML += `<div class="votes-more-note">${isEn
          ? `All ${list.length} shown` : `Les ${list.length} affichés`}</div>`;
      }
    }
    // N.-B. (Martin, 7 nov. 2026) : le premier projet arrive ouvert, comme sur l'accueil ;
    // l'accordéon de toggleBillSummary le referme quand on en ouvre un autre.
    const premier = el.querySelector('.bill-summary');
    if(premier && !document.querySelector('.bill-summary.open')){
      premier.classList.add('open');
      remplirResume(premier);
      const h = document.getElementById('hint-' + premier.id);
      if(h) h.textContent = t('btn.hideSummary');
    }
    // La bande explicative suit le bouton : tant qu'on peut challenger, on explique ce que
    // ça veut dire. Pendant la dissolution, la deuxième ligne change — on ne promet pas une
    // pétition qu'aucune Assemblée ne peut recevoir avant la rentrée.
    if(banner){
      banner.style.display = '';
      const p2 = banner.querySelector('[data-i18n^="chexp.p2"]');
      if(p2) p2.setAttribute('data-i18n', ASSEMBLY.dissolved ? 'chexp.p2.dissous' : 'chexp.p2');
    }
  } else {
    el.innerHTML = `<div class="no-results">${isEn ? 'No bill matches this search.' : 'Aucun projet de loi ne correspond à cette recherche.'}</div>`;
    if(rest) rest.innerHTML = '';
    if(banner) banner.style.display = 'none'; // pas de bande sur « aucun résultat »
  }
  // (idem : le compteur de l accueil vient de stats.json.)
  // Titre de résultats + note (suivent le filtre actif et la langue)
  renderBillsQuickFilters();
  const titles = {
    tous:       isEn ? 'All bills' : 'Tous les projets',
    encours:    legislatureFinie() ? (isEn ? 'Bills that never passed' : 'Projets non adoptés') : (isEn ? 'Active bills' : 'En cours'),
    adoptes:    isEn ? 'Passed bills' : 'Adoptés',
    challenges: isEn ? 'Challenged bills' : 'Challengés',
    omnibus:    isEn ? 'Omnibus bills — several laws under one title' : 'Projets omnibus — plusieurs lois sous un seul titre',
  };
  const titleEl = document.getElementById('billsResultTitle');
  const noteEl = document.getElementById('billsResultNote');
  // Le statut, puis les filtres cumulés : « Adoptés · Omnibus ». Seul un filtre cumulé sur « Tous »
  // garde son titre complet.
  const extras = BILLS_EXTRAS.filter(k => billsExtras.has(k));
  const titre = extras.length === 1 && billsQuickFilter === 'tous' ? titles[extras[0]]
    : [billsQuickFilter === 'tous' && extras.length ? null : titles[billsQuickFilter], ...extras.map(k => k === 'omnibus' ? 'Omnibus' : (isEn ? 'Challenged' : 'Challengés'))].filter(Boolean).join(' · ');
  if(titleEl) titleEl.textContent = titre;
  // La note dit ce qui est À L'ÉCRAN sur le total filtré — sinon annoncer « 143 »
  // au-dessus de 10 cartes laisse croire à un bogue d'affichage.
  if(noteEl){
    const combien = visibles.length < list.length ? `${visibles.length} / ${list.length}` : `${list.length}`;
    noteEl.textContent = `${combien} ${isEn ? 'shown · click a card → plain summary' : 'affiché·s · cliquez une carte → résumé en clair'}`;
  }
}

function renderApercuBills(){
  const e = document.getElementById('apercuBills');
  if(!e) return;   // vue absente de cette page
  // C.-B. (cahier « Sun & waves », 8 nov. 2026) : les projets récents sont un TABLEAU — numéro,
  // titre, étape, date de dépôt — et chaque rangée mène à la fiche du projet. La maquette du
  // Nouveau-Brunswick en faisait des rangées dépliantes : ce n'est pas ce que le cahier montre.
  const isEn = currentLang === 'en';
  const entetes = isEn
    ? ['No.', 'Title', 'Stage', 'Introduced']
    : ['N°', 'Titre', 'Étape', 'Dépôt'];
  e.innerHTML = '<table class="bc-tableau"><thead><tr>'
    + entetes.map((t, i) => '<th' + (i === 0 ? ' style="width:72px"' : '') + '>' + t + '</th>').join('')
    + '</tr></thead><tbody>'
    + bills.slice(0, 5).map((b, i) => ligneProjetAccueil(b) + (i === 0 ? ligneOuverteAccueil(b) : '')).join('')
    + '</tbody></table>';
}
function ligneProjetAccueil(b){
  const isEn = currentLang === 'en';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const etapes = isEn ? ['1st reading', '2nd reading · committee', '3rd reading'] : ['1re lecture', '2e lecture · comité', '3e lecture'];
  const etiquette = b.status === 'sanctionne' || b.status === 'laisse_de_cote'
    ? statusLabel(b.status, b.step)
    : etapes[Math.min(Math.max(Number(b.step) || 1, 1), 3) - 1];
  const jour = (iso) => {
    if(!iso) return '—';
    const [a, m, j] = String(iso).split('-').map(Number);
    // L'année compte : les projets de la 43e s'étalent sur 2025 ET 2026, et « Oct 23 » seul
    // désignerait deux dates différentes.
    return new Date(a, m - 1, j).toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { day:'numeric', month:'short', year:'numeric' });
  };
  const fiche = b.legislature && b.introSession
    ? '/projets-de-loi/' + b.num + '-' + b.legislature + '-' + b.introSession + paramLangue(true)
    : '/projets-de-loi?pl=' + encodeURIComponent(b.id);
  const numero = esc(String(b.numAffiche ?? b.num));
  const titre = esc(isEn ? (b.titleEn || b.title) : b.title);
  return '<tr onclick="location.href=' + JSON.stringify(fiche).replace(/"/g, '&quot;') + '" style="cursor:pointer">'
    + '<td class="bc-num">' + numero + '</td>'
    // La date est écrite DEUX fois : dans sa colonne, et sous le titre. Sur un téléphone, la
    // colonne est cachée et c'est cette ligne-là qui reste — un tableau à quatre colonnes
    // débordait l'écran de 43 pixels, et la page se mettait à glisser de côté.
    + '<td><a href="' + fiche + '">' + titre + '</a><span class="bc-date-petite">' + jour(b.presentedOn) + '</span></td>'
    + '<td><span class="bc-etape">' + esc(etiquette) + '</span></td>'
    + '<td class="bc-date-col">' + jour(b.presentedOn) + '</td>'
    + '</tr>';
}

// La PREMIÈRE rangée du tableau est dépliée d'office (Martin, 8 novembre 2026) : une rangée
// cliquable ne dit pas d'elle-même où elle mène ni ce qu'on y trouve. Celle-ci le montre, sur le
// projet le plus récent, et les suivantes se lisent alors toutes seules.
function ligneOuverteAccueil(b){
  const isEn = currentLang === 'en';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const jour = (iso) => {
    if(!iso) return null;
    const [a, m, j] = String(iso).split('-').map(Number);
    return new Date(a, m - 1, j).toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', { day:'numeric', month:'long', year:'numeric' });
  };
  const fiche = b.legislature && b.introSession
    ? '/projets-de-loi/' + b.num + '-' + b.legislature + '-' + b.introSession + paramLangue(true)
    : '/projets-de-loi?pl=' + encodeURIComponent(b.id);
  const depot = jour(b.presentedOn);
  const faits = [];
  if(b.sponsor) faits.push((isEn ? 'Introduced by ' : 'Déposé par ') + '<b>' + esc(b.sponsor) + '</b>' + (depot ? (isEn ? ' on ' : ' le ') + depot : ''));
  else if(depot) faits.push((isEn ? 'Introduced on ' : 'Déposé le ') + depot);
  faits.push((isEn ? 'Where it stands: ' : 'Où il en est : ') + esc(statusLabel(b.status, b.step)));
  const officiel = isEn ? (b.urlEn || b.url) : (b.url || b.urlEn);
  return '<tr class="bc-ligne-ouverte"><td colspan="4">'
    + '<div class="bc-ouvert-faits">' + faits.join(' · ') + '</div>'
    + '<p class="bc-ouvert-mode">' + (isEn
      ? "Every row leads to the bill's page: each stage with its date, the recorded votes if there were any and the link to the official text."
      : "Chaque rangée mène à la fiche du projet : chaque étape avec sa date, les votes nominatifs s'il y en a eu et le lien vers le texte officiel.")
    + '</p>'
    + '<div class="bc-ouvert-liens"><a href="' + fiche + '">' + (isEn ? 'Open this bill' : 'Ouvrir ce projet') + ' →</a>'
    + (officiel ? '<a href="' + esc(officiel) + '" target="_blank" rel="noopener">' + (isEn ? 'Official text on leg.bc.ca' : 'Texte officiel sur leg.bc.ca') + ' →</a>' : '')
    + '</div></td></tr>';
}

// Projets « challengés » : affiche PUBLIQUEMENT les projets de loi ayant atteint
// le seuil de demandes d'explications, via l'agrégat Supabase bc_flag_counts() qui
// ne renvoie QUE les totaux (jamais qui a demandé quoi). Robuste : si la fonction
// SQL n'existe pas encore, l'appel échoue en douceur -> état vide, pas d'erreur.
// Paliers de « challenge » (montent en continu, le compteur ne se remet jamais à
// zéro). 500 = apparition + momentum ; 1000 = seuil pétition ; au-dessus =
// escalade (déclenchée MANUELLEMENT par l'admin — voir le panneau admin).
// ⚠️ La fonction SQL bc_flag_counts() doit renvoyer les projets >= 500 (le 1er palier).
const CHALLENGE_TIERS = [500, 1000, 2500, 5000, 25000];
const CHALLENGE_THRESHOLD = CHALLENGE_TIERS[0];
const PETITION_THRESHOLD = 1000;
// Un projet apparaît dans « Projets challengés » dès la PREMIÈRE demande (pas
// besoin d'attendre 500) — pour montrer l'élan et laisser les gens « piler »
// dessus directement depuis l'accueil. ⚠️ Nécessite que la fonction SQL
// bc_flag_counts() renvoie aussi les projets sous 500 : voir
// scripts/supabase-schema-campaign.sql (having count(*) >= 1).
const CHALLENGE_DISPLAY_MIN = 1;
const CHALLENGE_DISPLAY_MAX = 9; // cap total (pagine par 3 via « Voir plus »)
// Pagination en carrousel : 3 cartes affichées à la fois. « Voir plus »
// REMPLACE les 3 visibles par les 3 suivantes (slide-in), et reboucle au
// début une fois au bout. La page courante survit aux re-rendus.
let challengedPage = 0;
const nextChallengeTier = cnt => CHALLENGE_TIERS.find(t => cnt < t) ?? null;
let challengedCache = null;

// bc_flag_counts() ne renvoie que des `bill_id` : il faut des titres pour en faire des cartes.
// Jusqu'au 24 septembre 2026 cette jointure se faisait sur la variable `bills` de la page —
// or l'accueil n'en charge que 4 (`apercuBills` remplit la MÊME variable que la liste
// complète, voir _remplir en haut). Tout projet challengé hors de ces quatre-là disparaissait
// en silence, et l'accueil affirmait « Personne n'a encore demandé d'explication » : une
// phrase qu'il n'était pas en mesure de savoir vraie. D'où cette liste maigre (sept champs
// par projet), qui n'est PAS déclarée dans data-donnees et n'arrive que si l'agrégat renvoie
// au moins un projet dont la page n'a pas le titre. Une page où rien n'est challengé ne paie
// rien.
let _challengeBillsP = null, _challengeParId = new Map();
function chargerChallengeBills(){
  if(_challengeBillsP) return _challengeBillsP;
  _challengeBillsP = fetch('/data/site/challengeBills.json')
    .then(r => r.ok ? r.json() : null)
    // Un échec ne doit pas rester collé : on l'oublie pour que la prochaine tentative réessaie.
    .catch(() => null)
    .then(d => { if(!d) _challengeBillsP = null; return d; });
  return _challengeBillsP;
}
// Le projet derrière un bill_id : d'abord ce que la page a chargé (la page des projets a les
// 143 complets, avec parrain et note), sinon la liste maigre.
const projetChallenge = (billId) =>
  bills.find(b => b.id === Number(billId)) || _challengeParId.get(Number(billId)) || null;

// Charge le palmarès public : des TOTAUX par projet, jamais d'identités (la RLS de
// bc_bill_flags protège qui a demandé quoi). Séparée du rendu le 24 septembre 2026 — enfermée
// dans renderChallenged(), elle ne tournait que sur l'accueil, et la page des projets gardait
// donc un filtre « 🔥 Challengés » qui ne renvoyait jamais rien et des cartes sans badge.
async function chargerChallenges(){
  if(challengedCache !== null) return challengedCache;
  if(!ASSEMBLY.challenge) return (challengedCache = []);   // N.-B. : aucun compteur à charger
  try{
    const { data, error } = await supabaseClient.rpc('bc_flag_counts');
    challengedCache = (!error && Array.isArray(data)) ? data : [];
  }catch(e){ challengedCache = []; }
  if(challengedCache.some(c => !bills.some(b => b.id === Number(c.bill_id)))){
    const maigres = await chargerChallengeBills();
    if(maigres) _challengeParId = new Map(maigres.map(b => [Number(b.id), b]));
  }
  // Le cache vient d'arriver : re-rend les listes de projets pour que les badges
  // « 🔥 N demandes » apparaissent (billCard les lit) et que le filtre ait de quoi filtrer.
  renderBills();
  renderApercuBills();
  return challengedCache;
}

// Partage social d'un projet challengé — accès DIRECT en un clic (pas de
// copier-coller). Message : « X personnes contestent le projet de loi n° N —
// [titre]. Connectez-vous pour appuyer cette demande : [lien] ». X et « Copier »
// portent le texte complet ; Facebook n'affiche que l'aperçu du lien (règle FB,
// pas contournable) — le bouton reste direct quand même.
function shareChallenge(billId, count, platform, evt){
  if(evt) evt.stopPropagation();
  const isEn = currentLang === 'en';
  const b = projetChallenge(billId);
  const num = b ? b.num : '';
  const title = b ? (isEn ? (b.titleEn || b.title) : b.title) : '';
  const n = Number(count).toLocaleString(isEn ? 'en-CA' : 'fr-CA');
  const url = 'https://dossierbc.ca/' + paramLangue(true);
  const text = isEn
    ? `${n} people are challenging Bill no. ${num} — ${title}. Sign in to support this request:`
    : `${n} personnes contestent le projet de loi n° ${num} — ${title}. Connectez-vous pour appuyer cette demande :`;
  if(platform === 'x'){
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else if(platform === 'fb'){
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else if(platform === 'threads'){
    window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener,width=600,height=640');
  } else if(platform === 'bsky'){
    window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener,width=600,height=640');
  } else if(platform === 'reddit'){
    window.open('https://www.reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text), '_blank', 'noopener,width=760,height=640');
  } else if(platform === 'li'){
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=560');
  } else { // copier
    copierLien(text + ' ' + url, evt, isEn);
  }
}

// Copie dans le presse-papiers, avec accusé de réception SUR le bouton cliqué :
// son libellé devient ✓ pendant une seconde et demie.
//
// ⚠️ Ne pas revenir à une alert(). C'était le comportement d'origine : une
// fenêtre modale à fermer pour apprendre qu'un lien avait été copié — plus
// d'effort que l'action elle-même, et deux clics pour un.
function copierLien(texte, evt, isEn){
  // Capté MAINTENANT : evt.currentTarget devient null dès la fin de la
  // distribution de l'événement, donc inutilisable depuis un .then().
  const bouton = evt && evt.target && evt.target.closest ? evt.target.closest('button') : null;
  const confirmer = () => {
    if(!bouton || bouton.dataset.repos) return;
    bouton.dataset.repos = bouton.textContent;
    bouton.textContent = '✓';
    bouton.classList.add('copie');
    setTimeout(() => {
      bouton.textContent = bouton.dataset.repos;
      delete bouton.dataset.repos;
      bouton.classList.remove('copie');
    }, 1500);
  };
  (navigator.clipboard ? navigator.clipboard.writeText(texte) : Promise.reject())
    .then(confirmer)
    // Repli seulement en cas d'échec réel (presse-papiers refusé) : là une
    // fenêtre se justifie, c'est le seul moyen de laisser copier à la main.
    .catch(() => prompt(isEn ? 'Copy this:' : 'Copiez ceci :', texte));
}

// Partage d'un projet de loi (onglet Projets). Message neutre + lien profond
// /projets-de-loi?pl=NUM qui ouvre directement le projet à l'arrivée.
// Trois destinations : 𝕏, Facebook, copier.
// LE BOUTON CAFÉ sous « Partager » (Martin, 18 oct. 2026) : bleu poudre, vers le même lien de don
// que les volets de Québec et de Montréal. Sur tous les projets, ceux de la 43e
// compris (30 oct. 2026) : archivés, ils gardent leur bouton.
// Les libellés défilent un projet après l'autre, sans répétition (« je veux pas que le client voie
// Appuyez-nous, Appuyez-nous, Appuyez-nous à chaque PL ») : renderBills remet le compteur à zéro,
// chaque bouton affiché prend le libellé suivant.
const LIEN_CAFE = 'https://donate.stripe.com/6oU5kDg8b91a3sY8RK9fW00';
const LIBELLES_CAFE = [
  ['Soutenez-nous !', 'Support us!'],
  ['Aidez DQ à rester gratuit !', 'Help keep DQ free!'],
  ['Gardez DQ vivant !', 'Keep DQ alive!'],
  ['Vive DQ libre !', 'Long live a free DQ!'],
  ['Contribuez au site !', 'Contribute to the site!'],
  ['Vive l’information publique !', 'Long live public information!'],
  ['Donnez un coup de pouce !', 'Give us a hand!'],
  ['Soutenez la cause !', 'Support the cause!'],
  ['Un café pour l’équipe ?', 'A coffee for the team?'],
  ['Cappuccino ou espresso ?', 'Cappuccino or espresso?'],
  ['Appuyez-nous !', 'Back us!'],
  ['La démocratie, lisible !', 'Democracy, readable!'],
  ['Un petit geste !', 'A small gesture!'],
  ['Appuyez la cause !', 'Back the cause!'],
  ['Croyez au projet !', 'Believe in the project!'],
  ['Allongé ou serré ?', 'Long or short?'],
  ['Latté ou espresso ?', 'Latte or espresso?'],
  ['Un double, peut-être ?', 'A double, maybe?'],
];
// Mélangés une fois par chargement de page (Martin : « un shuffle à chaque fois ») : l'ordre change
// d'une visite à l'autre, mais reste le même quand la liste se redessine, et jamais deux pareils de suite.
const ORDRE_CAFE = LIBELLES_CAFE.map((_, i) => i);
for(let i = ORDRE_CAFE.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [ORDRE_CAFE[i], ORDRE_CAFE[j]] = [ORDRE_CAFE[j], ORDRE_CAFE[i]]; }
const ICONES_CAFE = ['cafe-croissant', 'cafe-carafe', 'cafe-moulin', 'cafe-filtre', 'cafe-coeur',
  'cafe-machine4', 'cafe-terrasse', 'cafe-tasse-or', 'cafe-latte', 'cafe-the', 'cafe-pastille'].map((n) => `/commun/${n}.png`);
// Chaque case ouvre sur une icône différente de ses voisines (Martin, 3 nov. 2026), comme les textes.
const ORDRE_ICONES = ICONES_CAFE.map((_, i) => i);
for(let i = ORDRE_ICONES.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [ORDRE_ICONES[i], ORDRE_ICONES[j]] = [ORDRE_ICONES[j], ORDRE_ICONES[i]]; }
let _rangCafe = 0;
// Sous le bouton café des projets de loi (Martin, 4 nov. 2026) : une boîte pour suivre en se
// connectant sur place (champ courriel, lien qui ramène sur cette page ; cachée une fois connecté,
// body.connecte), puis un simple bouton « Devenez DossierQuébec » vers l'abonnement. Rien pour les
// abonné·e·s (body.abonne).
function boiteAbonnement(isEn){
  return `<form class="bill-abo bill-abo-suivre" onclick="event.stopPropagation()" onsubmit="event.preventDefault(); billEnvoyerLien(this)">
    <b class="bill-abo-titre">${isEn ? 'Follow this bill: sign in' : 'Suivez ce projet en vous identifiant'}</b>
    <div class="bill-abo-ligne"><input type="email" required autocomplete="email" placeholder="${isEn ? 'Your email' : 'Votre courriel'}" aria-label="${isEn ? 'Your email' : 'Votre courriel'}">
    <button type="submit" class="bill-abo-btn">${isEn ? 'Get the link' : 'Recevoir le lien'}</button></div>
    <p class="bill-abo-note" aria-live="polite">${isEn ? 'Free. No password: a link arrives by email.' : 'Gratuit. Pas de mot de passe : un lien arrive par courriel.'}</p></form>
  ` + (ASSEMBLY.abonnement === false ? '' : `<a class="bill-more bill-abo-devenir" href="/abonnement${isEn ? '?lang=en' : ''}" onclick="event.stopPropagation()">${isEn ? 'Become DossierBC' : 'Devenez DossierBC'} →</a>`);   // N.-B. : nom du site
}
async function billEnvoyerLien(form){
  const isEn = currentLang === 'en';
  const input = form.querySelector('input'), btn = form.querySelector('button'), note = form.querySelector('.bill-abo-note');
  const email = input.value.trim();
  if(!email || !input.checkValidity() || btn.disabled){ input.focus(); return; }
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi en cours…';
  const error = await signInWithMagicLink(email);
  if(error){
    btn.disabled = false;
    note.textContent = error.code === 'over_email_send_rate_limit'
      ? (isEn ? 'A link was already sent recently: check your inbox.' : 'Un lien a déjà été envoyé récemment : vérifiez vos courriels.')
      : (isEn ? 'Something went wrong. Try again.' : 'Une erreur est survenue. Réessayez.');
    return;
  }
  btn.textContent = isEn ? '✓ Link sent' : '✓ Lien envoyé';
  note.textContent = isEn ? `Check your inbox (${email}). The link brings you back here.` : `Vérifiez vos courriels (${email}). Le lien vous ramène ici.`;
}
window.billEnvoyerLien = billEnvoyerLien;
function boutonCafe(b, isEn){
  if(ASSEMBLY.cafe === false) return '';   // N.-B. : pastilles éteintes
  const rangIcone = ORDRE_ICONES[_rangCafe % ORDRE_ICONES.length];
  const [fr, en] = LIBELLES_CAFE[ORDRE_CAFE[_rangCafe++ % ORDRE_CAFE.length]];
  return `<div class="bill-cafe-row"><a class="bill-cafe-btn" href="${LIEN_CAFE}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="${isEn ? 'Buy us a coffee (opens in a new tab)' : 'Offrez-nous un café (s’ouvre dans un nouvel onglet)'}"><img class="icone" src="${ICONES_CAFE[rangIcone]}" data-rang="${rangIcone}" width="24" height="24" alt="">${isEn ? en : fr}<span class="bulle" aria-hidden="true">${'<i class="pt" style="animation:none"></i>'.repeat(5)}</span></a></div>`;
}

// La bulle du bouton café (Martin, 3 nov. 2026) : toutes les 8 s, à un moment propre à chaque bouton,
// une file de 1 à 3 cafés tirés au hasard traverse la bulle ; les points jaunes mangés virent au brun,
// puis redeviennent jaunes. Une seule horloge pour toute la page ; rien si l'appareil coupe les animations.
const DUREE_CAFE = 8;
const CAFE_tasse = `<svg width="18" height="18" viewBox="0 0 18 18"><g class="couvercle"><rect x="1" y="3" width="12" height="3" fill="#131313"/></g><path d="M2 7h10v7a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="#fff" stroke="#131313" stroke-width="1.6"/><path d="M12 9h2a2 2 0 0 1 0 4h-2" fill="none" stroke="#131313" stroke-width="1.6"/></svg>`;
const CAFE_emporter = `<svg width="14" height="18" viewBox="0 0 14 18"><rect x="1" y="1" width="12" height="3" rx="1" fill="#6B4A3A" stroke="#3A2A22" stroke-width="1"/><path d="M2 4h10l-1.3 13H3.3z" fill="#F6D7A7" stroke="#3A2A22" stroke-width="1"/><path d="M2.5 7.5h9l-.5 5h-8z" fill="#C88A55"/><ellipse cx="7" cy="10" rx="1.4" ry="2" fill="#5A3A2A"/></svg>`;
const CAFE_brune = `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 4c-1-1.5 1-2 0-3.5M8 4c-1-1.5 1-2 0-3.5" fill="none" stroke="#9A9A9A" stroke-width="1.1"/><path d="M2 6h10v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="#8A5A3B" stroke="#3A2A22" stroke-width="1"/><path d="M12 8h1.5a2 2 0 0 1 0 4H12" fill="none" stroke="#8A5A3B" stroke-width="1.8"/><ellipse cx="7" cy="6.3" rx="4.4" ry=".8" fill="#fff"/></svg>`;
const CAFE_glace = `<svg width="14" height="19" viewBox="0 0 14 19"><path d="M8 6l2-5h2" fill="none" stroke="#555" stroke-width="1.4"/><path d="M2 7a5 4 0 0 1 10 0z" fill="#E4E4E4" stroke="#131313" stroke-width="1"/><rect x="1" y="7" width="12" height="2" fill="#D0D0D0" stroke="#131313" stroke-width="1"/><path d="M2 9h10l-1 9H3z" fill="#fff" stroke="#131313" stroke-width="1"/><path d="M2.4 12h9.2l-.7 6H3.1z" fill="#C9A27E"/><rect x="4" y="13" width="2" height="2" fill="#fff" stroke="#131313" stroke-width=".6"/><rect x="7.5" y="14.5" width="2" height="2" fill="#fff" stroke="#131313" stroke-width=".6"/></svg>`;
const CAFES_BULLE = [CAFE_tasse, CAFE_emporter, CAFE_brune, CAFE_glace];
// L'icône de gauche flippe toutes les 8 s, comme la feuille d'érable (Martin, 3 nov. 2026), 4 s après
// le passage des cafés dans la bulle, jamais en même temps :
// croissant et tasse d'abord, puis carafe, moulin, filtre, tasse au cœur, et on recommence.
// Préchargées : sans ça, la première fois, l'icône clignotait le temps que l'image arrive.
if(ASSEMBLY.cafe !== false) ICONES_CAFE.forEach((u) => { const p = new Image(); p.src = u; });   // N.-B. : rien à précharger sans pastilles
function flipIcone(bouton){
  const i = bouton.querySelector('.icone');
  if(!i) return;
  // Au hasard, jamais la même deux fois de suite (le croissant reste la première).
  const avant = Number(i.dataset.rang || 0);
  const rang = (avant + 1 + Math.floor(Math.random() * (ICONES_CAFE.length - 1))) % ICONES_CAFE.length;
  i.dataset.rang = rang;
  i.classList.add('tourne');
  setTimeout(() => { i.src = ICONES_CAFE[rang]; i.classList.remove('tourne'); }, 300);
}
function passageCafe(bulle){
  const file = CAFES_BULLE.slice().sort(() => Math.random() - .5).slice(0, 1 + Math.floor(Math.random() * 3));
  bulle.innerHTML = '<i class="pt"></i>'.repeat(5)
    + file.map((ic, i) => `<span class="passant" style="--suite:${i}">${ic}</span>`).reverse().join('');
}
setInterval(() => {
  if(document.hidden || document.body.classList.contains('abonne') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const maintenant = Date.now();
  document.querySelectorAll('.bill-cafe-btn .bulle').forEach((bulle) => {
    if(!bulle.dataset.prochain) bulle.dataset.prochain = maintenant + Math.random() * DUREE_CAFE * 1000;
    else if(maintenant >= Number(bulle.dataset.prochain)){
      bulle.dataset.prochain = maintenant + DUREE_CAFE * 1000;
      passageCafe(bulle);
      setTimeout(() => flipIcone(bulle.closest('.bill-cafe-btn')), DUREE_CAFE * 500);
    }
  });
}, 400);

function shareBill(billId, platform, evt){
  if(evt) evt.stopPropagation();
  const isEn = currentLang === 'en';
  const b = bills.find(x => x.id === Number(billId));
  if(!b) return;
  const title = isEn ? (b.titleEn || b.title) : b.title;
  // L'adresse de la page du projet (scripts/build-bill-pages.js) : c'est elle que Google indexe.
  const url = (b.legislature && b.introSession ? `https://dossierbc.ca/projets-de-loi/${b.num}-${b.legislature}-${b.introSession}` : `https://dossierbc.ca/projets-de-loi?pl=${encodeURIComponent(b.num)}`) + paramLangue(false);
  const text = isEn
    ? `Bill no. ${b.num} — ${title}`
    : `Projet de loi n° ${b.num} — ${title}`;
  if(platform === 'x'){
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else if(platform === 'fb'){
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url), '_blank', 'noopener,width=600,height=520');
  } else { // copier
    copierLien(text + ' ' + url, evt, isEn);
  }
}

// Lien profond : /projets-de-loi?pl=NUM → ouvre directement ce projet.
function openBillFromQuery(){
  const params = new URLSearchParams(location.search);
  // Page d'un projet : /projets-de-loi/NUM-LÉGISLATURE-SESSION (scripts/build-bill-pages.js).
  const page = location.pathname.match(/^\/projets-de-loi\/(\d+)-(\d+)-(\d+)\/?(?:\.html)?$/);
  const pl = page ? page[1] : params.get('pl');
  if(!pl) return;
  // Le numéro n'est pas unique (PL 1, PL 2… reviennent à chaque session) : quand le lien porte
  // aussi l'id (courriels d'alerte, Mes dossiers), c'est lui qui choisit.
  const id = params.get('id');
  const b = (page && bills.find(x => String(x.num) === page[1] && String(x.legislature) === page[2] && String(x.introSession) === page[3]))
    || (id && bills.find(x => String(x.id) === id)) || bills.find(x => String(x.num) === String(pl));
  if(!b) return;
  // S'assurer qu'on est bien sur l'onglet Projets (au cas où le lien arrive
  // ailleurs, ex. /?pl=NUM) — sans toucher à l'URL (fromHistory).
  if(viewFromPath() !== 'projets'){ goToTab('projets', { fromHistory: true, noScroll: true }); }
  // Le projet doit passer le filtre courant : on force « tous » + recherche vide.
  billsQuickFilter = 'tous';
  billsExtras.clear();
  // ⚠️ ET il doit être DANS LA FENÊTRE affichée. Depuis que la liste se limite à
  // 10 projets, un lien partagé vers un projet plus bas ne trouvait plus sa carte
  // dans le DOM : le lien semblait simplement ne rien faire. On ouvre donc assez
  // de pages pour l'inclure. (Le tri est le même que dans renderBills.)
  const ordonnes = [...bills].sort((x, y) => {
    const dx = x.lastActivity || '', dy = y.lastActivity || '';
    if(!dx && !dy) return 0;
    if(!dx) return 1;
    if(!dy) return -1;
    return billsSortDir === 'desc' ? dy.localeCompare(dx) : dx.localeCompare(dy);
  });
  const rang = ordonnes.findIndex(x => x.id === b.id);
  if(rang >= 0) billsShown = Math.max(billsShown, Math.ceil((rang + 1) / BILLS_STEP) * BILLS_STEP);
  const sb = document.getElementById('searchBills'); if(sb) sb.value = '';
  renderBills();
  const domId = 'bill-summary-full-' + b.id;
  const summary = document.getElementById(domId);
  if(summary){
    if(!summary.classList.contains('open')) toggleBillSummary(domId);
    const card = summary.closest('.bill');
    if(card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

async function renderChallenged(){
  const el = document.getElementById('challengedList');
  // Le palmarès se charge MÊME quand la section n'est pas sur cette page : la page des
  // projets en a besoin pour son filtre « 🔥 Challengés » et pour les badges de ses cartes.
  // Les pages qui n'affichent ni l'un ni l'autre (votes, ministres…) n'appellent rien.
  if(el || document.getElementById('billsList')) await chargerChallenges();
  if(!el) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  const fmt = n => n.toLocaleString(isEn ? 'en-CA' : 'fr-CA');
  const titleEl = document.getElementById('challengedTitle');
  const subEl = document.getElementById('challengedSub');
  // Le cahier de la C.-B. met l'appel à l'action en titre — mais seulement quand l'action est
  // possible. Législature terminée, plus un seul projet ne peut être signalé : le titre devient
  // alors une trace, pas une invitation.
  const finie = legislatureFinie();
  if(titleEl) titleEl.textContent = finie
    ? (isEn ? 'Bills citizens had challenged' : 'Projets que les citoyen·ne·s avaient challengés')
    : (isEn ? 'Challenge a bill' : 'Signaler un projet');
  // Pendant la dissolution, on ne promet plus de pétition : ces projets sont morts
  // au feuilleton, on présente donc la section comme une trace de la législature.
  if(subEl) subEl.textContent = finie
    ? (isEn
        ? 'Flagged before the legislature ended — these bills died with it and would have to start over'
        : 'Signalés avant la fin de la législature — ces projets sont morts avec elle et devraient repartir de zéro')
    : (isEn
        ? `The moment one person asks for an explanation, the bill appears here — pile on in one click; at ${fmt(PETITION_THRESHOLD)}, we push for a petition`
        : `Dès qu'une personne demande une explication, le projet apparaît ici — appuyez en un clic ; à ${fmt(PETITION_THRESHOLD)}, on pousse pour une pétition`);

  const challenged = (challengedCache || [])
    .map(c => ({ cnt: Number(c.cnt), bill: projetChallenge(c.bill_id) }))
    .filter(c => c.bill && c.cnt >= CHALLENGE_DISPLAY_MIN)
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, CHALLENGE_DISPLAY_MAX);

  // Le compteur du surtitre (« Flagged by citizens · 7 ») et le pager du cahier.
  const totalEl = document.getElementById('challengedTotal');
  if(totalEl) totalEl.textContent = fmt(challenged.length);
  majPagerChallenged(challenged.length, isEn);

  if(challenged.length){
    // Cartes compactes en GRILLE 3 colonnes, fidèles à la maquette
    // (Apercu.dc.html) : nº bleu 900 + badge noir/jaune 🔥 N, titre 700,
    // étape en bas séparée d'une bordure — plus le bouton « Demander »
    // (3 états, projets actifs seulement) et le partage direct.
    el.classList.add('ch-grid');
    // Si la donnée a changé et que la page courante n'existe plus, on recale.
    challengedPage = Math.min(challengedPage, Math.ceil(challenged.length / 3) - 1);
    const pageStart = challengedPage * 3;
    el.innerHTML = challenged.map((c, idx) => {
      const b = c.bill;
      const cnt = c.cnt;
      const title = isEn ? (b.titleEn || b.title) : b.title;
      const numLabel = isEn ? `Bill ${b.numAffiche ?? b.num}` : `PL nº ${b.numAffiche ?? b.num}`;
      const flames = '🔥'.repeat(Math.max(1, CHALLENGE_TIERS.filter(t => cnt >= t).length));
      const stepLabels = isEn ? stepsEn : steps;
      const stageIdx = Math.max(0, Math.min(stepLabels.length - 1, displayStep(b.step) - 1));
      const stageLabel = b.status === 'encours' && loiVivante(b) ? stepLabels[stageIdx] : statusLabel(b.status, b.step);
      const petition = cnt >= PETITION_THRESHOLD
        ? `<div class="ch-petition">⚑ ${isEn ? 'Petition threshold reached' : 'Seuil de pétition atteint'}</div>` : '';
      const canFlag = peutEtreChallenge(b);
      const isFlagged = !!myFlaggedBills[b.id];
      const flagBtnId = 'demand-ch-' + b.id;
      let demandBtn = '';
      if(canFlag){
        if(!currentUser){
          demandBtn = `<button class="ch-demand" onclick="event.stopPropagation(); goToAccount()">🔒 ${isEn ? 'Sign in to challenge' : 'Se connecter pour challenger'}</button>`;
        } else if(isFlagged){
          demandBtn = `<button class="ch-demand on" id="${flagBtnId}" title="${isEn ? 'Click to remove your challenge' : 'Cliquer pour retirer votre challenge'}" onclick="event.stopPropagation(); toggleChallenge(${b.id}, '${flagBtnId}')">✓ ${isEn ? 'Challenged — remove' : 'Challengé — retirer'}</button>`;
        } else {
          demandBtn = `<button class="ch-demand" id="${flagBtnId}" onclick="event.stopPropagation(); toggleChallenge(${b.id}, '${flagBtnId}')">✋ ${isEn ? 'Ask for an explanation' : 'Demander une explication'}</button>`;
        }
      }
      return `<div class="ch-card${(idx < pageStart || idx >= pageStart + 3) ? ' ch-hidden' : ''}" onclick="goToTab('projets')">
        <div class="ch-top">
          <span class="ch-num">${numLabel}</span>
          <span class="ch-badge">${flames} ${fmt(cnt)}</span>
        </div>
        <div class="ch-title">${title}</div>
        ${petition}
        <div class="ch-stage">${stageLabel}</div>
        ${demandBtn}
        <div class="ch-share">
          <span>${isEn ? 'Share:' : 'Partager :'}</span>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'x', event)" aria-label="Partager sur X">𝕏</button>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'fb', event)" aria-label="Partager sur Facebook">FB</button>
          <button onclick="event.stopPropagation(); shareChallenge(${b.id}, ${cnt}, 'copy', event)" aria-label="Copier">⧉</button>
        </div>
      </div>`;
    }).join('');
  } else {
    el.classList.remove('ch-grid');
    el.innerHTML = `<div style="background:var(--card); border:1px dashed var(--line); border-radius:var(--radius); padding:22px 18px; text-align:center; color:var(--slate);">
      <div style="font-size:26px; margin-bottom:8px;">🔎</div>
      <div style="font-size:14px; line-height:1.65; max-width:580px; margin:0 auto;">${isEn
        ? `No one has asked for an explanation yet. The moment someone does, the bill shows up here — ask for an explanation on any active bill to get the ball rolling.`
        : `Personne n'a encore demandé d'explication. Dès qu'une personne le fait, le projet apparaît ici — demandez une explication sur n'importe quel projet actif pour lancer le bal.`}</div>
      <button class="sort-toggle" style="margin-top:14px; cursor:pointer;" onclick="goToTab('projets')">${isEn ? 'Go to bills →' : 'Aller aux projets de loi →'}</button>
    </div>`;
  }
}

// Le pager du cahier de la C.-B. : REMPLACE les 3 cellules visibles par les 3 suivantes
// (slide-in décalé de 80 ms par cellule), dans un sens ou dans l'autre, et reboucle aux deux
// bouts. dir vaut -1 ou +1.
function pagerChallenged(dir){
  const cards = Array.from(document.querySelectorAll('#challengedList .ch-card'));
  if(cards.length <= 3) return;
  const pages = Math.ceil(cards.length / 3);
  challengedPage = (challengedPage + dir + pages) % pages;
  const start = challengedPage * 3;
  cards.forEach((card, i) => {
    const show = i >= start && i < start + 3;
    card.classList.remove('ch-reveal');
    card.classList.toggle('ch-hidden', !show);
    if(show){
      void card.offsetWidth; // force le redémarrage de l'animation
      card.classList.add('ch-reveal');
      card.style.animationDelay = ((i - start) * 0.08) + 's';
    }
  });
  majPagerChallenged(cards.length, currentLang === 'en');
}

// Le reste de la famille appelle encore « voir plus » : c'est la page suivante.
function showMoreChallenged(){ pagerChallenged(1); }

// Écrit la plage affichée (« 1–3 of 7 »), nomme les deux boutons pour les lecteurs d'écran, et
// cache le pager quand tout tient sur une page.
function majPagerChallenged(total, isEn){
  const pager = document.getElementById('challengedPager');
  if(!pager) return;
  pager.hidden = total <= 3;
  const prec = document.getElementById('challengedPrev');
  const suiv = document.getElementById('challengedNext');
  if(prec) prec.setAttribute('aria-label', isEn ? 'Previous bills' : 'Projets précédents');
  if(suiv) suiv.setAttribute('aria-label', isEn ? 'Next bills' : 'Projets suivants');
  const rang = document.getElementById('challengedRange');
  if(!rang) return;
  const pages = Math.max(1, Math.ceil(total / 3));
  const page = Math.min(challengedPage, pages - 1);
  const debut = page * 3 + 1;
  const fin = Math.min(total, page * 3 + 3);
  rang.textContent = total ? (isEn ? `${debut}–${fin} of ${total}` : `${debut}–${fin} sur ${total}`) : '';
}

// (deputeById et voteById sont construits dans chargerDonnees.)


// Proxy de présence : l'Assemblée ne publie pas d'assiduité en tant que telle
// (voir onglet « D'où viennent ces données »). Le meilleur indicateur public est
// le taux de participation aux votes nominaux enregistrés — même méthode que les
// médias (ex. Radio-Canada). Calculé depuis le premier vote où la personne
// apparaît (approximation honnête du début de son mandat actuel, sans donnée
// externe inventée), jusqu'au dernier vote scrapé.
// L'index « qui a participé à quels votes » se reconstruisait ici à chaque chargement de page,
// en parcourant le détail nominatif des 735 votes. Il est maintenant calculé au build et livré
// sous forme de taux déjà faits, dans `presences` (voir scrapers/build-votes-data.js).
// La présidence et les 3 vice-présidences de l'Assemblée ne votent généralement
// pas quand elles président une séance, pour préserver leur neutralité — un vrai
// taux de présence très bas ou nul pour ces 4 personnes ne veut donc pas dire
// « absent·e », contrairement à tout le monde d'autre. Sources : élection de la
// présidence du 29 novembre 2022 (quebec.ca) et fiches assnat.qc.ca de chacun·e.
// N.-B. : rempli au chargement des député·e·s (rôle « speaker » de data/deputes.json).
const presidingRoles = {};
function presidingRoleNote(name, isEn){
  const bareName = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
  const role = presidingRoles[norm(bareName)];
  return role ? (isEn ? role.en : role.fr) : null;
}

// La légende de la présence (gabarit.html, #legendePresence), sous la composition de l'Assemblée :
// une échelle 0-100 % avec l'étendue réelle et la médiane, calculées ici à partir de `presences`.
// La présidence et les vice-présidences sont laissées de côté (elles ne votent pas en présidant).
// Pas de couleur de jugement : des faits, pour situer un chiffre, rien de plus.
// Les taux de l'Assemblée, présidence exclue, et leur médiane : calculés une fois, partagés par la
// légende et par la couleur de chaque élu (vert à la médiane ou au-dessus, jaune en dessous —
// Martin, 22 sept. 2026). Le seuil suit donc les données, sans chiffre fixé à la main.
let _tauxPresence = null;
function tauxPresence(){
  if(_tauxPresence) return _tauxPresence;
  const taux = (typeof deputesRaw !== 'undefined' ? deputesRaw : [])
    .filter(d => !presidingRoleNote(d[0], false))
    .map(d => attendanceForAssnatId(d[4])?.rate)
    .filter(r => typeof r === 'number')
    .sort((a, b) => a - b);
  if(!taux.length) return null;   // données pas encore là : on ne garde rien en mémoire
  const medianeDe = (a) => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  const mediane = medianeDe(taux);
  // Le second seuil : la médiane de ceux qui sont sous la médiane de l'Assemblée (Martin : « médiane
  // jaune et plus » en jaune, « médiane jaune et moins » sans couleur).
  const sous = taux.filter(r => r < mediane);
  const medianeJaune = sous.length ? medianeDe(sous) : mediane;
  return (_tauxPresence = { taux, min: taux[0], max: taux[taux.length - 1], mediane, medianeJaune });
}
// Trois groupes, tous calculés à partir des données (Martin, 22 sept. 2026) :
//   vert          à la médiane de l'Assemblée ou au-dessus ;
//   jaune         sous elle, mais à la médiane de ce groupe-là ou au-dessus ;
//   sans couleur  sous la médiane du jaune — une pastille neutre, pas de rouge : un vote manqué
//                 n'en dit pas la raison.
// Sans médiane connue, le chiffre seul.
function groupePresence(rate){
  const t = tauxPresence();
  if(!t || typeof rate !== 'number') return null;
  return rate >= t.mediane ? 'haute' : rate >= t.medianeJaune ? 'moyenne' : 'neutre';
}
function pastillePresence(rate, isEn){
  const texte = isEn ? `${rate}%` : `${rate} %`;
  const groupe = groupePresence(rate);
  if(!groupe) return texte;
  const t = tauxPresence();
  const titre = {
    haute: isEn ? `At or above the Assembly's median (${t.mediane}%)` : `À la médiane de l'Assemblée (${t.mediane} %) ou au-dessus`,
    moyenne: isEn ? `Below the Assembly's median (${t.mediane}%), at or above ${t.medianeJaune}%` : `Sous la médiane de l'Assemblée (${t.mediane} %), à ${t.medianeJaune} % ou plus`,
    neutre: isEn ? `Below ${t.medianeJaune}%` : `Sous ${t.medianeJaune} %`,
  }[groupe];
  return `<span class="presence-pastille presence-${groupe}" title="${titre}">${texte}</span>`;
}

function renderLegendePresence(){
  const boite = document.getElementById('lpEchelle');
  if(!boite) return;
  const isEn = currentLang === 'en';
  const t = tauxPresence();
  if(!t){ boite.innerHTML = ''; return; }
  const { taux, min, max, mediane, medianeJaune } = t;
  const pct = (n) => isEn ? `${n}%` : `${n} %`;
  // Combien d'élu·e·s dans chaque groupe (même règle que les pastilles : groupePresence).
  const nbVert = taux.filter(r => groupePresence(r) === 'haute').length;
  const nbJaune = taux.filter(r => groupePresence(r) === 'moyenne').length;
  const nbNeutre = taux.length - nbVert - nbJaune;
  // L'étiquette de la médiane, au-dessus de la barre, ancrée du côté où il y a de la place
  // (à 86 %, centrée, elle débordait à droite sur téléphone).
  const ancre = mediane > 60 ? 'droite' : mediane < 40 ? 'gauche' : 'centre';
  // Quand la médiane vaut 100 %, le vert va de 100 à 100 : un segment de largeur nulle, et la
  // barre n'en montre aucun alors que la moitié de l'Assemblée est verte. On ne triche pas avec
  // l'échelle — on marque le bout de la barre et on le dit en toutes lettres (C.-B., 9 nov. 2026).
  const auBout = mediane >= 100;
  boite.innerHTML = `
    <div class="lp-repere-ligne" aria-hidden="true"><span class="lp-repere lp-ancre-${ancre}" style="left:${mediane}%">${isEn ? 'median' : 'médiane'} ${pct(mediane)}</span></div>
    <div class="lp-barre${auBout ? ' lp-barre-au-bout' : ''}" aria-hidden="true" style="--mediane:${mediane}%; --mediane-jaune:${medianeJaune}%">
      <span class="lp-mediane" style="left:${mediane}%"></span>
      <span class="lp-mediane lp-mediane-jaune" style="left:${medianeJaune}%"></span>
    </div>
    <div class="lp-bornes" aria-hidden="true"><span>${pct(0)}</span><span>${pct(100)}</span></div>
    <ul class="lp-groupes">
      <li><span class="presence-pastille presence-haute">${isEn ? 'Green' : 'Vert'} (${nbVert})</span> ${auBout
        ? (isEn ? `exactly ${pct(100)} — the Assembly's median, and the end of the bar` : `${pct(100)} pile — la médiane de l'Assemblée, et le bout de la barre`)
        : (isEn ? `${pct(mediane)} or more — the Assembly's median` : `${pct(mediane)} et plus — la médiane de l'Assemblée`)}</li>
      <li><span class="presence-pastille presence-moyenne">${isEn ? 'Yellow' : 'Jaune'} (${nbJaune})</span> ${isEn ? `${pct(medianeJaune)} to ${pct(mediane - 1)} — ${pct(medianeJaune)} is the median of those below ${pct(mediane)}` : `de ${pct(medianeJaune)} à ${pct(mediane - 1)} — ${pct(medianeJaune)} est la médiane des élu·e·s sous ${pct(mediane)}`}</li>
      <li><span class="presence-pastille presence-neutre">${isEn ? 'No colour' : 'Sans couleur'} (${nbNeutre})</span> ${isEn ? `below ${pct(medianeJaune)}` : `moins de ${pct(medianeJaune)}`}</li>
    </ul>
    <p class="lp-legende-chiffres">${isEn
      ? `Across the ${taux.length} members counted: from ${pct(min)} to ${pct(max)}; half are at ${pct(mediane)} or more.**`
      : `Chez les ${taux.length} élu·e·s comptés : de ${pct(min)} à ${pct(max)} ; la moitié est à ${pct(mediane)} ou plus.**`}</p>`;
}

// Taux des législatures terminées (« 43e : 87 % »), gardés dans data/presences-par-legislature.json.
function presencesPasseesTexte(assnatId, isEn){
  const presencesPassees = historiqueLeg.presences || {};
  if(assnatId == null) return '';
  const lignes = Object.keys(presencesPassees).sort((a, b) => b - a)
    .filter((l) => presencesPassees[l][assnatId] != null)
    .map((l) => `${l}${isEn ? (l.endsWith('1') && l !== '11' ? 'st' : l.endsWith('2') && l !== '12' ? 'nd' : l.endsWith('3') && l !== '13' ? 'rd' : 'th') : 'e'}${isEn ? ': ' : ' : '}${presencesPassees[l][assnatId]}${isEn ? '%' : ' %'}`);
  return lignes.length ? `<span class="presence-passee" title="${isEn ? 'Recorded-vote attendance in earlier legislatures' : 'Présence aux votes nominaux des législatures précédentes'}"> · ${lignes.join(' · ')}</span>` : '';
}
// Une pastille par législature sur les cartes (Martin, 30 oct. 2026, option C) : présence aux votes et
// projets de loi parrainés. Deux pastilles visibles ; au-delà, des flèches font circuler de l'une à l'autre.
const ordinalLeg = (n, isEn) => isEn ? n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th') : n + 'e';
function pastillesLegislatures(name, dep, att, presidingShort, isEn){
  const cour = historiqueLeg.courante || 43;
  const presencesPassees = historiqueLeg.presences || {}, plPasses = historiqueLeg.pl || {};
  const siens = billsSponsoredBy(name);
  const plTxt = (pl, lois, leg) => lienParrain(name, leg, cour, `${pl} ${isEn ? (pl === 1 ? 'bill sponsored' : 'bills sponsored') : (pl > 1 ? 'PL parrainés' : 'PL parrainé')}${lois ? ` · ${lois} ${isEn ? (lois > 1 ? 'laws' : 'law') : (lois > 1 ? 'lois' : 'loi')}` : ''}`, pl, isEn);
  const blocs = [{ leg: cour, pres: presidingShort || (att ? pastillePresence(att.rate, isEn) : (isEn ? 'n/a' : 'n/d')), pl: plTxt(siens.length, siens.filter((b) => b.status === 'sanctionne').length, cour) }];
  const nom = norm(name.replace(/\s*\([^)]*\)\s*/g, ''));
  const legs = new Set([...Object.keys(presencesPassees), ...Object.keys(plPasses)]);
  for (const l of [...legs].map(Number).filter((l) => l !== cour).sort((a, b) => b - a)) {
    const taux = dep ? presencesPassees[l]?.[dep.assnatId] : null;
    const pl = plPasses[l]?.[nom];
    if (taux == null && !pl) continue;   // pas élu·e dans cette législature
    blocs.push({ leg: l, pres: taux != null ? `${taux}${isEn ? '%' : ' %'}` : (isEn ? 'n/a' : 'n/d'), pl: plTxt(pl ? pl[0] : 0, pl ? pl[1] : 0, l), passe: true });
  }
  const fleches = blocs.length > 2;
  return `<div class="leg-ruban" data-debut="0">${fleches ? `<button class="leg-fleche" type="button" aria-label="${isEn ? 'More recent' : 'Plus récente'}" onclick="event.stopPropagation(); defilerLeg(this, -1)">‹</button>` : ''}${blocs.map((b, i) => `<div class="leg-bloc${b.passe ? ' leg-passe' : ''}${i > 1 ? ' leg-cache' : ''}"><div class="leg-num">${ordinalLeg(b.leg, isEn)} ${isEn ? 'Legislature' : 'législature'}</div><div class="leg-pres">${isEn ? 'attendance' : 'présence'} ${b.pres}</div><div>${b.pl}</div></div>`).join('')}${fleches ? `<button class="leg-fleche" type="button" aria-label="${isEn ? 'Earlier' : 'Plus ancienne'}" onclick="event.stopPropagation(); defilerLeg(this, 1)">›</button>` : ''}</div>`;
}
// La même chose sur une ligne pour la liste des député·e·s (Martin, 30 oct. 2026) :
// « 44e · 92 % · 2 PL | 43e · 87 % · 5 PL ». La législature en cours d'abord, les autres en gris.
function ligneLegislatures(name, dep, att, isEn){
  const cour = historiqueLeg.courante || 43;
  const presencesPassees = historiqueLeg.presences || {}, plPasses = historiqueLeg.pl || {};
  const nom = norm(name.replace(/\s*\([^)]*\)\s*/g, ''));
  const morceaux = [`<span class="leg-seg leg-ligne-cour leg-premier">${ordinalLeg(cour, isEn)} · ${att ? pastillePresence(att.rate, isEn) : (isEn ? 'n/a' : 'n/d')} · ${lienParrain(name, cour, cour, `${billsSponsoredBy(name).length} PL`, billsSponsoredBy(name).length, isEn)}</span>`];
  const legs = new Set([...Object.keys(presencesPassees), ...Object.keys(plPasses)]);
  for (const l of [...legs].map(Number).filter((l) => l !== cour).sort((a, b) => b - a)) {
    const taux = dep ? presencesPassees[l]?.[dep.assnatId] : null;
    const pl = plPasses[l]?.[nom];
    if (taux == null && !pl) continue;
    morceaux.push(`<span class="leg-seg leg-ligne-passe${morceaux.length > 1 ? ' leg-cache' : ''}"><span class="leg-ligne-sep"> | </span>${ordinalLeg(l, isEn)} · ${taux != null ? `${taux}${isEn ? '%' : ' %'}` : (isEn ? 'n/a' : 'n/d')} · ${lienParrain(name, l, cour, `${pl ? pl[0] : 0} PL`, pl ? pl[0] : 0, isEn)}</span>`);
  }
  // Plus de deux législatures : une petite flèche fait circuler les plus anciennes (Martin, 30 oct. 2026).
  const fleche = morceaux.length > 2 ? ` <button class="leg-fleche leg-fleche-ligne" type="button" aria-label="${isEn ? 'Other legislatures' : 'Autres législatures'}" onclick="event.stopPropagation(); defilerLeg(this, 1, true)">›</button>` : '';
  return `<span class="leg-ruban leg-ruban-ligne" data-debut="0">${morceaux.join('')}${fleche}</span>`;
}
// « 5 PL parrainés » mène à la liste de ces projets, archives comprises (Martin, 30 oct. 2026) :
// /projets-de-loi?parrain=Nom, ou ?archives=43&parrain=Nom pour une législature terminée.
function lienParrain(name, leg, cour, texte, nombre, isEn){
  if(!nombre) return texte;
  const q = new URLSearchParams();
  if(leg !== cour) q.set('archives', leg);
  q.set('parrain', name.replace(/\s*\([^)]*\)\s*/g, ''));
  if(isEn) q.set('lang', 'en');
  return `<a class="leg-lien" href="/projets-de-loi?${q}" onclick="event.stopPropagation()">${texte}</a>`;
}
function defilerLeg(bouton, sens, enBoucle){
  const ruban = bouton.closest('.leg-ruban');
  const blocs = [...ruban.querySelectorAll('.leg-bloc, .leg-seg')];
  let debut = Number(ruban.dataset.debut) + sens;
  // Sur la ligne de la liste, une seule flèche : arrivée au bout, elle revient à la législature en cours.
  if(enBoucle && debut > blocs.length - 2) debut = 0;
  debut = Math.max(0, Math.min(blocs.length - 2, debut));
  ruban.dataset.debut = debut;
  blocs.forEach((b, i) => { b.classList.toggle('leg-cache', i < debut || i > debut + 1); b.classList.toggle('leg-premier', i === debut); });
}
window.defilerLeg = defilerLeg;
function attendanceForAssnatId(assnatId){
  if(assnatId == null) return null;
  // Les clés de `presences` viennent d'un JSON : ce sont des chaînes, pas des nombres.
  return (typeof presences !== 'undefined' && presences[assnatId]) || null;
}
function resolveDepute(name){
  // Même convention que sponsorParty()/findDeputeEmail() : un nom peut porter un
  // suffixe "(Circonscription)" quand deux élu·e·s partagent le même nom (ex.
  // les deux "Eric Girard" — un vrai homonyme, pas une erreur). Si le nom est
  // ambigu sans ce suffixe et qu'aucune circonscription ne permet de trancher,
  // on refuse de deviner plutôt que de risquer d'attribuer les votes d'une
  // personne à une autre.
  const ridingMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const bareName = ridingMatch ? ridingMatch[1].trim() : name;
  const ridingHint = ridingMatch ? ridingMatch[2].trim() : null;
  const candidates = deputes.filter(d => norm(d.name) === norm(bareName));
  return ridingHint ? candidates.find(d => norm(d.riding) === norm(ridingHint)) : (candidates.length === 1 ? candidates[0] : null);
}
function computeAttendance(name){
  const dep = resolveDepute(name);
  if(!dep) return null;
  return attendanceForAssnatId(dep.assnatId);
}

function partyCounts(pairs){
  const counts = {};
  for(const [, party] of pairs) counts[party] = (counts[party] || 0) + 1;
  return Object.keys(partyColors).filter(p => counts[p]).map(p => [p, counts[p]]);
}
function partyBreakdownHtml(pairs){
  if(!pairs.length) return '';
  return partyCounts(pairs).map(([p, n]) => `<span style="color:${partyColors[p]}">${n} ${p}</span>`).join('');
}

let votesShown = 6; // on montre les 6 plus récents ; « Voir 6 de plus » ajoute 6
function loadMoreVotes(){ votesShown += 6; renderVotes(); }

function renderVotes(keyword){
  if(!document.getElementById('votesList')) return;   // vue absente de cette page
  renderArchivesNote();
  const isEn = currentLang === 'en';
  keyword = keyword !== undefined ? keyword : (document.getElementById('searchVotes')?.value || '');
  const kw = norm(keyword);
  // Votes ET motions, les plus récents d'abord (les gens peuvent chercher un
  // projet de loi précis via la recherche).
  // La recherche est évaluée UNE fois par vote, puis mémorisée dans un Set : les
  // quatre compteurs du filtre rapide et la liste elle-même la consultent, et
  // bills.find() par vote × cinq passes coûterait ~400 000 comparaisons par frappe.
  const correspondants = new Set(votes.filter(v=>{
    if(!kw) return true;
    const bill = v.billId ? bills.find(b=>b.id===v.billId) : null;
    const haystack = norm([v.subject, v.stage, bill?bill.title:'', v.billNum?('projet de loi n° '+v.billNum):''].join(' '));
    return haystack.includes(kw);
  }).map(v=>v.id));
  const correspondRecherche = v => correspondants.has(v.id);
  renderVotesQuickFilters(correspondRecherche);
  const full = votes.filter(v => correspondRecherche(v) && voteAdmisParFiltre(v, votesQuickFilter))
    .sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const list = full.slice(0, votesShown);

  const billLabel = isEn ? 'BILL NO.' : 'PROJET DE LOI N°';
  const pourLabel = isEn ? 'yeas' : 'pour';
  const contreLabel = isEn ? 'nays' : 'contre';
  const abstLabel = isEn ? 'abstentions' : 'abstention';
  const srcNote = isEn ? 'Official source (vote detail page)' : 'Source officielle (page de détail du vote)';
  const sponsorLabel = isEn ? 'Sponsor' : 'Parrain';

  const el = document.getElementById('votesList');
  el.innerHTML = list.length ? list.map(v=>{
    const total = v.totals.pour + v.totals.contre + v.totals.abstentions;
    const bill = v.billId ? bills.find(b=>b.id===v.billId) : null;
    const title = bill ? (isEn ? (bill.titleEn||bill.title) : bill.title) : v.subject;
    const domId = 'nominal-' + v.id;
    const wrapId = `votecard-${v.id}`;
    const whoLabel = isEn ? 'who voted what' : 'qui a voté quoi';
    const numLine = (v.billNum ? `${billLabel} ${v.billNum} — ` : '') + (v.stage ? v.stage + ' — ' : '') + v.date;
    const sponsorParty_ = bill && bill.sponsor ? sponsorParty(bill.sponsor) : null;
    const sponsorBadge = sponsorParty_ ? `<span class="depute-party" style="background:${partyColors[sponsorParty_]}; color:${partyText(sponsorParty_)}">${sponsorParty_}</span>` : '';
    const sponsorLine = bill && bill.sponsor ? `<div class="meta">${sponsorLabel} : ${bill.sponsor} ${sponsorBadge}</div>` : '';
    const isAdopted = v.totals.pour > v.totals.contre;
    const headTitle = (v.stage ? v.stage + ' — ' : '') + (v.billNum ? `${isEn ? 'Bill' : 'PL'} ${v.billNum}, ` : '') + title;
    const metaLine = `${v.date} · ${isEn ? 'Recorded division' : 'Vote nominal'}${v.stage ? ' · ' + v.stage : ''}`;
    const seg = (g) => total ? (v.totals[g]/total*100).toFixed(1) : 0;

    return `
      <div class="vote-card">
        <div class="vc-head" onclick="toggleVoteCard('vc-${v.id}', event)">
          <span class="result-badge ${isAdopted ? 'adopte' : 'rejete'}">${isAdopted ? (isEn ? 'Passed' : 'Adopté') : (isEn ? 'Rejected' : 'Rejeté')}</span>
          <div class="vc-head-main">
            <h3>${headTitle}</h3>
            <div class="vc-meta">${metaLine}</div>
          </div>
          <div class="vc-counts">
            <span class="vcc pour"><b>${v.totals.pour}</b> ${isEn?'yea':'pour'}</span>
            ${/* Le procès-verbal n'écrit une colonne que s'il y a quelqu'un dedans : « Nays »
                  manque aux 12 votes nemine contradicente, « abstentions » aux 130. On ne les
                  remplace pas par un zéro qu'on n'a pas lu — on n'affiche pas la case. */''}
            ${v.totals.contre != null ? `<span class="vcc contre"><b>${v.totals.contre}</b> ${isEn?'nay':'contre'}</span>` : ''}
            ${v.totals.abstentions != null ? `<span class="vcc abst"><b>${v.totals.abstentions}</b> ${isEn?'abst.':'abst.'}</span>` : ''}
          </div>
          <span class="vc-toggle" id="vctog-vc-${v.id}">+</span>
        </div>
        <div class="bar" onclick="toggleVoteCard('vc-${v.id}', event)">
          <div class="seg pour" style="width:${seg('pour')}%"></div>
          <div class="seg contre" style="width:${seg('contre')}%"></div>
          <div class="seg abst" style="width:${seg('abstentions')}%"></div>
        </div>
        <div class="vc-detail" id="vc-${v.id}" data-vote="${v.id}">
          <div class="vc-pgrid"></div>
          <div class="vc-ncols"></div>
          <div class="vc-foot">
            <span class="vc-foot-note">${isEn ? 'An abstention is not a « no » vote — mission, illness, scheduling.' : 'Une abstention n\'est pas un vote « non » — mission, maladie, horaire.'}</span>
            <a class="bill-more" href="${v.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${isEn ? 'The Journal → leg.bc.ca' : 'Le Journal → leg.bc.ca'}</a>
          </div>
        </div>
      </div>
    `;
  }).join('') : `<div class="no-results">${isEn ? 'No vote matches this search.' : 'Aucun vote ne correspond à cette recherche.'}</div>`;
  // Barre jaune « Voir 6 de plus » (maquette) tant qu'il reste des votes.
  if(full.length > votesShown){
    const remaining = full.length - votesShown;
    const step = Math.min(6, remaining);
    el.innerHTML += `<button class="votes-more" onclick="loadMoreVotes()">${isEn
      ? `Show ${step} more — ${list.length} of ${full.length} shown`
      : `Voir ${step} de plus — ${list.length} sur ${full.length} affichés`}</button>`;
  } else if(full.length > 6){
    el.innerHTML += `<div class="votes-more-note">${isEn ? `All ${full.length} shown` : `Les ${full.length} affichés`}</div>`;
  }
  // (idem : le compteur de l accueil vient de stats.json.)
}

// Onglet Votes : ouvre/ferme le détail d'une carte (un seul ouvert à la fois).
// Le détail nominatif d'un vote — qui a voté quoi — ne voyage plus dans la page. Il pèse
// 1 032 ko pour les 735 votes, soit 61 % du poids de la page, alors qu'il ne s'affiche que
// dans la carte qu'on déplie. Il vit donc dans data/votes/<id>.json (~1,4 ko) et arrive au
// moment où on en a besoin. Une fois chargé, il reste en mémoire.
const _nominalCache = new Map();
async function nominalDuVote(voteId){
  if(_nominalCache.has(voteId)) return _nominalCache.get(voteId);
  const p = fetch(`${votesBase}/${encodeURIComponent(voteId)}.json`)
    .then(r => r.ok ? r.json() : null)
    // Un réseau qui tombe ne doit pas laisser la carte bloquée sur « chargement » pour
    // toujours : on oublie l'échec pour que la prochaine ouverture réessaie.
    .catch(() => null)
    .then(d => { if(!d) _nominalCache.delete(voteId); return d; });
  _nominalCache.set(voteId, p);
  return p;
}

// Les deux moitiés du détail : les boîtes par parti, puis les trois colonnes de noms.
function contenuNominal(v, nominal, isEn){
  // Boîtes par parti : une par parti RÉELLEMENT présent dans ce vote
  // (Pour/Contre/Abstentions comptés sur le détail nominatif officiel).
  const perParty = {};
  ['pour','contre','abstentions'].forEach(g => (nominal[g]||[]).forEach(([id,party])=>{
    (perParty[party] = perParty[party] || {pour:0, contre:0, abstentions:0})[g]++;
  }));
  const partiesPresent = Object.keys(partyColors).filter(p => perParty[p])
    .concat(Object.keys(perParty).filter(p => !(p in partyColors)));
  const partyBoxes = partiesPresent.map(p => `
    <div class="vc-pbox">
      <div class="vc-phead" style="background:${partyColors[p]||'#999'}; color:${partyText(p)}">${p}</div>
      <div class="vc-pbody">
        <div class="vc-prow"><span style="color:var(--green)">${isEn?'Yea':'Pour'}</span><b>${perParty[p].pour}</b></div>
        <div class="vc-prow"><span style="color:var(--red)">${isEn?'Nay':'Contre'}</span><b>${perParty[p].contre}</b></div>
        <div class="vc-prow"><span style="color:var(--slate)">${isEn?'Abst.':'Abst.'}</span><b>${perParty[p].abstentions}</b></div>
      </div>
    </div>`).join('');

  // 3 colonnes nominatives défilables (nom + pastille de parti)
  const heads = isEn ? ['Yea','Nay','Abstentions'] : ['Pour','Contre','Abstentions'];
  const nominalCols = ['pour','contre','abstentions'].map((g,i)=>{
    const pairs = nominal[g] || [];
    const cls = ['pour','contre','abst'][i];
    const body = pairs.length ? pairs.map(([id,party])=>{
      const dep = deputeById.get(id);
      const name = dep ? dep.name : ('#'+id);
      return `<div class="vc-nrow"><span class="vc-chip" style="background:${partyColors[party]||'#999'}"></span>${name}</div>`;
    }).join('') : `<div class="vc-empty">${isEn ? 'None' : 'Personne'}</div>`;
    return `<div class="vc-ncol">
      <div class="vc-nhead ${cls}">${heads[i]} — ${v.totals[g]}</div>
      <div class="vc-nbody">${body}</div>
    </div>`;
  }).join('');
  return { partyBoxes, nominalCols };
}

// Remplit le détail d'une carte, une seule fois. Rendu synchrone si le nominatif est déjà là,
// pour que le cas courant (rouvrir une carte) n'ait aucune latence.
async function remplirDetailVote(el){
  if(el.dataset.rempli) return;
  const voteId = el.dataset.vote;
  const v = votes.find(x => x.id === voteId);
  if(!v) return;
  const isEn = currentLang === 'en';
  const grille = el.querySelector('.vc-pgrid');
  const colonnes = el.querySelector('.vc-ncols');
  if(!_nominalCache.has(voteId)){
    colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Loading the names…' : 'Chargement des noms…'}</div>`;
  }
  const nominal = await nominalDuVote(voteId);
  if(!nominal){
    colonnes.innerHTML = `<div class="vc-empty">${isEn ? 'Could not load the names. Open the official record below.' : 'Les noms n\'ont pas pu être chargés. Le procès-verbal officiel est en dessous.'}</div>`;
    return;
  }
  const { partyBoxes, nominalCols } = contenuNominal(v, nominal, isEn);
  grille.innerHTML = partyBoxes;
  colonnes.innerHTML = nominalCols;
  el.dataset.rempli = '1';
}

function toggleVoteCard(id, evt){
  if(evt) evt.stopPropagation();
  const el = document.getElementById(id);
  if(!el) return;
  const willOpen = !el.classList.contains('open');
  if(willOpen) remplirDetailVote(el);
  document.querySelectorAll('.vc-detail.open').forEach(other=>{
    if(other === el) return;
    other.classList.remove('open');
    const t = document.getElementById('vctog-' + other.id);
    if(t) t.textContent = '+';
  });
  el.classList.toggle('open', willOpen);
  const tog = document.getElementById('vctog-' + id);
  if(tog) tog.textContent = willOpen ? '−' : '+';
}

// (Ici vivait toggleNominalGroup, qui dépliait un camp d'un vote parti par parti. Plus aucun
//  appelant depuis que la carte de vote affiche ses trois colonnes d'un coup — et c'était le
//  dernier endroit à lire v.nominal, qui ne voyage plus dans la page. Retiré le 21 sept. 2026.)

/* ---------------- NAV ---------------- */
/* ---------- Routage par URL (SEO : chaque onglet a sa propre adresse) ----------
   Les pages /ministres, /projets-de-loi, /votes, /lexique existent aussi en
   HTML pré-rendu (scripts/build-section-pages.js) : contenu visible sans JS et
   <title> propre, pour que Google les indexe séparément. Ici, côté client : on
   synchronise l'URL au clic et on ouvre le bon onglet si on arrive directement
   sur une de ces adresses. */
// /mon-dossier y est aussi : sans lui, la page se prenait pour l'accueil et portait son titre
// anglais (arrivé avec l'anglais qui suit enfin la navigation, 24 sept. 2026).
// « Représentez votre ville » (/represente-ta-ville, 9 novembre 2026) : le formulaire d'intérêt.
// Il poste sur /api/represente, qui envoie le tout par courriel à Martin. Rien n'est promis à
// personne : on mesure la demande, ville par ville.
async function rtvEnvoyer(f){
  const isEn = currentLang === 'en';
  const note = f.querySelector('.rtv-note'), btn = f.querySelector('button');
  btn.disabled = true;
  note.textContent = isEn ? 'Sending…' : 'Envoi…';
  try{
    const d = Object.fromEntries(new FormData(f));
    const r = await fetch('/api/represente', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(d) });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    f.innerHTML = isEn
      ? '<p class="rtv-merci"><b>Thank you.</b> We will email you once we have looked at your city.</p>'
      : '<p class="rtv-merci"><b>Merci.</b> On vous revient par courriel dès qu\'on a regardé votre ville.</p>';
  }catch(e){
    btn.disabled = false;
    note.textContent = isEn
      ? 'Sending failed. Please try again in a moment.'
      : 'L\'envoi n\'a pas fonctionné. Réessayez dans un moment.';
  }
}

const VIEW_SLUGS = { apercu:'/', ministres:'/ministres', ministre:'/ministres', projets:'/projets-de-loi', votes:'/votes', archives:'/archives', ancien:'/archives', lexique:'/lexique', represente:'/represente-ta-ville', promesses:'/promesses', bd:'/sources', mondossier:'/mon-dossier', regles:'/regles', abonnement:'/abonnement' };
const SLUG_VIEWS = { '':'apercu', 'ministres':'ministres', 'ministres/':'ministre', 'projets-de-loi':'projets', 'votes':'votes', 'archives':'archives', 'archives/':'ancien', 'represente-ta-ville':'represente', 'deputes/':'ministre', 'lexique':'lexique', 'promesses':'promesses', 'sources':'bd', 'mon-dossier':'mondossier', 'regles':'regles', 'abonnement':'abonnement' };
// Titres FRANÇAIS seulement — l'inverse de DossierQuébec, et pour la même raison : ici le <title>
// du HTML est l'ANGLAIS. C'est lui que Google lit, c'est lui que le build écrit page par page et
// qu'il vérifie (unicité, 65 caractères, « Sujet — DossierBC »). Le français n'existe nulle part
// dans le HTML : il vient d'ici.
//
// Avant le 9 nov. 2026 cette table portait des titres ANGLAIS, repris de DossierQuébec, et deux
// choses allaient de travers. En français, le titre restait anglais. Et en anglais, syncTitle
// ÉCRASAIT le titre de la page par celui de la VUE : une page de projet de loi perdait
// « Bill M 249 — Pharmaceutical Risk Management… » pour le générique « British Columbia bills »,
// si bien que les 102 pages de projets portaient le même titre aux yeux d'un moteur. Les pages qui
// ont leur propre titre (un projet de loi, un·e ministre) n'ont donc plus rien à déclarer ici : en
// anglais on garde le leur, en français elles portent data-titre-fr.
const PAGE_META = {
  bd:        { fr:"Mises à jour du site — DossierBC" },
  apercu:    { fr:"L'Assemblée législative de la Colombie-Britannique en clair — DossierBC" },
  ministres: { fr:"Conseil exécutif et député·e·s de la Colombie-Britannique — DossierBC" },
  // Page d'un ministre (/ministres/josie-osborne, scripts/build-minister-pages.js) : titre français dans la page.
  ministre:  { get fr(){ return document.getElementById('view-ministre')?.dataset.titreFr || 'Ministre de la Colombie-Britannique — DossierBC'; } },
  // Ancien·ne ministre d'une législature archivée : titre français dans la page, quand il y en aura.
  ancien:    { get fr(){ return document.getElementById('view-ancien')?.dataset.titreFr || 'Ancien·ne ministre — DossierBC'; } },
  projets:   { fr:"Projets de loi de la Colombie-Britannique — DossierBC" },
  votes:     { fr:"Votes nominatifs en Colombie-Britannique — DossierBC" },
  lexique:   { fr:"Lexique de l'Assemblée législative — DossierBC" },
  represente:{ fr:"Représentez votre ville — DossierBC" },
  archives:  { fr:"Législatures passées de la Colombie-Britannique — DossierBC" },
  mondossier:{ fr:"Mon dossier — DossierBC" },
  introuvable:{ fr:"Page introuvable (404) — DossierBC" },
  regles:    { fr:"Les règles de sources du site — DossierBC" },
  // Ni « promesses » ni « abonnement » : ces deux pages n'existent pas sur DossierBC, et leurs
  // entrées portaient encore des titres « — DossierQuébec ».
};
function viewFromPath(){
  // La page 404 est servie à N'IMPORTE quelle adresse inconnue : c'est sa présence qui la désigne,
  // pas le chemin (sinon elle se prendrait pour l'accueil).
  if(document.getElementById('view-introuvable')) return 'introuvable';
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  // Une page de projet de loi (/projets-de-loi/3-43-3, scripts/build-bill-pages.js) est la vue Projets.
  if(seg.startsWith('projets-de-loi/')) return 'projets';
  if(seg.startsWith('ministres/')) return SLUG_VIEWS['ministres/'];
  if(seg.startsWith('archives/')) return SLUG_VIEWS['archives/'];
  // Fiche d'un chef de l'opposition (/deputes/charles-milliard) : même vue que celle d'un ministre.
  if(seg.startsWith('deputes/')) return SLUG_VIEWS['deputes/'];
  return SLUG_VIEWS[seg] || 'apercu';
}
// Le titre ANGLAIS tel que le build l'a écrit dans CETTE page : celui d'une section, mais aussi
// celui d'un projet de loi ou d'un·e ministre. On ne le remplace jamais en anglais.
const _titreAnglais = document.title;
function syncTitle(viewName){
  if(typeof currentLang === 'undefined' || currentLang !== 'fr'){ document.title = _titreAnglais; return; }
  // Une page qui a son propre titre français (un projet de loi, un·e ministre) le porte dans une
  // balise meta, écrite par son build ; sinon, le titre de la vue. À défaut, l'anglais — jamais
  // un titre deviné.
  const propre = document.querySelector('meta[name="dvq:titre-fr"]')?.content;
  document.title = propre || PAGE_META[viewName]?.fr || _titreAnglais;
}

function goToTab(viewName, opts){
  opts = opts || {};
  const target = document.getElementById('view-'+viewName);
  // Chaque vue a maintenant SA page. Si celle qu'on demande n'est pas ici, on y va pour de
  // vrai — avant, tout vivait dans le même document et il suffisait de basculer une classe.
  if(!target){
    const url = VIEW_SLUGS[viewName];
    if(url && !opts.fromHistory) location.href = url + paramLangue(true);
    return;
  }
  document.querySelectorAll('nav.tabs a[data-view]').forEach(a=>{
    const actif = a.dataset.view === (viewName === 'ministre' ? 'ministres' : viewName === 'ancien' ? 'archives' : viewName);
    a.classList.toggle('active', actif);
    if(actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  target.classList.add('active');
  closeMobileMenu();
  if(!opts.noScroll) window.scrollTo({top:0, behavior: opts.fromHistory ? 'auto' : 'smooth'});
  // Met l'URL à jour au clic (mais pas quand on répond à un back/forward).
  if(!opts.fromHistory && VIEW_SLUGS[viewName]){
    const url = VIEW_SLUGS[viewName];
    const here = (location.pathname.replace(/\.html$/, '') || '/');
    if(here !== url){ history.pushState({ view: viewName }, '', url + paramLangue(true)); }
  }
  syncTitle(viewName);
}

// Boutons Précédent/Suivant du navigateur.
window.addEventListener('popstate', ()=>{ goToTab(viewFromPath(), { fromHistory: true }); });

// La connexion vit désormais dans l'onglet Lexique (section « Compte & à
// propos »). Les boutons « Se connecter » y sautent et défilent jusqu'au bloc.
function goToAccount(){
  goToTab('lexique');
  setTimeout(()=>{
    const el = document.getElementById('sec-compte') || document.getElementById('accountBox');
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 80);
}

document.querySelectorAll('nav.tabs a[data-view]').forEach(lien=>{
  lien.addEventListener('click', (e)=>{
    if(e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if(!document.getElementById('view-' + lien.dataset.view)) return;   // une autre page : le lien s'en charge
    e.preventDefault();
    goToTab(lien.dataset.view);
  });
});

document.querySelector('.brand-text')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goToTab('apercu'); }
});
// (Le logo-dossier qui flippait vers DossierCanada a été retiré — le listener
// et l'animation sont partis avec. À réintroduire ailleurs si souhaité.)

function openMobileMenu(){
  document.querySelector('nav.tabs')?.classList.add('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded','true');
}
function closeMobileMenu(){
  document.querySelector('nav.tabs')?.classList.remove('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded','false');
}
document.getElementById('hamburgerBtn')?.addEventListener('click', ()=>{
  const isOpen = document.querySelector('nav.tabs')?.classList.contains('open');
  isOpen ? closeMobileMenu() : openMobileMenu();
});
document.getElementById('closeMenuBtn')?.addEventListener('click', closeMobileMenu);

const backToTopBtn = document.getElementById('backToTop');
window.addEventListener('scroll', ()=>{
  backToTopBtn.classList.toggle('visible', window.scrollY > 400);
});

document.getElementById('searchMinistres')?.addEventListener('input', e=> { renderMinistres(e.target.value); renderDeputes(e.target.value); });

// CODE POSTAL ET MUNICIPALITÉ → CIRCONSCRIPTION (Martin, 16 oct. 2026 : « oui bâtis-le »). Les
// fichiers data/cp/ viennent d'Élections Québec (carte du 5 octobre 2026) ; seul le morceau du code
// tapé est téléchargé, et rien de ce qui est tapé ne quitte le navigateur. Chaque circonscription
// trouvée devient un bouton qui la met dans la boîte : la fiche de son élu·e s'affiche alors.
const SOURCE_CP = { fr: 'Source : Élections Québec, « Entités administratives et code postal », carte de 2026. © Directeur général des élections du Québec.', en: 'Source: Élections Québec, “Entités administratives et code postal”, 2026 map. © Directeur général des élections du Québec.' };
const _cpCache = new Map();
async function lireCp(chemin){
  if(!_cpCache.has(chemin)) _cpCache.set(chemin, fetch(chemin).then(r => r.ok ? r.json() : null).catch(() => null));
  return _cpCache.get(chemin);
}
const echapperHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const sourceCp = (isEn) => `<small class="search-retour-source">${isEn ? SOURCE_CP.en : SOURCE_CP.fr}</small>`;
// Les noms d'Élections Québec et de l'Assemblée n'ont pas toujours le même tiret
// (« Laviolette-Saint-Maurice » / « Laviolette–Saint-Maurice ») : on compare avec norm().
// Une circonscription sans élu·e proclamé·e n'est pas un bouton : elle ne mènerait à aucune fiche.
function boutonsCirconscriptions(circs, isEn){
  return circs.map(c => {
    const d = deputes.find(x => norm(x.riding) === norm(c));
    if(!d) return `<span class="search-retour-nom search-retour-vide">${echapperHtml(c)} — ${isEn ? 'not yet proclaimed' : 'pas encore proclamé·e'}</span>`;
    return `<button type="button" class="search-retour-nom" data-circ="${echapperHtml(d.riding)}">${echapperHtml(c)} — ${echapperHtml(d.name)} (${echapperHtml(d.party)})</button>`;
  }).join('');
}
let _sansMunicipalite = false;   // un clic sur une circonscription : pas de municipalité homonyme dessous
function brancherCirconscriptions(boite){
  boite.querySelectorAll('.search-retour-nom[data-circ]').forEach((b) => b.addEventListener('click', () => {
    const champ = document.getElementById('searchMinistres');
    champ.value = b.dataset.circ;
    _sansMunicipalite = true;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  }));
}
const phraseMunicipalite = (m, circs, isEn) => `<b>${echapperHtml(m)}</b>${circs.length > 1 ? (isEn ? ` is split into ${circs.length} ridings (type your postal code to find yours)` : ` est partagée entre ${circs.length} circonscriptions (tapez votre code postal pour trouver la vôtre)`) : ''}${isEn ? ':' : ' :'} ${boutonsCirconscriptions(circs, isEn)}`;
// Chaque recherche a son numéro : une réponse du réseau qui arrive après une recherche plus récente
// est jetée (sinon elle écrasait le nouveau retour, ou l'allongeait deux fois).
let _rechercheNo = 0;
async function circonscriptionsParCode(cp, boite, no){
  const isEn = currentLang === 'en';
  const lot = await lireCp(`/data/cp/${cp.slice(0, 3)}.json`);
  if(no !== _rechercheNo) return;
  let circs = [];
  if(lot) circs = cp.length === 6 ? (lot.p[cp.slice(3)] || []).map(i => lot.c[i]) : lot.c;
  if(!circs.length){
    boite.innerHTML = isEn ? `No riding found for <b>${cp}</b>. Check the postal code.` : `Aucune circonscription trouvée pour <b>${cp}</b>. Vérifiez le code postal.`;
    return;
  }
  const debut = cp.length === 6
    ? (isEn ? `<b>${cp.slice(0, 3)} ${cp.slice(3)}</b> is in:` : `<b>${cp.slice(0, 3)} ${cp.slice(3)}</b> est dans :`)
    : (isEn ? `Postal codes starting with <b>${cp}</b> are in ${circs.length > 1 ? 'these ridings (type the full code to narrow it down)' : 'this riding'}:` : `Les codes postaux qui commencent par <b>${cp}</b> sont dans ${circs.length > 1 ? 'ces circonscriptions (tapez le code complet pour préciser)' : 'cette circonscription'} :`);
  boite.innerHTML = `${debut} ${boutonsCirconscriptions(circs, isEn)}${circs.length > 1 && cp.length === 6 ? (isEn ? '<br>This postal code straddles two ridings: the civic address decides.' : '<br>Ce code postal chevauche deux circonscriptions : c’est l’adresse qui tranche.') : ''}${sourceCp(isEn)}`;
  brancherCirconscriptions(boite);
}
// Une recherche qui trouve des fiches ET qui est le nom exact d'une municipalité (« Lévis » : une
// circonscription, mais aussi une ville partagée entre trois) : la ville s'ajoute sous les fiches.
async function ajouterMunicipalite(valeur, boite, no){
  const munis = await lireCp('/data/cp/municipalites.json');
  if(!munis || no !== _rechercheNo) return;
  const m = Object.keys(munis).find(x => norm(x) === norm(valeur));
  if(!m) return;
  const isEn = currentLang === 'en';
  boite.insertAdjacentHTML('beforeend', `<br>${isEn ? 'The municipality' : 'La municipalité'} ${phraseMunicipalite(m, munis[m], isEn)}${sourceCp(isEn)}`);
  brancherCirconscriptions(boite);
}
async function circonscriptionsParMunicipalite(valeur, boite, no){
  const isEn = currentLang === 'en';
  const munis = await lireCp('/data/cp/municipalites.json');
  if(no !== _rechercheNo) return;
  const v = norm(valeur);
  const noms = munis ? Object.keys(munis) : [];
  const trouves = noms.filter(m => norm(m) === v).concat(noms.filter(m => norm(m) !== v && norm(m).startsWith(v))).slice(0, 4);
  if(!trouves.length){
    boite.innerHTML = isEn
      ? 'No name, riding, region, ministry or municipality matches. Looking for a neighbourhood? Type your postal code: the box will give your riding.'
      : 'Aucun nom, circonscription, région, ministère ou municipalité ne correspond. Vous cherchez un quartier ? Tapez votre code postal : la boîte donnera votre circonscription.';
    return;
  }
  boite.innerHTML = trouves.map(m => phraseMunicipalite(m, munis[m], isEn)).join('<br>') + sourceCp(isEn);
  brancherCirconscriptions(boite);
}

// LE RETOUR DE LA RECHERCHE (Martin, 16 oct. 2026 : « je marque Limoilou mais rien ne sort »). Les
// fiches trouvées s'affichent plus bas, sous la composition et la légende : rien ne bougeait près de
// la boîte. On liste ici les noms trouvés, chacun mène à sa fiche. Appelé après chaque nouvelle
// liste (planifierRetour, depuis renderDeputes), une fois les deux grilles redessinées.
let _retourPlanifie = false;
function planifierRetour(){
  if(_retourPlanifie) return;
  _retourPlanifie = true;
  setTimeout(() => { _retourPlanifie = false; retourRecherche(document.getElementById('searchMinistres')?.value || ''); }, 0);
}
function retourRecherche(valeur){
  const boite = document.getElementById('searchRetour');
  if(!boite) return;
  const no = ++_rechercheNo;
  const sansMunicipalite = _sansMunicipalite;
  _sansMunicipalite = false;
  const isEn = currentLang === 'en';
  if(!norm(valeur)){ boite.hidden = true; boite.innerHTML = ''; return; }
  const fiches = [...document.querySelectorAll('#ministresGrid .m-card, #deputesList .dep-row')];
  boite.hidden = false;
  // Un code postal (ou ses 3 premiers caractères), ou une municipalité : la circonscription,
  // d'après le fichier d'Élections Québec (scripts/build-codes-postaux.js). Le temps de lire le
  // fichier, la boîte dit qu'elle cherche : l'ancien retour n'y reste pas.
  const cp = String(valeur).toUpperCase().replace(/\s+/g, '');
  const enCours = isEn ? 'Searching…' : 'Recherche…';
  if(/^[GHJK]\d[A-Z](\d[A-Z]\d)?$/.test(cp)){ boite.innerHTML = enCours; circonscriptionsParCode(cp, boite, no); return; }
  if(!fiches.length && norm(valeur).length >= 3){ boite.innerHTML = enCours; circonscriptionsParMunicipalite(valeur, boite, no); return; }
  if(!fiches.length){
    boite.innerHTML = isEn
      ? 'No name, riding, region or ministry matches. Looking for a neighbourhood or a town? Type your postal code: the box will give your riding.'
      : 'Aucun nom, circonscription, région ou ministère ne correspond. Vous cherchez un quartier ou une ville ? Tapez votre code postal : la boîte donnera votre circonscription.';
    return;
  }
  const MAX = 8;
  const noms = fiches.slice(0, MAX).map((el, i) => {
    const nom = (el.querySelector('.m-name, .dep-name')?.textContent || '').trim();
    return `<button type="button" class="search-retour-nom" data-i="${i}">${echapperHtml(nom)}</button>`;
  }).join('');
  const reste = fiches.length > MAX ? (isEn ? ` and ${fiches.length - MAX} more below` : ` et ${fiches.length - MAX} autres plus bas`) : '';
  boite.innerHTML = `<b>${fiches.length} ${isEn ? (fiches.length > 1 ? 'results' : 'result') : (fiches.length > 1 ? 'résultats' : 'résultat')}</b>${isEn ? ':' : ' :'} ${noms}${reste}`;
  boite.querySelectorAll('.search-retour-nom[data-i]').forEach((b) => b.addEventListener('click', () => {
    const cible = fiches[Number(b.dataset.i)];
    cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cible.classList.add('fiche-trouvee');
    setTimeout(() => cible.classList.remove('fiche-trouvee'), 2000);
  }));
  if(!sansMunicipalite) ajouterMunicipalite(valeur, boite, no);
}
try{ const p = new URLSearchParams(location.search).get('parrain'); const sb = document.getElementById('searchBills'); if(p && sb) sb.value = p; }catch(e){}
document.getElementById('searchBills')?.addEventListener('input', ()=> { billsShown = BILLS_STEP; renderBills(); });
document.getElementById('searchVotes')?.addEventListener('input', ()=> { votesShown = 6; renderVotes(); });

/* ---------------- INIT ---------------- */
function sortRoadmapItems(){
  const container = document.getElementById('view-compte');
  if(!container) return;
  const items = [...container.querySelectorAll(':scope > .roadmap-item')];
  const priority = { now: 0, next: 1, later: 2 };
  const getPriority = (item) => {
    const statusEl = item.querySelector('.roadmap-status');
    for(const cls of statusEl.classList){
      if(cls in priority) return priority[cls];
    }
    return 99;
  };
  items
    .map((item, i) => ({ item, i, p: getPriority(item) }))
    .sort((a,b) => a.p - b.p || a.i - b.i)
    .forEach(({item}) => container.appendChild(item));
}

/* Retire les listes que le build a écrites dans le HTML (div.prerendu[data-prerendu="<jeu>"]),
   une fois les vraies cartes dessinées — sauf celles dont le jeu n'a pas pu être chargé. */
function retirerPrerendus(jeux){
  document.querySelectorAll('[data-prerendu]').forEach(e => {
    const jeu = e.dataset.prerendu;
    if(jeux && !jeux.includes(jeu)) return;
    if(_echecs.has(jeu)){
      // Pas .hidden : #deputesList{display:block} et .grid{display:grid} l'emporteraient.
      const c = e.previousElementSibling;
      if(c) c.style.display = 'none';
      return;
    }
    e.remove();
  });
}

/* ---------------- MISES À JOUR DU SITE (/sources) ----------------
   data/journal.json est tenu À LA MAIN : un changement visible du site y ajoute son entrée,
   dans le même commit que le changement. Les premières entrées couvrent la semaine du 14 au
   21 septembre 2026, rédigées à partir de ses commits ; chacune garde les siens dans `commits`,
   pour qu'on puisse toujours remonter à ce qui a vraiment été fait. Rien n'y entre qui ne soit
   en ligne. */
const JOURNAL_VOLETS = {
  // Ici, « assemblee », c'est l'Assemblée LÉGISLATIVE de la Colombie-Britannique. L'étiquette
  // disait encore « Assemblée nationale » : la province de DossierQuébec, sur chaque entrée.
  // Aucun volet de ville en C.-B. : les villes du Québec sont parties avec.
  assemblee: ['Assemblée législative', 'Legislative Assembly'],
  compte:    ['Compte', 'Account'],
  site:      ['Tout le site', 'Whole site'],
};
const JOURNAL_PREMIERES = 20;   // au-delà, un bouton ouvre le reste
let journalTout = false;

function renderJournal(){
  const liste = document.getElementById('journalListe');
  if(!liste) return;   // vue absente de cette page
  const en = currentLang === 'en';
  const loc = en ? 'en-CA' : 'fr-CA';
  const h = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  // AAAA-MM-JJ lu comme une date LOCALE : new Date('2026-09-21') serait minuit UTC, donc le 20
  // au soir au Québec.
  const jour = (iso) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j); };
  const fmtMois = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
  const fmtJour = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' });
  const entrees = journal.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.fr)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const visibles = journalTout ? entrees : entrees.slice(0, JOURNAL_PREMIERES);
  let html = '', mois = '';
  for(const e of visibles){
    if(e.date.slice(0, 7) !== mois){
      if(mois) html += '</ol></li>';
      mois = e.date.slice(0, 7);
      const t = fmtMois.format(jour(e.date));
      html += `<li class="maj-mois"><h2>${h(t.charAt(0).toUpperCase() + t.slice(1))}</h2><ol>`;
    }
    const txt = (en && e.en) ? e.en : e.fr;
    const volet = JOURNAL_VOLETS[e.volet] || JOURNAL_VOLETS.site;
    html += `<li class="maj-entree"><time datetime="${h(e.date)}">${h(fmtJour.format(jour(e.date)))}</time>`
      + `<div class="maj-corps"><span class="maj-volet maj-volet-${h(e.volet)}">${h(volet[en ? 1 : 0])}</span>`
      + `<h3>${h(txt.titre)}</h3><p>${h(txt.texte)}</p></div></li>`;
  }
  if(mois) html += '</ol></li>';
  liste.innerHTML = html || `<li class="maj-vide">${en ? 'No updates to show yet.' : 'Aucune mise à jour à afficher pour l’instant.'}</li>`;
  const plus = document.getElementById('journalPlus');
  if(plus){
    const reste = entrees.length - visibles.length;
    plus.hidden = reste <= 0;
    plus.textContent = en
      ? `Show ${reste} older update${reste > 1 ? 's' : ''}`
      : `Voir ${reste > 1 ? `les ${reste} mises à jour plus anciennes` : 'la mise à jour plus ancienne'}`;
  }
}
document.getElementById('journalPlus')?.addEventListener('click', () => { journalTout = true; renderJournal(); });

// Ticker brutaliste : compose la bande défilante avec les VRAIES données
// (comptes réels des datasets + statut des travaux déjà affiché dans
// .calendar-box). Le contenu est dupliqué dans deux spans identiques pour
// que l'animation translateX(-50%) boucle sans couture.
function renderTicker(){
  if(!document.getElementById('tickerA')) return;   // vue absente de cette page
  const isEn = currentLang === 'en';
  const parts = [];
  const cal = document.querySelector('.calendar-box .status');
  if(cal) parts.push(cal.textContent.replace(/^●\s*/,'').trim());
  // Les compteurs viennent de stats, que chaque page charge. Compter les jeux eux-mêmes
  // donnait 0 partout depuis le découpage : /votes n'a pas les projets, /sources n'a rien.
  // Sans stats (fichier perdu), on se tait plutôt que d'afficher un faux zéro.
  if(stats){
    parts.push(`${stats.votes} ${isEn ? 'recorded divisions' : 'votes nominatifs enregistrés'}`);
    parts.push(`${stats.projets} ${isEn ? 'bills tracked' : 'projets de loi suivis'}`);
    parts.push(`${stats.ministres} ${isEn ? 'ministers in Cabinet' : 'ministres au Conseil'}`);
  }
  parts.push(isEn ? 'Independent citizen site · real public data' : 'Site citoyen indépendant · vraies données publiques');
  const line = parts.map(p => `● ${p}`).join('   ') + '   ';
  const a = document.getElementById('tickerA'), b = document.getElementById('tickerB');
  if(a && b){ a.textContent = line; b.textContent = line; }
}

// « Ce qui est sur DQ reste sur DQ » (Martin, 21 sept. 2026) : les pages communes (Mes dossiers,
// Abonnement) prennent la marque du DERNIER site visité. Les volets y inscrivent leur ville
// (commun/abonnes.js, memoriserVolet) ; le provincial y inscrit « assemblee » — même clé, lue par
// commun/navigation.js (dernierVolet, vientDuProvincial) et par le <head> de abonnement.html.
// Sauf quand l'adresse nomme une ville (/mon-dossier?ville=montreal, venu d'un volet) : depuis la
// fusion du 30 sept. 2026, Mon dossier EST une page du provincial, et cette ligne effaçait le volet
// d'où l'on arrivait — on repartait sur DQ.
try{ if(!new URLSearchParams(location.search).get('ville')) localStorage.setItem('dq:dernier-volet', JSON.stringify({ ville: 'assemblee' })); }catch(e){}

(async function init(){
  // Anglais : les textes fixes tout de suite, avant même les données. Le <head> garde la page
  // cachée 1,5 s au plus ; si le réseau traîne plus longtemps, elle se montre déjà traduite.
  if(currentLang === 'en') traduireTextesFixes();
  // D'abord les données : tout ce qui suit en dépend, et elles arrivent maintenant par le
  // réseau plutôt que d'être écrites dans la page.
  await chargerDonnees();
  // L'état des législatures arrive avec les données : la phrase qui l'explique s'écrit donc ici,
  // pas au premier rendu (où legislatureEtat était encore vide).
  if(typeof etatLegislature === 'function') etatLegislature();
  await chargerArchive();
  // L'encadré de l'abonnement : sa phrase « le suivi commencera avec la nouvelle législature »
  // tombe quand un projet de loi suivable existe VRAIMENT dans les données (loiVivante), pas à une
  // date : le 17 nov., dissolved=false ne suffit pas, il faut le premier projet de la 44e.
  for(const d of document.querySelectorAll('.promo-dissolution')) d.hidden = bills.some(loiVivante);
  await loadFollowed();
  await loadIntroState();
  await loadFontZoom();
  await loadTheme();
  await loadFollowedDeputes();
  await initAuth();   // charge aussi les projets de loi suivis (compte requis)
  renderHemicycle();
  renderLegendePresence();
  sortRoadmapItems();
  renderMinistres();
  renderStatusFilters();
  renderStepFilters();
  updateSortToggleLabel();  updateMinistresSortLabel();
  renderAccountBox();
  renderAdminFlagCounts();
  renderComparateurSelects();
  renderComparateurTable();
  renderFinancesSelect();
  renderFinances();
  renderBills();
  renderApercuBills();
  renderVotes();
  renderDeputes();
  renderNews();
  // Les listes du HTML s'effacent dès que leurs cartes sont là — AVANT l'appel réseau de
  // renderChallenged, sinon l'accueil montrait les deux versions le temps de sa réponse.
  retirerPrerendus(['apercuBills', 'newsItems', 'bills', 'votes', 'ministers', 'deputesRaw']);
  // Textes traduits, listes dessinées : la page anglaise peut se montrer (le <head> la cache).
  // Pas plus tard : la suite attend Supabase, et la page restait cachée jusqu'à 0,9 s de plus.
  // Sur /promesses et /sources, ce qui suit ne fait pas d'appel réseau : leurs listes sont
  // dessinées avant le premier affichage.
  document.documentElement.classList.add('dq-pret');
  // Attendu : renderChallenged charge le cache PUIS re-rend la liste des projets.
  // Sans l'attendre, ce re-rendu tardif referme la carte ouverte par le lien
  // profond (?pl=NUM) — d'où le await avant openBillFromQuery plus bas.
  await renderChallenged();
  promPret = true;
  renderPromises();
  await loadSnoozedSections();
  applyLanguage();
  retirerPrerendus();   // le reste (promesses, journal) : ils viennent d'être dessinés
  // Ouvre l'onglet correspondant à l'adresse d'arrivée (/votes, /ministres…).
  const bootView = viewFromPath();
  // L'ancre fait partie de l'adresse reçue (/mon-dossier?ville=montreal#villes) : l'effacer
  // renvoyait en haut de la page, sur les projets de loi.
  history.replaceState({ view: bootView }, '', location.pathname + location.search + location.hash);
  if(bootView !== 'apercu'){ goToTab(bootView, { fromHistory: true, noScroll: true }); }
  else { syncTitle('apercu'); }
  // Lien profond partagé (/projets-de-loi?pl=NUM) : ouvre le projet ciblé.
  openBillFromQuery();
  // Une ancre (/lexique#etapes) : la page se dessine après le chargement, et le navigateur a déjà
  // tenté de défiler sur une page plus courte. On y va une fois tout dessiné.
  if(location.hash.length > 1){ try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' }); } catch(e){} }
  renderTicker();
  demarrageFini = true;
})();

// Le bouton ⧉ à côté du ✉ dans la case des votes (Martin, 18 oct. 2026 : « si j'ai un Gmail, j'ai
// pas le goût d'utiliser Outlook ») : il copie l'adresse de l'élu·e, à coller dans n'importe quel
// courriel. Le ✉, lui, ouvre le logiciel de courriel de l'appareil.
function copierCourriel(bouton, adresse){
  const fait = () => { const avant = bouton.textContent; bouton.textContent = '✓'; setTimeout(() => { bouton.textContent = avant; }, 1500); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(adresse).then(fait).catch(() => window.prompt('', adresse));
  else window.prompt('', adresse);
}
window.copierCourriel = copierCourriel;

// Un ✕ au bout de chaque boîte de recherche (Martin, 22 oct. 2026) : il efface le texte et relance la
// recherche comme si on l'avait vidée à la main. Caché tant que la boîte est vide.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.brutal-search input').forEach((champ) => {
    if(champ.parentElement.querySelector('.bs-effacer')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bs-effacer';
    b.textContent = '✕';
    const libelle = () => (currentLang === 'en' ? 'Clear the search' : 'Effacer la recherche');
    b.setAttribute('aria-label', libelle());
    b.title = libelle();
    const maj = () => { b.hidden = !champ.value; };
    b.addEventListener('click', () => { champ.value = ''; champ.dispatchEvent(new Event('input', { bubbles: true })); maj(); champ.focus(); });
    champ.addEventListener('input', maj);
    champ.after(b);
    maj();
    setTimeout(maj, 1500);   // une valeur posée par le script (lien ?elu=…) arrive après le chargement
  });
});

// Retour depuis une fiche (Martin, 4 nov. 2026) : la liste des ministres et des élu·e·s se dessine
// après le chargement, alors le navigateur ne retrouve pas la position et laisse la page ailleurs.
// On note la position au clic sur un nom, puis on y revient une fois la liste redessinée.
document.addEventListener('click', (e) => {
  const a = e.target.closest('.m-name a, .dep-name a');
  if(!a) return;
  try{ sessionStorage.setItem('dq:retourListe', JSON.stringify({ page: location.pathname, y: scrollY })); }catch(err){}
});
(() => {
  let note = null;
  try{ note = JSON.parse(sessionStorage.getItem('dq:retourListe') || 'null'); }catch(err){}
  if(!note || note.page !== location.pathname) return;
  try{ sessionStorage.removeItem('dq:retourListe'); }catch(err){}
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let essais = 0;
  const revenir = () => {
    const pret = document.querySelector('#deputesList .dep-name') && document.documentElement.scrollHeight > note.y + innerHeight / 2;
    if(pret){ scrollTo(0, note.y); return; }
    if(++essais < 40) setTimeout(revenir, 150);
  };
  revenir();
})();

// Compteur de suivis à côté de chaque bouton « Suivre » (Martin, 4 nov. 2026) : combien de personnes
// suivent cet·te élu·e, toutes clés confondues (ministre, Nom|Circonscription). Fonction Supabase
// public.bc_suivis() (security definer, seulement des totaux par nom). Rien d'affiché sous 1.
let _nbSuivis = null, _nbSuivisDemande = null;
function nbSuivisCharger(){
  if(_nbSuivisDemande) return _nbSuivisDemande;
  _nbSuivisDemande = (async () => {
    try{
      if(typeof supabaseClient === 'undefined' || !supabaseClient?.rpc) return null;
      const { data, error } = await supabaseClient.rpc('bc_suivis');
      if(error || !Array.isArray(data)) return null;
      _nbSuivis = new Map(data.map((r) => [norm(r.nom), Number(r.nb) || 0]));
      return _nbSuivis;
    }catch(e){ return null; }
  })();
  return _nbSuivisDemande;
}
function nbSuivisDecorer(){
  if(!_nbSuivis) return;
  const isEn = currentLang === 'en';
  document.querySelectorAll('.follow-btn').forEach((b) => {
    const m = (b.getAttribute('onclick') || '').match(/toggleFollow(?:Depute)?\('((?:[^'\\]|\\.)*)'\)/);
    if(!m) return;
    const nom = m[1].replace(/\\'/g, "'").split('|')[0];
    const n = _nbSuivis.get(norm(nom)) || 0;
    // Dans le bouton : « Suivre (12) », « Suivre (1k+) », « Suivre (100k+) » (Martin, 4 nov. 2026).
    let pastille = b.querySelector('.nb-suivis');
    if(n < 1){ pastille?.remove(); return; }
    const texte = ` (${n < 1000 ? n : n < 100000 ? `${Math.floor(n / 1000)}k+` : '100k+'})`;
    if(!pastille){ pastille = document.createElement('span'); pastille.className = 'nb-suivis'; b.append(pastille); }
    if(pastille.textContent !== texte) pastille.textContent = texte;
    b.title = isEn ? `${n} ${n > 1 ? 'people follow' : 'person follows'} ${nom} on DossierBC` : `${n} personne${n > 1 ? 's suivent' : ' suit'} ${nom} sur DossierBC`;
  });
}
(() => {
  let attente = null;
  const relancer = () => { clearTimeout(attente); attente = setTimeout(nbSuivisDecorer, 120); };
  const demarrer = () => {
    if(!document.querySelector('.follow-btn') && !/^\/(ministres|deputes|archives)/.test(location.pathname)) return;
    nbSuivisCharger().then(() => { nbSuivisDecorer(); new MutationObserver(relancer).observe(document.body, { childList: true, subtree: true }); });
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(demarrer, 600)); else setTimeout(demarrer, 600);
})();
