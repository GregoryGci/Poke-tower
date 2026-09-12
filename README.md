# Poke Tower

Tower defense 3D jouable dans le navigateur, avec un dresseur contrôlé en
temps réel pendant que les Pokémon posés défendent en autonomie.

Projet personnel non commercial. Voir [CREDITS.md](CREDITS.md) pour les
licences des assets — elles imposent l'attribution et interdisent la
monétisation.

## Démarrer

```bash
npm install
npm run dev
```

La sauvegarde se fait dans le navigateur par défaut. Pour la basculer en
ligne, copier `.env.example` vers `.env.local` et renseigner les deux
variables Supabase. Le jeu reste jouable sans.

Scripts : `npm run dev`, `npm run build`, `npm run typecheck`,
`npm run convert -- <fichier.geo.json>`.

## Commandes en jeu

| Touche | Effet |
|---|---|
| ZQSD / WASD / flèches | Déplacer le dresseur |
| Clic gauche | Poser le Pokémon sélectionné |
| Clic droit | Annuler la sélection |
| Espace | Lancer un appât (détourne les ennemis proches) |

## Structure

```
src/
  core/      boucle à pas fixe, entrées, chargement d'assets, recyclage d'objets
  render/    scène, caméra fixe, lumières
  world/     chemin des ennemis, terrain, grille de hachage spatial
  entities/  dresseur, Pokémon posé, ennemi, projectile
  game/      vagues, règles de pose, orchestrateur de manche
  data/      types du jeu, espèces, attaques, traits, tirages aléatoires
  save/      contrat de sauvegarde, navigateur, Supabase
tools/       convertisseurs d'assets (Bedrock -> glTF, fusion voxel)
```

## Décisions structurantes

**Boucle à pas fixe (30 Hz).** La logique avance par pas constants, le rendu
interpole. Une vague se déroule donc identiquement quel que soit le framerate,
ce qui sera indispensable pour synchroniser les raids à deux joueurs.

**Caméra strictement fixe.** Une seule direction de vue : une seule shadow map
à cadrer, un tri de profondeur stable, aucun angle sous lequel le décor se
troue. C'est une contrainte du brief qui se paie en gain de performance.

**Grille de hachage spatial.** Avec 20 tours contre 150 ennemis, chercher les
cibles naïvement ferait 3 000 tests de distance par tick. Les ennemis sont
rangés dans des cases, chaque tour ne teste que les cases qu'elle couvre.

**Ennemis et projectiles en `InstancedMesh`.** Un seul appel de rendu pour
toute la vague, quel que soit le nombre d'unités. Le plafond est fixé à 256
ennemis et 512 projectiles simultanés.

**Placement continu, pas en cases.** Le brief demande une liberté totale de
pose hors de la route. Les positions sont donc validées en continu
(distance à la route, distance aux autres Pokémon) plutôt que posées sur une
grille.

**Sauvegarde derrière un contrat.** Le gameplay ignore où va sa sauvegarde,
ce qui permet de passer du navigateur à Supabase sans y toucher.

## État

Fondations techniques posées et vérifiées (`npm run build` passe). Les unités
sont des primitives : l'habillage avec les modèles convertis et la direction
artistique restent à faire.
