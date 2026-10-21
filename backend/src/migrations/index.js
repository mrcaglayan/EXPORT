import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import foundation from './m001_foundation.js';
import identity from './m002_auth_roles_scopes.js';
import accounting from './m003_accounting_foundation.js';

import products from './m004_product_foundation.js';

import classification from './m005_product_classification.js';

// Freeze applied migration sources. Add a new registered file for later changes.
export default [foundation, identity, accounting, products, classification].map(migration => ({
  ...migration,
  checksum: createHash('sha256')
    .update(readFileSync(new URL(`./${migration.key}.js`, import.meta.url))).digest('hex'),
}));
