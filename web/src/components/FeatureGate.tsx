import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FEATURES, FeatureId, useFeatures } from "../features.js";

/**
 * A page (or part of one) that belongs to a feature. While the feature is
 * switched off, a full page says so and links to where it's switched back
 * on; a part of a page (`quiet`) just isn't shown. Nothing is deleted.
 */
export function FeatureGate({ feature, quiet = false, children }: { feature: FeatureId; quiet?: boolean; children: ReactNode }) {
  const features = useFeatures();
  // A whole page waits for the setting, so a switched-off one never flashes up.
  if (!quiet && !features.ready) return null;
  if (features.on(feature)) return <>{children}</>;
  if (quiet) return null;
  const name = FEATURES.find((f) => f.id === feature)?.name ?? "This feature";
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{name} is switched off</h3>
      <p>Nothing has been deleted — switch it back on and everything is as it was.</p>
      <Link className="btn" to="/settings#features">
        Go to Features in Settings
      </Link>
    </div>
  );
}
