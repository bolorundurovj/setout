from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

from setout.config import get_settings
from setout.models.currency import Currency
from setout.models.user import Session, User
from setout.schemas.auth import (
    AccountUpdate,
    AuthStatus,
    LoginRequest,
    PasswordChange,
    SetupRequest,
    UserResponse,
)
from setout.services.auth import (
    hash_password,
    read_session_id,
    sign_session_id,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE_NAME = "setout_session"
SESSION_DAYS = 30


async def get_current_user(
    setout_session: Annotated[str | None, Cookie()] = None,
) -> User:
    if not setout_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    session_id = read_session_id(setout_session)
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )

    session = await Session.get_or_none(
        id=session_id, expires_at__gt=datetime.now(UTC)
    ).prefetch_related("user")

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )

    return session.user


@router.get(
    "/me",
    operation_id="getCurrentUser",
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)
async def get_me(user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch(
    "/me",
    operation_id="updateAccount",
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"}},
)
async def update_account(
    req: AccountUpdate, user: Annotated[User, Depends(get_current_user)]
) -> UserResponse:
    changes = req.model_dump(exclude_unset=True)
    wanted = changes.get("base_currency")
    if wanted:
        wanted = wanted.upper()
        if await Currency.get_or_none(code=wanted) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown currency: {wanted}",
            )
        changes["base_currency"] = wanted
    if changes:
        user.update_from_dict(changes)
        await user.save()
    return UserResponse.model_validate(user)


@router.post(
    "/password",
    operation_id="changePassphrase",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"},
        status.HTTP_403_FORBIDDEN: {"description": "The passphrase given does not match"},
    },
)
async def change_passphrase(
    req: PasswordChange,
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    setout_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="That is not the current passphrase"
        )
    user.password_hash = hash_password(req.new_password)
    await user.save()
    # Every other device is signed out, which is the point of changing it. The
    # one doing the changing keeps its session.
    keep = read_session_id(setout_session or "")
    await Session.filter(user_id=user.id).exclude(id=keep or "").delete()


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sign_session_id(session_id),
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 3600,
    )


@router.get("/status", operation_id="getAuthStatus")
async def get_auth_status(
    setout_session: Annotated[str | None, Cookie()] = None,
) -> AuthStatus:
    user_count = await User.all().count()
    if user_count == 0:
        return AuthStatus(is_setup=False, is_authenticated=False, user=None)

    if not setout_session:
        return AuthStatus(is_setup=True, is_authenticated=False, user=None)

    session_id = read_session_id(setout_session)
    if not session_id:
        return AuthStatus(is_setup=True, is_authenticated=False, user=None)

    session = await Session.get_or_none(
        id=session_id, expires_at__gt=datetime.now(UTC)
    ).prefetch_related("user")

    if not session:
        return AuthStatus(is_setup=True, is_authenticated=False, user=None)

    return AuthStatus(
        is_setup=True,
        is_authenticated=True,
        user=UserResponse.model_validate(session.user),
    )


@router.post(
    "/setup",
    operation_id="setupAdmin",
    responses={status.HTTP_409_CONFLICT: {"description": "Already setup"}},
)
async def setup_admin(req: SetupRequest, response: Response) -> UserResponse:
    if await User.all().exists():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already setup")

    hashed = hash_password(req.password)
    user = await User.create(name=req.name, email=req.email, password_hash=hashed)

    session_id = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=SESSION_DAYS)
    await Session.create(id=session_id, user=user, expires_at=expires)

    set_session_cookie(response, session_id)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    operation_id="login",
    responses={status.HTTP_401_UNAUTHORIZED: {"description": "Invalid credentials"}},
)
async def login(req: LoginRequest, response: Response) -> UserResponse:
    user = await User.first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    session_id = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=SESSION_DAYS)
    await Session.create(id=session_id, user=user, expires_at=expires)

    set_session_cookie(response, session_id)
    return UserResponse.model_validate(user)


@router.post("/logout", operation_id="logout", status_code=204)
async def logout(
    response: Response, setout_session: Annotated[str | None, Cookie()] = None
) -> None:
    if setout_session:
        session_id = read_session_id(setout_session)
        if session_id:
            await Session.filter(id=session_id).delete()
    response.delete_cookie(SESSION_COOKIE_NAME)
