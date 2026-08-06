-- ============================================================================
-- 在线考试系统 数据库一键初始化脚本
-- 内容：创建数据库 -> 创建全部数据表（含老库自动补列迁移）-> 初始化演示数据
-- 特点：全程幂等、可重复执行
--   1) 所有 CREATE DATABASE / CREATE TABLE 均使用 IF NOT EXISTS；
--   2) 老库缺失的列 / 索引 / 外键通过 information_schema 检查后自动补齐；
--   3) 演示数据按"先清理本种子数据、再重新插入"的方式重置，多次执行结果一致。
-- 数据库默认名为 exam_system（可在 .env 的 DATABASE_URL 中修改，
--     FastAPI 启动时会按配置的库名自动建库）。
-- 所有演示账号登录密码均为：Password123!
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. 创建数据库
-- ----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS exam_system
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE exam_system;

-- ----------------------------------------------------------------------------
-- 2. 创建全部数据表（11 张，均 IF NOT EXISTS，顺序满足外键依赖）
-- ----------------------------------------------------------------------------

-- 2.1 班级
CREATE TABLE IF NOT EXISTS classes (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    grade VARCHAR(50) NULL,
    description TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.2 用户（学生 / 教师 / 管理员）
CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('student', 'teacher', 'admin') NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    phone VARCHAR(20) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    class_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    KEY idx_users_role (role),
    KEY ix_users_class_id (class_id),
    CONSTRAINT fk_users_class_id FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.3 课程
CREATE TABLE IF NOT EXISTS courses (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    teacher_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_courses_teacher (teacher_id),
    CONSTRAINT fk_courses_teacher FOREIGN KEY (teacher_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.4 教师-科目（课程）关联
CREATE TABLE IF NOT EXISTS teacher_subjects (
    id INT NOT NULL AUTO_INCREMENT,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_teacher_subjects_teacher_id (teacher_id),
    KEY ix_teacher_subjects_subject_id (subject_id),
    UNIQUE KEY uk_teacher_subject (teacher_id, subject_id),
    CONSTRAINT fk_teacher_subjects_teacher
        FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_subjects_subject
        FOREIGN KEY (subject_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.5 考试
CREATE TABLE IF NOT EXISTS exams (
    id INT NOT NULL AUTO_INCREMENT,
    course_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration INT NOT NULL,
    total_score INT NOT NULL DEFAULT 100,
    pass_score INT NOT NULL DEFAULT 60,
    random_order BOOLEAN DEFAULT TRUE,
    max_switch INT DEFAULT 3,
    status ENUM('draft', 'published', 'ongoing', 'finished') DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_exams_course (course_id),
    KEY idx_exams_status (status),
    CONSTRAINT fk_exams_course FOREIGN KEY (course_id) REFERENCES courses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.6 题目（含简答题 AI 评分要点 grading_rubric）
CREATE TABLE IF NOT EXISTS questions (
    id INT NOT NULL AUTO_INCREMENT,
    exam_id INT NOT NULL,
    type ENUM('single', 'multiple', 'judge', 'blank', 'essay') NOT NULL,
    content TEXT NOT NULL,
    options TEXT NULL,
    answer TEXT NULL,
    score INT NOT NULL DEFAULT 1,
    sort_order INT DEFAULT 0,
    analysis TEXT NULL,
    grading_rubric JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_questions_exam (exam_id),
    KEY idx_questions_type (type),
    CONSTRAINT fk_questions_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.7 考试记录
CREATE TABLE IF NOT EXISTS exam_records (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    exam_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    submit_time DATETIME NULL,
    score INT DEFAULT 0,
    status ENUM('ongoing', 'submitted', 'graded') DEFAULT 'ongoing',
    switch_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_student_exam (student_id, exam_id),
    KEY idx_records_student (student_id),
    KEY idx_records_exam (exam_id),
    CONSTRAINT fk_records_student FOREIGN KEY (student_id) REFERENCES users (id),
    CONSTRAINT fk_records_exam FOREIGN KEY (exam_id) REFERENCES exams (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.8 答题记录（含 AI 评分字段）
CREATE TABLE IF NOT EXISTS answers (
    id INT NOT NULL AUTO_INCREMENT,
    record_id INT NOT NULL,
    question_id INT NOT NULL,
    student_answer TEXT NULL,
    score INT DEFAULT 0,
    is_correct BOOLEAN NULL,
    graded_at DATETIME NULL,
    grader_id INT NULL,
    ai_score INT NULL,
    ai_feedback JSON NULL,
    ai_model VARCHAR(128) NULL,
    ai_graded_at DATETIME(6) NULL,
    grading_source ENUM('pending', 'ai', 'teacher', 'failed') NOT NULL DEFAULT 'pending',
    override_reason TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_record_question (record_id, question_id),
    KEY idx_answers_record (record_id),
    KEY idx_answers_question (question_id),
    CONSTRAINT fk_answers_record FOREIGN KEY (record_id) REFERENCES exam_records (id) ON DELETE CASCADE,
    CONSTRAINT fk_answers_question FOREIGN KEY (question_id) REFERENCES questions (id),
    CONSTRAINT fk_answers_grader FOREIGN KEY (grader_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.9 考试-班级关联
CREATE TABLE IF NOT EXISTS exam_classes (
    id INT NOT NULL AUTO_INCREMENT,
    exam_id INT NOT NULL,
    class_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_exam_classes_exam_id (exam_id),
    KEY ix_exam_classes_class_id (class_id),
    UNIQUE KEY uk_exam_class (exam_id, class_id),
    CONSTRAINT fk_exam_classes_exam
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_classes_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.10 考试-学生关联（班级范围外单独添加 / 排除）
CREATE TABLE IF NOT EXISTS exam_students (
    id INT NOT NULL AUTO_INCREMENT,
    exam_id INT NOT NULL,
    student_id INT NOT NULL,
    action VARCHAR(20) NOT NULL COMMENT 'include=额外添加, exclude=排除',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_exam_students_exam_id (exam_id),
    KEY ix_exam_students_student_id (student_id),
    UNIQUE KEY uk_exam_student (exam_id, student_id),
    CONSTRAINT fk_exam_students_exam
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_students_student
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.11 AI 评分任务队列
CREATE TABLE IF NOT EXISTS ai_grading_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    answer_id INT NOT NULL,
    status ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
    available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    locked_at DATETIME(6) NULL,
    locked_by VARCHAR(128) NULL,
    completed_at DATETIME(6) NULL,
    last_error TEXT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_grading_tasks_answer_id (answer_id),
    KEY ix_ai_grading_tasks_status_available_at (status, available_at),
    CONSTRAINT fk_ai_grading_tasks_answer
        FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. 老库兼容：缺失列 / 索引 / 外键自动补齐（全新安装时全部为无操作）
--    每个变更先查 information_schema，存在则跳过，可安全重复执行。
-- ----------------------------------------------------------------------------

-- 3.1 users.class_id 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'class_id') = 0,
    'ALTER TABLE users ADD COLUMN class_id INT NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.2 users.class_id 索引
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'ix_users_class_id') = 0,
    'CREATE INDEX ix_users_class_id ON users (class_id)',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.3 users.class_id 外键
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       AND CONSTRAINT_NAME = 'fk_users_class_id') = 0,
    'ALTER TABLE users ADD CONSTRAINT fk_users_class_id FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.4 questions.grading_rubric 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'grading_rubric') = 0,
    'ALTER TABLE questions ADD COLUMN grading_rubric JSON NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.5 answers.ai_score 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'ai_score') = 0,
    'ALTER TABLE answers ADD COLUMN ai_score INT NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.6 answers.ai_feedback 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'ai_feedback') = 0,
    'ALTER TABLE answers ADD COLUMN ai_feedback JSON NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.7 answers.ai_model 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'ai_model') = 0,
    'ALTER TABLE answers ADD COLUMN ai_model VARCHAR(128) NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.8 answers.ai_graded_at 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'ai_graded_at') = 0,
    'ALTER TABLE answers ADD COLUMN ai_graded_at DATETIME(6) NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.9 answers.grading_source 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'grading_source') = 0,
    'ALTER TABLE answers ADD COLUMN grading_source ENUM(''pending'',''ai'',''teacher'',''failed'') NOT NULL DEFAULT ''pending''',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.10 answers.override_reason 列
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'answers' AND COLUMN_NAME = 'override_reason') = 0,
    'ALTER TABLE answers ADD COLUMN override_reason TEXT NULL',
    'SELECT 1'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 3.11 历史人工评分的答案补齐来源标记
UPDATE answers
SET grading_source = 'teacher'
WHERE grader_id IS NOT NULL AND grading_source = 'pending';

-- ==== 演示数据（SEED） ====

-- ----------------------------------------------------------------------------
-- 4. 演示数据（可重复执行：先清理本种子数据再重新插入，结果一致）
-- ----------------------------------------------------------------------------

-- 4.1 计算机专业演示数据（小数据集：5 个账号 / 1 门课程 / 3 场考试）
START TRANSACTION;

-- Remove only this seed set, in foreign-key order.
DELETE a FROM answers a
JOIN exam_records r ON r.id = a.record_id
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username = 'seed_computer_teacher'
  AND e.title IN ('计算机网络原理综合测试', 'Python程序设计基础练习', 'Java面向对象程序设计结课考试');

DELETE r FROM exam_records r
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username = 'seed_computer_teacher'
  AND e.title IN ('计算机网络原理综合测试', 'Python程序设计基础练习', 'Java面向对象程序设计结课考试');

DELETE q FROM questions q
JOIN exams e ON e.id = q.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username = 'seed_computer_teacher'
  AND e.title IN ('计算机网络原理综合测试', 'Python程序设计基础练习', 'Java面向对象程序设计结课考试');

DELETE e FROM exams e
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username = 'seed_computer_teacher'
  AND e.title IN ('计算机网络原理综合测试', 'Python程序设计基础练习', 'Java面向对象程序设计结课考试');

DELETE c FROM courses c JOIN users t ON t.id = c.teacher_id
WHERE t.username = 'seed_computer_teacher' AND c.name = '计算机科学与编程实践';

DELETE FROM users WHERE username IN (
    'seed_computer_admin', 'seed_computer_teacher',
    'seed_computer_student_01', 'seed_computer_student_02', 'seed_computer_student_03'
);

-- All seeded users use Password123!.
INSERT INTO users (username, password_hash, role, name, email, phone, is_active) VALUES
('seed_computer_admin', '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO', 'admin', '计算机考试系统管理员', 'seed_computer_admin@example.com', '13800002001', 1),
('seed_computer_teacher', '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO', 'teacher', '张老师', 'seed_computer_teacher@example.com', '13800002002', 1),
('seed_computer_student_01', '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO', 'student', '李明', 'seed_computer_student_01@example.com', '13800002011', 1),
('seed_computer_student_02', '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO', 'student', '王芳', 'seed_computer_student_02@example.com', '13800002012', 1),
('seed_computer_student_03', '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO', 'student', '赵磊', 'seed_computer_student_03@example.com', '13800002013', 1);

SET @seed_teacher_id = (SELECT id FROM users WHERE username = 'seed_computer_teacher');
INSERT INTO courses (name, description, teacher_id) VALUES
('计算机科学与编程实践', '覆盖计算机网络、Python程序设计和Java面向对象编程的综合测试课程。', @seed_teacher_id);
SET @seed_course_id = (SELECT id FROM courses WHERE teacher_id = @seed_teacher_id AND name = '计算机科学与编程实践');
SET @seed_now = NOW();

INSERT INTO exams (course_id, title, description, start_time, end_time, duration, total_score, pass_score, random_order, max_switch, status) VALUES
(@seed_course_id, '计算机网络原理综合测试', '覆盖OSI模型、TCP/IP协议、子网划分和网络安全基础。', DATE_SUB(@seed_now, INTERVAL 1 HOUR), DATE_ADD(@seed_now, INTERVAL 7 DAY), 45, 100, 60, 0, 3, 'published'),
(@seed_course_id, 'Python程序设计基础练习', '草稿考试，用于测试教师端题目编辑和考试配置流程。', DATE_ADD(@seed_now, INTERVAL 7 DAY), DATE_ADD(@seed_now, INTERVAL 8 DAY), 30, 100, 60, 1, 2, 'draft'),
(@seed_course_id, 'Java面向对象程序设计结课考试', '已结束考试，用于测试成绩列表、阅卷和成绩展示。', DATE_SUB(@seed_now, INTERVAL 14 DAY), DATE_SUB(@seed_now, INTERVAL 13 DAY), 60, 100, 60, 1, 3, 'finished');

SET @published_exam_id = (SELECT id FROM exams WHERE course_id = @seed_course_id AND title = '计算机网络原理综合测试');
SET @draft_exam_id = (SELECT id FROM exams WHERE course_id = @seed_course_id AND title = 'Python程序设计基础练习');
SET @finished_exam_id = (SELECT id FROM exams WHERE course_id = @seed_course_id AND title = 'Java面向对象程序设计结课考试');

-- Published exam: 8 questions, 100 points, all five supported question types.
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@published_exam_id, 'single', '在TCP/IP模型中，负责端到端可靠传输的是哪一层？', '["网络接口层","网际层","传输层","应用层"]', 'C', 10, 1, '传输层通过TCP提供可靠、有序、面向连接的数据传输。'),
(@published_exam_id, 'single', 'IPv4地址192.168.1.10属于哪一类私有地址？', '["A类","B类","C类","D类"]', 'C', 10, 2, '192.168.0.0/16是常见的C类私有地址网段。'),
(@published_exam_id, 'multiple', '下列哪些协议属于应用层协议？', '["HTTP","DNS","FTP","TCP"]', 'ABC', 15, 3, 'HTTP、DNS和FTP位于应用层，TCP位于传输层。'),
(@published_exam_id, 'multiple', '下列哪些措施可以提高网络通信安全性？', '["使用HTTPS","启用防火墙","定期更新补丁","共享管理员密码"]', 'ABC', 15, 4, '加密传输、边界防护和及时修复漏洞都是基础安全措施。'),
(@published_exam_id, 'judge', 'TCP通过三次握手建立连接。', NULL, '正确', 10, 5, 'TCP连接建立过程包含SYN、SYN-ACK和ACK三个步骤。'),
(@published_exam_id, 'judge', 'UDP协议能够保证数据一定按顺序到达。', NULL, '错误', 10, 6, 'UDP不提供连接、可靠性和顺序保证。'),
(@published_exam_id, 'blank', 'Python中用于定义函数的关键字是____。', NULL, 'def', 10, 7, 'Python使用def关键字声明函数。'),
(@published_exam_id, 'essay', '简述从浏览器输入URL到页面显示的主要网络过程。', NULL, '浏览器解析URL，查询DNS获得服务器IP，建立TCP连接并在HTTPS场景完成TLS握手，发送HTTP请求，服务器返回响应，浏览器解析HTML、CSS和JavaScript并渲染页面。', 20, 8, '答案应覆盖DNS、TCP/TLS、HTTP请求响应以及浏览器渲染。');

-- Draft exam questions for teacher-side editing tests.
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@draft_exam_id, 'single', 'Python列表的下标默认从几开始？', '["0","1","-1","由列表长度决定"]', 'A', 20, 1, 'Python序列采用从0开始的索引。'),
(@draft_exam_id, 'multiple', '下列哪些是Java的面向对象特征？', '["封装","继承","多态","指针算术"]', 'ABC', 40, 2, '封装、继承和多态是面向对象程序设计的核心特征。'),
(@draft_exam_id, 'essay', '比较Python和Java在类型系统与运行方式上的主要差异。', NULL, 'Python通常采用动态类型并由解释器执行，Java是静态类型语言，源代码编译为字节码后运行在JVM上。', 40, 3, '考查两种语言的类型检查和执行模型。');

-- Finished exam questions used by submitted and graded records.
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@finished_exam_id, 'single', 'Java中用于创建对象的关键字是？', '["class","new","this","extends"]', 'B', 20, 1, 'new表达式用于实例化对象。'),
(@finished_exam_id, 'multiple', '下列哪些属于Java集合框架中的常用接口？', '["List","Set","Map","Thread"]', 'ABC', 20, 2, 'List、Set和Map是Java集合框架的核心接口。'),
(@finished_exam_id, 'judge', 'Java类可以通过extends关键字继承一个父类。', NULL, '正确', 20, 3, 'Java类支持单继承，使用extends声明父类。'),
(@finished_exam_id, 'blank', 'Java程序的入口方法通常是____。', NULL, 'main', 20, 4, '标准入口方法为public static void main(String[] args)。'),
(@finished_exam_id, 'essay', '说明面向对象设计中封装、继承和多态的含义。', NULL, '封装将数据和操作数据的方法组合并隐藏实现细节；继承让子类复用并扩展父类能力；多态允许同一接口在不同对象上表现出不同实现。', 20, 5, '完整答案应分别解释三个面向对象特征及其作用。');

SET @student_01_id = (SELECT id FROM users WHERE username = 'seed_computer_student_01');
SET @student_02_id = (SELECT id FROM users WHERE username = 'seed_computer_student_02');
SET @student_03_id = (SELECT id FROM users WHERE username = 'seed_computer_student_03');

-- Ongoing record for the published exam.
INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count) VALUES
(@student_01_id, @published_exam_id, DATE_SUB(@seed_now, INTERVAL 20 MINUTE), NULL, 0, 'ongoing', 1);
SET @ongoing_record_id = (SELECT id FROM exam_records WHERE student_id = @student_01_id AND exam_id = @published_exam_id);
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct)
SELECT @ongoing_record_id, id, 'C', 10, 1 FROM questions WHERE exam_id = @published_exam_id AND sort_order = 1;

-- Submitted record: objective questions scored, essay pending manual grading.
INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count) VALUES
(@student_02_id, @finished_exam_id, DATE_SUB(@seed_now, INTERVAL 10 DAY), DATE_ADD(DATE_SUB(@seed_now, INTERVAL 10 DAY), INTERVAL 48 MINUTE), 80, 'submitted', 0);
SET @submitted_record_id = (SELECT id FROM exam_records WHERE student_id = @student_02_id AND exam_id = @finished_exam_id);
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct) SELECT @submitted_record_id, id, 'B', 20, 1 FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 1;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct) SELECT @submitted_record_id, id, 'ABC', 20, 1 FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 2;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct) SELECT @submitted_record_id, id, '正确', 20, 1 FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 3;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct) SELECT @submitted_record_id, id, 'main', 20, 1 FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 4;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct) SELECT @submitted_record_id, id, '封装和继承可以复用代码。', 0, NULL FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 5;

