# PilotPro — PROJET COMPLET avec toutes les modifications (à jour)
Généré le 20/11/2026 — basé sur le ZIP « dbs-erp-pilot-pro » que vous m'avez envoyé le 15/11.

CE ZIP CONTIENT LE PROJET ENTIER (dossier dbs-erp-main), pas seulement les
fichiers modifiés : il remplace tout. package-lock.json COMPRIS.
Les ZIP précédents sont inutiles.

IMPORTANT — votre ZIP du 15/11 ne contenait pas la livraison du 13/10
(le scan des vrais paquets dans la saisie horaire). Il contenait en
revanche des corrections faites après le 12/10 : veille de version,
menu sur grand écran, saisies qui échouaient sans le dire. J'ai GARDÉ vos
corrections et remis la livraison du 13/10 par-dessus : rien n'est perdu.

Vérifié : `tsc` OK · `eslint` OK · `npm test` 447/447 · `next build` OK ·
migrations 0 → 0054 (nouvelles depuis le 13/10 : 0047 à 0054, appliquées toutes seules au démarrage) · essai navigateur.

═══════════════════════════════════════════════════════════════
NOUVEAU (20/11, 5e envoi) — Clients et sous-traitants : peuvent-ils entrer
dans l'application par leur lien ? Contrôle et fermeture d'une vraie faille
═══════════════════════════════════════════════════════════════
Aucune migration nouvelle.

⚠ FAILLE GRAVE TROUVÉE ET FERMÉE : L'INSCRIPTION LIBRE
N'importe qui connaissant l'adresse du site (un client, un sous-traitant,
un inconnu) pouvait se CRÉER UN COMPTE tout seul, par un simple appel
technique (/api/auth/sign-up/email), sans passer par vous. Le compte
recevait le rôle « Analyste » et entrait dans l'application. Je l'ai
vérifié : le compte se créait bien.
→ C'est fermé : seul l'administrateur crée des comptes (Paramètres →
  Utilisateurs, inchangé).
→ À FAIRE : ouvrez Paramètres → Utilisateurs et supprimez tout compte que
  vous ne connaissez pas (surtout en rôle « Analyste »).

CE QUI ÉTAIT DÉJÀ SOLIDE (contrôlé)
  · Le lien d'un portail ne donne AUCUN accès à l'application : sans compte,
    toute page, tout export, tout fichier renvoie à la connexion.
  · La clé du lien : 32 caractères tirés au hasard — impossible à deviner.
    Une clé inventée → page introuvable.
  · Le PIN : 6 chiffres, 5 essais puis blocage 15 minutes ; mémorisé sur le
    téléphone 30 jours par un témoin signé ; un nouveau PIN déconnecte tous
    les téléphones ; « Désactiver » ou « Nouvelle clé » coupe le lien.
  · Chaque action d'un portail revérifie la clé ET le PIN, puis que la
    commande appartient bien à CE client / CET atelier : un client ne voit
    jamais les commandes d'un autre, un atelier jamais celles d'un autre
    atelier, et la clé d'un atelier ne marche pas sur le portail client.
  · Les fichiers de l'atelier (fiches techniques) : refusés sans PIN.
  · Le portail client ne nomme jamais vos sous-traitants (test existant).

CE QUI EST RENFORCÉ
  1) Inscription libre fermée (voir plus haut).
  2) Mots de passe : 5 essais par minute au plus ; au-delà la connexion
     attend (contre ceux qui essaient des mots de passe en boucle).
  3) En-têtes de sécurité sur toutes les pages : l'application ne peut pas
     être affichée cachée dans un autre site ; l'adresse d'une page (qui
     contient la clé d'un portail) n'est jamais transmise aux autres sites ;
     caméra autorisée pour le scan des QR, ni micro ni position.
  4) Le témoin « PIN déjà donné » n'a plus de secret de repli écrit dans le
     code : sans la clé secrète du serveur, le portail reste fermé.
  5) La trace de déconnexion n'accepte plus d'appel sans compte.
  6) Tests automatiques : inscription fermée, limite des essais, en-têtes,
     et « chaque action de portail vérifie clé + PIN » — un oubli futur fait
     échouer les tests.

CONSEIL
Donnez un PIN à chaque accès client aussi (il est obligatoire pour les
sous-traitants, facultatif pour les clients) : un lien transféré par
erreur ne suffit alors plus pour entrer.

Vérifié : tests (447) ; essais réels depuis l'extérieur — inscription
refusée (aucun compte créé) ; 6e mauvais mot de passe en une minute
bloqué ; sans compte, /cockpit, /commandes, fichiers, export stock,
messagerie → connexion ; clé inventée → introuvable ; lien atelier sans
PIN → demande le code, sa fiche technique → refusée ; mauvais PIN →
« 4 essais restants » ; avec le bon PIN, l'atelier voit son espace mais
/cockpit le renvoie à la connexion, et sa clé ne marche pas sur le portail
client ; l'administrateur crée toujours des comptes normalement.


═══════════════════════════════════════════════════════════════
LIVRÉ (20/11, 4e envoi) — SÉCURITÉ DES RÔLES : une case décochée ferme
vraiment la porte
═══════════════════════════════════════════════════════════════
Aucune migration nouvelle. Aucun réglage à refaire : vos cases actuelles
dans Paramètres → Rôles s'appliquent telles quelles, mais pour de vrai.

CE QUI N'ALLAIT PAS
  · Les cases de Paramètres → Rôles ne décidaient que du MENU. Une page
    décochée disparaissait du menu, mais restait ouverte à qui y arrivait
    autrement : son adresse tapée ou mise en favori, un lien… et surtout le
    bouton « 🖥 Application complète » de l'accueil téléphone, qui menait
    TOUJOURS au Cockpit, quel que soit le rôle. C'est très probablement par
    là que votre équipier a vu le Cockpit.
  · Les actions du serveur (enregistrer, modifier, supprimer, exporter)
    vérifiaient souvent seulement « connecté », parfois le rôle, jamais la
    case du module.
  · Décocher « Magasin produits finis » ne fermait rien tant que la case
    « Réception ST » (ancien module fusionné dans le magasin) restait cochée.

CE QUI CHANGE
  1) Chaque page vérifie sa case : les ~70 pages du bureau (y compris les
     pages d'impression : BL, BR, étiquettes, rapports QC, plans de coupe…),
     les écrans du téléphone (tissu, paquets, saisie production, produits
     finis). Case décochée → page « Accès refusé — « Cockpit » n'est pas
     ouvert à votre rôle », sans aucun chiffre affiché.
  2) Chaque export et fichier vérifie sa case : état de stock Excel,
     résultat de coupe client, fiches du modèle, envoi de fiches, messagerie.
  3) Chaque action du serveur vérifie sa case EN PLUS des droits déjà en
     place (rôles du magasin, de la comptabilité, du contrôle qualité…).
     Même en connaissant l'astuce technique pour appeler une action depuis
     une autre page, c'est refusé.
  4) Le bouton « Application complète » du téléphone mène à la première
     page autorisée du compte, plus au Cockpit.
  5) Une case = une porte. La case « Réception ST » (fusionnée dans le
     magasin) disparaît de la matrice : c'est « Magasin produits finis » qui
     décide.
  6) Paramètres (comptes, rôles, droits) et Journal d'activité :
     l'administrateur seul, quoi que dise la matrice.
  7) Messagerie décochée : plus de notifications de messages non plus.
  8) L'administrateur garde tout, toujours.

GARDE-FOU POUR L'AVENIR
Un test automatique parcourt TOUTES les pages, exports et fichiers
d'actions : si une page nouvelle est ajoutée sans vérifier sa case, le
projet refuse de passer les tests.

À SAVOIR
  · Décocher un module ferme maintenant aussi ses actions : vérifiez dans
    Paramètres → Rôles qu'aucun rôle n'a une case décochée par erreur sur un
    module dont il a besoin (avant, cette erreur passait inaperçue).
  · Après un changement de cases, la personne concernée doit simplement
    recharger la page ; aucune déconnexion n'est nécessaire.

Vérifié : tests (446) ; essai navigateur avec un compte « Chef de chaîne »
à qui l'on a décoché Cockpit, Commandes, Factures, Magasin, Messagerie :
menu sans ces entrées ; /cockpit, /commandes, /factures, /magasin et
l'écran téléphone du magasin → « Accès refusé » ; export Excel du stock et
messagerie → refusés ; « Application complète » → sa première page
autorisée ; Paramètres → renvoyé ailleurs. Le Responsable Prod. ouvre
toujours ses 34 écrans sans erreur ; l'administrateur garde tout.


═══════════════════════════════════════════════════════════════
LIVRÉ (20/11, 3e envoi) — Réception façonnier : « produit » et « reçu »
ne sont plus confondus
═══════════════════════════════════════════════════════════════
Aucune migration nouvelle.

LE PROBLÈME (votre capture : OF-2026-367, 1 420 commandées, 1 420
produites, 300 en stock, réception de 81)
La réception était comparée au « produit » : 1 420 produites + 81 reçues
= 1 501 > 1 420 coupées → fausse alerte. Or « produit » compte déjà ces
pièces (production suivie dans les chaînes / GPAO) alors qu'elles ne sont
pas encore arrivées au magasin. Pour la même raison, une commande
« produite à 100 % » disparaissait de la liste des commandes à
réceptionner, même avec des pièces encore chez le façonnier.

CE QUI CHANGE
  · Une réception se compare à ce qui est DÉJÀ ARRIVÉ :
      – alerte coupe : déjà reçu (conformes + non conformes) + cette
        réception ne doit pas dépasser le COUPÉ (toujours signalé, et
        toujours contournable) ;
      – information : « Il restera N pièce(s) à recevoir » ou « N pièce(s)
        de plus que la commande ».
  · Dans la fenêtre de réception, le bandeau montre : Commandé · Coupé ·
    Produit (dont chaîne, s'il y en a) · Déjà entré au stock · En stock ·
    Reste à recevoir.
  · Les listes « à réceptionner » (bureau, téléphone du magasinier, bouton
    « Réception » sur la ligne) se basent sur le reste à RECEVOIR
    (commandé − déjà entré au stock), et non plus sur le reste à produire.
  · Le coupé utilisé est le coupé valide (les lignes d'une fiche de coupe
    annulée ne comptent plus).
  · La validation des livraisons annoncées sur le portail sous-traitant
    passe par la même règle.
Le calcul du « produit » lui-même ne change pas (chaînes + réceptions +
retouches, plafonné à la commande).

Vérifié : tests (dont votre cas exact : 1 420 produites, 300 arrivées,
81 reçues → aucune alerte, « il restera 1 039 ») ; essai navigateur —
commande produite à 100 %, à moitié arrivée : elle reste proposée à la
réception, 81 pièces passent sans alerte et entrent au stock ; 700 de plus
déclenchent bien l'alerte « 1 491 pièces revenues pour 1 420 coupées ».


═══════════════════════════════════════════════════════════════
LIVRÉ (20/11, 2e envoi) — Messagerie : l'administrateur gère les groupes
des portails · Archivage : photos et fiches effacées pour libérer l'espace
═══════════════════════════════════════════════════════════════
Aucune migration nouvelle.

1) MESSAGERIE — GROUPES DES SOUS-TRAITANTS ET DES CLIENTS
Les fils créés pour un portail (🌐 Client · … / 🌐 Sous-traitant · …) :
  · le compte administrateur en est TOUJOURS administrateur — y compris
    pour les fils créés avant aujourd'hui : il y est rattaché tout seul à
    sa prochaine ouverture de la messagerie ;
  · dans « Infos du groupe » (le ⓘ en haut du fil) il peut donc
    « ➕ Ajouter des membres » et « Retirer » une personne, et renommer
    le groupe ;
  · une personne retirée ne voit plus les nouveaux messages ; l'historique
    reste intact, et on peut la remettre plus tard ;
  · s'il quitte lui-même un groupe, il n'y est pas remis de force.

2) ARCHIVER UNE COMMANDE LIBÈRE L'ESPACE
Dès qu'une commande est archivée — à la main (« Archiver »), par « Archiver
les soldées », ou toute seule quand elle est entièrement facturée — on
efface DÉFINITIVEMENT :
  · la photo du modèle ;
  · les photos du contrôle qualité (inspections, défauts, actions
    correctives avant / après) ;
  · les fiches techniques et fiches commentaire du modèle (seulement quand
    TOUT le groupe d'OF du modèle est archivé). La ligne de la fiche reste
    à l'historique, marquée « Archivage automatique (fichier supprimé) ».
Ce qui RESTE : toutes les quantités, les contrôles, les mesures, les
défauts, les factures, les messages — seuls les fichiers partent.
Sécurités :
  · un fichier utilisé ailleurs n'est jamais effacé (la même photo ou la
    même fiche sur une commande encore en cours, ou envoyée dans la
    messagerie) ;
  · le premier archivage fait aussi le ménage des commandes DÉJÀ archivées
    et des fichiers restés sans usage (photos des commandes livrées
    décrochées auparavant) ; un fichier déposé depuis moins de 2 jours
    n'est jamais touché ;
  · si le stockage ne répond pas, l'archivage se fait quand même ; le
    ménage sera refait au suivant ;
  · le journal d'activité note chaque ménage : « 1 photo(s) et 3 fiche(s)
    retirées · 3 fichier(s) effacé(s) · 3,4 Mo libérés » ;
  · la fenêtre de confirmation de l'archivage le dit clairement.
⚠ Désarchiver une commande ne fait PAS revenir ses photos ni ses fiches.

Vérifié : tests ; essai navigateur — archivage d'un OF avec photo, 3 fiches
dont une partagée avec un OF en cours : 3 fichiers effacés (3,4 Mo), la
fiche partagée reste lisible sur l'OF en cours, un fichier orphelin de
3 jours effacé, la fiche archivée ne s'ouvre plus (introuvable, sans
erreur) ; messagerie — l'administrateur, rétrogradé puis retiré d'anciens
fils portail, y redevient administrateur, ajoute « Chef DBS » et retire
« Responsable Prod. ».


═══════════════════════════════════════════════════════════════
LIVRÉ (20/11) — Fiches du modèle en direction technique, vues par l'atelier
═══════════════════════════════════════════════════════════════
Migration 0054 (s'applique toute seule au démarrage). Les fichiers vont
dans le stockage objet déjà utilisé pour les photos du contrôle qualité.

1) EN DIRECTION TECHNIQUE
Sur chaque modèle (ouvrir la ligne de la commande), une nouvelle section
« 📄 Fiches du modèle », en tête :
  · choisir le type — Fiche technique, Fiche commentaire, Autre document —
    une note facultative (« version du 14/11 »), « visible par l'atelier »
    (coché par défaut), puis « 📤 Déposer » ;
  · PDF, photo, Excel ou Word, jusqu'à 25 Mo (un dossier technique de 40
    pages passe sans problème) ;
  · chaque fiche : « 🖨 Ouvrir / imprimer » (s'ouvre dans un onglet, avec
    son vrai nom), « Cacher / Montrer à l'atelier », « Retirer » (elle
    n'est plus montrée, mais rien n'est effacé) ; qui l'a déposée et quand ;
  · dans la liste, « 📄 2 » à côté du modèle dit combien de fiches il a ;
  · la fiche vaut pour tout le groupe d'OF du modèle (porteur et OF
    rattachés) ;
  · déposer et retirer : direction technique (mêmes droits que les têtes de
    série) ; tout est écrit au journal d'activité.

2) CHEZ L'ATELIER (son portail)
Sur la commande, un bouton « 📄 Fiches (n) » : chaque fiche avec
« 🖨 Ouvrir / imprimer » et « ⬇ Télécharger ». Il ne voit que les fiches
« visibles par l'atelier » des commandes qui LUI sont confiées ; sans son PIN,
le lien ne s'ouvre pas. À chaque nouvelle fiche visible, il reçoit un message
dans son fil (« 📄 Nouvelle fiche technique pour OF-… »).

Vérifié : tests ; essai navigateur complet — dépôt d'un dossier technique
de 3,4 Mo (fiche technique, visible) et d'une fiche commentaire interne ;
ouverture et impression au bureau ; sur le portail de l'atelier, seule la
fiche visible apparaît et s'ouvre (3,4 Mo, PDF) ; sans PIN : refusé.


═══════════════════════════════════════════════════════════════
LIVRÉ (19/11) — Portail client : « 📊 Performance » et traçabilité
═══════════════════════════════════════════════════════════════
Pas de migration.

Le client voit maintenant de quoi nourrir SES statistiques fournisseur,
calculé sur SES commandes et sur des dates réelles (12 derniers mois).

1) NOUVEL ONGLET « 📊 PERFORMANCE »
  · Chiffres clés : LIVRÉES À L'HEURE (% et « X sur Y commandes parties »),
    écart moyen au délai (avance ou retard), CYCLE MOYEN (de la commande au
    départ), DÉLAI USINE MOYEN (du tissu reçu au départ — le temps qui
    dépend de nous), % OK dès la 1re tête de série (s'il y a des têtes de
    série), pièces livrées.
  · RESPECT DES DÉLAIS : pour chaque commande partie, date d'export
    contractuelle, date réelle, et le délai (« 2 j d'avance », « le jour
    prévu », « +2 j », « +5 j de retard »).
  · CYCLE DE VIE DE CHAQUE COMMANDE : une barre par commande (en cours puis
    parties), découpée en attente tissu / préparation / fabrication /
    expédition, avec la moyenne.

2) « 🧭 TRAÇABILITÉ » SUR CHAQUE COMMANDE
Bouton sur la carte de la commande : le cycle (« en cours depuis 12 jours »,
« cycle complet : 44 jours »), le délai, puis une FRISE DATÉE de tous les
faits : commande enregistrée, tissu reçu (référence, couleur, bain, lot),
têtes de série / pièces pour l'OK envoyées et leur réponse, chaque jour de
coupe (pièces coupées), contrôles qualité, pièces finies et emballées,
chaque expédition (BL, transporteur, n° de suivi).

À SAVOIR
  · Début du cycle = la commande enregistrée dans PilotPro ; si elle a été
    saisie après coup (reprise d'historique), le premier fait daté connu ;
    si rien n'est fiable : « début inconnu » (rien n'est inventé).
  · Toujours aucune trace de la sous-traitance (vérifié dans la page).

Vérifié : tests (cycle, statistiques, libellés), essai navigateur sur
téléphone (onglet Performance, traçabilité, aucune fuite).


═══════════════════════════════════════════════════════════════
LIVRÉ (17/11) — Magasin produits finis rangé + stock PAR TAILLE
═══════════════════════════════════════════════════════════════
Migration 0053 (s'applique toute seule au démarrage).

1) LA PAGE EN 5 ONGLETS (chacun répond à une question)
  · 🏠 AUJOURD'HUI — « qu'est-ce que je dois faire ? » : livraisons
    annoncées par les ateliers (Recevoir), production interne à entrer
    (Entrer par taille), non conformes à décider, commandes préparées
    (faire le BL), départs prévus d'ici 7 jours (« tout est en stock » ou
    « il manque X pcs »). La page s'ouvre ici.
  · 👔 STOCK PAR CLIENT — une carte par client : pièces en stock, valeur
    (direction), nombre de commandes, expédié, prochain départ, « ⬇ Excel ».
    En cliquant : ses commandes.
  · 🧵 PAR FAÇONNIER — une ligne par atelier et par chaîne interne :
    commandes en cours, reçu de lui, ENCORE CHEZ LUI (coupé − reçu), en
    stock chez nous, non conformes à décider, taux NC. Vue interne.
  · 📥 ENTRÉES — les réceptions façonniers et les non conformes (comme avant).
  · 🧾 MOUVEMENTS — le journal (comme avant).
Filtres communs : « Avec du stock / Pas encore expédiées / Toutes »,
client, façonnier, recherche (OF, modèle, référence).

