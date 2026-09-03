# dsh-client-ui-usage — Plugin d'analyse d'utilisation pour DeepSeek Harness

> 🌐 Languages: [中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md)

[![GitHub release](https://img.shields.io/github/v/release/woosh2010/dsh-usage-dashboard?label=release)](https://github.com/woosh2010/dsh-usage-dashboard/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/woosh2010/dsh-usage-dashboard?style=social)](https://github.com/woosh2010/dsh-usage-dashboard/stargazers)

![Démo](docs/demo.gif)


Ajoute, sous la zone de saisie de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web (`dsh web`), un **dock de facturation heures pleines / heures creuses** : cliquez pour déployer un **tableau de bord d'analyse d'utilisation** complet. Les données de token / coût / modèle / heures pleines-creuses sont automatiquement persistées à travers les sessions, avec filtres globaux et graphiques multidimensionnels.

![Tableau de bord d'analyse d'utilisation](docs/screenshots/dashboard.png)

> Remarque : les captures d'écran affichent l'interface en chinois.

## Fonctionnalités

- **Facturation différenciée heures pleines / heures creuses** : facturation selon les heures pleines (9h00–12h00 / 14h00–18h00, heure de Pékin) et les heures creuses (à moitié prix) ; le dock affiche en temps réel la tranche horaire actuelle, une barre de progression, le compte à rebours jusqu'au prochain changement de tarif, le coût cumulé de la session / du tour et le solde du compte (actualisation automatique toutes les 60 secondes, via le proxy officiel `/user/balance` ; la clé API ne sort jamais du navigateur).

  ![Dock replié](docs/screenshots/dock.png)

- **Historique persisté** : à chaque étape, les tokens / coûts / modèles / heures pleines-creuses sont automatiquement écrits dans `~/.dsh/storages/usage-history.jsonl`, conservés entre sessions et redémarrages (limite souple de 40 000 entrées, avec purge automatique des plus anciennes).
- **Filtres globaux** : options globales en haut du panneau, liées en temps réel à tous les graphiques et cartes de statistiques —
  - Période : aujourd'hui / 7 jours / 30 jours / 90 jours / tout
  - Étendue des sessions : toutes les sessions / cette session
  - Filtre de modèle : tous les modèles / un seul modèle
- **Cartes de statistiques** : coût (avec répartition pointe/creuse), tokens (avec entrée/sortie), tours (avec pointe/creuse), taux de succès du cache, économies en heures creuses, moyenne par étape.
- **Graphiques d'analyse** :
  - Courbe de tendance des coûts (survol pour voir le coût du jour et la répartition pointe/creuse)
  - Graphique en anneau de la structure des tokens (bascule « tous / par modèle »)
  - Graphique à barres de la répartition par modèle (nom complet du modèle + part de coût)
  - Comparaison heures pleines / heures creuses et économies en heures creuses
- **Enregistrements récents** : toutes les étapes des **20 derniers tours** (repliés par défaut, groupés par tour, titre du tour avec badge de modèle, heures pleines/creuses et coût, avec possibilité de tout déplier/replier et défilement dans la zone).

  ![Enregistrements récents](docs/screenshots/recent.png)

- **Fermeture par clic extérieur** : le panneau est rendu via un portal React ; cliquez n'importe où en dehors du panneau ou appuyez sur Échap pour le fermer.

## Prérequis

- profile `web` de DeepSeek Harness (dsh) `0.1.1-rc.1`
- L'affichage du solde nécessite d'avoir configuré une clé API DeepSeek dans la page des paramètres du modèle (sans configuration, le solde affiche « — », les autres fonctionnalités ne sont pas affectées)

## Installation

### Méthode 1 : installation en une commande (recommandé)

> **pnpm** est requis (`dsh plugin` transmet les arguments tels quels à pnpm, exécuté dans le répertoire du profile).
> S'il n'est pas installé : `corepack enable pnpm` (corepack est fourni avec Node) ou `npm install -g pnpm`.

Une seule commande pour installer directement le tarball du GitHub Release (testé et fonctionnel) :

```bash
dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
```

Le paquet déclare `dsh.bundle.patch` ; `dsh plugin` ajoute automatiquement `@deepseek-ai/dsh-client-ui-usage` à la liste `dsh.profile.bundles` du profile et le monte en tant qu'entrée `ui-usage`. Redémarrez ensuite `dsh web` et rafraîchissez le navigateur.

> **Migration depuis les méthodes 2/3** : supprimez d'abord la ligne `insert` `ui-usage` ajoutée manuellement dans `~/.dsh/profiles/web/cordis.patch.yml`, sinon l'id de l'entrée du bundle patch entrera en conflit avec celui de l'insert manuel.

### Méthode 2 : télécharger puis installer (hors ligne / intranet)

1. Téléchargez le paquet d'installation (le tgz dans [Releases](https://github.com/woosh2010/dsh-usage-dashboard/releases), ou `curl -LO <l'URL ci-dessus>` ; vous pouvez aussi faire `git clone` puis `npm pack` pour le construire vous-même).
2. Exécutez la commande dans le répertoire contenant le tgz (attention au `./` ou au chemin absolu avant le nom de fichier : écrire le nom de fichier seul sera interprété par pnpm comme un nom de paquet npm) :

   ```bash
   dsh plugin --profile web add ./deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

### Méthode 3 : installation manuelle

1. Décompressez le tarball vers le chemin résolu du profile :

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   tar -xzf deepseek-ai-dsh-client-ui-usage-0.4.0.tgz --strip-components=1 \
     -C ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   ```

2. Ajoutez une entrée dans `~/.dsh/profiles/web/cordis.patch.yml` :

   ```yaml
   - insert:
       - id: ui-usage
         name: '@deepseek-ai/dsh-client-ui-usage'
   ```

3. Redémarrez `dsh web` et rafraîchissez le navigateur.

> Utilisation directe depuis le répertoire source : `lib/client.js` est lu directement par le serveur, les modifications côté client prennent effet après un rafraîchissement du navigateur ; les modifications de `lib/index.js` (routage/stockage côté hôte) nécessitent de redémarrer `dsh web`.

## Questions fréquentes (dépannage)

### `dsh web` ne démarre pas avec l'erreur « declares no dsh.bundle » après mise à jour/installation

**Symptôme** : au redémarrage, `dsh web` échoue avec :

```
profile bundle "@deepseek-ai/dsh-client-ui-usage" declares no dsh.bundle in its package.json
```

**Causes** (par fréquence) :

1. **Une ancienne installation 0.1.x (déclarant uniquement `dsh.client`, sans `dsh.bundle`) masque la nouvelle version.**
   La v0.4.0 déclare `dsh.bundle.patch`, donc son enregistrement dans `bundles` est parfaitement valide.
   Mais lorsque dsh résout le paquet depuis le répertoire du profil, un **lien symbolique** dans
   `~/.dsh/profiles/web/node_modules/@deepseek-ai/` (pointant vers une vieille copie des sources dans `web/packages/`)
   a priorité sur les nouveaux fichiers dans `~/.dsh/profiles/node_modules/@deepseek-ai/` (le scope partagé) ;
   la validation lit donc l'ancien package.json et signale `declares no dsh.bundle`.
   Fréquent lors d'une mise à jour depuis une ancienne installation manuelle qui copiait les sources dans `web/packages/`.
2. **Le nom du paquet a été ajouté à la main à `dsh.profile.bundles`** (édition manuelle du package.json
   du profil, résolvant vers une version sans déclaration `dsh.bundle`). L'enregistrement des bundles doit
   être laissé à `dsh plugin add` — ne le modifiez pas à la main.

**Corrections** :

1. Supprimez les restes anciens : supprimez ou remplacez `~/.dsh/profiles/web/packages/dsh-client-ui-usage`
   et son lien symbolique sous `~/.dsh/profiles/web/node_modules/@deepseek-ai/`, afin que tous les chemins
   de résolution aboutissent à la v0.4.0 (qui déclare `dsh.bundle`).
2. Réinstallez avec la commande officielle (elle réconcilie l'enregistrement des bundles et les dépendances) :

   ```bash
   dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

3. Si vous aviez monté le paquet via un `insert` écrit à la main dans le `cordis.patch.yml` du profil,
   ne gardez **qu'un seul** des deux mécanismes (privilégiez l'enregistrement officiel des bundles et
   supprimez l'insert manuel) pour éviter les conflits de double montage.
4. Redémarrez `dsh web` et faites un rechargement forcé du navigateur.

> S'applique aussi lors d'un changement de machine : les scripts d'aide qui installent d'anciennes
> sources dans `web/packages/` (p. ex. via des liens symboliques) doivent être nettoyés avant de mettre à
> jour ce plugin, sinon ils déclenchent le problème de masquage de résolution décrit ci-dessus.

### Auto-vérification rapide pour d'autres problèmes d'installation

Simule localement la validation des `bundles` au démarrage (vérifie que chaque bundle déclare
`dsh.bundle` et qu'aucun paquet client-seul ne s'est glissé dans `bundles`) :

```bash
node -e '
const fs=require("fs"),path=require("path");
const D=path.join(process.env.HOME,".dsh/profiles/web");
const j=JSON.parse(fs.readFileSync(path.join(D,"package.json"),"utf8"));
let ok=true;
for(const n of j.dsh.profile.bundles){
  const m=JSON.parse(fs.readFileSync(require.resolve(n+"/package.json",{paths:[D]}),"utf8"));
  const has=!!(m.dsh&&m.dsh.bundle);
  console.log((has?"✓":"✗")+" "+n+" "+m.version); if(!has)ok=false;
}
const bad=["@deepseek-ai/dsh-client-ui-usage","@deepseek-ai/dsh-client-ui-gitpush"]
  .filter(n=>j.dsh.profile.bundles.includes(n));
if(bad.length)console.log("✗ paquet client-seul dans bundles :",bad),ok=false;
console.log(ok?"✅ Vérification réussie":"❌ Vérification échouée"); process.exit(ok?0:1);
'
```

## Vérification

Après le déploiement, exécutez :

```bash
node verify.mjs          # défaut http://127.0.0.1:3080 ; vous pouvez passer un argument baseUrl
```

Le script vérifie : la concordance entre le fichier client distribué et le fichier déployé, `modelsAll` et la structure des tokens par modèle, le filtrage session/modèle, les 20 derniers tours, et que la somme des mix de chaque modèle est égale au total.

## Données et facturation

- **Stockage de l'historique** : `~/.dsh/storages/usage-history.jsonl`, limite souple de 40 000 entrées avec purge automatique des plus anciennes ; les enregistrements dont le modèle est inconnu sont automatiquement corrigés (re-facturés) une fois le cache de projection disponible.
- **Barème des prix** : la `PRICE_TABLE` intégrée à `lib/client.js` et `lib/index.js` (yuans par million de tokens, deux tranches pointe/creuse ; les lectures en cache sont facturées au prix du cache, les écritures au prix d'entrée). Après un changement de tarif DeepSeek, il suffit de mettre à jour ces deux emplacements.
- **Économies en heures creuses** : les heures creuses sont facturées à moitié prix par rapport aux heures pleines, `économies en heures creuses = coût cumulé en heures creuses`.

## Régénérer les captures d'écran

Les captures d'écran dans `docs/screenshots/` proviennent d'un `dsh web` réellement en cours d'exécution (les montants du solde ont été masqués). Pour les régénérer :

```bash
# 1. Démarrer Chrome headless (port de débogage 9222)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-shot-profile --window-size=1440,900 about:blank

# 2. Capturer (DSH_CONV permet de définir le nom de session dans la barre latérale)
node scripts/screenshots.mjs dock
node scripts/screenshots.mjs dashboard
node scripts/screenshots.mjs recent
```

## Historique des versions

- **0.4.0** : filtres globaux (période sur 5 niveaux / toutes les sessions · cette session / filtre de modèle), bascule de la structure des tokens par modèle, nom complet dans la répartition par modèle, 20 derniers tours (paramètre `turns`), sous-informations des cartes de statistiques et mise en page plus compacte, fermeture par clic extérieur (portal + masque), enregistrements récents repliés par défaut.
- **0.3.3 / 0.1.0** : dock initial de facturation heures pleines / heures creuses, proxy du solde de compte, historique JSONL et graphiques agrégés.

## Licence

[MIT](LICENSE)
