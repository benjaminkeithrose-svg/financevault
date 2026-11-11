import { useNavigate } from "react-router-dom";
import { confirmThenDelete } from "../utils.js";
import { HelpLink } from "./HelpLink.js";

/**
 * The delete control at the foot of a detail page. It asks first, and if the
 * app refuses (because other records still depend on this one) shows the
 * reason, which names what to remove or move first.
 */
export function DeleteSection({
  title,
  note,
  question,
  action,
  redirectTo,
  buttonLabel = "Delete",
}: {
  title: string;
  note: string;
  question: string;
  action: () => Promise<unknown>;
  redirectTo: string;
  buttonLabel?: string;
}) {
  const navigate = useNavigate();
  async function run() {
    if (await confirmThenDelete(question, action)) navigate(redirectTo);
  }
  return (
    <div className="card delete-section">
      <h3 style={{ marginTop: 0 }}>{title} <HelpLink topic="deleting" /></h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{note}</p>
      <button className="btn danger secondary" onClick={run}>
        {buttonLabel}
      </button>
    </div>
  );
}
