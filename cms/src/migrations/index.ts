import * as migration_20261114_005940_initial_payload_v2 from './20261114_005940_initial_payload_v2';

export const migrations = [
  {
    up: migration_20261114_005940_initial_payload_v2.up,
    down: migration_20261114_005940_initial_payload_v2.down,
    name: '20261114_005940_initial_payload_v2'
  },
];
