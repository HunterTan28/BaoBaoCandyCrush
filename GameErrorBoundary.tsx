import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GameErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GameErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback ?? (
        <div className="w-full min-h-screen bg-pink-100 flex flex-col items-center justify-center p-8">
          <h2 className="text-xl font-bold text-rose-600 mb-4">游戏加载出错</h2>
          <pre className="bg-white/80 p-4 rounded-xl text-sm text-left text-rose-700 overflow-auto max-w-lg">
            {this.state.error.message}
          </pre>
          <p className="mt-4 text-pink-500 text-sm">请刷新页面或联系管理员</p>
        </div>
      );
    }
    return this.props.children;
  }
}
