import { SystemPage } from '../../components/system/SystemPage';
import { SpringLink } from '../../components/system/SpringButton';

// S01 · 404 未找到（路由通配兜底）
export function NotFound() {
  return (
    <SystemPage
      code="404"
      title="这条路好像走到了尽头"
      description="你要找的页面不存在，或已被移动。不如回到起点，继续向内求索。"
      actions={
        <>
          <SpringLink to="/" variant="accent">
            返回首页
          </SpringLink>
          <SpringLink to="/personality-types" variant="ghost">
            浏览人格类型
          </SpringLink>
        </>
      }
    />
  );
}