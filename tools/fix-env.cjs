const fs = require("fs");
const lines = [
  "VITE_SUPABASE_URL=https://ktfxeccahsfsuhwdjjjn.supabase.co",
  "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_g3fgEXSq3PsAXAfGh6zqrA_dXje4zeh",
  "VITE_SUPABASE_SECRET_KEY=sb_secret_T1b1H-zLa2iWSfRPgIQy0A_t95ux5by",
  "",
];
fs.writeFileSync(".env", lines.join("\n"));
console.log("done");
