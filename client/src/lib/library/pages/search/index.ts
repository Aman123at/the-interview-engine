import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "search",
  title: "Search",
  description:
    "Full-height page with a pinned search bar and a scrollable result list. Filters an inline dummy array on type and submit.",
  category: "Search",
  Preview,
  react: sources,
};

export default page;
