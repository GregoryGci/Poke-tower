# Poke Tower

Tower defense 3D jouable dans le navigateur, avec un dresseur contrôlé en
temps réel pendant que les Pokémon posés défendent en autonomie.

Projet personnel non commercial. Voir [CREDITS.md](CREDITS.md) : les licences
des assets imposent l'attribution et interdisent la monétisation.

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
| Espace | Capturer une proie affaiblie, ou lancer un appât |

## Parcours du joueur

Choix du starter dans une valise de professeur, puis menu. Depuis le menu :
une manche d'histoire, la fiche de son équipe, ou l'invocation. Une manche
se termine par une victoire — trois vagues contenues — ou par une défaite,
au dixième ennemi passé.

## Structure

```
src/
  core/      boucle à pas fixe, entrées, chargement d'assets, recyclage d'objets
  render/    scène et caméra fixe, vitrine des starters, animation par texture
  world/     chemin des ennemis, terrain, grille de hachage spatial
  entities/  dresseur, Pokémon posé, ennemi, projectile
  game/      vagues, règles de pose, orchestrateur de manche
  data/      types, espèces, attaques, traits, tirages, taux d'invocation
  save/      contrat de sauvegarde, navigateur, Supabase
  ui/        thème, menu, écran de starter, HUD, équipe, invocation, bilan
tools/       convertisseurs d'assets (Bedrock -> glTF, Molang, fusion voxel)
```

## Décisions structurantes

**Boucle à pas fixe (30 Hz).** La logique avance par pas constants, le rendu
interpole. Une vague se déroule donc identiquement quel que soit le
framerate, ce qui sera indispensable pour synchroniser les raids.

**Caméra strictement fixe.** Une seule direction de vue : une seule shadow
map à cadrer, un tri de profondeur stable, aucun angle sous lequel le décor
se troue.

**Deux régimes de rendu.** Les ennemis, nombreux et lointains, passent par
une texture d'animation (`render/vat.ts`) : leurs poses sont cuites au
chargement et lues par le vertex shader, ce qui permet un seul appel de rendu
par espèce quel que soit le nombre d'unités. Les Pokémon posés, peu nombreux
et au premier plan, gardent un vrai squelette. Le VAT n'est possible que
parce que la conversion Bedrock garantit une seule influence par sommet.

**Grille de hachage spatial.** Avec 20 tours contre 150 ennemis, chercher les
cibles naïvement ferait 3 000 tests de distance par tick.

**Placement continu, pas en cases.** Les positions sont validées par distance
à la route et aux voisins, ce qui laisse la liberté de pose demandée au brief.

**Sauvegarde derrière un contrat.** Le gameplay ignore où va sa sauvegarde.

**Chaque manche construit un `Game` neuf** et le détruit en sortant, plutôt
que de remettre à zéro un état devenu complexe.

## Assets

Les modèles viennent des assets Cobblemon, au format Minecraft Bedrock.
`tools/bedrock-to-gltf.js` les convertit en glTF : un seul maillage, un os par
bone, textures et animations comprises. Les animations de repos et de marche
y sont écrites en Molang, un langage d'expressions — `tools/molang.js` les
évalue et `tools/bedrock-anim.js` les échantillonne en keyframes.

## État

Jouable de bout en bout : choix du starter, menu, manche avec vagues,
capture, invocation, bilan. Le mode raid et le reroll de traits restent à
écrire.
