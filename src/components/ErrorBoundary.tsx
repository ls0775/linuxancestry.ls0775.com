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
        <div className="p-6 max-w-[34rem]">
          <h2 className="label mb-4">Something went wrong</h2>
          <p className="text-muted font-light mb-4">The visualization failed to render. Try resetting the filters or switching views.</p>
          <button onClick={() => this.setState({ hasError: false })} className="textbtn">Try again</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
