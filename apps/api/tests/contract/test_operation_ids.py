"""Contract test: every route keeps a stable, explicit operation_id.

A change to an operation_id is a breaking change to the generated SDK.
"""

from __future__ import annotations

import pytest

from setout.main import create_app
from setout.openapi_tools import find_missing_operation_ids

pytestmark = pytest.mark.contract

# The SDK method names depend on these. Treat changes as breaking.
EXPECTED_OPERATION_IDS = {
    "getHealth",
    "getCounts",
    "getInstall",
    "exportRecord",
    "restoreRecord",
    "updateAccount",
    "changePassphrase",
    "getAuthStatus",
    "setupAdmin",
    "login",
    "logout",
    "getCurrentUser",
    "listCurrencies",
    "listProjects",
    "createProject",
    "getProject",
    "updateProject",
    "deleteProject",
    "restoreProject",
    "getProjectSummary",
    "deleteBudgetItem",
    "updateBudgetItem",
    "addBudgetItem",
    "listBudgetItems",
    "restoreScope",
    "deleteScope",
    "updateScope",
    "getProjectBudget",
    "createScope",
    "listScopes",
    "listExpenses",
    "listBalances",
    "deleteAdvance",
    "updateAdvance",
    "addAdvance",
    "listAdvances",
    "deleteAgreement",
    "updateAgreement",
    "getAgreement",
    "addAgreement",
    "listAgreements",
    "getVendorAgreements",
    "previewImport",
    "runImport",
    "exportProject",
    "importSample",
    "search",
    "getHomeSummary",
    "getHomeMonths",
    "getHomeProjects",
    "getHomeLatest",
    "listDeliveries",
    "listAllDeliveries",
    "addDelivery",
    "getDelivery",
    "updateDelivery",
    "receiveDelivery",
    "unreceiveDelivery",
    "deleteDelivery",
    "restoreDelivery",
    "listAttachments",
    "addAttachment",
    "getAttachment",
    "downloadAttachment",
    "deleteAttachment",
    "restoreAttachment",
    "addExpense",
    "getProjectSpend",
    "getProjectMonths",
    "getExpense",
    "updateExpense",
    "deleteExpense",
    "restoreExpense",
    "listItems",
    "createItem",
    "getItem",
    "updateItem",
    "deleteItem",
    "restoreItem",
    "getItemPrices",
    "getItemLastPrice",
    "listLands",
    "createLand",
    "getLand",
    "updateLand",
    "deleteLand",
    "restoreLand",
    "listLandDocuments",
    "addLandDocument",
    "getLandDocument",
    "updateLandDocument",
    "downloadLandDocument",
    "deleteLandDocument",
    "restoreLandDocument",
    "listCountries",
    "listStates",
    "listVendors",
    "createVendor",
    "getVendor",
    "updateVendor",
    "deleteVendor",
    "restoreVendor",
    "getVendorSpend",
    "listPeople",
    "createPerson",
    "getPerson",
    "updatePerson",
    "deletePerson",
    "restorePerson",
    "getPersonSpend",
}


def test_no_route_is_missing_an_operation_id() -> None:
    assert find_missing_operation_ids(create_app()) == []


def test_operation_ids_are_stable() -> None:
    schema = create_app().openapi()
    found: set[str] = set()
    for methods in schema["paths"].values():
        for operation in methods.values():
            if isinstance(operation, dict) and "operationId" in operation:
                found.add(operation["operationId"])
    assert found >= EXPECTED_OPERATION_IDS


def test_operation_ids_are_unique() -> None:
    schema = create_app().openapi()
    ids: list[str] = []
    for methods in schema["paths"].values():
        for operation in methods.values():
            if isinstance(operation, dict) and "operationId" in operation:
                ids.append(operation["operationId"])
    assert len(ids) == len(set(ids))
