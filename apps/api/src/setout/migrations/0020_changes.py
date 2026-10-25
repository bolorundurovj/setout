from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from setout.models.change import ChangeAction
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0019_attachment_parents')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Change',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('entity', fields.CharField(description='The table of the changed row', max_length=32)),
                ('entity_id', fields.CharField(max_length=12)),
                ('project_id', fields.CharField(null=True, db_index=True, max_length=12)),
                ('action', fields.CharEnumField(description='CREATE: create\nUPDATE: update\nARCHIVE: archive\nRESTORE: restore\nDELETE: delete\nIMPORT: import', enum_type=ChangeAction, max_length=16)),
                ('changed_fields', fields.JSONField(description='Each changed field as [before, after], or row counts for an import', encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', null=True, description='Null when Setout made the change, such as during an import', db_constraint=True, to_field='id', related_name='changes', on_delete=OnDelete.SET_NULL)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'change', 'app': 'models', 'indexes': [Index(fields=['entity', 'entity_id'])], 'pk_attr': 'id', 'table_description': 'One recorded create, update, archive, restore, delete or import of a row.'},
            bases=['Model'],
        ),
    ]
