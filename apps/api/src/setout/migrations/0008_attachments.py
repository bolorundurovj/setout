from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0007_deliveries')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Attachment',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='attachments', on_delete=OnDelete.CASCADE)),
                ('expense', fields.ForeignKeyField('models.Expense', source_field='expense_id', db_constraint=True, to_field='id', related_name='attachments', on_delete=OnDelete.CASCADE)),
                ('filename', fields.CharField(description='What it was called where it came from', max_length=255)),
                ('content_type', fields.CharField(max_length=127)),
                ('byte_size', fields.IntField()),
                ('checksum', fields.CharField(db_index=True, description='sha256 of the contents, and the stored name', max_length=64)),
                ('storage_key', fields.CharField(max_length=255)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'attachment', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A photograph of a receipt, or any file kept beside an expense.'},
            bases=['Model'],
        ),
    ]
