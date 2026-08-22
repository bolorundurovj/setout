from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.models.expense import CostType
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0004_scopes')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Item',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(max_length=255)),
                ('unit', fields.CharField(null=True, description='What the price is quoted in: bag, each, truck, sheet', max_length=32)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'item', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Something bought more than once. Prices are read from the expenses.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Person',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(max_length=255)),
                ('role', fields.CharField(null=True, description='How they relate to the build: family, site supervisor, foreman', max_length=255)),
                ('phone', fields.CharField(null=True, max_length=64)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'person', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Someone who spends your money for you. Shared across every project.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Vendor',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(max_length=255)),
                ('trade', fields.CharField(null=True, description='What they sell or do: block supplier, bricklayer, consultant', max_length=255)),
                ('contact_name', fields.CharField(null=True, description='The person you ask for', max_length=255)),
                ('phone', fields.CharField(null=True, max_length=64)),
                ('email', fields.CharField(null=True, max_length=254)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'vendor', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Someone you buy from. Shared across every project.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Expense',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.CASCADE)),
                ('scope', fields.ForeignKeyField('models.Scope', source_field='scope_id', null=True, db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL)),
                ('item', fields.ForeignKeyField('models.Item', source_field='item_id', null=True, description='What was bought. This is what the price history is built from', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL)),
                ('vendor', fields.ForeignKeyField('models.Vendor', source_field='vendor_id', null=True, description='Who it was bought from', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL)),
                ('paid_by', fields.ForeignKeyField('models.Person', source_field='paid_by_id', null=True, description='Who handed over the money. Null means you paid it yourself', db_constraint=True, to_field='id', related_name='expenses_paid', on_delete=OnDelete.SET_NULL)),
                ('spent_on', fields.DateField()),
                ('description', fields.CharField(max_length=255)),
                ('quantity', fields.DecimalField(null=True, max_digits=12, decimal_places=3)),
                ('unit_rate', fields.BigIntField(null=True)),
                ('amount', fields.BigIntField()),
                ('cost_type', fields.CharEnumField(null=True, description='Optional. Splits the project total three ways when it is set', enum_type=CostType, max_length=16)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'expense', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
    ]
