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
les dégâts du dégel des capacités « Gel » valent 60 ; Bannissement : un seul par partie, pour toute la partie et pour les deux joueurs ; remplacement d'emplacement : emplacement vide, puis capacité inutilisable, puis amélioration du même Tox ou capacité la moins efficace (la capacité remplacée est perdue) ; Provocation : ciblage simple obligatoire, zone et cibles aléatoires l'ignorent ; Camouflage : seul le ciblage simple ne peut pas viser la carte ; Bouclier : réduit tout dégât (zone comprise) ; Poison : le plus fort pourcentage est gardé, les durées s'additionnent ; Métamorphe : tous les Tox achetés restent ; Avalement : l'IA sacrifie un allié bas en PV pour déclencher ses effets de mort ; dégâts bonus selon les PV manquants (Aleera, Rongeur Nuageux) : hypothèse de 50 % des PV manquants, valeur affichée à 0 dans les données ; Fumée : après une compétence de dégâts ou de soins, les 4 cartes du camp sont mélangées face cachée (position aléatoire) et ne se révèlent qu'en agissant ou en subissant un effet ; l'adversaire cible alors au hasard parmi elles (la valeur d'achat de l'IA pour ce Tox est une estimation) ;
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

### Règles de l'IA : scaling d'abord, emplacements

- **Ordre des capacités** : à chaque tour, l'IA lance d'abord ce qui monte la valeur élémentaire (scaling, qui renforce toutes les autres cartes), puis les capacités mixtes (scaling + dégâts), puis les utilitaires, enfin dégâts et soins.
- **Emplacements** : chaque carte a 3 emplacements partagés entre capacités et Tox. Un Tox acheté va dans un emplacement libre, sinon il **remplace** un autre Tox ou une capacité de la carte. L'IA compare la valeur du nouveau Tox à celle de ce qu'elle perd (une capacité à usage limité déjà utilisée, comme la Mue d'Épine Médusine, ne vaut plus rien ; le scaling et les dégâts sont rarement sacrifiés). Au Plateau, une carte pleine vous demande quoi remplacer. Les valeurs de remplacement sont des estimations, pas des règles publiées.

### Conseiller de deck

Le conseiller (`adviseDeck`, `src/sim/pool.ts`) joue votre deck de 4 cartes contre les meilleurs decks de la méta. Première passe : uniquement les cartes et **talents débloqués de votre collection** (remplacements d'une carte, choix des talents, talents à débloquer en montant une carte de niveau). Seconde passe, optionnelle : les cartes que vous ne possédez pas (niveau maximal supposé) qui amélioreraient le deck, à obtenir. Variantes et deck de départ partagent les mêmes tirages ; les meilleurs gains sont remesurés avec de nouveaux tirages et donnés avec un intervalle de confiance à 95 %.

### Plateau (match en direct)

La page **Plateau** rejoue une partie décision par décision. Le moteur étant déterministe, une partie est décrite par ses decks, sa graine, le premier joueur, le terrain et les choix du joueur humain : pour annuler ou rouvrir un lien partagé, on rejoue simplement la partie avec ces choix (`src/sim/play.ts`). Le moteur expose l'état complet du terrain à chaque ligne de journal (`Frame`) et à chaque décision (`Board`). En mode « je joue », le tour est libre comme dans SPAM : la boutique s'ouvre en premier (acheter un Tox, relancer, passer, bannir une famille pour la partie), puis capacités dans l'ordre voulu et fin de tour ; le bot, lui, joue boutique puis capacités et ne bannit pas (hypothèse : un bannissement par boutique, coût non publié). Les attaques à cible aléatoire du terrain (Danse des plumes) blessent aussi les cartes alliées ; chaque ligne « Applique Disparition » retire un passif (Malédiction aquatique en applique deux).

### Recherche du meilleur deck

1. toutes les combinaisons de 4 cartes sont notées par un modèle statique ;
2. les meilleures jouent contre les decks de la méta (mêmes tirages aléatoires pour tous, pour comparer sans bruit) ;
3. **recherche locale** : chaque carte des meilleurs decks est remplacée tour à tour par les cartes les plus prometteuses ;
4. **choix des talents** par simulation, carte par carte ;
5. statistiques finales avec intervalle de confiance à 95 %.

Le niveau « Extrême » (10 à 20 minutes) joue environ un million de parties et donne une marge d'environ ±0,4 point.

Données et illustrations : © leurs auteurs, via le SpamDex officiel. Conditions d'utilisation :
https://spamgame.com/conditions-donnees-cartes
