import { DocPage } from '../../components/system/DocPage';
import { SpringLink } from '../../components/system/SpringButton';

// S05 · 关于我们 /about
export function About() {
  return (
    <div className="mx-auto max-w-3xl">
      <DocPage
        title="关于 InnerQuest"
        subtitle="向内求索，遇见更好的职业自我"
        sections={[
          {
            heading: '我们的使命',
            body: 'InnerQuest 相信每个人都值得一份契合天赋与热情的职业。我们把 MBTI 人格洞察与职业规划结合，帮助你从「认识自己」走向「规划未来」。',
          },
          {
            heading: '我们提供什么',
            body: '科学的人格测评、个性化的报告解读、基于人格的职业匹配，以及一对一的规划辅导，陪你走好每一步。',
          },
          {
            heading: '联系我们',
            body: '如有任何建议或合作意向，欢迎通过 hello@innerquest.app 与我们联系。',
          },
        ]}
      />
      <div className="mt-10 flex justify-center">
        <SpringLink to="/assessment/intro" variant="accent">
          开始我的测评
        </SpringLink>
      </div>
    </div>
  );
}