import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";

type PreviewShortcutsPanelProps = {
  modifierLabel: "⌘" | "Ctrl";
  onClose: () => void;
};

const SHEET_CLOSE_DISTANCE = 80;

function getShortcutGroups(modifierLabel: "⌘" | "Ctrl") {
  const redoKeys = modifierLabel === "⌘" ? ["⌘", "⇧", "Z"] : ["Ctrl", "Shift", "Z"];

  return [
    {
      label: "Editing",
      items: [
        { action: "Undo source edit", keys: [modifierLabel, "Z"] },
        { action: "Redo source edit", keys: redoKeys },
        ...(modifierLabel === "Ctrl" ? [{ action: "Redo source edit", keys: ["Ctrl", "Y"] }] : []),
      ],
    },
    {
      label: "Preview",
      items: [
        { action: "Zoom out", keys: ["−"] },
        { action: "Zoom in", keys: ["+"] },
        { action: "Reset to 100%", keys: ["Shift", "0"] },
        { action: "Fit to viewport", keys: ["Shift", "1"] },
        { action: "Toggle fullscreen", keys: ["Shift", "F"] },
      ],
    },
    {
      label: "Panels",
      items: [
        { action: "Toggle shortcuts", keys: ["?"] },
        { action: "Dismiss current surface", keys: ["Esc"] },
      ],
    },
  ];
}

export default function PreviewShortcutsPanel(props: PreviewShortcutsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const groups = getShortcutGroups(props.modifierLabel);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ??
        [],
    );
    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!window.matchMedia("(max-width: 960px)").matches) {
      return;
    }

    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragStartY.current === null) {
      return;
    }

    const nextOffset = Math.max(0, event.clientY - dragStartY.current);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragStartY.current === null) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStartY.current = null;
    if (dragOffsetRef.current >= SHEET_CLOSE_DISTANCE) {
      props.onClose();
      return;
    }

    dragOffsetRef.current = 0;
    setDragOffset(0);
  }

  return (
    <aside
      ref={panelRef}
      className="preview-shortcuts-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-shortcuts-title"
      style={{ "--sheet-drag-offset": `${dragOffset}px` } as React.CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <div
        className="preview-shortcuts-drag-handle"
        aria-hidden="true"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span />
      </div>
      <header className="preview-shortcuts-header">
        <div>
          <p className="preview-shortcuts-kicker">Reference</p>
          <h3 id="preview-shortcuts-title">Keyboard shortcuts</h3>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="icon-button preview-shortcuts-close"
          aria-label="Close keyboard shortcuts"
          title="Close keyboard shortcuts"
          onClick={props.onClose}
        >
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="preview-shortcuts-content">
        {groups.map((group) => (
          <section key={group.label} className="preview-shortcut-group">
            <h4>{group.label}</h4>
            <dl>
              {group.items.map((item) => (
                <div key={`${group.label}-${item.action}-${item.keys.join("-")}`}>
                  <dt>{item.action}</dt>
                  <dd>
                    {item.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}
