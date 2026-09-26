import { Link } from "react-router-dom";

/**
 * Shown instead of an endless "Loading…" when a detail page's record can't
 * be fetched — most often because it was deleted or the link is stale.
 */
export function LoadFailed({ message, backTo, backLabel }: { message: string; backTo: string; backLabel: string }) {
  const notFound = /not found|doesn't exist/i.test(message);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{notFound ? "Nothing here" : "Couldn't open this"}</h3>
      <p>{notFound ? "This record doesn't exist — it may have been deleted, or the link is out of date." : message}</p>
      <Link to={backTo}>← {backLabel}</Link>
    </div>
  );
}