-- Graded record: the essay has teacher metadata and partial credit.
INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count) VALUES
(@student_03_id, @finished_exam_id, DATE_SUB(@seed_now, INTERVAL 11 DAY), DATE_ADD(DATE_SUB(@seed_now, INTERVAL 11 DAY), INTERVAL 52 MINUTE), 92, 'graded', 2);
SET @graded_record_id = (SELECT id FROM exam_records WHERE student_id = @student_03_id AND exam_id = @finished_exam_id);
SET @grader_id = @seed_teacher_id;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, graded_at, grader_id) SELECT @graded_record_id, id, 'B', 20, 1, DATE_SUB(@seed_now, INTERVAL 10 DAY), @grader_id FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 1;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, graded_at, grader_id) SELECT @graded_record_id, id, 'ABC', 20, 1, DATE_SUB(@seed_now, INTERVAL 10 DAY), @grader_id FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 2;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, graded_at, grader_id) SELECT @graded_record_id, id, '正确', 20, 1, DATE_SUB(@seed_now, INTERVAL 10 DAY), @grader_id FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 3;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, graded_at, grader_id) SELECT @graded_record_id, id, 'main', 20, 1, DATE_SUB(@seed_now, INTERVAL 10 DAY), @grader_id FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 4;
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, graded_at, grader_id) SELECT @graded_record_id, id, '封装隐藏数据，继承复用父类，多态让同一接口有不同实现。', 12, NULL, DATE_SUB(@seed_now, INTERVAL 10 DAY), @grader_id FROM questions WHERE exam_id = @finished_exam_id AND sort_order = 5;

