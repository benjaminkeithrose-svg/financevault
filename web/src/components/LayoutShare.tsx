import { useState } from "react";
import { api } from "../api/client.js";

/**
 * "Share its layout (no figures)": the document's wording and layout with
 * every digit, name, email and address blanked out, to check and then send
 * so the app learns a new lender's or form's wording. Nothing is sent by the
 * app — you copy it or save it as a file.
 */
export function LayoutShare({ documentId, prompt }: { documentId: string; prompt?: string }) {
  const [layout, setLayout] = useState<{ text: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function open() {
    setError(null);
    try {
      setLayout(await api.documents.layout(documentId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function save() {
    if (!layout) return;
    const url = URL.createObjectURL(new Blob([layout.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = layout.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!layout) return;
    try {
      await navigator.clipboard.writeText(layout.text);
      setCopied(true);
    } catch {
      setError("Couldn't copy it here — use Save as a file instead.");
    }
  }

  if (!layout) {
    return (
      <div style={{ marginTop: 8 }}>
        {prompt && <p className="cap-explain">{prompt}</p>}
        <button className="btn secondary" onClick={open}>
          Share its layout (no figures)
        </button>
        {error && <div className="message-box error">{error}</div>}
      </div>
    );
  }
  return (
    <div className="sub-form" style={{ marginTop: 8 }}>
      <p style={{ marginTop: 0 }}>
        Its wording and layout, with every figure, date, name and address blanked out. <strong>Read it through first</strong> — if
        anything personal is left, don't send it. Then send the file in your chat with Claude, and the next version reads this kind of
        document better.
      </p>
      <textarea readOnly rows={12} value={layout.text} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} aria-label="The layout, figures blanked out" />
      <div className="toolbar" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={save}>
          Save as a file
        </button>
        <button className="btn secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn secondary" onClick={() => setLayout(null)}>
          Close
        </button>
      </div>
      {error && <div className="message-box error">{error}</div>}
    </div>
  );
}
