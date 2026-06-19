import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "hello",
  title: "Hello Page",
  description:
    "Placeholder page that exercises the registry, framework toggle, kit×styling tabs, and the copy flow.",
  category: "Examples",
  Preview,
  react: sources,
};

export default page;
