export interface VisualDelta {
  target_selector: string;
  changes: {
    geometry?: {
      position?: { from: { x: number; y: number }; to: { x: number; y: number } };
      size?: { from: { w: number; h: number }; to: { w: number; h: number } };
    };
    style?: Record<string, { from: string; to: string }>;
    content?: { from: string; to: string };
  };
}
