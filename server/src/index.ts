import "dotenv/config";
import { app } from "./app.js";
import { runPrivacyCleanup } from "./services/privacyCleanup.js";
import { ensurePersonalEntities } from "./services/personalEntity.js";
import { relinkMovedDocuments } from "./services/paths.js";
import { ensureMonthlySnapshot } from "./services/monthlySnapshot.js";

const PORT = Number(process.env.PORT) || 4000;

runPrivacyCleanup()
  .then((result) => {
    if (result && (result.documents || result.auditEntries)) {
      console.log(
        `Privacy cleanup: masked TFNs in ${result.documents} document(s), scrubbed ${result.auditEntries} audit entr${result.auditEntries === 1 ? "y" : "ies"}.`
      );
    }
  })
  .catch((err) => console.error("Privacy cleanup failed:", err));

// Everyone recorded before people and entities were joined up gets their
// personal entity now. Does nothing once everyone has one.
ensurePersonalEntities()
  .then((created) => {
    if (created) console.log(`Created a personal entity for ${created} existing ${created === 1 ? "person" : "people"}.`);
  })
  .catch((err) => console.error("Setting up personal entities failed:", err));

// Documents copied across from an earlier copy of the program are found
// in their new place.
relinkMovedDocuments()
  .then((n) => {
    if (n) console.log(`Found ${n} document${n === 1 ? "" : "s"} in this copy's storage folder and linked ${n === 1 ? "it" : "them"} up.`);
  })
  .catch((err) => console.error("Checking document locations failed:", err));

// The family's net worth, saved once a month for the history.
const monthly = () => ensureMonthlySnapshot().catch((err) => console.error("Monthly net worth snapshot failed:", err));
void monthly();
setInterval(monthly, 6 * 60 * 60 * 1000).unref();

// Loopback only. Listening on every interface (the old default) made the
// whole database readable by anyone on the same Wi-Fi. Both IPv4 and IPv6
// loopback are bound so "localhost" works whichever one it resolves to;
// the IPv6 one is optional since some machines have it disabled.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Financial Vault running at http://localhost:${PORT} (this computer only)`);
});
app.listen(PORT, "::1").on("error", () => {});
