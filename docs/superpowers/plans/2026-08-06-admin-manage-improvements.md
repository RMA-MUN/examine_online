# 管理员管理页增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复班级管理操作列溢出，为用户管理增加角色/班级筛选，为班级增加批量增删学生功能。

**Architecture:** 后端在 `user_service`/`class_service` 增加筛选与批量成员操作函数 + 两个新 API；前端在 `UserManage` 增加筛选区、新建 `ClassStudentsDrawer`（antd Transfer 双栏转移）并集成到 `ClassManage` 操作列。

**Tech Stack:** FastAPI + SQLAlchemy（后端）、React 19 + antd 6 + vitest（前端）、TDD。

## Global Constraints

- 后端测试用 `backend/.venv` 的 python，命令：`.venv\Scripts\python.exe -m pytest tests/<file> -q`（cwd=backend）
- 前端测试命令：`npx vitest run <path>`；构建：`npm run build`（cwd=frontend）
- 沿用现有测试模式：后端 API 测试用 `ASGITransport` + `app.dependency_overrides[get_db]` + `create_access_token` 构造 `_auth_header`；前端用 `vi.mock` API 层 + `render(<App>...)`
- 文件编码：**必须 UTF-8 无 BOM**；禁止用 PowerShell `Set-Content`（ANSI 损坏中文），用 edit/write 工具或 `[System.IO.File]::WriteAllText(path, content, UTF8NoBOM)`
- 提交用中文 commit message，风格：`feat: ...` / `fix: ...` / `test: ...`
- 后端 `get_users` 已有 `order_by(User.id)`，不得移除

---

### Task 1: 后端用户列表班级筛选（class_id 参数）

**Files:**
- Modify: `backend/app/services/user_service.py`（get_users 增加 class_id 条件）
- Modify: `backend/app/api/users.py`（list_users 增加 class_id Query 参数）
- Test: `backend/tests/test_user_class_filter.py`

**Interfaces:**
- Produces: `get_users(db, page=1, page_size=10, role=None, class_id=None)` —— class_id>0 筛该班、-1 筛未分配（`class_id IS NULL`）、None/0 不过滤
- Consumes: 无（独立可测）

- [ ] **Step 1: 写失败测试** `backend/tests/test_user_class_filter.py`

```python
"""用户列表班级筛选测试：class_id > 0 筛该班、-1 筛未分配、缺省返回全部。"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.user_service import get_users


async def _make_user(db: AsyncSession, username: str, class_id=None) -> User:
    user = User(username=username, password_hash="x", role="student", name=username, class_id=class_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_get_users_filters_by_class_id(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2", class_id=1)
    await _make_user(db, "s3", class_id=2)
    users, total = await get_users(db, class_id=1)
    assert total == 2
    assert {u.username for u in users} == {"s1", "s2"}


@pytest.mark.asyncio
async def test_get_users_filters_unassigned_with_minus_one(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    users, total = await get_users(db, class_id=-1)
    assert total == 1
    assert users[0].username == "s2"


@pytest.mark.asyncio
async def test_get_users_without_class_id_returns_all(db: AsyncSession):
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    users, total = await get_users(db)
    assert total == 2
```

- [ ] **Step 2: 运行测试确认失败**

Run: `.venv\Scripts\python.exe -m pytest tests/test_user_class_filter.py -q`（cwd=backend）
Expected: FAIL，`get_users()` 收到意外参数 class_id（TypeError）

- [ ] **Step 3: 实现 get_users 班级筛选**

`backend/app/services/user_service.py` 修改 get_users 签名与查询：

```python
async def get_users(db: AsyncSession, page: int = 1, page_size: int = 10, role: str = None, class_id: int = None):
    """分页查询用户列表，可按角色/班级过滤；class_id=-1 表示未分配班级。"""
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if class_id is not None and class_id != 0:
        if class_id == -1:
            query = query.where(User.class_id.is_(None))
        else:
            query = query.where(User.class_id == class_id)

    # 获取总数
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # 固定按 id 升序，保证分页顺序稳定（MySQL 无排序时顺序不确定）
    query = query.order_by(User.id)

    # 分页
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return users, total
```

