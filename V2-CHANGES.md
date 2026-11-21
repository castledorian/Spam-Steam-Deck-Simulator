# SPAM Simulator V2 — changements et limites

Cette passe améliore la robustesse technique et la transparence des résultats. Elle ne constitue pas une preuve que toutes les règles du jeu sont reproduites à l'identique.

## Modifications

- Le choix de cible estime désormais les dégâts avec la croissance accumulée (`grow[abilityIndex]`), les chances de critique, les résistances et le bouclier. Les dégâts de type aléatoire sont moyennés sur les six éléments. Cette estimation reste une heuristique de ciblage, pas le résolveur exact d'un combat.
- Le coût en HP passe par `hurt()` au lieu de modifier directement les HP.
- Les intervalles de score victoire/nul/défaite utilisent une borne empirique de Bernstein pour une variable bornée dans [0,1]. Wilson reste disponible uniquement pour des résultats binaires.
- Les decks comparés dans une même phase de recherche partagent une graine initiale (common random numbers). Les phases finales gardent des graines différentes de celles de la sélection.
- Les capacités `Choice` sont encore parsées sur leur première branche à titre expérimental, mais sont explicitement marquées comme non entièrement modélisées.
- Les résultats exposent `experimental` et `validationWarnings`. L'absence d'avertissement n'est pas une certification de parité avec le jeu.
- Les Web Workers propagent les erreurs, rejettent les travaux en attente et gèrent les annulations.
- Le cache est versionné et sa clé dépend du contenu complet des données de jeu (cartes, Tox, talents et patchs).
- La synchronisation échoue si une carte annoncée ne peut pas être récupérée, ou si les slugs sont dupliqués. Le snapshot précédent reste conservé car l'insertion n'a lieu qu'après validation.
- `POST /api/sync` nécessite `Authorization: Bearer <SPAM_SYNC_SECRET>`. La variable doit contenir au moins 32 caractères. Voir `.env.example`.
- Le health check vérifie également le snapshot et sa structure.
- Tests unitaires ajoutés pour la détection Choice et les intervalles statistiques.

## Configuration

1. Copier `.env.example` vers `.env.local` (ou configurer la variable dans l'environnement de déploiement).
2. Définir `SPAM_SYNC_SECRET` avec au moins 32 caractères aléatoires.
3. Installer les dépendances avec `npm install`.
4. Exécuter `npm run typecheck`, `npm run lint` et `npm test`.

Pour déclencher une synchronisation manuellement :

```bash
curl -X POST http://localhost:3000/api/sync \\
  -H "Authorization: Bearer $SPAM_SYNC_SECRET"
```

## Limites restant à lever avant toute affirmation de fidélité au jeu

- Les alternatives Choice ne sont pas encore simulées comme des branches distinctes.
- Les effets de cartes et talents qui ne sont pas représentés dans `AbilitySim` / `Talent` doivent être inventoriés et implémentés.
- Les règles exactes de paiement HP, de déclenchement des passifs, d'ordre des événements, de cooldown et de ciblage doivent être comparées à des combats réels.
- Le choix de cible reste une heuristique, pas une reproduction de l'IA officielle.
- L'intervalle empirique de Bernstein suppose des observations indépendantes. Les comparaisons appariées et les simulations miroir nécessitent une analyse par blocs/paires pour leurs intervalles.
- L'installation des dépendances et la suite complète `npm run build` n'ont pas pu être exécutées dans cet environnement. Les modules cœur TypeScript ont été vérifiés séparément.

## Correctifs supplémentaires intégrés à l'archive complète

- Les comparaisons d'une même phase réutilisent une séquence d'adversaires et un flux pseudo-aléatoire indépendant par partie, ce qui réduit le bruit lors du classement des decks.
- Le nombre moyen de tours est maintenant correctement comptabilisé pour les matchs terminés avant le tour suivant.
- Les avertissements de couverture (capacités `Choice`, talents non modélisés) sont affichés directement sur les résultats, y compris le test manuel.
- Le projet peut démarrer sans PostgreSQL et utiliser le snapshot embarqué ; les fonctions de persistance et de synchronisation restent dépendantes d'une base accessible.
- Le cœur TypeScript (types, parseur, moteur, recherche et workers) passe une vérification stricte isolée avec `tsc`. L'installation des dépendances a expiré dans l'environnement de préparation ; le build Next complet et la suite `npm test` n'ont donc pas pu être validés ici.
