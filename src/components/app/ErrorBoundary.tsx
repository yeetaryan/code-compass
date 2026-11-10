import { Component, type ReactNode } from "react";

type State = { error: Error | null };

/** Last-resort boundary: a broken page shows a recoverable message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ui] unhandled error", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
        <div className="max-w-md">
          <p className="eyebrow">Something broke</p>
          <h1 className="mt-3 text-h2">This page hit an unexpected error.</h1>
          <p className="mt-3 text-ink-3">{this.state.error.message || "Please reload and try again."}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button className="h-10 rounded-full bg-ink px-5 text-[0.9rem] font-medium text-canvas" onClick={() => location.reload()}>Reload</button>
            <a className="inline-flex h-10 items-center rounded-full border border-line-strong px-5 text-[0.9rem] font-medium" href="/">Go home</a>
          </div>
        </div>
      </div>
    );
  }
}
