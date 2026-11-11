import { useEffect, useState } from "react";
import { KeyholeMark } from "./KeyholeMark.js";

const today = () => new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** On paper only: the logo, the name, and the day it was printed (read as it prints). */
export function PrintHeader() {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const update = () => setDate(today());
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  return (
    <div className="print-header">
      <KeyholeMark size={32} />
      <strong>Financial Vault</strong>
      <span>Printed {date}</span>
    </div>
  );
}
