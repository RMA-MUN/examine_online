import type { QuestionType } from '../types/question';

/**
 * 题型展示元数据。
 *
 * 此前 ExamEdit / ResultDrawer / GradingDrawer 三处各抄了一份，
 * 改一处颜色另外两处就会不一致，统一收敛到这里。
 */
export const QUESTION_TYPE_META: Record<QuestionType, { text: string; color: string }> = {
  single: { text: '单选题', color: 'blue' },
  multiple: { text: '多选题', color: 'geekblue' },
  judge: { text: '判断题', color: 'orange' },
  blank: { text: '填空题', color: 'purple' },
  essay: { text: '简答题', color: 'green' },
};

export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_META) as QuestionType[];

export const getQuestionTypeMeta = (type?: QuestionType | null) =>
  QUESTION_TYPE_META[type ?? 'blank'] ?? QUESTION_TYPE_META.blank;
