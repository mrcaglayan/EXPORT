import vatClaims from './m020_vat_claim_packages.js';
import vatRefunds from './m019_vat_refund_reconciliation.js';
import vatCosts from './m018_vat_cost_allocation.js';
import vatSources from './m017_vat_source_attribution.js';
import exportCompliance from './m016_export_documents_customs.js';
import exports from './m015_export_operations.js';
import purchaseReceipts from './m014_purchase_receipts.js';
import invoiceStaging from './m013_purchase_invoice_staging.js';
import purchasing from './m012_purchasing_foundation.js';
import m011 from './m011_inventory_corrections.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import foundation from './m001_foundation.js';
import identity from './m002_auth_roles_scopes.js';
import accounting from './m003_accounting_foundation.js';

import products from './m004_product_foundation.js';

import classification from './m005_product_classification.js';
import inventory from './m006_inventory_foundation.js';
import receipts from './m007_inventory_receipts.js';
import reallocations from './m008_inventory_reallocations.js';
import reservations from './m009_inventory_reservations_issues.js';
import periodClose from './m010_inventory_period_close.js';

// Freeze applied migration sources. Add a new registered file for later changes.
export default [foundation, identity, accounting, products, classification, inventory, receipts, reallocations, reservations, periodClose, m011, purchasing, invoiceStaging, purchaseReceipts, exports, exportCompliance, vatSources, vatCosts, vatRefunds, vatClaims].map(migration => ({
  ...migration,
  checksum: createHash('sha256')
    .update(readFileSync(new URL(`./${migration.key}.js`, import.meta.url))).digest('hex'),
}));
