import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Application error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          fontFamily: 'sans-serif',
          color: '#7A7268',
        }}>
          <h2 style={{ marginBottom: '12px' }}>应用出错了</h2>
          <p style={{ marginBottom: '8px', fontSize: '14px' }}>{this.state.error?.message}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '16px',
              padding: '8px 24px',
              background: '#E0294A',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
