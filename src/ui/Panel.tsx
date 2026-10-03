import type { ReactNode } from "react";

export function Panel(props: { className: string; title?: string; children?: ReactNode }) {
  return (
    <div className={`panel ${props.className}`}>
      <div className="panel-inner">
        {props.title && <div className="panel-title">{props.title}</div>}
        {props.children}
      </div>
    </div>
  );
}
