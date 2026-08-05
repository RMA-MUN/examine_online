# 学生考试完成状态与结果详情设计

日期：2026-08-05
状态：已批准

## 背景

同步上游代码并完成数据库迁移后，学生端存在两个问题，并新增一个需求：

1. **进入已提交考试报错**：学生点击已提交的考试卡片，前端仍跳转到答题页，`getPaper` 从 Redis 取不到缓存（提交时已删除）后报"获取试卷失败"并跳回仪表盘。
2. **考试列表状态语义不符**：卡片右上角标签按考试时间（未开始/进行中/已结束）显示，用户希望显示学生对考试的实际完成状态。
3. **新需求**：学生可以在前端查看自己的考试结果详情（每题得分、标准答案、AI 批改结果），只能查看不能修改；后端接口需做相应权限限制。

## 根因分析

**问题 1 失败链**：

1. `handleStart`（`frontend/src/pages/Student/ExamList/index.tsx:24`）调用 `startExam`，后端返回 **HTTP 200 但 `code:400`**（"已参加过该考试"，见 `backend/app/services/exam_student_service.py:55`），前端不检查 `code` 字段，仍 `navigate` 到答题页。
2. 答题页 `getPaper`（`backend/app/services/exam_student_service.py:114`）完全依赖 Redis 缓存 `exam:paper:{exam_id}:{student_id}`，缓存丢失即返回错误；前端 `res.data.saved_answers` 对 null 解引用抛错 → "获取试卷失败" → 跳回仪表盘（`frontend/src/pages/Student/ExamTaking/index.tsx:100-103`）。
3. 该问题同样影响 **Redis 重启后所有进行中的考试**（缓存全部丢失）。

**问题 2**：`getExamDisplayStatus`（`frontend/src/pages/Student/ExamList/utils.ts:15`）仅按 `start_time`/`end_time` 判断时间状态，与学生对考试的实际参与状态无关。

## 设计

### A. 考试列表卡片显示完成状态

**后端**：

- `backend/app/services/exam_service.py::get_student_eligible_exams`：对筛选出的合格考试，一次查询该学生的 `ExamRecord`（`ExamRecord.student_id == student_id` 且 `exam_id IN (...)`, 按 `exam_id` 聚合），将 `status` 映射附加到每个 Exam 对象上：`exam.student_record_status = status`（无记录则为 `None`）。
- `backend/app/schemas/exam.py::ExamResponse` 增加字段 `student_record_status: Optional[str] = None`（`ongoing`/`submitted`/`graded`/null），随列表序列化返回。

**前端**：

- `frontend/src/types/exam.ts`：`Exam` 增加 `student_record_status?: 'ongoing' | 'submitted' | 'graded' | null`。
- `frontend/src/pages/Student/ExamList/utils.ts`：重写 `getExamDisplayStatus` 为完成状态语义：

  | `student_record_status` | 显示 |
  |---|---|
  | `ongoing` | 进行中 |
  | `submitted` / `graded` | 已完成 |
  | 无（null） | 未参加 |

- `frontend/src/pages/Student/ExamList/index.tsx`：
  - 右上角 `StatusTag`：未参加 / 进行中 / 已完成。
  - 按钮：未参加→"开始考试"、进行中→"继续考试"、已完成→"已提交"（禁用）。
  - 已完成卡片整体不可点击。

### B. 进入考试失败链修复

**前端**：

- `handleStart`：检查 `res.code === 200` 才 `navigate`，否则 `message.error(res.message)` 不跳转（防御后端业务错误被当成功）。
- `ExamTaking` fetchPaper：`res.data` 为空时仅 `message.error`，不 `navigate('/')`（避免误跳仪表盘）。

**后端 `get_paper` 缓存回退**（`backend/app/services/exam_student_service.py`）：

1. Redis 无缓存时，查 `ExamRecord`（`student_id` + `exam_id`）：
   - 记录不存在或状态不是 `ongoing` → 返回错误（"考试未开始或已结束"）。