2) LE TABLEAU DES COMMANDES, ALLÉGÉ
6 colonnes : commande (OF · modèle · référence · couleur, client ·
provenance), commandé, EN STOCK (avec les tailles), expédié, état, et UNE
action — celle à faire maintenant : Entrer, Réception, Préparer ou Faire le
BL. Un clic sur la ligne ouvre le détail : produit, entré, contrôle
qualité, NC, départ prévu, le tableau du stock par taille, et les autres
actions (entrée, préparer, solder, rouvrir). Rien n'est supprimé.

3) LE STOCK PAR TAILLE
  · ATELIER : sa livraison est saisie par taille sur son portail ; à la
    validation, le 1er choix entre au stock RANGÉ PAR TAILLE, tout seul.
    Réception façonnier saisie au bureau : grille « Conformes rangés par
    taille » (facultative).
  · PRODUCTION INTERNE : la GPAO ne connaît pas les tailles ; à l'ENTRÉE au
    magasin (après contrôle et finition), une grille « Rangées par taille »
    — au bureau et sur la saisie mobile du magasin. Remplie, elle donne la
    quantité.
  · SORTIE : le bon de livraison propose les tailles sous chaque ligne
    (avec le stock de chaque taille). Si vous livrez TOUT le stock rangé
    par taille, elles sont reprises toutes seules. Impossible de sortir
    plus qu'il n'y a dans une taille. Les tailles sont imprimées sur le BL.
  · Ce qui est entré avant (ou saisi sans tailles) s'affiche « sans
    taille » : rien n'est réparti au hasard.

4) EXPORT EXCEL « ÉTAT DU STOCK »
Bouton « ⬇ État du stock (Excel) » (tout le magasin) ou « ⬇ Excel » sur un
client : par client, OF, modèle, référence, couleur, commandé, expédié, en
stock, stock par taille, départ prévu, total. Aucune colonne ne nomme un
atelier extérieur. La valeur en € n'y figure que pour l'administrateur et
le responsable de production (comme à l'écran).

Vérifié : tests (ventilation, stock par taille, sortie automatique,
contrôle par taille), essai navigateur : 5 onglets, carte client, détail
par taille, entrée interne S 10 · M 20 · L 5, vue par façonnier, export
Excel, BL avec tailles (S 5 · M 10 enregistrées).


═══════════════════════════════════════════════════════════════
LIVRÉ (16/11 v7) — « Résultat de coupe » client, GÉNÉRÉ AUTOMATIQUEMENT
═══════════════════════════════════════════════════════════════
Migration 0052 (s'applique toute seule au démarrage). Nouvelle dépendance :
exceljs (déjà dans package-lock.json ; Railway l'installe tout seul).

LE PRINCIPE : personne ne remplit le document du client. Il se fabrique
TOUT SEUL, à la validation de la coupe, avec :
  · les données de l'application : modèle, référence, OF, quantités
    commandées et coupées par taille, tissu (référence, coloris, métrage
    reçu, utilisé, chutes, stock après coupe), doublure / thermo du plan ;
  · les CONSTATS de celui qui coupe — le coupeur chez vous, ou l'atelier
    sous-traitant sur son portail :
      – la laize utile constatée ;
      – le 2e choix à la coupe, par OF et par taille ;
      – pour chaque rouleau : le défaut (ex. « trou à 12 m ») et le métrage
        manquant.

1) COUPE CHEZ VOUS (Service coupe → Nouvelle coupe)
Nouvelle section « 4 bis · Pour le Résultat de coupe du client » : laize,
2e choix par OF × taille, défaut / manquant par rouleau. Tout est
facultatif. À « Valider la coupe », le Résultat de coupe est généré.

2) COUPE CHEZ UN ATELIER (son portail → Rapport de coupe)
Sous chaque OF, une ligne « dont 2e choix » ; « Laize utile constatée » ;
pour chaque rouleau, défaut et manquant. La colonne « Chez vous (m) »
montre ce qui reste VRAIMENT chez lui sur ce rouleau (un 2e rapport ne
repart pas du métrage d'origine ; le manque signalé à la réception est
déduit). Vous voyez ses constats dans Suivi sous-traitants ; à
« Valider → fiche de coupe », le Résultat de coupe est généré (le toast
propose de le télécharger).

3) LE DOCUMENT
Sur la fiche de coupe : « 📊 Résultat de coupe (Excel client) — généré
automatiquement le … », et un encadré « Constats de la coupe ». Le
fichier reprend la fiche que vos clients envoient (exemple CANDICE /
Claudie Pierlot) : même ordre, mêmes intitulés, mêmes bandeaux,
A4 paysage, cellules modifiables, cadre « Date et signature / Visa client ».
  · Façonnier : STE DBS FASHION (jamais le nom d'un atelier extérieur) ;
  · laize : la constatée, sinon celle du magasin tissu ;
  · 2e choix : celui constaté à la coupe, sinon celui des livraisons ;
  · « Chutes + Défaut tissu + Manquant sur rlx » = chutes + manquants ;
  · « N° Rouleau présentant défaut(s) » = rouleaux signalés à la coupe +
    ceux qui ont une observation au magasin tissu.
Le document est une PHOTO FIGÉE prise à la validation (il ne bouge plus si
le stock change ensuite) ; les constats sont figés avec la fiche (garde-fou
en base : une fiche validée ne se modifie pas, on l'annule et on la refait).
Pour une fiche validée avant cette version, le document est calculé à la
demande.

Vérifié : tests (constats : laize m/cm, 2e choix ≤ coupé, rouleaux connus ;
manquant dans les chutes), essais navigateur complets : coupe interne
avec constats → document généré (laize 1,47 m, 2e choix, défaut) ; rapport
d'un atelier avec constats → validé au bureau → document généré
(laize 1,46 m, 2e choix S×1, rouleau en défaut) ; verrou en base vérifié.


═══════════════════════════════════════════════════════════════
LIVRÉ (16/11 v5) — Portail client : l'avancement en DIRECT
═══════════════════════════════════════════════════════════════
Pas de migration.

AVANT : la frise du client (coupe, confection, contrôle, emballage…)
était figée à sa première visite de la journée (« un point par jour ») :
une entrée au magasin le matin n'apparaissait que le lendemain.

MAINTENANT :
  · la frise suit l'avancement RÉEL au moment où le client ouvre la page :
      – Coupe        = coupé (fiches de coupe validées) ;
      – Confection   = production (GPAO pour l'interne, BR conformes pour
                       la sous-traitance) ou, si plus grand, le « produit »
                       déclaré le soir par l'atelier ;
      – Emballage    = pièces entrées au Magasin produits finis ou, si plus
                       grand, l'« emballé » déclaré par l'atelier ;
      – Contrôle qualité, Expédition : dès qu'ils sont enregistrés ;
  · la page se met à jour TOUTE SEULE chaque minute tant qu'elle est
    ouverte (et dès que le client y revient), sans effacer ce qu'il écrit ;
  · en bas : « Avancement en direct · à jour le 16/11/2026 à 20:12 ».

Justification de la suppression du « point par jour » (fonction
pointDuJour) : vous avez demandé un avancement instantané et lié au réel.
La table portail_point reste en base (les points déjà pris sont gardés)
mais n'est plus écrite.

À savoir : avec l'avancement en direct, une commande faite chez vous peut
avancer plusieurs fois dans la journée (saisies GPAO), alors qu'une
commande sous-traitée avance surtout le soir (saisie de l'atelier) et à la
réception. Le nom de l'atelier, lui, n'apparaît toujours nulle part.

Vérifié : saisie d'un atelier → la frise du client passe de 22 à 27 en
confection et de 17 à 24 en emballage au simple rechargement ; tests
418/418 ; build OK.


═══════════════════════════════════════════════════════════════
LIVRÉ (16/11 v4) — Prévision d'export chaque week-end + recherche client
═══════════════════════════════════════════════════════════════
Migration 0051 (s'applique toute seule au démarrage).

1) CHEZ VOUS : PUBLIER LA PRÉVISION (menu « Prévision export »)
En haut de la page, un panneau « 📣 Prévision d'export aux clients ».
  · Période : les DEUX semaines qui viennent (publié du vendredi au
    dimanche → la semaine prochaine et la suivante ; publié le lundi →
    la semaine qui commence et la suivante).
  · Pastille sur « Prévision export » le vendredi, samedi et dimanche tant
    que ce n'est pas publié.
  · « Préparer la publication » : par client, les commandes qui partent
    (date prévue de l'échéancier, sinon contractuelle), avec :
      – la QUANTITÉ qui part (modifiable) sur la quantité commandée ;
      – l'ÉTAT : prête à partir / en emballage / en production ;
      – le CHANGEMENT depuis la publication précédente : nouvelle,
        avancée, reportée (« était le 20/11 »), quantité modifiée, ou
        « hors des 2 semaines » (annoncée et plus là) ;
      – une case pour retirer une ligne ; un MOT LIBRE par client.
    Les DATES se changent dans l'échéancier en dessous (une seule source).
  · « 📣 Publier aux clients » (responsable de production et
    administrateur) : la prévision est FIGÉE ; chaque client qui a un
    portail reçoit un message dans son fil. Republier la même période crée
    une nouvelle version (l'ancienne est gardée) ; la liste des
    publications précédentes est dans le panneau. Écrit au journal.

2) CHEZ LE CLIENT (son portail)
  · Nouvel onglet « PRÉVISION D'EXPORT » : la date de publication, votre
    mot, puis semaine par semaine chaque commande avec sa date, la
    quantité qui part sur la commandée, l'état, et ce qui a changé
    (« Reportée (prévue le 20/11) », « Nouvelle »…). Les commandes
    reportées au-delà des 2 semaines sont signalées à part.
  · Onglet COMMANDES :
      – une BARRE DE RECHERCHE (référence, modèle, OF, couleur, saison ;
        majuscules et accents ignorés) ;
      – les commandes EN COURS d'abord ; tout ce qui est PARTI, LIVRÉ ou
        ARCHIVÉ chez vous passe dans « 🗄 Archives » (12 derniers mois),
        replié — et ouvert tout seul quand la recherche y trouve quelque
        chose.
  · Toujours rien sur la sous-traitance (vérifié dans la page).

Vérifié : tests (période publiée, état, changements, quantités), essai
navigateur : brouillon (Reportée / Nouvelle), publication, message dans
le fil du client, onglet Prévision d'export, recherche, archives.


═══════════════════════════════════════════════════════════════
LIVRÉ (16/11 v3) — Portail sous-traitant : avancement, archives, charge
═══════════════════════════════════════════════════════════════
Pas de migration.

1) CHEZ L'ATELIER (son portail)
  · Onglet « Commandes (N en cours) » : les commandes EN COURS d'abord ;
    en bas, « ✅ Livrées — archives » (repliées), en lecture seule.
    Une commande passe en « livrée » quand :
      – tout ce qui était attendu (le coupé, sinon la quantité) est reçu
        chez vous (1er + 2e choix, BR) ;
      – ou la dernière livraison reçue n'annonçait PAS de suite (motif
        « manquant », « défaut »… et non « partielle — le reste suit ») ;
      – ou vous l'avez rangée (archivée) de votre côté.
    Une livraison PARTIELLE la laisse en cours.
  · Sur chaque commande : « Livré (reçu) » et « Reste à livrer », et des
    BARRES face à la quantité COMMANDÉE : coupé, lancé, produit (sa chaîne),
    emballé, livré.
  · « 📅 Jour par jour » : pour chaque jour, coupé, lancé, produit et livré
    du jour, avec le total depuis le début entre parenthèses.
  · Onglet Tissu : à côté du bon BST, la COMMANDE et le MODÈLE pour
    lesquels le tissu est parti (« OF-2026-005 · Chemise Oxford »).
  · Rapport de coupe : au-dessus de chaque ligne à remplir, « à couper »
    = les quantités DEMANDÉES par taille (plan de coupe, sinon commande).

2) CHEZ VOUS (« Suivi sous-traitants »)
  · « Avancement déclaré » : en cours d'abord (« voir les livrées » pour
    les autres) ; colonnes commandé, coupé, lancé, produit / commandé (barre),
    livré et reste. Cliquez une ligne : les barres et le jour par jour.
  · Nouvel onglet « CHARGE DES ATELIERS » — pour prévoir la date de
    lancement d'une nouvelle commande :
      – commandes en cours et pièces encore à produire ;
      – rythme = pièces produites par jour ouvré (lundi → samedi) sur les
        14 derniers jours, d'après ses saisies du soir ;
      – « Libre vers le » = quand il aura fini ses commandes en cours à ce
        rythme (« libre maintenant » s'il n'a plus rien).
    C'est une estimation, à confirmer avec l'atelier.

Corrigé au passage : l'« attendu » d'une livraison ne compte plus les
lignes d'une fiche de coupe ANNULÉE (même règle que le coupé de la
commande) ; les dates estimées sautent le dimanche ; les saisies du soir
se lisent dans l'ordre des jours.

Vérifié : tests (jours ouvrés, jour par jour, livrée / en cours, rythme et
date libre), essai navigateur côté atelier (en cours / archives, barres,
jour par jour, tissu avec OF et modèle, tailles à couper) et côté bureau
(avancement détaillé, livrées, charge des ateliers).


═══════════════════════════════════════════════════════════════
LIVRÉ (16/11) — Magasin tissu : le tissu appartient à la FICHE client
═══════════════════════════════════════════════════════════════
Migration 0050 (s'applique toute seule au démarrage).

POURQUOI : le client d'une réception de tissu était un nom tapé à la main
(la liste proposait les clients, mais on pouvait écrire autre chose, ou
rien). Une faute (« Lacost ») suffisait pour que le lot ne soit plus
proposé aux commandes du client et n'apparaisse pas sur son portail.

1) À LA RÉCEPTION : CLIENT OBLIGATOIRE, CHOISI DANS LA LISTE
  · « Client / donneur d'ordre * » est une liste déroulante des fiches
    Clients ; « Enregistrer la réception » reste grisé tant qu'il manque.
  · « + Nouveau » crée le client dans la liste Clients (code CLI-… donné
    tout seul). S'il existe déjà sous ce nom (majuscules, accents, espaces
    ignorés), c'est la fiche existante qui est choisie : pas de doublon.

2) LE LIEN SUIT LA FICHE
  · Renommer un client : son tissu suit (les écrans, étiquettes, portail
    affichent le nom actuel de la fiche).
  · Fusionner deux fiches clients (Clients → doublons) : les réceptions de
    tissu passent sur la fiche gardée, comme les commandes et les BL.
  · Le nom saisi à l'époque reste écrit sur la réception (historique).

3) LES ANCIENNES RÉCEPTIONS
  · Au démarrage, chaque réception est rattachée à sa fiche quand le nom
    saisi correspond à UNE SEULE fiche (casse, accents, espaces ignorés).
  · Les autres apparaissent en haut de l'onglet « Lots en magasin » :
    « ⚠ Réceptions à rattacher à une fiche client ». Une fiche est
    pré-choisie quand elle est la seule possible (« même nom » ou « nom
    proche », ex. BONPOINT → BONPOINT SAS) ; vous vérifiez et cliquez
    « Rattacher ». Rien n'est rattaché sans vous. Chaque rattachement est
    écrit au Journal d'activité.

4) LES LOTS CLASSÉS PAR CLIENT
Onglet « Lots en magasin » :
  · « par client » (coché par défaut) : client → couleur → lots, avec le
    disponible du client et de chaque couleur ; les lots sans fiche client
    viennent à part, en dernier ;
  · filtre « Tous les clients / un client / ⚠ Sans fiche client » ;
  · les filtres existants (En stock, À contrôler, Écart BL…) se combinent.

Vérifié : tests (rattachement proposé seulement s'il est unique,
regroupement client → couleur), essai navigateur : rattachement auto
de « LACOSTE  france » à Lacoste France, BONPOINT proposé vers BONPOINT
SAS puis rattaché, regroupement et filtre, enregistrement bloqué sans
client, « + Nouveau » qui retrouve une fiche existante ou en crée une.


═══════════════════════════════════════════════════════════════
LIVRÉ (étape E, 16/11) — Le portail sous-traitant
═══════════════════════════════════════════════════════════════
Migration 0049 (s'applique toute seule au démarrage).

RÈGLE D'OR : ce que l'atelier saisit est une DÉCLARATION. Elle ne compte
JAMAIS comme production. La production avance quand VOUS validez une
livraison à l'arrivée : le bon de réception (BR) habituel se crée.

1) L'ACCÈS
Menu « Portails extérieurs » → Portail « Sous-traitant », choisir l'atelier,
écrire la personne (« Sami — chef d'atelier »). PIN OBLIGATOIRE (6 chiffres,
retenu 30 jours sur le téléphone, 5 erreurs = 15 min de blocage). « 🖨 QR »
imprime la carte. Nouveau lien / nouveau PIN / couper : comme pour les
clients.

2) CE QUE VOIT L'ATELIER (sur son téléphone, sans compte)
Onglet COMMANDES — les commandes qui lui sont confiées :
  · OF, modèle, référence, couleur, quantité, PRIX DE FAÇON ;
  · « À LIVRER CHEZ NOUS » = date d'export − 7 jours (réglable) et la date
    d'export ; coupé ; reçu et validé chez vous ;
  · PAS le nom du client (réglage « Montrer le nom du client » si vous le
    voulez), JAMAIS le prix de vente ni la marge (test automatique) ;
  · 📐 Plan de coupe : par taille pour son OF, et les tracés (longueur,
    plis, pièces par pli) faits par la modéliste.
« 📝 Saisie du soir » : lancé, produit, emballé, en TOTAUX depuis le début.
  · refusé si impossible (produit > lancé, emballé > produit) ;
  · gardé avec une alerte si bizarre : plus lancé que coupé, un total qui
    baisse, un bond invraisemblable en une journée ;
  · un bouton « à faire » tant que la saisie du jour manque.
« 🚚 Livrer » : taille par taille, 1er choix et 2e choix, comparés à
l'attendu (le coupé, sinon le plan de coupe, sinon la commande) et à ce qui
est déjà livré. S'il y a un écart, il choisit un motif (livraison
partielle, manquant, défaut, surplus, autre) — l'écart ne bloque pas.
→ La livraison reçoit un numéro LST-2026-001, et un BON AVEC QR : il
l'imprime et le colle sur le carton, OU il le montre sur son téléphone.
Il peut retirer une livraison tant qu'elle n'est pas reçue.
« ✂ Rapport de coupe » : pièces coupées par taille, et pour chaque rouleau
reçu : mètres utilisés, chute, reste (le reste = à vous rendre). Refusé si
utilisé + chute + reste ne tombe pas sur les mètres reçus (à 1 % près).
Onglet TISSU — les rouleaux que vous lui avez envoyés (bon BST, couleur,
bain, mètres) : « ✓ Tout bien reçu », ou « Écart » (mètres mesurés +
explication), ou « Pas reçu ».
Onglet MESSAGES — « Un problème, une question », avec PHOTO prise au
téléphone (réduite avant l'envoi), et ses échanges avec vous.

3) CHEZ VOUS — NOTIFICATION, PUIS VALIDER
  · Tout arrive dans la Messagerie (fil « 🌐 … » de l'atelier) : livraison
    annoncée, écart tissu, problème, rapport de coupe.
  · Pastille sur le nouveau menu « Méthodes → Suivi sous-traitants »
    (livraisons + rapports à valider), et bandeau jaune en haut du
    « Magasin produits finis ».
  · À l'arrivée : ouvrir la livraison (depuis le bandeau, la page Suivi, ou
    en SCANNANT LE QR du bon). Les quantités annoncées sont déjà remplies :
    on compte, on corrige si besoin, « ✓ Marchandise reçue : valider ».
    → Le BR se crée par le circuit habituel (mêmes contrôles, mêmes droits) :
    1er choix = conforme (entre au stock, payé), 2e choix = non conforme
    (ni compté, ni payé). L'atelier reçoit le message « reçue : X en 1er
    choix, Y en 2e choix (BR-…) » avec l'écart éventuel.
  · Deux clics en même temps ne font pas deux BR.
  · Rapport de coupe : « ✓ Valider → fiche de coupe » crée une fiche de
    coupe « sous-traitée » (coupé + consommation des rouleaux, pas de
    paquets). Le reste déclaré reste « dehors » : c'est le retour attendu.
    Si l'OF a déjà du coupé, il faut le motif « Complément coupe » (pas de
    double comptage). « ↩ À refaire » renvoie le rapport avec un mot.

