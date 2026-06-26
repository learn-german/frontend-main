import React, { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// React.Component is typed as `any` in this project (no @types/react).
// Explicitly annotate props/state with `!` so TypeScript recognizes the members.
export class ErrorBoundary extends React.Component {
  props!: Props;
  state!: State;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto text-2xl">
              ⚠️
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900">Đã xảy ra lỗi</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Ứng dụng gặp sự cố không mong muốn. Vui lòng tải lại trang để tiếp tục.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-slate-900 text-white text-sm font-display font-bold px-5 py-2.5 rounded-xl hover:bg-slate-700 transition cursor-pointer"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
