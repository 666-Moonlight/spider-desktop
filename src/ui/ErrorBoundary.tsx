import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught an unhandled error", error, info)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <div className="error-boundary-fallback" role="alert">
        <div className="card error-boundary-card">
          <h2 className="error-boundary-title">页面遇到错误</h2>
          <p className="error-boundary-message">{error.message || "未知运行时错误"}</p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-accent" onClick={this.handleReset}>
              重试
            </button>
            <button type="button" className="btn" onClick={this.handleReload}>
              刷新页面
            </button>
          </div>
        </div>
      </div>
    )
  }
}
