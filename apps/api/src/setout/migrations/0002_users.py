from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0001_initial')]

    initial = False

    operations = [
        ops.CreateModel(
            name='User',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(unique=True, max_length=255)),
                ('email', fields.CharField(null=True, max_length=255)),
                ('password_hash', fields.CharField(max_length=255)),
                ('base_currency', fields.CharField(null=True, description='Which currency the home screen opens on', max_length=3)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'user', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Session',
            fields=[
                ('id', fields.CharField(primary_key=True, unique=True, db_index=True, max_length=64)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='sessions', on_delete=OnDelete.CASCADE)),
                ('expires_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'session', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
    ]
