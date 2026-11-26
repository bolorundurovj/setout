export const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  archive: 'Archived',
  restore: 'Restored',
  delete: 'Deleted',
  import: 'Imported',
};

export const FIELD_LABELS: Record<string, string> = {
  address: 'Address',
  agreed_amount: 'Agreed Amount',
  agreement_id: 'Agreement',
  amount: 'Amount',
  archived_at: 'Archived',
  boundary: 'Boundary',
  budget_item_count: 'Budget Items',
  budgeted_amount: 'Budgeted',
  byte_size: 'File Size',
  category_count: 'Categories',
  category_id: 'Category',
  checksum: 'Checksum',
  city: 'Town or City',
  code: 'Cost Code',
  contact_name: 'Contact',
  content_type: 'File Type',
  cost_type: 'Cost Type',
  country_id: 'Country',
  currency_id: 'Currency',
  delivery_id: 'Delivery',
  description: 'Description',
  email: 'Email',
  expected: 'Expected',
  expense_count: 'Expenses',
  expense_id: 'Expense',
  filename: 'File Name',
  geocoded_address: 'Map Address',
  given_on: 'Given On',
  id: 'ID',
  item_id: 'Item',
  kind: 'Kind',
  land_id: 'Land Record',
  latitude: 'Latitude',
  longitude: 'Longitude',
  name: 'Name',
  notes: 'Notes',
  paid_by_id: 'Paid By',
  parent_id: 'Parent Category',
  person_count: 'People',
  person_id: 'Person',
  phone: 'Phone',
  project_id: 'Project',
  purchased_on: 'Purchase Date',
  quantity: 'Quantity',
  received_at: 'Received',
  role: 'Role',
  size_unit: 'Area Unit',
  size_value: 'Stated Area',
  sort_order: 'Order',
  spent_on: 'Date',
  state: 'State',
  status: 'Status',
  storage_key: 'Stored File',
  trade: 'Trade',
  unit: 'Unit',
  unit_rate: 'Unit Rate',
  valued_on: 'Valued On',
  vendor_count: 'Vendors',
  vendor_id: 'Vendor',
};

export const MONEY_FIELDS = new Set(['agreed_amount', 'amount', 'budgeted_amount', 'unit_rate']);

export const ENTITY_NOUNS: Record<string, string> = {
  budget_item: 'Budget item',
  land: 'Land record',
  land_document: 'Document',
  land_valuation: 'Valuation',
};

export function fieldLabel(name: string): string {
  if (FIELD_LABELS[name]) {
    return FIELD_LABELS[name];
  }
  const words = name.replace(/_id$/, '').split('_');
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function entityNoun(entity: string): string {
  if (ENTITY_NOUNS[entity]) {
    return ENTITY_NOUNS[entity];
  }
  const words = entity.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
