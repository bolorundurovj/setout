from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0006_agreements')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Delivery',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='deliveries', on_delete=OnDelete.CASCADE)),
                ('expense', fields.OneToOneField('models.Expense', source_field='expense_id', db_constraint=True, to_field='id', related_name='delivery', on_delete=OnDelete.CASCADE)),
                ('description', fields.CharField(max_length=255)),
                ('promised', fields.CharField(null=True, max_length=255)),
                ('received_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'delivery', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Something paid for that has not arrived.'},
            bases=['Model'],
        ),
    ]
