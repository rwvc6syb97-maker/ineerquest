import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorPage } from '../../pages/system/ErrorPage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// 全局错误边界：捕获子树渲染期运行时错误，兜底渲染 S02 通用错误页
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 生产环境可上报监控；此处输出到控制台便于开发排查
    console.error('[ErrorBoundary] 捕获渲染错误：', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          onReset={this.handleReset}
          title="页面遇到了意外错误"
          description="我们已记录该问题。你可以尝试重试，或返回首页。"
        />
      );
    }
    return this.props.children;
  }
}