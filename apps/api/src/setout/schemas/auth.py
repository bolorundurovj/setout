from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SetupRequest(BaseModel):
    name: str = Field(..., description="The local account name")
    email: EmailStr | None = Field(None, description="Optional. Only used to identify the account")
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    password: str = Field(..., description="The passphrase")


class AccountUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    base_currency: str | None = Field(None, min_length=3, max_length=3)


class PasswordChange(BaseModel):
    current_password: str = Field(..., description="The passphrase in use now")
    new_password: str = Field(..., min_length=8)


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
