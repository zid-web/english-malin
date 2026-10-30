# English Malin — PWA d'apprentissage de l'anglais

## Lancer en local
Un Service Worker exige `http://localhost` ou HTTPS (pas `file://`).

    cd english-quest
    python3 -m http.server 8080      # ou : npx serve .

Ouvrir http://localhost:8080 dans Chrome/Edge → bouton « Installer l'application ».
Test hors ligne : DevTools › Application › Service Workers › Offline, puis recharger.
Android : déployer en HTTPS (Netlify, Vercel, GitHub Pages) puis ouvrir dans Chrome.

## Mise à jour
Incrémenter `CACHE_VERSION` dans `sw.js` : l'app propose « Recharger ».
