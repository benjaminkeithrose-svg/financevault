import { Link } from "react-router-dom";

/** A small "?" link into the matching section of the Help page. */
export function HelpLink({ topic, label = "Help" }: { topic: string; label?: string }) {
  return (
    <Link to={`/help#${topic}`} className="help-link" title={`${label}: how this works`} aria-label={`${label}: how this works`}>
      ?
    </Link>
  );
}
