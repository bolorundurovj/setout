import { FIELD_LABELS, fieldLabel } from './labels';

// Every column the API change log records, from the tracked models.
const LOGGED_FIELDS = [
  'address',
  'agreed_amount',
  'agreement_id',
  'amount',
  'archived_at',
  'boundary',
  'budgeted_amount',
  'byte_size',
  'category_id',
  'checksum',
  'city',
  'code',
  'contact_name',
  'content_type',
  'cost_type',
  'country_id',
  'currency_id',
  'delivery_id',
  'description',
  'email',
  'expected',
  'expense_id',
  'filename',
  'geocoded_address',
  'given_on',
  'id',
  'item_id',
  'kind',
  'land_id',
  'latitude',
  'longitude',
  'name',
  'notes',
  'paid_by_id',
  'parent_id',
  'person_id',
  'phone',
  'project_id',
  'purchased_on',
  'quantity',
  'received_at',
  'role',
  'size_unit',
  'size_value',
  'sort_order',
  'spent_on',
  'state',
  'status',
  'storage_key',
  'trade',
  'unit',
  'unit_rate',
  'valued_on',
  'vendor_id',
];

describe('change labels', () => {
  it('labels every logged field', () => {
    expect(LOGGED_FIELDS.filter((name) => !FIELD_LABELS[name])).toEqual([]);
  });

  it('uses the form wording for land fields', () => {
    expect(fieldLabel('geocoded_address')).toBe('Map Address');
    expect(fieldLabel('size_value')).toBe('Stated Area');
  });
});
