import { DocPage } from '../../components/system/DocPage';

// S03 · 隐私政策 /legal/privacy
export function Privacy() {
  return (
    <DocPage
      title="隐私政策"
      subtitle="我们如何收集、使用与保护你的个人信息"
      updatedAt="2026-07-05"
      sections={[
        {
          heading: '一、信息收集',
          body: '我们仅在提供 MBTI 测评与职业规划服务所必需的范围内收集信息，包括账号信息、测评作答与生成的报告数据。',
        },
        {
          heading: '二、信息使用',
          body: '收集的信息用于生成个性化报告、职业匹配与辅导推荐，不会用于与服务无关的用途。',
        },
        {
          heading: '三、信息保护',
          body: '我们采用加密传输与访问控制等措施保护你的数据安全，未经你的授权不会向第三方披露。',
        },
        {
          heading: '四、你的权利',
          body: '你有权访问、更正或删除个人信息，可通过「关于我们」页面提供的方式与我们联系。',
        },
      ]}
    />
  );
}