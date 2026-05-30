import type { ButtonDescriptor } from "./ui-descriptor.js";

export function ActionButton({ label, action, onAction }: ButtonDescriptor & { onAction: (msg: string) => void }) {
  return (
    <button className="cme-action-btn" onClick={() => onAction(action)}>
      {label}
    </button>
  );
}
