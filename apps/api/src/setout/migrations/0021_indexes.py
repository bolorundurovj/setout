"""Single-column indexes for the foreign-key, filter and sort columns.

Tortoise does not index ForeignKeyField columns on its own, so growing tables
turn every join and filtered listing into a full scan. The models declare the
same indexes in Meta, and this migration adds them to existing databases.
"""

from __future__ import annotations

from tortoise import migrations
from tortoise.indexes import Index
from tortoise.migrations import operations as ops


def _index(model: str, field: str) -> ops.AddIndex:
    return ops.AddIndex(model_name=model, index=Index(fields=(field,)))


class Migration(migrations.Migration):
    dependencies = [("models", "0020_changes")]

    initial = False

    operations = [
        _index("Session", "user_id"),
        _index("Session", "expires_at"),
        _index("Expense", "project_id"),
        _index("Expense", "category_id"),
        _index("Expense", "item_id"),
        _index("Expense", "vendor_id"),
        _index("Expense", "paid_by_id"),
        _index("Expense", "agreement_id"),
        _index("Expense", "spent_on"),
        _index("Expense", "archived_at"),
        _index("Category", "project_id"),
        _index("Category", "parent_id"),
        _index("BudgetItem", "category_id"),
        _index("Attachment", "storage_key"),
        _index("Attachment", "project_id"),
        _index("Attachment", "expense_id"),
        _index("Attachment", "agreement_id"),
        _index("Attachment", "delivery_id"),
        _index("LandDocument", "storage_key"),
        _index("LandDocument", "land_id"),
        _index("Change", "created_at"),
        _index("Delivery", "project_id"),
        _index("Delivery", "received_at"),
        _index("Agreement", "project_id"),
        _index("Agreement", "vendor_id"),
        _index("Advance", "project_id"),
        _index("Advance", "person_id"),
        _index("LandValuation", "land_id"),
        _index("Project", "land_id"),
        _index("State", "country_id"),
        _index("Land", "country_id"),
    ]
