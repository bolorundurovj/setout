from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.models.land import LandSizeUnit
from setout.models.land_document import LandDocumentKind
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0008_attachments')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Land',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('name', fields.CharField(description='What you call it: Ikeja plot, the farm', max_length=255)),
                ('address', fields.TextField(null=True, description='Street address or description', unique=False)),
                ('city', fields.CharField(null=True, max_length=255)),
                ('state', fields.CharField(null=True, max_length=255)),
                ('size_value', fields.DecimalField(null=True, max_digits=14, decimal_places=2)),
                ('size_unit', fields.CharEnumField(null=True, description='SQM: sqm\nHECTARE: hectare\nACRE: acre\nPLOT: plot', enum_type=LandSizeUnit, max_length=16)),
                ('notes', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'land', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A plot of ground. Shared across every project built on it.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='LandDocument',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('land', fields.ForeignKeyField('models.Land', source_field='land_id', db_constraint=True, to_field='id', related_name='documents', on_delete=OnDelete.CASCADE)),
                ('kind', fields.CharEnumField(default=LandDocumentKind.OTHER, description='What the paper is, so a land can say which ones it is missing', enum_type=LandDocumentKind, max_length=32)),
                ('filename', fields.CharField(description='What it was called where it came from', max_length=255)),
                ('content_type', fields.CharField(max_length=127)),
                ('byte_size', fields.IntField()),
                ('checksum', fields.CharField(db_index=True, description='sha256 of the contents, and the stored name', max_length=64)),
                ('storage_key', fields.CharField(max_length=255)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'land_document', 'app': 'models', 'pk_attr': 'id', 'table_description': 'A paper that says the land is yours, or says what may be built on it.'},
            bases=['Model'],
        ),
        ops.AddField(
            model_name='Project',
            name='land',
            field=fields.ForeignKeyField('models.Land', source_field='land_id', null=True, db_constraint=True, to_field='id', related_name='projects', on_delete=OnDelete.SET_NULL),
        ),
    ]
