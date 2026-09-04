import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './Icon';
import type { Tone } from '../lib/format';

/* -------------------------------------------------------------- buttons -- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  loading,
  block,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant === 'default' ? '' : variant,
    size === 'md' ? '' : size,
    block ? 'block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- fields -- */

interface FieldWrapProps {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (id: string) => ReactNode;
}

function FieldWrap({ label, hint, error, className = '', children }: FieldWrapProps) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      {children(id)}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapClassName?: string;
}

export function TextField({ label, hint, error, wrapClassName, ...rest }: TextFieldProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={wrapClassName ?? ''}>
      {(id) => <input id={id} aria-invalid={error ? true : undefined} {...rest} />}
    </FieldWrap>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  wrapClassName?: string;
}

export function SelectField({
  label,
  hint,
  error,
  options,
  wrapClassName,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={wrapClassName ?? ''}>
      {(id) => (
        <select id={id} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldWrap>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapClassName?: string;
}

export function TextArea({ label, hint, error, wrapClassName, ...rest }: TextAreaProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={wrapClassName ?? ''}>
      {(id) => <textarea id={id} {...rest} />}
    </FieldWrap>
  );
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <span className="icon">
        <Icon name="search" size={16} />
      </span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- surface -- */

export function Card({
  title,
  actions,
  children,
  className = '',
  bodyClassName = 'card-body',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions ? <div className="row">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge ${tone === 'neutral' ? '' : tone}`}>
      {dot ? <span className="dot" /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const text = parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
  return <span className={`avatar ${large ? 'lg' : ''}`}>{text}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <div className={`card stat ${tone === 'neutral' ? '' : tone}`}>
      <div className="label">
        {icon ? <Icon name={icon} size={14} /> : null}
        {label}
      </div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'box',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div className="empty-title">{title}</div>
      {description ? <p className="small">{description}</p> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`notice ${tone === 'neutral' ? 'info' : tone}`}>
      <Icon name={tone === 'positive' ? 'check' : 'alert'} size={17} />
      <div>{children}</div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ padding: 18, display: 'grid', gap: 12 }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="row" style={{ gap: 16 }}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div
              key={colIndex}
              className="skeleton"
              style={{ height: 14, flex: colIndex === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- modal -- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Focus moves into the dialog so keyboard and screen-reader users are not
    // left behind on the page underneath.
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="small">{message}</div>
    </Modal>
  );
}
