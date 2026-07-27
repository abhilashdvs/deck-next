"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";

export function EditableText({
  value,
  onCommit,
  placeholder = "",
  displayClassName = "",
  inputClassName = "",
}: {
  value: string | null;
  onCommit: (v: string) => void;
  placeholder?: string;
  displayClassName?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setVal(value ?? ""), [value]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const v = val.trim();
    if (v !== (value ?? "")) onCommit(v);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setVal(value ?? "");
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        placeholder={placeholder}
        className={inputClassName}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className={`text-left ${displayClassName}`}>
      {value || <span className="text-text-faint">{placeholder}</span>}
    </button>
  );
}