4) LA PAGE « SUIVI SOUS-TRAITANTS »
  · À valider : livraisons annoncées, rapports de coupe, dernières
    livraisons traitées (annoncé face au compté) ;
  · Avancement déclaré : par OF, dernière saisie, reçu (BR), date à livrer
    face à la FIN ESTIMÉE (au rythme des 7 derniers jours), montant dû
    (1er choix reçus × prix de façon), alertes, et « SANS NOUVELLE » après
    2 jours sans saisie ;
  · Tissu chez les ateliers : les écarts signalés (le stock ne bouge pas
    tout seul : vous corrigez au Magasin tissu si l'atelier a raison) ;
  · Fiabilité : par atelier, livraisons justes et écart en pièces entre ce
    qu'il annonce et ce que vous comptez ;
  · Réglages : montrer le nom du client, délai avant export.

5) LE CLIENT EN PROFITE, SANS RIEN SAVOIR
Sur le portail client, « Confection » et « Emballage » prennent le plus
grand du réalisé et du déclaré par l'atelier — plafonné à la quantité,
jamais en recul. Le nom de l'atelier, son numéro de livraison, ses messages
n'apparaissent jamais (vérifié dans la page).

Vérifié : tests (cumuls, alertes, sans nouvelle, fin estimée, livraison et
motif, BR 1er/2e choix, montant, fiabilité, rapport de coupe,
cloisonnement), essai navigateur complet : création de l'accès, PIN,
saisie refusée puis acceptée, livraison sans puis avec motif, bon QR, écart
tissu, rapport de coupe refusé puis envoyé, photo/problème, bandeau
magasin, pastille, réception comptée → BR-2026-0004 (17 conformes, 3 non
conformes, production +17), rapport validé → fiche de coupe, portail
client à 22/30 sans aucune trace de l'atelier.

═══════════════════════════════════════════════════════════════
LIVRÉ (étape A, 15/11) — Exercice 2027 : numérotation et choix de période
═══════════════════════════════════════════════════════════════

1) LA NUMÉROTATION REPART À 01/2027
Dans « Nouvelle facture », le numéro est PROPOSÉ tout seul : le numéro
suivant de la série. Chaque type a sa série (facture, avoir, proforma), et
chaque série repart à 01 au 1er janvier : 01/2027, 02/2027… 99/2027,
100/2027.
L'année du numéro est celle de la DATE DE FACTURE, pas celle du jour de la
saisie : une facture datée du 31/12/2026 et saisie le 2 janvier prend un
numéro 2026. Changez la date, le numéro proposé suit.
On peut toujours taper un autre numéro ; l'application avertit (sans
bloquer) si :
  · l'année du numéro ne correspond pas à la date ;
  · le numéro laisserait un trou dans la série ;
  · le numéro EXISTE DÉJÀ — et à l'enregistrement, elle demande
    confirmation avant de remplacer l'autre document. Avant, il était
    remplacé sans un mot.
Une facture supprimée garde son numéro : il n'est pas réattribué.
Le bouton ↻ reprend le numéro proposé.

2) UN SEUL CHOIX DE PÉRIODE, EN HAUT DE L'ÉCRAN FACTURES
Exercice en cours, exercice précédent, un autre exercice, un trimestre, un
mois, toutes les années, ou du… au…. La période choisie est écrite en clair
(📅 Exercice 2026) et elle est RETENUE : on la retrouve en revenant.
Elle s'applique à : tableau de bord, registre, marges par facture,
statistiques interne / façon et rapports. Le libellé de la période est
imprimé en tête de chaque rapport.
Ce qui ne se filtre PAS, volontairement :
  · Relances : tout ce qui reste dû, quelle que soit l'année ;
  · Encaissements : les factures de la période, PLUS toutes celles qui
    restent dues (un impayé de décembre ne disparaît pas le 1er janvier).
    Le « reste à encaisser » dit la part qui vient d'avant la période ;
  · Nouvelle facture : la numérotation voit toujours toutes les factures.

3) COMPARAISON AVEC L'AN PASSÉ
Sur le tableau de bord, le CA net et les pièces disent la variation par
rapport à la même période un an plus tôt (▲ +23,1 % vs 1er trimestre
2025). Rien ne s'affiche quand l'an passé n'a aucune facture.

4) LES ANNÉES NE SE MÉLANGENT PLUS
Le graphique « CA par mois » et le rapport « Évolution mensuelle »
additionnaient les mois de toutes les années (janvier 2026 + janvier 2027).
Ils comptent désormais mois PAR ANNÉE, sur la période choisie.

5) GRAND LIVRE FOURNISSEURS : REPORT À NOUVEAU
Le même choix de période, en haut de la liste et de la fiche d'un compte.
Un compte se lit en trois temps :
  · Report à nouveau : le solde de tout ce qui précède la période ;
  · les mouvements de la période, avec un solde cumulé qui PART du report ;
  · le solde de fin de période.
Le solde d'ouverture de 2027 est donc exactement le solde de fin 2026.
Les mouvements datés après la période (traites à échoir) sont signalés et
non comptés. L'échéancier, lui, montre toujours tout ce qui reste à payer.
L'export CSV porte la période et la colonne « Report à nouveau ».
« Toutes les années » redonne l'affichage d'avant (solde à ce jour).

Vérifié : tests de calcul (périodes, numérotation, report à nouveau),
essai navigateur sur l'écran Factures et le Grand livre.
AUCUNE nouvelle migration pour cette étape.


═══════════════════════════════════════════════════════════════
LIVRÉ (étape B, 15/11) — Paquets fiables : « fini au poste », morceaux,
la coupe décide, le paquet s'assemble par un bouton
═══════════════════════════════════════════════════════════════
Migration 0047 (s'applique toute seule au démarrage).

1) LE SCAN VEUT DIRE « FINI À CE POSTE »
Dans la saisie horaire (tablette et bureau), le bouton « 🏷 Paquet fini »
en face de l'ouvrière ouvre la caméra. L'agent scanne l'étiquette du
MORCEAU qu'elle vient de FINIR. L'application enregistre tout seule :
quel paquet, quel morceau (lu sur l'étiquette), quelle ouvrière, quel
poste (celui de l'heure) et quelle heure.
  · Un même morceau ne se finit qu'UNE fois au même poste : un deuxième
    scan est refusé, même un autre jour (« Déjà fini au poste … par
    Fadila le 15/11 (h1) »).
  · Un numéro TAPÉ (« 2 ») qui existe dans deux OF du même modèle (deux
    couleurs) : l'écran demande lequel. Avant, il prenait le premier et se
    trompait de quantité.
  · Si l'étiquette ne dit pas le morceau (numéro tapé), l'écran demande
    « quel morceau ? ». Deux postes dans l'heure : « quel poste ? ».
  · Un scan raté s'annule (✕ sur la pastille) : il reste dans l'historique.
Au bureau, sous chaque heure : les paquets finis (🏷 1·Col 2·Col) et une
petite case « 🏷 fini » pour taper un numéro ou scanner à la douchette.

2) LES PIÈCES DE L'HEURE SONT PROPOSÉES
Après le scan, la case des pièces se remplit avec le contenu des paquets
finis (si elle est vide ou tient encore la proposition). L'agent corrige
pour un paquet entamé : à 10 h, paquet 12 fini → 25 proposées, il tape 35 ;
à 11 h, paquet 13 fini → 15 proposées (pas 25 : 10 étaient déjà déclarées).
La production reste comptée à la SORTIE DE CHAÎNE, comme avant.

3) LE RECOUPEMENT DE LA JOURNÉE
Récap (tablette) et bas de la journée (bureau) : par ouvrière, pièces
déclarées contre pièces des paquets finis. Un paquet entamé par poste est
normal ; au-delà, c'est signalé sans accuser.

4) LES MORCEAUX (« liasse » devient « morceau »)
À la validation de la fiche de coupe, une nouvelle section « Paquets et
morceaux » demande la liste : Manche, Col, Pied de col, Dos, Poignet…
(boutons pour les listes types). Elle est retenue pour le modèle : le
prochain OF du même modèle la retrouve tout seul.
Paquet 1 → étiquettes « 1 – Manche », « 1 – Col », « 1 – Dos »…
Un morceau OUBLIÉ s'ajoute après coup (Suivi paquets → « ＋ Morceau
oublié ») : ses étiquettes s'impriment seules (Étiquettes QR → filtre
morceau). Un morceau en trop s'ANNULE (il reste dans l'historique).

5) LA COUPE DÉCIDE DE SES PAQUETS
Même section : l'application propose (25 + 25 + 10) et la coupe tape ce
qu'elle a fait, taille par taille : « 20 20 20 », « 3×20 », « 2x30 + 15 ».
La somme doit faire le coupé de la taille, sinon c'est dit et la
validation attend. Une coupe sous-traitée ne crée pas de paquets.

6) LA QUANTITÉ RÉELLE SE CORRIGE (TRACÉ)
Suivi paquets → ✎ à côté des pièces : « 18 au lieu de 20 », avec un motif
obligatoire. L'étiquette imprimée ne change pas ; la correction est au
journal, et tous les calculs prennent la quantité réelle.

7) ASSEMBLÉ PAR UN BOUTON
Dans la grille, « 🧵 Assemblé » sur chaque paquet (et toujours dans la
tournée). Un paquet assemblé n'accepte plus de scan « fini au poste ».

8) LA GRILLE SE REMPLIT SEULE, ET « QUI A FAIT CE PAQUET ? »
Chaque case morceau montre le nombre de postes passés et le dernier poste
(au survol : qui, quand). En haut : « 🔎 Qui a fait ce paquet ? » — on
scanne une étiquette, on voit tout son parcours (poste, ouvrière, chaîne,
heure, corrections).

9) LA CAMÉRA ET LA TOURNÉE, PLUS FIABLES
  · image demandée en haute définition, mise au point continue ;
  · seul le CADRE BLANC est lu : une étiquette voisine ne se lit plus ;
  · après un scan qui ouvre un paquet ou demande un choix, la lecture se
    met en PAUSE (« Scanner un autre paquet » pour reprendre) ;
  · réseau coupé : « scan NON enregistré, rescannez » (avant : silence) ;
  · bouton lampe 🔦 quand le téléphone en a une ; l'écran ne se met plus
    en veille pendant le scan ; un QR étranger avec « % » ne bloque plus la
    caméra.

10) RÉGLAGES ET RATTRAPAGE
  · UN seul interrupteur : activer le suivi dans la GPAO ou dans Suivi
    paquets, c'est la même chose ;
  · les fiches de coupe validées AVANT l'activation sont listées en haut
    de Suivi paquets, avec un bouton pour créer leurs paquets ;
  · les OF frères (autre couleur) prennent la taille de paquet du modèle ;
  · réglages, listes de morceaux : responsable de production et
    administrateur seulement (avant : tout compte connecté).

L'ancien relevé « travaillé dessus » (numéros notés avant ce jour) reste
lisible : au survol au bureau, et dans un tableau « Ancien relevé » quand
une journée en contient.

Vérifié : tests de calcul (proposition des pièces, doublon, découpage,
morceaux), déclencheurs SQL (morceau ajouté oui, retiré non ; quantité
imprimée figée ; journal immuable ; suppression d'une journée possible),
essai navigateur : coupe → paquets → tablette → bureau → grille.


═══════════════════════════════════════════════════════════════
LIVRÉ (étape C, 15/11) — Magasin tissu : le bon tissu, au bon moment
═══════════════════════════════════════════════════════════════

1) AU SCAN DE LA SORTIE, UN FEU DIT SI C'EST LE BON TISSU
Sortie groupée (téléphone) et sortie d'un rouleau : le rouleau est comparé
à l'OF choisi.
  · VERT : réservé à cet OF, ou tissu de ce client, de cette couleur,
    encore libre ;
  · ORANGE : réservé à un AUTRE OF, ou autre référence ;
  · ROUGE : tissu d'un AUTRE CLIENT, ou autre couleur → l'application
    demande « Ajouter quand même ? ». Rien n'est interdit.
Chaque ligne scannée porte sa pastille et, si besoin, la raison.

2) LE BESOIN DE L'OF S'AFFICHE PENDANT LE SCAN
En haut de l'écran de scan : Besoin · Déjà sorti · Reste · Scanné.
« ✓ Le reste à sortir est couvert », « Encore 40 m à scanner », ou
« ⚠ 17,75 m de plus que le reste ». Le coupeur ne revient plus chercher un
rouleau, et on ne sort plus trop.

3) MÉLANGE DE BAINS
Deux bains (lot fournisseur) de la même couleur dans une sortie : bandeau
orange « Blanc : 2 bains mélangés (B1 × 3, B2 × 1). Ne pas les mettre dans
le même matelas », et alerte au scan du rouleau qui change de bain.
Le bon de sortie imprimé range les rouleaux par couleur et par bain, avec
un sous-total par bain.

4) LISTE DE PRÉLÈVEMENT D'UN OF
Accueil du magasin tissu (téléphone) → « 📋 Liste de prélèvement », ou
depuis la sortie groupée une fois l'OF choisi, ou le lien « prélèvement »
de l'onglet Commandes au bureau. Les rouleaux de l'OF en rayon, dans
l'ordre de passage : un bain à la fois, les rouleaux ENTAMÉS d'abord, puis
l'ordre des emplacements. Les rouleaux qui couvrent le reste sont « à
prendre », les suivants « en réserve ». Une case ☐ par rouleau ; elle
s'imprime en A4. Sans lot réservé, elle propose les rouleaux du client qui
conviennent, en le disant.

5) TISSU DEHORS, DEPUIS COMBIEN DE TEMPS
Onglet Rouleaux du magasin tissu : un tableau par lieu (coupe interne,
chaque sous-traitant) avec le métrage sorti non soldé et le nombre de
jours depuis la sortie, le plus ancien en haut (orange après 14 jours,
rouge après 30). Un clic sur le lieu liste ses rouleaux.

Vérifié : tests de calcul (feu, bains, ordre de prélèvement, tissu dehors),
essai téléphone : prélèvement, sortie avec un rouleau d'un autre client
(confirmation demandée), d'un autre bain (bandeau), besoin affiché.


═══════════════════════════════════════════════════════════════
LIVRÉ (étape D, 15/11) — Le portail client
═══════════════════════════════════════════════════════════════
Migration 0048 (s'applique toute seule au démarrage).

1) UN LIEN ET UN QR PAR PERSONNE
Menu « 1 · Commande client » → « Portails extérieurs » (responsable de
production et administrateur). On choisit le client, on écrit qui
utilisera le lien (« Marie — acheteuse »), avec ou sans PIN.
  · le lien et le PIN s'affichent UNE fois (à noter ou à dire de vive voix) ;
  · « 🖨 QR » imprime une carte avec le QR et la marche à suivre (le PIN
    n'y figure jamais) ;
  · pour chaque accès : dernière visite, nombre de visites, journal
    (visites, questions, décisions, OK, PIN faux) ;
  · « Nouveau lien » coupe l'ancien lien et l'ancien QR ; « Nouveau PIN »
    déconnecte les téléphones ; « Couper l'accès » ferme tout. Les autres
    personnes du même client ne sont pas touchées.
PIN : 6 chiffres, demandé une fois par téléphone puis retenu 30 jours ;
5 erreurs de suite bloquent 15 minutes.

2) CE QUE VOIT LE CLIENT (sur son téléphone, sans compte)
Onglet COMMANDES — chaque commande en cours (et celles expédiées depuis
moins de 90 jours) :
  · une frise de six étapes : tissu reçu, coupe, confection, contrôle
    qualité, emballage, expédition, avec les quantités et les dates ;
  · un feu : dans les temps / à surveiller / en retard / expédiée ;
  · ses ÉCHANTILLONS (têtes de série, pièces pour l'OK livraison) avec le
    transporteur et le lien de suivi DHL cliquable, et les boutons
    « ✓ OK » / « ✕ Refuser » (commentaire obligatoire pour un refus) ;
  · ses expéditions, avec le n° de suivi du BL ;
  · « Il manque X m de tissu » → bouton « J'envoie le complément » ;
  · le PASSEPORT TISSU : tissu reçu, mètres coupés pour combien de pièces,
    consommation réelle par pièce face à SA consommation, reste, rendu, et
    la liste des rouleaux et des bains utilisés.
Onglet MON TISSU — ses lots : reçu le, son BL face au métrage mesuré
(manque signalé), en stock, réservé pour quelle commande ; ses restes de
tissu avec « Rendez-le-moi » / « Gardez-le pour une prochaine commande ».
Onglet QUESTIONS — il écrit, sur une commande ou en général.

3) TOUT ARRIVE CHEZ VOUS DANS LA MESSAGERIE
Chaque accès a son fil « 🌐 Client · … · … » (membres : administrateur et
responsables de production). Ses questions, ses OK / refus et ses
décisions y arrivent, avec l'OF déjà indiqué. Ce que vous répondez dans ce
fil, IL LE LIT sur son portail (c'est écrit en tête du fil).
Un OK ou un refus est aussi écrit sur la tête de série elle-même
(Direction technique), au journal de la commande, comme si vous l'aviez
saisi.

4) LA SOUS-TRAITANCE N'APPARAÎT JAMAIS
  · liste fermée : le portail ne lit que des champs choisis un par un
    (lib/services/portail-client.ts) ;
  · un TEST AUTOMATIQUE échoue si ce fichier ou la page touchent un jour
    à un atelier extérieur, une chaîne, une ouvrière, un prix ou une marge ;
  · mêmes étapes et même rythme pour toutes les commandes : l'avancement
    est figé UNE fois par jour (« mis à jour le … · un point par jour ») ;
  · vérifié en vrai : une commande confiée à « ATELIER SECRET » s'affiche
    sans que ce nom apparaisse nulle part dans la page.
Le portail n'affirme jamais où la commande est fabriquée.

5) CÔTÉ BUREAU, POUR ALIMENTER LE PORTAIL
  · Direction technique : chaque tête de série a maintenant
    « Transporteur · n° de suivi » (lien « Suivre le colis ») ; une
    nouvelle section « 📦 Pièces pour l'OK livraison » suit les envois
    pour l'OK livraison, À PART des têtes de série (elles ne comptent pas
    dans l'OK production, et la numérotation TDS1, TDS2… reste sans trou) ;
  · Bons de livraison : champ « N° de suivi (DHL…) » à la création, et
    « + n° de suivi » sur un BL déjà émis (le numéro arrive souvent quand
    le colis part). Il est imprimé sur le BL.

Vérifié : tests (frise, feu, liens de suivi, PIN, cloisonnement), essai
navigateur complet : création du lien, PIN faux puis bon, commandes, OK
sur une tête de série, passeport, tissu, question reçue dans la
Messagerie, aucune fuite du nom de l'atelier.


═══════════════════════════════════════════════════════════════
LIVRÉ (13/10, remis dans cette version) — Le suivi des paquets rentre dans la saisie GPAO
═══════════════════════════════════════════════════════════════

CE QUI N'ALLAIT PAS — et c'était ma faute
J'avais construit le suivi en deux fois, et je n'avais pas rejoint les deux
bouts : la petite case 🏷 de la saisie horaire enregistrait des chiffres
tapés sans savoir que les paquets existent vraiment, pendant que le module
Suivi paquets tenait les vrais paquets de son côté. Deux endroits qui
parlaient de numéros de paquets sans se connaître — exactement le deuxième
système parallèle que vous m'interdisez. C'est corrigé.

1) L'AGENT SCANNE DANS LA CASE DE L'HEURE
La case 🏷, sous les pièces de l'heure, accepte maintenant :
  · un numéro tapé — 12, 13, 12-15, comme avant ;
  · un code scanné — PQ-2026-000012 ;
  · l'adresse entière du QR — https://…/p/PQ-2026-000012/3.
Une DOUCHETTE marche telle quelle : elle « tape » le code, l'application le
convertit en numéro toute seule.
Sur la TABLETTE, un bouton 🏷 en face de chaque ouvrière ouvre la caméra :
bip, vert, paquet suivant. Elle en scanne plusieurs d'affilée sans quitter
l'objectif des yeux.

