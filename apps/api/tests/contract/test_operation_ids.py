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
    "exportBackup",
    "restoreBackup",
    "updateAccount",
    "changePassphrase",
    "getAuthStatus",
    "setupAdmin",
    "signIn",
    "signOut",
    "getCurrentUser",
    "listCurrencies",
    "listProjects",
    "createProject",
    "getProject",
    "updateProject",
    "archiveProject",
    "restoreProject",
    "getProjectSummary",
    "archiveBudgetItem",
    "updateBudgetItem",
    "createBudgetItem",
    "listBudgetItems",
    "restoreCategory",
    "archiveCategory",
    "updateCategory",
    "getProjectBudget",
    "createCategory",
    "listCategories",
    "listExpenses",
    "listBalances",
    "archiveAdvance",
    "updateAdvance",
    "createAdvance",
    "listAdvances",
    "archiveAgreement",
    "updateAgreement",
    "getAgreement",
    "createAgreement",
    "listAgreements",
    "getVendorAgreements",
    "previewImport",
    "runImport",
    "exportProject",
    "exportProjectCsv",
    "exportProjectReport",
    "importSample",
    "search",
    "getHomeSummary",
    "getHomeMonths",
    "getHomeProjects",
    "getHomeLatest",
    "listDeliveries",
    "listAllDeliveries",
    "createDelivery",
    "getDelivery",
    "updateDelivery",
    "receiveDelivery",
    "unreceiveDelivery",
    "archiveDelivery",
    "restoreDelivery",
    "listAttachments",
    "createAttachment",
    "listProjectAttachments",
    "createProjectAttachment",
    "listAgreementAttachments",
    "createAgreementAttachment",
    "listDeliveryAttachments",
    "createDeliveryAttachment",
    "getAttachment",
    "downloadAttachment",
    "archiveAttachment",
    "restoreAttachment",
    "createExpense",
    "getProjectExpenseSummary",
    "getProjectMonths",
    "getExpense",
    "updateExpense",
    "archiveExpense",
    "restoreExpense",
    "listItems",
    "createItem",
    "getItem",
    "updateItem",
    "archiveItem",
    "restoreItem",
    "getItemPrices",
    "getItemLastPrice",
    "listLands",
    "createLand",
    "getLand",
    "updateLand",
    "archiveLand",
    "restoreLand",
    "listLandDocuments",
    "createLandDocument",
    "getLandDocument",
    "updateLandDocument",
    "downloadLandDocument",
    "archiveLandDocument",
    "restoreLandDocument",
    "listLandValuations",
    "createLandValuation",
    "updateLandValuation",
    "archiveLandValuation",
    "restoreLandValuation",
    "listCountries",
    "getMapSettings",
    "reverseGeocode",
    "listStates",
    "listVendors",
    "createVendor",
    "getVendor",
    "updateVendor",
    "archiveVendor",
    "restoreVendor",
    "getVendorExpenseSummary",
    "listPeople",
    "createPerson",
    "getPerson",
    "updatePerson",
    "archivePerson",
    "restorePerson",
    "getPersonExpenseSummary",
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
