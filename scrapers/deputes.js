// Scraper — les député·e·s de l'Assemblée législative de la Colombie-Britannique, au format de
// DossierQuébec (name, riding, region, party, partyFull, assnatId).
//
// Source : l'API de l'Assemblée (api.lims.leg.bc.ca/graphql), celle qui alimente ses propres
// pages. Un seul appel donne les membres de la législature, leur circonscription, leur parti,
// leur courriel législatif et leurs années d'élection.
//
// Écrit trois fichiers :
//   - data/deputes.json          : la liste, au format de DossierQuébec ;
//   - data/deputes-contacts.json : les courriels (le bouton ✉ de la case des votes) ;
//   - data/mandats.json          : le nombre de mandats, compté sur electionYears de l'API.
//
// Pièges de la Colombie-Britannique, réglés ici :
//   1. L'ÉLECTION VIDE LA LISTE. L'API ouvre la nouvelle législature le soir du scrutin, mais sans
//      député·e·s tant que la Chambre ne s'est pas réunie (c'était le cas le 8 novembre 2026 : la
//      44e était ouverte depuis le 26 octobre, avec zéro membre). On travaille alors sur la
//      dernière législature qui a des données, et le fichier dit laquelle et pourquoi.
//   2. L'API N'A PAS D'HISTORIQUE DE PARTI. Elle donne un seul parti par personne et par
//      législature, et elle le RÉÉCRIT quand quelqu'un change de camp : la 43e affichait
//      25 conservateur·rice·s et 17 indépendant·e·s le 19 septembre 2026, puis 29 et 13 le
//      8 novembre, pour les mêmes élu·e·s. C'est un instantané, pas un historique. D'où
//      data/partis-historique.json : chaque passage écrit la date et l'étiquette du jour, et ce
//      fichier n'est jamais réécrit, seulement complété. (À ne pas confondre avec
//      data/elus-historique.json, écrit par build-frontend-data.js, qui garde les NOMS.)
//   3. CENTREBC ET ONEBC N'EXISTENT PAS pour l'Assemblée : elle range ces député·e·s parmi les
//      indépendant·e·s. Le site affiche l'étiquette de l'Assemblée et l'explique sur la page.
//   4. PAS DE PHOTO. L'API en publie, mais l'avis de droit d'auteur de l'Assemblée interdit toute
//      reproduction hors usage personnel sans le consentement écrit du président. Le champ reste
//      null et la page dit pourquoi.
//   5. PAS D'ADRESSE PAR PERSONNE. L'Assemblée ne donne pas de page publique stable à chaque
//      député·e (sa fiche vit dans une application en cadre, marquée « noindex »). On renvoie donc
//      au répertoire officiel, qui est une vraie page.
//
// La région : l'Assemblée n'en publie pas. Le champ reste null plutôt que deviné.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { graphql, legislatures, PARTIS, HOTE } from './bc-commun.js';

const OUT_PATH = 'data/deputes.json';
const OUT_CONTACTS = 'data/deputes-contacts.json';
const OUT_MANDATS = 'data/mandats.json';
const OUT_HISTORIQUE = 'data/partis-historique.json';
const REPERTOIRE = `${HOTE}/members/find-mla-by-constituency`;

const REQUETE = `query($p: Int!) {
  allMemberParliaments(condition: { active: true, parliamentId: $p }) {
    totalCount
    nodes {
      id
      isHonourable
      constituencyByConstituencyId { name }
      partyByPartyId { abbreviation }
      memberByMemberId { id firstName middleName lastName electionYears legislativeEmail govEmail }
      memberRolesByMemberParliamentId {
        nodes { active startDate endDate roleByRoleId { title typeId } }
      }
    }
  }
  allConstituencies(condition: { active: true }) { totalCount }
}`;

/**
 * Le rôle que la page connaît : la présidence ne vote pas, sauf pour départager.
 *
 * Deux libellés cohabitent dans l'API (« Speaker of the House » et « Speaker of the Legislative
 * Assembly »), et les rôles d'une législature terminée passent tous à active: false. On lit donc
 * les rôles sans filtrer sur « actif », et on garde l'état tel qu'il est.
 */
