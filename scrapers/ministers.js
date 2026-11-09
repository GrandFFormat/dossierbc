// Scraper — le conseil des ministres de la Colombie-Britannique, au format de DossierQuébec
// (name, role, roleEn, party, assnatId).
//
// Source : l'API de l'Assemblée (api.lims.leg.bc.ca/graphql), rôles de type « Executive Council ».
// Les titres sont ceux que l'Assemblée publie, en anglais seulement : la Colombie-Britannique ne
// publie pas de version française. Le champ français (role) porte donc le titre anglais, et la
// page le dit — on ne traduit pas un titre officiel de notre propre chef.
//
// Pièges réglés ici :
//   1. LA DISSOLUTION ÉTEINT LES RÔLES. Quand une législature se termine, l'API passe tous ses
//      rôles à active: false. On lit donc les rôles sans filtrer sur « actif » et on écrit
//      auDissolution: true : ce qu'on montre est le conseil des ministres tel qu'il était à la
//      dissolution, et la page l'écrit.
//   2. UNE PERSONNE, PLUSIEURS TITRES. Niki Sharma était à la fois procureure générale et
//      vice-première ministre. Les titres d'une même personne sont réunis par « · », comme sur
//      DossierQuébec, dans l'ordre où l'API les donne.
//   3. LA PERSONNE DOIT ÊTRE DANS LA LISTE DES DÉPUTÉ·E·S. Sinon on garde le ministère et on le
//      signale, plutôt que d'inventer un rapprochement.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { graphql, legislatures, PARTIS, API } from './bc-commun.js';

const OUT_PATH = 'data/ministers.json';

const REQUETE = `query($p: Int!) {
  allMemberParliaments(
    condition: { parliamentId: $p }
    filter: { memberRolesByMemberParliamentId: { some: { roleByRoleId: { typeId: { in: [1] } } } } }
  ) {
    nodes {
      isHonourable
      partyByPartyId { abbreviation }
      memberByMemberId { id firstName lastName }
      memberRolesByMemberParliamentId(filter: { roleByRoleId: { typeId: { in: [1] } } }) {
        nodes { active startDate endDate roleByRoleId { title } }
      }
    }
  }
}`;

/** Le premier ministre d'abord, puis l'ordre alphabétique : l'API ne donne pas de préséance. */
function rang(titres) {
  return /\bPremier\b/i.test(titres) ? 0 : 1;
}

async function main() {
  const { encours, avecDonnees } = await legislatures();
  const leg = avecDonnees;
  const auDissolution = Boolean(leg.fin);

  const data = await graphql(REQUETE, { p: leg.id });
  const noeuds = data.allMemberParliaments?.nodes ?? [];
  if (!noeuds.length) {
    console.error(`ministers.js : aucun rôle du conseil des ministres lu pour la ${leg.numero}e législature — rien n'est écrit`);
    process.exitCode = 1;
    return;
  }

  const deputes = existsSync('data/deputes.json')
    ? JSON.parse(readFileSync('data/deputes.json', 'utf-8')).deputes ?? []
    : [];
  const deputeParId = new Map(deputes.map((d) => [Number(d.assnatId), d]));

  const inconnus = [...new Set(noeuds.map((n) => n.partyByPartyId?.abbreviation).filter((p) => p && !PARTIS[p]))];
  if (inconnus.length) {
    console.error(`ministers.js : parti inconnu (${inconnus.join(', ')}) — à ajouter dans bc-commun.js, rien n'est écrit`);
    process.exitCode = 1;
    return;
  }

  const horsListe = [];
  const ministers = noeuds.map((n) => {
    const m = n.memberByMemberId;
    const roles = (n.memberRolesByMemberParliamentId?.nodes ?? [])
      .filter((r) => r.roleByRoleId?.title);
    // Un remaniement laisse l'ancien titre dans l'API, souvent SANS date de fin : c'est le drapeau
    // « active » qui dit lequel était tenu en dernier (vérifié le 8 nov. 2026 : Brenda Bailey garde
    // un « Minister of Finance » inactif de 2024 à côté de son poste de 2026). On s'en sert, et on
    // écarte en plus tout rôle qui porte une date de fin.
    const tenus = roles.filter((r) => r.active && !r.endDate);
    const titres = [...new Set((tenus.length ? tenus : roles).map((r) => r.roleByRoleId.title))];
    const depute = deputeParId.get(Number(m.id));
    if (!depute) horsListe.push(`${m.firstName} ${m.lastName}`);
    return {
      name: `${m.firstName} ${m.lastName}`,
      role: titres.join(' · '),
      roleEn: titres.join(' · '),
      roleOfficielEn: true,          // le titre est celui de l'Assemblée, en anglais
      party: n.partyByPartyId?.abbreviation ? PARTIS[n.partyByPartyId.abbreviation].code : null,
      assnatId: Number(m.id),
      riding: depute?.riding ?? null,
      honorable: Boolean(n.isHonourable),
      depuis: tenus.map((r) => r.startDate).filter(Boolean).sort()[0] ?? null,
    };
  }).filter((x) => x.role)
    .sort((a, b) => rang(a.role) - rang(b.role) || a.name.localeCompare(b.name, 'en'));

  writeFileSync(OUT_PATH, JSON.stringify({
    source: `${API}/graphql`,
    scrapedAt: new Date().toISOString(),
    legislature: leg.numero,
    auDissolution,
    legislatureEnCours: encours.numero,
    avis: auDissolution
      ? `Conseil des ministres tel qu'il était à la fin de la ${leg.numero}e législature (${leg.fin}). L'Assemblée n'a pas encore publié celui de la ${encours.numero}e.`
      : null,
    avisTitres: "Les titres sont ceux que publie l'Assemblée, en anglais seulement : la Colombie-Britannique n'en publie pas de version française.",
    count: ministers.length,
    ministers,
  }, null, 2) + '\n');

  console.log(`${ministers.length} ministres écrit·e·s dans ${OUT_PATH} (${leg.numero}e législature${auDissolution ? ', à la dissolution' : ''})`);
  const pm = ministers[0];
  if (pm) console.log(`  en tête : ${pm.name} — ${pm.role}`);
  if (horsListe.length) console.log(`  ⚠ hors de la liste des député·e·s : ${horsListe.join(', ')}`);
}

main().catch((err) => {
  console.error('Échec du scraper ministers.js :', err.message);
  process.exitCode = 1;
});