COMMIT;

-- 4.2 大型演示数据（60 学生 / 6 教师 / 5 班级 / 8 课程 / 10 场考试 / 约 2500 条答题记录）
SET @pw = '$2b$12$TKS7VJHhwGcT/fBCherTX.TNf/X4M26QTNqmTP8VQ8jG9TtYIUWIO';

START TRANSACTION;

-- =====================================================================
-- 1. 清理旧的 demo_ 数据（按外键依赖顺序）
-- =====================================================================
DELETE a FROM answers a
JOIN exam_records r ON r.id = a.record_id
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE r FROM exam_records r
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE q FROM questions q
JOIN exams e ON e.id = q.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE ec FROM exam_classes ec
JOIN exams e ON e.id = ec.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE ts FROM teacher_subjects ts
JOIN users t ON t.id = ts.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE e FROM exams e
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE c FROM courses c
JOIN users t ON t.id = c.teacher_id
WHERE t.username LIKE 'demo_teacher%';

DELETE FROM users WHERE username LIKE 'demo_%';

DELETE FROM classes
WHERE name IN ('计科2401班', '计科2402班', '计科2403班', '软件2401班', '软件2402班');

-- =====================================================================
-- 2. 班级
-- =====================================================================
INSERT INTO classes (name, grade, description) VALUES
('计科2401班', '2024级', '计算机科学与技术专业 2401 班'),
('计科2402班', '2024级', '计算机科学与技术专业 2402 班'),
('计科2403班', '2024级', '计算机科学与技术专业 2403 班'),
('软件2401班', '2024级', '软件工程专业 2401 班'),
('软件2402班', '2024级', '软件工程专业 2402 班');

SET @c01 = (SELECT id FROM classes WHERE name = '计科2401班');
SET @c02 = (SELECT id FROM classes WHERE name = '计科2402班');
SET @c03 = (SELECT id FROM classes WHERE name = '计科2403班');
SET @c04 = (SELECT id FROM classes WHERE name = '软件2401班');
SET @c05 = (SELECT id FROM classes WHERE name = '软件2402班');

-- =====================================================================
-- 3. 用户：1 管理员 + 6 教师
-- =====================================================================
INSERT INTO users (username, password_hash, role, name, email, phone, is_active) VALUES
('demo_admin',        @pw, 'admin',   '系统管理员', 'demo_admin@example.com',        '13800000001', 1),
('demo_teacher_01',   @pw, 'teacher', '王建国',     'demo_teacher_01@example.com',   '13800000002', 1),
('demo_teacher_02',   @pw, 'teacher', '李慧敏',     'demo_teacher_02@example.com',   '13800000003', 1),
('demo_teacher_03',   @pw, 'teacher', '张伟',       'demo_teacher_03@example.com',   '13800000004', 1),
('demo_teacher_04',   @pw, 'teacher', '刘洋',       'demo_teacher_04@example.com',   '13800000005', 1),
('demo_teacher_05',   @pw, 'teacher', '陈静',       'demo_teacher_05@example.com',   '13800000006', 1),
('demo_teacher_06',   @pw, 'teacher', '赵鹏',       'demo_teacher_06@example.com',   '13800000007', 1);

SET @t01 = (SELECT id FROM users WHERE username = 'demo_teacher_01');
SET @t02 = (SELECT id FROM users WHERE username = 'demo_teacher_02');
SET @t03 = (SELECT id FROM users WHERE username = 'demo_teacher_03');
SET @t04 = (SELECT id FROM users WHERE username = 'demo_teacher_04');
SET @t05 = (SELECT id FROM users WHERE username = 'demo_teacher_05');
SET @t06 = (SELECT id FROM users WHERE username = 'demo_teacher_06');

