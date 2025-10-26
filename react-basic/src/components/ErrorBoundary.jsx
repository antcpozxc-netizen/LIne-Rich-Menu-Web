// src/components/ErrorBoundary.jsx
import React from "react";
import { Alert, AlertTitle, Button, Stack } from "@mui/material";

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){
    try { window.__bootlog && window.__bootlog('ErrorBoundary:', error?.stack || String(error), info?.componentStack); } catch {}
    console.error('[ErrorBoundary]', error, info);
  }
  handleReload = () => { location.reload(); };

  render(){
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Stack sx={{ p:2 }}>
        <Alert severity="error">
          <AlertTitle>เกิดข้อผิดพลาดในหน้า</AlertTitle>
          {String(error?.message || error)}
        </Alert>
        <Stack direction="row" spacing={1} sx={{ mt:1 }}>
          <Button variant="contained" onClick={this.handleReload}>Reload</Button>
        </Stack>
      </Stack>
    );
  }
}
