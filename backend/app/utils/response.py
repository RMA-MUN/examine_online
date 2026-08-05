from typing import Any, Optional

"""统一响应格式模块：规范化成功、失败与分页响应的 JSON 结构。"""

def success_response(data: Any = None, message: str = "success") -> dict:
    """构造统一格式的成功响应。"""
    return {
        "code": 200,
        "message": message,
        "data": data
    }

def error_response(message: str = "error", code: int = 400) -> dict:
    """构造统一格式的错误响应。"""
    return {
        "code": code,
        "message": message,
        "data": None
    }

def paginated_response(items: list, total: int, page: int, page_size: int) -> dict:
    """构造统一格式的分页响应。"""
    return {
        "code": 200,
        "message": "success",
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    }
