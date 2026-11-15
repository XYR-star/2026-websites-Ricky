import * as migration_20261114_005940_initial_payload_v2 from './20261114_005940_initial_payload_v2';
import * as migration_20261114_143626_publication_content_verification from './20261114_143626_publication_content_verification';

export const migrations = [
  {
    up: migration_20261114_005940_initial_payload_v2.up,
    down: migration_20261114_005940_initial_payload_v2.down,
    name: '20261114_005940_initial_payload_v2',
  },
  {
    up: migration_20261114_143626_publication_content_verification.up,
    down: migration_20261114_143626_publication_content_verification.down,
    name: '20261114_143626_publication_content_verification'
  },
];
