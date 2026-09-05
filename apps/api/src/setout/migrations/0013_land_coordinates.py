from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0012_land_valuations')]

    initial = False

    operations = [
        ops.AddField(
            model_name='Land',
            name='boundary',
            field=fields.TextField(null=True, description="GeoJSON Polygon of the plot's edge", unique=False),
        ),
        ops.AddField(
            model_name='Land',
            name='latitude',
            field=fields.DecimalField(null=True, max_digits=10, decimal_places=7),
        ),
        ops.AddField(
            model_name='Land',
            name='longitude',
            field=fields.DecimalField(null=True, max_digits=10, decimal_places=7),
        ),
    ]