-- =====================================================================
-- 4. 用户：60 名学生（每班 12 人，班级通过 class_id 归属）
-- =====================================================================
INSERT INTO users (username, password_hash, role, name, email, phone, is_active, class_id)
SELECT s.username, @pw, 'student', s.name, CONCAT(s.username, '@example.com'), CONCAT('139', LPAD(s.n, 8, '0')), 1,
  CASE WHEN s.n <= 12 THEN @c01 WHEN s.n <= 24 THEN @c02 WHEN s.n <= 36 THEN @c03 WHEN s.n <= 48 THEN @c04 ELSE @c05 END
FROM (
  SELECT 'demo_student_01' AS username, '王浩然' AS name, 1 AS n UNION ALL
  SELECT 'demo_student_02', '李思雨', 2 UNION ALL
  SELECT 'demo_student_03', '张子轩', 3 UNION ALL
  SELECT 'demo_student_04', '刘欣怡', 4 UNION ALL
  SELECT 'demo_student_05', '陈天宇', 5 UNION ALL
  SELECT 'demo_student_06', '杨雨桐', 6 UNION ALL
  SELECT 'demo_student_07', '赵一鸣', 7 UNION ALL
  SELECT 'demo_student_08', '黄诗涵', 8 UNION ALL
  SELECT 'demo_student_09', '周俊杰', 9 UNION ALL
  SELECT 'demo_student_10', '吴佳慧', 10 UNION ALL
  SELECT 'demo_student_11', '徐浩宇', 11 UNION ALL
  SELECT 'demo_student_12', '孙雅婷', 12 UNION ALL
  SELECT 'demo_student_13', '马嘉诚', 13 UNION ALL
  SELECT 'demo_student_14', '朱雨薇', 14 UNION ALL
  SELECT 'demo_student_15', '胡文博', 15 UNION ALL
  SELECT 'demo_student_16', '郭晓彤', 16 UNION ALL
  SELECT 'demo_student_17', '林嘉豪', 17 UNION ALL
  SELECT 'demo_student_18', '何心怡', 18 UNION ALL
  SELECT 'demo_student_19', '高子航', 19 UNION ALL
  SELECT 'demo_student_20', '罗梦琪', 20 UNION ALL
  SELECT 'demo_student_21', '郑博文', 21 UNION ALL
  SELECT 'demo_student_22', '梁静怡', 22 UNION ALL
  SELECT 'demo_student_23', '谢明轩', 23 UNION ALL
  SELECT 'demo_student_24', '宋婉婷', 24 UNION ALL
  SELECT 'demo_student_25', '唐宇轩', 25 UNION ALL
  SELECT 'demo_student_26', '许梓萱', 26 UNION ALL
  SELECT 'demo_student_27', '韩志强', 27 UNION ALL
  SELECT 'demo_student_28', '冯思彤', 28 UNION ALL
  SELECT 'demo_student_29', '邓文杰', 29 UNION ALL
  SELECT 'demo_student_30', '曹雅琪', 30 UNION ALL
  SELECT 'demo_student_31', '彭宇航', 31 UNION ALL
  SELECT 'demo_student_32', '曾诗涵', 32 UNION ALL
  SELECT 'demo_student_33', '萧天佑', 33 UNION ALL
  SELECT 'demo_student_34', '田雨欣', 34 UNION ALL
  SELECT 'demo_student_35', '董俊熙', 35 UNION ALL
  SELECT 'demo_student_36', '袁梦洁', 36 UNION ALL
  SELECT 'demo_student_37', '潘志远', 37 UNION ALL
  SELECT 'demo_student_38', '蒋欣妍', 38 UNION ALL
  SELECT 'demo_student_39', '蔡俊豪', 39 UNION ALL
  SELECT 'demo_student_40', '余思敏', 40 UNION ALL
  SELECT 'demo_student_41', '杜文轩', 41 UNION ALL
  SELECT 'demo_student_42', '叶紫涵', 42 UNION ALL
  SELECT 'demo_student_43', '程志鹏', 43 UNION ALL
  SELECT 'demo_student_44', '苏婉清', 44 UNION ALL
  SELECT 'demo_student_45', '魏子墨', 45 UNION ALL
  SELECT 'demo_student_46', '夏雨薇', 46 UNION ALL
  SELECT 'demo_student_47', '钟浩然', 47 UNION ALL
  SELECT 'demo_student_48', '汪芷若', 48 UNION ALL
  SELECT 'demo_student_49', '范俊杰', 49 UNION ALL
  SELECT 'demo_student_50', '金梦瑶', 50 UNION ALL
  SELECT 'demo_student_51', '石宇航', 51 UNION ALL
  SELECT 'demo_student_52', '姚佳怡', 52 UNION ALL
  SELECT 'demo_student_53', '谭子涵', 53 UNION ALL
  SELECT 'demo_student_54', '廖欣怡', 54 UNION ALL
  SELECT 'demo_student_55', '邹志强', 55 UNION ALL
  SELECT 'demo_student_56', '熊思琪', 56 UNION ALL
  SELECT 'demo_student_57', '陆正阳', 57 UNION ALL
  SELECT 'demo_student_58', '郝梦婷', 58 UNION ALL
  SELECT 'demo_student_59', '孔祥瑞', 59 UNION ALL
  SELECT 'demo_student_60', '白若曦', 60
) s;

-- =====================================================================
-- 5. 课程与教师-课程关联
-- =====================================================================
INSERT INTO courses (name, description, teacher_id) VALUES
('计算机网络原理',   'TCP/IP、网络协议与网络安全基础。',      @t01),
('操作系统原理',     '进程、内存、文件与设备管理。',          @t02),
('数据结构与算法',   '线性表、树、图与常用算法。',            @t03),
('数据库原理与应用', '关系模型、SQL 与事务管理。',            @t04),
('Python程序设计',   'Python 语法、数据结构与常用库。',       @t05),
('Java程序设计',     '面向对象编程与 Java 集合框架。',        @t06),
('软件工程导论',     '软件过程、需求分析与测试方法。',        @t04),
('计算机组成原理',   'CPU、存储体系与指令系统。',             @t01);

SET @c1 = (SELECT id FROM courses WHERE name = '计算机网络原理' AND teacher_id = @t01);
SET @c2 = (SELECT id FROM courses WHERE name = '操作系统原理' AND teacher_id = @t02);
SET @c3 = (SELECT id FROM courses WHERE name = '数据结构与算法' AND teacher_id = @t03);
SET @c4 = (SELECT id FROM courses WHERE name = '数据库原理与应用' AND teacher_id = @t04);
SET @c5 = (SELECT id FROM courses WHERE name = 'Python程序设计' AND teacher_id = @t05);
SET @c6 = (SELECT id FROM courses WHERE name = 'Java程序设计' AND teacher_id = @t06);
SET @c7 = (SELECT id FROM courses WHERE name = '软件工程导论' AND teacher_id = @t04);
SET @c8 = (SELECT id FROM courses WHERE name = '计算机组成原理' AND teacher_id = @t01);

INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES
(@t01, @c1), (@t01, @c8),
(@t02, @c2),
(@t03, @c3),
(@t04, @c4), (@t04, @c7),
(@t05, @c5),
(@t06, @c6);

