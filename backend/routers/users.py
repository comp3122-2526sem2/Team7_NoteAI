import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from auth_utils import hash_password
from deps import AdminUser, CurrentUser, DbDep
from models import User
from schemas import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserOut])
def list_users(_: AdminUser, db: DbDep):
    return db.scalars(select(User).order_by(User.created_at.desc())).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, current_user: CurrentUser, db: DbDep):
    if current_user.id != user_id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, body: UserUpdate, current_user: CurrentUser, db: DbDep):
    if current_user.id != user_id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if body.nickname is not None:
        user.nickname = body.nickname
    if body.password is not None:
        user.password = hash_password(body.password)
    if body.is_active is not None:
        user.is_active = body.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, _: AdminUser, db: DbDep):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    db.delete(user)
    db.commit()