2) UN SCAN VEUT DIRE « ON A TRAVAILLÉ DESSUS CETTE HEURE-CI »
Rien de plus. Le paquet n'est pas marqué terminé, et un paquet repris à
l'heure suivante se scanne de nouveau — ce n'est pas une erreur, et
l'application ne le signale pas comme telle.

3) LES NUMÉROS SONT DE VRAIS PAQUETS
L'application connaît les paquets que la coupe a créés pour l'OF de la
journée (et pour ses OF frères, qu'une chaîne enchaîne souvent) :
  · un paquet d'un AUTRE OF est refusé nommément ;
  · un numéro qui n'existe pas est refusé ;
  · au survol, la case indique la taille et la quantité du paquet.
Testé en vrai : le code PQ-2026-000012 devient « 12 » ; l'adresse complète
du QR devient « 13 » ; le numéro 99 et un paquet étranger sont refusés.

4) LE RECOUPEMENT PORTE SUR LA VRAIE QUANTITÉ
Avant, le contrôle supposait 25 pièces par paquet. Maintenant il utilise la
quantité réelle de CHAQUE paquet — le dernier paquet d'une taille en
contient souvent 10, pas 25. Un écart qui passait inaperçu est désormais
attrapé : 40 pièces sur deux paquets de 25 et 10 est impossible, et c'est
dit.

5) UNE SEULE VÉRITÉ, PAS DEUX SAISIES
La grille du Suivi paquets a une colonne « En chaîne » qui montre le
dernier jour où la chaîne a travaillé sur le paquet, avec les heures et les
ouvrières au survol. Elle est LUE dans la saisie horaire — rien n'est
réenregistré, et les deux écrans ne peuvent pas se contredire.

6) SI LA COUPE N'EST PAS SUIVIE, RIEN NE CHANGE
Pas de paquets créés pour cet OF ? L'agent tape des numéros comme avant, et
le recoupement se fait sur la taille de paquet réglée. Rien ne bloque.

CE QUI NE CHANGE TOUJOURS PAS
Le relevé ne compte JAMAIS la production : `produit` reste calculé depuis la
sortie de chaîne. Les tests de cloisonnement le vérifient toujours.
La tournée séparée reste utile pour les liasses de préparation — le col, les
manches — que la chaîne ne voit pas. Pour ce qui se passe en chaîne, tout se
fait désormais dans la saisie horaire.

AU PASSAGE : DEUX FICHIERS RENOMMÉS, POUR QU'ON S'Y RETROUVE
`lib/domain/paquets.ts` devient `lib/domain/paquets-heure.ts` (le relevé par
heure), à côté de `lib/domain/paquet.ts` (le paquet lui-même). Les deux noms
se ressemblaient trop ; c'est la racine de la confusion que j'ai créée.

Fichiers — renommés : lib/domain/paquets-heure.ts (+ ses deux fichiers de
tests). Modifiés : lib/services/paquets.ts (carnet par modèle, passages en
chaîne), app/(app)/gpao_prod/(page, store, gpao-app),
app/m/gpao/j/[id]/(page, saisie-tablette), app/(app)/paquets/(page,
paquets-client), lib/domain/saisie-gpao.ts.

═══════════════════════════════════════════════════════════════
LIVRÉ (12/10 v2) — L'application devient utilisable sur un téléphone
═══════════════════════════════════════════════════════════════

CE QUI N'ALLAIT PAS, MESURÉ AVANT DE TOUCHER À QUOI QUE CE SOIT
Sur un écran de 393 px, le menu latéral de 248 px ne se repliait jamais :
il restait **206 à 237 px** pour travailler. Les deux tiers de l'écran
servaient à afficher le menu, et le contenu était coupé à droite.

APRÈS : **393 px sur les 16 écrans mesurés**, aucun débordement.

1) LE MENU SE REPLIE
Sous 1024 px, le menu devient un panneau qui s'ouvre par le bouton ☰ de la
barre du haut, et se referme tout seul dès qu'on choisit une page. Un voile
sombre permet de le fermer d'un appui à côté.
Sur ORDINATEUR, rien ne change : menu à 247 px, zone de travail à 1352 px,
pas de bouton ☰ — vérifié.

2) L'APPLICATION S'INSTALLE SUR L'ÉCRAN D'ACCUEIL
Manifeste + icônes DBS (192, 512, et une version « maskable » pour Android).
« Ajouter à l'écran d'accueil » depuis le navigateur : PilotPro s'ouvre en
plein écran, avec son icône, sans barre d'adresse. Un appui long sur
l'icône propose quatre raccourcis : Tissu, Paquets, GPAO, Magasin.
La barre système prend la couleur de l'application.

3) UN ACCUEIL ATELIER À L'ADRESSE /m
Cette adresse ne menait nulle part. C'est maintenant quatre grosses tuiles
colorées — Magasin tissu, Tournée des paquets, Saisie production, Produits
finis — plus un bouton « Application complète ».
Les tuiles qu'un compte n'a pas le droit d'ouvrir ne s'affichent pas : on
ne propose jamais une porte fermée. C'est aussi l'adresse de démarrage de
l'application installée.

4) LES TABLEAUX LARGES DÉFILENT
Sur 74 tableaux, 43 étaient simplement coupés sans recours. Ils défilent
maintenant horizontalement sur petit écran, sans que l'alignement des
colonnes bouge. Vérifié sur 7 écrans : **0 tableau coupé sans recours**.
Les tableaux déjà dans un conteneur défilant sont laissés tels quels (pas
de double barre), et l'impression n'est pas touchée : la pagination garde
la main sur le tableau entier.

5) LES CHIFFRES DU MATIN TIENNENT SUR UN ÉCRAN
Les tuiles d'indicateurs passent de une à DEUX par ligne, et respirent
moins. Sur Magasin tissu, six indicateurs occupaient six écrans de
défilement : ils tiennent maintenant en trois rangées.
En-tête de page compact (le titre est déjà dans la barre du haut), marges
resserrées à 16 px, entrées de menu plus hautes pour le doigt.

CE QUI N'EST PAS DEDANS, ET POURQUOI
Factures, bons de livraison et archives : vous n'en avez pas besoin sur
téléphone. Ils profitent quand même du menu repliable et du défilement des
tableaux — c'est gratuit — mais je n'y ai pas travaillé l'affichage.
Pas non plus d'affichage « en fiches » à la place des tableaux : c'est un
travail écran par écran, à faire sur les quelques écrans que vous
consulterez vraiment en marchant. Dites-moi lesquels.

Fichiers — nouveaux : components/layout/cadre-app.tsx, app/manifest.ts,
app/m/page.tsx, public/icon-192.png, icon-512.png, icon-maskable-512.png,
apple-touch-icon.png.
Modifiés : app/layout.tsx (viewport + manifeste), app/(app)/layout.tsx,
app/globals.css, components/layout/(sidebar, topbar).tsx,
components/shared/(kpi-card, page-header).tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (12/10) — Deux chiffres qui ne se retapent plus
═══════════════════════════════════════════════════════════════

A) LA DATE D'ARRIVÉE DU TISSU REMONTE AU PLANNING GÉNÉRAL
Le magasinier saisit la réception UNE fois, sur le lot. Cette date apparaît
dans le Planning général, juste sous la date prévue :

      TISSU   [ 15/09/2026 ]        ← la date promise, inchangée
              ✓ reçu 28/09/2026 (+13 j)   ← l'arrivée réelle, en orange
      EXPORT  [ 18/10/2026 ]

  · Vert si c'est arrivé à temps, orange avec les jours de retard sinon.
  · « pas encore arrivé » quand une date est promise et que rien n'est là.
  · La date PROMISE n'est jamais écrasée : « promis le 15, arrivé le 28 »
    est précisément ce que le planning doit voir.
  · Un OF réuni reprend la réception de son porteur ; quand plusieurs lots
    arrivent, c'est la date du dernier qui compte.
  · Export CSV du planning : deux colonnes de plus.

B) LA CONSOMMATION DU PLAN DE COUPE PART D'OFFICE DANS LA NOMENCLATURE
Dès l'enregistrement du plan, la conso de la matière PRINCIPALE est écrite
dans la Nomenclature, avec un message de confirmation. Trois garde-fous :
matière principale seulement, longueurs MESURÉES obligatoires, et écriture
uniquement si la valeur change. Chaque report laisse sa ligne dans le
journal de la fiche, avec l'ancienne et la nouvelle valeur.

═══════════════════════════════════════════════════════════════
LIVRÉ (11/10) — Carnet de paquets : où en est chaque paquet
═══════════════════════════════════════════════════════════════
Nouvel écran « 🏷 Suivi paquets » (menu, étape 3 · Préparation atelier).
Le paquet naît à la coupe et MEURT à l'assemblage : après, ce sont des
pièces entières finies et c'est votre circuit actuel qui prend le relais.

1) LES PAQUETS NAISSENT TOUT SEULS
Quand une fiche de coupe est validée, l'application découpe ce qui a été
coupé en paquets : un OF, une taille, une quantité, un numéro définitif.
Jamais deux tailles dans un paquet. Le dernier paquet d'une taille porte
son reste.
Testé en vrai : OF de 1 200 pièces → 48 paquets numérotés 1 à 48, avec la
plage de pièces de chacun (le paquet 12 = pièces 276 à 300). L'OF réuni
de 260 pièces coupées → 11 paquets (4 en S, 4 en M, 3 en L dont un de 10).
La taille du paquet vient du modèle GPAO, sinon du réglage de l'usine
(25 par défaut) — le même réglage qu'hier, il n'y en a qu'un.

2) UNE ÉTIQUETTE PAR LIASSE, TOUTES AU MÊME NUMÉRO
C'est votre réalité d'atelier : le paquet n° 12 existe en plusieurs
liasses — col et pied de col, devant et patte, manches, carrure et dos —
qui partent chacune à un poste et se retrouvent à l'assemblage.
L'application imprime donc UNE étiquette par liasse, toutes au numéro 12 :
le numéro en gros, le nom de la liasse juste dessous, l'OF, la taille, la
quantité, la plage de pièces, et un QR.
Les quatre QR ouvrent la MÊME fiche, déjà positionnée sur la bonne liasse.
Formats : planche A4 de 24, ou étiquettes 70 × 37 mm — les mêmes marges
que vos étiquettes de rouleaux.
Filtre par plage de numéros : on peut n'imprimer que les paquets 12 à 20.

3) LA TOURNÉE, SUR LE TÉLÉPHONE DE LA RESPONSABLE
« 📱 Faire la tournée » : elle scanne, bip, vert, suivante.
  · Scan QR, douchette, ou numéro tapé à la main si l'étiquette est abîmée.
  · Trois gestes : « liasse finie », « paquet assemblé », « problème ».
  · L'application propose toute seule la liasse suivante à relever.
  · « Relever un autre jour » : si elle n'a pas pu passer hier, elle met la
    date d'hier et le relevé porte ce jour-là.

4) L'ÉCRAN QUI SERT : LA GRILLE
Une ligne par paquet, une colonne par liasse, plus l'assemblage.
En un coup d'œil : le paquet 7 attend ses manches.
Plus : combien de paquets sans nouvelle / en préparation / prêts à
assembler / assemblés, et surtout « telle liasse manque à n paquets déjà
commencés : c'est elle qui retarde le plus d'assemblages ».

5) RIEN NE BLOQUE, JAMAIS — c'est la règle que vous avez posée
  · Une case non relevée est GRISE et dit « sans nouvelle », pas rouge et
    pas « en retard ». Personne n'est passé, c'est tout.
  · On peut marquer un paquet assemblé même si une liasse n'a jamais été
    relevée : la tournée a pu sauter des jours.
  · Trois jours sans responsable = trois jours gris, puis on reprend.
  · La production continue exactement comme avant, sans ce relevé.

6) QUI PEUT RELEVER
Réglage dans l'écran : Administrateur (toujours), Responsable Prod. et
Chef de chaîne cochés par défaut. Votre agent de méthode travaille avec le
compte Responsable Prod. : il est donc couvert.
Les autres rôles voient la grille sans pouvoir y écrire.

7) LES LISTES DE LIASSES
Un catalogue réutilisable : vous tapez « Chemise = col et pied de col,
devant et patte, manches, carrure et dos » une seule fois, puis c'est un
bouton. La liste retenue pour un OF est FIGÉE sur chaque paquet à sa
création : la changer plus tard ne réécrit pas les étiquettes déjà
imprimées. Sans liste, le paquet voyage d'un seul bloc — le suivi marche
quand même, sans rien configurer.

8) ÉTEINT PAR DÉFAUT
Tant que le suivi n'est pas activé (écran → Réglages), aucun paquet n'est
créé et rien ne change nulle part.

9) CE QUI NE CHANGE PAS — LE PLUS IMPORTANT
Le suivi par paquets NE COMPTE JAMAIS la production. `produit`,
`coupe_qte` et `magasin_qte` gardent exactement leurs sources
d'aujourd'hui. Le paquet s'arrête à l'assemblage, là où le comptage
commence : les deux ne se touchent jamais et aucune pièce ne peut être
comptée deux fois.
Vérifié en vrai : après création de 59 paquets puis une tournée complète,
`produit` et `magasin_qte` n'avaient pas bougé d'une pièce.
Six TESTS AUTOMATIQUES verrouillent cette cloison (et refusent même que le
service des paquets écrive dans une table qui n'est pas la sienne).

10) RIEN NE SE SUPPRIME
Annuler une fiche de coupe annule ses paquets — elle ne les efface pas :
les étiquettes ont pu être collées. Les relevés déjà faits restent.
Un relevé ne se modifie pas : on en ajoute un autre, ou on l'annule.
Verrous posés en base (testés) : l'identité d'un paquet est figée, et une
tentative de modifier un relevé est refusée par PostgreSQL lui-même.

Fichiers — nouveaux : lib/domain/paquet.ts (+ 2 fichiers de tests),
lib/services/paquets.ts, lib/actions/paquets.ts, lib/db/schema/paquet.ts,
app/(app)/paquets/ (grille, réglages, étiquettes), app/m/paquets/
(tournée), app/p/[code]/ (adresses courtes des QR),
drizzle/0046_paquets_coupe.sql (+ meta).
Modifiés : lib/services/coupe.ts (naissance et annulation des paquets),
lib/db/schema/(index, preparation), lib/nav.ts.

CE QUI N'EST PAS DEDANS, ET POURQUOI
Pas de scan au contrôle ni au magasin : après l'assemblage ce sont des
pièces entières, vous l'avez dit. Pas de contrôle qualité par paquet. Pas
de blocage du passage au poste suivant — dans un atelier, un système qui
bloque se contourne, et c'est lui qui devient faux.
Conséquence assumée : une chemise finie ne porte plus son numéro de
paquet. Un défaut signalé par le client remonte au jour et à la chaîne,
pas au paquet exact. Si un jour il vous le faut, on laissera le ticket du
paquet dans la chemise jusqu'au contrôle final — sans rien refaire.

═══════════════════════════════════════════════════════════════
LIVRÉ (10/10) — Numéro de paquet à côté des pièces de l'heure
═══════════════════════════════════════════════════════════════
PREMIÈRE ÉTAPE du suivi des paquets : pas de nouveau module, pas
d'étiquette à imprimer, pas de scan. Une petite case en plus dans
l'écran que vos agents remplissent déjà, et l'application vérifie
toute seule que les chiffres se tiennent.

COMMENT ÇA MARCHE
1) Dans GPAO Production, ouvrez une journée. Tout en bas du bandeau
   d'aide, cochez « 🏷 Relever les numéros de paquets ». Le réglage
   vaut pour toute l'usine, bureau ET tablette.
   Tant qu'il est décoché, les écrans sont EXACTEMENT ceux d'avant.
2) Sous chaque case d'heure apparaît une petite case 🏷. L'agent y
   note les paquets travaillés. Il écrit comme il veut :
      12, 13    ·    12 13    ·    12-15    ·    12 à 14, 20
   Les doublons sont retirés, la liste est triée et réécrite
   proprement (« 12, 13, 14, 16 » devient « 12-14, 16 »).
3) L'application calcule et signale :
   ⛔ « 55 pièces déclarées, or 2 paquets n'en contiennent que 50. »
      → impossible : il y a une erreur quelque part.
   ⛔ « Paquet 60 : cet OF n'en compte que 48. »
      → numéro inexistant (faute de frappe, ou mauvais OF).
   ⛔ sur la JOURNÉE : « 76 pièces, or 1 paquet ne fait que 25. »
   ⚠ « 3 paquets notés pour seulement 20 pièces » → deux paquets
      entiers sans explication, à vérifier.
   ⚠ « Paquet 12 noté par Fadila et Sonia sur le même poste. »
      → la même opération comptée deux fois ?
4) Un récapitulatif en bas de la journée : par ouvrière, les pièces,
   les paquets notés, ce qu'ils contiennent et l'écart. Plus la
   couverture du jour (« vus aujourd'hui : 1, 2, 12-15 »).

CE QUI N'EST PAS UNE ERREUR
Un écart NÉGATIF est normal : un paquet entamé à 10 h se finit à 11 h.
L'application ne le signale qu'à partir de DEUX paquets entiers sans
pièces. Elle ne crie jamais pour rien — sinon personne ne la croirait.

TAILLE DU PAQUET
Réglage de l'usine : 25 pièces par défaut, modifiable à côté de la
case à cocher. Un modèle peut en fixer une autre dans sa fiche
(« Pièces par paquet (coupe) », 0 = suivre l'usine) : rien n'est
imposé, un paquet peut contenir 17 pièces.
Le dernier paquet d'un OF porte le reste (1 210 pièces par 25 = 48
paquets de 25 + 1 de 10), et le calcul en tient compte.

CE QUI NE CHANGE PAS — LE PLUS IMPORTANT
Le relevé des paquets NE COMPTE JAMAIS la production. `produit`,
`coupe_qte` et `magasin_qte` gardent exactement leurs sources
d'aujourd'hui : la production reste celle de la SORTIE DE CHAÎNE.
Il n'y a pas de deuxième comptage, et donc aucun risque de compter
deux fois les mêmes pièces.
Cette règle est protégée par des TESTS AUTOMATIQUES (8 tests dédiés) :
si quelqu'un, dans deux ans, branche les paquets sur l'avancement,
les tests échouent et le disent.
La saisie horaire des ouvrières n'est pas modifiée. Les journées
existantes ne sont pas touchées. Une journée sans aucun numéro noté
se comporte comme avant.

DROITS
Le relevé suit les droits de la saisie GPAO (module « GPAO
Production »). Une journée clôturée refuse les paquets comme le reste.

Fichiers — nouveaux : lib/domain/paquets.ts (+ 2 fichiers de tests),
drizzle/0045_suivi_paquets.sql (+ meta).
Modifiés : lib/domain/saisie-gpao.ts (+ test), lib/db/schema/gpao.ts,
lib/services/saisie-gpao.ts, app/(app)/gpao_prod/(page, store, actions,
gpao-app, modals), app/(app)/gpao_prod/tv/[id]/page.tsx,
app/m/gpao/j/[id]/(page, saisie-tablette).

POUR LA SUITE (pas dans cette livraison)
Si ce relevé est rempli pendant un mois, l'étape suivante est le
carnet de paquets : numéros créés à la coupe, étiquettes QR par
liasse (col, devant, manches, dos), et une grille « où est le
paquet 7 ». On en reparle à ce moment-là, pas avant.

═══════════════════════════════════════════════════════════════
LIVRÉ (02/10 v4) — Chiffres tissu cohérents + « à entrer » magasin corrigé
═══════════════════════════════════════════════════════════════
A) MAGASIN TISSU / COMMANDES / NOMENCLATURE
1) « Libre » d'un lot = ce qui est ENCORE dans le magasin, moins ce qui est
   encore réservé et pas encore sorti (commande par commande).
   Exemple : reçu 1000, 600 réservés pour l'OF A, A sort 600 et en rend 100,
   300 sortis pour l'OF B sans réservation, inventaire −20 →
   en stock 180, encore réservé 100 (A a gardé 500 sur 600) → Libre 80.
   (Avant : 400, plus que le stock réel.) Le Libre n'est jamais négatif.
   On ne peut donc plus réserver du tissu qui n'est plus là.
