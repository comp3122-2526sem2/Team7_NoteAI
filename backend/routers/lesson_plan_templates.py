import os
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, or_, select

from deps import CurrentUser, DbDep, TeacherUser
from models import LessonPlanTemplate, LessonPlanTemplateType, UserRole
from schemas import LessonPlanTemplateCreate, LessonPlanTemplateOut, LessonPlanTemplateUpdate

router = APIRouter(prefix="/lesson-plan-templates", tags=["Lesson Plan Templates"])


def _school_id() -> str:
    return os.getenv("SCHOOL_ID", "default-school")


def _visible_filter(current_user_id: uuid.UUID):
    school = _school_id()
    return or_(
        LessonPlanTemplate.template_type == LessonPlanTemplateType.system,
        and_(
            LessonPlanTemplate.template_type == LessonPlanTemplateType.school,
            LessonPlanTemplate.school_id == school,
        ),
        and_(
            LessonPlanTemplate.template_type == LessonPlanTemplateType.teacher,
            LessonPlanTemplate.created_by == current_user_id,
        ),
    )


def _check_template_access(template: LessonPlanTemplate, user) -> None:
    if user.role == UserRole.admin:
        return
    if template.template_type == LessonPlanTemplate.system:
        raise HTTPException(status_code=403, detail="System templates are admin-only.")
    if template.template_type == LessonPlanTemplate.school and template.school_id != _school_id():
        raise HTTPException(status_code=403, detail="Template not accessible.")
    if template.template_type == LessonPlanTemplate.teacher and template.created_by != user.id:
        raise HTTPException(status_code=403, detail="Template not accessible.")


@router.get("", response_model=list[LessonPlanTemplateOut])
def list_templates(current_user: CurrentUser, db: DbDep):
    return db.scalars(
        select(LessonPlanTemplate)
        .where(
            LessonPlanTemplate.is_active.is_(True),
            _visible_filter(current_user.id),
        )
        .order_by(LessonPlanTemplate.template_type, LessonPlanTemplate.name)
    ).all()


@router.get("/{template_id}", response_model=LessonPlanTemplateOut)
def get_template(template_id: uuid.UUID, current_user: CurrentUser, db: DbDep):
    template = db.scalar(
        select(LessonPlanTemplate).where(
            LessonPlanTemplate.id == template_id,
            LessonPlanTemplate.is_active.is_(True),
            _visible_filter(current_user.id),
        )
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.post("", response_model=LessonPlanTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(body: LessonPlanTemplateCreate, current_user: TeacherUser, db: DbDep):
    template_type = body.template_type
    school_id = body.school_id

    if current_user.role != UserRole.admin:
        if template_type == LessonPlanTemplateType.system:
            raise HTTPException(status_code=403, detail="Only admins can create system templates.")
        if template_type == LessonPlanTemplateType.school:
            school_id = _school_id()
        if template_type == LessonPlanTemplateType.teacher:
            school_id = None

    template = LessonPlanTemplate(
        name=body.name,
        description=body.description,
        content=body.content,
        default_config=body.default_config,
        template_type=template_type,
        school_id=school_id,
        created_by=current_user.id,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=LessonPlanTemplateOut)
def update_template(
    template_id: uuid.UUID,
    body: LessonPlanTemplateUpdate,
    current_user: TeacherUser,
    db: DbDep,
):
    template = db.get(LessonPlanTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _check_template_access(template, current_user)

    updates = body.model_dump(exclude_none=True)
    if "template_type" in updates and current_user.role != UserRole.admin:
        updates.pop("template_type")
    if "school_id" in updates and current_user.role != UserRole.admin:
        updates["school_id"] = _school_id()

    for field, value in updates.items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: uuid.UUID, current_user: TeacherUser, db: DbDep):
    template = db.get(LessonPlanTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _check_template_access(template, current_user)
    db.delete(template)
    db.commit()
