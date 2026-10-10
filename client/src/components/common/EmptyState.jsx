/** Shown instead of an empty list: says why it's empty and what to do next. */
export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={24} aria-hidden="true" />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
