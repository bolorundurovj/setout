from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops

from setout.models.land_valuation import LandValuationKind
from setout.utils.ids import short_id


class Migration(migrations.Migration):
    dependencies = [("models", "0011_land_countries")]

    initial = False

    operations = [
        ops.AddField(
            model_name="Land",
            name="purchased_on",
            field=fields.DateField(null=True),
        ),
        ops.AddField(
            model_name="Land",
            name="currency",
            field=fields.ForeignKeyField(
                "models.Currency",
                source_field="currency_id",
                null=True,
                db_constraint=True,
                to_field="code",
                related_name="lands",
                on_delete=OnDelete.RESTRICT,
            ),
        ),
        ops.CreateModel(
            name="LandValuation",
            fields=[
                (
                    "id",
                    fields.CharField(
                        primary_key=True,
                        default=short_id,
                        unique=True,
                        db_index=True,
                        max_length=12,
                    ),
                ),
                (
                    "land",
                    fields.ForeignKeyField(
                        "models.Land",
                        source_field="land_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="valuations",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "kind",
                    fields.CharEnumField(
                        default=LandValuationKind.VALUATION,
                        description="Whether this is what it was bought for, or what it is worth now",
                        enum_type=LandValuationKind,
                        max_length=16,
                    ),
                ),
                ("amount", fields.BigIntField()),
                (
                    "currency",
                    fields.ForeignKeyField(
                        "models.Currency",
                        source_field="currency_id",
                        db_constraint=True,
                        to_field="code",
                        related_name="land_valuations",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("valued_on", fields.DateField()),
                (
                    "note",
                    fields.CharField(
                        null=True, description="Who valued it, or why", max_length=255
                    ),
                ),
                ("created_at", fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "deleted_at",
                    fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
                ),
            ],
            options={
                "table": "land_valuation",
                "app": "models",
                "pk_attr": "id",
                "table_description": "What the plot was worth, and when. The purchase is the first of them.",
            },
            bases=["Model"],
        ),
    ]
