"""新增系统模型冒烟测试：表名与关键列存在。"""

from app.models import AuditLog, SystemParam
from app.models.answer import Answer


def test_audit_log_mapping():
    assert AuditLog.__tablename__ == "audit_logs"
    assert set(AuditLog.__table__.columns.keys()) >= {
        "id", "actor_id", "action", "target_type", "target_id", "ip", "detail", "created_at",
    }


def test_system_param_mapping():
    assert SystemParam.__tablename__ == "system_params"
    assert list(SystemParam.__table__.primary_key.columns.keys()) == ["key"]


def test_answer_has_teacher_comment():
    assert "teacher_comment" in Answer.__table__.columns.keys()
