// PR-04A. New tables/guards only; applied m001–m014 stay frozen.
const scope='tenant_id CHAR(36) NOT NULL, legal_entity_id CHAR(36) NOT NULL';
const fk=(c,t,r='id')=>`FOREIGN KEY (tenant_id, legal_entity_id, ${c}) REFERENCES ${t}(tenant_id, legal_entity_id, ${r})`;
const user=c=>`FOREIGN KEY (tenant_id,${c}) REFERENCES users(tenant_id,id)`;
const own=a=>`${a}.tenant_id=NEW.tenant_id AND ${a}.legal_entity_id=NEW.legal_entity_id`;
const fail=s=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${s}';`;
const same=fields=>fields.split(',').map(f=>`(NEW.${f}<=>OLD.${f})`).join(' AND ');
const lock=`DECLARE entityLock CHAR(36); SELECT id INTO entityLock FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND active=1 FOR UPDATE; IF entityLock IS NULL THEN ${fail('Active export entity required')} END IF;`;
export const tables=[
 ['export_packing_lists',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 document_date DATE NOT NULL, source_kind ENUM('MANUAL','CSV') NOT NULL, file_name VARCHAR(160) NOT NULL,
 source_content MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, line_count INT UNSIGNED NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','STAGED','REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'ASSEMBLING', revision INT UNSIGNED NOT NULL DEFAULT 0,
 imported_by CHAR(36) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 submitted_by CHAR(36) NULL, submitted_at TIMESTAMP NULL, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL, review_context JSON NULL,
 cancelled_by CHAR(36) NULL, cancelled_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY packing_scope (tenant_id,legal_entity_id,id), UNIQUE KEY packing_reference (tenant_id,legal_entity_id,reference), KEY packing_status (tenant_id,legal_entity_id,status,imported_at,id),
 CONSTRAINT packing_line_count CHECK (line_count>0), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id), ${user('imported_by')},${user('submitted_by')},${user('reviewed_by')},${user('cancelled_by')}`],
 ['export_packing_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, packing_list_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
 line_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, item_code VARCHAR(120) NOT NULL, description VARCHAR(1000) NOT NULL,
 quantity DECIMAL(20,6) NOT NULL, unit_code VARCHAR(16) NOT NULL, package_reference VARCHAR(120) NOT NULL, package_count INT UNSIGNED NULL,
 net_weight_kg DECIMAL(20,6) NULL, gross_weight_kg DECIMAL(20,6) NULL, source JSON NOT NULL,
 UNIQUE KEY packing_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY packing_line_number (tenant_id,legal_entity_id,packing_list_id,line_number), UNIQUE KEY packing_line_key (tenant_id,legal_entity_id,packing_list_id,line_key),
 CONSTRAINT packing_amount CHECK (quantity>0 AND (package_count IS NULL OR package_count>0) AND (net_weight_kg IS NULL OR net_weight_kg>=0) AND (gross_weight_kg IS NULL OR gross_weight_kg>=0) AND (net_weight_kg IS NULL OR gross_weight_kg IS NULL OR net_weight_kg<=gross_weight_kg)), ${fk('packing_list_id','export_packing_lists')}`],
 ['export_packing_plans',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, packing_list_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL,
 customer_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL, destination_pool_id CHAR(36) NOT NULL, planned_date DATE NOT NULL,
 reason VARCHAR(255) NOT NULL, created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_plan_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_plan_revision (tenant_id,legal_entity_id,packing_list_id,revision),
 ${fk('packing_list_id','export_packing_lists')},${fk('customer_id','trading_partners')},${fk('warehouse_id','warehouses')},${fk('destination_pool_id','inventory_pools')},${user('created_by')}`],
 ['export_packing_mappings',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, plan_id CHAR(36) NOT NULL, packing_line_id CHAR(36) NOT NULL,
 sku_id CHAR(36) NULL, unit_id CHAR(36) NULL, unit_confirmed BOOLEAN NOT NULL DEFAULT 0, basis ENUM('MANUAL','EXACT_CODE') NOT NULL,
 UNIQUE KEY export_mapping_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_mapping_line (tenant_id,legal_entity_id,plan_id,packing_line_id),
 CONSTRAINT export_mapping_unit CHECK ((sku_id IS NULL AND unit_id IS NULL) OR (sku_id IS NOT NULL AND unit_id IS NOT NULL)),
 ${fk('plan_id','export_packing_plans')},${fk('packing_line_id','export_packing_lines')},${fk('sku_id','product_skus')},${fk('unit_id','unit_of_measure')}`],
 ['export_packing_decisions',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, packing_list_id CHAR(36) NOT NULL, revision INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
 action ENUM('SUBMIT','APPROVE','REJECT','REOPEN','CANCEL','RENEW') NOT NULL, reason VARCHAR(255) NOT NULL, context JSON NOT NULL,
 actor_id CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY export_decision_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_decision_sequence (tenant_id,legal_entity_id,packing_list_id,sequence_number),
 ${fk('packing_list_id','export_packing_lists')},${user('actor_id')}`],
 ['export_card_sequences',`${scope}, sequence_year INT UNSIGNED NOT NULL, last_number INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant_id,legal_entity_id,sequence_year), CONSTRAINT export_sequence_year CHECK (sequence_year BETWEEN 1000 AND 9999), FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES legal_entities(tenant_id,id)`],
 ['export_cards',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, packing_list_id CHAR(36) NOT NULL, active_packing_list_id CHAR(36) NULL, plan_id CHAR(36) NOT NULL,
 code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, sequence_year INT UNSIGNED NOT NULL, sequence_number INT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL, status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE', created_by CHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_card_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_card_code (tenant_id,legal_entity_id,code), UNIQUE KEY export_card_number (tenant_id,legal_entity_id,sequence_year,sequence_number),
 UNIQUE KEY export_card_plan (tenant_id,legal_entity_id,plan_id), UNIQUE KEY export_card_active (tenant_id,legal_entity_id,active_packing_list_id),
 CONSTRAINT export_card_active_source CHECK ((status='ACTIVE' AND active_packing_list_id IS NOT NULL AND active_packing_list_id=packing_list_id) OR (status='CANCELLED' AND active_packing_list_id IS NULL)),
 ${fk('packing_list_id','export_packing_lists')},${fk('active_packing_list_id','export_packing_lists')},${fk('plan_id','export_packing_plans')},${user('created_by')}`],
 ['export_shipments',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, card_id CHAR(36) NOT NULL, reference VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reservation_date DATE NOT NULL, expected_dispatch_date DATE NOT NULL, plan JSON NOT NULL, context_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 reason VARCHAR(255) NOT NULL, evidence VARCHAR(255) NOT NULL,
 status ENUM('ASSEMBLING','REQUESTED','APPROVED','RESERVING','RESERVED','DISPATCHING','DISPATCHED','CANCELLING','CANCELLED','REJECTED') NOT NULL DEFAULT 'ASSEMBLING',
 requested_by CHAR(36) NOT NULL, requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by CHAR(36) NULL, reviewed_at TIMESTAMP NULL, review_reason VARCHAR(255) NULL,
 reservation_id CHAR(36) NULL, issue_id CHAR(36) NULL, dispatch_context JSON NULL, dispatched_by CHAR(36) NULL, dispatched_at TIMESTAMP NULL, cancel_reason VARCHAR(255) NULL,
 UNIQUE KEY export_shipment_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_shipment_reference (tenant_id,legal_entity_id,reference),
 UNIQUE KEY export_shipment_reservation (tenant_id,legal_entity_id,reservation_id), UNIQUE KEY export_shipment_issue (tenant_id,legal_entity_id,issue_id), KEY export_shipment_card (tenant_id,legal_entity_id,card_id,status,requested_at,id),
 CONSTRAINT export_shipment_dates CHECK (expected_dispatch_date>=reservation_date),
 ${fk('card_id','export_cards')},${fk('reservation_id','inventory_reservations')},${fk('issue_id','inventory_issues')},${user('requested_by')},${user('reviewed_by')},${user('dispatched_by')}`],
 ['export_shipment_lines',`id CHAR(36) NOT NULL PRIMARY KEY, ${scope}, shipment_id CHAR(36) NOT NULL, packing_line_id CHAR(36) NOT NULL,
 line_number INT UNSIGNED NOT NULL, sku_id CHAR(36) NOT NULL, quantity DECIMAL(20,6) NOT NULL, reservation_line_id CHAR(36) NULL,
 UNIQUE KEY export_shipment_line_scope (tenant_id,legal_entity_id,id), UNIQUE KEY export_shipment_line_number (tenant_id,legal_entity_id,shipment_id,line_number), UNIQUE KEY export_shipment_line_source (tenant_id,legal_entity_id,shipment_id,packing_line_id),
 UNIQUE KEY export_shipment_stock_line (tenant_id,legal_entity_id,reservation_line_id), CONSTRAINT export_shipment_quantity CHECK (quantity>0),
 ${fk('shipment_id','export_shipments')},${fk('packing_line_id','export_packing_lines')},${fk('sku_id','product_skus')},${fk('reservation_line_id','inventory_reservation_lines')}`],
];
const immutable=table=>['UPDATE','DELETE'].map(e=>[`${table}_no_${e.toLowerCase()}`,e,table,`BEGIN ${fail('Export source and revision history is immutable')} END`]);
export const triggers=[
 ['export_packing_insert','INSERT','export_packing_lists',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.revision<>0 THEN ${fail('Packing list must assemble original source first')} END IF; END`],
 ['export_packing_update','UPDATE','export_packing_lists',`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,reference,document_date,source_kind,file_name,source_content,source_hash,payload_hash,line_count,evidence,imported_by,imported_at')}) THEN ${fail('Packing source is immutable')} END IF;
 IF OLD.status='ASSEMBLING' AND NEW.status='STAGED' THEN
  IF NEW.revision<>0 OR NEW.line_count<>(SELECT COUNT(*) FROM export_packing_lines WHERE packing_list_id=NEW.id) THEN ${fail('Complete packing source required')} END IF;
 ELSEIF OLD.status='STAGED' AND NEW.status='STAGED' THEN
  IF NEW.revision<>OLD.revision+1 OR NOT EXISTS (SELECT 1 FROM export_packing_plans WHERE packing_list_id=NEW.id AND revision=NEW.revision) THEN ${fail('Next packing mapping revision required')} END IF;
 ELSE
  IF NEW.revision<>OLD.revision OR NOT ((OLD.status='STAGED' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status IN ('REQUESTED','APPROVED','REJECTED') AND NEW.status='STAGED') OR (OLD.status IN ('STAGED','REQUESTED','APPROVED') AND NEW.status='CANCELLED') OR (OLD.status='APPROVED' AND NEW.status='APPROVED')) THEN ${fail('Invalid packing workflow transition')} END IF;
  IF NEW.status IN ('STAGED','CANCELLED') AND EXISTS (SELECT 1 FROM export_cards WHERE active_packing_list_id=NEW.id) THEN ${fail('Cancel dependent export card first')} END IF;
  IF NEW.status='REQUESTED' AND (NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL OR NEW.review_context IS NULL) THEN ${fail('Packing submission context required')} END IF;
  IF NEW.status IN ('APPROVED','REJECTED') THEN
   IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 OR NEW.reviewed_by=NEW.imported_by OR NEW.reviewed_by=NEW.submitted_by OR EXISTS (SELECT 1 FROM export_packing_plans p WHERE p.packing_list_id=NEW.id AND p.revision=NEW.revision AND p.created_by=NEW.reviewed_by) THEN ${fail('Independent packing reviewer required')} END IF;
  END IF;
  IF NEW.status='CANCELLED' AND (NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0) THEN ${fail('Packing cancellation evidence required')} END IF;
 END IF; END`],
 ['export_packing_line_insert','INSERT','export_packing_lines',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE ${own('p')} AND p.id=NEW.packing_list_id AND p.status='ASSEMBLING') THEN ${fail('Packing lines require assembling source')} END IF; END`],
 ['export_plan_insert','INSERT','export_packing_plans',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE ${own('p')} AND p.id=NEW.packing_list_id AND p.status='STAGED' AND p.revision+1=NEW.revision) THEN ${fail('Only next staged mapping plan allowed')} END IF; END`],
 ['export_mapping_insert','INSERT','export_packing_mappings',`BEGIN ${lock} IF NOT EXISTS (SELECT 1 FROM export_packing_plans p JOIN export_packing_lists h ON h.id=p.packing_list_id JOIN export_packing_lines l ON l.packing_list_id=h.id WHERE ${own('p')} AND p.id=NEW.plan_id AND l.id=NEW.packing_line_id AND h.status='STAGED' AND h.revision+1=p.revision) THEN ${fail('Mapping must belong to next packing source plan')} END IF; IF NEW.sku_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_skus s WHERE ${own('s')} AND s.id=NEW.sku_id AND s.base_unit_id=NEW.unit_id) THEN ${fail('Mapped SKU base unit must be retained')} END IF; END`],
 ['export_decision_insert','INSERT','export_packing_decisions',`BEGIN ${lock} IF CHAR_LENGTH(TRIM(NEW.reason))=0 OR NOT EXISTS (SELECT 1 FROM export_packing_lists p WHERE ${own('p')} AND p.id=NEW.packing_list_id AND p.revision=NEW.revision AND ((NEW.action='SUBMIT' AND p.status='STAGED') OR (NEW.action IN ('APPROVE','REJECT') AND p.status='REQUESTED') OR (NEW.action='REOPEN' AND p.status IN ('REQUESTED','APPROVED','REJECTED')) OR (NEW.action='CANCEL' AND p.status IN ('STAGED','REQUESTED','APPROVED')) OR (NEW.action='RENEW' AND p.status='APPROVED'))) THEN ${fail('Export decision must match current source workflow')} END IF; END`],
 ['export_sequence_insert','INSERT','export_card_sequences',`BEGIN ${lock} IF NEW.last_number<>0 THEN ${fail('Export sequence starts empty')} END IF; END`],
 ['export_sequence_update','UPDATE','export_card_sequences',`BEGIN ${lock} IF NOT (${same('tenant_id,legal_entity_id,sequence_year')}) OR NEW.last_number<>OLD.last_number+1 THEN ${fail('Export numbers increase once and are never reused')} END IF; END`],
 ['export_card_insert','INSERT','export_cards',`BEGIN ${lock} IF NEW.status<>'ACTIVE' OR NOT EXISTS (SELECT 1 FROM export_packing_plans p JOIN export_packing_lists h ON h.id=p.packing_list_id JOIN export_card_sequences q ON q.tenant_id=p.tenant_id AND q.legal_entity_id=p.legal_entity_id WHERE ${own('p')} AND p.id=NEW.plan_id AND p.packing_list_id=NEW.packing_list_id AND h.status='REQUESTED' AND h.revision=p.revision AND q.sequence_year=NEW.sequence_year AND q.last_number=NEW.sequence_number AND NEW.sequence_year=YEAR(h.document_date) AND NEW.created_by<>h.imported_by AND NEW.created_by<>h.submitted_by AND NEW.created_by<>p.created_by) THEN ${fail('Export card requires independently approved current source and sequence')} END IF; END`],
 ['export_card_update','UPDATE','export_cards',`BEGIN ${lock} IF NOT (${same('id,tenant_id,legal_entity_id,packing_list_id,plan_id,code,sequence_year,sequence_number,snapshot,created_by,created_at')}) OR OLD.status<>'ACTIVE' OR NEW.status<>'CANCELLED' OR NEW.active_packing_list_id IS NOT NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR EXISTS (SELECT 1 FROM export_shipments s WHERE s.card_id=NEW.id AND s.status NOT IN ('CANCELLED','REJECTED')) THEN ${fail('Cancel unshipped dependencies before voiding immutable export card')} END IF; END`],
 ['export_shipment_insert','INSERT','export_shipments',`BEGIN ${lock} IF NEW.status<>'ASSEMBLING' OR NEW.reservation_id IS NOT NULL OR NEW.issue_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_cards c JOIN export_packing_lists p ON p.id=c.packing_list_id WHERE ${own('c')} AND c.id=NEW.card_id AND c.status='ACTIVE' AND p.status='APPROVED') THEN ${fail('Shipment requires approved active export card')} END IF; END`],
 ['export_shipment_update','UPDATE','export_shipments',`BEGIN ${lock}
 IF NOT (${same('id,tenant_id,legal_entity_id,card_id,reference,reservation_date,expected_dispatch_date,plan,context_hash,reason,evidence,requested_by,requested_at')}) THEN ${fail('Shipment plan is immutable')} END IF;
 IF NOT ((OLD.status='ASSEMBLING' AND NEW.status='REQUESTED') OR (OLD.status='REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLING')) OR (OLD.status='APPROVED' AND NEW.status IN ('RESERVING','CANCELLING')) OR (OLD.status='RESERVING' AND NEW.status IN ('RESERVING','RESERVED')) OR (OLD.status='RESERVED' AND NEW.status IN ('DISPATCHING','CANCELLING')) OR (OLD.status='DISPATCHING' AND NEW.status='DISPATCHED') OR (OLD.status='CANCELLING' AND NEW.status='CANCELLED')) THEN ${fail('Invalid export shipment transition')} END IF;
 IF NEW.status IN ('APPROVED','REJECTED') THEN
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.requested_by OR NEW.reviewed_at IS NULL OR CHAR_LENGTH(TRIM(COALESCE(NEW.review_reason,'')))=0 THEN ${fail('Independent shipment review required')} END IF;
 ELSEIF NOT (${same('reviewed_by,reviewed_at,review_reason')}) THEN ${fail('Shipment review is immutable')} END IF;
 IF NEW.status='REQUESTED' THEN
  IF NOT EXISTS (SELECT 1 FROM export_shipment_lines WHERE shipment_id=NEW.id) OR EXISTS (SELECT 1 FROM export_shipment_lines x JOIN export_packing_lines l ON l.id=x.packing_line_id WHERE x.shipment_id=NEW.id AND l.quantity<(SELECT SUM(t.quantity) FROM export_shipment_lines t JOIN export_shipments s ON s.id=t.shipment_id WHERE s.card_id=NEW.card_id AND t.packing_line_id=x.packing_line_id AND s.status NOT IN ('CANCELLED','REJECTED'))) THEN ${fail('Shipments exceed uncommitted packing quantities')} END IF;
 END IF;
 IF NEW.status NOT IN ('RESERVING','RESERVED') AND NOT (${same('reservation_id')}) THEN ${fail('Reservation lineage is immutable')} END IF;
 IF NEW.status='RESERVED' AND (NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE ${own('r')} AND r.id=NEW.reservation_id AND r.status='ACTIVE') OR EXISTS (SELECT 1 FROM export_shipment_lines l WHERE l.shipment_id=NEW.id AND l.reservation_line_id IS NULL)) THEN ${fail('Complete reserved source lines required')} END IF;
 IF NEW.status<>'DISPATCHED' AND NOT (${same('issue_id,dispatch_context,dispatched_by,dispatched_at')}) THEN ${fail('Dispatch lineage is immutable')} END IF;
 IF NEW.status='DISPATCHED' AND (NEW.dispatched_by IS NULL OR NEW.dispatched_at IS NULL OR NEW.dispatch_context IS NULL OR NOT EXISTS (SELECT 1 FROM inventory_issues i WHERE ${own('i')} AND i.id=NEW.issue_id AND i.reservation_id=NEW.reservation_id AND i.status='POSTED')) THEN ${fail('Posted reserved dispatch required')} END IF;
 IF NEW.status='CANCELLED' AND (CHAR_LENGTH(TRIM(COALESCE(NEW.cancel_reason,'')))=0 OR NEW.reservation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_reservations r WHERE ${own('r')} AND r.id=NEW.reservation_id AND r.status='CANCELLED')) THEN ${fail('Release reserved stock before shipment cancellation')} END IF;
 END`],
 ['export_shipment_line_insert','INSERT','export_shipment_lines',`BEGIN ${lock} IF NEW.reservation_line_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM export_shipments s JOIN export_cards c ON c.id=s.card_id JOIN export_packing_lines l ON l.packing_list_id=c.packing_list_id JOIN export_packing_mappings m ON m.plan_id=c.plan_id AND m.packing_line_id=l.id WHERE ${own('s')} AND s.id=NEW.shipment_id AND s.status='ASSEMBLING' AND l.id=NEW.packing_line_id AND m.sku_id=NEW.sku_id AND NEW.quantity<=l.quantity) THEN ${fail('Shipment source must match approved packing map')} END IF; END`],
 ['export_shipment_line_update','UPDATE','export_shipment_lines',`BEGIN ${lock} IF NOT (${same('id,tenant_id,legal_entity_id,shipment_id,packing_line_id,line_number,sku_id,quantity')}) OR OLD.reservation_line_id IS NOT NULL OR NEW.reservation_line_id IS NULL OR NOT EXISTS (SELECT 1 FROM export_shipments s JOIN inventory_reservation_lines r ON r.reservation_id=s.reservation_id WHERE ${own('s')} AND s.id=NEW.shipment_id AND s.status='RESERVING' AND r.id=NEW.reservation_line_id AND r.sku_id=NEW.sku_id AND r.quantity=NEW.quantity) THEN ${fail('Only exact shipment reservation lineage may be assigned')} END IF; END`],
 ['export_stock_reservation_guard','INSERT','inventory_reservations',`BEGIN IF LEFT(NEW.reference,4)='XPR-' AND NOT EXISTS (SELECT 1 FROM export_shipments s WHERE ${own('s')} AND CONCAT('XPR-',s.id)=NEW.reference AND s.status='RESERVING') THEN ${fail('Reserved export source requires approved shipment allocation')} END IF; END`],
 ['export_stock_release_guard','INSERT','inventory_reservation_releases',`BEGIN IF EXISTS (SELECT 1 FROM export_shipments s WHERE ${own('s')} AND s.reservation_id=NEW.reservation_id AND s.status<>'CANCELLING') THEN ${fail('Cancel linked export shipment to release its reservation')} END IF; END`],
 ['export_stock_issue_guard','INSERT','inventory_issues',`BEGIN IF EXISTS (SELECT 1 FROM export_shipments s WHERE ${own('s')} AND s.reservation_id=NEW.reservation_id AND s.status<>'DISPATCHING') OR LEFT(NEW.reference,4)='XPI-' AND NOT EXISTS (SELECT 1 FROM export_shipments s WHERE ${own('s')} AND s.reservation_id=NEW.reservation_id AND s.status='DISPATCHING' AND CONCAT('XPI-',s.id)=NEW.reference) THEN ${fail('Dispatch linked export shipment through export workflow')} END IF; END`],
 ['export_stock_reversal_guard','INSERT','inventory_corrections',`BEGIN IF NEW.kind='REVERSAL' AND EXISTS (SELECT 1 FROM inventory_events e JOIN export_shipments s ON s.issue_id=e.issue_id WHERE ${own('e')} AND e.id=NEW.original_event_id) THEN ${fail('Export shipment requires coordinated source reversal')} END IF; END`],
 ['export_sku_unit_guard','UPDATE','product_skus',`BEGIN IF NEW.base_unit_id<>OLD.base_unit_id AND EXISTS (SELECT 1 FROM export_packing_mappings m JOIN export_packing_plans p ON p.id=m.plan_id JOIN export_packing_lists h ON h.id=p.packing_list_id WHERE m.sku_id=OLD.id AND h.revision=p.revision AND h.status IN ('REQUESTED','APPROVED')) THEN ${fail('Reviewed export source retains SKU base unit')} END IF; END`],
 ...['export_packing_lines','export_packing_plans','export_packing_mappings','export_packing_decisions'].flatMap(immutable),
 ...['export_packing_lists','export_card_sequences','export_cards','export_shipments','export_shipment_lines'].map(t=>[`${t}_no_delete`,'DELETE',t,`BEGIN ${fail('Retain export operations and numbering history')} END`]),
];
const permissions=[['exports.intake','Stage original packing lists'],['exports.map','Map packing sources and submit export review'],['exports.review','Independently approve and renew export cards'],['exports.shipment.request','Request and cancel export shipments'],['exports.shipment.review','Independently review export shipments'],['exports.shipment.allocate','Reserve approved export shipment source stock'],['exports.shipment.dispatch','Dispatch reserved export shipments'],['exports.audit.read','Read scoped export audit evidence']];
const normalize=s=>s.replace(/\s+/g,' ').trim();
export default {key:'m015_export_operations',description:'Immutable packing intake, reviewed numbered export cards and partial shipments linked atomically to country/FIFO stock sources.',
 async up(c){for(const [n,d]of tables)await c.query(`CREATE TABLE IF NOT EXISTS ${n} (${d}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
 for(const [n,e,t,b]of triggers){const [[old]]=await c.execute('SELECT ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[n]);if(old){if(normalize(old.body)!==normalize(b))throw Error('Unexpected export trigger: '+n);continue;}await c.query(`CREATE TRIGGER ${n} BEFORE ${e} ON ${t} FOR EACH ROW ${b}`);}
 for(const [code,description]of permissions){await c.execute('INSERT INTO permissions (code,description) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code',[code,description]);await c.execute("INSERT INTO role_permissions (tenant_id,role_id,permission_code) SELECT tenant_id,id,? FROM roles WHERE code='ADMIN' ON DUPLICATE KEY UPDATE permission_code=permission_code",[code]);}
 },verify};

async function verify(connection) {
  for (const [name, definition] of tables) {
    const [columns] = await connection.query(`SHOW FULL COLUMNS FROM ${name}`);
    const expected = [...definition.matchAll(/(?:^|,)\s*(\w+)\s+(CHAR\(\d+\)|VARCHAR\(\d+\)|ENUM\([^)]*\)|DECIMAL\(\d+,\d+\)|BOOLEAN|INT UNSIGNED|TIMESTAMP|DATETIME|DATE|JSON|MEDIUMTEXT)\s+([^,\n]*)/g)]
      .map(([, field, type, options]) => ({
        name: field, type: type === 'BOOLEAN' ? 'tinyint(1)' : type.toLowerCase(),
        nullable: options.includes('NOT NULL') ? 'NO' : 'YES',
        default: options.includes('DEFAULT TRUE') ? '1' : options.includes('DEFAULT 0') ? '0'
          : options.includes('DEFAULT CURRENT_TIMESTAMP') ? 'CURRENT_TIMESTAMP' : options.match(/DEFAULT '([^']+)'/)?.[1] ?? null,
        collation: /CHAR|TEXT/.test(type) ? options.includes('ascii_bin') ? 'ascii_bin' : options.includes('utf8mb4_bin') ? 'utf8mb4_bin' : 'utf8mb4_0900_ai_ci'
          : type.startsWith('ENUM') ? 'utf8mb4_0900_ai_ci' : null,
      }));
    const actual = columns.map(c => ({ name: c.Field, type: c.Type.toLowerCase(), nullable: c.Null, default: c.Default, collation: c.Collation }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Export operations columns differ: ${name}`);
    const [[table]] = await connection.execute(`SELECT ENGINE AS engine, TABLE_COLLATION AS collation
      FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [name]);
    if (table?.engine !== 'InnoDB' || table?.collation !== 'utf8mb4_0900_ai_ci') throw new Error(`Export operations table differs: ${name}`);
    const [keys] = await connection.execute(`SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [name]);
    const expectedKeys = [...definition.matchAll(/FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)/g)]
      .flatMap(([, cols, target, refs]) => cols.split(',').map((col, i) => `${col.trim()}:${target}:${refs.split(',')[i].trim()}`)).sort();
    if (JSON.stringify(keys.map(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}:${k.REFERENCED_COLUMN_NAME}`).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Export operations foreign keys differ: ${name}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${name}`);
    const expectedIndexes = [];
    if (/id CHAR\(36\) NOT NULL PRIMARY KEY/.test(definition)) expectedIndexes.push('PRIMARY:0:1:id');
    const primary = definition.match(/PRIMARY KEY \(([^)]+)\)/);
    primary?.[1].split(',').forEach((col, i) => expectedIndexes.push(`PRIMARY:0:${i + 1}:${col.trim()}`));
    for (const [, unique, key, cols] of definition.matchAll(/(UNIQUE )?KEY (\w+) \(([^)]+)\)/g)) {
      cols.split(',').forEach((col, i) => expectedIndexes.push(`${key}:${unique ? 0 : 1}:${i + 1}:${col.trim()}`));
    }
    const actualIndexes = indexes.map(i => `${i.Key_name}:${i.Non_unique}:${i.Seq_in_index}:${i.Column_name}`);
    if (!expectedIndexes.every(i => actualIndexes.includes(i))) throw new Error(`Export operations indexes differ: ${name}`);
    const [checks] = await connection.execute(`SELECT CONSTRAINT_NAME FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK' AND enforced = 'YES'`, [name]);
    for (const [, constraint] of definition.matchAll(/CONSTRAINT (\w+) CHECK/g)) {
      if (!checks.some(c => c.CONSTRAINT_NAME === constraint)) throw new Error(`Export operations check missing: ${constraint}`);
    }
  }
  for (const [name,event,table,body] of triggers) {
    const [[actual]] = await connection.execute('SELECT ACTION_TIMING AS timing,EVENT_MANIPULATION AS event,EVENT_OBJECT_TABLE AS target,ACTION_STATEMENT AS body FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?',[name]);
    if (!actual || actual.timing!=='BEFORE' || actual.event!==event || actual.target!==table || normalize(actual.body)!==normalize(body)) throw new Error('Export operations trigger differs: '+name);
  }
  const [rows] = await connection.query('SELECT code FROM permissions');
  if (!permissions.every(([code]) => rows.some(r => r.code === code))) throw new Error('Missing export permissions');
}