-- =====================================================================
-- 6. 考试（10 场：4 已结束 + 2 进行中 + 2 已发布未开始 + 1 部分进行中 + 1 草稿）
-- =====================================================================
INSERT INTO exams (course_id, title, description, start_time, end_time, duration, total_score, pass_score, random_order, max_switch, status) VALUES
(@c1, '计算机网络期末测验',     '覆盖 TCP/IP、协议层次与网络安全。',     DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_ADD(DATE_SUB(NOW(), INTERVAL 20 DAY), INTERVAL 45 MINUTE), 45, 100, 60, 1, 3, 'finished'),
(@c2, '操作系统期中考试',       '进程调度、死锁与存储管理。',           DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_ADD(DATE_SUB(NOW(), INTERVAL 15 DAY), INTERVAL 45 MINUTE), 45, 100, 60, 1, 3, 'finished'),
(@c3, '数据结构上机模拟考试',   '线性结构、树、图与排序算法。',         DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_ADD(DATE_SUB(NOW(), INTERVAL 10 DAY), INTERVAL 60 MINUTE), 60, 100, 60, 1, 3, 'finished'),
(@c4, '数据库原理结课考试',     'SQL、事务与规范化理论。',              DATE_SUB(NOW(), INTERVAL 5 DAY),  DATE_ADD(DATE_SUB(NOW(), INTERVAL 5 DAY),  INTERVAL 60 MINUTE), 60, 100, 60, 1, 3, 'finished'),
(@c5, 'Python程序设计期末测验', 'Python 语法、数据结构与高级特性。',    DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_ADD(NOW(), INTERVAL 7 DAY), 40, 100, 60, 1, 3, 'ongoing'),
(@c6, 'Java面向对象结课考试',   '面向对象特性与集合框架。',             DATE_SUB(NOW(), INTERVAL 2 HOUR),   DATE_ADD(NOW(), INTERVAL 5 DAY),  45, 100, 60, 1, 3, 'ongoing'),
(@c7, '软件工程需求分析测验',   '需求分析、用例与开发模型。',           DATE_ADD(NOW(), INTERVAL 2 DAY),    DATE_ADD(NOW(), INTERVAL 3 DAY),   60, 100, 60, 0, 2, 'published'),
(@c8, '计算机组成原理模拟考',   'CPU、存储体系与总线。',                DATE_ADD(NOW(), INTERVAL 5 DAY),    DATE_ADD(NOW(), INTERVAL 6 DAY),   45, 100, 60, 0, 3, 'published'),
(@c4, '数据库原理上机测验',     'SQL 上机操作，部分学生已提交待定稿。', DATE_SUB(NOW(), INTERVAL 2 DAY),    DATE_ADD(NOW(), INTERVAL 1 DAY),   45, 100, 60, 1, 2, 'ongoing'),
(@c5, 'Python程序设计巩固测验', '草稿考试，用于测试教师端编辑流程。',   DATE_ADD(NOW(), INTERVAL 10 DAY),   DATE_ADD(NOW(), INTERVAL 11 DAY),  30, 100, 60, 1, 3, 'draft');

SET @ex1  = (SELECT id FROM exams WHERE title = '计算机网络期末测验' AND course_id = @c1);
SET @ex2  = (SELECT id FROM exams WHERE title = '操作系统期中考试' AND course_id = @c2);
SET @ex3  = (SELECT id FROM exams WHERE title = '数据结构上机模拟考试' AND course_id = @c3);
SET @ex4  = (SELECT id FROM exams WHERE title = '数据库原理结课考试' AND course_id = @c4);
SET @ex5  = (SELECT id FROM exams WHERE title = 'Python程序设计期末测验' AND course_id = @c5);
SET @ex6  = (SELECT id FROM exams WHERE title = 'Java面向对象结课考试' AND course_id = @c6);
SET @ex7  = (SELECT id FROM exams WHERE title = '软件工程需求分析测验' AND course_id = @c7);
SET @ex8  = (SELECT id FROM exams WHERE title = '计算机组成原理模拟考' AND course_id = @c8);
SET @ex9  = (SELECT id FROM exams WHERE title = '数据库原理上机测验' AND course_id = @c4);
SET @ex10 = (SELECT id FROM exams WHERE title = 'Python程序设计巩固测验' AND course_id = @c5);

-- =====================================================================
-- 7. 题目：每场考试 8 题（单选×2 + 多选×1 + 判断×1 + 填空×2 + 简答×2，共 100 分）
-- =====================================================================
-- 考试 1：计算机网络期末测验
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex1, 'single',   'TCP 建立连接需要经过几次握手？',                                        '["一次","两次","三次","四次"]',        'C', 10, 1, 'TCP 通过三次握手建立连接，过程包含 SYN、SYN-ACK 和 ACK。'),
(@ex1, 'single',   '下列哪个地址是 IPv4 回环地址？',                                        '["127.0.0.1","192.168.1.1","10.0.0.1","0.0.0.0"]', 'A', 10, 2, '127.0.0.1 是回环地址，用于本机网络接口测试。'),
(@ex1, 'multiple', '下列哪些属于 TCP/IP 模型中的层次？',                                    '["应用层","传输层","网际层","会话层"]', 'ABC', 15, 3, 'TCP/IP 四层模型为应用层、传输层、网际层和网络接口层。'),
(@ex1, 'judge',    'HTTP 协议默认使用 80 端口。',                                           NULL, '正确', 10, 4, 'HTTP 默认端口为 80，HTTPS 为 443。'),
(@ex1, 'blank',    'OSI 参考模型共有____层。',                                              NULL, '七', 10, 5, 'OSI 参考模型分为物理、数据链路、网络、传输、会话、表示和应用七层。'),
(@ex1, 'blank',    'DNS 的作用是将域名解析为____地址。',                                    NULL, 'IP', 10, 6, 'DNS 完成域名到 IP 地址的映射。'),
(@ex1, 'essay',    '简述 TCP 与 UDP 的主要区别。',                                          NULL, 'TCP 面向连接、提供可靠有序传输，具有流量控制和拥塞控制，适合文件传输等场景；UDP 无连接、不可靠，传输开销小，适合实时音视频等场景。', 15, 7, '应从连接性、可靠性、开销和适用场景等方面作答。'),
(@ex1, 'essay',    '描述从浏览器输入网址到网页显示的主要过程。',                            NULL, '输入 URL 后由 DNS 解析域名得到 IP 地址，浏览器与服务器建立 TCP 连接，发送 HTTP 请求，服务器返回响应，浏览器解析 HTML、CSS 和 JavaScript 并渲染页面。', 20, 8, '应覆盖 DNS、TCP、HTTP 请求响应与浏览器渲染等环节。');

-- 考试 2：操作系统期中考试
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex2, 'single',   '操作系统负责管理计算机的哪些资源？',                                    '["仅CPU","仅内存","硬件与软件资源","仅磁盘"]', 'C', 10, 1, '操作系统统一管理计算机的硬件与软件资源。'),
(@ex2, 'single',   '下列哪个属于操作系统的进程调度算法？',                                  '["先来先服务","快速排序","深度优先","哈希查找"]', 'A', 10, 2, '先来先服务（FCFS）是经典的进程调度算法。'),
(@ex2, 'multiple', '下列哪些属于操作系统的功能？',                                          '["进程管理","内存管理","文件管理","数据库查询优化"]', 'ABC', 15, 3, '进程、内存、文件管理是操作系统的核心功能。'),
(@ex2, 'judge',    '互斥条件是死锁产生的必要条件之一。',                                    NULL, '正确', 10, 4, '死锁四个必要条件：互斥、占有且等待、不可抢占、循环等待。'),
(@ex2, 'blank',    '进程的三种基本状态包括就绪、运行和____。',                              NULL, '阻塞', 10, 5, '进程基本状态为就绪、运行和阻塞（等待）。'),
(@ex2, 'blank',    '分页存储管理中，页表的作用是将逻辑地址转换为____地址。',                NULL, '物理', 10, 6, '页表保存逻辑页号到物理块号的映射。'),
(@ex2, 'essay',    '简述进程与线程的区别。',                                                NULL, '进程是资源分配的基本单位，拥有独立的地址空间；线程是 CPU 调度的基本单位，同一进程内的线程共享地址空间与资源，切换开销更小。', 15, 7, '应从资源分配单位、地址空间和调度开销等方面区分。'),
(@ex2, 'essay',    '解释银行家算法避免死锁的基本思路。',                                    NULL, '银行家算法在资源分配前检查系统是否存在安全序列：若存在某种分配顺序能使所有进程依次完成，则分配资源，否则拒绝请求，避免系统进入不安全状态。', 20, 8, '核心是安全性检查与避免进入不安全状态。');

