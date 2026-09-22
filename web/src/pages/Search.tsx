import { useSearchParams } from "react-router-dom";
import { SearchResults } from "../components/SearchResults.js";

export function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Search results for "{q}"</h2>
          <p>Searches document metadata, OCR text, notes and entity records.</p>
        </div>
      </div>

      <SearchResults q={q} />
    </div>
  );
}
