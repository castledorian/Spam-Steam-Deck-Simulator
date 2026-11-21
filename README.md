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

Le moteur affiche son taux de couverture des effets. Dans la version 1.30, 18 types d'effets rares
(environ 27 occurrences sur 151 cartes : vol de PV max, changement d'élément, destruction…) ne sont pas
encore simulés. Les prix de certains Tox, comme les Cœurs, sont estimés car le SpamDex ne les publie pas.

Données et illustrations : © leurs auteurs, via le SpamDex officiel. Conditions d'utilisation :
https://spamgame.com/conditions-donnees-cartes
