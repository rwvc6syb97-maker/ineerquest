import { DocPage } from '../../components/system/DocPage';

// S04 · 用户协议 /legal/terms
export function Terms() {
  return (
    <DocPage
      title="用户协议"
      subtitle="使用 InnerQuest 服务前，请阅读并同意以下条款"
      updatedAt="2026-07-05"
      sections={[
        {
          heading: '一、服务说明',
          body: 'InnerQuest 提供基于 MBTI 的人格测评、职业匹配与规划辅导服务。测评结果仅供自我认知参考，不构成任何决策依据。',
        },
        {
          heading: '二、账号责任',
          body: '你需妥善保管账号与密码，并对账号下的一切行为负责。发现异常请及时联系我们。',
        },
        {
          heading: '三、使用规范',
          body: '你承诺不得利用本服务从事违法违规活动，不得干扰或破坏服务的正常运行。',
        },
        {
          heading: '四、协议变更',
          body: '我们可能不时更新本协议，更新后将在本页面公示。继续使用即视为接受变更。',
        },
      ]}
    />
  );
}