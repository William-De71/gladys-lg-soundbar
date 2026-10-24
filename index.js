// -----------------------------------------------------------------------------
// Entry point of the LG Soundbar external integration.
//
// The LG Wi-Fi soundbars (the ones the LG Sound Bar / Wi-Fi Speaker app
// controls), on the local network, over their "temescal" protocol (TCP port
// 9741, AES-encrypted JSON):
//   - devices: one per soundbar, with power, volume, mute, input, sound mode,
//     night mode, speaker levels and what is streaming, offered on the
//     Discovery screen (src/devices.js);
//   - scene triggers: input or sound mode changed with the remote, new track,
//     soundbar unreachable / back;
//   - scene actions: apply a sound preset, change the volume by steps;
//   - dashboard widget: what the soundbar does, and a small remote.
//
// This file only wires the SDK client: the handlers are in src/app.js,
// registered before connect() (the SDK requires it).
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = createApp(gladys, { logger });

gladys.handleShutdown(() => app.stop());

logger.info(`Starting the LG Soundbar integration ${version}...`);
try {
  await gladys.connect();
  await app.start();
} catch (error) {
  logger.error('LG Soundbar: startup failed', error);
  process.exit(1);
}
