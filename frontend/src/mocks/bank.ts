/** 题库与组卷演示数据：照抄参考 `frontend_design/question-bank.html` 内联 Q 数组（12 题多维）。 */

export type BankType = '单选' | '多选' | '判断' | '填空' | '简答';
export type BankLevel = '易' | '中' | '难';

export interface MockBankQuestion {
  id: string;
  type: BankType;
  sub: string;
  know: string;
  level: BankLevel;
  /** 正确率（0-1）。 */
  p: number;
  score: number;
  /** 被组卷使用次数（自动组卷 least-used 排序键）。 */
  used: number;
  reviewed: boolean;
  stem: string;
  opts: string[];
  ans: string;
}

export const MOCK_BANK_QUESTIONS: MockBankQuestion[] = [
  { id: 'Q-10241', type: '单选', sub: '数据结构', know: '线性表', level: '易', p: 0.88, score: 5, used: 12, reviewed: true,
    stem: '下列关于线性表的叙述中，正确的是（　）',
    opts: ['顺序存储的线性表插入元素不需要移动其他元素', '链式存储的线性表可以随机访问任意元素', '顺序存储支持随机访问，链式存储插入删除更高效', '两种存储方式的空间开销完全相同'], ans: 'C' },
  { id: 'Q-10287', type: '单选', sub: '数据结构', know: '排序算法', level: '难', p: 0.41, score: 5, used: 8, reviewed: true,
    stem: '对含有 n 个记录的表进行快速排序，最坏情况下的时间复杂度为（　）',
    opts: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'], ans: 'B' },
  { id: 'Q-10312', type: '单选', sub: '计算机网络', know: 'TCP 协议', level: '中', p: 0.64, score: 5, used: 21, reviewed: true,
    stem: 'TCP 建立连接时采用三次握手，其主要目的是（　）',
    opts: ['提高传输速率', '防止已失效的连接请求报文段突然又传到服务端', '实现流量控制', '实现拥塞控制'], ans: 'B' },
  { id: 'Q-10405', type: '多选', sub: '数据结构', know: '树与二叉树', level: '中', p: 0.58, score: 6, used: 6, reviewed: true,
    stem: '关于二叉排序树（BST），下列说法正确的有（　）',
    opts: ['中序遍历可得到有序序列', '查找的平均时间复杂度为 O(log n)', '任意结点的左子树所有关键字小于该结点', '插入操作一定改变树的高度'], ans: 'A、B、C' },
  { id: 'Q-10428', type: '多选', sub: '操作系统', know: '进程管理', level: '中', p: 0.66, score: 6, used: 9, reviewed: true,
    stem: '下列措施中可以避免死锁的有（　）',
    opts: ['资源有序分配法', '银行家算法', '剥夺式调度', '提高进程优先级'], ans: 'A、B' },
  { id: 'Q-10502', type: '判断', sub: '数据结构', know: '栈与队列', level: '易', p: 0.85, score: 4, used: 15, reviewed: true,
    stem: '循环队列可以有效解决顺序队列的假溢出问题。', opts: [], ans: '正确' },
  { id: 'Q-10533', type: '填空', sub: '数据结构', know: '图与遍历', level: '中', p: 0.74, score: 6, used: 11, reviewed: true,
    stem: '对具有 n 个顶点、e 条边的无向图进行深度优先遍历，其时间复杂度（邻接表存储）为 ____，空间复杂度为 ____。',
    opts: [], ans: 'O(n+e) ／ O(n)' },
  { id: 'Q-10577', type: '填空', sub: '数据库原理', know: '索引', level: '中', p: 0.69, score: 6, used: 5, reviewed: true,
    stem: '在 B+ 树索引中，非叶结点仅存储 ____，所有数据记录指针均存放在 ____。',
    opts: [], ans: '索引键值 ／ 叶结点' },
  { id: 'Q-10604', type: '简答', sub: '数据结构', know: '排序算法', level: '难', p: 0.62, score: 10, used: 4, reviewed: true,
    stem: '给定关键字序列（49, 38, 65, 97, 76, 13, 27, 49′），请写出第一趟快速排序的划分过程，并说明其稳定性。',
    opts: [], ans: '划分后序列：（27, 38, 13, 49, 76, 97, 65, 49′）' },
  { id: 'Q-10621', type: '简答', sub: '操作系统', know: '死锁', level: '中', p: 0.71, score: 10, used: 7, reviewed: true,
    stem: '简述死锁产生的四个必要条件，并给出一种破坏“循环等待”条件的方法。',
    opts: [], ans: '互斥、占有并等待、不可剥夺、循环等待' },
  { id: 'Q-10688', type: '单选', sub: '数据库原理', know: '事务', level: '中', p: 0.72, score: 5, used: 18, reviewed: false,
    stem: '事务的隔离性主要通过下列哪种机制保证（　）',
    opts: ['日志', '锁与 MVCC', '索引', '分区'], ans: 'B' },
  { id: 'Q-10715', type: '判断', sub: '计算机网络', know: 'TCP 协议', level: '中', p: 0.77, score: 4, used: 13, reviewed: true,
    stem: 'UDP 协议提供可靠传输，且具有拥塞控制机制。', opts: [], ans: '错误' },
];

export const LEVEL_ORDER: Record<BankLevel, number> = { '易': 0, '中': 1, '难': 2 };

/** 组卷蓝图：单选 10 · 多选 5 · 判断 5 · 填空 4 · 简答 4（照抄参考页说明）。 */
export const BANK_BLUEPRINT: Record<BankType, number> = {
  '单选': 10,
  '多选': 5,
  '判断': 5,
  '填空': 4,
  '简答': 4,
};

export const MOCK_BANK_META = {
  total: 4268,
  subjects: 6,
  updated: '2026-09-14',
};

/**
 * 自动组卷 least-used 规则（照抄参考 JS）：按题型分组后每组按 used 升序取 plan 数量，
 * 池不足时循环复用（pool[i % pool.length]），返回新增的题目 ID 列表。
 */
export function autoPickLeastUsed(
  questions: MockBankQuestion[],
  plan: Record<string, number> = BANK_BLUEPRINT,
): string[] {
  const picked: string[] = [];
  Object.keys(plan).forEach((t) => {
    const pool = questions
      .filter((q) => q.type === t)
      .sort((a, b) => a.used - b.used);
    if (pool.length === 0) return;
    for (let i = 0; i < plan[t]; i += 1) {
      picked.push(pool[i % pool.length].id);
    }
  });
  return picked;
}