function roleDe(roles) {
  const actifs = roles.filter((r) => r.actif).map((r) => r.titre);
  if (actifs.some((t) => /^Speaker of the (House|Legislative Assembly)$/i.test(t))) return 'speaker';
  return null;
}

async function main() {
  const { encours, avecDonnees } = await legislatures();
  const leg = avecDonnees;
  if (encours.numero !== leg.numero) {
    console.log(`la ${encours.numero}e législature est ouverte depuis le ${encours.debut} mais l'Assemblée n'a encore publié aucun membre — on garde la ${leg.numero}e`);
  }

  const data = await graphql(REQUETE, { p: leg.id });
  const noeuds = data.allMemberParliaments?.nodes ?? [];
  const sieges = data.allConstituencies?.totalCount ?? 0;

  const erreurs = [];
  if (!noeuds.length) erreurs.push(`aucun membre lu pour la ${leg.numero}e législature`);
  if (!sieges) erreurs.push("l'API ne dit pas combien il y a de circonscriptions");
  const inconnus = [...new Set(noeuds.map((n) => n.partyByPartyId?.abbreviation).filter((p) => !PARTIS[p]))];
  if (inconnus.length) erreurs.push(`parti inconnu : ${inconnus.join(', ')} (à ajouter dans bc-commun.js)`);
  const sansCirco = noeuds.filter((n) => !n.constituencyByConstituencyId?.name).length;
  if (sansCirco) erreurs.push(`${sansCirco} membre(s) sans circonscription`);
  // Le total annoncé par l'API doit valoir ce qu'on a compté.
  if (data.allMemberParliaments.totalCount !== noeuds.length) {
    erreurs.push(`l'API annonce ${data.allMemberParliaments.totalCount} membres, j'en lis ${noeuds.length}`);
  }
  if (noeuds.length > sieges) erreurs.push(`${noeuds.length} membres pour ${sieges} sièges`);

  if (erreurs.length) {
    console.error("deputes.js : rien n'est écrit —");
    for (const e of erreurs) console.error(`  ✗ ${e}`);
    process.exitCode = 1;
    return;
  }

  const deputes = noeuds.map((n) => {
    const p = PARTIS[n.partyByPartyId.abbreviation];
    const m = n.memberByMemberId;
    const roles = (n.memberRolesByMemberParliamentId?.nodes ?? [])
      .filter((r) => r.roleByRoleId?.title)
      .map((r) => ({ titre: r.roleByRoleId.title, type: r.roleByRoleId.typeId, actif: Boolean(r.active), debut: r.startDate ?? null, fin: r.endDate ?? null }));
    const titres = [...new Set(roles.map((r) => r.titre))];
    const role = roleDe(roles);
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ');
    return {
      name,
      officiel: `${m.lastName}, ${m.firstName}`,
      prenom: m.firstName,
      nomFamille: m.lastName,
      riding: n.constituencyByConstituencyId.name,
      ridingEn: n.constituencyByConstituencyId.name,   // l'Assemblée ne publie qu'en anglais
      region: null,
      party: p.code,
      partyFull: p.en,
      partyFullFr: p.fr,
      partyFullEn: p.en,
      partiAssemblee: n.partyByPartyId.abbreviation,
      assnatId: m.id,
      honorable: Boolean(n.isHonourable),
      ...(role ? { role } : {}),
      titres,
      roles,
      email: m.legislativeEmail || m.govEmail || null,
      electionYears: m.electionYears || null,
      fiche: REPERTOIRE,
      photo: null,   // voir le piège n° 4 en tête de fichier
    };
  }).sort((a, b) => a.officiel.localeCompare(b.officiel, 'en'));

  const parParti = {};
  for (const d of deputes) parParti[d.partyFullEn] = (parParti[d.partyFullEn] || 0) + 1;

  writeFileSync(OUT_PATH, JSON.stringify({
    source: `${HOTE.replace('www.leg', 'api.lims.leg')}/graphql`,
    repertoire: REPERTOIRE,
    scrapedAt: new Date().toISOString(),
    legislature: leg.numero,
    legislatureEnCours: encours.numero,
    legislatureEnCoursDebut: encours.debut,
    legislatureEnCoursMembres: encours.membres,
    sieges,
    vacants: sieges - deputes.length,
    composition: parParti,
    avis: "Les étiquettes de parti sont celles de l'Assemblée, qui ne reconnaît que quatre partis : les député·e·s passés à un autre parti y figurent comme indépendant·e·s. L'Assemblée ne publie pas d'historique : cette liste est l'état du jour.",
    count: deputes.length,
    deputes,
  }, null, 2) + '\n');

  writeFileSync(OUT_CONTACTS, JSON.stringify({
    source: REPERTOIRE,
    scrapedAt: new Date().toISOString(),
    note: "Courriels législatifs publiés par l'Assemblée dans son API, pour que le public puisse écrire à ses élu·e·s.",
    count: deputes.filter((d) => d.email).length,
    contacts: deputes.map((d) => ({ name: d.name, email: d.email, fiche: d.fiche })),
  }, null, 2) + '\n');

  // Les mandats : comptés sur les années d'élection publiées par l'API (« 2020, 2024 » = 2).
  const mandats = {};
  for (const d of deputes) {
    const annees = String(d.electionYears || '').match(/\d{4}/g);
    if (annees?.length) mandats[d.assnatId] = annees.length;
  }
  writeFileSync(OUT_MANDATS, JSON.stringify({
    source: `${HOTE.replace('www.leg', 'api.lims.leg')}/graphql`,
    scrapedAt: new Date().toISOString(),
    note: "Nombre d'élections gagnées, compté sur le champ electionYears de l'API.",
    count: Object.keys(mandats).length,
    mandats,
  }, null, 2) + '\n');

  // L'historique que l'API ne garde pas : on ajoute, on ne réécrit jamais (piège n° 2).
  const histo = existsSync(OUT_HISTORIQUE)
    ? JSON.parse(readFileSync(OUT_HISTORIQUE, 'utf-8'))
    : { note: "Relevé maison : l'API de l'Assemblée réécrit le parti d'un·e député·e quand il change. Chaque passage ajoute une ligne, rien n'est jamais effacé.", releves: [] };
  const jour = new Date().toISOString().slice(0, 10);
  const etat = Object.fromEntries(deputes.map((d) => [d.assnatId, d.party]));
  const dernier = histo.releves[histo.releves.length - 1];
  if (!dernier || JSON.stringify(dernier.etat) !== JSON.stringify(etat)) {
    histo.releves.push({ le: jour, legislature: leg.numero, etat });
    writeFileSync(OUT_HISTORIQUE, JSON.stringify(histo, null, 2) + '\n');
    console.log(`  relevé des partis ajouté à ${OUT_HISTORIQUE} (${histo.releves.length} au total)`);
  }

  console.log(`${deputes.length} député·e·s écrit·e·s dans ${OUT_PATH} — ${Object.entries(parParti).map(([p, n]) => `${n} ${p}`).join(', ')}`);
  console.log(`  ${sieges} sièges, donc ${sieges - deputes.length} vacant(s) — calculé, pas annoncé par l'Assemblée`);
  const pres = deputes.find((d) => d.role === 'speaker');
  console.log(pres ? `  présidence : ${pres.name} (${pres.riding})` : "  ⚠ aucune présidence active lue dans l'API");
  const sansCourriel = deputes.filter((d) => !d.email);
  if (sansCourriel.length) console.log(`  ⚠ sans courriel : ${sansCourriel.map((d) => d.name).join(', ')}`);
}

main().catch((err) => {
  console.error('Échec du scraper deputes.js :', err.message);
  process.exitCode = 1;
});
