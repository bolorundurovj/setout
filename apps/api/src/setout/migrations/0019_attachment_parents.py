from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0018_delivery_expected_date')]

    initial = False

    operations = [
        ops.AlterModelOptions(
            name='Attachment',
            options={'table': 'attachment', 'app': 'models', 'pk_attr': 'id', 'table_description': 'An image or a PDF attached to a project, or to one expense, agreement or delivery in it.'},
        ),
        ops.AlterField(
            model_name='Attachment',
            name='expense',
            field=fields.ForeignKeyField('models.Expense', source_field='expense_id', null=True, db_constraint=True, to_field='id', related_name='attachments', on_delete=OnDelete.CASCADE),
        ),
        ops.AddField(
            model_name='Attachment',
            name='agreement',
            field=fields.ForeignKeyField('models.Agreement', source_field='agreement_id', null=True, db_constraint=True, to_field='id', related_name='attachments', on_delete=OnDelete.CASCADE),
        ),
        ops.AddField(
            model_name='Attachment',
            name='delivery',
            field=fields.ForeignKeyField('models.Delivery', source_field='delivery_id', null=True, db_constraint=True, to_field='id', related_name='attachments', on_delete=OnDelete.CASCADE),
        ),
    ]
