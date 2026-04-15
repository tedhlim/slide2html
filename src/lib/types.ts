export interface VisualDelta {
  target_selector: string;
  deleted?: boolean;
  changes: {
    geometry?: {
      position?: { dx: number; dy: number };
      size?: { dw: number; dh: number };
    };
    style?: Record<string, { from: string; to: string }>;
    content?: { from: string; to: string };
  };
}

export interface DebugInfo {
  zoom: number;
  zoomSource: string;
  targetCount: number;
  lastSelector: string | null;
  lastDeltaType: string | null;
}
