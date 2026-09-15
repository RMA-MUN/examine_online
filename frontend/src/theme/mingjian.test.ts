import { describe, expect, it } from 'vitest';
import { MINGJIAN_LIGHT, MINGJIAN_DARK, getMingjianAntdTokens } from './mingjian';

describe('mingjian tokens', () => {
  it('亮色主色为参考绿落 hex', () => {
    expect(MINGJIAN_LIGHT.primary).toBe('#2E7D4F');
    expect(MINGJIAN_LIGHT.siderBg).toBe('#FFFFFF');
  });
  it('暗色为深绿衍生', () => {
    expect(MINGJIAN_DARK.primary).toBe('#5FB87E');
  });
  it('产出 Antd tokens', () => {
    const t = getMingjianAntdTokens('light');
    expect(t.token.colorPrimary).toBe('#2E7D4F');
  });
});
