# SpamLab — simulateur de decks & base de données SPAM

Site de fan non officiel pour **SPAM** (Steam) : toutes les cartes en français, collection, simulateur de
decks avec statistiques de victoire, méta, Tox, talents et historique des patchs.

Les données viennent du **SpamDex officiel** publié par les développeurs (`https://spamgame.com/data/`) :
cartes, capacités, talents et passifs en français, avec des actions chiffrées que le moteur lit directement.

## Comment le site reste à jour

```
spamgame.com/data/index.json ──► nouvelle version ? ──► scripts/sync-data.mjs
                                                         ├─ public/data/dataset.json  (dernière version, FR)
                                                         ├─ public/data/patches.json  (différences entre toutes les versions)
                                                         └─ public/data/layout.json   (gabarit des cartes)
                                                        ──► contrôles ──► commit ──► build ──► GitHub Pages
```

- `.github/workflows/publier.yml` vérifie le SpamDex **toutes les heures**. Sans nouvelle version, rien n'est
  republié ; avec une nouvelle version, les données sont enregistrées dans le dépôt et le site est republié.
- Données anormales (moins de 50 cartes, chute du nombre de cartes, PV invalides, mauvaise langue…) :
  la publication s'arrête et la version en ligne reste en place.
- Dans le navigateur, le site interroge aussi le SpamDex directement : si une version plus récente vient de
  sortir, elle est utilisée tout de suite, sans attendre la publication suivante. Si le navigateur ne peut pas
  joindre le SpamDex, il utilise les données publiées avec le site.
- Pas de base de données ni de serveur : la collection et la méta calculée restent dans le navigateur.

## Mise en ligne sur GitHub Pages (une seule fois)

1. **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
2. Onglet **Actions** → « Publier le site » → **Run workflow**.
3. Le site est en ligne sur `https://<utilisateur>.github.io/<nom-du-dépôt>/`.

## En local

```bash
npm install
npm run sync     # récupère la dernière version officielle et l'historique des patchs
npm run dev      # http://localhost:3000
npm test         # contrôles des données et du calcul des patchs
npm run build    # site statique dans out/
```

## Fidélité du simulateur

Le moteur (`src/sim/engine.ts`) suit les textes officiels du SpamDex (capacités, Tox, talents, mots-clés)
et les règles publiées tirées du code de combat du jeu :

- dégâts = (jet + dégâts de base) × (1 + 0,1 × points d'élément) × critique × (1 + Berserk) × (1 − Bouclier) × (1 − résistance),
  résistances bornées à ±50 %, l'Éther les ignore ;
- revenus = numéro du tour + Spamtons des cartes, +50 par carte perdue, +10 en passant la boutique, relances 10/15/20 ;
- boutique les tours pairs, 3 offres, rareté selon la Chance (table du client) ; mort subite à partir du tour 20 ;
- **un seul talent actif par carte**, choisi par simulation ; les 82 talents sont traités un par un ;
- capacités de zone, « Choix » (une option, la meilleure), Gel, Éternité/Temporalité, effets sur coup critique,
  Précision appliquée à tous les effets de la compétence.

Interprétations (le texte officiel laisse une marge) : l'Immunité bloque les *effets* adverses mais pas les dégâts ;
les dégâts du dégel des capacités « Gel » valent 60 ; Fumée n'est pas simulée (effet non publié) ;
les dégâts bonus « selon les PV manquants » (2 cartes) ne sont pas comptés.

### Deux IA de jeu

- **IA experte** (`src/sim/search.ts`) : à chaque décision (ordre des capacités, cible, achat / relance / passer en
  boutique, option d'un « Choix »), chaque possibilité est jouée puis la partie est terminée des dizaines de fois avec
  des tirages différents (les mêmes pour toutes les options). La position est reconstruite exactement en rejouant la
  partie depuis le début avec la même « bande » de tirages aléatoires. C'est lent (≈ 1 s par partie) : elle sert à
  l'analyse de partie et au classement « IA experte » des meilleurs decks, calculé sur le serveur.
- **IA rapide** (`DEFAULT_AI` dans `src/sim/engine.ts`) : utilisée pour les millions de parties des tournois. Ses
  choix de cible et de boutique sont des **modèles appris** sur les décisions de l'IA experte (régression logistique
  par paires sur des milliers de positions), puis ses réglages sont ajustés par auto-apprentissage (parties contre
  elle-même, tirages communs). Chaque amélioration n'est gardée que si elle gagne nettement plus de parties.

### Laboratoire (calculs sur le serveur)

`scripts/lab/run.ts`, lancé par le workflow « Laboratoire » après chaque patch, calcule sur les machines de GitHub :
la méta de référence (plusieurs millions de parties), le classement « IA experte » des meilleurs decks et l'impact
mesuré de chaque Tox (offert tôt ou tard), carte (valeur de remplacement dans la méta), talent, capacité (partie jouée
sans elle) et point d'élément. Résultat : `public/data/lab.json`, affiché par les pages Méta, Impact et Cartes.

Vérifications automatiques : `npm test` (données, historique des patchs) et `npm run test:engine`
(3 000 parties aléatoires sans erreur, reproductibilité, zones, Choix, talent unique, Immunité, Gel, rejeu exact de l'IA experte).

### Recherche du meilleur deck

1. toutes les combinaisons de 4 cartes sont notées par un modèle statique ;
2. les meilleures jouent contre les decks de la méta (mêmes tirages aléatoires pour tous, pour comparer sans bruit) ;
3. **recherche locale** : chaque carte des meilleurs decks est remplacée tour à tour par les cartes les plus prometteuses ;
4. **choix des talents** par simulation, carte par carte ;
5. statistiques finales avec intervalle de confiance à 95 %.

Le niveau « Extrême » (10 à 20 minutes) joue environ un million de parties et donne une marge d'environ ±0,4 point.

Données et illustrations : © leurs auteurs, via le SpamDex officiel. Conditions d'utilisation :
https://spamgame.com/conditions-donnees-cartes
