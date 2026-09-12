/**
 * batch-convert.js — convertit un lot d'espèces depuis les sources Cobblemon.
 *
 * Attend un dossier contenant un sous-dossier par espèce (tel qu'extrait du
 * dépôt cobblemon-assets), et produit un .glb par espèce dans public/models.
 *
 * Usage : node tools/batch-convert.js <dossier-sources> [dossier-sortie]
 *
 * Quand une espèce est déclinée (bulbasaur_male / bulbasaur_female), seule la
 * première variante est convertie : le jeu n'affiche pas le genre.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONVERTER = path.join(__dirname, 'bedrock-to-gltf.js');

function findGeoFile(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.geo.json'));
  if (files.length === 0) return null;
  // Un dossier peut contenir des formes régionales (un Linoone rangé chez
  // Zigzaton) : on exige que le fichier porte le nom de l'espèce, et on
  // préfère la variante sans suffixe de genre.
  const expected = speciesName(path.basename(dir));
  const matching = files.filter((f) => f.toLowerCase().startsWith(expected));
  const pool = matching.length ? matching : files;
  pool.sort((a, b) => {
    const score = (name) => (name.includes('female') ? 2 : name.includes('male') ? 1 : 0);
    return score(a) - score(b) || a.length - b.length || a.localeCompare(b);
  });
  return path.join(dir, pool[0]);
}

/** Nom d'espèce déduit du dossier : « 0001_bulbasaur » -> « bulbasaur ». */
function speciesName(dirName) {
  return dirName.replace(/^\d+_/, '').toLowerCase();
}

function main() {
  const [, , sourceDir, outputArg] = process.argv;
  if (!sourceDir) {
    console.error('Usage : node tools/batch-convert.js <dossier-sources> [dossier-sortie]');
    process.exit(1);
  }
  const outputDir = outputArg || path.join(__dirname, '..', 'public', 'models');
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const results = [];
  for (const dirName of entries) {
    const name = speciesName(dirName);
    const geoFile = findGeoFile(path.join(sourceDir, dirName));
    if (!geoFile) {
      results.push({ name, ok: false, detail: 'aucun .geo.json' });
      continue;
    }
    const outFile = path.join(outputDir, `${name}.glb`);
    try {
      const stdout = execFileSync(process.execPath, [CONVERTER, geoFile, outFile], { encoding: 'utf8' });
      const grab = (label) => stdout.match(new RegExp(`${label}\\s+([^\\n]+)`))?.[1]?.trim() ?? '?';
      results.push({
        name,
        ok: true,
        triangles: grab('Triangles'),
        bones: grab('Os'),
        animations: grab('Animations'),
        size: (fs.statSync(outFile).size / 1024).toFixed(0) + ' Ko',
      });
    } catch (error) {
      const message = (error.stderr || error.message || '').split('\n').find((l) => l.includes('Error')) ?? 'échec';
      results.push({ name, ok: false, detail: message.trim().slice(0, 70) });
    }
  }

  const ok = results.filter((r) => r.ok);
  console.log(`\n  ${ok.length}/${results.length} espèces converties vers ${path.relative(process.cwd(), outputDir)}\n`);
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${r.name.padEnd(14)} ${r.triangles.padEnd(22)} ${r.bones.padEnd(5)} os  ${r.animations.padEnd(34)} ${r.size}`);
    } else {
      console.log(`  ${r.name.padEnd(14)} ÉCHEC : ${r.detail}`);
    }
  }
  console.log('');
  if (ok.length !== results.length) process.exitCode = 1;
}

main();
