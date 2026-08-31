# Plan : notifications automatiques, trafic géolocalisé, responsive et sauvegardes

Le périmètre demandé est large : je le livre en 5 lots, dans cet ordre, chacun testé avant de passer au suivant.

## Lot 1 — Performance du site

- Réduire les données transférées : sélection de colonnes explicites (plus de `select('*')` sur produits, commandes, articles), pagination côté serveur sur les listes admin.
- Index manquants en base sur les colonnes de tri/filtre les plus utilisées (commandes, produits, paiements, logs).
- Chargement différé des onglets admin lourds et des images (déjà partiellement fait), cache réseau conservé à 10 min.
- Mesure avant/après sur les pages Accueil, Boutique et Admin.

## Lot 2 — Téléphone international + routage SMS / WhatsApp automatique

- Nouveau composant de saisie téléphone : liste déroulante de **tous les pays du monde** avec drapeau, recherche multicritère (nom du pays, nom local, indicatif, code ISO), navigation clavier par lettre. Détection automatique du pays par défaut (Côte d'Ivoire).
- Intégré partout où un numéro est saisi : commande/livraison, compte et adresses, formulaires équipe, envoi SMS manuel dans l'admin.
- Numéro stocké au format international normalisé (E.164).
- Routage automatique côté serveur :
  - indicatif **zone UEMOA** (Bénin, Burkina, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal, Togo) → SMS via le fournisseur actuel ;
  - tout autre indicatif → **WhatsApp au nom de SCOLY avec le logo officiel joint** (fichier fourni, pas d'image générée), via le canal WhatsApp du fournisseur smsing.app.
- Journalisation unifiée du canal réellement utilisé et repli SMS si WhatsApp échoue.

> Point à confirmer : si smsing.app n'expose pas de canal WhatsApp, il faudra un compte Twilio ou Meta ; je vous le dirai dès la vérification technique faite, et le SMS restera actif entre-temps.

## Lot 3 — Notifications automatiques du cycle de commande

Déclenchement **automatique en arrière-plan** (déclencheurs base de données, aucun envoi manuel) à chaque étape :

| Étape | Message |
|---|---|
| Commande créée | numéro de commande, montant, lien de suivi |
| Paiement confirmé | confirmation + lien du reçu PDF |
| Commande expédiée | numéro de commande + lien de suivi |
| Livreur en route | nom du livreur + lien |
| Livrée | confirmation + lien d'avis |
| Annulée | motif + lien support |

- Modèles modifiables dans l'admin (déjà présents), avec variables `{numero_commande}`, `{montant}`, `{lien}`, `{nom}`.
- Chaque message contient le numéro de commande et un lien direct.

## Lot 4 — Statistiques de trafic géolocalisées (admin)

- Enregistrement de chaque visite : page, date, pays, continent, ville/région, appareil, source — géolocalisation par IP côté serveur, sans stockage d'IP brute.
- Compteur de visites démarré à **3 897** puis incrémenté en continu.
- Tableau de bord : indicateurs (visites, visiteurs uniques, pages vues, durée), courbe temporelle, carte/classement par continent, pays et ville, top pages, répartition mobile/desktop, filtres de période.

## Lot 5 — Équipes, responsive et sauvegardes

- Vérification complète des espaces par rôle (admin, commercial, comptable, livreur, référent, vendeur, modérateur) : création de comptes par l'admin, gestion des comptes équipe, permissions par module, et complétion de ce qui manque.
- Responsive : toutes les pages s'adaptent à l'écran ; côté admin, tableaux à défilement contrôlé, onglets condensés et cartes empilées sur mobile — plus aucun débordement.
- Sauvegarde automatique quotidienne de la base (tâche planifiée + export vers le stockage), historique consultable et restauration depuis l'admin.
- Tests de bout en bout des reçus PDF (nom, n° de commande, contact, date) sur plusieurs commandes et plusieurs équipes.

## Détails techniques

- Migrations : table `visits` (+ agrégats et compteur de départ 3897), colonnes de canal/pays sur `sms_logs`, index de performance, déclencheurs de notification de commande, tâche `pg_cron` quotidienne de sauvegarde.
- Fonctions Edge : `send-sms` étendu (routage UEMOA/WhatsApp, pièce jointe logo, modèles), nouvelle fonction de notification de commande, `track-visit`, sauvegarde planifiée.
- Frontend : composant `PhoneInput` réutilisable, onglet « Trafic » dans l'admin, corrections responsive ciblées.
- Le blocage utilisateur en cas de clés KkiaPay LIVE/sandbox incohérentes est déjà en place ; je le complète avec un guidage de correction explicite.
