import pytest
from pydantic import ValidationError

from setout.schemas import (
    agreement,
    auth,
    category,
    delivery,
    expense,
    item,
    land,
    land_document,
    land_valuation,
    person,
    project,
    vendor,
)
from setout.schemas.base import UpdateModel

pytestmark = pytest.mark.unit

UPDATE_MODELS: list[type[UpdateModel]] = [
    agreement.AdvanceUpdate,
    agreement.AgreementUpdate,
    auth.AccountUpdate,
    category.BudgetItemUpdate,
    category.CategoryUpdate,
    delivery.DeliveryUpdate,
    expense.ExpenseUpdate,
    item.ItemUpdate,
    land.LandUpdate,
    land_document.LandDocumentUpdate,
    land_valuation.LandValuationUpdate,
    person.PersonUpdate,
    project.ProjectUpdate,
    vendor.VendorUpdate,
]

NOT_NULL_FIELDS = [(model, field) for model in UPDATE_MODELS for field in sorted(model.NOT_NULL)]


def test_every_update_schema_uses_the_shared_base() -> None:
    assert {cls.__name__ for cls in UpdateModel.__subclasses__()} == {
        cls.__name__ for cls in UPDATE_MODELS
    }


@pytest.mark.parametrize(
    ("model", "field"), NOT_NULL_FIELDS, ids=[f"{m.__name__}.{f}" for m, f in NOT_NULL_FIELDS]
)
def test_a_required_field_sent_as_null_is_refused(model: type[UpdateModel], field: str) -> None:
    with pytest.raises(ValidationError, match=f"{field} cannot be null"):
        model.model_validate({field: None})


def test_leaving_a_required_field_out_is_allowed() -> None:
    assert project.ProjectUpdate.model_validate({}).model_fields_set == set()


def test_a_name_of_only_spaces_is_refused() -> None:
    with pytest.raises(ValidationError):
        project.ProjectUpdate.model_validate({"name": "   "})
