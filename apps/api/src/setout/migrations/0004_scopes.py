from tortoise import migrations
from tortoise.migrations import operations as ops
from setout.models.expense import CostType
from setout.utils.ids import short_id
from tortoise.fields.base import OnDelete
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0003_projects')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Scope',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('project', fields.ForeignKeyField('models.Project', source_field='project_id', db_constraint=True, to_field='id', related_name='scopes', on_delete=OnDelete.CASCADE)),
                ('code', fields.CharField(null=True, max_length=32)),
                ('name', fields.CharField(max_length=255)),
                ('parent', fields.ForeignKeyField('models.Scope', source_field='parent_id', null=True, db_constraint=True, to_field='id', related_name='children', on_delete=OnDelete.CASCADE)),
                ('sort_order', fields.IntField(default=0)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'scope', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='BudgetItem',
            fields=[
                ('id', fields.CharField(primary_key=True, default=short_id, unique=True, db_index=True, max_length=12)),
                ('scope', fields.ForeignKeyField('models.Scope', source_field='scope_id', db_constraint=True, to_field='id', related_name='budget_items', on_delete=OnDelete.CASCADE)),
                ('description', fields.CharField(max_length=255)),
                ('cost_type', fields.CharEnumField(null=True, description='Optional. Which of labour, material or fixed the plan puts this under', enum_type=CostType, max_length=16)),
                ('planned_amount', fields.BigIntField()),
                ('set_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('deleted_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'budget_item', 'app': 'models', 'pk_attr': 'id'},
            bases=['Model'],
        ),
    ]