- [ ] **Step 4: 加 API 层测试（追加到同一文件）**

```python
# ---- API 层 ----
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.utils.security import create_access_token


@pytest_asyncio.fixture
async def client(db: AsyncSession):
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _auth_header(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_api_users_class_id_filter(client, db: AsyncSession):
    admin = User(username="admin1", password_hash="x", role="admin", name="A")
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    await _make_user(db, "s1", class_id=1)
    await _make_user(db, "s2")
    resp = await client.get("/api/users?class_id=1", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 1
    resp = await client.get("/api/users?class_id=-1", headers=_auth_header(admin))
    assert resp.json()["data"]["total"] == 1
    assert resp.json()["data"]["items"][0]["username"] == "s2"
```

- [ ] **Step 5: 实现 API 参数** `backend/app/api/users.py`

list_users 函数签名改为：

```python
@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    role: Optional[str] = None,
    class_id: Optional[int] = Query(None, ge=-1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """分页获取用户列表，支持按角色、班级筛选，仅管理员可调用。"""
    users, total = await get_users(db, page, page_size, role, class_id)
```

- [ ] **Step 6: 运行两个测试文件确认全绿**

Run: `.venv\Scripts\python.exe -m pytest tests/test_user_class_filter.py -q`
Expected: 4 passed

- [ ] **Step 7: 回归 + 提交**

Run: `.venv\Scripts\python.exe -m pytest tests -q`（cwd=backend）——只允许出现既有失败 `test_dashboard_export.py::test_cors_exposes_content_disposition_header`

```bash
git add backend/app/services/user_service.py backend/app/api/users.py backend/tests/test_user_class_filter.py
git commit -m "feat: 用户列表支持按班级筛选（class_id 参数，-1 表示未分配）"
```

---

### Task 2: 后端班级学生批量管理接口

**Files:**
- Modify: `backend/app/schemas/class_.py`（新增 ClassStudentBatchRequest）
- Modify: `backend/app/services/class_service.py`（3 个新函数）
- Modify: `backend/app/api/admin_classes.py`（2 个新接口）
- Test: `backend/tests/test_class_students.py`

**Interfaces:**
- Consumes: Task 1 无依赖；依赖已有 `get_class_students(db, class_id)`
- Produces:
  - `get_available_students(db) -> list[User]`（role=student 且 class_id IS NULL）
  - `add_students_to_class(db, class_id, student_ids) -> int`（返回生效条数）
  - `remove_students_from_class(db, class_id, student_ids) -> int`
  - `POST /api/admin/classes/{class_id}/students/batch` body `{action: "add"|"remove", student_ids: [int]}` → `{updated: n}`
  - `GET /api/admin/classes/{class_id}/available-students` → `[{id, username, name}]`

- [ ] **Step 1: 写失败测试** `backend/tests/test_class_students.py`

