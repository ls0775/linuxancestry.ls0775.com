import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-10 text-center bg-slate-900 rounded-[3rem] border border-white/5 mx-10">
          <h2 className="text-2xl font-black text-rose-500 mb-4">Something went wrong with this view.</h2>
          <p className="text-slate-400 mb-8 max-w-md">The visualization failed to render. This can happen with complex data cycles or filter conflicts. Try resetting the filters or switching views.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-8 py-3 bg-cyan-500 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-cyan-400 transition-all"
          >
            TRY AGAIN
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
