// The fake soundbar of the tests, on its own: `node scripts/fake-soundbar.mjs [port] [SP8YA|S90QY]`.
// Used by scripts/check-simulator.sh, and handy to try the integration without a soundbar.
import { createFakeSoundbar } from '../test/helpers/fake-soundbar.js';

const port = Number(process.argv[2] ?? 9741);
const profile = process.argv[3] ?? 'SP8YA';
const fake = createFakeSoundbar({ profile });
await fake.start(port);
console.log(`fake ${profile} soundbar listening on 127.0.0.1:${fake.port}`);
const stop = async () => {
  await fake.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
