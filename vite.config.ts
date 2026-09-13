import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  /**
   * Chemins relatifs, et non absolus.
   *
   * GitHub Pages sert le jeu sous un sous-dossier — /Poke-tower/ — alors que
   * Vite ecrit par defaut des liens partant de la racine du domaine. Les
   * scripts et les feuilles de style pointaient donc vers /assets/, qui
   * n existe pas la-bas, et la page restait blanche.
   *
   * './' fonctionne a n importe quelle profondeur, y compris a la racine :
   * c est le seul reglage qui n a pas besoin de connaitre le nom du depot.
   * Les assets charges a l execution — modeles, sons, illustrations — sont
   * deja demandes en relatif, donc ils suivent sans rien changer.
   */
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // three pèse lourd : on l'isole pour qu'il soit mis en cache séparément du code de jeu.
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], supabase: ['@supabase/supabase-js'] },
      },
    },
  },
});
