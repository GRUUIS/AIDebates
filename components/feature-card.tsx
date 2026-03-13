export function FeatureCard({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