2) Commandes : le tissu sorti pour une commande DÉDUIT les retours au
   magasin (comme dans le magasin tissu).
3) Commandes : un OF réuni sous un porteur (ou une part) affiche
   « matière gérée par OF-xxx » au lieu de son propre besoin et de
   « Besoin non affecté » : la même matière n'est plus comptée deux fois.
   Nomenclature : son écart tissu se calcule sur le besoin de tout le groupe.
4) Commandes : l'écart tissu se calcule sur le tissu AFFECTÉ depuis les
   lots quand il y en a (comme la Nomenclature), sinon sur l'ancien
   champ « reçu ».
5) Mots plus clairs : dans les lots, « Consommé » devient « Sorti (net) »
   (= sorti du magasin moins les retours ; la vraie consommation de coupe
   est dans la fiche de coupe). Survol de chaque case = explication.
   Nomenclature : « Conso réelle » devient « Conso plan de coupe ».

B) MAGASIN PRODUITS FINIS
6) « À entrer » ne dépasse JAMAIS la commande (ni la place restante
   quand une partie est déjà entrée par une autre voie).
7) Un modèle GPAO est relié à un seul OF. Quand il produit plus que cet OF,
   le surplus va automatiquement aux autres OF du MÊME client et du MÊME
   modèle (nom comparé sans majuscules/accents), dans l'ordre des dates
   d'export, jusqu'à leur quantité. Pas aux OF chez un façonnier ni aux
   OF archivés. S'il reste encore des pièces, l'écran affiche
   « ⚠ production GPAO en trop : n pcs, à vérifier » — elles ne sont PAS
   comptées « à entrer ». Recalcul automatique à chaque saisie GPAO, quand
   on relie/détache un modèle, ou quand on change la quantité, le modèle,
   le client, la date d'export ou le façonnier d'une commande.
   Testé : 5 400 pcs GPAO sur un modèle relié à un OF de 1 200 → 1 200,
   puis OF du 01/10 (500) et OF du 01/11 (400) servis, 3 300 signalées en
   trop. Avec 1 800 pcs → 1 200 / 500 / 100.

Fichiers modifiés : lib/domain/tissu.ts (+ test), lib/domain/aval.ts
(+ test), lib/services/(tissu, commandes, preparation, avancement, gpao,
aval).ts, app/(app)/commandes/commandes-client.tsx,
app/(app)/magtissu/magtissu-client.tsx, app/(app)/preparation/(config.ts,
fiches.tsx), app/(app)/magasin/(magasin-client, dialogs).tsx,
app/m/magasin/(page, magasin-mobile).tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (02/10 v3) — Historique ouvrière : plus aucune journée perdue (fusion auto)
═══════════════════════════════════════════════════════════════
La cause : certaines journées portaient le nom écrit autrement que la fiche
du personnel (« Mariem Dridi » pour la fiche « Dridi Meriem », « Houriya Ben
Selim » pour « Ben Salem Hourya »), ou l'identifiant d'une fiche supprimée
par une fusion. L'application les rangeait sous un AUTRE nom : elles
manquaient dans l'historique et la moyenne était fausse.

Désormais, automatiquement, sans rien à faire :
  · Une journée est rattachée à la bonne fiche même si le nom a une faute
    (une lettre de différence par mot, deux sur un mot long, mots dans le
    désordre, « Bensalem » / « Ben Salem »). Sécurités : il faut au moins
    2 mots (un prénom seul ne suffit jamais) et UNE seule fiche qui
    correspond ; s'il y a deux fiches possibles, on ne choisit pas.
  · Les fusions de fiches sont MÉMORISÉES (ancienne fiche → fiche gardée) :
    les journées anciennes suivent toujours la fiche actuelle.
  · Une personne « sortie » garde tout son historique (elle n'est simplement
    plus proposée à la saisie).
  · On ne peut plus supprimer une fiche qui a des journées : message
    « passez-la en sortie, ou fusionnez-la ».
  · La même règle sert à l'historique, au classement par seuil, aux arrêts
    et retouches, à l'écran TV et au portail QR.
  · Résultat : chaque ouvrière apparaît UNE seule fois dans la liste de
    l'historique, avec toutes ses journées, et la moyenne porte sur toutes.

Historique : nouveau filtre « Rendement du jour entre X et Y » : seules les
journées dans la plage s'affichent (« 15 sur 20 travaillées »), la moyenne
est calculée sur ces journées. Une journée sans saisie n'est jamais inventée.

Testé avec les noms réels du registre : Dridi Meriem et Ben Salem Hourya,
3 journées chacune sous des orthographes différentes (dont une ancienne
fiche fusionnée) → avant : éclatées sous 2 ou 3 noms ; après : 3 journées
chacune, une seule ligne dans la liste ; filtre 80–90 % → 1 journée sur 3.
Tests ajoutés : 20 journées → 20 dans l'historique et moyenne sur 20,
fusion, orthographes, garde-fous (prénom seul, autre personne), filtre.

Fichiers — nouveaux : drizzle/0044_memoire_fusions_personnel.sql (+ meta).
Modifiés : lib/domain/rendement-personne.ts (+ test), lib/db/schema/gpao.ts,
lib/services/(identite-ouvrieres, portail, atelier),
app/(app)/gpao_prod/(page, store, gpao-app, histo).

═══════════════════════════════════════════════════════════════
LIVRÉ (02/10 v2) — Module COUPE : depuis le plan de coupe, tissu tracé, PV client
═══════════════════════════════════════════════════════════════
Flux : Commande → OF → Plan de coupe → Fiche de coupe → Consommation → PV.
Rien n'est dupliqué : la coupe LIT la commande, le plan et les rouleaux.

1) COMMANDES ACTIVES / TERMINÉES / ARCHIVÉES (archivage existant réutilisé)
   · TERMINÉE = livrée ET facturée (votre choix) : expédiée (BL couvrant la
     quantité, export réel ou statut « Livrée ») et au moins une facture.
   · Commandes : bouton « 🗄 n terminée(s) à archiver » → les coche → le
     bouton « 🗄 Archiver » habituel (journalisé, réversible depuis Archives).
   · Archives : nouveau filtre « Facturées / Non entièrement facturées /
     Livrées en retard » (la recherche client/OF/modèle et l'année existaient).
   · Service coupe : les commandes livrées / facturées sont rangées par
     défaut (même bouton que nomenclature et magasins).
   · SUPPRIMER une commande est REFUSÉ dès qu'elle a un historique (coupe,
     plan, réception, BL, tissu, production, facture) — message « archivez-la ».
     Une commande saisie par erreur, vierge, se supprime comme avant.
   · Le « coupé » d'une commande qui a des lâchers / fiches ne se tape plus à
     la main dans la grille Commandes (il est leur somme).

2) LA COUPE PART DU PLAN — Service coupe → « ✂ Couper depuis le plan »
   (colonne « Plan de coupe » : prêt / longueurs estimées / sans tracés)
   Assistant sur une page :
   1. Plan + commande : client, OF (+ OF réunis), modèle, référence, couleur,
      tissu — affichés, rien à saisir.
   2. Tailles importées du plan.
   3. Commandé / Prévu (plan : plis × tracés, ou quantités du plan) / Coupé
      (PRÉ-REMPLI avec le prévu, rien à retaper) / Écart (+ %).
      OF réunis : une seule fiche, le coupé est réparti PAR OF (chacun
      reçoit son commandé, le surplus du plan va au porteur ; modifiable).
      Écart au-delà du SEUIL (2 % par taille, réglable par admin/resp sur
      l'écran Coupe) → motif OBLIGATOIRE : manque tissu, défaut tissu,
      changement client, complément coupe, réassort, autre (à préciser).
      En dessous du seuil : écart affiché, motif facultatif.
   4. Rouleaux sortis pour l'OF (scan / sortie groupée) : sorti, déjà
      déclaré, encore en coupe ; on saisit consommé et chute (bouton « tout
      le tissu encore en coupe a été consommé »). Les consommations déjà
      déclarées au scan sont RATTACHÉES à la fiche. La fiche ne SORT rien
      du stock (pas de double déstockage — vérifié : 0 sortie créée).
      Théorique (conso prévue/pièce × pièces coupées) / Réel / Écart m et %.
   5. Valider → fiche CP-2026-001, FIGÉE (prévu et coupé conservés).
   6. « 📄 GÉNÉRER LE PV DE COUPE ».
   · Le coupé de chaque OF (commande.coupeQte) reste la somme des lignes de
     coupe : la production reste contrôlée comme avant.
   · Erreur ? « Annuler cette fiche » (motif) : elle reste visible, barrée ;
     ses quantités sortent du coupé ; les consommations qu'elle a déclarées
     sont annulées (mouvements d'annulation), celles qu'elle avait
     rattachées sont détachées ; on refait une fiche.
   · Sans plan de coupe : la saisie libre d'un lâcher reste possible, signalée
     « exception » ; avec un plan, la coupe passe par le plan.

3) PV DE COUPE CLIENT (PVC-2026-001)
   · Logo, n° PV + version, date, client, OF, référence et désignation du
     modèle, couleur, tissu ; tableau Taille / Commandé / Plan de coupe /
     Coupé / Écart + TOTAL ; répartition par OF ; motif de l'écart ;
     CONSOMMATION TISSU (tissu, couleur, lot, rouleau, métrage, chute) +
     théorique / réelle / écart m et % ; signatures DBS FASHION et CLIENT
     (nom, fonction, signature). Imprimable / PDF.
   · Chaque génération est une VERSION FIGÉE (données copiées) : « Régénérer »
     crée la v2, la v1 reste consultable (boutons de versions sur le PV).
     Fiche annulée après coup : le PV l'indique.

4) VERROUS EN BASE (testés) : une fiche validée, ses lignes, un PV généré ne
   se modifient pas ; un mouvement tissu ne passe jamais d'une fiche à une
   autre ; tout est journalisé (validation, annulation, PV, seuil).

Testé (navigateur) : OF-001 + OF-002 réunis, plan 2 tracés (S 500, M 500,
L 502) → pré-remplissage 400/400/402 + 100/100/100 ; S coupé 380 → écart
−20 (−4 %) bloqué sans motif, validé avec « Manque tissu » ; 3 rouleaux
(dont 30 m déclarés au scan, rattachés) → réel 300 m, théorique 296,4 m,
+1,21 % ; fiche CP-2026-001, coupé des deux OF à jour ; PV v1 puis v2 ;
annulation (coupé rétabli, consommations annulées, rouleaux à nouveau en
coupe) ; suppression d'une commande facturée refusée, commande vierge
supprimée ; terminée archivée puis visible dans Archives et absente de la
coupe ; déclaration de consommation au scan toujours fonctionnelle.

Fichiers — nouveaux : drizzle/0043_coupe_depuis_plan_pv.sql (+ meta),
lib/domain/coupe.ts (+ test), lib/services/coupe.ts, lib/actions/coupe.ts,
app/(app)/coupe/(nouvelle/page, nouvelle/assistant, fiche/[numero]/page,
fiche/[numero]/actions-fiche, pv/[numero]/page).
Modifiés : lib/db/schema/(aval, tissu), lib/domain/commande (+ test),
lib/services/(aval, commandes, rouleaux), lib/actions/(commandes, rouleaux),
app/(app)/coupe/(page, coupe-client), app/(app)/commandes/commandes-client,
app/(app)/archives/archives-client.

Points restant à améliorer (prochaines étapes possibles) : coupe par
matière secondaire (doublure) avec sa propre consommation ; saisie de la
fiche sur tablette à l'atelier ; envoi du PV au client par e-mail.

═══════════════════════════════════════════════════════════════
LIVRÉ (02/10) — Réception « métrage au scan » (au choix) + bon récapitulatif
═══════════════════════════════════════════════════════════════
1) DEUX FAÇONS DE RÉCEPTIONNER, au choix pour chaque lot (selon le
   personnel disponible) — Magasin tissu → 📦 Réception tissu, sous le lot :
   · 📋 « Saisir les métrages maintenant (bureau) » : votre façon actuelle,
     inchangée (métrage de chaque rouleau, étiquettes déjà remplies).
   · 🏷 « Étiquettes à remplir au magasin (métrage au scan) » : on tape
     seulement le NOMBRE de rouleaux. Les étiquettes s'impriment avec une
     case « Métrage : ______ m » (et « Laize : ____ cm » sur l'A4 ×4).
   · Les deux se combinent sur un même lot (« + étiquettes à remplir au
     magasin » sous les rouleaux déjà saisis).

2) 📱 MESURER AU SCAN — Scanner → « 📏 Mesurer les rouleaux (n à mesurer) »
   · Caméra ouverte en continu. On présente l'étiquette, un grand champ
     s'ouvre : on tape le métrage écrit au stylo (laize, défaut et
     emplacement en option) → « ✔ Valider · en stock ». Rouleau suivant.
   · Cette validation fait d'un coup : l'entrée du rouleau, sa mise en stock
     et le reçu du lot (le lot affiche « 3/4 mesurés »).
   · Faute de frappe : un métrage très éloigné du BL (350 au lieu de ~60)
     demande confirmation.
   · Un rouleau saisi au bureau (en attente) scanné ici passe en stock
     directement. Un rouleau déjà mesuré : « déjà mesuré : 61,5 m ».
   · Scanner un rouleau « à mesurer » depuis l'accueil ouvre aussi le
     formulaire de mesure ; la fiche bureau du rouleau le propose aussi.
   · Le métrage s'écrit UNE fois puis se fige (verrou en base, testé) :
     une erreur se corrige par « Corriger le métrage », comme avant.
   · Tant qu'il n'est pas mesuré, un rouleau ne peut ni sortir, ni être
     consommé, ni rendu (message clair au scan).
   · Rouleau EN MOINS (le BL en annonçait plus) : « annuler » l'étiquette
     (fiche lot au bureau, ou fiche rouleau au téléphone) — elle reste
     visible, barrée, avec le motif. Rouleau EN PLUS : « + Étiquette
     (rouleau en plus) » dans la fiche du lot, elle s'imprime aussitôt.
   · Bureau : indicateur « Rouleaux à mesurer (scan) », badge
     « 📏 4 à mesurer » sur le lot, statut « Rouleaux à mesurer ». Le
     contrôle d'écart avec le BL client attend la dernière mesure (pas de
     fausse réclamation).

3) 🧾 BON RÉCAPITULATIF (BSR-2026-001…)
   · Onglet Rouleaux : cochez des rouleaux partis chez le même destinataire
     — même s'ils ont DÉJÀ chacun leur bon BST — puis « 🧾 Bon
     récapitulatif ». Un seul document : sous-traitant, une ligne par
     rouleau (avec son OF et son bon d'origine), total, « Regroupe les
     bons : BST-… », signatures « remis par / reçu par ».
   · Les bons d'origine restent intacts et valables. Même sélection →
     réimpression du même récapitulatif. Destinataires différents → refusé.
   · Liste « Bons récapitulatifs » dans l'onglet Rouleaux pour réimprimer.
   · Le message « des bons sont déjà établis » propose désormais le
     récapitulatif.
   · Le bon BST et le récapitulatif partagent la même mise en page (le
     total compte les rouleaux, pas les lignes).

Testé : réception mixte (lot de 4 étiquettes à mesurer + lot saisi au
bureau) → 5 étiquettes, cases « Métrage » ; mesure au téléphone 61,5 m
puis 350 m (alerte), rescan « déjà mesuré », rouleau du bureau mis en stock
au scan ; fiche rouleau → 60 m + emplacement A-01 ; étiquette annulée ;
rouleau en plus ; verrous en base (re-mesure et retour « à mesurer »
refusés) ; 3 rouleaux sur 3 bons BST → récapitulatif BSR-2026-001,
réimpression, refus d'un mélange sous-traitant / coupe interne.

Fichiers — nouveaux : drizzle/0042_rouleaux_a_mesurer_recap.sql (+ meta),
app/m/tissu/mesure/(page, mesure-rafale, form-mesure, mesure-fiche),
app/(app)/magtissu/recap/[numero]/page.tsx,
app/(app)/magtissu/sortie/document-sortie.tsx.
Modifiés : lib/db/schema/tissu.ts, lib/domain/(rouleau, tissu) (+ tests),
lib/services/(rouleaux, tissu), lib/actions/(rouleaux, tissu),
app/(app)/magtissu/(page, magtissu-client, rouleaux-ui, reception/
reception-client, etiquettes/rouleaux/page, rouleaux/[code]/page,
sortie/[numero]/page), app/m/tissu/(page, ui, r/[code]/page).

═══════════════════════════════════════════════════════════════
LIVRÉ (30/09) — Moins d'encombrement, scan en rafale, un bon pour plusieurs
rouleaux, lots supprimables / archivés
═══════════════════════════════════════════════════════════════
1) Commandes LIVRÉES ou FACTURÉES rangées (Nomenclature, Magasin tissu,
   Magasin fournitures — et les autres écrans de préparation, même écran)
   · Par défaut elles n'apparaissent plus. Un bouton en haut du tableau
     dit combien sont rangées : « 2 livrées / facturées rangées » → un clic
     les ressort (pastille LIVRÉE / FACTURÉE sur la ligne), un autre les
     range. Rien n'est supprimé.
   · Une seule règle pour tous les écrans (lib/domain/commande →
     clotureCommande) :
       FACTURÉE = au moins une facture la porte (même 995 sur 1 000 : à
                  l'export on livre rarement le nombre exact) ;
       LIVRÉE   = expédiée (BL couvrant la quantité ou marquée expédiée),
                  date d'export réelle saisie, statut « Livrée » posé à la
                  main, ou archivée.
   · Magasin tissu : les indicateurs « à demander au client » et les
     demandes de complément ignorent les commandes rangées.

2) 📱 Sortie groupée au téléphone : SCAN EN RAFALE
   · À l'étape « scanner », la caméra s'ouvre toute seule et RESTE
     ouverte : on passe les rouleaux devant l'objectif les uns après les
     autres, sans toucher l'écran.
   · À chaque rouleau, sur l'image : bip + cadre VERT « ✔ R-2026-000145 ·
     100 m » ; ORANGE « déjà scanné » (doublon ignoré, double bip doux) ;
     ROUGE avec la raison (inconnu, non réceptionné, vide, lot refusé) et
     vibration. Compteur permanent en haut : « 12 rouleaux · 845 m ».
   · Les lectures sont traitées dans l'ordre : même un rouleau lu deux fois
     de suite très vite ne peut pas entrer deux fois.
   · La douchette et la saisie à la main marchent toujours.

3) 🖨 UN SEUL BON pour les rouleaux cochés (déjà sortis un par un)
   · Magasin tissu → Rouleaux (QR) : case « 🚚 sortis sans bon » pour les
     retrouver, cochez-les → « 🖨 Bon de sortie (n) ». Un bon BST-2026-00x
     est établi et s'ouvre à l'impression.
   · Un bon = un seul destinataire : si les rouleaux cochés sont partis à
     des endroits différents, PilotPro le dit et n'établit rien.
   · Rouleaux de plusieurs modèles : le bon affiche « Plusieurs — voir le
     détail » et une colonne « Modèle / OF » par rouleau ; sorties sur
     plusieurs jours : « sorties du … au … » ; « Sorti par » = qui a
     scanné.
   · Déjà sur un bon : réimpression de ce bon. Mélange de bons différents :
     refusé (« décochez-les »).
   · Dans la liste, sous « 🚚 chez X » : le n° du bon (cliquable) ou
     « sans bon ».
   · Rien ne bouge en stock : on inscrit seulement le n° de bon sur les
     sorties qui n'en avaient pas. La base n'autorise QUE ce passage
     « sans bon → BST-… » (un bon inscrit ne change jamais — testé).

