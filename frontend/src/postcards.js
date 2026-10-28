// Palettes des illustrations SVG des villas : une ambiance par ville de la Riviera.
// Les illustrations sont générées côté serveur (views/partials/postcard.ejs) :
// aucune image à télécharger, rendu instantané, et fonctionnement hors ligne.

const PALETTES = {
  // Nice : matinée azur sur la baie des Anges
  nice: {
    skyTop: '#8ec5f0', skyBottom: '#fbe6c8', sun: '#ffd27a', sunX: 372, sunY: 88,
    seaTop: '#2c86cc', seaBottom: '#0c4a86', hillFar: '#a5bed4', hillNear: '#7d9c6c',
    ground: '#efe1c6', wall: '#fffaf1', wall2: '#f4e6cf', roof: '#d4683f', roofStyle: 'tile',
    window: '#21507f', tree: '#2c4a33', trunk: '#7b5a3c', frond: '#3e6d47', pool: '#43c6da',
  },
  // Cannes : coucher de soleil sur la Croisette, architecture contemporaine
  cannes: {
    skyTop: '#ff9f80', skyBottom: '#fde3c4', sun: '#ff6f4e', sunX: 112, sunY: 104,
    seaTop: '#3a76b0', seaBottom: '#173f6d', hillFar: '#cf9b86', hillNear: '#8c7a5a',
    ground: '#f2dcc0', wall: '#fffaf3', wall2: '#f6e3d0', roof: '#33475b', roofStyle: 'flat',
    window: '#2a3d58', tree: '#2f4635', trunk: '#6f4f35', frond: '#46694a', pool: '#4fd1e0',
  },
  // Antibes : pinède et collines, sans vue sur la mer
  antibes: {
    skyTop: '#b7e0cc', skyBottom: '#f8f1df', sun: '#f6d067', sunX: 384, sunY: 78,
    seaTop: '#3b8fb5', seaBottom: '#1b5c80', hillFar: '#a8c2a2', hillNear: '#5d8455',
    ground: '#e9dcc0', wall: '#fbf3e4', wall2: '#efe0c4', roof: '#c25f38', roofStyle: 'tile',
    window: '#355a3f', tree: '#2b452b', trunk: '#6d4e31', frond: '#3f6a3f', pool: '#48c3cf',
  },
  // Saint-Tropez : lumière dorée sur Pampelonne
  sainttropez: {
    skyTop: '#ffcf73', skyBottom: '#fff0d2', sun: '#ff9f43', sunX: 300, sunY: 70,
    seaTop: '#1d8cbd', seaBottom: '#0a5784', hillFar: '#d9bb8b', hillNear: '#9c8a55',
    ground: '#f5e3c3', wall: '#fffbf4', wall2: '#f8ead4', roof: '#3d4a52', roofStyle: 'flat',
    window: '#1f4e6e', tree: '#33492e', trunk: '#7a5734', frond: '#4c7244', pool: '#3fd0e4',
  },
  // Menton : jaune citron, la ville des agrumes
  menton: {
    skyTop: '#ffe596', skyBottom: '#fff8e6', sun: '#f2b53a', sunX: 404, sunY: 96,
    seaTop: '#3d95c8', seaBottom: '#1c5f95', hillFar: '#c9cb9b', hillNear: '#7e8f4a',
    ground: '#f3e6c6', wall: '#fff7e3', wall2: '#ffe9bf', roof: '#d0703e', roofStyle: 'tile',
    window: '#2c5c86', tree: '#3f5a26', trunk: '#76563a', frond: '#557a36', pool: '#4ac8d6',
  },
  // Èze : crépuscule lavande sur le village perché
  eze: {
    skyTop: '#bba9de', skyBottom: '#f8dfe0', sun: '#ff9478', sunX: 104, sunY: 116,
    seaTop: '#4a5fa6', seaBottom: '#26306b', hillFar: '#9b89c4', hillNear: '#6e6497',
    ground: '#eadbd2', wall: '#fff9f4', wall2: '#f2e2da', roof: '#3e3b5c', roofStyle: 'flat',
    window: '#33325c', tree: '#2e3c34', trunk: '#6b4f3a', frond: '#3f5f4c', pool: '#5ec6dd',
  },
};

// « Saint-Tropez » → « sainttropez », « Èze » → « eze »
export const cityKey = (city) => city.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();

export const paletteFor = (city) => PALETTES[cityKey(city)] ?? PALETTES.nice;
