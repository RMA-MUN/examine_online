import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Col, Divider, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import axios from '../../api/axios';
import { generatePaperFromBasket, getExams, importBankFile } from '../../api/exams';
import type { ApiResponse, Paginated } from '../../types/api';
import {
  BANK_BLUEPRINT,
  MOCK_BANK_QUESTIONS,
  autoPickLeastUsed,
  type BankLevel,
  type BankType,
  type MockBankQuestion,
} from '../../mocks/bank';
import './index.css';

type SegType = 'all' | BankType;

const SEG_TYPES: SegType[] = ['all', '单选', '多选', '判断', '填空', '简答'];

const TYPE_TO_CN: Record<string, BankType> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  blank: '填空',
  essay: '简答',
};

const DIFFICULTY_TO_CN: Record<string, BankLevel> = {
  easy: '易',
  medium: '中',
  hard: '难',
};

const TYPE_OPTIONS = [
  { value: 'single', label: '单选' },
  { value: 'multiple', label: '多选' },
  { value: 'judge', label: '判断' },
  { value: 'blank', label: '填空' },
  { value: 'essay', label: '简答' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '易' },
  { value: 'medium', label: '中' },
  { value: 'hard', label: '难' },
];

interface BankApiItem {
  id: number;
  type: string;
  content: string;
  options: string[] | string | null;
  answer: string | null;
  score: number;
  course_id: number | null;
  tags: string[] | null;
  difficulty: string | null;
}

interface BankFormValues {
  type: string;
  content: string;
  options?: string[];
  answer?: string;
  score: number;
  course_id?: number | null;
  tags?: string[];
  difficulty?: string;
}

