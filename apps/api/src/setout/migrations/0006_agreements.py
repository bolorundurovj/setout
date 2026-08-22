from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0005_expenses')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Advance',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('person', fields.ForeignKeyField('models.Person', source_field='person_id', db_constraint=True, to_field='id', related_name='advances', on_delete=OnDelete.CASCADE)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='advances', on_delete=OnDelete.CASCADE)),
                ('given_on', fields.DateField()),
                ('amount', fields.BigIntField()),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'advance', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Money handed to someone before they spend it.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Agreement',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='agreements', on_delete=OnDelete.CASCADE)),
                ('vendor', fields.ForeignKeyField('models.Vendor', source_field='vendor_id', db_constraint=True, to_field='id', related_name='agreements', on_delete=OnDelete.RESTRICT)),
                ('description', fields.CharField(max_length=255)),
                ('agreed_amount', fields.BigIntField()),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'agreement', 'app': 'models', 'pk_attr': 'id', 'table_description': 'What a vendor agreed to do for a fixed price on one project.'},
            bases=['Model'],
        ),
        ops.AddField(
            model_name='Expense',
            name='agreement',
            field=fields.ForeignKeyField('models.Agreement', source_field='agreement_id', null=True, description='A part payment against what was agreed', db_constraint=True, to_field='id', related_name='expenses', on_delete=OnDelete.SET_NULL),
        ),
    ]
