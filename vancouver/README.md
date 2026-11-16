# DossierBC — volet Vancouver

Les votes du conseil municipal de **Vancouver**, membre par membre, à partir des données ouvertes de la
Ville. Même esprit que les volets Québec et Montréal de DossierQuébec : données publiques seulement,
aucune donnée inventée, aucun verdict sur de vraies personnes.

Ce n'est pas un site de la Ville de Vancouver et ça n'a aucun caractère officiel.

Ce volet a été construit le 15 novembre 2026 en suivant `REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`
(dépôt DossierQuébec, `quebec/`, version du 15 nov. 2026), avec une phrase en plus : « La ville,
c'est Vancouver. » Le modèle copié est Montréal (`montreal/`). Le présent README est le journal du
projet : ce qui a été trouvé, ce qui a été construit, ce qui reste à décider, et pourquoi.

> **État au 15 novembre 2026 — à lire en premier.** C'est une **maquette** (Martin : « on ne
> l'activera pas ; on va prendre les 2 derniers mois seulement ; c'est juste pour donner une idée de
> quoi ça peut avoir l'air »). Rien n'est commité, rien n'est publié, toutes les pages portent
> `noindex`. La fenêtre est **juin–juillet 2026**. Le code est complet ; les données se lisent par
> `npm run refresh`, lancé depuis le terminal de Martin (voir « Pourquoi Martin lance la lecture »).

## Démarrage

```bash
cd vancouver
npm run refresh          # lit la Ville : votes (juin–juillet 2026), contrats, budget, près de chez moi
npm run serve            # DossierBC au complet : http://localhost:8125/vancouver/
```

Aucune dépendance npm : Node seul, `fetch` et des expressions régulières. Aucune clé d'API : il n'y a
pas de résumé IA dans ce volet (voir « Ce que Vancouver ne publie pas »).

