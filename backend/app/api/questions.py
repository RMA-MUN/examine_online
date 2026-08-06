"""题目管理接口：负责题目模板下载、文件批量导入、题目列表/创建/修改/删除，及JSON批量导入。"""

import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.question import QuestionCreate, QuestionUpdate, QuestionResponse, QuestionImport
from app.services.question_service import get_questions, get_question, create_question, batch_create_questions, update_question, delete_question
from app.services.question_import_service import parse_excel, parse_word, get_import_summary
from app.services.teacher_subject_service import can_teacher_manage_exam
from app.utils.deps import require_role
from app.utils.response import success_response, paginated_response
from app.models.user import User

logger = logging.getLogger("app.api.questions")

router = APIRouter(tags=["题目管理"])

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates")

# 题目导入文件大小上限（10MB）：防止超大文件/解压炸弹整读内存导致 DoS
MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024

async def _ensure_teacher_can_manage_exam(db: AsyncSession, current_user: User, exam_id: int):
    """校验教师是否具备管理指定考试的权限，不具备则抛出 403；管理员不受限。"""
    if current_user.role == "teacher" and not await can_teacher_manage_exam(
        db, current_user.id, exam_id
    ):
        raise HTTPException(status_code=403, detail="无权管理该考试")

@router.get("/api/questions/template/{format}")
async def download_template(
    format: str,
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """下载题目导入模板文件（excel/word），仅教师/管理员可调用。"""
    if format not in ("excel", "word"):
        raise HTTPException(status_code=400, detail="格式不支持，仅支持 excel 或 word")

    if format == "excel":
        file_path = os.path.join(TEMPLATE_DIR, "question_import_template.xlsx")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "question_import_template.xlsx"
    else:
        file_path = os.path.join(TEMPLATE_DIR, "question_import_template.docx")
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = "question_import_template.docx"

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="模板文件不存在")

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename
    )

@router.post("/api/exams/{exam_id}/questions/import-file")
async def import_questions_from_file(
    exam_id: int,
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """通过上传 Excel/Word 文件批量导入题目到指定考试，仅教师/管理员可调用。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    # Validate file extension
    # 校验文件扩展名，仅支持 xlsx/docx
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".xlsx", ".docx"):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 或 .docx 格式")

    # Validate file size
    # 按已落盘文件的实际尺寸判断，超限直接拒绝，避免大文件整体读入内存
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件大小不能超过 {MAX_IMPORT_FILE_SIZE // (1024 * 1024)}MB",
        )

    # Parse file
    # 按扩展名选择对应的解析器（Excel 或 Word）
    if ext == ".xlsx":
        questions, errors = await parse_excel(file)
    else:
        questions, errors = await parse_word(file)

    # Return errors if any
    # 解析存在错误时直接返回错误明细，不写入数据库
    if errors:
        return {
            "code": 400,
            "message": "导入失败",
            "data": {
                "errors": [
                    {
                        "row": e.row,
                        "type": e.type,
                        "content_preview": e.content_preview,
                        "field": e.field,
                        "current_value": e.current_value,
                        "error": e.error,
                        "expected": e.expected
                    }
                    for e in errors
                ]
            }
        }

    # Get summary
    # 统计导入结果概况（各类题型数量等）
    summary = get_import_summary(questions)

    # Create questions in database - wrap in transaction to prevent partial writes
    # 逐条写入数据库，任一条失败即回滚，防止部分写入
    try:
        created_questions = []
        for q in questions:
            question_data = {
                "type": q.type.name,
                "content": q.content,
                "options": q.options.split("\n") if q.options else None,
                "answer": q.answer,
                "score": q.score,
                "sort_order": len(created_questions),
                "analysis": q.analysis
            }
            question = await create_question(db, exam_id, question_data)
            created_questions.append(question)
        
        return success_response(data={
            "imported_count": len(created_questions),
            "summary": summary,
            "questions": [QuestionResponse.model_validate(q).model_dump() for q in created_questions]
        })
    except Exception as e:
        # Rollback on any error to prevent partial writes
        # 回滚事务并记录日志后返回 500
        await db.rollback()
        logger.exception("导入题目失败 exam_id=%s", exam_id)
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")

@router.get("/api/exams/{exam_id}/questions")
async def list_questions(
    exam_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """分页获取指定考试的题目列表，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    questions, total = await get_questions(db, exam_id, page, page_size)
    questions_data = [QuestionResponse.model_validate(q).model_dump() for q in questions]
    return paginated_response(questions_data, total, page, page_size)

@router.post("/api/exams/{exam_id}/questions")
async def create_new_question(
    exam_id: int,
    question_data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """在指定考试下创建单道题目，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    question = await create_question(db, exam_id, question_data.model_dump())
    return success_response(data=QuestionResponse.model_validate(question).model_dump())

@router.post("/api/exams/{exam_id}/questions/import")
async def import_questions(
    exam_id: int,
    import_data: QuestionImport,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """通过 JSON 数据批量导入题目到指定考试，仅教师/管理员可调用；教师需具备该考试的管理权限。"""
    await _ensure_teacher_can_manage_exam(db, current_user, exam_id)
    questions = await batch_create_questions(
        db, exam_id, [q.model_dump() for q in import_data.questions]
    )
    questions_data = [QuestionResponse.model_validate(q).model_dump() for q in questions]
    return success_response(data=questions_data)

@router.put("/api/questions/{question_id}")
async def update_question_info(
    question_id: int,
    question_data: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """修改指定题目的内容，仅教师/管理员可调用；教师需具备题目所属考试的管理权限。"""
    question = await get_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, question.exam_id)
    question = await update_question(db, question_id, question_data.model_dump(exclude_unset=True))
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    return success_response(data=QuestionResponse.model_validate(question).model_dump())

@router.delete("/api/questions/{question_id}")
async def delete_question_info(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["teacher", "admin"]))
):
    """删除指定题目，仅教师/管理员可调用；教师需具备题目所属考试的管理权限。"""
    question = await get_question(db, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    await _ensure_teacher_can_manage_exam(db, current_user, question.exam_id)
    success = await delete_question(db, question_id)
    if not success:
        raise HTTPException(status_code=404, detail="题目不存在")
    return success_response(message="删除成功")