```python
"""班级学生批量管理测试：可用学生列表、批量加入/移除、跨班保护。"""

from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.class_ import SchoolClass
from app.models.user import User
from app.services.class_service import (
    add_students_to_class, get_available_students, remove_students_from_class,
)
from app.utils.security import create_access_token


@pytest_asyncio.fixture
async def client(db: AsyncSession):
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _auth_header(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


async def _make_class(db: AsyncSession, name="计科2401") -> SchoolClass:
    cls = SchoolClass(name=name)
    db.add(cls)
    await db.commit()
    await db.refresh(cls)
    return cls


async def _make_user(db: AsyncSession, username: str, role="student", class_id=None) -> User:
    user = User(username=username, password_hash="x", role=role, name=username, class_id=class_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_get_available_students_only_unassigned(db: AsyncSession):
    cls = await _make_class(db)
    await _make_user(db, "s1", class_id=cls.id)
    await _make_user(db, "s2")
    available = await get_available_students(db)
    assert [u.username for u in available] == ["s2"]


@pytest.mark.asyncio
async def test_add_students_skips_invalid_and_non_student(db: AsyncSession):
    cls = await _make_class(db)
    s1 = await _make_user(db, "s1")
    t1 = await _make_user(db, "t1", role="teacher")
    updated = await add_students_to_class(db, cls.id, [s1.id, t1.id, 9999])
    assert updated == 1
    await db.refresh(s1)
    assert s1.class_id == cls.id


@pytest.mark.asyncio
async def test_remove_students_only_affects_this_class(db: AsyncSession):
    cls_a = await _make_class(db, "A班")
    cls_b = await _make_class(db, "B班")
    s1 = await _make_user(db, "s1", class_id=cls_a.id)
    s2 = await _make_user(db, "s2", class_id=cls_b.id)
    updated = await remove_students_from_class(db, cls_a.id, [s1.id, s2.id])
    assert updated == 1
    await db.refresh(s1)
    await db.refresh(s2)
    assert s1.class_id is None
    assert s2.class_id == cls_b.id


@pytest.mark.asyncio
async def test_api_batch_add_and_remove(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    cls = await _make_class(db)
    s1 = await _make_user(db, "s1")
    s2 = await _make_user(db, "s2")

    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "add", "student_ids": [s1.id, s2.id]},
        headers=_auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["updated"] == 2

    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "remove", "student_ids": [s1.id]},
        headers=_auth_header(admin),
    )
    assert resp.json()["data"]["updated"] == 1

    resp = await client.get(f"/api/admin/classes/{cls.id}/students", headers=_auth_header(admin))
    assert [s["username"] for s in resp.json()["data"]] == ["s2"]


@pytest.mark.asyncio
async def test_api_available_students(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    cls = await _make_class(db)
    await _make_user(db, "s1", class_id=cls.id)
    await _make_user(db, "s2")
    resp = await client.get(f"/api/admin/classes/{cls.id}/available-students", headers=_auth_header(admin))
    assert resp.status_code == 200
    assert [s["username"] for s in resp.json()["data"]] == ["s2"]


@pytest.mark.asyncio
async def test_api_batch_rejects_missing_class(client, db: AsyncSession):
    admin = await _make_user(db, "admin1", role="admin")
    resp = await client.post(
        "/api/admin/classes/9999/students/batch",
        json={"action": "add", "student_ids": [1]},
        headers=_auth_header(admin),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_api_batch_rejects_non_admin(client, db: AsyncSession):
    teacher = await _make_user(db, "t1", role="teacher")
    cls = await _make_class(db)
    resp = await client.post(
        f"/api/admin/classes/{cls.id}/students/batch",
        json={"action": "add", "student_ids": [1]},
        headers=_auth_header(teacher),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: 运行测试确认失败**

Run: `.venv\Scripts\python.exe -m pytest tests/test_class_students.py -q`（cwd=backend）
Expected: FAIL（ImportError: cannot import name 'get_available_students'）

- [ ] **Step 3: 实现 schema** `backend/app/schemas/class_.py` 追加：

```python
from typing import Literal

class ClassStudentBatchRequest(BaseModel):
    """批量增删班级学生请求体。"""
    action: Literal["add", "remove"]
    student_ids: list[int]
```

- [ ] **Step 4: 实现 service 函数** `backend/app/services/class_service.py` 追加：

```python
async def get_available_students(db: AsyncSession) -> List[User]:
    """获取未分配班级的学生（供批量加入班级时选择）。"""
    result = await db.execute(
        select(User).where(User.role == "student", User.class_id.is_(None)).order_by(User.id)
    )
    return list(result.scalars().all())


