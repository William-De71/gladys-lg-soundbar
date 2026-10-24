// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, statuses, errors, toasts and the
// result of the configuration button. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo); German says "du", Spanish "usted", like
// Gladys. Models, inputs such as HDMI and brand names are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // Features (the device name comes first: "LG SP8YA - Volume").
  feature_power: { en: 'Power', fr: 'Marche/arrêt', de: 'Ein/Aus', es: 'Encendido' },
  feature_volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  feature_mute: { en: 'Mute', fr: 'Muet', de: 'Stummschaltung', es: 'Silencio' },
  feature_source: { en: 'Input', fr: 'Source', de: 'Eingang', es: 'Entrada' },
  feature_sound_mode: {
    en: 'Sound mode',
    fr: 'Mode sonore',
    de: 'Klangmodus',
    es: 'Modo de sonido',
  },
  feature_night_mode: { en: 'Night mode', fr: 'Mode nuit', de: 'Nachtmodus', es: 'Modo noche' },
  feature_auto_volume: {
    en: 'Auto volume',
    fr: 'Volume automatique',
    de: 'Automatische Lautstärke',
    es: 'Volumen automático',
  },
  feature_drc: {
    en: 'Dynamic range control',
    fr: 'Compression dynamique (DRC)',
    de: 'Dynamikkompression (DRC)',
    es: 'Compresión dinámica (DRC)',
  },
  feature_auto_power: {
    en: 'Auto power on',
    fr: 'Allumage automatique',
    de: 'Automatisches Einschalten',
    es: 'Encendido automático',
  },
  feature_woofer_level: {
    en: 'Subwoofer level',
    fr: 'Niveau du caisson de basses',
    de: 'Subwoofer-Pegel',
    es: 'Nivel del subwoofer',
  },
  feature_rear_level: {
    en: 'Rear speakers level',
    fr: 'Niveau des enceintes arrière',
    de: 'Pegel der Rücklautsprecher',
    es: 'Nivel de los altavoces traseros',
  },
  feature_center_level: {
    en: 'Center level',
    fr: 'Niveau du canal central',
    de: 'Center-Pegel',
    es: 'Nivel del canal central',
  },
  feature_top_level: {
    en: 'Up-firing level',
    fr: 'Niveau des haut-parleurs verticaux',
    de: 'Pegel der Höhenlautsprecher',
    es: 'Nivel de los altavoces verticales',
  },
  feature_playback: { en: 'Playback', fr: 'Lecture', de: 'Wiedergabe', es: 'Reproducción' },
  feature_title: { en: 'Track', fr: 'Morceau', de: 'Titel', es: 'Canción' },
  feature_artist: { en: 'Artist', fr: 'Artiste', de: 'Interpret', es: 'Artista' },
  feature_audio_signal: {
    en: 'Audio signal',
    fr: 'Signal audio',
    de: 'Audiosignal',
    es: 'Señal de audio',
  },

  // Widget.
  widgetNoSoundbar: {
    en: 'No soundbar yet: open the Discover tab of the integration, then add your soundbar.',
    fr: 'Aucune barre de son pour l’instant : ouvrez l’onglet Découverte de l’intégration, puis ajoutez votre barre de son.',
    de: 'Noch keine Soundbar: Öffne den Tab Entdecken der Integration und füge deine Soundbar hinzu.',
    es: 'Todavía no hay barra de sonido: abra la pestaña Descubrir de la integración y añada su barra de sonido.',
  },
  widgetAlbumArt: {
    en: 'Cover of the track playing',
    fr: 'Pochette du morceau en cours',
    de: 'Cover des laufenden Titels',
    es: 'Portada de la canción en curso',
  },
  widgetVolume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  widgetWoofer: { en: 'Subwoofer', fr: 'Caisson', de: 'Subwoofer', es: 'Subwoofer' },
  widgetPower: { en: 'Power', fr: 'Alimentation', de: 'Betrieb', es: 'Encendido' },
  widgetUnknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  widgetOn: { en: 'On', fr: 'Allumée', de: 'Ein', es: 'Encendida' },
  widgetOnAssumed: {
    en: 'On (assumed)',
    fr: 'Allumée (supposé)',
    de: 'Ein (angenommen)',
    es: 'Encendida (supuesto)',
  },
  widgetOff: { en: 'Off', fr: 'Éteinte', de: 'Aus', es: 'Apagada' },
  widgetNightOn: { en: 'On', fr: 'Activé', de: 'An', es: 'Activado' },
  widgetNightOff: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  widgetSource: { en: 'Input', fr: 'Source', de: 'Eingang', es: 'Entrada' },
  widgetSoundMode: { en: 'Sound mode', fr: 'Mode sonore', de: 'Klangmodus', es: 'Modo de sonido' },
  widgetMute: { en: 'Sound', fr: 'Son', de: 'Ton', es: 'Sonido' },
  widgetMuted: { en: 'Muted', fr: 'Coupé', de: 'Stumm', es: 'Silenciado' },
  widgetNight: { en: 'Night mode', fr: 'Mode nuit', de: 'Nachtmodus', es: 'Modo noche' },
  widgetSignal: { en: 'Audio signal', fr: 'Signal audio', de: 'Audiosignal', es: 'Señal de audio' },
  widgetConnection: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  widgetUnreachable: {
    en: 'Unreachable, seen {ago}',
    fr: 'Injoignable, vue {ago}',
    de: 'Nicht erreichbar, gesehen {ago}',
    es: 'Inaccesible, vista {ago}',
  },
  widgetVolumeDown: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  widgetVolumeUp: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  widgetMuteButton: { en: 'Mute', fr: 'Couper le son', de: 'Stumm', es: 'Silenciar' },
  widgetUnmute: { en: 'Unmute', fr: 'Remettre le son', de: 'Ton an', es: 'Activar sonido' },
  widgetSwitchOn: { en: 'Switch on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  widgetSwitchOff: { en: 'Switch off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },

  // Toasts of the widget buttons.
  toastVolume: {
    en: 'Volume {volume}',
    fr: 'Volume {volume}',
    de: 'Lautstärke {volume}',
    es: 'Volumen {volume}',
  },
  toastMuted: { en: 'Sound muted', fr: 'Son coupé', de: 'Ton stumm', es: 'Sonido silenciado' },
  toastUnmuted: { en: 'Sound back', fr: 'Son remis', de: 'Ton wieder an', es: 'Sonido activado' },
  toastOn: {
    en: 'Soundbar switched on',
    fr: 'Barre de son allumée',
    de: 'Soundbar eingeschaltet',
    es: 'Barra de sonido encendida',
  },
  toastOff: {
    en: 'Soundbar switched off',
    fr: 'Barre de son éteinte',
    de: 'Soundbar ausgeschaltet',
    es: 'Barra de sonido apagada',
  },

  // Status of the integration.
  statusOffline: {
    en: 'Soundbar unreachable for 2 minutes: {names}. Check that it is plugged in and on the network.',
    fr: 'Barre de son injoignable depuis 2 minutes : {names}. Vérifiez qu’elle est branchée et sur le réseau.',
    de: 'Soundbar seit 2 Minuten nicht erreichbar: {names}. Prüfe, ob sie eingesteckt und im Netzwerk ist.',
    es: 'Barra de sonido inaccesible desde hace 2 minutos: {names}. Compruebe que está enchufada y en la red.',
  },

  // Configuration button.
  searchFound: {
    en: '{count} soundbar(s): {list}',
    fr: '{count} barre(s) de son : {list}',
    de: '{count} Soundbar(s): {list}',
    es: '{count} barra(s) de sonido: {list}',
  },
  searchNone: {
    en: 'No soundbar answered on port 9741. Check that it is on, on the same network as Gladys and set up in the LG app, or type its IP address in the configuration.',
    fr: 'Aucune barre de son n’a répondu sur le port 9741. Vérifiez qu’elle est allumée, sur le même réseau que Gladys et configurée dans l’appli LG, ou saisissez son adresse IP dans la configuration.',
    de: 'Keine Soundbar hat auf Port 9741 geantwortet. Prüfe, ob sie eingeschaltet, im selben Netzwerk wie Gladys und in der LG-App eingerichtet ist, oder gib ihre IP-Adresse in der Konfiguration ein.',
    es: 'Ninguna barra de sonido ha respondido en el puerto 9741. Compruebe que está encendida, en la misma red que Gladys y configurada en la app de LG, o escriba su dirección IP en la configuración.',
  },
  searchForbidden: {
    en: 'Gladys refused the network search: reinstall the integration and accept its network discovery, or type the IP address of the soundbar in the configuration.',
    fr: 'Gladys a refusé la recherche réseau : réinstallez l’intégration en acceptant sa découverte réseau, ou saisissez l’adresse IP de la barre de son dans la configuration.',
    de: 'Gladys hat die Netzwerksuche abgelehnt: Installiere die Integration neu und erlaube ihre Netzwerkerkennung, oder gib die IP-Adresse der Soundbar in der Konfiguration ein.',
    es: 'Gladys ha rechazado la búsqueda en la red: reinstale la integración aceptando su descubrimiento de red, o escriba la dirección IP de la barra de sonido en la configuración.',
  },
  searchConnected: { en: 'connected', fr: 'connectée', de: 'verbunden', es: 'conectada' },
  searchNotConnected: {
    en: 'not connected',
    fr: 'non connectée',
    de: 'nicht verbunden',
    es: 'no conectada',
  },

  // Errors shown to the user.
  errorUnknownSoundbar: {
    en: 'Unknown soundbar: search again from the Discover tab.',
    fr: 'Barre de son inconnue : relancez une recherche depuis l’onglet Découverte.',
    de: 'Unbekannte Soundbar: Suche im Tab Entdecken erneut.',
    es: 'Barra de sonido desconocida: vuelva a buscar desde la pestaña Descubrir.',
  },
  errorUnreachable: {
    en: '{name} ({host}) does not answer on port 9741.',
    fr: '{name} ({host}) ne répond pas sur le port 9741.',
    de: '{name} ({host}) antwortet nicht auf Port 9741.',
    es: '{name} ({host}) no responde en el puerto 9741.',
  },
  errorRefused: {
    en: '{name} refused the command: this model does not support it.',
    fr: '{name} a refusé la commande : ce modèle ne la prend pas en charge.',
    de: '{name} hat den Befehl abgelehnt: Dieses Modell unterstützt ihn nicht.',
    es: '{name} ha rechazado la orden: este modelo no la admite.',
  },
  errorValue: {
    en: 'Invalid value.',
    fr: 'Valeur invalide.',
    de: 'Ungültiger Wert.',
    es: 'Valor no válido.',
  },
  errorSourceUnknown: {
    en: 'This soundbar does not offer this input.',
    fr: 'Cette barre de son ne propose pas cette source.',
    de: 'Diese Soundbar bietet diesen Eingang nicht an.',
    es: 'Esta barra de sonido no ofrece esta entrada.',
  },
  errorSoundModeUnknown: {
    en: 'This soundbar does not offer this sound mode.',
    fr: 'Cette barre de son ne propose pas ce mode sonore.',
    de: 'Diese Soundbar bietet diesen Klangmodus nicht an.',
    es: 'Esta barra de sonido no ofrece este modo de sonido.',
  },
  errorNotSupported: {
    en: 'This soundbar does not report this setting.',
    fr: 'Cette barre de son ne présente pas ce réglage.',
    de: 'Diese Soundbar meldet diese Einstellung nicht.',
    es: 'Esta barra de sonido no informa de este ajuste.',
  },
  errorNotStreaming: {
    en: 'Nothing is streamed to the soundbar: play and pause only work for music sent over the network.',
    fr: 'Rien n’est diffusé vers la barre de son : lecture et pause ne marchent que pour la musique envoyée par le réseau.',
    de: 'Nichts wird an die Soundbar gestreamt: Wiedergabe und Pause gehen nur bei Musik über das Netzwerk.',
    es: 'No se transmite nada a la barra de sonido: reproducir y pausar solo funcionan con la música enviada por la red.',
  },
  errorVolumeUnknown: {
    en: 'The volume of the soundbar is not known yet.',
    fr: 'Le volume de la barre de son n’est pas encore connu.',
    de: 'Die Lautstärke der Soundbar ist noch nicht bekannt.',
    es: 'El volumen de la barra de sonido aún no se conoce.',
  },
  errorPowerOffIgnored: {
    en: 'The soundbar stayed on: some models cannot be switched off over the network.',
    fr: 'La barre de son est restée allumée : certains modèles ne s’éteignent pas par le réseau.',
    de: 'Die Soundbar blieb an: Manche Modelle lassen sich nicht über das Netzwerk ausschalten.',
    es: 'La barra de sonido sigue encendida: algunos modelos no se apagan por la red.',
  },
  errorPowerOnIgnored: {
    en: 'The soundbar stayed off.',
    fr: 'La barre de son est restée éteinte.',
    de: 'Die Soundbar blieb aus.',
    es: 'La barra de sonido sigue apagada.',
  },
  errorPresetEmpty: {
    en: 'Choose at least one setting to apply.',
    fr: 'Choisissez au moins un réglage à appliquer.',
    de: 'Wähle mindestens eine Einstellung aus.',
    es: 'Elija al menos un ajuste que aplicar.',
  },

  // Durations.
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'hace un momento' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },
};

/**
 * @description Whether a language is one of the four.
 * @param {*} language - The language.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(language) {
  return LANGUAGES.includes(language);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('hoursAgo', language, { n: hours });
  }
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago };
