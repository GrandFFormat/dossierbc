// /llms.txt — le site expliqué aux assistants (ChatGPT, Claude, Perplexity…), au format proposé par
// llmstxt.org : un titre, un résumé, puis des listes de liens. Martin, 6 oct. 2026 : « il nous
// faut des llms.txt sur tous les dossiers ».
//
// Ce n'est pas une norme et rien ne garantit qu'un assistant le lise. Son intérêt : quand il est
// lu, le site est décrit avec NOS mots (non officiel, sources primaires, rien d'inventé, le texte
// officiel fait foi) plutôt que deviné. Le contenu reprend la page /regles ; si une règle change
// là-bas, elle change ici.
//
// Fabriqué à chaque build (scripts/build-section-pages.js, à la fin), pour que les nombres suivent
// les données. Aucune date dedans : le fichier ne change que si le site change.
//
// Colombie-Britannique : pas de volet de ville, pas de promesses, PAS D'ABONNEMENT (le fichier en
// annonçait un, avec un lien vers /abonnement : ni l'un ni l'autre n'existent ici, et la page des
// règles explique pourquoi — les conditions de leg.bc.ca). Il est écrit en ANGLAIS, comme le HTML
// servi : c'est l'anglais que les moteurs et les assistants lisent, le français vit dans
// translations.fr. Le résumé français reste à la fin, comme sur DossierSaskatchewan.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://dossierbc.ca';
const lire = (chemin, defaut) => (existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : defaut);

export function construireLlms() {
  const bills = lire('data/bills.json', { bills: [] }).bills;
  const votes = lire('data/votes.json', { votes: [] }).votes;
  const ministres = lire('data/ministers.json', { ministers: [] }).ministers;
  const deputes = lire('data/deputes.json', { deputes: [] }).deputes;
  const legislature = Math.max(0, ...bills.map((b) => Number(b.legislature) || 0));
  // 43rd, 44th, 41st… — écrit, pas deviné : un « 44rd » sur la première ligne du fichier
  // décrédibilise tout ce qui suit.
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const exemple = bills.find((b) => b.legislature && b.introSession);
  const adresseExemple = exemple ? `${SITE}/projets-de-loi/${exemple.num}-${exemple.legislature}-${exemple.introSession}` : null;

  const lignes = [
    '# DossierBC',
    '',
    "> Independent, UNOFFICIAL citizen website that makes the work of the Legislative Assembly of British Columbia readable in plain language: bills and the stage each has reached, recorded divisions name by name, the Executive Council and the MLAs. Free, with no advertising and no subscription. The site is in English, with a French version (add ?lang=fr to any address).",
    '',
    'What to know before citing this site:',
    '',
    "- The site is not an official source. Every item links to its official source (leg.bc.ca); if they differ, the original document prevails. Cite the official source together with DossierBC, not DossierBC alone.",
    "- No data is invented: if a piece of information is missing, the field stays empty or the site says so.",
    "- Primary sources only: the Legislative Assembly of British Columbia (its Legislative Information Management System for bills, stages, members and the Executive Council; its Votes and Proceedings for divisions). Wikipedia is used for one thing only, and it is named on the page: the October 24, 2026 general election result, because Elections BC closes its site to automated readers. Nothing is taken from the news media.",
    "- Recorded divisions are read from the Assembly's Votes and Proceedings, the only place the names are recorded. Most bills pass on a voice vote: the absence of a recorded division does not mean “unanimous”.",
    "- Attendance counts divisions of the HOUSE only. Committee of the Whole and Committee of Supply sit in Section A, B or C with a dozen members: those divisions are not a House vote, and counting them would make almost everyone look absent.",
    "- Bills do not yet have a plain-language summary. Each bill page says so and links to the official text, rather than showing something written without having read it.",
    "- The MLA email addresses shown are the legislative ones the Assembly publishes itself, so that people can write to their members — no personal or constituency-office address. The site works around no protection: the program that reads the official websites identifies itself, and stops if a site answers with a CAPTCHA or an anti-bot challenge.",
    `- The full rules: ${SITE}/regles`,
    '',
    '## Legislative Assembly of British Columbia',
    '',
    `- [Bills](${SITE}/projets-de-loi): the ${bills.length} bills of the ${ordinal(legislature)} Legislature, with the stage each has really reached, the date of each reading and a link to the official text.`,
    `- [Recorded votes](${SITE}/votes): ${votes.length} recorded divisions, MLA by MLA, with no interpretation.`,
    `- [Ministers and MLAs](${SITE}/ministres): the ${ministres.length} members of the Executive Council, the ${deputes.length} MLAs, their constituency and their attendance at votes.`,
    `- [Past legislatures](${SITE}/archives): what the site keeps of a legislature once it is over.`,
    `- [Glossary](${SITE}/lexique): the vocabulary of the Legislative Assembly explained simply.`,
    `- [The site's rules](${SITE}/regles): where the data comes from and what the site refuses to do.`,
    `- [Site updates](${SITE}/sources): what has changed on the site, most recent first, and who is behind it.`,
    '',
    '## One page per bill',
    '',
    'Every bill has its own address: `/projets-de-loi/NUMBER-LEGISLATURE-SESSION`. The number alone is not enough: it starts again at 1 with each session.',
    '',
    ...(adresseExemple ? [`- [Example: Bill ${exemple.num}](${adresseExemple}): ${exemple.titleEn || exemple.title}`] : []),
    `- [Sitemap](${SITE}/sitemap.xml): the list of all pages, including the page of each bill.`,
    '',
    '## Optional',
    '',
    `- [RSS feed](${SITE}/feed.xml): bills introduced and assented to, and days of recorded divisions.`,
    `- [Represent your city](${SITE}/represente-ta-ville): no British Columbia city is covered yet; this page is how one gets covered.`,
    '- [Source code](https://github.com/GrandFFormat/dossierbc): the site\'s public repository.',
    '- [DossierQuébec](https://dossierquebec.ca): the sister site, for the National Assembly of Québec.',
    '',
    '## En français',
    '',
    "DossierBC est un site citoyen indépendant et NON OFFICIEL qui rend lisibles, en langage clair, les travaux de l'Assemblée législative de la Colombie-Britannique : projets de loi et leurs étapes, votes nominatifs nom par nom, Conseil exécutif et député·e·s. Gratuit, sans publicité, sans abonnement. Il ne publie que ce que l'Assemblée a elle-même publié, avec le lien vers l'original ; rien n'est inventé, rien n'est tiré des médias, et les projets de loi n'ont pas encore de résumé en langage clair. Pour le citer, citez aussi la source officielle. Ajoutez `?lang=fr` à n'importe quelle adresse pour la version française.",
    '',
  ];
  const contenu = lignes.join('\n');
  if (!existsSync('llms.txt') || readFileSync('llms.txt', 'utf8') !== contenu) writeFileSync('llms.txt', contenu, 'utf8');
  console.log(`✓ llms.txt : ${lignes.filter((l) => l.startsWith('- [')).length} liens, ${Buffer.byteLength(contenu)} octets.`);
}