async def add_students_to_class(db: AsyncSession, class_id: int, student_ids: List[int]) -> int:
    """将学生批量加入班级（仅 role=student 且存在的用户生效）。

    :return: 实际生效条数
    """
    updated = 0
    for student_id in student_ids:
        student = await db.get(User, student_id)
        if student and student.role == "student":
            student.class_id = class_id
            updated += 1
    await db.commit()
    return updated


async def remove_students_from_class(db: AsyncSession, class_id: int, student_ids: List[int]) -> int:
    """将学生从班级移除（仅清空当前属于该班级的学生，其他班级不受影响）。

    :return: 实际生效条数
    """
    updated = 0
    for student_id in student_ids:
        student = await db.get(User, student_id)
        if student and student.class_id == class_id:
            student.class_id = None
            updated += 1
    await db.commit()
    return updated
```

- [ ] **Step 5: 实现 API 接口** `backend/app/api/admin_classes.py`

追加 import 与两个接口（文件顶部 import 处补充 `ClassStudentBatchRequest` 和 service 函数）：

```python
@router.get("/api/admin/classes/{class_id}/available-students")
async def list_available_students(
    class_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """获取未分配班级的学生列表，供批量加入班级时选择，仅管理员可调用。"""
    students = await get_available_students(db)
    return success_response(data=[
        {"id": s.id, "username": s.username, "name": s.name} for s in students
    ])


@router.post("/api/admin/classes/{class_id}/students/batch")
async def batch_update_class_students(
    class_id: int,
    data: ClassStudentBatchRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(["admin"])),
):
    """批量加入/移除班级学生，仅管理员可调用。"""
    if not await db.get(SchoolClass, class_id):
        return error_response(message="班级不存在", code=404)
    if data.action == "add":
        updated = await add_students_to_class(db, class_id, data.student_ids)
    else:
        updated = await remove_students_from_class(db, class_id, data.student_ids)
    return success_response(data={"updated": updated})
```

注意：`error_response` 当前签名是否支持 code 参数——若只支持 message，则改用 `raise HTTPException(status_code=404, detail="班级不存在")`（参考 `admin_classes.py` 现有 delete 接口的 error_response 用法，保持一致风格；若 error_response 返回 200，则此处应改用 HTTPException）。

- [ ] **Step 6: 运行测试确认全绿**

Run: `.venv\Scripts\python.exe -m pytest tests/test_class_students.py -q`（cwd=backend）
Expected: 7 passed

- [ ] **Step 7: 回归 + 提交**

Run: `.venv\Scripts\python.exe -m pytest tests -q`（cwd=backend）

```bash
git add backend/app/schemas/class_.py backend/app/services/class_service.py backend/app/api/admin_classes.py backend/tests/test_class_students.py
git commit -m "feat: 班级学生批量增删接口（available-students + students/batch）"
```

---

### Task 3: 前端班级操作列修复 + 用户管理筛选

**Files:**
- Modify: `frontend/src/pages/Admin/ClassManage/index.tsx`（操作列 width/fixed）
- Modify: `frontend/src/pages/Admin/UserManage/index.tsx`（筛选区 + fetchUsers 参数）
- Test: `frontend/src/pages/Admin/UserManage/index.test.tsx`（追加筛选用例）

**Interfaces:**
- Consumes: Task 1 后端 `GET /api/users?class_id=`（前端 `getUsers` 已透传 params，无需改 api 层）
- Produces: UserManage 筛选用 `role`/`class_id` 状态；后续 Task 4 复用 `classes` 列表数据

- [ ] **Step 1: 写失败测试**（追加到 `frontend/src/pages/Admin/UserManage/index.test.tsx`）

在 describe 内追加两个用例（复用文件已有的 `makeUser`/`paginated`/`mockGetUsers`）：

```tsx
  it('选择角色筛选后按 role 重新请求', async () => {
    const firstPage = Array.from({ length: 3 }, (_, i) => makeUser(i + 1));
    mockGetUsers.mockResolvedValue(paginated(firstPage, 3));

    render(
      <App>
        <UserManage />
      </App>
    );

    await screen.findByText('demo_student_1');
    fireEvent.mouseDown(document.querySelector('.ant-select') as HTMLElement);
    fireEvent.click(await screen.findByTitle('学生'));
    fireEvent.click(screen.getByTitle('学生'));

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: 'student' })
      );
    });
  });

  it('选择班级筛选后按 class_id 重新请求并重置页码', async () => {
    const firstPage = Array.from({ length: 3 }, (_, i) => makeUser(i + 1));
    mockGetUsers.mockResolvedValue(paginated(firstPage, 3));

    render(
      <App>
        <UserManage />
      </App>
    );

    await screen.findByText('demo_student_1');
    const selects = document.querySelectorAll('.ant-select');
    fireEvent.mouseDown(selects[1] as HTMLElement);
    fireEvent.click(await screen.findByTitle('计科2401'));

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ class_id: 1 })
      );
    });
  });
