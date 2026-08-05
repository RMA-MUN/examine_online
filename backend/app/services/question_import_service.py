"""题目批量导入服务：解析 Excel/Word 文件中的题目并逐行校验，收集错误信息。"""

import re
import io
from dataclasses import dataclass
from enum import Enum
from typing import Optional
from fastapi import UploadFile
from pydantic import BaseModel, field_validator


class QuestionType(str, Enum):
    """题目类型枚举，value 为模板中的中文标识。"""
    single = "单选"
    multiple = "多选"
    judge = "判断"
    blank = "填空"
    essay = "简答"


class QuestionImportItem(BaseModel):
    """导入题目的数据模型，字段级校验保证入库前数据合法。"""
    type: QuestionType
    content: str
    options: Optional[str] = None
    answer: str
    score: int
    analysis: Optional[str] = None

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v):
        """校验题目内容非空。"""
        if not v or not v.strip():
            raise ValueError("题目内容不能为空")
        return v.strip()

    @field_validator("answer")
    @classmethod
    def answer_not_empty(cls, v):
        """校验答案非空。"""
        if not v or not v.strip():
            raise ValueError("正确答案不能为空")
        return v.strip()

    @field_validator("score")
    @classmethod
    def score_positive(cls, v):
        """校验分值必须为正数。"""
        if v <= 0:
            raise ValueError("分值必须大于0")
        return v


@dataclass
class QuestionImportError:
    """单条导入错误的描述信息，row 为出错行号，便于用户定位。"""
    row: int
    type: str = ""
    content_preview: str = ""
    field: str = ""
    current_value: str = ""
    error: str = ""
    expected: str = ""


def _normalize_option(line: str) -> str:
    """去掉选项前的字母前缀（A. / A． / A、 / A ），库里只存选项内容。"""
    normalized = re.sub(r"^[A-Za-z][\.\．、\s]+", "", line).strip()
    return normalized if normalized else line


async def parse_excel(file: UploadFile) -> tuple[list[QuestionImportItem], list[QuestionImportError]]:
    """解析 Excel 文件中的题目。

    :return: 元组 (合法题目列表, 错误列表)；校验失败的题目不会进入合法列表
    """
    import openpyxl
    
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
    ws = wb.active

    questions = []
    errors = []

    # Skip header row
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    for row_idx, row in enumerate(rows, start=2):
        # Skip empty rows
        if not any(row):
            continue

        # 逐列取前 6 个字段，不足 6 列时补齐空字符串
        row_data = [str(cell).strip() if cell else "" for cell in row]
        type_str, content, options, answer, score_str, analysis = row_data[:6] if len(row_data) >= 6 else row_data + [""] * (6 - len(row_data))

        content_preview = content[:20] + "..." if len(content) > 20 else content

        # Validate type
        try:
            q_type = QuestionType(type_str)
        except ValueError:
            # 题型不在枚举范围内，记录错误并跳过该行
            errors.append(QuestionImportError(
                row=row_idx, type=type_str, content_preview=content_preview,
                field="题型", current_value=type_str,
                error="题型不正确", expected="单选/多选/判断/填空/简答"
            ))
            continue

        # Validate content
        if not content:
            errors.append(QuestionImportError(
                row=row_idx, type=type_str, content_preview="",
                field="题目内容", current_value="",
                error="题目内容不能为空"
            ))
            continue

        # Validate options for single/multiple choice
        if q_type in (QuestionType.single, QuestionType.multiple):
            if not options:
                errors.append(QuestionImportError(
                    row=row_idx, type=type_str, content_preview=content_preview,
                    field="选项", current_value="",
                    error="选择题必须填写选项"
                ))
                continue
            # Validate option format
            option_lines = [line.strip() for line in options.split("\n") if line.strip()]
            if len(option_lines) < 2:
                errors.append(QuestionImportError(
                    row=row_idx, type=type_str, content_preview=content_preview,
                    field="选项", current_value=options,
                    error="选项至少需要2个", expected="A.xxx\\nB.xxx\\nC.xxx\\nD.xxx"
                ))
                continue
            # Check format: each line should start with a letter
            for line in option_lines:
                if not re.match(r'^[A-Za-z][\.\．、\s]', line):
                    errors.append(QuestionImportError(
                        row=row_idx, type=type_str, content_preview=content_preview,
                        field="选项", current_value=line,
                        error="选项格式不正确，应以字母开头", expected="A.xxx"
                    ))
                    break
            else:
                # All options valid, normalize: strip leading letter prefix (A. / A． / A、 / A )
                options = "\n".join(_normalize_option(line) for line in option_lines)

        # Validate answer
        if not answer:
            errors.append(QuestionImportError(
                row=row_idx, type=type_str, content_preview=content_preview,
                field="答案", current_value="",
                error="答案不能为空"
            ))
            continue

        # Validate answer format by type
        answer = answer.strip()
        if q_type == QuestionType.single:
            # 单选答案必须是单个大写字母
            if not re.match(r'^[A-Z]$', answer):
                errors.append(QuestionImportError(
                    row=row_idx, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="单选题答案应为单个大写字母", expected="A"
                ))
                continue
        elif q_type == QuestionType.multiple:
            # 多选答案必须为多个大写字母的组合
            if not re.match(r'^[A-Z]+$', answer) or len(answer) < 2:
                errors.append(QuestionImportError(
                    row=row_idx, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="多选题答案应为多个大写字母组合", expected="AC 或 ABD"
                ))
                continue
        elif q_type == QuestionType.judge:
            # 判断题答案允许中英文多种写法，全部视为合法
            valid_judge = ["是", "对", "正确", "true", "True", "TRUE",
                          "错", "不对", "错误", "false", "False", "FALSE"]
            if answer not in valid_judge:
                errors.append(QuestionImportError(
                    row=row_idx, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="判断题答案格式不正确", expected="是/对/正确/True 或 错/不对/错误/False"
                ))
                continue

        # Validate score
        try:
            score = int(score_str) if score_str else 0
            if score <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            # 分值必须能转换为正整数，否则该行整题作废
            errors.append(QuestionImportError(
                row=row_idx, type=type_str, content_preview=content_preview,
                field="分值", current_value=score_str or "",
                error="分值必须是正整数", expected="大于0的整数"
            ))
            continue

        # Build question item
        question = QuestionImportItem(
            type=q_type,
            content=content.strip(),
            options=options if options else None,
            answer=answer,
            score=score,
            analysis=analysis.strip() if analysis else None
        )
        questions.append(question)

    wb.close()
    return questions, errors


