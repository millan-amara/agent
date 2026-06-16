import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

const control =
  "w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted/70 outline-none transition-colors " +
  "focus:border-primary focus:ring-2 focus:ring-primary/30 " +
  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${control} ${className}`} {...props} />;
  },
);

/** Masked input with a reveal toggle — for passwords, tokens, secret keys. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { wrapperClassName?: string }
>(function PasswordInput({ className = "", wrapperClassName = "", ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={`${control} pr-10 ${className}`}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide" : "Show"}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${control} ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return <select ref={ref} className={`${control} ${className}`} {...props} />;
  },
);

/** Label + optional hint wrapper around a control. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
