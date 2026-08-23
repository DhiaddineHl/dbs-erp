# Plan de coupe (matelassage) — analyse de `static-version-5` et plan d'implémentation Next.js

> Rédigé le 2026-08-22. Source : `draft/static-version-5/pilotpro-server/public/PilotPro.html`
> comparé à `draft/static-version-4/public/PilotPro.html`.

---

## 1 · Ce qui a réellement changé entre v4 et v5

Le dossier a été renommé (`static-version-5/pilotpro-server/`) mais **tout le back-end
est identique** : `server.js`, `pgstore.js`, `pgwire.js`, `package.json`, `README.md`,
les tests et les `CORRECTIF_*.md` sont bit-à-bit les mêmes. Seul `public/PilotPro.html`
diffère : **+500 lignes, −10** (11 162 → 11 652 lignes), réparties sur 12 blocs.

Ces 500 lignes couvrent **deux fonctionnalités**, pas une :

| # | Fonctionnalité | Version PilotPro | État côté Next.js |
|---|---|---|---|
| A | **Sous-commandes** (groupes d'OF, OF porteur, champ `o.grp`) | v7.3 | déjà implémenté, et en mieux |
| B | **Plan de coupe / matelassage** (`window.PPLAN`, champ `o.plan`) | v7.4 + v7.5.1 | absent — c'est le sujet de ce plan |

### 1.A — Sous-commandes : rien à faire

La v5 introduit un simple champ `grp` sur la fiche (`grpMaitreDe`, `grpEnfants`,
`grpQteTotale`, `grpBadge`, écran `grpOuvrirLiaison`), puis filtre les enfants hors de
`printMatieres()`, `rapportReception()`, `editFour()` et du sélecteur d'OF du contrôle
qualité, et fait porter `_theoTissu()` sur la quantité du groupe.

L'app Next.js couvre déjà tout cela, avec un modèle **plus fin** :

- `commande.parentId` + `commande.lienParent` (`"decoupe"` vs `"regroupement"`) —
  `lib/db/schema/commande.ts`. La v5 ne connaît qu'une seule nature de lien et
  additionnerait donc faussement les quantités d'une découpe.
- `PreparationRow.porteurOf / estPorteur / qteGroupe` — `lib/services/preparation.ts`.
- `EcranConfig.porteurSeul` sur `magtissu` et `magfour` — `app/(app)/preparation/config.ts`.
- `isNull(commande.parentId)` dans le sélecteur QC — `lib/services/qc.ts:216`.
- UI de liaison : `app/(app)/commandes/regrouper.tsx`, `sous-commandes.tsx`,
  tests dans `lib/domain/sous-commande.test.ts`.

**Aucune action.** Le seul intérêt de ce bloc pour nous : il rappelle que **le plan de
coupe doit suivre la même règle porteur/enfant que le tissu**, puisqu'on coupe le tissu.

### 1.B — Plan de coupe : la vraie nouveauté

Un IIFE `window.PPLAN` de ~390 lignes ajouté en fin de document, plus trois points
d'accroche :

1. **Bouton 📐** dans la colonne actions de la liste Commandes
   (`onclick="PPLAN.ouvrir(o.id)"`), juste après 🔍 Traçabilité.
2. **Bloc `dtBlocPlan(o)`** injecté dans l'écran « Modélisme » de la traçabilité :
   statut du plan + bouton « Préparer le plan » / « Consulter le plan » selon
   `dtPeut('modelisme')`.
3. **Stockage** : le plan est rangé *dans* la fiche commande (`o.plan`), donc synchronisé
   par le même mécanisme que le reste — pas de nouvelle clé, pas d'iframe.

---

## 2 · Anatomie fonctionnelle de PPLAN

### 2.1 Modèle de données (`o.plan`)

```js
{
  sizes:  ["S","M","L","XL"],                 // gamme de tailles gérée
  order:  { S: 40, M: 120, L: 90, XL: 30 },   // quantité commandée par taille
  cons:   { maxS: 4, maxP: 100, tol: 0 },     // contraintes atelier
  active: 0,                                   // onglet matière courant (état UI !)
  variants: [                                  // une entrée par MATIÈRE
    {
      name: "Tissu principal",
      laise: 150,            // cm
      consoPrevue: 1.35,     // m/pièce attendus
      endLoss: 0,            // perte bout de matelas (m) — saisi, jamais utilisé
      price: 0,              // saisi dans blankVariant(), jamais affiché ni utilisé
      lays: [                // les TRACÉS / matelas
        { name:"Tracé 1", length: 5.40, plies: 30, est: true,
          qty: { S:1, M:2, L:1, XL:0 } }      // pièces par taille DANS le tracé
      ]
    }
  ],
  par: "Nom Modéliste",   // ajouté à l'enregistrement
  date: "2026-08-22"
}
```

### 2.2 Le calcul (tout est dérivé, rien n'est stocké)

| Grandeur | Formule |
|---|---|
| `cutPerSize(v)[s]` | `Σ_lays qty[s] × plies` |
| `totalConso(v)` | `Σ_lays length × plies` → mètres de tissu |
| `totalPieces(v)` | `Σ_s cutPerSize(v)[s]` |
| `isEstimated(v)` | un tracé a `est === true` avec `length > 0` et `plies > 0` |
| conso réelle/pc | `totalConso(v) / totalPieces(v)` |
| écart par taille | `cutPerSize[s] − order[s]` (négatif = manque, positif = surplus) |
| besoin vs reçu | `o.tissu_recu − totalConso(variants[0])` |

Le drapeau **`est`** (estimé) est le cœur du garde-fou métier : quand `propose()` génère
les tracés, il calcule une longueur théorique `consoPrevue × nb_de_tailles_dans_le_tracé`
et la marque `est: true`. Toute saisie manuelle de longueur (`_llen`) remet `est: false`.
**Tant qu'un tracé est estimé, le report de conso réelle est refusé.** C'est la règle qui
empêche une estimation de contaminer la nomenclature.

### 2.3 Le proposeur automatique (`proposeCore`)

Algorithme glouton qui produit les tracés à partir des quantités commandées :

```
restant[s] = order[s] pour chaque taille
tant qu'il reste des pièces (garde-fou : 800 itérations max) :
    candidats = tailles restantes triées par restant décroissant
    remplir maxS emplacements du tracé :
        pour chaque candidat, prendre min(emplacements_libres,
                                          ceil(restant[s] / maxP),
                                          restant[s])
    nb_plis P = min sur les tailles retenues de floor((restant[s] + tol) / count[s]),
                borné à [1, maxP]
    longueur = consoPrevue × nb_emplacements   (marquée « estimée »)
    restant[s] -= count[s] × P
```

Trois contraintes atelier pilotent le résultat : `maxS` (pièces par tracé, défaut 4),
`maxP` (plis par matelas, défaut 100), `tol` (surplus toléré par taille, défaut 0).

### 2.4 L'aller-retour avec la commande

**Le plan LIT** : `of_number`, `client`, `modele`, `ref_article`, `tailles` (ou `qte` +
quantité du groupe si TU), `conso_theo`, `conso_reel`, `tissu_recu`.

**Le plan ÉCRIT** (chaque report confirmé et journalisé) :

| Bouton | Écrit | Garde |
|---|---|---|
| `reporterConsoReelle()` | `o.conso_reel` | refusé si aucune pièce coupée **ou** longueurs estimées |
| `reporterConsoPrevue()` | `o.conso_theo` | refusé si `consoPrevue` vide |
| `reporterTailles()` | `o.tailles` **et `o.qte`** | refusé si grille vide ; `confirm()` avant/après |
| `enregistrer()` | `o.plan` | droit `dtPeut('modelisme')` |

**v7.5.1** ajoute deux propositions automatiques *au moment de l'enregistrement* :

1. si la grille du plan détaille la commande par taille et diffère de `o.tailles`
   → `confirm()` pour appliquer `_appliquerTailles()` (cas typique : commande saisie en
   « TU », le plan la ventile en S/M/L/XL) ;
2. si le plan est **complet** (aucune longueur estimée, pièces coupées ≥ commandées)
   → `confirm()` pour valider l'étape modéliste « Tirage des tracés » (`o.dt_traces`).

### 2.5 Les autres commandes de l'écran

`promptSizes()` (gamme de tailles), `addVariant()` / `delVariant()` (matières),
`copyStructure()` (recopie tailles+plis d'une matière sur une autre, longueurs remises à
zéro car la laise diffère), `imprimer()` (fiche matelassage A4 avec cartouche
Modéliste / Chef de coupe / Visa).

### 2.6 Droits

`droitModeliste()` = `dtPeut('modelisme')`, exactement le même droit que le patronage
(admin, resp, chef, modeliste). **La lecture est libre**, seule la préparation est
réservée — l'écran affiche une puce « consultation ».

---

## 3 · Écarts entre PilotPro et l'architecture Next.js

| PilotPro (v5) | dbs-erp (Next.js) | Conséquence sur le plan |
|---|---|---|
| Document JS unique, `ds.orders[]` en mémoire | Postgres + Drizzle, composants serveur, server actions | Il faut un schéma, un service, des actions |
| État UI (`active`) sérialisé avec les données | Les tables stockent des faits, jamais des décisions d'affichage | `active` reste en `useState`, il ne part pas en base |
| `o.plan` = blob JSON dans la fiche | `tailles`/`facNums` sont déjà en `jsonb` — le précédent existe | Modèle hybride assumé (§4.1) |
| `confirm()` / `prompt()` natifs | `Dialog` shadcn + `toast` sonner | À remplacer |
| Overlay plein écran, `window.open` + `document.write` | Routes dédiées + feuille d'impression `globals.css` | Route `/…/plan` + `/…/plan/imprimer` |
| `logAct()` global | `commande_journal` (domaine + avant/après) + `journaliser()` | Journalisation par transaction |
| `grp` (un seul type de lien) | `parentId` + `lienParent` (`decoupe` \| `regroupement`) | Utiliser `qteGroupe`, pas une somme maison |
| Aucun garde-fou sur la réécriture de `qte` | Facturation, BL, coupe, magasin lisent `qte` | **Ajouter un garde** (§4.4) |

---

## 4 · Plan d'implémentation

### 4.0 Décisions structurantes

| Décision | Choix | Pourquoi |
|---|---|---|
| Où vit l'écran ? | Route `/modelisme/[id]/plan` (+ `/imprimer`) | Deep-linkable depuis Commandes, Traçabilité et Modélisme ; l'impression devient une vraie page comme `magtissu/[id]/imprimer`, pas un `document.write` |
| Stockage | 2 tables : `commande_plan` (1:1) + `commande_plan_matiere` (n, `traces` en `jsonb`) | Une matière est un objet métier (nom, laise, conso) qu'on veut pouvoir agréger ; un tracé n'a de sens que dans sa matière et porte une carte taille→qté, exactement la forme déjà admise pour `commande.tailles` |
| Enregistrement | Édition en état React local + **un** bouton « Enregistrer » qui remplace le document en une transaction | L'écran est un calculateur : chaque frappe recalcule 6 agrégats. Un `ChampServeur` par cellule ferait des dizaines d'allers-retours |
| Nouveau feu ? | **Non** | Le feu `traces` couvre déjà l'étape bloquante ; le plan l'alimente. Un 7e feu bloquerait des OF qui partaient très bien en coupe sans lui |
| Porteur / enfant | Une sous-commande **n'a pas** de plan propre — renvoi vers le porteur, comme `porteurSeul` du magasin tissu | On coupe le tissu une fois pour le groupe |

### 4.1 Schéma — `lib/db/schema/preparation.ts`

`commande_plan` : 1:1 sur la commande (clé primaire sur `commandeId`, comme
`commande_lancement`) — `sizes`, `ordre`, contraintes atelier, `par`, `date`.
`commande_plan_matiere` : une ligne par matière (`rang`, `nom`, `laise`, `consoPrevue`,
`perteBout`) avec ses `traces` en `jsonb`.

Champs de PilotPro **volontairement abandonnés** : `active` (état d'onglet, reste client)
et `price` (jamais lu ni affiché nulle part dans v5).

### 4.2 Domaine pur — `lib/domain/plan-coupe.ts` (+ `plan-coupe.test.ts`)

Portage à l'identique des fonctions de calcul, testables sans base : `piecesParTaille`,
`consoTotale`, `piecesTotales`, `estEstime`, `consoReellePiece`, `ecartsParTaille`,
`proposerTraces` (port de `proposeCore`), `etatPlan`, `planComplet`.

`proposerTraces` est le seul vrai algorithme du lot : grille standard, taille unique,
`maxS = 1`, tolérance non nulle, quantité nulle, garde-fou des itérations.

### 4.3 Service — `lib/services/plan-coupe.ts`

`getPlan`, `planInitial` (pré-remplissage : tailles de la commande, ou « TU » sur
`qteGroupe`, et `consoPrevue = consoTheo`), `enregistrerPlan` (remplacement transactionnel
+ journal), `resumesPlans` (résumé léger pour les KPI et colonnes de l'écran Modélisme).

### 4.4 Actions — `lib/actions/plan-coupe.ts`

Toutes passent par `exigerDroit("modelisme")` puis `revalider()`.

**Garde ajouté par rapport à PilotPro — `reporterTailles`.** Le script v5 réécrit
`o.tailles` **et `o.qte`** sans aucune vérification. Dans dbs-erp, `qte` est lu par la
facturation, les BL, le magasin, la coupe et le calcul de marge. Le report est donc refusé
quand la commande est entamée en aval (`factureQte`, `coupeQte`, `magasinQte`, `produit`),
quand elle porte des parts de découpe, ou quand c'est une sous-commande.

### 4.5 Écrans

Route `/modelisme/[id]/plan` (page serveur + éditeur client) et
`/modelisme/[id]/plan/imprimer` (page document, calquée sur `magtissu/[id]/imprimer`).

### 4.6 Points d'accroche

1. **Fiche Modélisme** (`fiches.tsx`) — bloc d'état du plan + bouton.
2. **Liste Commandes** (`commandes-client.tsx`) — bouton 📐 dans la colonne actions.
3. **Traçabilité** (`lib/services/tracabilite.ts`) — évènement « Plan de coupe préparé ».
4. **Écran Modélisme** (`config.ts`) — colonne, onglet et KPI.

---

## 5 · Découpage en lots — **implémenté le 2026-08-22**

| Lot | Contenu | Fichiers |
|---|---|---|
| **1 — Socle** ✅ | `commande_plan` + `commande_plan_matiere`, relations, migration appliquée | `lib/db/schema/preparation.ts`, `lib/db/schema/commande.ts`, `drizzle/0020_plan_coupe.sql` |
| **2 — Domaine** ✅ | calculs purs + proposeur de tracés, 28 tests | `lib/domain/plan-coupe.ts`, `lib/domain/plan-coupe.test.ts` |
| **3 — Service & actions** ✅ | lecture/écriture transactionnelle, garde `reporterTailles`, journal partagé extrait | `lib/services/plan-coupe.ts`, `lib/services/journal-fiche.ts`, `lib/actions/plan-coupe.ts` |
| **4 — Écran** ✅ | route + éditeur client (calculs à la frappe) | `app/(app)/modelisme/[id]/plan/{page,editeur}.tsx` |
| **5 — Impression** ✅ | fiche matelassage A4 avec les trois visas | `app/(app)/modelisme/[id]/plan/imprimer/page.tsx` |
| **6 — Accroches** ✅ | bloc fiche Modélisme, bouton 📐 Commandes, frise Traçabilité, colonne + onglet + KPI | `preparation/fiches.tsx`, `preparation/ecran.tsx`, `preparation/config.ts`, `commandes/commandes-client.tsx`, `lib/services/tracabilite.ts` |
| **7 — Automatismes v7.5.1** ✅ | propositions « détailler les tailles » et « valider Tirage des tracés » après enregistrement | `lib/actions/plan-coupe.ts` (`SuitesEnregistrement`) |

Vérifications : `npx tsc --noEmit` propre, `npx eslint` propre, `npm test` 107/107,
`npm run build` compile les deux routes, `npm run db:migrate` appliquée (tables présentes).

### Écarts assumés par rapport à PilotPro

- **`reporterTailles` est gardé** : refusé sur une sous-commande, sur un porteur
  de découpe, et sur une commande déjà entamée en aval (coupée, produite, en
  magasin ou facturée). PilotPro réécrit `qte` sans rien vérifier.
- **Le report attend l'enregistrement** : les reports lisent le plan en base, donc
  l'éditeur refuse de reporter tant que des modifications sont en attente.
- **`active` et `price` ne sont pas stockés** : le premier est un état d'onglet, le
  second n'était lu nulle part dans la v5.
- **`perteBout` est saisi et imprimé mais n'entre pas dans le calcul** — comme dans
  PilotPro. Voir question 3.

---

## 6 · Questions ouvertes

1. **Report des tailles sur une commande déjà entamée** — garde strict, ou dérogation
   motivée comme le lancement ?
2. **Plan par groupe** — après coupe, faut-il ventiler les pièces coupées vers chaque
   enfant (`coupeQte`) ? PilotPro ne tranche pas. Hors périmètre des lots 1-7.
3. **`perteBout`** — saisi dans PilotPro mais jamais utilisé. Le brancher ou le retirer ?
4. **Feu « plan de coupe »** — confirmé non bloquant ?