4) LOTS : modifier, supprimer un lot entier, archiver
   · ✏️ « Modifier le lot » (dans la fiche du lot) : identifiant,
     référence, couleur, code couleur, composition, lot fournisseur,
     saison, note. Les métrages ne se tapent pas : ajustement (lot) ou
     correction (rouleau), pour garder l'historique juste.
   · 🗑 « Supprimer le lot » : le lot ENTIER part (rouleaux, étiquettes,
     affectations). Réservé aux ERREURS de réception : possible tant que
     rien n'est sorti, revenu, consommé ou rendu (réceptionner, ranger,
     déplacer ne comptent pas). Motif obligatoire, écrit au journal
     d'activité avec la liste des rouleaux. Sinon le bouton n'apparaît
     pas : on archive.
     (Avant : suppression impossible dès le 1er rouleau scanné au
     magasin — trop strict pour corriger une réception mal saisie.)
   · 🗄 ARCHIVÉS : un lot ÉPUISÉ (plus rien au magasin, rien en coupe) est
     archivé D'OFFICE, sans geste — un retour en stock le fait revenir
     tout seul. Un lot avec un petit reste inutilisable s'archive à la
     main (« 🗄 Archiver », confirmation si du stock reste) ; « ↩ Ressortir
     des archives » l'y remet. Filtre « 🗄 Archivés (n) » dans Lots.
   · Les lots archivés sortent des listes, des alertes (à contrôler, à
     réclamer) et des lots
     proposés aux commandes ; leurs rouleaux (et les rouleaux épuisés,
     rendus, retournés) sont masqués dans l'onglet Rouleaux — case
     « 🗄 finis / archivés (n) » pour les revoir. Historique, bilans et
     reliquats restent intacts.

Testé : 4 commandes (1 facturée, 1 expédiée) → rangées sur Nomenclature,
Magasin fournitures, Magasin tissu, et ressorties d'un clic ; caméra
simulée R-3, R-4, R-3 (doublon), R-6 (non réceptionné) → 2 rouleaux
retenus sans toucher l'écran, bon BST-2026-001 ; R-1 (OF-001) + R-2
(OF-002) sortis sans bon → BST-2026-002 avec colonne Modèle / OF,
réimpression, refus d'un mélange de bons, verrou en base vérifié ; lot
épuisé en « Archivés », archivage / suppression d'un lot mal saisi
(journal), lot vécu non supprimable, modification de la composition.

Fichiers — nouveaux : drizzle/0041_lots_archives_bon_apres_coup.sql
(+ meta), components/shared/bascule-rangees.tsx, components/shared/son.ts.
Modifiés : lib/domain/(commande, tissu, rouleau) (+ tests),
lib/services/(preparation, matiere-tissu, tissu, rouleaux, fournitures),
lib/actions/(tissu, rouleaux), lib/db/schema/tissu.ts,
app/(app)/preparation/ecran.tsx, app/(app)/magtissu/(magtissu-client,
rouleaux-ui, sortie/[numero]/page), app/m/tissu/sortie/sortie-groupee.tsx,
components/shared/scanner-qr.tsx, components/messagerie/etat.ts (son
partagé), app/globals.css (animation du scan).

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v7) — Messagerie interne (style WhatsApp Web, dans PilotPro)
═══════════════════════════════════════════════════════════════
Où : menu Pilotage → « Messagerie » (pastille verte = non lus), ou la bulle
verte 💬 en bas à droite de TOUTES les pages.

Écrire :
  · 👤+ Nouvelle discussion : choisir une personne (tous les comptes actifs).
  · 👥 Nouveau groupe : un nom + les membres (groupes libres). Le créateur
    est administrateur du groupe : il renomme, ajoute, retire ; chacun peut
    quitter. Les changements s'affichent dans le fil.
  · Entrée = envoyer, Maj+Entrée = nouvelle ligne.
  · 📎 Photo, PDF, Excel, Word, CSV (10 Mo max ; photos réduites
    automatiquement) — aussi par glisser-déposer ou copier-coller.
  · 📦 Citer une commande (OF) : carte cliquable qui ouvre la commande
    (l'écran Commandes accepte maintenant /commandes?q=OF-…).
  · Supprimer SON message (« Ce message a été supprimé » pour tous).

Savoir si c'est lu (comme WhatsApp) :
  ✓ envoyé · ✓✓ gris = lu par une partie du groupe · ✓✓ bleu = lu par tous.
  Survol de son message → ⓘ « Lu par » (qui, à quelle heure) / « Pas encore
  lu ». En tête de discussion : « en ligne » ou « vu aujourd'hui à 10:32 ».

Recevoir (sur l'écran de l'ordinateur) :
  · Sur n'importe quelle page de PilotPro, en moins de 6 secondes, une
    fenêtre s'affiche en bas à droite : qui, le message, « Répondre »
    (+ un petit son). Le nombre de non lus est dans le menu, sur la bulle
    et dans le titre de l'onglet « (3) PilotPro ».
  · PilotPro en arrière-plan (autre fenêtre devant) : notification Windows /
    Mac, une fois cliqué « Activer les alertes sur l'ordinateur » en haut de
    la messagerie (le navigateur demande l'autorisation une fois par poste).
  · « Répondre » ouvre la discussion et la marque lue → l'expéditeur voit ✓✓.

Confidentialité : on ne lit que les discussions dont on est membre (testé :
un 3e compte ne voit ni ne récupère une discussion privée). Pièces jointes
servies uniquement aux comptes connectés (même stockage que les photos QC).

Testé à 3 comptes : Admin écrit à Resp → alerte sur la page Commandes de
Resp, pastilles et onglet « (1) » ; « Répondre » → ✓✓ bleu chez Admin ;
réponse avec photo, PDF et OF ; groupe « Chaîne 2 » → ✓✓ gris et « Lu par
Resp / Pas encore lu Chef DBS » ; accès refusé au 3e compte.

Remarques : relève toutes les 3 s (discussion ouverte) / 6 s (ailleurs) —
largement suffisant pour une équipe et sans service externe. Les pièces
jointes utilisent le bucket déjà configuré sur Railway.

Fichiers — nouveaux : drizzle/0040_messagerie.sql (+ meta),
lib/db/schema/messagerie.ts, lib/domain/messagerie.ts (+ test),
lib/services/messagerie.ts, lib/actions/messagerie.ts,
app/api/messagerie/(releve, fichier), app/(app)/messagerie/,
components/messagerie/(etat, veille).
Modifiés : lib/db/schema/index.ts, lib/nav.ts, components/layout/sidebar.tsx,
app/(app)/layout.tsx, lib/services/fichiers.ts (formats par usage),
app/(app)/commandes/(page, commandes-client) (recherche ?q=).

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v6) — Sortie de rouleaux : modèle + coupe interne ou SOUS-TRAITANT
═══════════════════════════════════════════════════════════════
1) Sortie d'un rouleau (scan → SORTIE), en 3 étapes :
   1. Modèle / commande (OF) — les commandes réservées sur le lot d'abord,
      « Voir toutes les commandes » avec recherche ;
   2. Où part le tissu : ✂ Coupe interne · 🚚 Sous-traitant · Atelier ·
      Autre. Sous-traitant → on choisit LEQUEL (liste des façonniers, hors
      DBS / interne).
      Une commande sous-traitée propose d'office son façonnier ; une commande
      sur chaîne interne propose « Coupe interne ». Modifiable.
   3. Métrage (tout le rouleau par défaut).
   Le bouton dit tout : « ✔ Sortir 100 m → SAJ ».

2) 🚚 Sortie groupée (bouton sur l'écran Scanner, ou onglet Rouleaux :
   cocher des rouleaux → « Sortie groupée ») :
   modèle + lieu choisis UNE fois, puis on scanne les rouleaux (rouleau
   entier par défaut, métrage modifiable). Doublon, rouleau inconnu, vide,
   non réceptionné ou lot refusé : refusés au scan. Tout ou rien à la
   validation. Un bon numéroté BST-2026-001 s'imprime :
   « BON DE LIVRAISON TISSU — SOUS-TRAITANCE » (sous-traitant, modèle,
   rouleaux, lots, tissu, couleur, lot fournisseur, laize, métrages, total,
   signatures « remis par / reçu par »). Réimpression : onglet Rouleaux →
   « Bons de sortie groupée », ou depuis l'historique du rouleau.

3) On sait où est le tissu : « 🚚 40 m chez SAJ » sur la fiche rouleau
   (téléphone et bureau) et dans la liste des rouleaux ; la recherche
   « SAJ » retrouve les rouleaux partis chez lui. Le RETOUR et la
   CONSOMMATION se déclarent comme avant (scan du rouleau au retour).

Sécurité : le sous-traitant et le n° de bon sont figés dans l'historique
(verrou en base, testé) ; si un façonnier est supprimé du référentiel, son
nom reste écrit sur les mouvements et les bons.

Testé : sortie de 40 m pour une commande sous-traitée (SAJ proposé) ;
sortie groupée de 3 rouleaux (dont 1 partiel à 60 m) chez Atelier Medina
→ BST-2026-001, 260 m ; statuts « sorti » ; doublon et inconnu refusés.

Fichiers — nouveaux : drizzle/0039_sous_traitant_rouleaux.sql (+ meta),
app/m/tissu/choix-sortie.tsx, app/m/tissu/sortie/, app/(app)/magtissu/sortie/.
Modifiés : lib/db/schema/tissu.ts, lib/domain/rouleau.ts (+ test),
lib/services/rouleaux.ts, lib/actions/rouleaux.ts, fiches rouleau, onglet
Rouleaux, écran Scanner.

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v5) — Étiquettes rouleaux A4 : marges de votre feuille
═══════════════════════════════════════════════════════════════
Marges prises en compte : 10 mm en haut, 10 mm en bas, 4 mm à gauche et à
droite → zone utile 202 × 277 mm, partagée à parts égales :
  · A4 × 4  : 2 × 2 étiquettes de 101 × 138,5 mm (QR 62 mm) ;
  · A4 × 24 : 3 × 8 étiquettes de 67,3 × 34,6 mm (QR 30 mm).
Mesuré sur le PDF imprimé : 1re étiquette à 10 mm du haut et 4 mm du bord
gauche, dernière finit à 287 mm (10 mm du bas) et 206 mm (4 mm du bord
droit) ; aucun texte ne déborde ; QR des coins relus. 30 rouleaux → 8
feuilles en × 4, 2 feuilles en × 24.
À l'impression : « Marges : aucune » et « Échelle : 100 % » (les marges de
la feuille sont déjà dans la mise en page — ne pas les ajouter une 2e fois).
Les formats rouleau thermique 100 × 50 et 70 × 37 ne changent pas.

Fichiers : app/(app)/magtissu/etiquettes/rouleaux/page.tsx,
app/(app)/magtissu/rouleaux-ui.tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v4) — GPAO Simulation : charges au prorata des JOURS TRAVAILLÉS
═══════════════════════════════════════════════════════════════
Avant : charges de la période = charges mensuelles × jours CALENDAIRES
(29 jours = 0,95 mois), dimanches et jours sans production compris.

Maintenant :
  charges période = charges mensuelles × jours travaillés ÷ jours travaillés/mois
  heures payées  = ouvrières × (heures/mois ÷ jours/mois) × jours travaillés

  · Jour travaillé = au moins une saisie GPAO ce jour-là (sortie de chaîne
    ou heure d'ouvrière). Dimanches, fériés, jours chômés et journées
    ouvertes mais jamais saisies ne portent AUCUNE charge ; ces dernières
    sont listées sous le bilan (« exclues »).
  · Nouveau réglage « Jours travaillés / mois » à côté des charges (26 par
    défaut = lundi → samedi ; 22 si vous passez à 5 jours).
  · Ligne d'explication du calcul, ex. votre écran : 44 000 € × 19 jours ÷
    26 = 32 154 € (1 692 € par jour travaillé) au lieu de 41 922 €.
    Heures payées : 45 × 7,5 h × 19 j = 6 413 h (au lieu de 8 361 h).
  · Même règle dans Rentabilité (charges, point mort = 1 692 €/jour
    travaillé), dans la carte du Cockpit et dans l'impression.
  · Testé sur août 2026 : 13 jours avec saisie → 22 000 € ; la journée du
    30/08 ouverte sans saisie est bien exclue.

Fichiers : lib/domain/cout-usine.ts (+ test), lib/domain/rentabilite.ts
(+ test), lib/services/gpao.ts, app/(app)/gpao_prod/simulation.tsx,
app/(app)/gpao_prod/rentabilite.tsx, app/(app)/cockpit/page.tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v3) — Étiquettes QR rouleaux : format A4 × 4 (105 × 148 mm)
═══════════════════════════════════════════════════════════════
Le format n'existait pas (il y avait 100×50, 70×37 et A4 × 24) : ajouté.
  · Planche A4 portrait, 2 × 2 étiquettes de 105 × 148 mm (format A6),
    page par page : 4 rouleaux par feuille, jamais de débordement.
  · Grande étiquette lisible de loin : code rouleau en gros, QR de 70 mm,
    tissu, composition, couleur + code, lot fournisseur, lot DBS, client,
    fournisseur, laize, réception (n° + date), métrage initial en gros.
  · Où : bouton « A4 — 4 étiquettes 105 × 148 mm » sur la page d'impression
    (après une réception, depuis un lot ou la fiche rouleau) et « A4 ×4
    (105×148) » dans la sélection de l'onglet Rouleaux.
  · Vérifié : 5 rouleaux → 2 feuilles A4 (4 + 1), les 4 QR de la feuille relus.
  · Impression : « Marges : aucune », « Échelle : 100 % ».

Fichiers : app/(app)/magtissu/etiquettes/rouleaux/page.tsx,
app/(app)/magtissu/rouleaux-ui.tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09 v2) — Saisie de production sur TABLETTE (agent de méthode)
═══════════════════════════════════════════════════════════════
But : l'agent de méthode saisit en chaîne, sur sa tablette, UNE seule fois.
Plus de feuille papier à recopier au bureau : la saisie arrive directement
dans la journée GPAO (même grille, mêmes calculs, même écran TV).

QR : GPAO Production → bouton « 📱 QR saisie tablette » (aussi dans QR
rendement) → page imprimable. Un seul QR général → https://<app>/m/gpao.
Première fois : connexion PilotPro, puis la session reste ouverte.
Astuce : « Ajouter à l'écran d'accueil » sur la tablette.

Sur la tablette :
  1. Choix de la chaîne (date du jour, ‹ › pour une autre date).
  2. « ▶ Démarrer la journée » si elle n'existe pas : modèle (le dernier de
     la chaîne est proposé), heures, effectif présent. L'équipe de la chaîne
     est reprise comme au bureau. Déjà créée (même chaîne, modèle, date) →
     elle est rouverte, jamais en double.
  3. Onglets H1 … Hn : chaque ouvrière (grosse case, clavier numérique,
     Entrée = ouvrière suivante), boutons ABS / RI, puis la SORTIE DE
     CHAÎNE de l'heure. Rendement de l'heure en couleur ; l'onglet devient
     vert quand l'heure est complète. L'heure à saisir est proposée d'office.
  4. ⇄ Changement de poste dans l'heure : une ligne par opération (poste du
     catalogue, SAM repris automatiquement, pièces) ; 2 opérations = multi-
     postes, exactement comme la fenêtre ⚙ du bureau.
  5. Présence : « Absente » (ABS sur toute la journée, repliée en bas des
     heures) ou « Retirer » de la journée (pas de la chaîne).
  6. Retouches (par ouvrière), Arrêts (motif + durée en gros boutons),
     Récap (grille complète, rendements, alertes) et « Clôturer la journée ».
  En haut : objectif/h, sortie/objectif, rendement chaîne, retouches, nombre
  d'ouvrières sous le seuil d'alerte — les mêmes chiffres qu'au bureau.

Fiabilité (le point important) :
  · Avant, l'écran GPAO renvoyait TOUTE la grille de la journée à chaque case :
    tablette + bureau ouverts ensemble = le dernier écrasait l'autre. Désormais
    chaque case est envoyée seule et appliquée par le serveur sur la version à
    jour de la journée, sous verrou. Testé : tablette (ouvrière 1, H4) et
    bureau (ouvrière 7, H4) validés au même instant → les deux sont gardées.
  · Le bureau passe par le même chemin (cases, ⚙ postes, arrêts, retouches,
    retrait d'une ouvrière du jour, clôture) et relit la journée ouverte
    toutes les 15 s : ce que tape la tablette apparaît sans recharger, et
    inversement.
  · Wi-Fi coupé : bandeau « ⚠ Hors ligne · n en attente », les saisies
    restent sur la tablette (même si l'onglet est fermé) et partent au retour
    du réseau. Testé.
  · Journée clôturée : plus aucune saisie (réouverture au bureau).
  · Quantités négatives, absurdes, heure ou ouvrière inconnue : refusées.
  · La sortie de chaîne met à jour l'avancement de la commande liée (comme
    avant) ; les postes tapés entrent au catalogue d'opérations.

Droits : il faut le module « GPAO Production » (Paramètres → rôles). Vous
pouvez créer un rôle « Agent de méthode » avec ce module. Un compte sans ce
module est refusé (testé avec le rôle « coupe »).

Remarques sur vos données (vues pendant les tests, pas modifiées) :
  · Certains modèles ont un SAM à 0 : objectif et rendement chaîne restent à
    0 — la tablette l'affiche en bandeau. À compléter dans GPAO → Modèles.
  · Les chaînes 1 et 2 comptent 58 et 56 ouvrières (lignes reprises de
    l'ancien PilotPro, avec des doublons de noms). L'onglet Présence permet
    de marquer les absentes du jour ; le nettoyage de la chaîne se fait au
    bureau (GPAO → Chaînes).
  · Les « Chaîne archivée #… » créées par la reprise de l'historique ne sont
    pas proposées sur la tablette.

Fichiers — nouveaux : lib/domain/saisie-gpao.ts (+ test),
lib/services/saisie-gpao.ts, lib/actions/saisie-gpao.ts, lib/auth/gpao.ts,
app/m/gpao/ (accueil + j/[id]), app/(app)/gpao_prod/qr-saisie.
Modifiés : gpao_prod/gpao-app.tsx (saisie case par case + relecture),
gpao_prod/actions.ts (création de journée partagée), gpao_prod/arrets.tsx
(motifs communs), lib/services/gpao.ts (creerJournee), qrouv-client.tsx.

═══════════════════════════════════════════════════════════════
LIVRÉ (29/09) — Traçabilité QR par ROULEAU de tissu
═══════════════════════════════════════════════════════════════
Pas de second système : le rouleau est un ENFANT du lot existant. Ses
mouvements vont dans le même journal tissu_mouvement (colonne rouleau_id) ;
le bilan du lot, les affectations aux commandes, le bilan matière, les
reliquats et les bons de retour continuent de fonctionner et restent justes
(stock du lot = somme de ses rouleaux). Un lot SANS rouleaux garde
exactement l'ancien fonctionnement.

Vos 6 réponses, appliquées :
  1. La SORTIE diminue le stock ; CONSOMMATION et CHUTE qualifient ensuite
     le tissu sorti sans le décompter une 2e fois. Ce qui n'est ni consommé
     ni chute revient par un RETOUR.
       disponible = initial − sorti + retour − rendu − retour fourn. ± corrections
       en coupe   = sorti − retour − consommé − chute
  2. Stock existant : « ✂ Découper en rouleaux étiquetés » dans la fiche du
     lot, pré-rempli depuis l'ancienne fiche de contrôle rouleau. Si la somme
     ≠ disponible du lot, l'écart passe en correction du LOT avec motif
     obligatoire (jamais en silence).
  3. Retour FOURNISSEUR = flux à part (bon RTF-AAAA-NNN, motif obligatoire),
     distinct du rendu client (RT-).
  4. QR = adresse courte https://<votre-app>/r/R-2026-000145 (lisible par
     n'importe quel téléphone, par la douchette, code en clair dessous).
  5. Plan de coupe : reste au niveau du lot (phase 1) — mais il REFUSE de
     sortir du tissu d'un lot suivi par rouleau (sinon double décompte) :
     la sortie se fait au rouleau.
  6. Étiquettes : thermique 100×50 mm · standard 70×37 mm · planche A4
     de 24 (3×8 de 70×37). QR relus et vérifiés sur les PDF imprimés.

OÙ ?
  Bureau — Magasin tissu :
    · Réception tissu : par lot, « + Saisir les rouleaux un par un »
      (mesuré, étiquette fournisseur, laize, poids, défauts ; Entrée = ligne
      suivante). Nouveaux champs : commande fournisseur, lot fournisseur,
      code couleur. À l'enregistrement, les étiquettes de TOUS les rouleaux
      s'ouvrent (« Imprimer toutes les étiquettes » aussi dans l'historique).
    · Onglet « Rouleaux (QR) » : indicateurs (en stock, métrage dispo, à
      réceptionner, sans emplacement, sortis non soldés, sorti / consommé /
      chute / retours, écarts du dernier inventaire), recherche (code scanné,
      tissu, couleur, lot fournisseur, commande, fournisseur, client,
      emplacement, statut), sélection → étiquettes 3 formats, retour fourn.
    · Fiche d'un lot : ses rouleaux (statut, emplacement, sorti, consommé,
      chute, en coupe, dispo), « Tout réceptionner », étiquettes du lot.
    · Fiche rouleau /magtissu/rouleaux/R-… : identité (non modifiable),
      bilan, historique complet, mêmes gestes qu'au téléphone.
    · 📍 Emplacements (création, désactivation, étiquettes QR des rayons).
    · 📋 Inventaires par scan : suivi en direct, clôture.
  Téléphone — /m/tissu (bouton « 📱 Scanner un rouleau ») :
    · caméra (détecteur du navigateur, sinon jsQR) OU douchette USB /
      Bluetooth (le champ garde le focus, Entrée valide) OU saisie ;
    · fiche rouleau en gros boutons : VALIDER RÉCEPTION (en attente → en
      stock, avec rangement), SORTIE (destination coupe / atelier /
      sous-traitant / autre + commande/OF + métrage), RETOUR, CONSOMMATION
      (+ chute), DÉPLACER, HISTORIQUE, retour fournisseur, correction ;
    · étiquette de rayon scannée → contenu du rayon + « Ranger ici » ;
    · inventaire : scanner le rayon, puis chaque rouleau (métrage constaté
      facultatif) → trouvés / manquants / inconnus / écarts / mal rangés.
  L'ancienne étiquette QR d'un LOT reste valable ; si le lot est suivi par
  rouleau, elle affiche ses rouleaux au lieu de la sortie en bloc.

