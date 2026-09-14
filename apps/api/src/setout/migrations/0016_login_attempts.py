from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0015_categories')]

    initial = False

    operations = [
        ops.AddField(
            model_name='User',
            name='failed_logins',
            field=fields.IntField(default=0, db_default=0),
        ),
        ops.AddField(
            model_name='User',
            name='last_failed_at',
            field=fields.DatetimeField(null=True, default=None),
        ),
    ]