-- 考试 3：数据结构上机模拟考试
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex3, 'single',   '栈的存取特点是？',                                                      '["先进先出","后进先出","随机存取","按关键字存取"]', 'B', 10, 1, '栈是后进先出（LIFO）的线性结构。'),
(@ex3, 'single',   '二叉树的先序遍历顺序是？',                                              '["根左右","左根右","左右根","按层遍历"]', 'A', 10, 2, '先序遍历顺序为根节点、左子树、右子树。'),
(@ex3, 'multiple', '下列哪些属于线性结构？',                                                '["数组","链表","栈","二叉树"]', 'ABC', 15, 3, '数组、链表和栈都是线性结构，二叉树是非线性结构。'),
(@ex3, 'judge',    '快速排序的平均时间复杂度为 O(n log n)。',                               NULL, '正确', 10, 4, '快速排序平均时间复杂度为 O(n log n)，最坏为 O(n²)。'),
(@ex3, 'blank',    '哈希表中解决冲突的常用方法之一是____。',                                NULL, '链地址法', 10, 5, '开放定址法与链地址法都是常用的冲突解决方法。'),
(@ex3, 'blank',    '图的深度优先遍历通常借助____结构来实现。',                              NULL, '栈', 10, 6, 'DFS 借助栈（或递归）实现，BFS 借助队列。'),
(@ex3, 'essay',    '简述顺序表与链表各自的优缺点。',                                        NULL, '顺序表支持随机访问、查找高效，但插入删除需移动大量元素且扩容代价高；链表插入删除只需修改指针，但无法随机访问，查找第 i 个元素需遍历。', 15, 7, '应从随机访问、插入删除代价和空间利用方面对比。'),
(@ex3, 'essay',    '描述快速排序的基本思想并说明其时间复杂度。',                            NULL, '快速排序每次选取基准元素，将序列划分为小于基准和大于基准的两部分，再递归排序两部分。平均时间复杂度 O(n log n)，最坏 O(n²)。', 20, 8, '需说明划分思想与三种情况下的复杂度。');

-- 考试 4：数据库原理结课考试
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex4, 'single',   'SQL 中用于查询数据的语句是？',                                          '["SELECT","INSERT","UPDATE","DELETE"]', 'A', 10, 1, 'SELECT 用于数据查询。'),
(@ex4, 'single',   '事务 ACID 特性中，I 代表什么？',                                        '["原子性","一致性","隔离性","持久性"]', 'C', 10, 2, 'I 指隔离性（Isolation）。'),
(@ex4, 'multiple', '下列哪些属于关系型数据库管理系统？',                                    '["MySQL","PostgreSQL","Redis","Oracle"]', 'ABD', 15, 3, 'MySQL、PostgreSQL 和 Oracle 是关系型数据库，Redis 是键值型。'),
(@ex4, 'judge',    '主键字段的值可以为空。',                                                NULL, '错误', 10, 4, '主键唯一且非空。'),
(@ex4, 'blank',    'SQL 中用于去除查询结果重复行的关键字是____。',                          NULL, 'DISTINCT', 10, 5, 'DISTINCT 用于消除重复行。'),
(@ex4, 'blank',    '第二范式要求消除非主键字段对主键的____依赖。',                          NULL, '部分', 10, 6, '第二范式消除部分函数依赖，第三范式消除传递依赖。'),
(@ex4, 'essay',    '简述数据库索引的作用及优缺点。',                                        NULL, '索引通过建立有序结构加速查询定位，显著提升检索效率；但占用额外存储空间，且插入、删除、更新时需要维护索引，会降低写操作性能。', 15, 7, '应从查询加速与写放大两方面权衡。'),
(@ex4, 'essay',    '解释事务的 ACID 特性。',                                                NULL, '原子性指事务要么全部执行要么全部回滚；一致性指事务完成后数据满足所有约束；隔离性指并发事务互不干扰；持久性指提交后修改永久保存。', 20, 8, '需分别解释四个特性的含义。');

-- 考试 5：Python程序设计期末测验
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex5, 'single',   'Python 中列表的 append 方法的返回值是？',                               '["新列表","None","原列表","布尔值"]', 'B', 10, 1, 'append 就地修改列表并返回 None。'),
(@ex5, 'single',   '下列哪个是 Python 中不可变的数据类型？',                                '["列表","字典","元组","集合"]', 'C', 10, 2, '元组是不可变序列，列表、字典、集合均可变。'),
(@ex5, 'multiple', '下列哪些 Python 语句用于循环？',                                        '["for","while","if","do-while"]', 'AB', 15, 3, 'for 与 while 是循环语句，Python 没有 do-while。'),
(@ex5, 'judge',    'Python 中的字符串是不可变对象。',                                       NULL, '正确', 10, 4, '字符串一经创建不可修改，修改操作会生成新字符串。'),
(@ex5, 'blank',    'Python 中创建空列表的写法是____。',                                     NULL, '[]', 10, 5, '空列表使用 [] 或 list() 创建。'),
(@ex5, 'blank',    'Python 中读取用户输入的内置函数是____。',                               NULL, 'input', 10, 6, 'input() 读取一行输入并返回字符串。'),
(@ex5, 'essay',    '简述 Python 中列表与元组的区别。',                                       NULL, '列表可变，支持增删改，使用方括号；元组不可变，创建后不能修改，使用圆括号，可作字典键，性能略优。', 15, 7, '应从可变性、语法表示和适用场景等方面对比。'),
(@ex5, 'essay',    '解释 Python 装饰器的原理与作用。',                                       NULL, '装饰器本质是接收函数并返回新函数的函数，通过 @ 语法在定义时包装函数，可在不改动原函数代码的前提下添加日志、计时、权限校验等通用功能。', 20, 8, '应说明高阶函数包装与 @ 语法糖。');

-- 考试 6：Java面向对象结课考试
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex6, 'single',   'Java 中用于创建对象的关键字是？',                                       '["class","new","this","extends"]', 'B', 10, 1, 'new 表达式用于实例化对象。'),
(@ex6, 'single',   'Java 中所有类的直接或间接父类是？',                                     '["Object","Class","Base","Main"]', 'A', 10, 2, 'Object 是所有类的根父类。'),
(@ex6, 'multiple', '下列哪些是 Java 的访问修饰符？',                                        '["public","private","protected","static"]', 'ABC', 15, 3, 'public、private、protected 是访问修饰符，static 不是。'),
(@ex6, 'judge',    'Java 接口中声明的方法默认是抽象方法。',                                 NULL, '正确', 10, 4, '接口方法默认隐式为 public abstract。'),
(@ex6, 'blank',    'Java 异常处理关键字包括 try、catch 和____。',                           NULL, 'finally', 10, 5, 'try-catch-finally 构成 Java 异常处理框架。'),
(@ex6, 'blank',    'Java 集合框架中 List 接口的常用可变实现类是____。',                     NULL, 'ArrayList', 10, 6, 'ArrayList 与 LinkedList 是 List 的常用实现。'),
(@ex6, 'essay',    '简述 Java 中方法重载与重写的区别。',                                     NULL, '重载发生在同一个类中，方法名相同、参数列表不同，与返回值无关；重写发生在父子类之间，子类重新实现父类方法，签名必须一致，可用 @Override 注解检查。', 15, 7, '应从发生位置、方法签名和检查方式区分。'),
(@ex6, 'essay',    '解释 Java 垃圾回收机制的基本原理。',                                     NULL, 'Java 通过垃圾收集器自动管理堆内存，利用可达性分析判断对象是否存活，回收不再被引用的对象，开发者无需手动释放内存，但回收过程可能带来暂停时间。', 20, 8, '应说明可达性分析与自动回收思想。');