`npm run refresh` accepte `--depuis=AAAA-MM-JJ --jusqua=AAAA-MM-JJ` (la fenêtre des votes),
`--fichier=chemin.csv` (lire un export du portail plutôt que l'API) et `--sans-adresses` (ne pas
relire les 99 723 adresses quand l'index existe).

## Étape 1 — L'étude de faisabilité (section 3 du guide), avec chiffres

### Le gisement

Vancouver a **une** porte utile pour son conseil, et c'est une bonne porte : le portail de données
ouvertes `opendata.vancouver.ca` (Opendatasoft, API Explore v2.1). Le jeu **« Council voting
records »** contient chaque vote nominatif de chaque membre depuis le 5 avril 2016, saisi par le
système de vote électronique de la salle du conseil :

| | |
|---|---|
| Lignes (un membre × un point voté) | **83 824** au 11 nov. 2026 |
| Période | 2016-04-05 → 2026-10-27 |
| Rafraîchi par la Ville | toutes les deux semaines environ (dernier : 2026-11-11) |
| Champs | `meeting_id, meeting_type, vote_date, vote_number, agenda_description, vote_start_date_time, council_member, vote, decision, vote_detail_id` |
| Types de séance | Council, Regular Council, Special Council, Public Hearing, Policy & Strategic Priorities, City Finance & Services, Courts of Revision, Auditor General Committee |
| Valeurs de vote | In Favour, In Opposition, Abstain, Absent, **Declared Conflict**, Ineligible, No Vote |
| Résultats | Carried, Carried Unanimously, Lost |

Par année : 2024 **6 180** bulletins, 2025 **6 805**, 2026 **5 357** (jusqu'au 27 octobre).

**La fenêtre de la maquette.** Mesuré par mois en 2026 : mai 1 034, juin 671, juillet 1 133, août 22,
**septembre 0, octobre 11, novembre 0**. Élections municipales de la C.-B. le 17 octobre 2026 :
le conseil était en pause. « Les deux derniers mois » au sens strict n'auraient montré que onze
bulletins sur un seul point. On prend donc **juin et juillet 2026** : **15 séances** (6 Council,
6 Public Hearing, 1 Policy & Strategic Priorities, 1 Special Council, 1 City Finance & Services),
**164 points mis aux voix**, **1 804 bulletins**, **11 membres** (le maire et dix conseillers).
Bulletins : In Favour 1 372, In Opposition 228, Absent 167, Abstain 31, Ineligible 4,
Declared Conflict 2.

### Ce que Vancouver ne publie pas (et ce qu'on ne fabrique donc pas)

- **Le texte des décisions.** Le jeu donne la ligne d'ordre du jour du point (48 signes en moyenne,
  98 au plus), pas la motion, pas le rapport, pas le procès-verbal. Le jeu
  `council-meeting-minutes-archival` est **vide depuis 2014**. Il n'y a donc **aucun résumé IA** dans
  ce volet, et aucune dépense d'API : résumer « Cancellation of 2025 Tax Sale of 1208 West 10th
  Avenue » obligerait le modèle à inventer. Le fil d'accueil, qui ne montre que les décisions
  résumées à Montréal, montre ici les points où le conseil s'est divisé et ceux qu'il a rejetés.
- **Les districts.** Vancouver élit son conseil à l'échelle de la ville. Aucun jeu de districts de
  conseil au catalogue (200 jeux parcourus). Pas de carte, pas de « votre conseiller ».
- **Les élus en tant que tels.** Pas de jeu « liste des élus » : les onze membres se déduisent du jeu
  des votes (titre, initiale, nom de famille, tel que la Ville l'écrit : « Councillor P Fry »). Ni
  parti, ni coordonnées.
- **Le site vancouver.ca** refuse les robots (403 sur ses conditions d'utilisation, 9 nov. 2026).
  On ne le lit pas, et on ne contourne rien.

### Les conditions, lues mot pour mot

- **Licence** : *Open Government Licence – Vancouver*, version 1.0
  (<https://opendata.vancouver.ca/pages/licence/>, lue en entier le 15 nov. 2026, dans le navigateur :
  la page est rendue en JavaScript). « *The Information Provider grants you a worldwide, royalty-free,
  perpetual, non-exclusive licence to use the Information, including for commercial purposes* ».
  Conditions qui nous concernent : l'**attribution** — « *Contains information licensed under the
  Open Government Licence – Vancouver.* », en pied de chaque page — et le **non-endossement** (le site
  dit partout qu'il n'est pas celui de la Ville). Exemptions : renseignements personnels, logos et
  marques officielles.
- **La note de la Ville sur le jeu** : « *Please consult corresponding meeting minutes for official
  vote records.* » Reprise sur la page Sources. La définition du statut « No Vote » a changé le
  21 septembre 2021.
- **`robots.txt`** (<https://opendata.vancouver.ca/robots.txt>, 15 nov. 2026) : `Disallow: /api/`
  pour `User-agent: *`, et `Disallow: /explore/dataset/*/download`, `/api/explore/v2*/exports/`
  pour Googlebot. Ce fichier régit l'indexation par les moteurs ; l'API Explore est l'interface
  documentée du portail, faite pour les programmes, et la licence autorise l'usage. **Décision de
  Martin, 15 nov. 2026 : on lit l'API pour la maquette ; on demandera la permission à la Ville plus
  tard si on en a besoin** (brouillon : `courriel-greffe.md`). La ligne est notée dans `lib/van.js`,
  sur la page Sources et dans `data/robots.json`.

### Les autres jeux, pour les autres onglets (même portail, même licence)

| Onglet | Jeu | Lignes | Modifié |
|---|---|---|---|
| Contrats | `awarded-contracts` — une ligne par **soumission**, `awarded` Yes/No | 6 414 | 2026-07-23 (dernière attribution : 2025-12-23) |
| Budget | `2026-multi-year-capital-project-budget-requests-and-capital-expenditure-budget` | 630 | 2026-04-14 |
| Budget | `council-budget-and-expenses` | 27 | 2026-10-27 |
| Près de chez moi | `local-area-boundary` (22 quartiers officiels) | 22 | 2023-06-24 |
| Près de chez moi | `property-addresses` | 99 723 | 2026-11-09 |
| Près de chez moi | `issued-building-permits` | 52 672 | 2026-11-13 |
| Près de chez moi | `road-ahead-upcoming-projects` / `-projects-under-construction` / `-current-road-closures` | 199 / 68 / 23 | 2026-09-17 |

Pas au catalogue : les **taux de taxe foncière** et le **budget de fonctionnement** par service. La
page Budget est donc le budget d'**immobilisations** (ce que la Ville bâtit et achète) et le budget
des élus — pas un calculateur de taxes, qui aurait dû inventer le taux. Le jeu `property-tax-report`
(1,55 M de lignes, une par parcelle) existe ; trop lourd pour une maquette, noté pour plus tard.

### Conclusion

Faisable, avec un **vrai angle** : Vancouver est, des 24 villes de la C.-B. qu'on a regardées, la
seule qui publie ses votes nominatifs en données ouvertes, sous licence commerciale, sans permission
à demander. Et le jeu porte une donnée que Montréal n'a pas : **« Declared Conflict »** — qui s'est
retiré d'un vote pour conflit d'intérêts, sur dix ans. En échange : pas de texte, donc pas de résumé.

## Ce qui a été construit

### Les huit pages (anglais ; adresse = titre, guide section 8)

| Page | Contenu | Données |
|---|---|---|
| `index.html` | chiffres, « Where Council split » (points divisés ou rejetés), quoi couvre le site | decisions, votes, elus |
| `decisions-of-vancouver-city-council.html` | tous les points votés par séance, recherche (y compris par nom d'un membre), sujets, type de séance ; boîte « Recorded vote » au clic | decisions, votes-decisions, votes |
| `vancouver-city-council.html` | les onze membres avec leurs décomptes bruts ; tableau « votes contre, par membre » | elus, votes, decisions |
| `near-me-in-vancouver.html` | adresse → quartier, permis des 12 derniers mois, chantiers Road Ahead | adresses/, permis/, chantiers, quartiers |
| `contracts-of-the-city-of-vancouver.html` | contrats attribués, 15 plus gros fournisseurs, soumissionnaires et écart au gagnant | contrats-page, contrats-details |
| `vancouver-capital-budget.html` | budget d'immobilisations 2026 par catégorie, prévisions 2027–2030, budget des élus | budget |
| `vancouver-council-glossary.html` | 36 termes, définis par nous, comptés sur le corpus | lexique |
| `sources-of-the-vancouver-data.html` | provenance, licence, ce que le jeu ne contient pas, robots.txt, état des données | decisions, votes, elus, seances, robots |

**Près de chez moi, devenu le standard (15 nov. 2026)** : le rayon « − 1 km + », la carte Leaflet/OpenStreetMap
(points de la couleur des bulles) et la bulle-maison de `near-me-in-vancouver.html`, avec la position
(lat, lon) gardée dans `data/adresses/` par `scrapers/pres-de-chez-moi.js`, sont maintenant le standard de
toute ville. DossierQuébec les a repris dans `commun/pres-rayon.js` (Québec, Montréal) ; voir la section
« Près de chez moi » de `dossierquebec/quebec/REPRODUIRE-POUR-UNE-AUTRE-VILLE.md`.

**Filtres (15 nov. 2026), standard aussi** : « Filtres ▾ » (Routes, Permis, un type par bulle, tout actif
au départ) et « 🚧 Impact sur la circulation » (ici : les « road closures » seulement ; actif, il cache
les autres boutons). Même dessin que `commun/pres-rayon.js` de DossierQuébec.

### Ce qui est copié de Montréal, et ce qui change (voir l'en-tête de chaque fichier)

- `assets/style.css` : copié tel quel ; **trois jetons par thème** (accent → bleu héraldique de
  DossierBC `#1f4f8a`, vedette → or `#e3b528`) ; une classe ajoutée, `.puce.conflit`.
- `assets/app.js` : copié, **37 retouches** appliquées par un script à ancres exactes
  (`patch-vancouver.mjs`, dans le scratchpad de la session) : langue anglaise (`./langue.js`), pas de
  résumés, pas de couche abonnés, portée d'une décision = explication du type de séance, fiche d'élu =
  décomptes bruts, résultats « Carried / Carried Unanimously / Lost », boîte de vote avec abstentions,
  absences et conflits, adresses des pages.
- `assets/imprimer-seance.js` : copie de `commun/imprimer-seance.js` de DQ (autonome).
- `assets/langue.js`, `assets/libelles-en.js` : réécrits (anglais toujours ; rien à traduire).
- Les pages Contrats, Budget, Près de chez moi : la logique de Montréal, dans la page, adaptée aux jeux
  de Vancouver.

**Charte Dossier, section 5 :** les volets de ville parlent le langage de `quebec/assets/style.css`
(coins de 6 px, ombres douces), pas celui de `dq.css` — « à trancher un jour ». Ce volet suit le guide,
qui dit de copier le volet tel quel. Si Vancouver s'ouvre sous dossierbc.ca, c'est à trancher avant.

### Les scrapers (`lib/van.js` est le client ; une seconde entre deux requêtes, UA identifiable)

| Scraper | Lit | Écrit |
|---|---|---|
| `scrapers/votes.js` | `council-voting-records` (fenêtre), métadonnées, `robots.txt` — ou un export CSV (`--fichier`) | `votes.json`, `decisions.json`, `seances.json`, `elus.json`, `votes-decisions.json`, `robots.json` |
| `scrapers/lexique.js` | rien (fichiers locaux) | `lexique.json` |
| `scrapers/contrats.js` | `awarded-contracts`, 12 derniers mois **du jeu** (pas d'aujourd'hui : le jeu est en retard) | `contrats-page.json`, `contrats-details.json` |
| `scrapers/budget.js` | budget d'immobilisations 2026, budget des élus (colonnes découvertes à l'exécution) | `budget.json` |
| `scrapers/pres-de-chez-moi.js` | quartiers, adresses (**un** export CSV), permis (**un** export CSV, 12 derniers mois), Road Ahead | `quartiers.json`, `adresses/`, `permis/`, `chantiers.json` |

Une source, une lecture, cinq fichiers : à Montréal ce sont cinq scrapers parce que ce sont cinq
sources. Ici, découper ferait cinq fois les mêmes requêtes à la Ville.

Ce que ça coûte à la Ville, par passage : ~20 pages de 100 lignes pour les votes, ~7 pour les
contrats, ~7 pour le budget, 1 pour les quartiers, 3 pour Road Ahead, **2 exports** (adresses,
permis), plus les métadonnées — à une seconde d'écart. Ce que ça coûte en IA : **zéro**.

## Pourquoi Martin lance la lecture

Le garde-fou de Claude Code a refusé, trois fois, que la session elle-même exécute un script qui
lit `/api/` sur ce portail (motif : accès non autorisé — le `robots.txt`). Martin a tranché ; la
commande part donc de **son** terminal :

```powershell
cd C:\Users\pc\Documents\Dossier\dossierBC\vancouver; node scripts/refresh.js
```

(`npm run refresh` est bloqué par la politique d'exécution de PowerShell — `npm.ps1` est un script ;
`node` directement passe.) Puis `npm run serve` à la racine de DossierBC, et
<http://localhost:8125/vancouver/>.

### Première lecture complète — 15 novembre 2026

Lancée par Martin. Résultat : **15 séances, 164 points mis aux voix, 1 804 bulletins, 11 membres**,
60 points avec au moins un vote contre, 23 rejetés, 2 conflits d'intérêts déclarés. Sujets : zonage 73,
administration 21, logement et social 16, transport 12… (1 seul par défaut). Lexique : 35 termes, 10
sans occurrence sur la fenêtre. Contrats : 413 attributions sur 201 appels, 333,1 M$, 27 à soumission
unique (fenêtre 2024-12-23 → 2025-12-23). Budget : 630 projets, 894,0 M$ de dépenses 2026, 4 482,3 M$
de budgets ouverts, 13 catégories. Adresses : 98 509 placées (5 hors quartier), 24 fichiers. Permis :
2 028 gardés sur 4 151. Chantiers : 289 placés (68 en cours, 199 à venir, 23 fermetures).

Les huit pages ont été vérifiées dans le navigateur avec ces données ; aucune erreur de console autre
que les 404 attendus (`resumes-en.json`, `textes.json`, script Vercel en local).

**« In brief » en tête de Décisions** (ajouté le 15 nov. 2026, Martin : « dans décision ya pas le gros
recap ») : `assets/seances-en-bref.js`, le même grand encadré que `commun/seances-en-bref.js` de
Montréal, avec une carte par instance (sa dernière séance). Différence voulue : à Montréal la phrase est
écrite par IA d'après le procès-verbal ; ici la Ville ne publie aucun texte, donc la phrase est
**calculée** (motions, adoptées, rejetées, divisées, sujet dominant, conflits) et l'encadré le dit.
Trois points marquants (rejetés, puis divisés les plus serrés), les votes divisés avec barre, lien
« All its decisions » (`?instance=`) et lien vers le registre de la Ville. Huit lignes de la Ville
arrivent double-encodées (« â€“ ») : `votes.js` les répare à la lecture — relancer `node
scrapers/votes.js` puis `node scrapers/lexique.js` pour que les données locales en profitent.

## Ce qui n'est pas encore là, et ce qui reste à décider

**Décision de Martin, 15 nov. 2026** : Vancouver ira en ligne **déjà en pause**, comme Laval et
Longueuil (« c'est juste pour montrer »). Fait : `assets/avis-pause.js` (copie anglaise d'`avisPause`
de DQ `commun/navigation.js`) met la bande jaune « This section is currently inactive… Reactivate for
$150 → » en tête des huit pages et retire le bloc de courriels ; l'accueil a la bande « Your ad here »
et l'après-vente en mode pause (« Paused · Reactivate this city: $150 »). Les deux boutons pointent sur
le **même lien GoHighLevel que Laval** (« Réactivation d'une ville », `6af4eaec906a8b62055d5b71`) : un
vrai lien, rien de mort. Ce lien et son formulaire d'après-vente sont en français ; la ville se choisit
dans le formulaire — à vérifier que Vancouver y figure avant la mise en ligne. Les courriels, plus tard.

**Avis d'attente (15 nov. 2026)** : en tête de l'accueil et de Décisions, « Awaiting the City of
Vancouver's permission… » (FR et EN) — avec les procès-verbaux, chaque décision aurait son résumé et le
récap de séance expliquerait ce qui a été décidé. Martin envoie le courriel au greffe **le jour de la mise
en ligne** ; le brouillon (`courriel-greffe.md`) contient la demande d'accès aux procès-verbaux. Ce jour-là :
l'ajouter à RELANCES.md (Suz).

- **Publier ou non.** Rien n'est commité. Si oui : retirer `noindex` des huit pages, ajouter le volet
  à `.vercelignore` (`vancouver/lib`, `vancouver/scrapers`, `vancouver/scripts`, `vancouver/*.md`,
  `vancouver/package.json`), un lien dans le menu « Cities » de `gabarit.html`, une image de partage
  `og-vancouver.png`, l'entrée dans `data/journal.json`, le courriel au greffe (`courriel-greffe.md`),
  et la question de la charte (ci-dessus). Un workflow hebdomadaire — avec la question du robots.txt
  tranchée par écrit.
- **Le français — fait le 15 nov. 2026** (Martin : « oui fais-le »). Anglais par défaut, français en
  option, comme tout DossierBC : pastille FR / EN au bout des outils de l'en-tête, choix gardé dans
  `dvq:langue` (même clé que `commun/dq.js`), `?lang=fr` l'impose. Mécanique : `assets/langue.js` (le
  pendant inversé de `/commun/langue.js` de DQ : `data-fr="…"` sur le HTML, `tr(fr, en)` dans le JS,
  page cachée le temps de traduire par un petit script du `<head>`) ; `assets/libelles-en.js` donne les
  sujets, résultats et explications de séance en français ; le lexique a son fichier
  `data/lexique-fr.json`, écrit par `scrapers/lexique.js` depuis `lib/lexique-fr.js` (le terme reste en
  anglais, son équivalent suit). Ce qui reste en anglais, exprès : ce que la Ville écrit (lignes d'ordre
  du jour, noms des membres, types de séance, noms des catégories du budget et des fournisseurs). Les
  titres des membres sont neutres en français (« Maire ou mairesse », « Membre du conseil »).
- **Les résumés IA**, si la Ville publie un jour le texte de ses décisions : `scrapers/resumes.js` de
  Montréal se rebranche, avec les trois pièges de l'API notés le 13 nov. 2026 (mémoire du projet).
- **Le menu « Cities » de DossierBC** et la fiche de Vancouver sur `/represente-ta-ville` (où elle est
  en rouge alors qu'elle est la plus ouverte des 24 : à corriger, mémoire du projet).
- **Mon dossier, les courriels de ville, la commandite** (guide, section 9) : couche commune de DQ,
  pas de DossierBC ; à construire ou à brancher le jour où le volet s'ouvre. Depuis le 15 nov. 2026
  (Martin : « this is absent from the home page »), l'accueil montre les deux blocs **en aperçu** :
  « Your ad here » + après-vente (boutons désactivés, aucun lien de paiement — ceux de la famille sont
  dans `/commun/apres-vente.js` de DQ et n'existent pas pour Vancouver ; prix de la bannière non chiffré,
  c'est la grille de Mike) et « Vancouver emails » (`assets/courriels.css` copié de DQ, formulaire
  désactivé, aucun serveur derrière). Chaque bloc dit « Preview — not open for Vancouver ». Le
  « Share / Copy » des fiches n'apparaît pas : chez Montréal il n'existe que sur les fiches résumées par IA.

## Pièges rencontrés en construisant

- **`remplacerBloc` et son marqueur de fin** : en remplaçant le bloc « abonnés » de `carteDecision`,
  le marqueur de fin (le `return` d'origine) a été gardé en plus du nouveau — une ligne orpheline, un
  `SyntaxError`. Vérifier avec `node --check` après tout patch programmatique.
- **La date la plus récente d'un gros jeu** : la demander en agrégat (`select=max(issuedate)`), jamais
  en paginant le jeu trié (527 requêtes pour une date).
- **Les colonnes au nom daté** (`2026_new_multi_year_capital_…`) : reconnaître par famille, afficher
  ce qu'on a pris, avertir si rien ne colle.
- **Les deux derniers mois** peuvent être vides : regarder la distribution par mois avant de fixer une
  fenêtre.
- **`order_by` sur un champ géographique** (`geom`) : l'API répond 400. Départager sur le premier
  champ ordinaire (`pres-de-chez-moi.js`, chantiers Road Ahead).
- **Le jeu « Council budget and expenses »** ne contient aucun chiffre : une ligne par année avec les
  liens vers un fichier Excel et un CSV. La page Budget le montre comme tel (année, contenu, liens,
  note de la Ville), sans lire les fichiers.
- **Les pages Opendatasoft rendues en JavaScript** (`/pages/licence/`) : `curl` n'en voit que le
  squelette ; la lire dans un navigateur.

## Structure

```
vancouver/
  index.html, decisions-of-…, vancouver-city-council.html, near-me-in-vancouver.html,
  contracts-of-the-city-of-vancouver.html, vancouver-capital-budget.html,
  vancouver-council-glossary.html, sources-of-the-vancouver-data.html
  assets/   style.css, app.js, langue.js, libelles-en.js, imprimer-seance.js
  lib/      van.js (client), themes.js (sujets), csv.js, geo.js
  scrapers/ votes.js, lexique.js, contrats.js, budget.js, pres-de-chez-moi.js
  scripts/  refresh.js
  data/     écrit par les scrapers (+ robots.json)
  courriel-greffe.md, README.md, package.json
```
