from typing import Annotated, ClassVar

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from setout.schemas.base import UpdateModel
from setout.services.auth import MAX_PASSPHRASE_BYTES, PASSPHRASE_TOO_LONG, passphrase_too_long


def _fits_bcrypt(passphrase: str) -> str:
    if passphrase_too_long(passphrase):
        raise ValueError(PASSPHRASE_TOO_LONG)
    return passphrase


NewPassphrase = Annotated[
    str,
    Field(
        min_length=8,
        max_length=MAX_PASSPHRASE_BYTES,
        description=f"At least 8 characters, and at most {MAX_PASSPHRASE_BYTES} bytes in UTF-8",
    ),
    AfterValidator(_fits_bcrypt),
]


class SetupRequest(BaseModel):
    name: str = Field(..., description="The local account name")
    email: EmailStr | None = Field(None, description="Optional. Only used to identify the account")
    passphrase: NewPassphrase


class SignInRequest(BaseModel):
    passphrase: str = Field(..., description="The passphrase")


class AccountUpdate(UpdateModel):
    # A null name is refused by the router with its own documented message.
    NOT_NULL: ClassVar[frozenset[str]] = frozenset()

    name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    base_currency: str | None = Field(None, min_length=3, max_length=3)


class PassphraseChange(BaseModel):
    current_passphrase: str = Field(..., description="The current passphrase")
    new_passphrase: NewPassphrase


class UserResponse(BaseModel):
    id: str
    name: str
    email: str | None
    base_currency: str | None

    model_config = ConfigDict(from_attributes=True)


class AuthStatus(BaseModel):
    is_setup: bool
    is_authenticated: bool
    user: UserResponse | None
