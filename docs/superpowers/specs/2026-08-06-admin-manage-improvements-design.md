# 管理员管理页增强设计（用户筛选 / 班级操作列 / 班级学生批量管理）

日期：2026-08-06
状态：已评审

## 背景

管理员端三个体验/功能问题：

1. **班级管理页操作列溢出**：操作列宽 140px，「编辑」「删除」两个按钮在部分屏幕/数据下被挤出表格或截断。
2. **用户管理无筛选**：只能分页浏览全部用户，无法按角色、班级定位（例如查看某个班的所有学生）。
3. **班级缺少学生管理**：无法在班级维度批量调整学生归属（批量加入/移出学生）。

## 需求 1：班级管理操作列布局修复

**改动**：`frontend/src/pages/Admin/ClassManage/index.tsx` 操作列：

- `width: 140 → 180`
- 增加 `fixed: 'right'`，表格横向滚动时操作列固定在右侧不被挤出

按钮与逻辑不变（编辑 / 删除）。

## 需求 2：用户管理按角色 / 班级筛选

### 后端

`GET /api/users`（`backend/app/api/users.py`）新增查询参数：

- `role: Optional[str] = None`（已有）
- `class_id: Optional[int] = None`（新增）

`backend/app/services/user_service.py` 的 `get_users` 增加 `class_id` 条件：

| class_id 值 | SQL 条件 |
|---|---|
| 缺省 / 0 | 不过滤 |
| > 0 | `User.class_id == class_id` |
| -1 | `User.class_id.is_(None)`（未分配班级） |

保留原有 `order_by(User.id)` 分页顺序。

### 前端

`frontend/src/pages/Admin/UserManage/index.tsx`：

- PageCard 上方新增一行筛选区（`Space` 内两个 `Select`，`allowClear` 且不显示 "全部" 选项即可清除）：
  - 角色：全部 / 学生 / 教师 / 管理员
  - 班级：全部 / 未分配 / 各班级（数据复用已有 `getClasses` 拉取的列表）
- 任一筛选变更 → 重置 `page=1` 并以 `{ page, page_size, role?, class_id? }` 重新请求
- `getUsers`（`frontend/src/api/users.ts`）签名已支持透传 params，无需改动

## 需求 3：班级学生批量管理（双栏转移抽屉）

### 后端

`backend/app/api/admin_classes.py` 新增 2 个接口（均 `require_role(["admin"])`）：

1. `GET /api/admin/classes/{class_id}/available-students`
   - 返回 `role='student'` 且 `class_id IS NULL` 的学生
   - 响应：`[{ id, username, name }]`
2. `POST /api/admin/classes/{class_id}/students/batch`
   - body：`{ "action": "add" | "remove", "student_ids": [int] }`
   - `add`：对每个 id，学生存在且 `role='student'` 才把其 `class_id` 设为该班级；无效/非学生 id 跳过
   - `remove`：仅对 `class_id == 该班级` 的学生置空 `class_id`；其他学生不受影响
   - 响应：`{ "updated": n }`（实际生效条数）
   - 校验：班级不存在 → 404

`backend/app/services/class_service.py` 新增：

- `get_available_students(db) -> list[User]`
- `add_students_to_class(db, class_id, student_ids) -> int`
- `remove_students_from_class(db, class_id, student_ids) -> int`

`backend/app/schemas/class_.py` 新增 `ClassStudentBatchRequest`：

```python
class ClassStudentBatchRequest(BaseModel):
    action: Literal["add", "remove"]
    student_ids: list[int]
```

### 前端

`frontend/src/pages/Admin/ClassManage/index.tsx`：

- 操作列新增第三个按钮「学生」（`TeamOutlined` 图标），点击打开抽屉
- 新增组件 `frontend/src/components/ClassStudentsDrawer/index.tsx`：
  - antd `Drawer`（`title="管理班级学生"`，显示班级名）
  - 主体为 antd `Transfer`：
    - `dataSource`：班级学生 + 可用（未分配）学生合并，`key = id`，`title = 姓名(用户名)`，支持 `showSearch`（按用户名/姓名过滤）
    - `targetKeys`：当前属于该班级的学生 id
    - `onChange`：对比前后 targetKeys 计算差异 → 需要 add 的 id 调 `batch(add)`，需要 remove 的 id 调 `batch(remove)`，全部成功后刷新两侧列表与 targetKeys；任一失败提示错误并整体刷新还原
  - 打开抽屉时并行请求两个列表；分页后的班级列表不影响抽屉（接口全量返回该班/未分配学生）

`frontend/src/api/classes.ts` 新增：

- `getAvailableStudents(classId)`
- `batchUpdateClassStudents(classId, action, studentIds)`

## 错误处理

- 后端：班级不存在 → 404；非法 action → 422（Pydantic Literal）；无效学生 id 跳过不计入 `updated`
- 前端：请求失败 `message.error`；Transfer 批量操作部分失败时不落本地状态，刷新还原

## 测试

### 后端（pytest，沿用现有 aiosqlite + API client 模式）

`backend/tests/test_user_class_filter.py`：

- `get_users` 按 class_id 筛选：>0 命中该班、-1 命中未分配、缺省返回全部
- API 层 `GET /api/users?class_id=...` 与 `class_id=-1`

`backend/tests/test_class_students.py`：

- `available-students` 仅返回未分配学生
- batch add：学生加入班级；非学生角色跳过；无效 id 跳过；班级不存在 404
- batch remove：仅清空该班学生的 class_id，其他班级学生不受影响
- API 层：admin 可调用，非 admin 403

### 前端（vitest + @testing-library）

- `UserManage`：新增角色筛选、班级筛选变更触发重新请求（沿用现有 mock 模式）
- `ClassStudentsDrawer`：打开时请求两列表；移动学生触发 batch 接口调用（mock api 层）

## 非目标

- 不做学生跨班转移（移动已分配学生需先移除再加入）——本设计中已分配学生不在「可加入」列表
- 不修改 `GET /api/classes` 教师端接口
- 不做班级学生搜索的模糊过滤（Transfer 内置 showSearch 已覆盖）
