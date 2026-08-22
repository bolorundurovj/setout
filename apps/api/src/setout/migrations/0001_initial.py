from tortoise import migrations
from tortoise.migrations import operations as ops

from setout.utils.currencies import seed_currencies_migration
from setout.utils.scope_presets import seed_scope_presets_migration
from setout.utils.ids import short_id
from tortoise import fields

class Migration(migrations.Migration):
    initial = True

    operations = [
        ops.CreateModel(
            name='Currency',
            fields=[
                ('code', fields.CharField(primary_key=True, unique=True, db_index=True, max_length=3)),
                ('name', fields.CharField(max_length=64)),
                ('exponent', fields.SmallIntField(default=2)),
            ],
            options={'table': 'currency', 'app': 'models', 'pk_attr': 'code'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='ScopePreset',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(unique=True, max_length=255)),
                ('sort_order', fields.IntField(default=0)),
            ],
            options={'table': 'scope_preset', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.RunPython(seed_currencies_migration, ops.RunPython.noop),
        ops.RunPython(seed_scope_presets_migration, ops.RunPython.noop),
    ]
