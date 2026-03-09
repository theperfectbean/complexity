"use client";

import { motion } from "motion/react";
import TextareaAutosize from "react-textarea-autosize";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  layoutId?: string;
  compact?: boolean;
};

export function SearchBar({
  value,
  onChange,
  placeholder,
  submitLabel,
  disabled,
  layoutId = "searchbar",
  compact,
}: SearchBarProps) {
  return (
    <motion.div layoutId={layoutId} layout className="rounded-xl border bg-card p-3">
      <div className={`flex ${compact ? "items-end" : "items-end"} gap-2`}>
        <TextareaAutosize
          minRows={compact ? 1 : 2}
          maxRows={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="max-h-52 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border px-4 py-2 text-sm" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </motion.div>
  );
}