-- 考试 7：软件工程需求分析测验
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex7, 'single',   '需求分析阶段的主要产出物是？',                                          '["源代码","需求规格说明书","测试报告","设计文档"]', 'B', 10, 1, '需求分析阶段产出需求规格说明书。'),
(@ex7, 'single',   '下列哪个不是常见的软件开发模型？',                                      '["瀑布模型","敏捷开发","螺旋模型","随机模型"]', 'D', 10, 2, '随机模型不是规范的软件开发模型。'),
(@ex7, 'multiple', '下列哪些属于软件测试的类型？',                                          '["单元测试","集成测试","系统测试","需求测试"]', 'ABC', 15, 3, '单元、集成、系统测试是常见的测试层次。'),
(@ex7, 'judge',    '敏捷开发中 Scrum 的一次迭代周期称为 Sprint。',                          NULL, '正确', 10, 4, 'Scrum 以固定时长的 Sprint 迭代开发。'),
(@ex7, 'blank',    '数据流图（DFD）是描述系统____流动的图形化工具。',                       NULL, '数据', 10, 5, 'DFD 描述数据在系统内部的流动与加工。'),
(@ex7, 'blank',    '面向对象分析中，描述对象状态变化的动态模型常用____图。',               NULL, '状态', 10, 6, '状态图描述对象状态及状态间的转移。'),
(@ex7, 'essay',    '简述瀑布模型的优缺点。',                                                NULL, '瀑布模型阶段划分清晰、文档完备、易于管理，适合需求明确的项目；但阶段间反馈少，需求变更代价大，不适合需求易变的项目。', 15, 7, '应从阶段划分与需求变更两方面评价。'),
(@ex7, 'essay',    '解释用例图在需求分析中的作用。',                                        NULL, '用例图从用户视角描述系统功能，展示参与者与用例及其关系，帮助开发团队与用户确认功能边界，是需求沟通与验收测试设计的基础。', 20, 8, '应说明参与者、用例与系统边界三要素。');

-- 考试 8：计算机组成原理模拟考
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex8, 'single',   'CPU 主要由运算器和____组成？',                                          '["存储器","控制器","输入设备","输出设备"]', 'B', 10, 1, 'CPU 由运算器与控制器组成。'),
(@ex8, 'single',   '1MB 等于多少？',                                                        '["1024字节","1024KB","1000KB","1024000字节"]', 'B', 10, 2, '1MB = 1024KB = 1048576 字节。'),
(@ex8, 'multiple', '下列哪些属于计算机的总线类型？',                                        '["数据总线","地址总线","控制总线","打印总线"]', 'ABC', 15, 3, '数据、地址、控制总线是三大系统总线。'),
(@ex8, 'judge',    '冯·诺依曼体系结构采用存储程序原理。',                                    NULL, '正确', 10, 4, '存储程序原理是冯·诺依曼体系的核心思想。'),
(@ex8, 'blank',    '指令周期通常包含取指、译码、执行和____阶段。',                          NULL, '回写', 10, 5, '经典流水线包含取指、译码、执行、访存、回写阶段。'),
(@ex8, 'blank',    '衡量 CPU 主频的单位是____。',                                           NULL, 'Hz', 10, 6, '主频以赫兹（Hz）为单位，常用 GHz 表示。'),
(@ex8, 'essay',    '简述 Cache 在计算机存储体系中的作用。',                                 NULL, 'Cache 位于 CPU 与主存之间，利用程序访问的局部性原理缓存高频访问的数据，使 CPU 大多能以接近 Cache 的速度访问，减少访问主存的平均时间，提升系统性能。', 15, 7, '应说明局部性原理与命中率的影响。'),
(@ex8, 'essay',    '解释冯·诺依曼体系结构的主要思想。',                                     NULL, '冯·诺依曼体系将程序和数据以二进制形式存储在存储器中，CPU 按顺序逐条取出指令并执行，系统由运算器、控制器、存储器、输入设备和输出设备五大部件组成。', 20, 8, '应说明存储程序与五大部件组成。');

-- 考试 9：数据库原理上机测验
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex9, 'single',   'SQL 中内连接使用的关键字是？',                                          '["INNER JOIN","OUTER JOIN","LEFT JOIN","FULL JOIN"]', 'A', 10, 1, 'INNER JOIN 返回两表中匹配的行。'),
(@ex9, 'single',   '下列哪个 SQL 语句用于删除表中的数据？',                                 '["DROP TABLE","DELETE FROM","TRUNCATE","REMOVE"]', 'B', 10, 2, 'DELETE FROM 按条件删除数据行。'),
(@ex9, 'multiple', '下列哪些约束可以保证数据完整性？',                                      '["主键约束","外键约束","唯一约束","默认值约束"]', 'ABC', 15, 3, '主键、外键、唯一约束保证完整性，默认值约束不属于完整性约束。'),
(@ex9, 'judge',    '视图是虚表，不存储实际数据。',                                          NULL, '正确', 10, 4, '视图基于基表查询生成，不占用额外存储。'),
(@ex9, 'blank',    'SQL 中用于分组统计的关键字是____。',                                    NULL, 'GROUP BY', 10, 5, 'GROUP BY 与聚合函数配合完成分组统计。'),
(@ex9, 'blank',    '事务隔离级别从低到高包括读未提交、读已提交、可重复读和____。',         NULL, '串行化', 10, 6, '串行化是最高的隔离级别。'),
(@ex9, 'essay',    '简述数据库三大范式的基本要求。',                                        NULL, '第一范式要求字段不可再分；第二范式在满足第一范式的基础上消除非主键字段对主键的部分依赖；第三范式进一步消除非主键字段间的传递依赖。', 15, 7, '应分别说明每一范式要消除的依赖。'),
(@ex9, 'essay',    '解释 SQL 注入的原理及防范措施。',                                       NULL, 'SQL 注入是攻击者把恶意 SQL 片段拼接到参数中，欺骗数据库执行非预期查询；防范措施包括参数化查询或预编译语句、输入校验与转义、最小权限原则和定期安全审计。', 20, 8, '应说明拼接原理与至少两种防范手段。');

-- 考试 10：Python程序设计基础练习（草稿）
INSERT INTO questions (exam_id, type, content, options, answer, score, sort_order, analysis) VALUES
(@ex10, 'single',  'Python 中用于输出内容的函数是？',                                       '["print","echo","console.log","out"]', 'A', 10, 1, 'print() 是 Python 的内置输出函数。'),
(@ex10, 'single',  '下列哪个是 Python 中的逻辑运算符？',                                    '["&&","||","and","!"]', 'C', 10, 2, 'Python 逻辑运算符为 and、or、not。'),
(@ex10, 'multiple','下列哪些 Python 数据类型支持下标索引？',                                '["字符串","列表","元组","集合"]', 'ABC', 15, 3, '字符串、列表、元组支持下标索引，集合无序不可索引。'),
(@ex10, 'judge',   'Python 中的注释以 # 符号开头。',                                        NULL, '正确', 10, 4, '# 用于单行注释。'),
(@ex10, 'blank',   'Python 中创建空字典的写法是____。',                                     NULL, '{}', 10, 5, '空字典使用 {} 或 dict() 创建。'),
(@ex10, 'blank',   'Python 中导入模块使用的关键字是____。',                                 NULL, 'import', 10, 6, 'import 用于导入模块。'),
(@ex10, 'essay',   '简述 Python 中字典的常见用法。',                                        NULL, '字典以键值对存储数据，通过键快速访问值，支持增删改查、遍历与合并等操作，键必须可哈希且唯一，适合存储具有映射关系的数据。', 15, 7, '应说明键值对结构与键的唯一性要求。'),
(@ex10, 'essay',   '解释 Python 中生成器的作用与优点。',                                    NULL, '生成器通过 yield 关键字逐个产生值，不一次性加载全部数据，内存占用低，适合处理大数据量或无限序列，可配合 for 循环或 next() 按需获取。', 20, 8, '应说明惰性求值与内存优势。');

-- =====================================================================
-- 8. 考试-班级关联（决定哪些班级的学生可以参加考试）
-- =====================================================================
INSERT INTO exam_classes (exam_id, class_id) VALUES
(@ex1, @c01), (@ex1, @c02), (@ex1, @c03), (@ex1, @c04), (@ex1, @c05),
(@ex2, @c01), (@ex2, @c02), (@ex2, @c03), (@ex2, @c04), (@ex2, @c05),
(@ex3, @c01), (@ex3, @c02), (@ex3, @c03), (@ex3, @c04), (@ex3, @c05),
(@ex4, @c01), (@ex4, @c02), (@ex4, @c03), (@ex4, @c04), (@ex4, @c05),
(@ex5, @c01), (@ex5, @c02), (@ex5, @c03),
(@ex6, @c04), (@ex6, @c05),
(@ex7, @c01), (@ex7, @c02), (@ex7, @c03), (@ex7, @c04),
(@ex8, @c02), (@ex8, @c03), (@ex8, @c04), (@ex8, @c05),
(@ex9, @c01), (@ex9, @c05),
(@ex10, @c02), (@ex10, @c03);

