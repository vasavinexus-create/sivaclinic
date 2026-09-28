"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; pageKey?: string }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[V2 ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <div className="page-head"><div><h1>Something went wrong</h1><p>This page encountered an unexpected error.</p></div></div>
          <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>
            <AlertTriangle size={40} style={{ color: "#e53e3e", marginBottom: 16 }} />
            <h2 style={{ margin: "0 0 8px" }}>Page Error</h2>
            <p style={{ color: "#68736f", marginBottom: 24, maxWidth: 480, margin: "0 auto 24px" }}>
              {this.state.error?.message || "An unexpected error occurred. Please try again."}
            </p>
            <button className="primary" onClick={this.reset}>
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
