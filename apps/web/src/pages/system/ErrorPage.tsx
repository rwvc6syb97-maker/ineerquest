import { SystemPage } from '../../components/system/SystemPage';
import { SpringButton, SpringLink } from '../../components/system/SpringButton';

interface ErrorPageProps {
  // 由 ErrorBoundary 传入的重置回调；无则回退为整页刷新
  onReset?: () => void;
  title?: string;
  description?: string;
  code?: string;
}

// S02 · 通用错误页（500 / 网络异常 / 渲染错误兜底）
export function ErrorPage({
  onReset,
  title = '出了点小状况',
  description = '服务暂时无法响应，可能是网络波动或服务器繁忙。请稍后重试。',
  code = '500',
}: ErrorPageProps) {
  const handleRetry = () => {
    if (onReset) onReset();
    else window.location.reload();
  };

  return (
    <SystemPage
      code={code}
      title={title}
      description={description}
      actions={
        <>
          <SpringButton variant="accent" onClick={handleRetry}>
            重试
          </SpringButton>
          <SpringLink to="/" variant="ghost">
            返回首页
          </SpringLink>
        </>
      }
    />
  );
}