// -----------------------------------------------------------------------------
// Names of the inputs ("functions") and sound modes ("equalisers") the
// soundbar reports as indexes (`i_curr_func` / `ai_func_list`,
// `i_curr_eq` / `ai_eq_list`).
//
// Indexes 0-22 (sound modes) and 0-20 (inputs) are the tables of
// python-temescal 0.5. Sound modes 23-26 and input 21 come from two pull
// requests of the maintained fork (mjg59/python-temescal #2 and #3), whose
// authors matched the indexes with the official LG app on an S90TY; Home
// Assistant issue #179638 shows an SG10TY reporting the same 23-26. Any
// other index stays usable: "Sound mode 27", "Input 22".
//
// The option values stored by Gladys are the indexes (`eq-7`, `func-6`):
// they never depend on these names, which may be corrected later.
// -----------------------------------------------------------------------------

export const FUNCTIONS = [
  'Wi-Fi',
  'Bluetooth',
  'Portable',
  'Aux',
  'Optical',
  'CP',
  'HDMI',
  'ARC',
  'Spotify',
  'Optical 2',
  'HDMI 2',
  'HDMI 3',
  'LG TV',
  'Mic',
  'Chromecast',
  'Optical / HDMI ARC',
  'LG Optical',
  'FM',
  'USB',
  'USB 2',
  'E-ARC',
  'WOWCAST',
];

export const EQUALISERS = [
  'Standard',
  'Bass',
  'Flat',
  'Boost',
  'Treble and Bass',
  'User EQ',
  'Music',
  'Cinema',
  'Night',
  'News',
  'Voice',
  'IA Sound',
  'Adaptive Sound Control',
  'Movie',
  'Bass Blast',
  'Dolby Atmos',
  'DTS Virtual:X',
  'Bass Boost Plus',
  'DTS:X',
  'AI Sound Pro',
  'Clear Voice',
  'Sports',
  'Game',
  'Sync with TV',
  'AI Sound Pro (24)',
  'AI Sound Pro (25)',
  'Clear Voice Pro',
];

// Names a user reads in their language; the others are brand or technical
// names, the same everywhere.
const TRANSLATED = {
  func: {
    3: { fr: 'Entrée auxiliaire', de: 'AUX-Eingang', es: 'Entrada auxiliar' },
    4: { fr: 'Optique', de: 'Optisch', es: 'Óptica' },
    9: { fr: 'Optique 2', de: 'Optisch 2', es: 'Óptica 2' },
    12: { fr: 'TV LG', de: 'LG TV', es: 'TV LG' },
    13: { fr: 'Micro', de: 'Mikrofon', es: 'Micrófono' },
    15: { fr: 'Optique / HDMI ARC', de: 'Optisch / HDMI ARC', es: 'Óptica / HDMI ARC' },
    16: { fr: 'Optique LG', de: 'LG Optisch', es: 'Óptica LG' },
  },
  eq: {
    0: { fr: 'Standard', de: 'Standard', es: 'Estándar' },
    1: { fr: 'Graves', de: 'Bass', es: 'Graves' },
    2: { fr: 'Plat', de: 'Linear', es: 'Plano' },
    3: { fr: 'Boost', de: 'Boost', es: 'Realce' },
    4: { fr: 'Aigus et graves', de: 'Höhen und Bass', es: 'Agudos y graves' },
    5: { fr: 'Égaliseur perso', de: 'Benutzer-EQ', es: 'Ecualizador propio' },
    6: { fr: 'Musique', de: 'Musik', es: 'Música' },
    7: { fr: 'Cinéma', de: 'Kino', es: 'Cine' },
    8: { fr: 'Nuit', de: 'Nacht', es: 'Noche' },
    9: { fr: 'Actualités', de: 'Nachrichten', es: 'Noticias' },
    10: { fr: 'Voix', de: 'Sprache', es: 'Voz' },
    12: {
      fr: 'Contrôle adaptatif du son',
      de: 'Adaptive Klangsteuerung',
      es: 'Control adaptativo del sonido',
    },
    13: { fr: 'Film', de: 'Film', es: 'Película' },
    20: { fr: 'Voix claire', de: 'Klare Stimme', es: 'Voz clara' },
    21: { fr: 'Sport', de: 'Sport', es: 'Deportes' },
    22: { fr: 'Jeu', de: 'Spiel', es: 'Juego' },
    23: { fr: 'Synchro avec la TV', de: 'Mit TV synchronisieren', es: 'Sincronizar con la TV' },
    26: { fr: 'Voix claire Pro', de: 'Klare Stimme Pro', es: 'Voz clara Pro' },
  },
};

const UNKNOWN = {
  func: { en: 'Input {n}', fr: 'Entrée {n}', de: 'Eingang {n}', es: 'Entrada {n}' },
  eq: {
    en: 'Sound mode {n}',
    fr: 'Mode sonore {n}',
    de: 'Klangmodus {n}',
    es: 'Modo de sonido {n}',
  },
};

/**
 * @description The option value of an index.
 * @param {'func'|'eq'} kind - Inputs or sound modes.
 * @param {number} index - The index of the soundbar.
 * @returns {string} `func-6`, `eq-7`.
 */
export function optionValue(kind, index) {
  return `${kind}-${index}`;
}

/**
 * @description The index of an option value.
 * @param {'func'|'eq'} kind - Inputs or sound modes.
 * @param {*} value - `func-6`, or a bare index.
 * @returns {number|null} The index, null when it is not one of this kind.
 */
export function optionIndex(kind, value) {
  const text = String(value ?? '').trim();
  const match = new RegExp(`^(?:${kind}-)?(\\d{1,3})$`).exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * @description The name of an index in a language.
 * @param {'func'|'eq'} kind - Inputs or sound modes.
 * @param {number} index - The index.
 * @param {string} language - en, fr, de or es.
 * @returns {string} The name.
 */
export function optionLabel(kind, index, language = 'en') {
  const table = kind === 'func' ? FUNCTIONS : EQUALISERS;
  if (!Number.isInteger(index) || index < 0 || index >= table.length) {
    const template = UNKNOWN[kind][language] ?? UNKNOWN[kind].en;
    return template.replace('{n}', String(index));
  }
  return TRANSLATED[kind][index]?.[language] ?? table[index];
}

// Inputs the soundbar may report under another index than the one of its
// list (an SP8YA lists Optical / HDMI ARC, 15, and reports E-ARC, 20, while
// the TV plays): the same groups as the Home Assistant integration.
const EQUIVALENT_FUNCTIONS = [
  [15, 20, 7, 16, 4, 9],
  [6, 10, 11],
  [18, 19],
  [1, 2],
  [0, 14, 8],
];

/**
 * @description The input to show for the current one: itself when listed,
 * else a listed input of the same group, else itself.
 * @param {number} current - `i_curr_func`.
 * @param {number[]} offered - `ai_func_list`.
 * @returns {number} The index to show.
 */
export function shownFunction(current, offered) {
  if (!Array.isArray(offered) || offered.includes(current)) {
    return current;
  }
  const group = EQUIVALENT_FUNCTIONS.find((indexes) => indexes.includes(current)) ?? [];
  return group.find((index) => offered.includes(index)) ?? current;
}
