from typing import Any

from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.models.expense import CostType
from setout.models.land_document import LandDocumentKind
from setout.models.land_valuation import LandValuationKind
from setout.models.project import ProjectStatus
from tortoise.fields.base import OnDelete
from tortoise import fields


class DescribeField(ops.AlterField):
    """An AlterField that changes only the field's description.

    SQLite stores no column comments, yet Tortoise rebuilds the table there, and
    dropping the old table cascades a delete to every row that references it.
    """

    async def database_forward(self, app_label: str, old_state: Any, new_state: Any, state_editor: Any = None) -> None:
        if state_editor is not None and state_editor.client.capabilities.dialect == "sqlite":
            return
        await super().database_forward(app_label, old_state, new_state, state_editor)

    async def database_backward(self, app_label: str, old_state: Any, new_state: Any, state_editor: Any = None) -> None:
        if state_editor is not None and state_editor.client.capabilities.dialect == "sqlite":
            return
        await super().database_backward(app_label, old_state, new_state, state_editor)


class Migration(migrations.Migration):
    dependencies = [('models', '0016_login_attempts')]

    initial = False

    operations = [
        ops.AlterModelOptions(
            name='Advance',
            options={'table': 'advance', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Money given to a person before they spend it.'},
        ),
        ops.RenameField(
            model_name='Advance',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        ops.AlterModelOptions(
            name='Agreement',
            options={'table': 'agreement', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A fixed price agreed with a vendor for work on one project.'},
        ),
        ops.RenameField(
            model_name='Agreement',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        ops.AlterModelOptions(
            name='Attachment',
            options={'table': 'attachment', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A file attached to an expense: an image or a PDF, such as a receipt.'},
        ),
        ops.RenameField(
            model_name='Attachment',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Attachment',
            name='checksum',
            field=fields.CharField(db_index=True, description='SHA-256 of the contents, also used as the stored filename', max_length=64),
        ),
        DescribeField(
            model_name='Attachment',
            name='filename',
            field=fields.CharField(description='The original filename', max_length=255),
        ),
        ops.RenameField(
            model_name='BudgetItem',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='BudgetItem',
            name='cost_type',
            field=fields.CharEnumField(null=True, description='Optional. Labour, material or fixed', enum_type=CostType, max_length=16),
        ),
        ops.RenameField(
            model_name='Category',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        ops.AlterModelOptions(
            name='Delivery',
            options={'table': 'delivery', 'app': 'models', 'pk_attr': 'id', 'table_description': 'An item that has been paid for and is outstanding until it is received.'},
        ),
        ops.RenameField(
            model_name='Delivery',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        ops.RenameField(
            model_name='Delivery',
            old_name='promised',
            new_name='expected',
        ),
        ops.RenameField(
            model_name='Expense',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Expense',
            name='agreement',
            field=fields.ForeignKeyField('models.Agreement', source_field='agreement_id', null=True, description='The agreement this expense is a payment against', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL),
        ),
        DescribeField(
            model_name='Expense',
            name='cost_type',
            field=fields.CharEnumField(null=True, description='Optional. Labour, material or fixed, for the cost type breakdown', enum_type=CostType, max_length=16),
        ),
        DescribeField(
            model_name='Expense',
            name='item',
            field=fields.ForeignKeyField('models.Item', source_field='item_id', null=True, description='The item bought. Price history is calculated from it', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL),
        ),
        DescribeField(
            model_name='Expense',
            name='paid_by',
            field=fields.ForeignKeyField('models.Person', source_field='paid_by_id', null=True, description='The person who paid. Null when you paid', db_constraint=True, to_field='id', related_name='expenses_paid', on_delete=OnDelete.SET_NULL),
        ),
        DescribeField(
            model_name='Expense',
            name='vendor',
            field=fields.ForeignKeyField('models.Vendor', source_field='vendor_id', null=True, description='The vendor paid', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL),
        ),
        ops.AlterModelOptions(
            name='Item',
            options={'table': 'item', 'app': 'models', 'pk_attr': 'id', 'table_description': 'An item bought more than once. Prices are calculated from its expenses.'},
        ),
        ops.RenameField(
            model_name='Item',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Item',
            name='unit',
            field=fields.CharField(null=True, description='The unit of the price, such as bag, each, truck or sheet', max_length=32),
        ),
        ops.AlterModelOptions(
            name='Land',
            options={'table': 'land', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A land record. Shared across every project built on it.'},
        ),
        ops.RenameField(
            model_name='Land',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Land',
            name='boundary',
            field=fields.TextField(null=True, description='GeoJSON Polygon of the boundary', unique=False),
        ),
        DescribeField(
            model_name='Land',
            name='geocoded_address',
            field=fields.TextField(null=True, description='The map address of the pin, from reverse geocoding', unique=False),
        ),
        DescribeField(
            model_name='Land',
            name='name',
            field=fields.CharField(description='Your name for the land record, such as Ikeja plot', max_length=255),
        ),
        ops.AlterModelOptions(
            name='LandDocument',
            options={'table': 'land_document', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A document for a land record, such as a title deed or a building permit.'},
        ),
        ops.RenameField(
            model_name='LandDocument',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='LandDocument',
            name='checksum',
            field=fields.CharField(db_index=True, description='SHA-256 of the contents, also used as the stored filename', max_length=64),
        ),
        DescribeField(
            model_name='LandDocument',
            name='filename',
            field=fields.CharField(description='The original filename', max_length=255),
        ),
        DescribeField(
            model_name='LandDocument',
            name='kind',
            field=fields.CharEnumField(default=LandDocumentKind.OTHER, description='The document type, used to list the documents a land record is missing', enum_type=LandDocumentKind, max_length=32),
        ),
        ops.RenameField(
            model_name='LandDocument',
            old_name='note',
            new_name='notes',
        ),
        DescribeField(
            model_name='LandDocument',
            name='notes',
            field=fields.CharField(null=True, description='Describes the document when the type is Other', max_length=255),
        ),
        ops.AlterModelOptions(
            name='LandValuation',
            options={'table': 'land_valuation', 'app': 'models', 'pk_attr': 'id', 'table_description': 'The value of a land record at a date. The purchase price is the first valuation.'},
        ),
        ops.RenameField(
            model_name='LandValuation',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='LandValuation',
            name='kind',
            field=fields.CharEnumField(default=LandValuationKind.VALUATION, description='Purchase price or current value', enum_type=LandValuationKind, max_length=16),
        ),
        ops.RenameField(
            model_name='LandValuation',
            old_name='note',
            new_name='notes',
        ),
        DescribeField(
            model_name='LandValuation',
            name='notes',
            field=fields.CharField(null=True, description='Who made the valuation, or why', max_length=255),
        ),
        ops.AlterModelOptions(
            name='Person',
            options={'table': 'person', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A person who pays for expenses on your behalf. Shared across every project.'},
        ),
        ops.RenameField(
            model_name='Person',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Person',
            name='role',
            field=fields.CharField(null=True, description='Their role, such as family, site supervisor or foreman', max_length=255),
        ),
        ops.RenameField(
            model_name='Project',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Project',
            name='status',
            field=fields.CharEnumField(default=ProjectStatus.ACTIVE, description='ACTIVE: active\nON_HOLD: on_hold\nCOMPLETED: completed\nCLOSED: closed', enum_type=ProjectStatus, max_length=16),
        ),
        ops.RunSQL(
            sql="UPDATE \"project\" SET \"status\" = 'closed' WHERE \"status\" = 'archived'",
            reverse_sql="UPDATE \"project\" SET \"status\" = 'archived' WHERE \"status\" = 'closed'",
        ),
        ops.AlterModelOptions(
            name='State',
            options={'table': 'state', 'app': 'models', 'pk_attr': 'code', 'table_description': 'A state, province or region of a country.'},
        ),
        ops.RenameField(
            model_name='User',
            old_name='failed_logins',
            new_name='failed_sign_ins',
        ),
        ops.RenameField(
            model_name='User',
            old_name='password_hash',
            new_name='passphrase_hash',
        ),
        DescribeField(
            model_name='User',
            name='base_currency',
            field=fields.CharField(null=True, description='The currency Home opens in', max_length=3),
        ),
        ops.AlterModelOptions(
            name='Vendor',
            options={'table': 'vendor', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A vendor you buy from. Shared across every project.'},
        ),
        ops.RenameField(
            model_name='Vendor',
            old_name='deleted_at',
            new_name='archived_at',
        ),
        DescribeField(
            model_name='Vendor',
            name='contact_name',
            field=fields.CharField(null=True, description='The contact person at the vendor', max_length=255),
        ),
        DescribeField(
            model_name='Vendor',
            name='trade',
            field=fields.CharField(null=True, description='What the vendor supplies, such as blocks, bricklaying or consulting', max_length=255),
        ),
    ]
