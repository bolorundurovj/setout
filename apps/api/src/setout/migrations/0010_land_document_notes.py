from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0009_lands")]

    initial = False

    operations = [
        ops.AddField(
            model_name="LandDocument",
            name="note",
            field=fields.CharField(
                null=True,
                description="What the paper actually is, when the kind does not say",
                max_length=255,
            ),
        ),
    ]
