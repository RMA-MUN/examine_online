import type { Answer, AiGrading, GradingQuestion } from '../types/answer';

// 展示 AI 评分依据时所需的收窄类型：ai_grading 与 question 均存在
export type AnswerWithAiGrading = Answer & {
  ai_grading: AiGrading;
  question: GradingQuestion;
};

// 判断是否在阅卷/结果详情中展示 AI 评分依据（类型守卫，可收窄 ai_grading / question）：
// 简答题始终展示（含评分中状态）；填空题仅在判错送 AI 复核或已有 AI 结果时展示；
// 其余客观题（单选/多选/判断）不走 AI 评分，不展示。
export const shouldShowAiGrading = (a: Answer): a is AnswerWithAiGrading => {
  if (!a.ai_grading) return false;
  const type = a.question?.type ?? '';
  if (type === 'essay') return true;
  if (type !== 'blank') return false;
  const ai = a.ai_grading;
  return (
    a.is_correct === false ||
    ai.grading_source === 'ai' ||
    ai.grading_source === 'failed' ||
    ai.grading_status === 'processing' ||
    ai.grading_status === 'failed'
  );
};
