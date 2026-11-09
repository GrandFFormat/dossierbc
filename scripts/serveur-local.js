// Serveur local de DossierBC, pour regarder le site avant de le mettre en ligne.
//
// Pourquoi ce fichier en plus de scripts/static-server.js : celui-ci sert ce qu'il trouve dans le
// dossier COURANT (process.cwd()). Lancé depuis un autre dossier — c'est le cas quand la
// configuration de lancement vit ailleurs — il servirait le mauvais site. Ici, on se place
// d'abord à la racine du projet, déduite de l'emplacement de ce fichier, puis on laisse
// static-server.js faire son travail.
//
// En module ES, __dirname n'existe pas : la racine se tire de import.meta.url.

import { chdir, env } from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '..');
chdir(racine);

/** Un port libre : 8125 par défaut, puis les suivants. Les autres sites de la famille tournent
 *  souvent en même temps (DossierQuébec sur 8080, le N.-B. sur 8123) et se disputeraient le port. */
const libre = (port) => new Promise((ok) => {
  const s = createServer();
  s.once('error', () => ok(false));
  s.once('listening', () => s.close(() => ok(true)));
  s.listen(port, '0.0.0.0');
});

let port = Number(env.PORT) || 8125;
for (let essai = 0; essai < 20 && !(await libre(port)); essai++) port++;
env.PORT = String(port);

console.log(`DossierBC : racine ${racine}`);
await import('./static-server.js');
