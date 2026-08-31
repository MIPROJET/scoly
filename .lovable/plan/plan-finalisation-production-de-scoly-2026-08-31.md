# Plan : finalisation production de Scoly

## 1. Fiabiliser immédiatement la version publique, les données et le panier
- Conserver le panier persistant, mais supprimer les caches d’affichage inter-version et ajouter une détection de nouvelle version avec purge/rechargement unique.
- Unifier l’hydratation des produits et kits avant/après connexion afin que `/panier` et `/checkout` utilisent toujours le même état, sans perdre les ajouts locaux.
- Afficher les vraies erreurs Supabase au lieu d’un faux état « vide » et vérifier les 523 produits actifs, 9 articles publiés et 43 kits publiés présents en base.
- Tester en navigateur : produit → panier → connexion → checkout et kit → panier → connexion → checkout.

## 2. Corriger les lenteurs mesurées
- Remplacer les derniers `select('*')` critiques et les lectures intégrales par des colonnes explicites et une pagination serveur, notamment dans l’admin.
- Corriger en priorité les lectures `articles.*`, mesurées entre 1,3 s et 2 s en moyenne, puis les lectures `products.*` répétées.
- Limiter les rafraîchissements Realtime globaux de l’admin et ne recharger que les données concernées.
- Ajouter seulement les index confirmés par les plans d’exécution et mesurer à nouveau.

## 3. Finaliser paiement réel et retraits
- Conserver KkiaPay LIVE comme flux réel : total de commande calculé côté serveur, paiement créé côté serveur, transaction vérifiée auprès de KkiaPay, puis commande confirmée atomiquement.
- Vérifier les secrets LIVE avant activation et bloquer explicitement toute clé test en production.
- Tester les retours succès, échec et callback sans effectuer de débit réel pendant les tests automatisés.
- Conserver et tester la validation serveur des retraits : montant positif, solde disponible et protection contre les demandes concurrentes.

## 4. Notifications automatiques SMS et WhatsApp
- Étendre le moteur smsing.app existant avec le canal WhatsApp réel et un repli SMS contrôlé.
- Créer `notify-order` et les déclenchements asynchrones pour : commande créée, paiement confirmé, expédiée, livreur en route, livrée et annulée.
- Inclure numéro de commande, montant ou livreur selon l’étape, et lien direct ; journaliser canal, résultat et erreur sans doublon.
- Configurer les identifiants smsing.app via le formulaire sécurisé, puis déployer et tester les fonctions Edge.

## 5. Terminer Trafic, admin et reçus PDF
- Brancher l’enregistrement de visite existant via une fonction Edge de géolocalisation IP sans stocker l’IP brute.
- Ajouter l’onglet admin « Trafic » avec période, visites, pays, villes, appareils, sources, pages et graphiques.
- Paginer côté serveur produits, commandes, utilisateurs, articles, paiements, retraits et commissions ; corriger les tableaux et contrôles qui débordent sur mobile.
- Finaliser les filtres de reçus par client, numéro de commande et date, puis tester le téléchargement PDF autorisé sur plusieurs commandes et statuts.
- Vérifier les accès par rôle sans élargir les politiques RLS.

## 6. Appliquer le SEO demandé
- Appliquer exactement sur l’accueil :
  - titre : « Fournitures scolaires en ligne en Côte d’Ivoire | Scoly » ;
  - description : « Achetez vos fournitures scolaires et bureautiques en ligne sur Scoly : cahiers, livres, manuels, papeterie, matériel de bureau et kits scolaires. Livraison gratuite partout en Côte d’Ivoire. »
- Aligner `index.html`, `SEOHead`, JSON-LD, Boutique, Ressources, Conditions, Liste de souhaits et les traductions concernées.
- Conserver « Kits scolaires » et « Kits scolaires par école », ajouter canonical, Open Graph, Twitter et JSON-LD Product aux pages produits/kits.
- Réparer le sitemap existant sans changer son mécanisme : retirer les URLs de redirection et ajouter les routes publiques pertinentes avec des dates uniquement lorsqu’elles sont autoritatives.
- Corriger uniquement les constats SEO actuels applicables au code, puis les marquer corrigés et proposer une nouvelle analyse.

## 7. Publication et validation finale
- Valider build/tests, fonctions Edge, migrations, RLS, responsive desktop/mobile et parcours complets.
- Publier seulement sur demande explicite. État constaté : ce projet n’est pas publié et aucun domaine personnalisé n’y est connecté ; `scoly.ci` ne peut donc pas encore servir cette version.
- Après connexion du domaine et publication, contrôler l’URL publique puis Google Search Console. Les DNS GSC seuls ne relient pas le domaine à ce projet Lovable.
- Documenter séparément les validations réelles et les points externes non testables sans identifiants fournisseur.

## Détails techniques
- Aucun produit, kit, article ou donnée métier ne sera supprimé.
- Les données restent dans Supabase ; le client direct Supabase avec RLS est le chemin performant pour les lectures, et les opérations sensibles restent dans RPC/fonctions Edge.
- Les ressources statiques Vite versionnées peuvent rester cacheables ; seul le document d’entrée, le manifeste et les anciens caches applicatifs doivent être invalidés, ce qui évite de ralentir chaque visite inutilement.
- La SPA actuelle limite les aperçus sociaux par page ; les métadonnées dynamiques seront améliorées, mais des aperçus sociaux parfaitement distincts nécessiteraient du rendu serveur.
