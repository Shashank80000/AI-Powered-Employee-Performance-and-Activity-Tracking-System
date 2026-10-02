export default function PageHeading({ eyebrow, title, children, actions }) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="heading-copy">{children}</p>}
      </div>
      {actions}
    </section>
  );
}