async def parse_word(file: UploadFile) -> tuple[list[QuestionImportItem], list[QuestionImportError]]:
    """解析 Word 文件中的题目（以 --- 分隔的题目块，内含【题目】【选项】等标记）。

    :return: 元组 (合法题目列表, 错误列表)
    """
    from docx import Document
    
    content = await file.read()
    doc = Document(io.BytesIO(content))

    # Extract all text paragraphs
    full_text = "\n".join([p.text for p in doc.paragraphs])

    # Split by --- separator
    # 每个以 --- 分隔的文本块视为一道完整的题目
    blocks = re.split(r'\n---\n|\r\n---\r\n|\n---\r\n|\r\n---\n', full_text)

    questions = []
    errors = []

    for block_idx, block in enumerate(blocks):
        block = block.strip()
        if not block:
            continue

        row = block_idx + 1  # For error reporting

        # Extract fields using regex
        # 正则提取【题目】【选项】【答案】【分值】【解析】各标记下的内容
        type_match = re.search(r'【题目】(.+?)(?=【|$)', block, re.DOTALL)
        content = type_match.group(1).strip() if type_match else ""

        options_match = re.search(r'【选项】(.+?)(?=【|$)', block, re.DOTALL)
        options_raw = options_match.group(1).strip() if options_match else ""

        answer_match = re.search(r'【答案】(.+?)(?=【|$)', block, re.DOTALL)
        answer = answer_match.group(1).strip() if answer_match else ""

        score_match = re.search(r'【分值】(.+?)(?=【|$)', block, re.DOTALL)
        score_str = score_match.group(1).strip() if score_match else ""

        analysis_match = re.search(r'【解析】(.+?)(?=【|$)', block, re.DOTALL)
        analysis = analysis_match.group(1).strip() if analysis_match else ""

        # Try to detect question type from section header or content
        # 优先从块内的小节标题/提示词推断题型
        type_str = ""
        type_patterns = [
            (r'一、单选题|单选题?', "单选"),
            (r'二、多选题|多选题?', "多选"),
            (r'三、判断题|判断题?', "判断"),
            (r'四、填空题|填空题?', "填空"),
            (r'五、简答题|简答题?', "简答"),
        ]
        for pattern, q_type in type_patterns:
            if re.search(pattern, block):
                type_str = q_type
                break

        # If no type found in block, try to infer from answer format
        # 无法识别时根据答案格式回退推断：单个大写字母为单选、多个为多选、对/错为判断
        if not type_str:
            if re.match(r'^[A-Z]$', answer):
                type_str = "单选"
            elif re.match(r'^[A-Z]+$', answer) and len(answer) >= 2:
                type_str = "多选"
            elif answer in ["是", "对", "正确", "true", "True", "TRUE",
                           "错", "不对", "错误", "false", "False", "FALSE"]:
                type_str = "判断"
            elif not options_raw:
                # No options, could be blank or essay
                # 无选项时：题干含下划线/“填空”字样判为填空，否则视为简答
                if "____" in content or "填空" in content:
                    type_str = "填空"
                else:
                    type_str = "简答"

        content_preview = content[:20] + "..." if len(content) > 20 else content

        # Validate type
        try:
            q_type = QuestionType(type_str) if type_str else None
        except ValueError:
            q_type = None

        if not q_type:
            errors.append(QuestionImportError(
                row=row, type=type_str, content_preview=content_preview,
                field="题型", current_value=type_str or "未识别",
                error="无法识别题型，请在题目块中添加题型标记或确保答案格式正确",
                expected="单选/多选/判断/填空/简答"
            ))
            continue

        # Validate content
        if not content:
            errors.append(QuestionImportError(
                row=row, type=type_str, content_preview="",
                field="题目内容", current_value="",
                error="题目内容不能为空"
            ))
            continue

        # Process options
        options = None
        if options_raw:
            option_lines = [line.strip() for line in options_raw.split("\n") if line.strip()]
            if len(option_lines) < 2:
                errors.append(QuestionImportError(
                    row=row, type=type_str, content_preview=content_preview,
                    field="选项", current_value=options_raw,
                    error="选项至少需要2个", expected="A.xxx\\nB.xxx\\nC.xxx\\nD.xxx"
                ))
                continue
            # Check format
            for line in option_lines:
                if not re.match(r'^[A-Za-z][\.\．、\s]', line):
                    errors.append(QuestionImportError(
                        row=row, type=type_str, content_preview=content_preview,
                        field="选项", current_value=line,
                        error="选项格式不正确，应以字母开头", expected="A.xxx"
                    ))
                    break
            else:
                # 全部选项合法后统一去除字母前缀，只保留选项内容
                options = "\n".join(_normalize_option(line) for line in option_lines)

        # Validate options required for choice questions
        if q_type in (QuestionType.single, QuestionType.multiple) and not options:
            errors.append(QuestionImportError(
                row=row, type=type_str, content_preview=content_preview,
                field="选项", current_value="",
                error="选择题必须填写选项"
            ))
            continue

        # Validate answer
        if not answer:
            errors.append(QuestionImportError(
                row=row, type=type_str, content_preview=content_preview,
                field="答案", current_value="",
                error="答案不能为空"
            ))
            continue

        # Validate answer format by type
        if q_type == QuestionType.single:
            if not re.match(r'^[A-Z]$', answer):
                errors.append(QuestionImportError(
                    row=row, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="单选题答案应为单个大写字母", expected="A"
                ))
                continue
        elif q_type == QuestionType.multiple:
            if not re.match(r'^[A-Z]+$', answer) or len(answer) < 2:
                errors.append(QuestionImportError(
                    row=row, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="多选题答案应为多个大写字母组合", expected="AC 或 ABD"
                ))
                continue
        elif q_type == QuestionType.judge:
            valid_judge = ["是", "对", "正确", "true", "True", "TRUE",
                          "错", "不对", "错误", "false", "False", "FALSE"]
            if answer not in valid_judge:
                errors.append(QuestionImportError(
                    row=row, type=type_str, content_preview=content_preview,
                    field="答案", current_value=answer,
                    error="判断题答案格式不正确", expected="是/对/正确/True 或 错/不对/错误/False"
                ))
                continue

        # Validate score
        try:
            score = int(score_str) if score_str else 0
            if score <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            errors.append(QuestionImportError(
                row=row, type=type_str, content_preview=content_preview,
                field="分值", current_value=score_str or "",
                error="分值必须是正整数", expected="大于0的整数"
            ))
            continue

        # Build question item
        question = QuestionImportItem(
            type=q_type,
            content=content,
            options=options,
            answer=answer,
            score=score,
            analysis=analysis if analysis else None
        )
        questions.append(question)

    return questions, errors


def get_import_summary(questions: list[QuestionImportItem]) -> dict:
    """统计解析结果：题目总数与各题型数量。"""
    type_counts = {}
    for q in questions:
        type_name = q.type.value
        type_counts[type_name] = type_counts.get(type_name, 0) + 1
    return {
        "total": len(questions),
        "type_counts": type_counts
    }