function mapApiToMock(items: BankApiItem[]): MockBankQuestion[] {
  return items.map((q) => ({
    id: `B-${q.id}`,
    type: TYPE_TO_CN[q.type] ?? '单选',
    sub: q.course_id != null ? `课程 ${q.course_id}` : '公共题库',
    know: q.tags?.[0] ?? '综合',
    level: (q.difficulty ? DIFFICULTY_TO_CN[q.difficulty] : '中') ?? '中',
    p: 0.7,
    score: q.score ?? 5,
    used: 0,
    reviewed: true,
    stem: q.content,
    opts: Array.isArray(q.options) ? q.options : [],
    ans: q.answer ?? '—',
  }));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

const optionLetters = (index: number) => String.fromCharCode(65 + index);

const parseBankNumericId = (id: string): number | null => {
  const m = /^B-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
};

const QuestionBank = () => {
  const { message } = App.useApp();
  // 无后端时读 mocks/bank.ts；后端可用时以接口数据覆盖
  const [remote, setRemote] = useState<MockBankQuestion[]>([]);
  const [rawItems, setRawItems] = useState<BankApiItem[]>([]);
  // 拉取状态：pending（首屏加载中）→ ok（后端可达，以接口数据为准，空即空）
  //   / unreachable（后端不可用，回退 mocks 演示数据）。
  // 注意 real items 的 used 全为 mapApiToMock 硬编码 0，least-used 实为退化取前 N，
  // 故 toast 不再宣称算法（见 handleAuto）。
  const [bankStatus, setBankStatus] = useState<'pending' | 'ok' | 'unreachable'>('pending');
  // 后端 list_bank 返回的 total（paginated_response），用于替换 MOCK_BANK_META 假统计
  const [total, setTotal] = useState<number | null>(null);
  // 真实空题库（ok + total 0）渲染 EmptyState，不再回退到 12 条 mocks 假数据；
  // mocks 仅在后端不可达（unreachable）时作为离线演示回退。pending（首轮加载中）同样
  // 不展示 mocks，避免把演示数据误认为真实题库。
  const questions = useMemo(
    () => (remote.length > 0 ? remote : bankStatus === 'unreachable' ? MOCK_BANK_QUESTIONS : []),
    [remote, bankStatus],
  );
  // 筛选映射（client-side over fetched real fields）：
  // - sub → course_id（展示为 `课程 {id}` / 公共题库）
  // - type → type（single/multiple/judge/blank/essay ↔ 单选/多选/判断/填空/简答）
  // - level → difficulty（easy/medium/hard ↔ 易/中/难）
  // - know → tags[0]（后端 tags 无独立查询参数，前端对已拉取页做诚实过滤）
  // - kw → content/tags/id（后端 ?keyword= 仅匹配 content，见 question_service.list_bank_questions；
  //   前端在已拉取页内额外匹配 know/id 以兼容题号搜索，不虚构服务端能力）
  // 已删除 reviewedOnly：后端 QuestionResponse 无 reviewed 字段。
  const [sub, setSub] = useState('all');
  const [type, setType] = useState<SegType>('all');
  const [level, setLevel] = useState('all');
  const [know, setKnow] = useState('all');
  const [kw, setKw] = useState('');
  // 排序：后端 list_bank 无 sort 参数，固定 order_by id desc（question_service.py）；
  // 前端不再提供按正确率/使用次数排序（p/used 为 mocks/bank.ts 演示字段，后端无此列），
  // 保持接口返回顺序（单一日序），故删除排序 Select。
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [genOpen, setGenOpen] = useState(false);
  const [examOptions, setExamOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [targetExamId, setTargetExamId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qSubmitting, setQSubmitting] = useState(false);
  const [qForm] = Form.useForm<BankFormValues>();
  const qType = Form.useWatch('type', qForm);
  const fileRef = useRef<HTMLInputElement>(null);

  const rawById = useMemo(() => new Map(rawItems.map((q) => [q.id, q])), [rawItems]);

  const refreshBank = async () => {
    try {
      const res = (await axios.get('/api/bank/questions', {
        params: { page: 1, page_size: 100 },
      })) as ApiResponse<Paginated<BankApiItem>>;
      const data = res?.data;
      if (data && Array.isArray(data.items)) {
        setTotal(typeof data.total === 'number' ? data.total : data.items.length);
        if (data.items.length > 0) {
          setRawItems(data.items);
          setRemote(mapApiToMock(data.items));
        } else {
          setRawItems([]);
          setRemote([]);
        }
        setBankStatus('ok');
      }
    } catch {
      // 后端不可用时回退到 mocks 演示数据（唯一展示 mocks 的情形）
      setBankStatus('unreachable');
    }
  };

  useEffect(() => {
    void refreshBank();
  }, []);

  useEffect(() => {
    if (!genOpen || examOptions.length > 0) return;
    getExams({ page: 1, page_size: 100 })
      .then((res) => {
        const items = res?.data?.items ?? [];
        if (items.length > 0) {
          setExamOptions(items.map((e) => ({ value: e.id, label: e.title })));
          setTargetExamId(items[0].id);
        }
      })
      .catch(() => {
        // 后端不可用时保持空下拉，落盘时给出离线占位提示
      });
  }, [genOpen, examOptions.length]);

  const openCreateModal = () => {
    setEditingId(null);
    qForm.resetFields();
    qForm.setFieldsValue({
      type: 'single',
      score: 5,
      options: ['', '', '', ''],
      difficulty: 'medium',
      tags: [],
      course_id: null,
    });
    setQModalOpen(true);
  };

  const openEditModal = (q: MockBankQuestion) => {
    const numericId = parseBankNumericId(q.id);
    if (numericId == null) {
      message.info('当前题目无法编辑（请先导入题库）');
      return;
    }
    const raw = rawById.get(numericId);
    if (!raw) {
      message.info('当前题目无法编辑（请先导入题库）');
      return;
    }
    setEditingId(q.id);
    qForm.resetFields();
    qForm.setFieldsValue({
      type: raw.type,
      content: raw.content,
      options: Array.isArray(raw.options) ? raw.options : [],
      answer: raw.answer ?? '',
      score: raw.score ?? 5,
      course_id: raw.course_id,
      tags: raw.tags ?? [],
      difficulty: raw.difficulty ?? 'medium',
    });
    setQModalOpen(true);
  };

  const handleQuestionSubmit = async () => {
    try {
      const values = await qForm.validateFields();
      setQSubmitting(true);
      // BankQuestionCreate（schemas/question.py）必填仅 type/content；其余缺省：
      // score=1、options/answer/course_id/tags/difficulty 可空；difficulty 仅 easy/medium/hard。
      const payload = {
        type: values.type,
        content: values.content?.trim(),
        options: ['single', 'multiple'].includes(values.type) ? (values.options || []) : null,
        answer: values.answer || null,
        score: values.score,
        course_id: values.course_id ?? null,
        tags: values.tags && values.tags.length > 0 ? values.tags : null,
        difficulty: values.difficulty || null,
      };
      if (editingId == null) {
        await axios.post('/api/bank/questions', payload);
        message.success('新建题目成功');
      } else {
        const numericId = parseBankNumericId(editingId);
        if (numericId == null) {
          message.info('当前题目无法编辑（请先导入题库）');
          return;
        }
        await axios.put(`/api/questions/${numericId}`, payload);
        message.success('更新题目成功');
      }
      setQModalOpen(false);
      await refreshBank();
    } catch (err: unknown) {
      // validateFields 失败时 err 含 errorFields，不弹错；仅处理 HTTP 错误
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        message.error('无权管理该学科题库');
        return;
      }
      if ((err as { errorFields?: unknown })?.errorFields) return;
      message.error(editingId == null ? '新建题目失败' : '更新题目失败');
    } finally {
      setQSubmitting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setUploading(true);
    try {
      const res = (await importBankFile(file)) as unknown as {
        code?: number;
        data?: { errors?: Array<{ row?: number; error?: string }>; count?: number; imported_count?: number };
      };
      // 后端解析失败回 code 400（HTTP 400 通常走 catch；此处防 HTTP 200 夹带 code 400 的误报）
      if (res?.code !== 200 && res?.code !== 201) {
        const errs = res?.data?.errors;
        const rows = Array.isArray(errs) ? errs.map((e) => `第${e.row}行${e.error ?? ''}`).join('；') : '';
        message.error(rows ? `题库导入失败：${rows}` : '题库导入失败，已保留演示数据');
        return;
      }
      const n = res?.data?.count ?? res?.data?.imported_count ?? 0;
      message.success(`题库导入成功，共 ${n} 题`);
      await refreshBank();
    } catch (err: unknown) {
      // HTTP 400 夹带 errors（如行级解析失败）：复用成功分支“第X行”格式透出
      const errs = (err as { response?: { data?: { data?: { errors?: Array<{ row?: number; error?: string }> } } } })
        ?.response?.data?.data?.errors;
      const rows = Array.isArray(errs) ? errs.map((e) => `第${e.row}行${e.error ?? ''}`).join('；') : '';
      message.error(rows ? `题库导入失败：${rows}` : '题库导入失败，已保留演示数据');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    if (targetExamId == null) {
      message.warning('暂无可选考试，后端不可用，功能暂不可用');
      return;
    }
    const numericIds = basketIds
      .map((id) => /^B-(\d+)$/.exec(id)?.[1])
      .filter((v): v is string => v != null)
      .map(Number);
    if (numericIds.length === 0) {
      message.info('当前题目无法落盘（请先导入题库）');
      return;
    }
    setGenerating(true);
    try {
      // 后端 FromBankRequest 字段为 bank_ids（见 backend/app/schemas/question.py）
      await generatePaperFromBasket(targetExamId, numericIds);
      message.success(`已落盘 ${numericIds.length} 题到考试 ${targetExamId}`);
      setGenOpen(false);
    } catch {
      message.error('组卷落盘失败，已保留本地组卷篮');
    } finally {
      setGenerating(false);
    }
  };

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const filtered = useMemo(() => {
    const out = questions.filter((q) => {
      if (type !== 'all' && q.type !== type) return false;
      if (sub !== 'all' && q.sub !== sub) return false;
      if (level !== 'all' && q.level !== level) return false;
      if (know !== 'all' && q.know !== know) return false;
      if (kw && `${q.stem}${q.know}${q.id}`.toLowerCase().indexOf(kw.toLowerCase()) < 0) return false;
      return true;
    });
    return out;
  }, [questions, type, sub, level, know, kw]);

  const basketIds = Object.keys(basket);
  const basketCount = basketIds.reduce((n, id) => n + basket[id], 0);
  const basketTotal = basketIds.reduce((n, id) => n + basket[id] * (byId.get(id)?.score ?? 0), 0);
  const basketStruct = useMemo(() => {
    const per: Record<string, number> = {};
    basketIds.forEach((id) => {
      const q = byId.get(id);
      if (!q) return;
      per[q.type] = (per[q.type] ?? 0) + basket[id];
    });
    return per;
  }, [basketIds, basket, byId]);

  const addToBasket = (id: string) => {
    setBasket((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    message.success('已加入组卷篮');
  };

  const handleAuto = () => {
    const picked = autoPickLeastUsed(questions, BANK_BLUEPRINT);
    setBasket((prev) => {
      const next = { ...prev };
      picked.forEach((id) => {
        next[id] = (next[id] ?? 0) + 1;
      });
      return next;
    });
    message.success(`智能抽题完成，共 ${picked.length} 题`);
  };

  const clearFilters = () => {
    setSub('all');
    setType('all');
    setLevel('all');
    setKnow('all');
    setKw('');
  };

  const renderRail = (title: string, values: string[], value: string, onPick: (v: string) => void, allLabel: string) => (
    <div className="rail-group">
      <div className="label">{title}</div>
      <div className="rail-list">
        {[{ v: 'all', label: allLabel }, ...values.map((v) => ({ v, label: v }))].map((o) => {
          const n = o.v === 'all' ? questions.length : questions.filter((q) => {
            if (title === '学科') return q.sub === o.v;
            if (title === '题型') return q.type === o.v;
            if (title === '难度') return q.level === o.v;
            return q.know === o.v;
          }).length;
          return (
            <button
              key={o.v}
              type="button"
              className={`rail-opt${value === o.v ? ' on' : ''}`}
              onClick={() => onPick(o.v)}
            >
              <span>{o.label}</span>
              <span className="num">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const levelPill = (l: BankLevel) => (l === '难' ? 'pill-danger' : l === '中' ? 'pill-warn' : 'pill-ok');

  // 头部统计：subjects 个数无任何端点可提供（list_bank 仅回 total），故删除该分句与 MOCK 更新时间；
  // 显示 total ?? 当前页题数（离线回退 mocks 时为 mocks 长度，不虚构 4268）。
  const headerTotal = total ?? questions.length;

  return (
    <div className="mj-bank">
      <div className="bank-topbar">
        <Input.Search
          placeholder="搜索题干、知识点或题号"
          aria-label="搜索题目"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onSearch={(v) => setKw(v.trim())}
          style={{ maxWidth: 320 }}
        />
        <div className="grow" />
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.docx"
          hidden
          aria-label="选择题库文件"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportFile(f);
          }}
        />
        <Button loading={uploading} onClick={() => fileRef.current?.click()}>
          导入题库
        </Button>
        <Button type="primary" onClick={openCreateModal}>
          新建题目
        </Button>
      </div>

      <section className="page-head">
        <div>
          <h1 className="title-lg">题库与组卷</h1>
          <p className="page-sub">
            题库共 <span className="num">{headerTotal}</span> 道题
          </p>
        </div>
      </section>

      <section className="cols-3">
        <aside className="panel rail" aria-label="筛选条件">
          <div className="rail-group">
            <div className="between">
              <span className="title-sm">筛选条件</span>
              <Button type="link" size="small" onClick={clearFilters}>
                重置
              </Button>
            </div>
          </div>
          {renderRail('学科', uniq(questions.map((q) => q.sub)), sub, setSub, '全部学科')}
          {renderRail('题型', uniq(questions.map((q) => q.type)), type, (v) => setType(v as SegType), '全部题型')}
          {renderRail('难度', ['易', '中', '难'], level, setLevel, '全部难度')}
          {renderRail('知识点', uniq(questions.map((q) => q.know)), know, setKnow, '全部知识点')}
        </aside>

        <div className="panel">
          <div className="panel-head">
            <div className="row">
              <span className="title-sm">题目列表</span>
              <span className="meta">{filtered.length} 道题</span>
              {total != null && total > 100 && <span className="meta">仅显示前 100，共 {total} 条</span>}
            </div>
            <div className="seg">
              {SEG_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={type === t ? 'on' : ''}
                  onClick={() => setType(t)}
                >
                  {t === 'all' ? '全部' : t}
                </button>
              ))}
            </div>
          </div>
          <div>
            {filtered.length === 0 && (
              <div className="empty">没有符合条件的题目。可放宽筛选条件，或新建题目。</div>
            )}
            {filtered.map((q) => (
              <div className="q-row" key={q.id}>
                <div>
                  <span className={`pill ${levelPill(q.level)}`}>{q.level}</span>
                </div>
                <div className="q-body">
                  <div className="q-meta">
                    <span className="num q-id">{q.id}</span>
                    <span className="tag">{q.sub}</span>
                    <span className="tag">{q.type}</span>
                    <span className="tag">{q.know}</span>
                  </div>
                  <div className="q-stem">{q.stem}</div>
                  {q.opts.length > 0 && (
                    <div className="q-opt-row">
                      {q.opts.map((o, i) => (
                        <span key={`${q.id}-opt-${i}`}>
                          {String.fromCharCode(65 + i)}. {o}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="q-opt-row">
                    <span>
                      参考答案 <b>{q.ans}</b>
                    </span>
                    <span>
                      分值 <b>{q.score}</b> 分
                    </span>
                  </div>
                  <div className="row-wrap">
                    <Button size="small" onClick={() => addToBasket(q.id)}>
                      加入组卷
                    </Button>
                    <Button size="small" type="text" onClick={() => openEditModal(q)}>
                      编辑
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel rail" aria-label="组卷篮">
          <div className="panel-head">
            <span className="title-sm">组卷篮</span>
            <span className="pill pill-neutral">{basketCount} 题</span>
          </div>
          <div className="panel-body basket-body">
            <div>
              {basketIds.map((id) => {
                const q = byId.get(id);
                if (!q) return null;
                return (
                  <div className="basket-row" key={id}>
                    <div className="basket-main">
                      <div className="basket-title">{q.stem.slice(0, 22)}…</div>
                      <div className="meta">
                        {q.id} · {q.type} · {q.score} 分/题
                      </div>
                    </div>
                    <div className="row">
                      <span className="stepper">
                        <button
                          type="button"
                          aria-label="减少"
                          onClick={() =>
                            setBasket((prev) => {
                              const next = { ...prev };
                              next[id] -= 1;
                              if (next[id] <= 0) delete next[id];
                              return next;
                            })
                          }
                        >
                          −
                        </button>
                        <span>{basket[id]}</span>
                        <button
                          type="button"
                          aria-label="增加"
                          onClick={() => setBasket((prev) => ({ ...prev, [id]: prev[id] + 1 }))}
                        >
                          +
                        </button>
                      </span>
                      <button
                        type="button"
                        className="x"
                        aria-label="移除"
                        onClick={() =>
                          setBasket((prev) => {
                            const next = { ...prev };
                            delete next[id];
                            return next;
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {basketIds.length === 0 && (
              <div className="empty basket-empty">从左侧列表加入题目，或使用智能抽题快速成卷。</div>
            )}
            <div className="between basket-total">
              <span className="label">总分</span>
              <span className="num basket-total-num">{basketTotal}</span>
            </div>
            <div className="stack-sm">
              {Object.keys(basketStruct).map((t) => (
                <div className="between" key={t}>
                  <span className="meta">{t}</span>
                  <span className="num meta">{basketStruct[t]} 题</span>
                </div>
              ))}
            </div>
            <Button type="primary" block disabled={basketIds.length === 0} onClick={() => setGenOpen(true)}>
              生成试卷
            </Button>
            <Button block onClick={handleAuto}>
              智能抽题（按蓝图）
            </Button>
            <p className="meta blueprint">
              蓝图：单选 {BANK_BLUEPRINT['单选']} · 多选 {BANK_BLUEPRINT['多选']} · 判断 {BANK_BLUEPRINT['判断']} ·
              填空 {BANK_BLUEPRINT['填空']} · 简答 {BANK_BLUEPRINT['简答']}，共 100 分
            </p>
          </div>
        </aside>
      </section>

      <Modal
        title="生成试卷"
        open={genOpen}
        onCancel={() => setGenOpen(false)}
        onOk={() => void handleGenerate()}
        okText="生成并保存"
        cancelText="取消"
        okButtonProps={{ loading: generating, disabled: basketIds.length === 0 }}
      >
        <p className="page-sub">
          当前组卷篮共 {basketCount} 题，总分 {basketTotal} 分。
        </p>
        <div className="gen-field">
          <label htmlFor="paper-exam">落盘目标考试</label>
          <Select
            id="paper-exam"
            value={targetExamId ?? undefined}
            onChange={(v) => setTargetExamId(v)}
            style={{ width: '100%' }}
            placeholder={examOptions.length === 0 ? '暂无考试（后端不可用，功能暂不可用）' : '选择考试'}
            options={examOptions}
          />
        </div>
      </Modal>

      <Modal
        title={editingId == null ? '新建题目' : '编辑题目'}
        open={qModalOpen}
        onOk={() => void handleQuestionSubmit()}
        onCancel={() => setQModalOpen(false)}
        confirmLoading={qSubmitting}
        okText={editingId == null ? '新建' : '保存'}
        cancelText="取消"
        width={640}
      >
        <Divider style={{ marginTop: 8 }} />
        <Form form={qForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="题型" rules={[{ required: true, message: '请选择题型' }]}>
                <Select options={TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="score" label="分值" rules={[{ required: true, message: '请输入分值' }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="difficulty" label="难度">
                <Select allowClear placeholder="请选择难度" options={DIFFICULTY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="course_id" label="课程 ID" tooltip="题库题目必须归属学科课程" rules={[{ required: true, message: '请选择所属学科' }]}>
                <InputNumber min={1} style={{ width: '100%' }} placeholder="请选择所属学科" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tags" label="知识点标签" tooltip="对应后端 tags，第一个标签用于列表知识点展示">
            <Select mode="tags" allowClear placeholder="输入知识点标签，回车确认" tokenSeparators={[',', '，']} />
          </Form.Item>
          <Form.Item name="content" label="题目内容" rules={[{ required: true, message: '请输入题目内容' }]}>
            <Input.TextArea rows={3} placeholder="请输入题目内容" />
          </Form.Item>

          {qType && ['single', 'multiple'].includes(qType) && (
            <Form.Item label="选项" required>
              <Form.List name="options">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <div key={field.key} style={{ display: 'flex', marginBottom: 8, alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 20, textAlign: 'right' }}>{optionLetters(index)}.</span>
                        <Form.Item
                          {...field}
                          name={field.name}
                          rules={[{ required: true, message: '请输入选项内容' }]}
                          noStyle
                        >
                          <Input placeholder="选项内容" style={{ width: 420 }} />
                        </Form.Item>
                        {fields.length > 2 && (
                          <MinusCircleOutlined onClick={() => remove(field.name)} />
                        )}
                      </div>
                    ))}
                    <Button type="dashed" onClick={() => add('')} block icon={<PlusOutlined />}>
                      添加选项
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          )}

          {qType === 'judge' ? (
            <Form.Item name="answer" label="正确答案" rules={[{ required: true, message: '请选择正确答案' }]}>
              <Select>
                <Select.Option value="true">正确</Select.Option>
                <Select.Option value="false">错误</Select.Option>
              </Select>
            </Form.Item>
          ) : (
            <Form.Item name="answer" label="参考答案" rules={[{ required: true, message: '请输入参考答案' }]}>
              <Input.TextArea rows={2} placeholder="客观题填选项（如 A 或 A,B），主观题填参考答案" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default QuestionBank;
