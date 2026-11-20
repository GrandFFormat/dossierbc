// CONFIGURATION DU VOLET VANCOUVER pour le moteur commun des villes (20 nov. 2026).
// Le code est dans /commun/ville/moteur.js, COPIÉ de dossierquebec par son scripts/synchro-moteur.js :
// on ne le modifie jamais ici. La liste des clés est en tête de montreal/assets/ville.js (dossierquebec)
// et, pour les volets anglophones, dans la section « VOLETS ANGLOPHONES » à la fin du moteur.
//
// Vancouver : la Ville publie en anglais et ne publie pas le texte de ses décisions, seulement la ligne
// d'ordre du jour de chaque point mis aux voix (jeu de données ouvert). Aucun résumé IA, aucun district :
// le conseil est élu à l'échelle de la ville. La fiche d'un élu montre ses décomptes bruts.
import { libelleEn, themeEn, libelleFr, themeFr, INSTANCES_FR } from './libelles-en.js';

globalThis.VILLE = {
  nom: 'Vancouver',
  province: 'DossierBC',
  pages: {
    decisions: 'decisions-of-vancouver-city-council',
    conseil: 'vancouver-city-council',
  },
  // Copies locales : la langue (anglais par défaut, français en option) et l'impression des séances.
  chemins: { langue: '/vancouver/assets/langue.js', imprimer: '/vancouver/assets/imprimer-seance.js' },
  langueDefaut: 'en',
  mesure: 'https://dossierquebec.ca/commun/mesure.js',
  libelles: { libelleEn, themeEn, libelleFr, themeFr },
  regexMaire: /mayor/i,
  anglophone: true,
  date1er: true,
  textes: true,
  archives: true,
  fenetre: {
    points: ['points mis aux voix', 'motions put to a vote'],
    affichees: ['décision(s) affichée(s)', 'decision(s) shown'],
    seances: ['séances avec au moins un vote nominatif', 'meetings with at least one recorded vote'],
    point: ['point voté', 'points votés', 'motion', 'motions'],
  },
  vocabulaire: {
    lienSource: ['Donnée officielle — portail de la Ville ↗', 'Official record — City of Vancouver open data ↗'],
    titreFil: ['Là où le conseil s’est divisé', 'Where Council split'],
  },
  besoins: {
    accueil: ['decisions', 'votes', 'elus'],
    decisions: ['decisions', 'votes-decisions', 'votes'],
    votes: ['votes'],
    conseil: ['elus', 'votes', 'decisions'],
    lexique: ['lexique'],
    sources: ['decisions', 'votes', 'elus', 'seances', 'robots'],
  },
  // L'explication de chaque type de séance : en français d'après libelles-en.js, sinon celle des données.
  porteeDe: (instance, tr, etat, EN) => (EN ? null : INSTANCES_FR[instance]) ?? etat.decisions?.instances?.[instance] ?? null,
  // Sans résumé, le fil montre les points où le conseil s'est divisé, et ceux qu'il a rejetés.
  filSansResume: (d) => Boolean(d.dissidences?.length || d.resultat === 'Lost'),
  // Tout point est voté : le chiffre parlant, c'est le nombre de points avec au moins un vote contre.
  chiffreVotes: (etat, tr, nombreFr) => ({ n: nombreFr(etat.votes.votes.filter((v) => v.contre?.length).length), quoi: tr('points avec au moins un vote contre', 'motions with at least one vote against') }),
  compteElus: ({ n, maires, conseillers, p }, tr, dateFr) => tr(
    `${n} membres ont voté du ${dateFr(p.depuis)} au ${dateFr(p.jusqua)} : ${maires.length ? 'le maire ou la mairesse et ' : ''}${conseillers.length} conseillers et conseillères. Vancouver élit son conseil à l'échelle de la ville : ni districts ni quartiers.`,
    `${n} members voted between ${dateFr(p.depuis)} and ${dateFr(p.jusqua)}: ${maires.length ? 'the Mayor and ' : ''}${conseillers.length} Councillors. Vancouver elects its Council at large: no wards, no districts.`
  ),
  // Ce qui est chargé, c'est la fenêtre ; ce qui est disponible, le jeu complet de la Ville.
  lignesSources(ajouter, { etat, tr, nombreFr }) {
    ajouter(tr('Points mis aux voix (fenêtre)', 'Motions put to a vote (window)'), etat.decisions, etat.decisions ? `${nombreFr(etat.decisions.nombre)}` : '');
    ajouter(tr('Bulletins individuels (fenêtre / jeu complet)', 'Individual votes (window / whole data set)'), etat.votes, etat.votes ? `${nombreFr(etat.votes.votes.reduce((t, v) => t + (v.pour?.length ?? 0) + (v.contre?.length ?? 0) + (v.abstentions?.length ?? 0) + (v.absents?.length ?? 0) + (v.conflits?.length ?? 0) + (v.inadmissibles?.length ?? 0) + (v.sansVote?.length ?? 0), 0))} / ${etat.votes.totalDisponible != null ? nombreFr(etat.votes.totalDisponible) : '?'}` : '');
    ajouter(tr('Membres du conseil', 'Council members'), etat.elus, etat.elus ? `${etat.elus.nombre}` : '');
    ajouter(tr('Séances (déduites des votes)', 'Meetings (derived from the votes)'), etat.seances, etat.seances ? `${etat.seances.nombre}` : '');
  },
  // D'où viennent les lignes, et ce que le robots.txt du portail disait le jour de la lecture.
  noteSources(etat, tr, echapper) {
    const r = etat.robots;
    if (!r) return '';
    return `<p class="compte">${tr('Porte utilisée', 'Door used')}&nbsp;: ${echapper(r.porteUtilisee ?? '?')}. robots.txt ${tr('lu le', 'read on')} ${echapper((r.luLe ?? '').slice(0, 10))}&nbsp;: ${r.interditApi === true ? tr('« Disallow: /api/ » pour les robots génériques', '“Disallow: /api/” for generic robots') : r.interditApi === false ? tr('aucune interdiction sur /api/', 'no rule on /api/') : tr('non lu', 'not read')}.</p>`;
  },
  // En français : la ligne d'ordre du jour traduite par IA (scrapers/ia.js) ; l'anglais reste dans objetEn.
  async apresChargement({ etat, EN, charger }) {
    if (EN || !(etat.decisions || etat.votes)) return;
    const fr = (await charger('objets-fr'))?.objets ?? {};
    for (const d of [...(etat.decisions?.decisions ?? []), ...(etat.votes?.votes ?? [])]) {
      if (d.objet && fr[d.objet]) { d.objetEn = d.objet; d.objet = fr[d.objet]; }
    }
  },
};
