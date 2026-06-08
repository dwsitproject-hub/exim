"use client";

import { useRef, useEffect } from "react";

/** Description field that grows with content (matches PDF review popup readability). */
export function ItemDescriptionInput({
  id,
  value,
  onChange,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    syncHeight();
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      className={className}
      value={value}
      rows={1}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
        syncHeight();
      }}
      aria-label="Item description"
    />
  );
}