2. 确认 `ongoing` 后从数据库重建试卷：
   - `select(Question).where(Question.exam_id == exam_id)`，按 id 排序（原随机顺序不可恢复，内容一致）。
   - 按现有 `start_exam` 的格式重建 `paper_data` 并写回 Redis（`exam:paper:{exam_id}:{student_id}`，TTL 为 `exam.duration * 60`）。
3. 继续原有逻辑返回试卷（题目详情 + 已保存答案）。

### C. 学生查看考试结果详情（只读）

**后端新增接口**：`GET /api/records/{record_id}/result`（`backend/app/api/grading.py`，`require_role(["student"])`）

权限校验（`_ensure_student_owns_record`）：

1. 查 `ExamRecord`，不存在 → 404。
2. `record.student_id != current_user.id` → 403（越权）。
3. `record.status not in ("submitted", "graded")` → 403（进行中/未提交不可查看）。

返回数据：复用 `get_record_answers`（`backend/app/services/grading_service.py:63`），但在响应层过滤内部字段：

- 保留：题目（type/content/options/answer 标准答案/score）、学生答案（student_answer）、得分（score）、是否正确（is_correct）、AI 批改（grading_source/ai_score/ai_feedback/ai_model/ai_graded_at）、grading_status。
- **剔除**：`last_error`（AI 任务内部错误信息）、`override_reason`（教师改分原因，属内部信息）。

实现方式：`grading_service.py` 新增 `get_my_record_answers(db, record_id, student_id)` 或在 API 层过滤。倾向在 service 层新增独立函数，避免影响教师端返回结构。

**权限核对（只读约束）**：

- 教师端接口（`GET /api/exams/{exam_id}/records`、`GET /api/records/{record_id}/answers`、grade/finalize/retry）均已 `require_role(["teacher", "admin"])`，学生无法访问——无需改动。
- 学生新接口只允许查看自己已提交/已批改的 record。

**前端 `MyRecords`**（`frontend/src/pages/Student/MyRecords/index.tsx`）：

- 表格增加"操作"列：查看详情按钮（仅 `submitted`/`graded` 记录可点，`ongoing` 禁用）。
- 点击打开只读抽屉（Drawer），展示每题详情：
  - 题号、题型、题目内容、选项（单选/多选）
  - 我的答案（判断题/填空题归一化展示原始输入）、标准答案
  - 得分、是否正确
  - AI 评分（score + 置信度/反馈文本，若 `grading_source == 'ai'` 或存在 `ai_score`）
- 无任何编辑/修改入口。
- 新增 API 封装：`frontend/src/api/grading.ts` 增加 `getMyRecordAnswers(recordId)`。

### D. 测试

**后端**（`backend/tests/`）：

- `test_get_paper_fallback`：mock Redis 无缓存 → 从 DB 重建成功、答案可读；record 已提交 → 返回错误。
- `test_student_exam_list_status`：`get_student_eligible_exams` 返回的记录带 `student_record_status`（ongoing/submitted/无记录三种）。
- `test_student_result_api`（沿用 `test_classes_api.py` 的 ASGITransport 模式）：
  - 学生查看自己的 submitted record → 200，含 AI 字段。
  - 学生查看他人的 record → 403。
  - 学生查看 ongoing record → 403。
  - 返回结构中不含 `last_error`/`override_reason`。
  - 教师角色访问新接口 → 403（`require_role(["student"])`，教师端详情走原有接口）。

**前端**：

- 更新 `frontend/src/pages/Student/ExamList/utils.test.ts` 覆盖新状态语义（未参加/进行中/已完成）。
- 后端测试用 `pytest` 运行；前端用 `react-scripts test`。

## 非目标（YAGNI）

- 不做"重新作答/复考"功能。
- 不做成绩导出、分享。
- 不改教师端阅卷接口与返回结构。
- 不恢复已提交考试的试卷缓存（提交后按规则不可再进入）。

## 实施顺序

1. 后端：`get_student_eligible_exams` + `ExamResponse` 字段（A）
2. 后端：`get_paper` 缓存回退（B）
3. 后端：学生结果详情接口（C）
4. 后端测试（D）
5. 前端：类型 + utils + 卡片状态（A）
6. 前端：`handleStart`/fetchPaper 修复（B）
7. 前端：MyRecords 详情抽屉（C）
8. 前端测试（D）
