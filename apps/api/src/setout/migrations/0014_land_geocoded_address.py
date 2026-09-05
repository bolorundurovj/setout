from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0013_land_coordinates')]

    initial = False

    operations = [
        ops.AddField(
            model_name='Land',
            name='geocoded_address',
            field=fields.TextField(null=True, description='What the map calls the spot the pin is on', unique=False),
        ),
    ]
