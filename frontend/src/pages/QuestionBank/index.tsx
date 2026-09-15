import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, Modal, Select } from 'antd';
import axios from '../../api/axios';
import { generatePaperFromBasket, getExams, importBankFile } from '../../api/exams';
import type { ApiResponse, Paginated } from '../../types/api';
import {
  BANK_BLUEPRINT,
  LEVEL_ORDER,
  MOCK_BANK_META,
  MOCK_BANK_QUESTIONS,
  autoPickLeastUsed,
  type BankLevel,
  type BankType,
  type MockBankQuestion,
} from '../../mocks/bank';
import './index.css';

type SortKey = 'used' | 'hard' | 'rate';
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

const QuestionBank = () => {
  const { message } = App.useApp();
  // 无后端时读 mocks/bank.ts；后端可用时以接口数据覆盖
  const [remote, setRemote] = useState<MockBankQuestion[]>([]);
  const questions = useMemo(() => (remote.length > 0 ? remote : MOCK_BANK_QUESTIONS), [remote]);
  const [sub, setSub] = useState('all');
  const [type, setType] = useState<SegType>('all');
  const [level, setLevel] = useState('all');
  const [know, setKnow] = useState('all');
  const [reviewedOnly, setReviewedOnly] = useState(true);
  const [kw, setKw] = useState('');
  const [sort, setSort] = useState<SortKey>('used');
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [genOpen, setGenOpen] = useState(false);
  const [paperName, setPaperName] = useState('《数据结构与算法》期中考试（B 卷）');
  const [duration, setDuration] = useState('120');
  const [publishClass, setPublishClass] = useState('计科 2401');
  const [examOptions, setExamOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [targetExamId, setTargetExamId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshBank = async () => {
    try {
      const res = (await axios.get('/api/bank/questions', {
        params: { page: 1, page_size: 100 },
      })) as ApiResponse<Paginated<BankApiItem>>;
      const data = res?.data;
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        setRemote(mapApiToMock(data.items));
      }
    } catch {
      // 后端不可用时静默回退到 mocks 演示数据
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
      message.warning('暂无可选考试（后端不可用），仅演示占位');
      return;
    }
    const numericIds = basketIds
      .map((id) => /^B-(\d+)$/.exec(id)?.[1])
      .filter((v): v is string => v != null)
      .map(Number);
    if (numericIds.length === 0) {
      message.info('当前篮内为演示占位题，无法落盘（请先导入题库）');
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
      if (reviewedOnly && !q.reviewed) return false;
      if (kw && `${q.stem}${q.know}${q.id}`.toLowerCase().indexOf(kw.toLowerCase()) < 0) return false;
      return true;
    });
    if (sort === 'used') out.sort((a, b) => b.used - a.used);
    if (sort === 'hard') out.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || a.p - b.p);
    if (sort === 'rate') out.sort((a, b) => a.p - b.p);
    return out;
  }, [questions, type, sub, level, know, reviewedOnly, kw, sort]);

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
    message.success(`智能抽题完成，共 ${picked.length} 题（least-used）`);
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
        {/* 新建题目表单待对接 POST /api/bank/questions，当前禁用待接入 */}
        <Button type="primary" disabled title="P2 待接入：新建题目表单待对接 POST /api/bank/questions">
          新建题目
        </Button>
      </div>

      <section className="page-head">
        <div>
          <h1 className="title-lg">题库与组卷</h1>
          <p className="page-sub">
            题库共 <span className="num">{MOCK_BANK_META.total}</span> 道题 · 覆盖{' '}
            <span className="num">{MOCK_BANK_META.subjects}</span> 个学科 · 最近更新 {MOCK_BANK_META.updated}
            {remote.length > 0 && <span className="meta">（已连接后端题库：{remote.length} 题）</span>}
          </p>
        </div>
        <div className="toolbar">
          <span className="pill pill-neutral" title="P2 不做：查重服务未接入，仅演示占位">
            <i className="pill-dot" />
            题目查重（演示）
          </span>
          <Select
            aria-label="排序方式"
            value={sort}
            onChange={(v) => setSort(v)}
            style={{ width: 170 }}
            options={[
              { value: 'used', label: '按使用次数' },
              { value: 'hard', label: '按难度（难→易）' },
              { value: 'rate', label: '按正确率（低→高）' },
            ]}
          />
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
          <div className="rail-group">
            <div className="row-wrap">
              <span className="label" style={{ flex: 1 }}>
                仅显示已审核
              </span>
              <button
                type="button"
                className="sw"
                role="switch"
                aria-checked={reviewedOnly}
                aria-label="仅显示已审核"
                onClick={() => setReviewedOnly((v) => !v)}
              />
            </div>
          </div>
        </aside>

        <div className="panel">
          <div className="panel-head">
            <div className="row">
              <span className="title-sm">题目列表</span>
              <span className="meta">{filtered.length} 道题</span>
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
                    {!q.reviewed && <span className="pill pill-warn">待审核</span>}
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
                      正确率 <b>{Math.round(q.p * 100)}%</b>
                    </span>
                    <span>
                      使用 <b>{q.used}</b> 次
                    </span>
                    <span>
                      分值 <b>{q.score}</b> 分
                    </span>
                  </div>
                  <div className="row-wrap">
                    <Button size="small" onClick={() => addToBasket(q.id)}>
                      加入组卷
                    </Button>
                    <Button size="small" type="text" disabled title="P2 待接入：题目编辑表单待对接服务端">
                      编辑
                    </Button>
                    <Button size="small" type="text" disabled title="P3 不做：服务端同类题检索未立项">
                      替换同类题
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
            placeholder={examOptions.length === 0 ? '暂无考试（后端不可用，仅演示占位）' : '选择考试'}
            options={examOptions}
          />
        </div>
        <div className="gen-field">
          <label htmlFor="paper-name">试卷名称</label>
          <Input id="paper-name" value={paperName} onChange={(e) => setPaperName(e.target.value)} disabled title="P2待接入暂不生效" />
        </div>
        <div className="gen-grid">
          <div className="gen-field">
            <label htmlFor="paper-dur">考试时长（分钟）</label>
            <Input id="paper-dur" value={duration} onChange={(e) => setDuration(e.target.value)} disabled title="P2待接入暂不生效" />
          </div>
          <div className="gen-field">
            <label htmlFor="paper-group">发布班级</label>
            <Select
              id="paper-group"
              value={publishClass}
              onChange={(v) => setPublishClass(v)}
              disabled
              title="P2待接入暂不生效"
              style={{ width: '100%' }}
              options={[{ value: '计科 2401' }, { value: '计科 2402' }, { value: '计科 2401、2402' }].map((o) => ({
                value: o.value,
                label: o.value,
              }))}
            />
          </div>
        </div>
        <div className="gen-checks">
          <label className="check">
            <input type="checkbox" defaultChecked /> 题目乱序
          </label>
          <label className="check">
            <input type="checkbox" defaultChecked /> 选项乱序（防作弊）
          </label>
          <label className="check">
            <input type="checkbox" /> 生成后立即发布给学生
          </label>
        </div>
      </Modal>
    </div>
  );
};

export default QuestionBank;
