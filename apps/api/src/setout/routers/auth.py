from __future__ import annotations

import asyncio
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
    PassphraseChange,
    SetupRequest,
    SignInRequest,
    UserResponse,
)
from setout.services import changes
from setout.services.auth import (
    delay_for,
    hash_passphrase,
    read_session_id,
    sign_session_id,
    verify_passphrase,
)

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE_NAME = "setout_session"


async def get_current_user(
    response: Response,
    setout_session: Annotated[str | None, Cookie()] = None,
) -> User:
    if not setout_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    session_id = read_session_id(setout_session)
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )

    now = datetime.now(UTC)
    session = await Session.get_or_none(id=session_id, expires_at__gt=now).prefetch_related("user")

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )

    await _extend_expiry(session, now, response)
    changes.actor.set(session.user.id)
    return session.user


async def _extend_expiry(session: Session, now: datetime, response: Response) -> None:
    """Reset expiry to a full window once half of it has passed."""
    window = session_window()
    if session.expires_at - now > window / 2:
        return
    session.expires_at = now + window
    await session.save()
    set_session_cookie(response, session.id)


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
    currency_code = changes.get("base_currency")
    if currency_code:
        currency_code = currency_code.upper()
        if await Currency.get_or_none(code=currency_code) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown currency: {currency_code}",
            )
        changes["base_currency"] = currency_code
    if changes:
        user.update_from_dict(changes)
        await user.save()
    return UserResponse.model_validate(user)


@router.post(
    "/passphrase",
    operation_id="changePassphrase",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Not authenticated"},
        status.HTTP_403_FORBIDDEN: {"description": "The current passphrase is incorrect"},
    },
)
async def change_passphrase(
    req: PassphraseChange,
    response: Response,
    user: Annotated[User, Depends(get_current_user)],
    setout_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if not verify_passphrase(req.current_passphrase, user.passphrase_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="The current passphrase is incorrect"
        )
    user.passphrase_hash = hash_passphrase(req.new_passphrase)
    await user.save()
    # Ends every other session; the session that made the change is kept.
    current_session_id = read_session_id(setout_session or "")
    await Session.filter(user_id=user.id).exclude(id=current_session_id or "").delete()


def session_window() -> timedelta:
    return timedelta(days=get_settings().session_days)


def set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=sign_session_id(session_id),
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        max_age=get_settings().session_days * 24 * 3600,
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
    responses={status.HTTP_409_CONFLICT: {"description": "This server is already set up"}},
)
async def setup_admin(req: SetupRequest, response: Response) -> UserResponse:
    if await User.all().exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This server is already set up"
        )

    hashed = hash_passphrase(req.passphrase)
    user = await User.create(name=req.name, email=req.email, passphrase_hash=hashed)

    session_id = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + session_window()
    await Session.create(id=session_id, user=user, expires_at=expires)

    set_session_cookie(response, session_id)
    return UserResponse.model_validate(user)


@router.post(
    "/sign-in",
    operation_id="signIn",
    responses={
        status.HTTP_401_UNAUTHORIZED: {"description": "Invalid credentials"},
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "description": "Too many failed sign-in attempts. Try again later"
        },
    },
)
async def sign_in(req: SignInRequest, response: Response) -> UserResponse:
    settings = get_settings()
    user = await User.first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    now = datetime.now(UTC)
    failures = _recent_failure_count(user, now, settings.sign_in_retry_after_seconds)
    wait = delay_for(failures, settings)
    if wait is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later",
            headers={"Retry-After": str(settings.sign_in_retry_after_seconds)},
        )
    if wait:
        await asyncio.sleep(wait)

    if not verify_passphrase(req.passphrase, user.passphrase_hash):
        user.failed_sign_ins = failures + 1
        user.last_failed_at = now
        await user.save()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.failed_sign_ins:
        user.failed_sign_ins = 0
        user.last_failed_at = None
        await user.save()

    await Session.filter(expires_at__lte=now).delete()

    session_id = secrets.token_urlsafe(32)
    await Session.create(id=session_id, user=user, expires_at=now + session_window())

    set_session_cookie(response, session_id)
    return UserResponse.model_validate(user)


def _recent_failure_count(user: User, now: datetime, window_seconds: int) -> int:
    """Failures older than the window are not counted."""
    if user.last_failed_at is None:
        return 0
    if (now - user.last_failed_at).total_seconds() > window_seconds:
        return 0
    return user.failed_sign_ins


@router.post("/sign-out", operation_id="signOut", status_code=204)
async def sign_out(
    response: Response, setout_session: Annotated[str | None, Cookie()] = None
) -> None:
    if setout_session:
        session_id = read_session_id(setout_session)
        if session_id:
            await Session.filter(id=session_id).delete()
    response.delete_cookie(SESSION_COOKIE_NAME)
