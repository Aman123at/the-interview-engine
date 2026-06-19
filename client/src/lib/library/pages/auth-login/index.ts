import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "auth-login",
  title: "Login",
  description:
    "Email + password sign-in form with show/hide password, remember-me, client-side validation (email regex + min length), a dummy async submit handler, and a link to the signup page.",
  category: "Auth",
  Preview,
  react: sources,
};

export default page;
