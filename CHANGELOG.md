# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.3.0] - 2026-10-25

### Added

- declare catalog keywords for Gladys 5.3 ([c0eb653](https://github.com/William-De71/gladys-lg-soundbar/commit/c0eb6531241adb7135562019af08143337c91716))

## [0.2.0] - 2026-10-25

### Added

- show the soundbar in the Gladys 5.3 music box ([7f1660f](https://github.com/William-De71/gladys-lg-soundbar/commit/7f1660f8b7a479f56129541e4c199392ac5baeb8))

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([3e4382a](https://github.com/William-De71/gladys-lg-soundbar/commit/3e4382ae79d7284773bc882c8f9f99b37074f36a))

## [0.1.0] - 2026-10-24

### Added

- **soundbars:** LG Wi-Fi soundbars of the LG Sound Bar / Wi-Fi Speaker app on the local network, over their "temescal" protocol (TCP port 9741, AES-256-CBC JSON), found through the mDNS search of Gladys (LG and Chromecast announcements) or by typed IP addresses, identified by their uuid
- **devices:** one device per soundbar with what the model reports: power (reported or assumed), volume bounded to the maximum of the soundbar, mute, input and sound mode selects read from the soundbar, night mode, auto volume, dynamic range control, auto power on, subwoofer / rear / center / up-firing levels in dB, play and pause, track and artist while streaming, audio signal
- **connection:** one connection kept per soundbar, changes pushed by the remote, the TV or the LG app published within a second, silent reconnection after the idle close of the soundbar, growing retry delay, a soundbar that moved found again, an option never to wake a soundbar in standby
- **scenes:** triggers when the input or the sound mode changes outside Gladys, when a new track starts, when a soundbar becomes unreachable or reachable again; actions to apply a sound preset (input, sound mode, night mode, volume) and to change the volume by steps
- **widgets:** the soundbar widget: volume, subwoofer, power, input, sound mode, night mode, audio signal, the track and its cover while streaming, and volume, mute and power buttons
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.3.0]: https://github.com/William-De71/gladys-lg-soundbar/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/William-De71/gladys-lg-soundbar/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-lg-soundbar/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-lg-soundbar/releases/tag/v0.1.0