```

注意：`getClasses` mock 需返回含班级 `{ id: 1, name: '计科2401' }` 的数据，在文件顶部 mock 中修改：

```tsx
vi.mock('../../../api/classes', () => ({
  getClasses: vi.fn().mockResolvedValue({
    data: { items: [{ id: 1, name: '计科2401', grade: '2024级', description: null, created_at: '2026-01-01T00:00:00' }], total: 1 },
  }),
}));
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pages/Admin/UserManage`（cwd=frontend）
Expected: 新增 2 个用例 FAIL（组件无筛选 Select）

- [ ] **Step 3: 实现 UserManage 筛选区**

`frontend/src/pages/Admin/UserManage/index.tsx`：

1. import 增加 `Select`（若已 import 则跳过）、`useMemo` 视需要
2. 状态：

```tsx
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>(undefined);
  const [classFilter, setClassFilter] = useState<number | undefined>(undefined);
```

3. fetchUsers 改为携带筛选（保留分页），并通过单一 effect 驱动（筛选或页码变化时自动请求，避免 setState 异步读取旧值）：

```tsx
  const fetchUsers = useCallback(async (p: number = 1, ps: number = 10) => {
    setLoading(true);
    try {
      const res = await getUsers({
        page: p,
        page_size: ps,
        role: roleFilter,
        class_id: classFilter,
      });
      setUsers(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(p);
      setPageSize(ps);
    } catch (error) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [message, roleFilter, classFilter]);

  useEffect(() => {
    fetchUsers(page, pageSize);
  }, [fetchUsers, page, pageSize]);
```

注意：删除原文件里现有的 `useEffect(() => { fetchUsers(); }, [fetchUsers]);`（被上面的 effect 取代），并移除 fetchUsers 原调用处对无参调用的依赖。

4. 筛选变更处理（重置到第一页，由 effect 自动触发请求）：

```tsx
  const handleRoleFilterChange = (value: UserRole | undefined) => {
    setRoleFilter(value);
    setPage(1);
  };

  const handleClassFilterChange = (value: number | undefined) => {
    setClassFilter(value);
    setPage(1);
  };
```

5. PageCard 上方插入筛选区（在 `<PageCard>` 内、Table 之前）：

```tsx
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            allowClear
            placeholder="按角色筛选"
            style={{ width: 140 }}
            value={roleFilter}
            onChange={handleRoleFilterChange}
            options={[
              { value: 'student', label: '学生' },
              { value: 'teacher', label: '教师' },
              { value: 'admin', label: '管理员' },
            ]}
          />
          <Select
            allowClear
            placeholder="按班级筛选"
            style={{ width: 180 }}
            value={classFilter}
            onChange={handleClassFilterChange}
            options={[
              { value: -1, label: '未分配班级' },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Space>
```

注意：antd Select `allowClear` 清空时 onChange 收到 `undefined`；`value` 类型 `UserRole | undefined` 与 antd 泛型冲突时，将 Select 泛型写为 `value={roleFilter as string | undefined}` 或直接去掉显式泛型即可。项目 TS 需 `npx tsc --noEmit` 通过。

- [ ] **Step 4: 实现 ClassManage 操作列修复**

`frontend/src/pages/Admin/ClassManage/index.tsx` 操作列：

```tsx
    {
      title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除该班级？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
```

- [ ] **Step 5: 运行测试确认全绿**

Run: `npx vitest run src/pages/Admin/UserManage`（cwd=frontend）
Expected: 4 passed（原有 2 + 新增 2）

- [ ] **Step 6: typecheck + 提交**

Run: `npx tsc --noEmit`（cwd=frontend），Expected: exit 0

```bash
git add frontend/src/pages/Admin/ClassManage/index.tsx frontend/src/pages/Admin/UserManage/index.tsx frontend/src/pages/Admin/UserManage/index.test.tsx
git commit -m "feat: 用户管理增加角色/班级筛选，班级操作列布局修复"
```

---

### Task 4: 前端班级学生双栏转移抽屉

**Files:**
- Modify: `frontend/src/api/classes.ts`（新增 2 个 API 函数 + 类型）
- Create: `frontend/src/components/ClassStudentsDrawer/index.tsx`
- Create: `frontend/src/components/ClassStudentsDrawer/index.css`
- Modify: `frontend/src/pages/Admin/ClassManage/index.tsx`（操作列加「学生」按钮 + 抽屉集成）
- Test: `frontend/src/components/ClassStudentsDrawer/index.test.tsx`

**Interfaces:**
- Consumes: Task 2 后端 `GET /api/admin/classes/{id}/available-students`、`POST /api/admin/classes/{id}/students/batch`；已有 `getClassStudents`；`types/class.ts` 的 `Class` 类型
- Produces: `<ClassStudentsDrawer open onClose classId className? onChanged />`；`getAvailableStudents(classId)`、`batchUpdateClassStudents(classId, action, studentIds)`

- [ ] **Step 1: 写失败测试** `frontend/src/components/ClassStudentsDrawer/index.test.tsx`

```tsx
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClassStudentsDrawer from './index';
import { batchUpdateClassStudents, getAvailableStudents, getClassStudents } from '../../api/classes';

vi.mock('../../api/classes', () => ({
  getClassStudents: vi.fn(),
  getAvailableStudents: vi.fn(),
  batchUpdateClassStudents: vi.fn(),
}));

const mockGetClassStudents = getClassStudents as Mock;
const mockGetAvailableStudents = getAvailableStudents as Mock;
const mockBatch = batchUpdateClassStudents as Mock;

const student = (id: number, name: string) => ({ id, username: `user_${id}`, name });

describe('ClassStudentsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClassStudents.mockResolvedValue({ data: [student(1, '张三'), student(2, '李四')] });
    mockGetAvailableStudents.mockResolvedValue({ data: [student(3, '王五')] });
    mockBatch.mockResolvedValue({ data: { updated: 1 } });
  });

  it('打开时加载班级学生与可加入学生', async () => {
    render(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={1} className="计科2401" />
      </App>
    );

    expect(await screen.findByText('张三( user_1 )'.replace(' ', ''))).toBeDefined();
    await waitFor(() => {
      expect(mockGetClassStudents).toHaveBeenCalledWith(1);
      expect(mockGetAvailableStudents).toHaveBeenCalledWith(1);
    });
  });

  it('移动学生到右侧触发批量加入接口', async () => {
    render(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={1} className="计科2401" />
      </App>
    );

    await screen.findByText(/王五/);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByTitle('向右移动'));

    await waitFor(() => {
      expect(mockBatch).toHaveBeenCalledWith(1, 'add', expect.arrayContaining([3]));
    });
  });
});
```

注意：antd Transfer 默认把 title 渲染为 `名称 - key`（用 `rowKey` 时显示为自定义 `{label} ({value})` 格式），断言以实际渲染为准——用 `/王五/` 正则匹配即可；`getByTitle('向右移动')` 依赖 antd 中文 locale（`zhCN` 已在 `App.tsx` ConfigProvider 注入，但组件测试需自行包 `ConfigProvider locale={zhCN}`，本测试用 `App` 包裹不够时在 render 外层追加 ConfigProvider）。移动按钮 title 在 antd 中为 `向右移动`/`向左移动`，若与版本不一致，改用 `screen.getAllByRole('button')` 内查找带箭头 icon 的按钮。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/ClassStudentsDrawer`（cwd=frontend）
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 api 函数** `frontend/src/api/classes.ts` 追加：

```tsx
export interface ClassStudent {
  id: number;
  username: string;
  name: string;
}

export const getClassStudents = (id: number): Promise<ApiResponse<ClassStudent[]>> =>
  axios.get(`/api/admin/classes/${id}/students`) as Promise<ApiResponse<ClassStudent[]>>;

export const getAvailableStudents = (id: number): Promise<ApiResponse<ClassStudent[]>> =>
  axios.get(`/api/admin/classes/${id}/available-students`) as Promise<ApiResponse<ClassStudent[]>>;

export const batchUpdateClassStudents = (
  id: number,
  action: 'add' | 'remove',
  studentIds: number[]
): Promise<ApiResponse<{ updated: number }>> =>
  axios.post(`/api/admin/classes/${id}/students/batch`, { action, student_ids: studentIds }) as Promise<ApiResponse<{ updated: number }>>;
```

（删除文件中原有的重复 `getClassStudents` 旧定义，保留新类型版。）

- [ ] **Step 4: 实现组件** `frontend/src/components/ClassStudentsDrawer/index.tsx`

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { App, Drawer, Transfer } from 'antd';
import type { TransferProps } from 'antd';
import { batchUpdateClassStudents, getAvailableStudents, getClassStudents } from '../../api/classes';
import type { ClassStudent } from '../../api/classes';
import './index.css';

interface ClassStudentsDrawerProps {
  open: boolean;
  onClose: () => void;
  classId: number;
  className?: string;
  onChanged?: () => void;
}

interface TransferItem {
  key: number;
  title: string;
}

const toTransferItem = (s: ClassStudent): TransferItem => ({
  key: s.id,
  title: `${s.name} (${s.username})`,
});

const ClassStudentsDrawer = ({ open, onClose, classId, className, onChanged }: ClassStudentsDrawerProps) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<TransferItem[]>([]);
  const [targetKeys, setTargetKeys] = useState<number[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [inClass, available] = await Promise.all([
        getClassStudents(classId),
        getAvailableStudents(classId),
      ]);
      const inClassItems = (inClass.data || []).map(toTransferItem);
      const availableItems = (available.data || []).map(toTransferItem);
      setDataSource([...inClassItems, ...availableItems]);
      setTargetKeys(inClassItems.map((i) => i.key));
    } catch (error) {
      message.error('获取班级学生失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, classId]);

  const handleChange: TransferProps<TransferItem>['onChange'] = async (nextKeys) => {
    const next = new Set(nextKeys as number[]);
    const prev = new Set(targetKeys);
    const toAdd = dataSource.filter((i) => next.has(i.key) && !prev.has(i.key)).map((i) => i.key);
    const toRemove = dataSource.filter((i) => !next.has(i.key) && prev.has(i.key)).map((i) => i.key);

    if (toAdd.length > 0 || toRemove.length > 0) {
      try {
        if (toAdd.length > 0) {
          await batchUpdateClassStudents(classId, 'add', toAdd);
        }
        if (toRemove.length > 0) {
          await batchUpdateClassStudents(classId, 'remove', toRemove);
        }
        message.success('更新成功');
        onChanged?.();
      } catch (error) {
        message.error('更新失败');
      }
    }
    await load();
  };

  const options = useMemo(
    () => ({
      dataSource,
      targetKeys,
      onChange: handleChange,
      showSearch: true,
      filterOption: (input: string, item: TransferItem) =>
        item.title.toLowerCase().includes(input.toLowerCase()),
      titles: ['可加入学生', '班级学生'],
      render: (item: TransferItem) => item.title,
    }),
    [dataSource, targetKeys]
  );

  return (
    <Drawer
      title={className ? `管理班级学生：${className}` : '管理班级学生'}
      open={open}
      onClose={onClose}
      width={560}
    >
      <div className="class-students-transfer">
        <Transfer {...options} rowKey={(i) => i.key} />
      </div>
    </Drawer>
  );
};

export default ClassStudentsDrawer;
```

`frontend/src/components/ClassStudentsDrawer/index.css`：

```css
.class-students-transfer .ant-transfer {
  width: 100%;
}

.class-students-transfer .ant-transfer-list {
  flex: 1;
  min-height: 320px;
}
```

- [ ] **Step 5: 集成到 ClassManage**

`frontend/src/pages/Admin/ClassManage/index.tsx`：

1. import：`TeamOutlined` 图标、`ClassStudentsDrawer`
2. 状态：`const [studentsDrawer, setStudentsDrawer] = useState<Class | null>(null);`
3. 操作列「操作」按钮组中编辑前插入：

```tsx
          <Button type="link" icon={<TeamOutlined />} onClick={() => setStudentsDrawer(record)}>学生</Button>
```

4. 操作列宽度调整 `180 → 240`（三个按钮）
5. 页面末尾（Modal 之后）插入：

```tsx
      <ClassStudentsDrawer
        open={!!studentsDrawer}
        onClose={() => setStudentsDrawer(null)}
        classId={studentsDrawer?.id ?? 0}
        className={studentsDrawer?.name}
        onChanged={() => fetchClasses()}
      />
```

- [ ] **Step 6: 运行测试确认全绿**

Run: `npx vitest run src/components/ClassStudentsDrawer src/pages/Admin/UserManage`（cwd=frontend）
Expected: ClassStudentsDrawer 2 passed；UserManage 4 passed

- [ ] **Step 7: typecheck + 全量前端测试 + 提交**

Run: `npx tsc --noEmit`；`npx vitest run`（cwd=frontend），Expected: typecheck 0、测试全部通过（19 suites）

```bash
git add frontend/src/api/classes.ts frontend/src/components/ClassStudentsDrawer frontend/src/pages/Admin/ClassManage/index.tsx
git commit -m "feat: 班级学生双栏转移抽屉（批量加入/移除学生）"
```

---

### Task 5: 全量回归验证

**Files:** 无

- [ ] **Step 1: 后端全量**

Run: `.venv\Scripts\python.exe -m pytest tests -q`（cwd=backend）
Expected: 仅既有失败 `test_dashboard_export.py::test_cors_exposes_content_disposition_header`，其余全绿

- [ ] **Step 2: 前端全量**

Run: `npx vitest run` + `npm run build` + `npx tsc --noEmit`（cwd=frontend）
Expected: 全绿 + build 成功 + typecheck 0

- [ ] **Step 3: 手动冒烟清单**（可选，有 dev 环境时）

- 用户管理：角色/班级筛选生效、翻页正常
- 班级管理：操作列三按钮完整显示；「学生」抽屉两栏加载、移动后刷新、班级表格随之刷新
- 用 `seed_large_demo_data.sql` 数据验证 60 名学生可在用户管理翻页找到

- [ ] **Step 4: 汇总提交（若存在遗漏文件）**

```bash
git status
git add -A
git commit -m "chore: 管理员管理页增强回归验证"
```

（无遗漏时跳过本步）
