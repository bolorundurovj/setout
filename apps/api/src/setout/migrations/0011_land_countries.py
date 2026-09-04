from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from setout.utils.countries import seed_countries_migration


class Migration(migrations.Migration):
    dependencies = [("models", "0010_land_document_notes")]

    initial = False

    operations = [
        ops.CreateModel(
            name="Country",
            fields=[
                (
                    "code",
                    fields.CharField(primary_key=True, unique=True, db_index=True, max_length=2),
                ),
                ("name", fields.CharField(max_length=128)),
            ],
            options={"table": "country", "app": "models", "pk_attr": "code"},
            bases=["Model"],
        ),
        ops.CreateModel(
            name="State",
            fields=[
                (
                    "code",
                    fields.CharField(primary_key=True, unique=True, db_index=True, max_length=6),
                ),
                (
                    "country",
                    fields.ForeignKeyField(
                        "models.Country",
                        source_field="country_id",
                        db_constraint=True,
                        to_field="code",
                        related_name="states",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("name", fields.CharField(max_length=128)),
            ],
            options={
                "table": "state",
                "app": "models",
                "pk_attr": "code",
                "table_description": "A state, province or region. What a plot's address calls the state.",
            },
            bases=["Model"],
        ),
        ops.RunPython(seed_countries_migration, ops.RunPython.noop),
        ops.AddField(
            model_name="Land",
            name="country",
            field=fields.ForeignKeyField(
                "models.Country",
                source_field="country_id",
                null=True,
                db_constraint=True,
                to_field="code",
                related_name="lands",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
    ]
