import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "todo",
  title: "Todo App",
  description:
    "Add-todo form on button click, todos on bordered 3D cards (hover lift + tilt, GPU-friendly, gated behind prefers-reduced-motion), line-through on complete, per-row delete.",
  category: "Productivity",
  Preview,
  react: sources,
};

export default page;
