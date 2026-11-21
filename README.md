# SPAM Lab — simulateur de decks et base de données SPAM (en français)

Site Next.js : cartes, collection, simulateur Monte-Carlo, méta, Tox, talents, patchs.
Les données sont **tenues à jour automatiquement** et affichées **en français** avec les textes officiels.

## Démarrer en local

Node.js 20.9 ou plus récent.

```bash
npm install
npm run sync        # récupère les données à jour (EN + FR + patchs Steam)
npm run dev         # http://localhost:3000
```

Le Deck Lab autonome (un seul fichier HTML qui fonctionne hors ligne) est servi sur `/deck-lab.html`
et régénéré à chaque synchro. `npm run deck-lab` le reconstruit sans réseau.

## Comment les données restent à jour

```
metabot.gg/en  ──► moteur de simulation (le parseur lit les effets en anglais)
metabot.gg/fr  ──► affichage : noms, capacités, talents, Tox (textes officiels FR)
API Steam      ──► notes de patch, appliquées par-dessus les valeurs du client
        │
        ▼
scripts/sync-snapshot.ts → contrôles d'intégrité → src/data/seed.json (+ public/deck-lab.html, images)
```

- **Tâche planifiée** : `.github/workflows/sync-donnees.yml` lance la synchro **toutes les 4 heures**,
  puis les tests et le contrôle de types. Si tout passe et que les données ont changé, elle fait un commit
  (message = résumé des changements : nouvelles cartes, PV modifiés, nouveau patch…). L'hébergeur
  (Vercel, Netlify…) redéploie le site automatiquement.
- **Aucune publication en cas de doute** : moins de 50 cartes, chute de plus de 10 % du nombre de cartes,
  slugs dupliqués, PV ou dégâts invalides… → la tâche échoue et le snapshot précédent reste en ligne.
- **La traduction ne bloque jamais** : si une page française manque ou ne correspond pas (nombre de
  capacités différent), le texte anglais reste affiché avec une étiquette « EN » et un avertissement
  apparaît dans le rapport de synchro.
- Le site affiche l'âge des données (vert < 26 h, orange < 3 jours, rouge au-delà = la tâche a échoué).
- Lancement manuel : onglet **Actions** de GitHub → « Synchronisation des données » → *Run workflow*.

### Mise en ligne (une seule fois)

1. Pousser ce dossier dans un dépôt GitHub.
2. Settings → Actions → General → *Workflow permissions* : **Read and write**.
3. Importer le dépôt sur Vercel (ou Netlify). Aucune variable d'environnement n'est nécessaire.
4. Lancer la tâche une première fois à la main pour récupérer les textes français et les images.

PostgreSQL reste possible (`DATABASE_URL` + `SPAM_SYNC_SECRET`, voir `.env.example`) mais n'est plus
nécessaire : le snapshot versionné dans Git est la base de données, avec tout l'historique des changements.

## Vérifications

```bash
npm test            # parseurs EN/FR, correspondance des Tox, intégrité du snapshot, statistiques
npm run typecheck
npm run sync:check  # synchro à blanc : rapport sans rien écrire
```

## Fidélité de la simulation — ce qui est fiable et ce qui ne l'est pas encore

Fiable : PV, Spamtons, résistances, dégâts/soins de base, recharges, précision, critiques, bonus
d'éléments, coûts, boutique Tox, et les ajustements de patch appliqués automatiquement.

Pas encore simulé (signalé sur chaque résultat concerné, jamais caché) :
- environ **360 talents sur 453** ne sont pas modélisés. Quand le talent conseillé (★) d'une carte n'est pas
  modélisé, le moteur utilise le meilleur talent modélisé à la place : l'avertissement l'indique ;
- capacités à choix : seule la première option est jouée ;
- l'IA de ciblage est une heuristique, pas l'IA officielle.

Un résultat marqué « expérimental » ne doit pas servir de classement définitif.

## Correctifs de cette version

- Couche française officielle (metabot.gg/fr), fusionnée par slug ; les champs anglais restent les clés du moteur.
- **Bug corrigé** : 34 talents « Cœur de … » / « AOE rare/épique » donnant un Tox de départ étaient comptés
  comme modélisés mais n'avaient aucun effet (« Fire Heart » ≠ « Fireheart »). Correspondance tolérante ajoutée.
- 6 familles de Tox à palier unique arrivaient sans nom (inversion, optimization, metamorph, backlash, camouflage…) : corrigé.
- Avertissements fidèles au talent réellement utilisé ; détection des capacités à choix dans les anciens snapshots.
- Sans base de données, le serveur ne relance plus une synchro complète à chaque visite.
- Icônes d'éléments/Spamtons sans fichier externe ; repli visuel quand une illustration manque.
- Boutons « Synchroniser maintenant » retirés (ils échouaient : l'API exige un secret) au profit de l'état de mise à jour.