ANTI-ERREURS (vérifiés en base ET à l'écran) :
  · double réception refusée (même depuis 2 téléphones : verrou de ligne) ;
  · double sortie impossible : chaque geste verrouille le rouleau
    (SELECT … FOR UPDATE) puis recalcule depuis l'historique ;
  · sortie > disponible, retour > sorti, consommation + chute > sorti :
    refusés ; rouleau inconnu : « non enregistré à la réception » ;
  · ID, lot, métrage initial, date : figés PAR LA BASE (trigger) ;
  · historique IMMUABLE (trigger) : un mouvement ne se modifie jamais ;
  · corrections uniquement par mouvement tracé : qui, quand, avant → après,
    motif obligatoire ;
  · ANNULATION au lieu de suppression : le mouvement reste, barré, avec une
    ligne « annulation » (qui, motif) ; refusée si le stock deviendrait
    négatif ; impossible sur une entrée ou un déplacement ;
  · lot suivi par rouleau : sortie / ajustement au niveau du lot refusés ;
  · bon ou lot ne se suppriment plus dès qu'un rouleau est réceptionné ou a
    bougé ;
  · codes par séquence PostgreSQL : jamais deux fois le même numéro.
  · inventaire clos = résultat FIGÉ (ce qui a été constaté ce jour-là).

FONCTIONS EXISTANTES MODIFIÉES (justification) :
  · supprimerMouvement → devient une ANNULATION tracée (votre règle « ne
    jamais écraser silencieusement l'historique ») ; le bouton 🗑 de
    l'historique d'un lot demande maintenant un motif.
  · sortir / ajuster (lot) et plan de coupe : refusés sur un lot suivi par
    rouleau (double décompte), inchangés sinon.
  · rendreAuClient : sur un lot suivi par rouleau, le rendu est réparti sur
    ses rouleaux (bilan de chaque rouleau juste, statut « rendu »).
  · supprimerLot / supprimerReception : bloqués une fois la vie commencée.
  · Rien n'a été supprimé.

PERMISSIONS : exactement celles du magasin tissu (rôles admin, resp, chef,
magasin, magtissu, ou tout rôle ayant le module Magasin tissu). Les autres
comptes ouvrent les fiches en consultation seule (testé avec le rôle
« coupe »). Le QR scanné sans être connecté mène au login puis revient sur
le rouleau.

TESTÉ (navigateur, base existante migrée) :
  réception 3 rouleaux 82,50 / 60 / 45,25 → lot 187,75 m, 3 entrées ·
  étiquettes 3 formats + PDF (100×50 mm : 1 page / étiquette) · scan inconnu
  refusé · douchette « dbs-r-2026-1 » en minuscules OK · validation →
  « en stock » en A01-01 · 2e validation depuis un autre téléphone refusée ·
  sortie 100 m refusée, sortie 25 → 57,50 · retour 30 refusé, retour 12,50
  → 70,00 · conso 11,30 + chute 1,20 · sortie 25 puis conso 23,80 + chute
  1,20 (24 + 1,2 refusé) · déplacement A01-01 → A01-02 · rangement par scan
  du rayon · correction 60 → 59,4 motivée · retour fournisseur RTF-2026-001
  → « retourné » · annulation d'une chute (barrée, conservée) · inventaire :
  mal rangé déplacé, écart 45 → 44 corrigé à la clôture, re-scan sans
  métrage conserve le métrage · découpage MARIN-01 (fiche 149,5 + 150,5,
  sans écart) et ECRU-01 (60 + 38 pour 100 : motif exigé, correction −2) ·
  rendu client réparti sur 2 rouleaux · suppression du bon refusée ·
  stock du lot = somme des rouleaux · aucune erreur JavaScript.

À SAVOIR :
  · L'adresse imprimée dans le QR est celle de Paramètres → « adresse du
    portail » si elle est réglée (sinon l'adresse du serveur). Réglez-la
    AVANT d'imprimer : une étiquette collée ne se réimprime pas.
  · Impression des étiquettes : « Marges : aucune », « Échelle : 100 % ».
  · La caméra du téléphone exige HTTPS (c'est le cas sur Railway).

Fichiers — nouveaux : drizzle/0038_rouleaux_tissu.sql (+ meta),
lib/domain/rouleau.ts (+ test), lib/services/rouleaux.ts,
lib/actions/rouleaux.ts, lib/auth/tissu.ts, components/shared/scanner-qr.tsx,
app/r/[code], app/e/[code], app/m/tissu/(page, scan-accueil, ui, r/[code],
e/[code], inventaire), app/(app)/magtissu/(rouleaux-ui, rouleaux/[code],
etiquettes/rouleaux, emplacements, inventaires).
Modifiés : lib/db/schema/tissu.ts, lib/domain/tissu.ts, lib/actions/tissu.ts,
lib/services/tissu.ts, lib/services/matiere-tissu.ts,
lib/services/plan-coupe.ts, magtissu (page, client, réception, bilan,
retour), app/m/tissu/[id], package.json, package-lock.json.

═══════════════════════════════════════════════════════════════
LIVRÉ (28/09 v2) — Analyse de votre version corrigée (dbs-erp-main 3)
═══════════════════════════════════════════════════════════════
Votre dépôt est identique à la dernière livraison, à 3 différences près :

1) drizzle/0034 — VOTRE CORRECTION EST BONNE (c'était la panne Railway).
   Reproduit ici : un lot repris « MIGR-1 » puis renommé à l'écran (ex.
   BLEU-01) faisait recréer par la 0034 une réception et un lot MIGR-1 →
   « duplicate key … tissu_lot_identifiant_unique » → migrations en échec →
   l'application ne démarrait pas. Avec votre version : aucun doublon, le
   lot renommé est conservé, la table est bien supprimée. Reprise telle
   quelle dans ce ZIP.

2) package-lock.json — DÉSYNCHRONISÉ, à remplacer (bloquant) : il lui manque
   @emnapi/core et @emnapi/runtime (fichier régénéré avec une autre version
   de npm). `npm ci`, que Railway exécute au build, refuse alors d'installer :
   « package.json and package-lock.json … are not in sync ». Le fichier de ce
   ZIP est synchronisé (npm 10, celui de Node 20 fixé par .nvmrc) : `npm ci`
   passe. Si vous refaites un `npm install` en local, faites-le avec Node 20.
   Désormais le package-lock fait partie du ZIP cumulé.

3) Vous avez supprimé br-client.tsx, lib/db/schema/modules.ts et
   lib/modules/types.ts (fichiers vidés) : correct, plus rien ne les
   utilise ; ils ne sont plus dans le ZIP.

lib/domain/actions-qualite.ts : seule la place d'un commentaire différait,
votre version est gardée.

═══════════════════════════════════════════════════════════════
LIVRÉ (28/09) — Déploiement Railway : vérification et sécurisation
═══════════════════════════════════════════════════════════════
1) Migrations sautées en silence (cause probable de « l'appli plante après
   le déploiement ») : le migrateur de drizzle n'applique que les migrations
   plus RÉCENTES que la dernière déjà passée. Si une migration datée plus tard
   a été appliquée avant (autre livraison, autre branche, fichiers copiés
   dans le désordre), les suivantes sont ignorées tout en affichant
   « Migrations up to date » — puis les écrans plantent sur des colonnes
   absentes (Qualité & actions, magasins tissu / fournitures…).
   → scripts/migrate.mjs rattrape maintenant toute migration du journal
   absente de la base, dans l'ordre, et l'écrit dans les logs Railway :
   « ⚠ N migration(s) sautée(s) — rattrapage : … ».
2) Reprise des fiches QRQC : l'ancien PilotPro code la cause 5M
   (« main_oeuvre ») ; elle n'était pas reconnue. Corrigé à l'import et
   par la migration 0037 pour les fiches déjà reprises.

Fichiers : scripts/migrate.mjs, drizzle/0037_causes_5m_codes.sql (+ meta),
lib/domain/actions-qualite.ts (+ test).

═══════════════════════════════════════════════════════════════
LIVRÉ (27/09 v4) — Magasin tissu & Magasin fournitures : complets et cohérents
═══════════════════════════════════════════════════════════════
Tout ce qui avait été proposé, sauf « bain / nuance » (point 3, écarté).
Migration 0036 (colonnes et tables ajoutées, aucune donnée modifiée).

VÉRIFICATION DE COHÉRENCE — ce qui se contredisait, corrigé :
1) Le contrôle d'un LOT de tissu ne pouvait pas se saisir à l'écran (le
   magasin par lots n'avait pas de champ contrôle) : dès qu'un lot était
   affecté, le feu tissu restait orange pour toujours et la commande ne
   pouvait pas être lancée sans dérogation. → Contrôle par lot en un clic
   (Conforme / Sous réserve / Refusé), aussi à la réception.
2) Deux vérités pour le tissu d'une commande : l'ancien « métrage reçu /
   contrôle » de la commande (vide avec les lots) et les lots. Le besoin,
   l'écart « métrage insuffisant », le bon imprimé, l'alerte de retard de
   réception et l'écran d'un OF rattaché lisaient l'ancien champ → ils
   annonçaient « rien reçu ». → Quand des lots sont affectés, ces champs se
   déduisent des lots (reçu = affecté, date = réception, contrôle = synthèse).
3) Fournitures : le « prévu » était saisi à la main commande par commande,
   sans lien avec le modèle ; il ne suivait pas un changement de quantité.
   → Nomenclature par modèle, prévu calculé et recalculé automatiquement.
4) Aucun doublon créé : la ligne de fourniture de la commande reste LA
   vérité du feu ; la nomenclature, les bons client et les restes ne font
   que l'alimenter. Le lot reste LA vérité du tissu ; les nouvelles vues
   (par commande, bilan, reliquats) se calculent depuis les lots.

MAGASIN TISSU (matière du client)
- Réception contrôlée contre le BL du client : n° de BL, métrage ANNONCÉ
  et MESURÉ, laize annoncée et réelle, défauts, contrôle ; écart affiché en
  direct (tolérances : 0,5 % / 0,5 m, laize ±1 cm). Fiche rouleau par
  rouleau facultative (n°, étiqueté, mesuré, laize, défauts).
- Réclamation client imprimable (manque, laize, défauts) — ouverte
  automatiquement après une réception en écart ; alerte tant que le lot
  n'est pas coupé.
- Onglet « Besoin par commande » : besoin (conso client × pièces + chute)
  face au tissu affecté ; état 🟢 couvert / 🟠 couvrable en stock /
  🔴 à demander ; lots proposés du MÊME client, même référence, même
  couleur (jamais le tissu d'un autre client) → « Affecter » en un clic.
- Demande de complément tissu au client, imprimable, par client.
- Bilan matière de fin de commande (imprimable) : reçu, consommé, chute /
  surconsommation, rendu, reste ; conso réelle contre conso du client — la
  preuve en cas de contestation.
- Reliquats non rendus, par client et par saison ; « Rendre au client »
  crée un bon de retour numéroté RT-AAAA-NNN (mouvement « rendu » : sort du
  stock sans compter comme consommation).
- Étiquettes QR des lots (imprimables) ; le scan ouvre une page téléphone
  « sortie vers la coupe » : commande réservée présélectionnée, métrage
  proposé = reste à sortir, validation en un toucher.

MAGASIN FOURNITURES
- Nomenclature par modèle (référence article, sinon nom du modèle) :
  qté par pièce, unité, % de casse, origine, fournisseur. Chaque
  modification recalcule le prévu de toutes les commandes en cours du
  modèle (lignes marquées 📋) ; une commande dont la quantité change suit
  aussi. Corriger un prévu à la main détache la ligne. Copie d'un modèle
  voisin en un clic.
- Origine sur chaque ligne : fourni client / acheté DBS (+ fournisseur).
- Manques : fourni client → demande de complément imprimable par client ;
  acheté DBS → liste d'achat imprimable, cumulée par article et groupée
  par fournisseur (en quantités).
- Réception par bon du client : choisir le client → toutes ses fournitures
  attendues (plusieurs commandes et modèles), « = reste » ou « tout reçu »,
  un seul enregistrement (bon RF-AAAA-NNN, annulable).
- Restes par client (quantités) : l'excédent d'une ligne part en restes
  (« → restes client »), réutilisable sur une autre commande ou rendu au
  client avec un bon RFR-AAAA-NNN.
- Relances : commandes non lancées à qui il manque des fournitures à moins
  de X jours de l'export (21 par défaut, réglable), par client ; elles
  remontent aussi dans les Alertes.
- Barre de navigation commune du magasin fournitures.

Liens croisés : fiche Nomenclature → nomenclature fournitures du modèle et
bilan matière ; fiche fournitures d'une commande → appliquer la
nomenclature.

═══════════════════════════════════════════════════════════════
LIVRÉ (27/09 v3) — QR du magasinier : saisie des réceptions au téléphone
═══════════════════════════════════════════════════════════════
Magasin produits finis → bouton « 📱 QR saisie mobile » → affiche A4 à
imprimer et coller au magasin (QR + mode d'emploi en 3 étapes).

Le QR ouvre /m/magasin, une page faite pour le téléphone (gros boutons, pas
de menu). Connexion avec le compte PilotPro la première fois ; le téléphone
reste ensuite connecté, et après connexion on revient directement sur la
saisie (la page de connexion sait maintenant revenir à la page demandée).

- 🏭 Production interne : la liste montre ce que les chaînes GPAO ont sorti
  et qui n'est pas encore entré (« 600 à entrer »). Toucher la commande →
  quantité déjà remplie → « ✔ Entrer 600 pcs au stock ». 2 touchers.
- 🚚 Façonniers : commandes attendues, rangées par façonnier, avec le reste
  à recevoir. Toucher la commande → « Tout le reste » (ou ±1 / ±10, ou taper
  le chiffre) → ✅ Tout conforme / ⚠️ Avec défauts (+ nombre de NC) /
  ⛔ Lot refusé → Valider. Le bon de réception (BR-…) est créé.
- Mêmes contrôles que le bureau (plus que coupé, NC élevées, dépassement…) :
  avertissement affiché, bouton « Enregistrer quand même » ; une erreur
  bloquante empêche d'enregistrer.
- « Saisies d'aujourd'hui » en bas de page, avec « Annuler » en cas d'erreur
  (mêmes garde-fous : impossible si les pièces sont déjà parties sur un BL).
- Date = aujourd'hui, modifiable (« changer »).
- Droits : rôles admin, resp, chef et « Magasin produits finis » avec accès
  au module Magasin ; sinon la page l'explique. Chaque saisie part au journal
  d'activité au nom du magasinier connecté (les entrées de production interne
  n'y étaient pas encore : corrigé, ainsi que les annulations).
- Adresse du QR : celle réglée dans l'écran QR rendement (« Adresse du
  portail ») — à renseigner avec l'adresse publique du serveur avant
  d'imprimer, sinon les téléphones ne l'atteindront pas.

Fichiers : app/m/magasin/{page, magasin-mobile}.tsx,
app/(app)/magasin/qr/page.tsx, app/(app)/magasin/{page, magasin-client}.tsx,
lib/domain/aval.ts (+ 2 tests), lib/actions/aval.ts, lib/services/portail.ts,
app/(app)/qrouv/page.tsx, app/login/page.tsx, proxy.ts. Aucune migration.

═══════════════════════════════════════════════════════════════
LIVRÉ (27/09 v2) — Simplification : moins de menus, un seul registre d'actions
═══════════════════════════════════════════════════════════════
1) MODULES HÉRITÉS SUPPRIMÉS — Gammes & SAM, Capacité & Costing,
   Ordonnancement, Ordres de fabrication. Leurs chiffres étaient écrits en dur
   (tables de démonstration) ; tout ce qu'ils montraient existe en vrai dans
   la GPAO (modèles, SAM, suivi par chaîne), GPAO › Rentabilité (coût usine,
   prix plancher, marge) et le Planning général. Leurs anciennes adresses
   redirigent vers ces écrans. Les tables m_* correspondantes (et celles des
   anciens écrans tissus / fournitures / BE / alertes statiques) sont
   supprimées par la migration 0035.

2) QRQC + PLANS D'ACTIONS → « Qualité & actions », onglet « Actions & QRQC ».
   Un seul endroit pour toutes les actions : celles nées d'un défaut au
   contrôle, les problèmes terrain (QRQC, analyse 5M) et les actions
   d'amélioration. Même suivi pour toutes : statut (À traiter → En cours →
   Corrigé → Vérifié → Clôturé), responsable, échéance, priorité, commande
   concernée, note de suivi, photos avant / après.
   - Compteurs cliquables : ouvertes · en retard · QRQC ouverts · sans
     responsable ou échéance ; répartition par cause 5M (cliquable).
   - Filtres (ouvertes / en retard / clôturées / toutes, origine, 5M,
     recherche) ; tri : en retard, puis priorité, puis échéance.
   - « + Nouvelle action » : problème terrain (QRQC) ou amélioration (plan),
     reliée ou non à une commande.
   - Un lot REFUSÉ au contrôle ouvre automatiquement une action QRQC,
     rattachée au contrôle ET à la commande (priorité haute, cause Méthode) ;
     elle apparaît dans l'inspection et dans le registre.
   - Les actions en retard remontent dans les Alertes.
   - /qrqc et /actions redirigent vers cet onglet ; un rôle qui avait le droit
     « QRQC » ou « Plans d'actions » voit toujours le module.
   REPRISE DES DONNÉES (migration 0035) : les vraies fiches QRQC et lignes de
   plan d'actions sont recopiées dans le registre (statut, cause 5M, commande
   retrouvée par son n° d'OF, dates) ; les 3 QRQC et 4 actions de
   démonstration du seed sont écartés. Une date non datée (« 12 juin ») est
   gardée en note. Les inspections refusées pointent sur la nouvelle action.

