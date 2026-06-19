import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "auth-signup",
  title: "Signup",
  description:
    "Account-creation form with full name, email, password + confirm, show/hide password, a 4-segment strength meter, terms checkbox, client-side validation, and a dummy async submit handler.",
  category: "Auth",
  Preview,
  react: sources,
};

export default page;
