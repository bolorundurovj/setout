from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.models.project import ProjectStatus
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0002_users')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Project',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(max_length=255)),
                ('currency', fields.ForeignKeyField('models.Currency', source_field='currency_id', db_constraint=True, to_field='code', related_name='projects', on_delete=OnDelete.RESTRICT)),
                ('status', fields.CharEnumField(default=ProjectStatus.ACTIVE, description='ACTIVE: active\nON_HOLD: on_hold\nCOMPLETED: completed\nARCHIVED: archived', enum_type=ProjectStatus, max_length=16)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'project', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
    ]
