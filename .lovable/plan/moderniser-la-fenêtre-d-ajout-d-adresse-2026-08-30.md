# Moderniser la fenêtre d’ajout d’adresse

## Objectif
Reproduire dans l’espace client l’apparence de la maquette fournie, sans modifier l’enregistrement des adresses ni le reste de la page.

## Modifications
- Recomposer la modale dans `Account.tsx` avec un en-tête illustré bleu, un titre et un sous-titre.
- Ajouter les icônes intégrées, les libellés/astérisques, les placeholders, le préfixe téléphonique `+225` et la case « Définir comme adresse par défaut ».
- Adapter la largeur, les espacements, les arrondis, les couleurs et le bouton principal, avec une mise en page responsive sur mobile.
- Relier la case au champ `isDefault` déjà présent et conserver la validation/sauvegarde existante.
- Vérifier visuellement la modale dans le navigateur et corriger les éventuels défauts de responsive.

## Détails techniques
- Réutilisation des composants UI et icônes Lucide déjà installés.
- Aucun changement de schéma, d’API ou de logique métier hors liaison du champ `isDefault` existant.