3) FAUSSES ALERTES ET DÉMOS RETIRÉES
   - « Modèle sans gamme SAM » (comparait les commandes à la table de démo,
     alertait sur presque tout) est remplacée par une vraie alerte :
     « Production non reliée » = commande lancée en chaîne interne sans
     modèle GPAO relié (sa production ne remonte pas dans l'avancement).
   - Le seed n'insère plus aucune donnée de démonstration de ces modules.
   - Pastilles du menu calculées sur les vraies données (avant : « Alertes 3,
     Commandes 2, Factures 1, Plans d'actions 2 » écrits en dur) : Commandes =
     en retard, Factures = échéance dépassée, Qualité = actions ouvertes. Pas
     de pastille quand il n'y a rien à faire.
   - Cockpit : les tuiles « 2 · Matières » et « 3 · Préparation » menaient à
     des pages inexistantes (/tissus, /be) → Magasin Tissu et Direction
     Technique.

Fichiers : drizzle/0035_actions_qualite_unifiees.sql (+ meta), 
lib/db/schema/qc.ts, lib/domain/actions-qualite.ts (+ 5 tests),
lib/services/{qc, dashboard, compteurs-menu, modules}.ts,
lib/actions/{qc, modules}.ts, app/(app)/qc/{page, qc-client, actions-registre,
editeur, primitives, dashboard}.tsx, app/(app)/alertes/page.tsx,
app/(app)/cockpit/page.tsx, app/(app)/layout.tsx, components/layout/sidebar.tsx,
lib/nav.ts, lib/modules/*, scripts/seed.ts, scripts/import-pilotpro.ts,
scripts/import/qualite.ts, next.config.ts.
Pages de redirection : app/(app)/{gammes, capacite, ordonnancement, ofs,
qrqc, actions}/page.tsx.
Fichiers VIDÉS, effaçables sans risque : lib/db/schema/modules.ts,
lib/modules/types.ts (et app/(app)/br/br-client.tsx de la livraison
précédente).

APRÈS INSTALLATION : `npm run db:migrate` (ou le démarrage habituel qui
applique les migrations) puis ouvrir Qualité & actions › Actions & QRQC pour
vérifier les fiches reprises.

═══════════════════════════════════════════════════════════════
LIVRÉ (27/09) — « Réception ST » + « Produits finis » = Magasin produits finis
═══════════════════════════════════════════════════════════════
Un seul module (menu « 5 · Magasin & Export » → Magasin produits finis), à
3 onglets : 📦 Stock & expéditions · 📥 Réceptions façonniers · 🧾 Mouvements.
L'ancienne adresse /br redirige vers l'onglet Réceptions ; un rôle qui avait
le droit « Réception ST » voit toujours le module (aucun droit à refaire).

DÉFAUTS CORRIGÉS (constatés à l'analyse, vérifiés en vrai) :
1) La production interne était remise à 0 dès qu'on saisissait une entrée
   magasin ou une coupe (le magasin ne comptait que les BR façonniers et
   écrasait la GPAO). Désormais UNE formule, partagée GPAO / magasin
   (lib/services/avancement.ts) : produit = sorties des chaînes GPAO
   + conformes façonniers + NC retouchées, plafonné à la commande. Relier un
   modèle GPAO à une autre commande recalcule aussi l'ancienne.
2) Impossible de déclarer « 0 conforme » : un lot entièrement refusé entrait
   quand même en stock. Maintenant : 0 est respecté, « conforme » vide =
   reçu − NC, contrôle « Refusé » = rien n'entre au stock.
3) Pas de livraison en plusieurs fois : le premier BL envoyé soldait toute la
   commande (le reste ne pouvait plus être livré, le stock tombait à 0).
   Maintenant stock = entré − parti sur BL envoyés ; « Expédiée » seulement
   quand tout est parti (ou bouton « ✓ Solder ») ; supprimer / repasser un BL
   en brouillon rend les pièces au stock.
4) Les non conformes reçues n'avaient aucun suivi.

AMÉLIORATIONS :
- Entrée de production interne PRÉ-REMPLIE depuis la GPAO (sorti des chaînes
  − déjà entré) ; indicateur « Produit en GPAO, pas encore entré ».
- Non conformes : « ↩ Retouchées » (entrent au stock, comptent comme
  produites) ou « 🗑 Rebut », avec le reste en attente par BR ; alerte quand
  des NC restent sans décision ; taux de NC par façonnier.
- Colonnes Produit / Entré / Expédié / En stock, badge du dernier contrôle
  qualité FINAL (QC ✓ / réserve / refusé / sans QC), filtres « À traiter »,
  « Avec du stock », « Production GPAO à entrer », « NC en attente ».
- Bon de réception imprimable à signer (magasin + façonnier) avec la
  situation cumulée de la commande (bouton 🖨 BR).
- Journal des mouvements : entrées, retouches, rebut, sorties BL, avec leur
  document.
- Garde-fous : un BL ne peut pas sortir plus que le stock ; on ne peut pas
  supprimer un BR / une entrée si des pièces sont déjà parties sur un BL ;
  le BL affiche un avertissement qualité (QC final refusé / sans QC) et ce
  qui a déjà été livré.

Fichiers : app/(app)/magasin/{page, magasin-client, dialogs}.tsx,
app/(app)/magasin/br/[id]/imprimer/page.tsx, app/(app)/br/page.tsx
(redirection) et br-client.tsx (vidé, supprimable), app/(app)/bl/bl-client.tsx,
lib/services/{aval, avancement, gpao, dashboard, permissions}.ts,
lib/actions/aval.ts, lib/domain/aval.ts (+ 12 tests), lib/nav.ts,
components/layout/sidebar.tsx. Aucune migration.

═══════════════════════════════════════════════════════════════
LIVRÉ (26/09) — Rendement des ouvrières : un seul chiffre partout
═══════════════════════════════════════════════════════════════
Problème : une même ouvrière (ex. DAOUDI OLFA) pouvait être éclatée en
plusieurs « personnes » — vraie fiche, fiche provisoire PROV- créée en la
tapant comme renfort, journées restées « sans fiche » (figées avant le
rattachement, ou dupliquées), journées reprises de l'ancien PilotPro sans
équipe mémorisée. Historique, classement par seuil et QR n'avaient pas la même
règle ni la même période → chiffres différents de l'écran TV.

1) RÈGLE UNIQUE (lib/domain/rendement-personne.ts), utilisée par l'écran de
   saisie, la TV, l'historique, le classement, les arrêts & retouches, la
   carte QR et le portail QR :
   - identité : fiche de la ligne → sinon fiche de la ligne de chaîne recopiée
     (si même nom) → sinon fiche au nom identique s'il n'y en a qu'une → sinon
     le nom ;
   - calcul : un jour = exactement le chiffre de la TV ; une période =
     Σ minutes gagnées ÷ Σ heures, arrondi une seule fois (l'impression de
     l'historique faisait une moyenne simple : corrigé) ;
   - période « générale » = 30 derniers jours partout (carte QR, portail,
     historique par défaut) — le portail l'affiche avec ses dates, plus le
     mois en cours ;
   - même échelle de couleurs partout (≥ 85 % vert, ≥ 60 % orange) et même
     seuil d'alerte que la TV (réglage de l'atelier, 65 % par défaut).

2) FUSION ET RÉPARATION — GPAO → 🕓 Historique ouvrière → panneau
   « 🧬 Identités des ouvrières » (admin + responsable prod) :
   « Vérifier » (aperçu, rien n'est écrit) puis « Fusionner et réparer » :
   - fiches de même nom fusionnées automatiquement quand une seule est une
     vraie fiche (les PROV- en double disparaissent) ;
   - même nom sous deux VRAIS matricules : bouton « Garder [matricule] » pour
     fusionner à la main (l'activité de chaque fiche est indiquée) ;
   - toutes les journées reliées à la bonne fiche ;
   - journées anciennes : équipe mémorisée (fin des disparitions quand une
     ouvrière change de chaîne) ;
   - signale : personnes sans fiche (pas de QR), même personne sur deux lignes
     d'une journée.

3) GARDE-FOUS (le problème ne revient pas) :
   - créer / modifier / importer / supprimer une fiche, rattacher (Personnel ou
     bouton de l'écran QR) → fusion + journées remises à jour automatiquement ;
   - dupliquer une journée → les lignes reçoivent la fiche connue aujourd'hui ;
   - renommer une ligne (chaîne ou journée) → la fiche suit le NOUVEAU nom au
     lieu de garder celle de l'ouvrière précédente ;
   - reprise de l'ancien PilotPro → l'équipe de chaque journée est mémorisée.

Testé en vrai sur le cas « Olfa en 3 fiches » + « Sana sous 2 matricules » :
avant, Olfa [11] 3 jours / PROV 1 jour, Sana 75 % au lieu de 78 % ; après,
Olfa 81 % et Sana 78 % à l'identique dans l'historique, le classement, le
portail QR et la carte QR, cohérents avec leurs chiffres TV jour par jour.

APRÈS INSTALLATION : ouvrir GPAO → Historique ouvrière → « Vérifier », puis
« Fusionner et réparer » (et trancher les éventuels homonymes proposés).

Fichiers : lib/domain/rendement-personne.ts (+ 12 tests), lib/domain/rendement.ts,
lib/services/identite-ouvrieres.ts, lib/services/portail.ts, lib/services/gpao.ts,
lib/actions/atelier.ts, app/(app)/gpao_prod/{store.ts, histo.tsx,
arrets-retouches.tsx, gpao-app.tsx, actions.ts}, app/(app)/qrouv/{page,
qrouv-client, actions}, app/portail/[cle]/page.tsx, scripts/import/gpao.ts.
Aucune migration.

═══════════════════════════════════════════════════════════════
LIVRÉ (v3) — Rentabilité & pilotage (propositions A + B)
═══════════════════════════════════════════════════════════════
Nouvel onglet GPAO « 💰 Rentabilité » (période libre, boutons « Ce mois » /
« Mois dernier »), bâti sur le coût de l'heure usine réglé dans la Simulation.

🎯 OBJECTIFS (partagés, modifiables par admin + responsable prod) :
   rendement cible (défaut 80 %), marge cible sur prix de vente (défaut 15 %),
   temps d'une retouche en minutes (0 = retouches non chiffrées).
   Enregistrés dans le même réglage que le coût usine : la Simulation et la
   Rentabilité ne s'écrasent pas l'une l'autre (vérifié).

A1 · MARGE PAR MODÈLE — pièces, heures, rendement réel, minutes réelles/pièce
   vs SAM, prix de vente, coût/pièce, prix plancher, marge €, taux, verdict
   (Perd de l'argent / Sous la marge cible / Rentable / Sans prix). Perdants
   en tête. Coût d'un modèle = ses heures saisies × coût horaire réel : la
   somme des marges des modèles = la marge de la période (testé).

A2 · PRIX PLANCHER — SAM ÷ rendement cible × coût standard, puis marge cible
   sur le prix : prix = coût ÷ (1 − marge). Affiché dans la marge par modèle
   (prix de vente sous le plancher surligné en rouge) ET sur chaque fiche de
   l'onglet 👔 Modèles (coût + prix plancher, détail au survol).

A3 · OÙ PART L'ARGENT — heures payées non saisies, rendement sous la cible
   (hors arrêts), arrêts déclarés, total ; retouches comptées et chiffrées si
   un temps est réglé (non additionnées : déjà dans le rendement). Valeur
   d'un point de rendement sur la période.

A4 · POINT MORT — CA et pièces à produire par jour de production, jours
   au-dessus / en dessous, tableau jour par jour avec barre, cumul CA vs
   cumul charges. Et une carte « Rentabilité atelier — mois en cours » dans
   le COCKPIT (CA produit, charges à date, marge, couverture %, point
   mort/jour, rendement, nb de modèles à perte).

B5 · INTERNE OU SOUS-TRAITANCE — tableau des modèles produits en interne dont
   la commande liée porte un prix façon (écart/pièce et économie ou surcoût
   total), + simulateur pour une nouvelle commande (modèle ou SAM, quantité,
   prix façonnier, rendement attendu → coût interne, totaux, écart, capacité
   mobilisée en heures et en jours d'usine, recommandation).

B6 · TABLEAU DE BORD DIRECTION — bouton d'impression A4 : 8 indicateurs clés,
   où part l'argent, 5 modèles les moins / les plus rentables, méthode de
   calcul, cases de signature.

Fichiers : lib/domain/rentabilite.ts (+ 13 tests), lib/domain/cout-usine.ts
(objectifs), lib/services/rentabilite.ts, lib/services/gpao.ts (2 fonctions
exportées), app/(app)/gpao_prod/rentabilite.tsx, actions.ts, gpao-app.tsx
(onglet + prix plancher des modèles), simulation.tsx, app/(app)/cockpit/page.tsx.
Aucune migration.

═══════════════════════════════════════════════════════════════
LIVRÉ (v2) — GPAO Simulation : coût de l'heure usine calculé
═══════════════════════════════════════════════════════════════
Principe : les ouvrières DIRECTES (en chaîne, suivies en GPAO) paient toute
l'usine — leurs salaires, les indirectes et la structure.

Le champ manuel « Coût d'1 heure » est remplacé par 3 paramètres PARTAGÉS
(enregistrés en base, identiques sur tous les postes) :
  - charges usine par mois (€) — ex. 44 000
  - ouvrières directes — ex. 45
  - heures par mois et par ouvrière — ex. 195
Seuls l'administrateur et le responsable production peuvent les modifier ;
les autres rôles les voient en lecture seule.

L'écran calcule :
  - Coût horaire STANDARD = charges ÷ (effectif × heures) → 44 000 ÷ 8 775 h
    = 5,01 €/h (0,0836 €/min, pour chiffrer un modèle avec son SAM).
  - Charges de la PÉRIODE = charges mensuelles au prorata du calendrier
    (25 jours ≈ 0,82 mois → 36 140 €).
  - Taux de saisie GPAO = heures saisies ÷ heures payées théoriques ; alerte
    rouge sous 90 % (absences, arrêts, RI, saisies manquantes), alerte si
    plus de 110 % (effectif/heures à revoir ou renforts).
  - Coût horaire RÉEL de la période = charges de la période ÷ heures saisies.
  - Marge = CA − charges de la période (juste même si la saisie est
    incomplète), taux de marge, coût par pièce.
Le bilan est aussi ajouté à l'impression de la simulation.

Fichiers : lib/domain/cout-usine.ts (+ tests), app/(app)/gpao_prod/actions.ts
(lireParamsUsine / enregistrerParamsUsine, réglage « gpao.coutUsine »),
app/(app)/gpao_prod/simulation.tsx. Aucune migration : le réglage utilise la
table app_setting existante.

═══════════════════════════════════════════════════════════════
LIVRÉ (v1 du 25/09) — Suppression définitive de commande_tissu_ligne
═══════════════════════════════════════════════════════════════
Chantier validé : l'ancien magasin tissu « par commande » (une ligne par
matière, saisie à la main) est remplacé pour de bon par le magasin par LOTS
(réception → lot → affectation → consommation) depuis la migration 0027.
Cette dernière recopiait déjà tout sans rien supprimer ; la table restait donc
en place, avec du code qui la lisait encore pour le feu tissu — et trois
fonctions d'écriture (ajouter/modifier/supprimer une matière) qui n'étaient
plus appelées par AUCUN écran depuis le passage aux lots.

Fait :
1) MIGRATION 0034 — rejoue une dernière fois, à l'identique et de façon
   idempotente, la reprise de la 0027 (au cas où des lignes auraient été
   ajoutées depuis), PUIS supprime la table `commande_tissu_ligne`. Zéro
   perte : rien n'est droppé avant d'avoir été reconfirmé migré. Testée sur
   PostgreSQL 16 réel avec 3 cas (ligne déjà migrée → pas de doublon ; ligne
   jamais reçue avec un prévu → affectation reprise ; ligne vide → ignorée) :
   comportement exact vérifié à la main sur les données.

2) LECTURE — le feu tissu, l'écran de préparation/direction technique et
   l'inventaire tissu imprimable (déjà existant, `/magtissu/inventaire`) lisent
   désormais les matières d'une commande depuis les LOTS qui lui sont affectés
   (nouvelle fonction `ligneTissuParCommandes` dans lib/services/tissu.ts) —
   un lot affecté = une ligne « matière », avec sa référence/couleur/laize/
   contrôle qualité propres. Testé bout en bout sur données réelles
   (`listPreparation`, `inventaireTissu`, calcul du feu).
   Nuance assumée : le modèle par lots ne porte plus de « métrage prévu »
   distinct par matière (ce n'était de toute façon plus alimentable : les
   actions de saisie détail étaient déjà mortes). Le métrage affecté est donc
   porté des deux côtés (prévu = reçu) pour ne jamais afficher un faux manque
   là où rien n'a été promis — l'écart affiché sera 0 pour les nouvelles
   matières issues des lots (les lignes historiques reprises depuis
   commande_tissu_ligne gardent leurs vrais prévu/reçu d'origine).

3) ÉCRITURE — `commande.tissu_libere` (utilisé par la traçabilité et les
   rapports) est maintenant recalculé automatiquement depuis les lots à
   chaque endroit qui peut le faire changer : contrôle qualité d'un lot,
   nouvelle affectation, suppression d'affectation, suppression d'un lot
   (lib/actions/tissu.ts). Avant cette migration, ce recalcul n'existait plus
   pour le mode détail (il dépendait des mêmes fonctions mortes) — c'est
   corrigé au passage, testé bout en bout sur PostgreSQL réel (contrôle d'un
   lot → tissu_libere passe à true dès que toutes les matières affectées sont
   conformes/sous réserve).

4) CODE MORT RETIRÉ — ajouterLigneTissu / majLigneTissu / supprimerLigneTissu
   et leurs actions serveur associées (jamais appelées depuis un écran).

Fichiers : lib/db/schema/preparation.ts (table retirée), lib/services/tissu.ts
(ligneTissuParCommandes), lib/services/preparation.ts (lecture branchée sur les
lots, code mort retiré), lib/actions/tissu.ts (recalcul tissu_libere),
lib/actions/preparation.ts (actions mortes retirées), drizzle/0034_*.sql.

À savoir pour l'installation : la commande `npm run build` de cet
environnement de vérification a échoué uniquement sur la police Google Fonts
(`next/font/google`), bloquée par la politique réseau de ce bac à sable —
sans rapport avec le code. `tsc --noEmit`, `eslint` et `npm test` (128 tests)
sont tous passés, et la migration + toute la logique ont été vérifiées à la
main sur un vrai PostgreSQL 16. Le build normal, avec accès réseau standard,
n'a pas de raison d'échouer.

═══════════════════════════════════════════════════════════════
DÉJÀ LIVRÉ (rappel)
═══════════════════════════════════════════════════════════════
Simulation GPAO : valorisation manuelle (prix_manuel) + bilan coût (heures ×
coût horaire, marge, coût/pièce). GPAO : équilibrage (goulot + indice + débits
+ suggestions) · onglet arrêts & retouches (historique + rapports) ·
rapprochement auto modèle↔commande · rendement moyen unifié · simulation
pièces & CA · pont GPAO → avancement · QR sans fiche personnel · rendement
chaîne = réel÷objectif · historique par seuil · garde-robe (SAM réel) · arrêts
par ouvrière · modèle depuis commande DBS · catalogue temps réels préfixé du
modèle · effectif propre par chaîne · heures décimales.
Clients · Commandes · Facturation/Facture HT · Plan façonnier (détail confiées)
· Magasin fournitures · Contrôle Qualité complet · Magasin Tissu par lots · Plan
de coupe ↔ magasin tissu.

MIGRATIONS (ordre) : 0021→0037.

RESTE (validation) : référentiel de défauts QC éditable (remplacer la liste
`FAMILLES_DEFAUT` codée en dur dans lib/domain/qc.ts par un référentiel géré en
base, modifiable par un admin).

INSTALLATION : décompresser par-dessus le projet, `npm install`, `npm run build`.
