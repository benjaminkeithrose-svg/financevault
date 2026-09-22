export function Placeholder({ title, stage }: { title: string; stage: string }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="placeholder-page">
        <p>
          <strong>{title}</strong> is planned for {stage} of the build.
        </p>
        <p>The data model already supports it — this screen will light up once that stage ships.</p>
      </div>
    </div>
  );
}
