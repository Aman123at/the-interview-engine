import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "chat",
  title: "Chat",
  description:
    "Full-height chat layout — left sidebar with Groups + Direct messages (searchable, unread badges), conversation pane with color-coded bubbles for sender vs me + auto-scroll, composer with attachment + image icons, multi-line textarea (Enter to send, Shift+Enter for newline), and dummy inline state.",
  category: "Messaging",
  Preview,
  react: sources,
};

export default page;
