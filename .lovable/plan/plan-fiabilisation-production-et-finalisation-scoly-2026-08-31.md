# Plan : fiabilisation production et finalisation Scoly

## Priorité 1 — Version déployée, catalogue et panier
- Supprimer le double système de Service Worker et désactiver tout cache applicatif d’affichage/API ; conserver uniquement la session/authentification et les paniers persistants.
- Forcer `index.html`, le manifeste et le Service Worker en `no-store` côté hébergement, tout en gardant les fichiers versionnés Vite sûrs.
- Ajouter une détection de nouvelle version qui purge les anciens caches et recharge une seule fois la page.
- Rendre le panier produit et kit résilient à la connexion/déconnexion et aux anciennes données locales ; vérifier panier → commande → paiement.
- Vérifier les lectures publiques réelles de `products` et `smart_kits` et leurs règles d’accès.

## Priorité 2 — Performance
- Remplacer les lectures massives et `select('*')` critiques par des colonnes explicites et une pagination serveur, en priorité catalogue, articles et listes admin.
- Ajouter uniquement les index confirmés par les requêtes lentes, puis mesurer à nouveau.
- Éviter les requêtes N+1 sur les commandes et articles.

## Priorité 3 — Notifications et trafic
- Brancher `send-sms` sur le moteur partagé SMS UEMOA / WhatsApp hors UEMOA avec repli SMS.
- Créer `notify-order`, valider l’appel serveur, puis ajouter les déclencheurs asynchrones pour création, paiement, expédition, livreur en route, livraison et annulation.
- Créer `track-visit` avec géolocalisation IP sans conserver l’IP brute, l’appeler côté client et ajouter l’onglet « Trafic » avec indicateurs et graphiques.

## Priorité 4 — Admin, équipes, reçus et sauvegardes
- Finaliser la pagination des listes admin et supprimer les débordements sur mobile.
- Vérifier les menus et accès par rôle existants, sans ouvrir de droits globaux dangereux.
- Vérifier la sauvegarde quotidienne et la restauration protégée.
- Tester les reçus PDF filtrés par client, commande et date et corriger le flux en échec.

## Priorité 5 — SEO demandé
- Appliquer exactement le titre et la description d’accueil fournis à `index.html`, `SEOHead` et au JSON-LD.
- Harmoniser Boutique, Ressources, Conditions et Liste de souhaits ainsi que les textes i18n concernés.
- Renommer les deux accès publics en « Kits scolaires » et « Kits scolaires par école » et conserver leurs routes indexables.
- Relancer le diagnostic SEO et corriger uniquement les constats applicables au code.

## Validation
- Vérifier le build, les tests ciblés, les fonctions Edge déployées, les politiques et déclencheurs SQL.
- Tester en navigateur les parcours catalogue, produit, kit, panier, connexion, commande, admin mobile et métadonnées.
- Signaler séparément ce qui dépend d’un réglage externe ou d’un paiement réel ; aucune validation financière réelle ne sera déclenchée pendant les tests.

## Détails techniques
- Les migrations restent minimales, avec RLS et droits par rôle ; je ne rendrai pas toutes les tables permissives ni accessibles en CRUD complet, car cela exposerait commandes, paiements et données clients.
- Les données d’authentification restent persistantes. Les données d’affichage/API ne seront pas conservées entre versions.
- Le site utilise déjà le client Supabase direct, qui est le chemin le plus rapide pour les lectures RLS ; les opérations sensibles restent dans les fonctions Edge/RPC.