-- =====================================================================
-- 9. 考试记录
--    已结束考试（ex1-ex4）：全班 60 人参加，状态 graded
--    进行中考试（ex5、ex6）：面向班级学生参加，状态 ongoing
--    上机测验（ex9）：半数学生已提交，状态 submitted（等待定稿）
-- =====================================================================
INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count)
SELECT u.id, e.id, e.start_time, DATE_ADD(e.start_time, INTERVAL e.duration MINUTE), 0, 'graded', (u.id * 7 + e.id) % 4
FROM exams e
JOIN exam_classes ec ON ec.exam_id = e.id
JOIN users u ON u.class_id = ec.class_id AND u.username LIKE 'demo_student%'
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE e.status = 'finished' AND t.username LIKE 'demo_teacher%';

INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count)
SELECT u.id, e.id, e.start_time, NULL, 0, 'ongoing', (u.id * 7 + e.id) % 4
FROM exams e
JOIN exam_classes ec ON ec.exam_id = e.id
JOIN users u ON u.class_id = ec.class_id AND u.username LIKE 'demo_student%'
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE e.status = 'ongoing' AND e.title <> '数据库原理上机测验' AND t.username LIKE 'demo_teacher%';

INSERT INTO exam_records (student_id, exam_id, start_time, submit_time, score, status, switch_count)
SELECT u.id, e.id, e.start_time, DATE_SUB(NOW(), INTERVAL 1 DAY), 0, 'submitted', (u.id * 7 + e.id) % 4
FROM exams e
JOIN exam_classes ec ON ec.exam_id = e.id
JOIN users u ON u.class_id = ec.class_id AND u.username LIKE 'demo_student%'
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
WHERE e.title = '数据库原理上机测验' AND u.id % 2 = 0 AND t.username LIKE 'demo_teacher%';

-- =====================================================================
-- 10. 答题数据（已提交/已定稿记录：客观题自动判分，简答/填空由 AI 评分）
--     得分由确定性公式生成：约 80% 客观题答对；简答题按
--     完整/3/4/1/2/1/4/未作答五档计分，保证每次执行结果一致。
-- =====================================================================
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct,
                     ai_score, ai_feedback, ai_model, ai_graded_at, grading_source)
SELECT t.record_id, t.qid,
  CASE t.qtype
    WHEN 'single'   THEN IF(t.ok, t.qans, CHAR(65 + (((ASCII(t.qans) - 65) + 1 + t.student_id % 3) % JSON_LENGTH(t.qopts))))
    WHEN 'multiple' THEN IF(t.ok, t.qans, CONCAT(LEFT(t.qans, t.student_id % CHAR_LENGTH(t.qans)), SUBSTRING(t.qans, t.student_id % CHAR_LENGTH(t.qans) + 2)))
    WHEN 'judge'    THEN IF(t.ok, t.qans, IF(t.qans = '正确', '错误', '正确'))
    WHEN 'blank'    THEN IF(t.ok, t.qans, ELT(1 + (t.student_id + t.qid) % 5, 'class', 'function', 'import', 'void', 'int'))
    WHEN 'essay'    THEN t.ess_ans
  END,
  t.ans_score,
  IF(t.qtype = 'essay', NULL, t.ok),
  IF(t.qtype IN ('essay', 'blank'), t.ans_score, NULL),
  IF(t.qtype IN ('essay', 'blank'),
     JSON_OBJECT(
       'score', t.ans_score,
       'reasoning', t.ai_reasoning,
       'criterion_results', JSON_ARRAY(JSON_OBJECT('criterion_id', 'default', 'score', t.ans_score, 'reason', t.ai_reasoning)),
       'confidence', 0.85
     ),
     NULL),
  IF(t.qtype IN ('essay', 'blank'), 'demo-ai-grading-model', NULL),
  IF(t.qtype IN ('essay', 'blank'), DATE_ADD(t.submit_time, INTERVAL 1 HOUR), NULL),
  IF(t.qtype IN ('essay', 'blank'), 'ai', 'pending')
FROM (
  SELECT r.id AS record_id, r.student_id, r.exam_id, r.submit_time,
         q.id AS qid, q.type AS qtype, q.answer AS qans, q.options AS qopts, q.score AS qscore,
         ((r.student_id * 3 + q.id * 5 + r.exam_id) % 10) < 8 AS ok,
         (r.student_id * 3 + q.id) % 5 AS eri,
         CASE q.type WHEN 'essay' THEN
           CASE (r.student_id * 3 + q.id) % 5
             WHEN 0 THEN q.answer
             WHEN 1 THEN LEFT(q.answer, CEIL(CHAR_LENGTH(q.answer) * 0.75))
             WHEN 2 THEN LEFT(q.answer, CEIL(CHAR_LENGTH(q.answer) * 0.5))
             WHEN 3 THEN LEFT(q.answer, CEIL(CHAR_LENGTH(q.answer) * 0.25))
             ELSE '本题未作答'
           END
         ELSE NULL END AS ess_ans,
         CASE q.type WHEN 'essay' THEN
           CASE (r.student_id * 3 + q.id) % 5
             WHEN 0 THEN q.score
             WHEN 1 THEN ROUND(q.score * 0.75)
             WHEN 2 THEN ROUND(q.score * 0.5)
             WHEN 3 THEN ROUND(q.score * 0.25)
             ELSE 0
           END
         ELSE IF(((r.student_id * 3 + q.id * 5 + r.exam_id) % 10) < 8, q.score, 0) END AS ans_score,
         CASE q.type WHEN 'essay' THEN
           CASE (r.student_id * 3 + q.id) % 5
             WHEN 0 THEN '回答完整，要点齐全，与参考答案一致。'
             WHEN 1 THEN '回答基本完整，个别要点表述不够准确。'
             WHEN 2 THEN '回答覆盖约一半要点，部分关键点缺失。'
             WHEN 3 THEN '仅涉及少量要点，论述不充分。'
             ELSE '答案与参考答案不符，未涉及关键要点。'
           END
         ELSE IF(((r.student_id * 3 + q.id * 5 + r.exam_id) % 10) < 8,
                 '填空内容正确，与标准答案一致。', '填空内容与标准答案不符。') END AS ai_reasoning
  FROM exam_records r
  JOIN exams e ON e.id = r.exam_id
  JOIN courses c ON c.id = e.course_id
  JOIN users t ON t.id = c.teacher_id
  JOIN questions q ON q.exam_id = r.exam_id
  WHERE t.username LIKE 'demo_teacher%' AND r.status IN ('submitted', 'graded')
) t;

-- 进行中记录的占位答案（未评分）
INSERT INTO answers (record_id, question_id, student_answer, score, is_correct, grading_source)
SELECT r.id, q.id,
  CASE q.type WHEN 'single' THEN 'A' WHEN 'multiple' THEN 'AB' WHEN 'judge' THEN '正确' WHEN 'blank' THEN '' WHEN 'essay' THEN LEFT(q.answer, 8) END,
  0, NULL, 'pending'
FROM exam_records r
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
JOIN questions q ON q.exam_id = r.exam_id
WHERE t.username LIKE 'demo_teacher%' AND r.status = 'ongoing';

-- 记录总分 = 各题得分之和，保证分数一致
UPDATE exam_records r
JOIN exams e ON e.id = r.exam_id
JOIN courses c ON c.id = e.course_id
JOIN users t ON t.id = c.teacher_id
SET r.score = (SELECT COALESCE(SUM(a.score), 0) FROM answers a WHERE a.record_id = r.id)
WHERE t.username LIKE 'demo_teacher%' AND r.status IN ('submitted', 'graded');

COMMIT;
